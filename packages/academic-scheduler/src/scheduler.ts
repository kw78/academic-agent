import type { DatabaseSync } from 'node:sqlite'
import {
  systemClock,
  type Clock,
  type DisposableRegistration,
  type IdGenerator,
} from '@academic/contracts'
import { inTransaction, type SqlRow } from './database.js'

export interface JobPolicy {
  intervalMs: number
  timeoutMs: number
  maxAttempts: number
  backoffBaseMs: number
  backoffMaxMs: number
}

export type JobPolicyInput = Partial<JobPolicy>

export interface ScheduledJob {
  jobId: string
  kind: string
  payload: unknown
  enabled: boolean
  nextRunAt: string
  policy: JobPolicy
  revision: number
  consecutiveFailures: number
  createdAt: string
  updatedAt: string
}

export type JobRunStatus = 'running' | 'succeeded' | 'failed' | 'interrupted' | 'paused'

export interface JobRun {
  runId: string
  jobId: string
  kind: string
  status: JobRunStatus
  startedAt: string
  finishedAt?: string
  attempt: number
  errorCode?: string
  errorMessage?: string
  summary: unknown
}

export interface JobContext {
  jobId: string
  kind: string
  payload: unknown
  runId: string
  attempt: number
  signal: AbortSignal
}

export interface JobOutcome {
  summary?: unknown
  pause?: boolean
  pauseReason?: string
  nextRunAt?: string
}

export type JobHandler = (context: JobContext) => JobOutcome | void | Promise<JobOutcome | void>

export interface ScheduleJobInput {
  jobId?: string
  kind: string
  payload?: unknown
  nextRunAt?: string
  policy?: JobPolicyInput
  enabled?: boolean
}

export interface JobRunResult {
  jobId: string
  runId: string
  status: JobRunStatus
  errorCode?: string
  errorMessage?: string
}

export class SchedulerPauseError extends Error {
  readonly code = 'PAUSED'

  constructor(message: string) {
    super(message)
    this.name = 'SchedulerPauseError'
  }
}

export class JobTimeoutError extends Error {
  readonly code = 'JOB_TIMEOUT'

  constructor(timeoutMs: number) {
    super(`Job exceeded its ${timeoutMs}ms timeout`)
    this.name = 'JobTimeoutError'
  }
}

const DEFAULT_POLICY: JobPolicy = {
  intervalMs: 15 * 60_000,
  timeoutMs: 60_000,
  maxAttempts: 3,
  backoffBaseMs: 30_000,
  backoffMaxMs: 15 * 60_000,
}

const LEASE_GRACE_MS = 5_000

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function addMilliseconds(iso: string, milliseconds: number): string {
  return new Date(Date.parse(iso) + milliseconds).toISOString()
}

function parseJson<T>(value: unknown): T {
  return JSON.parse(String(value)) as T
}

function normalizePolicy(input: JobPolicyInput = {}): JobPolicy {
  return {
    intervalMs: Math.max(1_000, Math.trunc(input.intervalMs ?? DEFAULT_POLICY.intervalMs)),
    timeoutMs: Math.max(100, Math.trunc(input.timeoutMs ?? DEFAULT_POLICY.timeoutMs)),
    maxAttempts: Math.max(1, Math.trunc(input.maxAttempts ?? DEFAULT_POLICY.maxAttempts)),
    backoffBaseMs: Math.max(
      100,
      Math.trunc(input.backoffBaseMs ?? DEFAULT_POLICY.backoffBaseMs),
    ),
    backoffMaxMs: Math.max(
      100,
      Math.trunc(input.backoffMaxMs ?? DEFAULT_POLICY.backoffMaxMs),
    ),
  }
}

export interface SchedulerOptions {
  db: DatabaseSync
  clock?: Clock
  ids: IdGenerator
  owner?: string
  batchSize?: number
}

export class Scheduler {
  readonly #db: DatabaseSync
  readonly #clock: Clock
  readonly #ids: IdGenerator
  readonly #owner: string
  readonly #batchSize: number
  readonly #handlers = new Map<string, JobHandler>()
  #timer: ReturnType<typeof setInterval> | undefined
  #running = false
  #pass: Promise<JobRunResult[]> | undefined

  constructor(options: SchedulerOptions) {
    this.#db = options.db
    this.#clock = options.clock ?? systemClock
    this.#ids = options.ids
    this.#owner = options.owner ?? `scheduler/${options.ids.next()}`
    this.#batchSize = options.batchSize ?? 10
  }

