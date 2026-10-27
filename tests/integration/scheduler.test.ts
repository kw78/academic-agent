import { afterEach, describe, expect, it } from 'vitest'
import { FixtureLmsAdapter } from '@academic/adapter-fixture-lms'
import { ConnectorService } from '@academic/connectors'
import {
  Scheduler,
  SchedulerPauseError,
} from '@academic/scheduler'
import {
  countRows,
  createTestStore,
  fixedClock,
  sequentialIds,
} from '../helpers/store.js'

const cleanup: Array<() => void> = []

afterEach(() => {
  for (const dispose of cleanup.splice(0)) dispose()
})

function setup() {
  const clock = fixedClock()
  const store = createTestStore({ clock })
  const scheduler = new Scheduler({
    db: store.database,
    clock,
    ids: sequentialIds('scheduler'),
  })
  cleanup.push(() => {
    scheduler.close()
    store.close()
  })
  return { clock, store, scheduler }
}

describe('durable scheduler', () => {
  it('runs due jobs and schedules the next interval', async () => {
    const { clock, scheduler } = setup()
    let calls = 0
    const job = scheduler.schedule({
      jobId: 'job-probe',
      kind: 'probe',
      nextRunAt: clock.now(),
      policy: { intervalMs: 60_000 },
    })
    scheduler.registerHandler('probe', () => {
      calls += 1
      return { summary: { calls } }
    })

    const first = await scheduler.runDueJobs(clock.now())
    expect(first).toMatchObject([{ jobId: job.jobId, status: 'succeeded' }])
    expect(calls).toBe(1)
    expect(scheduler.getJob(job.jobId)).toMatchObject({
      enabled: true,
      consecutiveFailures: 0,
      nextRunAt: new Date(Date.parse(clock.now()) + 60_000).toISOString(),
    })

    clock.advance(30_000)
    expect(await scheduler.runDueJobs(clock.now())).toHaveLength(0)
    clock.advance(30_000)
    expect(await scheduler.runDueJobs(clock.now())).toHaveLength(1)
    expect(calls).toBe(2)
    expect(scheduler.listRuns(job.jobId)).toHaveLength(2)
    expect(scheduler.listRuns(job.jobId)[0]?.summary).toEqual({ calls: 2 })
  })

  it('retries with exponential backoff and caps attempts', async () => {
    const { clock, scheduler } = setup()
    scheduler.schedule({
      jobId: 'job-retry',
      kind: 'retry',
      nextRunAt: clock.now(),
      policy: {
        intervalMs: 60_000,
        maxAttempts: 2,
        backoffBaseMs: 1_000,
        backoffMaxMs: 10_000,
      },
    })
    scheduler.registerHandler('retry', () => {
      throw new Error('temporary')
    })

    const first = await scheduler.runDueJobs(clock.now())
    expect(first).toMatchObject([{ status: 'failed', errorCode: 'JOB_FAILED' }])
    expect(scheduler.getJob('job-retry')).toMatchObject({
      consecutiveFailures: 1,
      nextRunAt: new Date(Date.parse(clock.now()) + 1_000).toISOString(),
    })

    clock.advance(999)
    expect(await scheduler.runDueJobs(clock.now())).toHaveLength(0)
    clock.advance(1)
    const second = await scheduler.runDueJobs(clock.now())
    expect(second).toMatchObject([{ status: 'failed' }])
    expect(scheduler.getJob('job-retry')).toMatchObject({
      consecutiveFailures: 0,
      nextRunAt: new Date(Date.parse(clock.now()) + 60_000).toISOString(),
    })
    expect(scheduler.listRuns('job-retry').map((run) => run.attempt)).toEqual([2, 1])
  })

  it('enforces the job timeout', async () => {
    const { clock, scheduler } = setup()
    scheduler.schedule({
      jobId: 'job-timeout',
      kind: 'timeout',
      nextRunAt: clock.now(),
      policy: { timeoutMs: 100, maxAttempts: 1, intervalMs: 60_000 },
    })
    scheduler.registerHandler(
      'timeout',
      (context) =>
        new Promise<void>((_, reject) => {
          context.signal.addEventListener('abort', () => reject(new Error('aborted')))
        }),
    )

    const results = await scheduler.runDueJobs(clock.now())
    expect(results).toMatchObject([{ status: 'failed', errorCode: 'JOB_TIMEOUT' }])
  })

  it('pauses on auth-like failures and resumes when explicitly re-enabled', async () => {
    const { clock, scheduler } = setup()
    scheduler.schedule({
      jobId: 'job-auth',
      kind: 'auth',
      nextRunAt: clock.now(),
      policy: { intervalMs: 60_000 },
    })
    let fail = true
    scheduler.registerHandler('auth', () => {
      if (fail) throw new SchedulerPauseError('authorization expired')
      return { summary: { ok: true } }
    })

    const paused = await scheduler.runDueJobs(clock.now())
    expect(paused).toMatchObject([{ status: 'paused', errorCode: 'PAUSED' }])
    expect(scheduler.getJob('job-auth')?.enabled).toBe(false)
    clock.advance(60_000)
    expect(await scheduler.runDueJobs(clock.now())).toHaveLength(0)

    fail = false
    scheduler.resume('job-auth', clock.now())
    const resumed = await scheduler.runDueJobs(clock.now())
    expect(resumed).toMatchObject([{ status: 'succeeded' }])
    expect(scheduler.getJob('job-auth')?.enabled).toBe(true)
  })

  it('T12 recovers an interrupted run and retries idempotently', async () => {
    const { clock, store, scheduler } = setup()
    const connector = new ConnectorService({
      db: store.database,
      commands: store.commands,
      queries: store.queries,
      clock,
      ids: sequentialIds('connector'),
    })
    await connector.registerCourse({
      sourceId: 'fixture-lms',
      externalCourseId: 'CS101',
      termId: '2026-fall',
      code: 'CS101',
      title: 'Introduction to Computer Science',
    })
    await connector.sync(new FixtureLmsAdapter())
    const eventCount = countRows(store, 'domain_events')
    const itemCount = (await store.queries.listAcademicItems()).items.length
    expect(itemCount).toBe(2)

    const job = scheduler.schedule({
      jobId: 'job-sync',
      kind: 'fixture.sync',
      nextRunAt: new Date(Date.parse(clock.now()) + 60_000).toISOString(),
      policy: { intervalMs: 60_000 },
    })
    scheduler.registerHandler('fixture.sync', async () => {
      const summary = await connector.sync(new FixtureLmsAdapter())
      return { summary }
    })

    store.database
      .prepare(
        `INSERT INTO job_runs (run_id, job_id, kind, started_at, status, attempt)
         VALUES ('crashed-run', ?, 'fixture.sync', ?, 'running', 1)`,
      )
      .run(job.jobId, clock.now())
    store.database
      .prepare(
        `INSERT INTO job_leases (job_id, owner, expires_at, updated_at)
         VALUES (?, 'dead-worker', ?, ?)`,
      )
      .run(job.jobId, clock.now(), clock.now())

    expect(scheduler.recoverInterrupted(clock.now())).toBe(1)
    expect(scheduler.listRuns('job-sync')[0]).toMatchObject({
      runId: 'crashed-run',
      status: 'interrupted',
      errorCode: 'LEASE_EXPIRED',
    })
    expect(
      Date.parse(scheduler.getJob('job-sync')!.nextRunAt) <= Date.parse(clock.now()),
    ).toBe(true)

    const results = await scheduler.runDueJobs(clock.now())
    expect(results).toMatchObject([{ jobId: 'job-sync', status: 'succeeded' }])
    expect(countRows(store, 'domain_events')).toBe(eventCount)
    expect((await store.queries.listAcademicItems()).items).toHaveLength(2)
    expect(scheduler.getJob('job-sync')?.consecutiveFailures).toBe(0)
  })

  it('FIX-01 keeps persisted settings when default jobs are ensured on restart', async () => {
    const { clock, scheduler } = setup()
    const initial = scheduler.schedule({
      jobId: 'job-persisted',
      kind: 'persisted',
      nextRunAt: clock.now(),
      policy: { intervalMs: 60_000 },
    })
    scheduler.pause('job-persisted')
    const paused = scheduler.getJob('job-persisted')!

    const ensured = scheduler.ensureJob({
      jobId: 'job-persisted',
      kind: 'persisted',
      nextRunAt: new Date(Date.parse(clock.now()) + 999_000).toISOString(),
      policy: { intervalMs: 5_000 },
    })
    expect(ensured).toMatchObject({
      enabled: false,
      nextRunAt: paused.nextRunAt,
      policy: initial.policy,
      revision: initial.revision,
    })

    scheduler.resume('job-persisted', paused.nextRunAt)
    expect(scheduler.ensureJob({
      jobId: 'job-persisted',
      kind: 'persisted',
      policy: { intervalMs: 1_000 },
    }).policy).toMatchObject({ intervalMs: 60_000 })
  })

  it('T17 releases handlers and timers on dispose or close', async () => {
    const { clock, scheduler } = setup()
    scheduler.schedule({
      jobId: 'job-lifecycle',
      kind: 'lifecycle',
      nextRunAt: clock.now(),
      policy: { intervalMs: 60_000 },
    })
    const registration = scheduler.registerHandler('lifecycle', () => undefined)
    registration.dispose()

    const results = await scheduler.runDueJobs(clock.now())
    expect(results).toMatchObject([{ status: 'failed', errorCode: 'NO_HANDLER' }])

    scheduler.start(10)
    expect(scheduler.isRunning()).toBe(true)
    scheduler.close()
    expect(scheduler.isRunning()).toBe(false)
  })
})
