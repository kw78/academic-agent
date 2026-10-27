import type { DatabaseSync } from 'node:sqlite'
import {
  aggregateKindForEvent,
  dueSortKey,
  type Clock,
  type DomainEvent,
} from '@academic/contracts'
import { handlerForKind, type AnyAggregateState } from '@academic/kernel'
import { inTransaction, type SqlRow } from './database.js'

const PROJECTION_ID = 'core'
const PROJECTION_VERSION = 1

export class CoreProjection {
  readonly #db: DatabaseSync
  readonly #clock: Clock

  constructor(db: DatabaseSync, clock: Clock) {
    this.#db = db
    this.#clock = clock
  }

  getPosition(): number {
    const row = this.#db
      .prepare('SELECT last_position FROM projection_state WHERE projection_id = ?')
      .get(PROJECTION_ID) as SqlRow
    return Number(row.last_position)
  }

  setPosition(position: number): void {
    this.#db
      .prepare(
        `UPDATE projection_state
         SET last_position = ?, projection_version = ?, updated_at = ?
         WHERE projection_id = ?`,
      )
      .run(position, PROJECTION_VERSION, this.#clock.now(), PROJECTION_ID)
  }

  upsert(state: AnyAggregateState): void {
    if ('courseId' in state && 'termId' in state) {
      this.#upsertCourse(state)
      return
    }
    if ('itemId' in state && 'progress' in state) {
      this.#upsertItem(state)
      return
    }
    if ('taskId' in state) {
      this.#upsertTask(state)
      return
    }
    this.#upsertPlan(state)
  }

  project(state: AnyAggregateState, position: number): void {
    this.upsert(state)
    if (position > 0) this.setPosition(position)
  }

  rebuild(events: readonly DomainEvent[]): void {
    inTransaction(this.#db, () => {
      this.#resetTables()
      const states = new Map<string, AnyAggregateState>()
      for (const event of events) {
        const kind = aggregateKindForEvent(event.type)
        const handler = handlerForKind(kind)
        let state = states.get(event.streamId)
        if (!state) {
          const aggregateId = event.streamId.slice(event.streamId.indexOf('/') + 1)
          state = handler.empty(aggregateId)
        }
        if (event.streamVersion !== state.version + 1) {
          throw new Error(
            `Cannot rebuild projection from a non-contiguous stream ${event.streamId}`,
          )
        }
        states.set(event.streamId, handler.apply(state, event))
      }
      for (const state of states.values()) this.upsert(state)
      const lastPosition = events.length > 0 ? events[events.length - 1]!.globalPosition : 0
      this.setPosition(lastPosition)
    })
  }

  #resetTables(): void {
    this.#db.exec(`
      DELETE FROM courses_current;
      DELETE FROM academic_items_current;
      DELETE FROM study_tasks_current;
      DELETE FROM study_plans_current;
    `)
  }

  #upsertCourse(state: Extract<AnyAggregateState, { termId: string }>): void {
    const source = state.source
    this.#db
      .prepare(
        `INSERT INTO courses_current (
           course_id, term_id, code, title, archived, source_id,
           external_course_id, source_json, created_at, updated_at, version
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(course_id) DO UPDATE SET
           term_id = excluded.term_id,
           code = excluded.code,
           title = excluded.title,
           archived = excluded.archived,
           source_id = excluded.source_id,
           external_course_id = excluded.external_course_id,
           source_json = excluded.source_json,
           updated_at = excluded.updated_at,
           version = excluded.version`,
      )
      .run(
        state.courseId,
        state.termId,
        state.code,
        state.title,
        Number(state.archived),
        source?.sourceId ?? null,
        source?.externalCourseId ?? null,
        source ? JSON.stringify(source) : null,
        state.createdAt,
        state.updatedAt,
        state.version,
      )
  }

  #upsertItem(state: Extract<AnyAggregateState, { progress: unknown }>): void {
    this.#db
      .prepare(
        `INSERT INTO academic_items_current (
           item_id, course_id, kind, title, description, due_kind, due_json,
           due_sort, source_url, source_id, external_item_id, source_updated_at,
           source_observed_at, content_hash, progress_json, archived,
           created_at, updated_at, version
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(item_id) DO UPDATE SET
           course_id = excluded.course_id,
           kind = excluded.kind,
           title = excluded.title,
           description = excluded.description,
           due_kind = excluded.due_kind,
           due_json = excluded.due_json,
           due_sort = excluded.due_sort,
           source_url = excluded.source_url,
           source_id = excluded.source_id,
           external_item_id = excluded.external_item_id,
           source_updated_at = excluded.source_updated_at,
           source_observed_at = excluded.source_observed_at,
           content_hash = excluded.content_hash,
           progress_json = excluded.progress_json,
           archived = excluded.archived,
           updated_at = excluded.updated_at,
           version = excluded.version`,
      )
      .run(
        state.itemId,
        state.courseId,
        state.kind,
        state.title,
        state.description ?? null,
        state.due.kind,
        JSON.stringify(state.due),
        dueSortKey(state.due),
        state.sourceUrl ?? null,
        state.source.sourceId,
        state.source.externalItemId ?? null,
        state.source.sourceUpdatedAt ?? null,
        state.source.sourceObservedAt,
        state.source.contentHash,
        JSON.stringify(state.progress),
        Number(state.archived),
        state.createdAt,
        state.updatedAt,
        state.version,
      )
  }

  #upsertTask(state: Extract<AnyAggregateState, { taskId: string }>): void {
    this.#db
      .prepare(
        `INSERT INTO study_tasks_current (
           task_id, title, item_id, estimate_minutes, due_at, priority,
           status, completed_at, created_at, updated_at, version
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(task_id) DO UPDATE SET
           title = excluded.title,
           item_id = excluded.item_id,
           estimate_minutes = excluded.estimate_minutes,
           due_at = excluded.due_at,
           priority = excluded.priority,
           status = excluded.status,
           completed_at = excluded.completed_at,
           updated_at = excluded.updated_at,
           version = excluded.version`,
      )
      .run(
        state.taskId,
        state.title,
        state.itemId ?? null,
        state.estimateMinutes,
        state.dueAt ?? null,
        state.priority,
        state.status,
        state.completedAt ?? null,
        state.createdAt,
        state.updatedAt,
        state.version,
      )
  }

  #upsertPlan(state: Extract<AnyAggregateState, { planId: string }>): void {
    this.#db
      .prepare(
        `INSERT INTO study_plans_current (
           plan_id, status, range_json, blocks_json, locked_blocks_json,
           planner_json, replan_request_id, accepted_at, updated_at, version
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(plan_id) DO UPDATE SET
           status = excluded.status,
           range_json = excluded.range_json,
           blocks_json = excluded.blocks_json,
           locked_blocks_json = excluded.locked_blocks_json,
           planner_json = excluded.planner_json,
           replan_request_id = excluded.replan_request_id,
           updated_at = excluded.updated_at,
           version = excluded.version`,
      )
      .run(
        state.planId,
        state.status,
        JSON.stringify(state.range),
        JSON.stringify(state.blocks),
        JSON.stringify(state.lockedBlocks),
        JSON.stringify(state.planner),
        state.replanRequestId ?? null,
        state.acceptedAt,
        state.updatedAt,
        state.version,
      )
  }
}