  registerHandler(kind: string, handler: JobHandler): DisposableRegistration {
    if (this.#handlers.has(kind)) {
      throw new Error(`Handler already registered for job kind: ${kind}`)
    }
    this.#handlers.set(kind, handler)
    let disposed = false
    return {
      dispose: () => {
        if (disposed) return
        disposed = true
        this.#handlers.delete(kind)
      },
    }
  }

  /**
   * Installs a default job only when it does not exist yet. Startup wiring must
   * use this instead of schedule(), otherwise saved enabled/nextRunAt/policy
   * values are overwritten on every restart.
   */
  ensureJob(input: ScheduleJobInput): ScheduledJob {
    const jobId = input.jobId ?? this.#ids.next()
    const existing = this.getJob(jobId)
    if (existing) return existing
    return this.schedule({ ...input, jobId })
  }

  /** Explicit create-or-update. User-initiated configuration changes use this. */
  schedule(input: ScheduleJobInput): ScheduledJob {
    const now = this.#clock.now()
    const jobId = input.jobId ?? this.#ids.next()
    const policy = normalizePolicy(input.policy)
    const nextRunAt = input.nextRunAt ?? now
    this.#db
      .prepare(
        `INSERT INTO scheduled_jobs (
           job_id, kind, payload_json, enabled, next_run_at, policy_json,
           revision, consecutive_failures, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, 1, 0, ?, ?)
         ON CONFLICT(job_id) DO UPDATE SET
           kind = excluded.kind,
           payload_json = excluded.payload_json,
           enabled = excluded.enabled,
           next_run_at = excluded.next_run_at,
           policy_json = excluded.policy_json,
           revision = scheduled_jobs.revision + 1,
           updated_at = excluded.updated_at`,
      )
      .run(
        jobId,
        input.kind,
        JSON.stringify(input.payload ?? {}),
        input.enabled === false ? 0 : 1,
        nextRunAt,
        JSON.stringify(policy),
        now,
        now,
      )
    return this.getJob(jobId)!
  }

  getJob(jobId: string): ScheduledJob | undefined {
    const row = this.#db
      .prepare('SELECT * FROM scheduled_jobs WHERE job_id = ?')
      .get(jobId) as SqlRow | undefined
    return row ? this.#toJob(row) : undefined
  }

  listJobs(): ScheduledJob[] {
    const rows = this.#db
      .prepare('SELECT * FROM scheduled_jobs ORDER BY next_run_at ASC, job_id ASC')
      .all() as SqlRow[]
    return rows.map((row) => this.#toJob(row))
  }

  listRuns(jobId?: string, limit = 20): JobRun[] {
    const bounded = Math.min(100, Math.max(1, Math.trunc(limit)))
    const rows = (
      jobId
        ? this.#db
            .prepare(
              `SELECT * FROM job_runs WHERE job_id = ?
               ORDER BY started_at DESC, rowid DESC LIMIT ?`,
            )
            .all(jobId, bounded)
        : this.#db
            .prepare(
              `SELECT * FROM job_runs
               ORDER BY started_at DESC, rowid DESC LIMIT ?`,
            )
            .all(bounded)
    ) as SqlRow[]
    return rows.map((row) => this.#toRun(row))
  }

  async runDueJobs(now = this.#clock.now(), limit = this.#batchSize): Promise<JobRunResult[]> {
    if (this.#pass) return this.#pass
    this.#pass = this.#runDueJobsInternal(now, limit).finally(() => {
      this.#pass = undefined
    })
    return this.#pass
  }

  recoverInterrupted(now = this.#clock.now()): number {
    return inTransaction(this.#db, () => {
      const crashed = this.#db
        .prepare(
          `SELECT run_id, job_id FROM job_runs AS runs
           WHERE status = 'running'
             AND NOT EXISTS (
               SELECT 1 FROM job_leases AS leases
               WHERE leases.job_id = runs.job_id AND leases.expires_at > ?
             )`,
        )
        .all(now) as SqlRow[]

      for (const row of crashed) {
        this.#db
          .prepare(
            `UPDATE job_runs
             SET status = 'interrupted', finished_at = ?,
                 error_code = 'LEASE_EXPIRED', error_message = ?
             WHERE run_id = ?`,
          )
          .run(now, 'Process stopped before releasing its job lease', String(row.run_id))
        this.#db
          .prepare(
            `UPDATE scheduled_jobs
             SET next_run_at = ?, updated_at = ?
             WHERE job_id = ? AND enabled = 1 AND next_run_at > ?`,
          )
          .run(now, now, String(row.job_id), now)
      }

      this.#db.prepare('DELETE FROM job_leases WHERE expires_at <= ?').run(now)
      return crashed.length
    })
  }

