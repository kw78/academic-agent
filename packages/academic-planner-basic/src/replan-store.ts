import { createHash, randomUUID } from 'node:crypto'
import type { DatabaseSync } from 'node:sqlite'
import type { Clock, Range } from '@academic/contracts'
import { inTransaction, type SqlRow } from './database.js'
import type { PlanSuggestion } from './planner.js'

export type ReplanReason = 'items-changed' | 'tasks-changed' | 'availability-changed' | 'manual'

export type ReplanRequestStatus = 'pending' | 'suggested' | 'accepted' | 'failed'

export interface ReplanRequest {
  replanRequestId: string
  reason: ReplanReason
  range: Range
  status: ReplanRequestStatus
  sourceKey?: string
  createdAt: string
  processedAt?: string
  planId?: string
  suggestion?: PlanSuggestion
  errorMessage?: string
}

export interface EnqueueReplanInput {
  replanRequestId?: string
  reason: ReplanReason
  range: Range
  sourceKey?: string
}

function parseJson<T>(value: unknown): T {
  return JSON.parse(String(value)) as T
}

function rangesOverlap(left: Range, right: Range): boolean {
  return (
    Date.parse(left.start) < Date.parse(right.end) &&
    Date.parse(right.start) < Date.parse(left.end)
  )
}

export class ReplanStore {
  readonly #db: DatabaseSync
  readonly #clock: Clock

  constructor(db: DatabaseSync, clock: Clock) {
    this.#db = db
    this.#clock = clock
  }

  /**
   * Coalesces repeated requests that are still pending into one row, so a
   * burst of sync changes cannot enqueue a replan per web request.
   */
  enqueue(input: EnqueueReplanInput): ReplanRequest {
    return inTransaction(this.#db, () => {
      const rangeJson = JSON.stringify(input.range)
      const pending = this.#db
        .prepare(
          `SELECT * FROM replan_requests
           WHERE status = 'pending' AND reason = ? AND range_json = ?
           ORDER BY created_at DESC, rowid DESC LIMIT 1`,
        )
        .get(input.reason, rangeJson) as SqlRow | undefined
      if (pending) return this.#toRequest(pending)

      const replanRequestId =
        input.replanRequestId ??
        `replan-${createHash('sha256')
          .update(input.sourceKey ?? randomUUID())
          .digest('hex')
          .slice(0, 32)}`
      const now = this.#clock.now()
      this.#db
        .prepare(
          `INSERT OR IGNORE INTO replan_requests (
             replan_request_id, reason, range_json, status, source_key, created_at
           ) VALUES (?, ?, ?, 'pending', ?, ?)`,
        )
        .run(replanRequestId, input.reason, rangeJson, input.sourceKey ?? null, now)

      const row = this.#db
        .prepare('SELECT * FROM replan_requests WHERE replan_request_id = ?')
        .get(replanRequestId) as SqlRow
      return this.#toRequest(row)
    })
  }

  get(replanRequestId: string): ReplanRequest | undefined {
    const row = this.#db
      .prepare('SELECT * FROM replan_requests WHERE replan_request_id = ?')
      .get(replanRequestId) as SqlRow | undefined
    return row ? this.#toRequest(row) : undefined
  }

  list(limit = 50): ReplanRequest[] {
    const bounded = Math.min(200, Math.max(1, Math.trunc(limit)))
    const rows = this.#db
      .prepare(
        `SELECT * FROM replan_requests
         ORDER BY created_at DESC, rowid DESC LIMIT ?`,
      )
      .all(bounded) as SqlRow[]
    return rows.map((row) => this.#toRequest(row))
  }

  listPending(limit = 20): ReplanRequest[] {
    const bounded = Math.min(100, Math.max(1, Math.trunc(limit)))
    const rows = this.#db
      .prepare(
        `SELECT * FROM replan_requests
         WHERE status = 'pending'
         ORDER BY created_at ASC, rowid ASC LIMIT ?`,
      )
      .all(bounded) as SqlRow[]
    return rows.map((row) => this.#toRequest(row))
  }

  /**
   * Drops cached suggestions whose range overlaps a plan change (for example a
   * new locked block), so the next process run recomputes with the new locks.
   */
  invalidateSuggestions(range: Range): number {
    return inTransaction(this.#db, () => {
      const rows = this.#db
        .prepare("SELECT * FROM replan_requests WHERE status = 'suggested'")
        .all() as SqlRow[]
      let invalidated = 0
      for (const row of rows) {
        const requestRange = parseJson<Range>(row.range_json)
        if (!rangesOverlap(requestRange, range)) continue
        this.#db
          .prepare(
            `UPDATE replan_requests SET
               status = 'pending', suggestion_json = NULL, processed_at = NULL,
               plan_id = NULL, error_message = NULL
             WHERE replan_request_id = ?`,
          )
          .run(String(row.replan_request_id))
        invalidated += 1
      }
      return invalidated
    })
  }

  saveSuggestion(replanRequestId: string, suggestion: PlanSuggestion): void {
    this.#db
      .prepare(
        `UPDATE replan_requests SET
           status = 'suggested', suggestion_json = ?, processed_at = ?, error_message = NULL
         WHERE replan_request_id = ? AND status = 'pending'`,
      )
      .run(JSON.stringify(suggestion), this.#clock.now(), replanRequestId)
  }

  markAccepted(replanRequestId: string, planId: string): void {
    this.#db
      .prepare(
        `UPDATE replan_requests SET
           status = 'accepted', plan_id = ?, processed_at = ?, error_message = NULL
         WHERE replan_request_id = ?`,
      )
      .run(planId, this.#clock.now(), replanRequestId)
  }

  markFailed(replanRequestId: string, message: string): void {
    this.#db
      .prepare(
        `UPDATE replan_requests SET
           status = 'failed', error_message = ?, processed_at = ?
         WHERE replan_request_id = ?`,
      )
      .run(message, this.#clock.now(), replanRequestId)
  }

  #toRequest(row: SqlRow): ReplanRequest {
    return {
      replanRequestId: String(row.replan_request_id),
      reason: String(row.reason) as ReplanReason,
      range: parseJson<Range>(row.range_json),
      status: String(row.status) as ReplanRequestStatus,
      sourceKey: row.source_key == null ? undefined : String(row.source_key),
      createdAt: String(row.created_at),
      processedAt: row.processed_at == null ? undefined : String(row.processed_at),
      planId: row.plan_id == null ? undefined : String(row.plan_id),
      suggestion:
        row.suggestion_json == null
          ? undefined
          : parseJson<PlanSuggestion>(row.suggestion_json),
      errorMessage: row.error_message == null ? undefined : String(row.error_message),
    }
  }
}
