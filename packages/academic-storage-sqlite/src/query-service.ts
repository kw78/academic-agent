import type { DatabaseSync } from 'node:sqlite'
import type {
  AcademicItemSource,
  AcademicItemView,
  Clock,
  CourseSource,
  CourseView,
  DashboardSummary,
  Due,
  ItemProgress,
  ListAcademicItemsParams,
  ListStudyTasksParams,
  LockedBlock,
  Page,
  PlanBlock,
  PlannerIdentity,
  QueryApi,
  QueryMeta,
  Range,
  StudyPlanView,
  StudyTaskView,
  SyncRunStatus,
  SyncRunSummary,
} from '@academic/contracts'
import type { CoreProjection } from './core-projection.js'
import type { SqlRow } from './database.js'

type SqlParam = string | number | null

const DEFAULT_ITEM_LIMIT = 50
const MAX_ITEM_LIMIT = 200

interface ItemCursor {
  dueSort: string
  itemId: string
}

function encodeCursor(cursor: ItemCursor): string {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url')
}

function decodeCursor(cursor: string): ItemCursor {
  try {
    const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as unknown
    if (
      parsed &&
      typeof parsed === 'object' &&
      typeof (parsed as ItemCursor).dueSort === 'string' &&
      typeof (parsed as ItemCursor).itemId === 'string'
    ) {
      return parsed as ItemCursor
    }
  } catch {
    // Fall through to the explicit error below.
  }
  throw new Error('Invalid pagination cursor')
}

function parseJson<T>(value: unknown): T {
  return JSON.parse(String(value)) as T
}

export class SqliteQueryService implements QueryApi {
  readonly #db: DatabaseSync
  readonly #clock: Clock
  readonly #projection: CoreProjection

  constructor(db: DatabaseSync, clock: Clock, projection: CoreProjection) {
    this.#db = db
    this.#clock = clock
    this.#projection = projection
  }