  pause(jobId: string): void {
    this.#db
      .prepare('UPDATE scheduled_jobs SET enabled = 0, updated_at = ? WHERE job_id = ?')
      .run(this.#clock.now(), jobId)
  }

  resume(jobId: string, nextRunAt = this.#clock.now()): void {
    this.#db
      .prepare(
        'UPDATE scheduled_jobs SET enabled = 1, next_run_at = ?, updated_at = ? WHERE job_id = ?',
      )
      .run(nextRunAt, this.#clock.now(), jobId)
  }

  isRunning(): boolean {
    return this.#running
  }

  start(intervalMs = 1_000): void {
    if (this.#running) return
    this.recoverInterrupted()
    this.#running = true
    this.#timer = setInterval(() => {
      void this.runDueJobs().catch(() => undefined)
    }, intervalMs)
    this.#timer.unref?.()
  }

  stop(): void {
    if (this.#timer) clearInterval(this.#timer)
    this.#timer = undefined
    this.#running = false
  }

  close(): void {
    this.stop()
    this.#handlers.clear()
  }

  /** Resolves once the in-flight pass (if any) has finished. */
  async waitForIdle(): Promise<void> {
    if (this.#pass) await this.#pass
  }

  async #runDueJobsInternal(now: string, limit: number): Promise<JobRunResult[]> {
    const due = this.#db
      .prepare(
        `SELECT * FROM scheduled_jobs
         WHERE enabled = 1 AND next_run_at <= ?
         ORDER BY next_run_at ASC, rowid ASC
         LIMIT ?`,
      )
      .all(now, Math.max(1, Math.trunc(limit))) as SqlRow[]
    const results: JobRunResult[] = []

    for (const row of due) {
      const job = this.#toJob(row)
      const handler = this.#handlers.get(job.kind)
      const acquired = this.#acquireLeaseAndStartRun(job, now)
      if (!acquired) continue
      const { runId, attempt } = acquired

      if (!handler) {
        results.push(
          this.#finishRun(job, runId, attempt, {
            status: 'failed',
            errorCode: 'NO_HANDLER',
            errorMessage: `No handler registered for job kind: ${job.kind}`,
          }),
        )
        continue
      }

      const controller = new AbortController()
      let timer: ReturnType<typeof setTimeout> | undefined
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          reject(new JobTimeoutError(job.policy.timeoutMs))
          controller.abort()
        }, job.policy.timeoutMs)
        timer.unref?.()
      })

      try {
        const outcome = ((await Promise.race([
          Promise.resolve(
            handler({
              jobId: job.jobId,
              kind: job.kind,
              payload: job.payload,
              runId,
              attempt,
              signal: controller.signal,
            }),
          ),
          timeout,
        ])) ?? {}) as JobOutcome

        if (outcome.pause) {
          results.push(
            this.#finishRun(job, runId, attempt, {
              status: 'paused',
              outcome,
              errorCode: 'PAUSED',
              errorMessage: outcome.pauseReason,
            }),
          )
        } else {
          results.push(
            this.#finishRun(job, runId, attempt, { status: 'succeeded', outcome }),
          )
        }
      } catch (error) {
        if (error instanceof SchedulerPauseError) {
          results.push(
            this.#finishRun(job, runId, attempt, {
              status: 'paused',
              errorCode: 'PAUSED',
              errorMessage: error.message,
            }),
          )
        } else {
          const code =
            error instanceof JobTimeoutError || controller.signal.aborted
              ? 'JOB_TIMEOUT'
              : 'JOB_FAILED'
          results.push(
            this.#finishRun(job, runId, attempt, {
              status: 'failed',
              errorCode: code,
              errorMessage: errorMessage(error),
            }),
          )
        }
      } finally {
        if (timer) clearTimeout(timer)
      }
    }

    return results
  }

  #acquireLeaseAndStartRun(
    job: ScheduledJob,
    now: string,
  ): { runId: string; attempt: number } | undefined {
    return inTransaction(this.#db, () => {
      const lease = this.#db
        .prepare('SELECT * FROM job_leases WHERE job_id = ?')
        .get(job.jobId) as SqlRow | undefined
      if (lease && String(lease.expires_at) > now) return undefined

      const expiresAt = addMilliseconds(now, job.policy.timeoutMs + LEASE_GRACE_MS)
      this.#db
        .prepare(
          `INSERT INTO job_leases (job_id, owner, expires_at, updated_at)
           VALUES (?, ?, ?, ?)
           ON CONFLICT(job_id) DO UPDATE SET
             owner = excluded.owner,
             expires_at = excluded.expires_at,
             updated_at = excluded.updated_at`,
        )
        .run(job.jobId, this.#owner, expiresAt, now)

      const runId = this.#ids.next()
      const attempt = job.consecutiveFailures + 1
      this.#db
        .prepare(
          `INSERT INTO job_runs (
             run_id, job_id, kind, started_at, status, attempt, summary_json
           ) VALUES (?, ?, ?, ?, 'running', ?, '{}')`,
        )
        .run(runId, job.jobId, job.kind, now, attempt)

      const updated = this.#db
        .prepare(
          `UPDATE scheduled_jobs SET consecutive_failures = ?, updated_at = ?
           WHERE job_id = ?`,
        )
        .run(attempt, now, job.jobId)
      if (Number(updated.changes) !== 1) {
        throw new Error(`Scheduled job disappeared: ${job.jobId}`)
      }
      return { runId, attempt }
    })
  }

  #finishRun(
    job: ScheduledJob,
    runId: string,
    attempt: number,
    result: {
      status: 'succeeded' | 'failed' | 'paused'
      outcome?: JobOutcome
      errorCode?: string
      errorMessage?: string
    },
  ): JobRunResult {
    const now = this.#clock.now()
    const runStatus: JobRunStatus = result.status
    let jobEnabled = job.enabled
    let failures = job.consecutiveFailures
    let nextRunAt: string

    if (result.status === 'succeeded') {
      failures = 0
      nextRunAt = result.outcome?.nextRunAt ?? addMilliseconds(now, job.policy.intervalMs)
    } else if (result.status === 'paused') {
      failures = 0
      jobEnabled = false
      nextRunAt = addMilliseconds(now, job.policy.intervalMs)
    } else {
      if (attempt >= job.policy.maxAttempts) {
        failures = 0
        nextRunAt = addMilliseconds(now, job.policy.intervalMs)
      } else {
        failures = attempt
        const backoff = Math.min(
          job.policy.backoffMaxMs,
          job.policy.backoffBaseMs * 2 ** (attempt - 1),
        )
        nextRunAt = addMilliseconds(now, backoff)
      }
    }

    inTransaction(this.#db, () => {
      this.#db
        .prepare(
          `UPDATE job_runs SET
             status = ?, finished_at = ?, error_code = ?, error_message = ?, summary_json = ?
           WHERE run_id = ?`,
        )
        .run(
          runStatus,
          now,
          result.errorCode ?? null,
          result.errorMessage ?? null,
          JSON.stringify(result.outcome?.summary ?? {}),
          runId,
        )
      // The run started from an older snapshot. If the user paused/resumed or
      // reconfigured the job meanwhile, their change wins over the stale copy.
      const currentRow = this.#db
        .prepare('SELECT * FROM scheduled_jobs WHERE job_id = ?')
        .get(job.jobId) as SqlRow | undefined
      if (currentRow) {
        const current = this.#toJob(currentRow)
        if (current.revision !== job.revision) {
          jobEnabled = current.enabled
          nextRunAt = current.nextRunAt
        } else if (current.enabled !== job.enabled) {
          jobEnabled = current.enabled
        }
      }
      this.#db
        .prepare(
          `UPDATE scheduled_jobs SET
             enabled = ?, next_run_at = ?, consecutive_failures = ?, updated_at = ?
           WHERE job_id = ?`,
        )
        .run(jobEnabled ? 1 : 0, nextRunAt, failures, now, job.jobId)
      this.#db
        .prepare('DELETE FROM job_leases WHERE job_id = ? AND owner = ?')
        .run(job.jobId, this.#owner)
    })

    return {
      jobId: job.jobId,
      runId,
      status: runStatus,
      ...(result.errorCode ? { errorCode: result.errorCode } : {}),
      ...(result.errorMessage ? { errorMessage: result.errorMessage } : {}),
    }
  }

  #toJob(row: SqlRow): ScheduledJob {
    return {
      jobId: String(row.job_id),
      kind: String(row.kind),
      payload: parseJson<unknown>(row.payload_json),
      enabled: Boolean(row.enabled),
      nextRunAt: String(row.next_run_at),
      policy: parseJson<JobPolicy>(row.policy_json),
      revision: Number(row.revision),
      consecutiveFailures: Number(row.consecutive_failures),
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    }
  }

  #toRun(row: SqlRow): JobRun {
    return {
      runId: String(row.run_id),
      jobId: String(row.job_id),
      kind: String(row.kind),
      status: String(row.status) as JobRunStatus,
      startedAt: String(row.started_at),
      finishedAt: row.finished_at == null ? undefined : String(row.finished_at),
      attempt: Number(row.attempt),
      errorCode: row.error_code == null ? undefined : String(row.error_code),
      errorMessage: row.error_message == null ? undefined : String(row.error_message),
      summary: parseJson<unknown>(row.summary_json),
    }
  }
}
