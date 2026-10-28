import type { DatabaseSync } from 'node:sqlite'
import {
  AdapterAuthError,
  COMMAND,
  parseCommand,
  type AcademicSourceAdapter,
  type AdapterResult,
  type CommandApi,
  type ConnectionSyncBinding,
  type CourseView,
  type CredentialAccess,
  type Clock,
  type IdGenerator,
  type NormalizedAcademicItem,
  type QueryApi,
  type SyncRunStatus,
  type SyncRunSummary,
  type SyncPreview,
  type SyncPreviewItem,
} from '@academic/contracts'

export interface ConnectorDependencies {
  db: DatabaseSync
  commands: CommandApi
  queries: QueryApi
  clock: Clock
  ids: IdGenerator
}

export interface RegisterCourseInput {
  sourceId: string
  externalCourseId: string
  termId: string
  code: string
  title: string
}

export interface SyncOptions {
  /**
   * Archiving missing items is opt-in. The default preserves existing items
   * even for a full snapshot, so an empty response can never silently wipe data.
   */
  archiveMissing?: boolean
  /** When present, the adapter only runs with a source-checked credential lease. */
  connection?: ConnectionSyncBinding
}

type ItemOutcome =
  | { kind: 'created' | 'updated' | 'noop' }
  | { kind: 'failed'; message: string }

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export class ConnectorService {
  readonly #db: DatabaseSync
  readonly #commands: CommandApi
  readonly #queries: QueryApi
  readonly #clock: Clock
  readonly #ids: IdGenerator

  constructor(dependencies: ConnectorDependencies) {
    this.#db = dependencies.db
    this.#commands = dependencies.commands
    this.#queries = dependencies.queries
    this.#clock = dependencies.clock
    this.#ids = dependencies.ids
  }

  async registerCourse(input: RegisterCourseInput): Promise<CourseView> {
    const existing = await this.#queries.getCourseBySource(
      input.sourceId,
      input.externalCourseId,
    )
    if (existing) return existing

    const courseId = this.#ids.next()
    const command = parseCommand({
      commandId: this.#ids.next(),
      type: COMMAND.CourseCreate,
      aggregateId: courseId,
      expectedVersion: 0,
      actor: { kind: 'automation', id: 'academic-connectors' },
      correlationId: `course-registration/${courseId}`,
      payload: {
        termId: input.termId,
        code: input.code,
        title: input.title,
        source: {
          sourceId: input.sourceId,
          externalCourseId: input.externalCourseId,
        },
      },
    })
    const result = await this.#commands.execute(command)
    if (!result.ok && result.code !== 'CONFLICT') {
      throw new Error(`Could not register course: ${result.message}`)
    }

    const course = await this.#queries.getCourseBySource(
      input.sourceId,
      input.externalCourseId,
    )
    if (!course) throw new Error('Course registration did not become visible')
    return course
  }

  async preview(
    adapter: AcademicSourceAdapter,
    options: Pick<SyncOptions, 'connection'> = {},
  ): Promise<SyncPreview> {
    let credentials: CredentialAccess | undefined
    if (options.connection) {
      credentials = await options.connection.credentials.openCredential(
        options.connection.connectionId,
        adapter.sourceId,
      )
    }
    const result = await adapter.fetch(credentials ? { credentials } : undefined)
    const counts = { create: 0, update: 0, unchanged: 0, skip: 0 }
    const items: SyncPreviewItem[] = []
    for (const item of result.items) {
      let action: SyncPreviewItem['action'] = 'create'
      let reason: string | undefined
      if (!item.externalItemId) {
        action = 'skip'
        reason = '缺少稳定外部 ID'
      } else if (!item.courseExternalId) {
        action = 'skip'
        reason = '缺少外部课程 ID'
      } else {
        const existing = await this.#queries.getAcademicItemBySource(
          adapter.sourceId,
          item.externalItemId,
        )
        action = existing
          ? existing.source.contentHash === item.contentHash
            ? 'unchanged'
            : 'update'
          : 'create'
      }
      counts[action] += 1
      items.push({
        ...(item.externalItemId ? { externalItemId: item.externalItemId } : {}),
        title: item.title,
        kind: item.kind,
        ...(item.courseExternalId
          ? { courseExternalId: item.courseExternalId }
          : {}),
        action,
        ...(reason ? { reason } : {}),
      })
    }
    return {
      sourceId: adapter.sourceId,
      fetchedAt: result.fetchedAt,
      completeness: result.completeness,
      warnings: result.warnings,
      counts,
      items,
    }
  }

  async sync(adapter: AcademicSourceAdapter, options: SyncOptions = {}): Promise<SyncRunSummary> {
    const runId = this.#ids.next()
    const startedAt = this.#clock.now()
    this.#insertRunningRun(runId, adapter.sourceId, startedAt)

    let credentials: CredentialAccess | undefined
    if (options.connection) {
      try {
        credentials = await options.connection.credentials.openCredential(
          options.connection.connectionId,
          adapter.sourceId,
        )
      } catch (error) {
        const summary: SyncRunSummary = {
          runId,
          sourceId: adapter.sourceId,
          status: 'failed',
          startedAt,
          finishedAt: this.#clock.now(),
          itemsSeen: 0,
          created: 0,
          updated: 0,
          warnings: [],
          errorCode: 'CONNECTION_UNAVAILABLE',
          errorMessage: errorMessage(error),
        }
        this.#finishRun(summary)
        return summary
      }
    }

    let adapterResult: AdapterResult
    try {
      adapterResult = await adapter.fetch(credentials ? { credentials } : undefined)
    } catch (error) {
      const authFailure = error instanceof AdapterAuthError
      if (authFailure && options.connection) {
        await options.connection.credentials.markAuthRequired(
          options.connection.connectionId,
          errorMessage(error),
        )
      }
      const status: SyncRunStatus = authFailure ? 'auth-required' : 'failed'
      const summary: SyncRunSummary = {
        runId,
        sourceId: adapter.sourceId,
        status,
        startedAt,
        finishedAt: this.#clock.now(),
        itemsSeen: 0,
        created: 0,
        updated: 0,
        warnings: [],
        errorCode: authFailure ? 'AUTH_REQUIRED' : 'TRANSIENT',
        errorMessage: errorMessage(error),
      }
      this.#finishRun(summary)
      return summary
    }

    const warnings = [...adapterResult.warnings]
    const seenExternalIds = new Set<string>()
    const courseCache = new Map<string, CourseView | undefined>()
    let created = 0
    let updated = 0

    try {
      for (const item of adapterResult.items) {
        if (!item.externalItemId) {
          warnings.push(`Skipped "${item.title}": no stable external item id`)
          continue
        }
        seenExternalIds.add(item.externalItemId)
        if (!item.courseExternalId) {
          warnings.push(`Skipped "${item.title}": no external course id`)
          continue
        }

        let course = courseCache.get(item.courseExternalId)
        if (course === undefined && !courseCache.has(item.courseExternalId)) {
          course = await this.#queries.getCourseBySource(
            adapter.sourceId,
            item.courseExternalId,
          )
          courseCache.set(item.courseExternalId, course)
        }
        if (!course) {
          warnings.push(
            `Skipped "${item.title}": course ${item.courseExternalId} is not registered`,
          )
          continue
        }

        const snapshot = this.#snapshotFor(item, course.courseId, adapterResult.fetchedAt)
        const existing = await this.#queries.getAcademicItemBySource(
          adapter.sourceId,
          item.externalItemId,
        )
        if (existing?.archived) {
          warnings.push(`Skipped "${item.title}": item is archived`)
          continue
        }

        const outcome = await this.#upsertItem(
          item,
          snapshot,
          runId,
          adapter.sourceId,
        )
        if (outcome.kind === 'created') created += 1
        else if (outcome.kind === 'updated') updated += 1
        else if (outcome.kind === 'failed') warnings.push(outcome.message)
      }

      if (options.archiveMissing && adapterResult.completeness === 'full') {
        updated += await this.#archiveMissing(
          adapter.sourceId,
          seenExternalIds,
          runId,
          warnings,
        )
      }

      const summary: SyncRunSummary = {
        runId,
        sourceId: adapter.sourceId,
        status:
          adapterResult.completeness === 'full' && warnings.length === 0
            ? 'success'
            : 'partial',
        startedAt,
        finishedAt: this.#clock.now(),
        itemsSeen: adapterResult.items.length,
        created,
        updated,
        warnings,
      }
      if (options.connection) {
        await options.connection.credentials.markSynced(
          options.connection.connectionId,
          this.#clock.now(),
        )
      }
      this.#finishRun(summary)
      return summary
    } catch (error) {
      const summary: SyncRunSummary = {
        runId,
        sourceId: adapter.sourceId,
        status: 'failed',
        startedAt,
        finishedAt: this.#clock.now(),
        itemsSeen: adapterResult.items.length,
        created,
        updated,
        warnings,
        errorCode: 'SYNC_FAILED',
        errorMessage: errorMessage(error),
      }
      this.#finishRun(summary)
      return summary
    }
  }

  async #upsertItem(
    item: NormalizedAcademicItem,
    snapshot: unknown,
    runId: string,
    sourceId: string,
  ): Promise<ItemOutcome> {
    const existing = await this.#queries.getAcademicItemBySource(
      sourceId,
      item.externalItemId!,
    )
    if (existing) return this.#syncExisting(existing.itemId, snapshot, runId)

    const itemId = this.#ids.next()
    let result = await this.#commands.execute(
      this.#buildCommand(COMMAND.AcademicItemDiscover, itemId, snapshot, runId, 0),
    )
    if (!result.ok && result.code === 'CONFLICT') {
      const raced = await this.#queries.getAcademicItemBySource(
        sourceId,
        item.externalItemId!,
      )
      if (raced) return this.#syncExisting(raced.itemId, snapshot, runId)
    }
    if (!result.ok) return { kind: 'failed', message: `${item.title}: ${result.message}` }
    return { kind: result.eventIds.length > 0 ? 'created' : 'noop' }
  }

  async #syncExisting(
    itemId: string,
    snapshot: unknown,
    runId: string,
  ): Promise<ItemOutcome> {
    let existing = await this.#queries.getAcademicItem(itemId)
    if (!existing) return { kind: 'failed', message: `Item ${itemId} disappeared during sync` }

    let result = await this.#commands.execute(
      this.#buildCommand(
        COMMAND.AcademicItemSync,
        itemId,
        snapshot,
        runId,
        existing.version,
      ),
    )
    if (!result.ok && result.code === 'CONFLICT') {
      existing = await this.#queries.getAcademicItem(itemId)
      if (existing) {
        result = await this.#commands.execute(
          this.#buildCommand(
            COMMAND.AcademicItemSync,
            itemId,
            snapshot,
            runId,
            existing.version,
          ),
        )
      }
    }
    if (!result.ok) return { kind: 'failed', message: `Item ${itemId}: ${result.message}` }
    return { kind: result.eventIds.length > 0 ? 'updated' : 'noop' }
  }

  async #archiveMissing(
    sourceId: string,
    seenExternalIds: Set<string>,
    runId: string,
    warnings: string[],
  ): Promise<number> {
    let archived = 0
    let cursor: string | undefined
    do {
      const page = await this.#queries.listAcademicItems({
        sourceId,
        status: 'active',
        limit: 200,
        ...(cursor ? { cursor } : {}),
      })
      for (const item of page.items) {
        if (item.source.externalItemId && seenExternalIds.has(item.source.externalItemId)) {
          continue
        }
        let result = await this.#commands.execute(
          this.#buildCommand(
            COMMAND.AcademicItemArchive,
            item.itemId,
            { reason: 'Missing from a complete source snapshot' },
            runId,
            item.version,
          ),
        )
        if (!result.ok && result.code === 'CONFLICT') {
          const fresh = await this.#queries.getAcademicItem(item.itemId)
          if (fresh && !fresh.archived) {
            result = await this.#commands.execute(
              this.#buildCommand(
                COMMAND.AcademicItemArchive,
                item.itemId,
                { reason: 'Missing from a complete source snapshot' },
                runId,
                fresh.version,
              ),
            )
          }
        }
        if (result.ok && result.eventIds.length > 0) archived += 1
        else if (!result.ok) warnings.push(`Archive ${item.itemId}: ${result.message}`)
      }
      cursor = page.nextCursor
    } while (cursor)
    return archived
  }

  #snapshotFor(
    item: NormalizedAcademicItem,
    courseId: string,
    sourceObservedAt: string,
  ): Record<string, unknown> {
    return {
      courseId,
      kind: item.kind,
      title: item.title,
      ...(item.description ? { description: item.description } : {}),
      due: item.due,
      ...(item.sourceUrl ? { sourceUrl: item.sourceUrl } : {}),
      source: {
        sourceId: item.sourceId,
        externalItemId: item.externalItemId,
        ...(item.sourceUpdatedAt ? { sourceUpdatedAt: item.sourceUpdatedAt } : {}),
        sourceObservedAt,
        contentHash: item.contentHash,
      },
    }
  }

  #buildCommand(
    type: string,
    aggregateId: string,
    payload: unknown,
    correlationId: string,
    expectedVersion?: number,
  ) {
    return parseCommand({
      commandId: this.#ids.next(),
      type,
      aggregateId,
      ...(expectedVersion !== undefined ? { expectedVersion } : {}),
      actor: { kind: 'automation', id: 'academic-connectors' },
      correlationId,
      payload,
    })
  }

  #insertRunningRun(runId: string, sourceId: string, startedAt: string): void {
    this.#db
      .prepare(
        `INSERT INTO sync_runs (
           run_id, source_id, status, started_at, items_seen, created,
           updated, warnings_json, correlation_id
         ) VALUES (?, ?, 'running', ?, 0, 0, 0, '[]', ?)`,
      )
      .run(runId, sourceId, startedAt, runId)
  }

  #finishRun(summary: SyncRunSummary): void {
    this.#db
      .prepare(
        `UPDATE sync_runs SET
           status = ?, finished_at = ?, items_seen = ?, created = ?, updated = ?,
           warnings_json = ?, error_code = ?, error_message = ?
         WHERE run_id = ?`,
      )
      .run(
        summary.status,
        summary.finishedAt ?? this.#clock.now(),
        summary.itemsSeen,
        summary.created,
        summary.updated,
        JSON.stringify(summary.warnings),
        summary.errorCode ?? null,
        summary.errorMessage ?? null,
        summary.runId,
      )
  }
}