  async listCourses(termId?: string): Promise<Page<CourseView>> {
    const rows = (
      termId
        ? this.#db
            .prepare(
              `SELECT * FROM courses_current WHERE term_id = ?
               ORDER BY term_id ASC, code ASC, course_id ASC`,
            )
            .all(termId)
        : this.#db
            .prepare(
              `SELECT * FROM courses_current
               ORDER BY term_id ASC, code ASC, course_id ASC`,
            )
            .all()
    ) as SqlRow[]
    return { items: rows.map((row) => this.#toCourse(row)), meta: this.#meta() }
  }

  async getCourse(
    courseId: string,
  ): Promise<(CourseView & { meta: QueryMeta }) | undefined> {
    const row = this.#db
      .prepare('SELECT * FROM courses_current WHERE course_id = ?')
      .get(courseId) as SqlRow | undefined
    return row ? { ...this.#toCourse(row), meta: this.#meta() } : undefined
  }

  async getCourseBySource(
    sourceId: string,
    externalCourseId: string,
  ): Promise<(CourseView & { meta: QueryMeta }) | undefined> {
    const row = this.#db
      .prepare(
        'SELECT * FROM courses_current WHERE source_id = ? AND external_course_id = ?',
      )
      .get(sourceId, externalCourseId) as SqlRow | undefined
    return row ? { ...this.#toCourse(row), meta: this.#meta() } : undefined
  }

  async listAcademicItems(
    params: ListAcademicItemsParams = {},
  ): Promise<Page<AcademicItemView>> {
    const limit = Math.min(
      MAX_ITEM_LIMIT,
      Math.max(1, Math.trunc(params.limit ?? DEFAULT_ITEM_LIMIT)),
    )
    const clauses: string[] = []
    const values: SqlParam[] = []

    const status = params.status ?? 'active'
    if (status === 'active') clauses.push('archived = 0')
    if (status === 'archived') clauses.push('archived = 1')
    if (params.courseId) {
      clauses.push('course_id = ?')
      values.push(params.courseId)
    }
    if (params.sourceId) {
      clauses.push('source_id = ?')
      values.push(params.sourceId)
    }
    if (params.dueBefore) {
      clauses.push('due_sort <= ?')
      values.push(params.dueBefore)
    }
    if (params.cursor) {
      const cursor = decodeCursor(params.cursor)
      clauses.push('(due_sort > ? OR (due_sort = ? AND item_id > ?))')
      values.push(cursor.dueSort, cursor.dueSort, cursor.itemId)
    }

    const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : ''
    const rows = this.#db
      .prepare(
        `SELECT * FROM academic_items_current
         ${where}
         ORDER BY due_sort ASC, item_id ASC
         LIMIT ?`,
      )
      .all(...values, limit + 1) as SqlRow[]

    const hasMore = rows.length > limit
    const pageRows = hasMore ? rows.slice(0, limit) : rows
    const last = pageRows[pageRows.length - 1]
    return {
      items: pageRows.map((row) => this.#toItem(row)),
      ...(hasMore && last
        ? {
            nextCursor: encodeCursor({
              dueSort: String(last.due_sort),
              itemId: String(last.item_id),
            }),
          }
        : {}),
      meta: this.#meta(),
    }
  }

  async getAcademicItem(
    itemId: string,
  ): Promise<(AcademicItemView & { meta: QueryMeta }) | undefined> {
    const row = this.#db
      .prepare('SELECT * FROM academic_items_current WHERE item_id = ?')
      .get(itemId) as SqlRow | undefined
    return row ? { ...this.#toItem(row), meta: this.#meta() } : undefined
  }

  async getAcademicItemBySource(
    sourceId: string,
    externalItemId: string,
  ): Promise<(AcademicItemView & { meta: QueryMeta }) | undefined> {
    const row = this.#db
      .prepare(
        'SELECT * FROM academic_items_current WHERE source_id = ? AND external_item_id = ?',
      )
      .get(sourceId, externalItemId) as SqlRow | undefined
    return row ? { ...this.#toItem(row), meta: this.#meta() } : undefined
  }

  async listStudyTasks(params: ListStudyTasksParams = {}): Promise<Page<StudyTaskView>> {
    const clauses: string[] = []
    const values: SqlParam[] = []
    if (!params.includeArchived) {
      clauses.push('archived = 0')
    }
    if (params.status && params.status !== 'all') {
      clauses.push('status = ?')
      values.push(params.status)
    }
    if (params.from) {
      clauses.push('due_at IS NOT NULL AND due_at >= ?')
      values.push(params.from)
    }
    if (params.to) {
      clauses.push('due_at IS NOT NULL AND due_at <= ?')
      values.push(params.to)
    }
    const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : ''
    const rows = this.#db
      .prepare(
        `SELECT * FROM study_tasks_current
         ${where}
         ORDER BY COALESCE(due_at, '9999-12-31T23:59:59.999Z') ASC,
                  priority DESC,
                  task_id ASC`,
      )
      .all(...values) as SqlRow[]
    return { items: rows.map((row) => this.#toTask(row)), meta: this.#meta() }
  }

  async getStudyTask(
    taskId: string,
  ): Promise<(StudyTaskView & { meta: QueryMeta }) | undefined> {
    const row = this.#db
      .prepare('SELECT * FROM study_tasks_current WHERE task_id = ?')
      .get(taskId) as SqlRow | undefined
    return row ? { ...this.#toTask(row), meta: this.#meta() } : undefined
  }

  async getLatestStudyPlan(): Promise<(StudyPlanView & { meta: QueryMeta }) | undefined> {
    const row = this.#db
      .prepare(
        `SELECT * FROM study_plans_current
         WHERE status = 'active'
         ORDER BY accepted_at DESC, rowid DESC LIMIT 1`,
      )
      .get() as SqlRow | undefined
    return row ? { ...this.#toPlan(row), meta: this.#meta() } : undefined
  }

  async getActiveStudyPlan(
    range: Range,
  ): Promise<(StudyPlanView & { meta: QueryMeta }) | undefined> {
    const rows = this.#db
      .prepare(
        `SELECT * FROM study_plans_current
         WHERE status = 'active'
         ORDER BY accepted_at DESC, plan_id DESC`,
      )
      .all() as SqlRow[]
    const rangeStart = Date.parse(range.start)
    const rangeEnd = Date.parse(range.end)
    for (const row of rows) {
      const plan = this.#toPlan(row)
      if (
        Date.parse(plan.range.start) < rangeEnd &&
        rangeStart < Date.parse(plan.range.end)
      ) {
        return { ...plan, meta: this.#meta() }
      }
    }
    return undefined
  }

  async getDashboardSummary(range: Range): Promise<DashboardSummary> {
    const meta = this.#meta()
    const now = this.#clock.now()
    const itemsDue = this.#count(
      'SELECT COUNT(*) AS count FROM academic_items_current WHERE archived = 0 AND due_sort <= ?',
      range.end,
    )
    const itemsOverdue = this.#count(
      'SELECT COUNT(*) AS count FROM academic_items_current WHERE archived = 0 AND due_sort < ?',
      now,
    )
    const activeTasks = this.#count(
      "SELECT COUNT(*) AS count FROM study_tasks_current WHERE status = 'active'",
    )
    const completedTasks = this.#count(
      "SELECT COUNT(*) AS count FROM study_tasks_current WHERE status = 'completed'",
    )
    const plan = await this.getActiveStudyPlan(range)
    let plannedMinutes = 0
    if (plan) {
      const rangeStart = Date.parse(range.start)
      const rangeEnd = Date.parse(range.end)
      for (const block of plan.blocks) {
        const start = Math.max(rangeStart, Date.parse(block.start))
        const end = Math.min(rangeEnd, Date.parse(block.end))
        if (end > start) plannedMinutes += (end - start) / 60_000
      }
    }
    return {
      range,
      itemsDue,
      itemsOverdue,
      activeTasks,
      completedTasks,
      plannedMinutes: Math.round(plannedMinutes),
      ...(plan ? { planId: plan.planId } : {}),
      meta,
    }
  }

  async listSyncRuns(sourceId?: string, limit = 20): Promise<Page<SyncRunSummary>> {
    const bounded = Math.min(100, Math.max(1, Math.trunc(limit)))
    const rows = (
      sourceId
        ? this.#db
            .prepare(
              `SELECT * FROM sync_runs WHERE source_id = ?
               ORDER BY started_at DESC, rowid DESC LIMIT ?`,
            )
            .all(sourceId, bounded)
        : this.#db
            .prepare(
              `SELECT * FROM sync_runs
               ORDER BY started_at DESC, rowid DESC LIMIT ?`,
            )
            .all(bounded)
    ) as SqlRow[]
    return { items: rows.map((row) => this.#toSyncRun(row)), meta: this.#meta() }
  }

  #count(sql: string, ...params: SqlParam[]): number {
    const row = this.#db.prepare(sql).get(...params) as SqlRow
    return Number(row.count)
  }

  #meta(): QueryMeta {
    return {
      projectionPosition: this.#projection.getPosition(),
      generatedAt: this.#clock.now(),
    }
  }

  #toCourse(row: SqlRow): CourseView {
    return {
      courseId: String(row.course_id),
      termId: String(row.term_id),
      code: String(row.code),
      title: String(row.title),
      archived: Boolean(row.archived),
      deleted: Boolean(row.deleted),
      source: row.source_json ? parseJson<CourseSource>(row.source_json) : undefined,
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
      version: Number(row.version),
    }
  }

  #toItem(row: SqlRow): AcademicItemView {
    const source: AcademicItemSource = {
      sourceId: String(row.source_id),
      sourceObservedAt: String(row.source_observed_at),
      contentHash: String(row.content_hash),
    }
    if (row.external_item_id != null) source.externalItemId = String(row.external_item_id)
    if (row.source_updated_at != null) source.sourceUpdatedAt = String(row.source_updated_at)

    return {
      itemId: String(row.item_id),
      courseId: String(row.course_id),
      kind: String(row.kind) as AcademicItemView['kind'],
      title: String(row.title),
      description: row.description == null ? undefined : String(row.description),
      due: parseJson<Due>(row.due_json),
      sourceUrl: row.source_url == null ? undefined : String(row.source_url),
      source,
      progress: parseJson<ItemProgress>(row.progress_json),
      archived: Boolean(row.archived),
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
      version: Number(row.version),
    }
  }

  #toTask(row: SqlRow): StudyTaskView {
    return {
      taskId: String(row.task_id),
      title: String(row.title),
      itemId: row.item_id == null ? undefined : String(row.item_id),
      estimateMinutes: Number(row.estimate_minutes),
      dueAt: row.due_at == null ? undefined : String(row.due_at),
      priority: Number(row.priority),
      status: String(row.status) as StudyTaskView['status'],
      archived: Boolean(row.archived),
      completedAt: row.completed_at == null ? undefined : String(row.completed_at),
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
      version: Number(row.version),
    }
  }

  #toPlan(row: SqlRow): StudyPlanView {
    return {
      planId: String(row.plan_id),
      status: String(row.status) as StudyPlanView['status'],
      range: parseJson<Range>(row.range_json),
      blocks: parseJson<PlanBlock[]>(row.blocks_json),
      lockedBlocks: parseJson<LockedBlock[]>(row.locked_blocks_json),
      planner: parseJson<PlannerIdentity>(row.planner_json),
      replanRequestId:
        row.replan_request_id == null ? undefined : String(row.replan_request_id),
      acceptedAt: String(row.accepted_at),
      updatedAt: String(row.updated_at),
      version: Number(row.version),
    }
  }

  #toSyncRun(row: SqlRow): SyncRunSummary {
    return {
      runId: String(row.run_id),
      sourceId: String(row.source_id),
      status: String(row.status) as SyncRunStatus,
      startedAt: String(row.started_at),
      finishedAt: row.finished_at == null ? undefined : String(row.finished_at),
      itemsSeen: Number(row.items_seen),
      created: Number(row.created),
      updated: Number(row.updated),
      warnings: parseJson<string[]>(row.warnings_json),
      errorCode: row.error_code == null ? undefined : String(row.error_code),
      errorMessage: row.error_message == null ? undefined : String(row.error_message),
      adapterId: row.adapter_id == null ? undefined : String(row.adapter_id),
      adapterVersion:
        row.adapter_version == null ? undefined : String(row.adapter_version),
    }
  }
}
