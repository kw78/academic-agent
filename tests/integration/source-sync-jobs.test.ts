import { afterEach, describe, expect, it } from 'vitest'
import { createAcademicApp } from '@academic/cli'
import { InMemoryCredentialVault } from '@academic/connections'
import type { SourceEngine } from '@academic/contracts'
import { fixedClock } from '../helpers/store.js'

const cleanup: Array<() => void> = []

afterEach(() => {
  for (const dispose of cleanup.splice(0).reverse()) dispose()
})

const fakeEngine: SourceEngine = {
  descriptor: {
    id: 'fake-http',
    displayName: 'Fake HTTP',
    supportsSync: true,
    supportsLogin: false,
    supportsVerify: false,
    authKinds: ['none', 'token'],
  },
  createAdapter(context) {
    return {
      id: context.sourceId,
      sourceId: context.sourceId,
      async fetch() {
        return {
          items: [
            {
              sourceId: context.sourceId,
              externalItemId: 'fake-1',
              courseExternalId: 'FAKE101',
              kind: 'assignment' as const,
              title: 'Fake assignment',
              due: { kind: 'unknown' as const },
              contentHash: 'fake-hash',
            },
          ],
          completeness: 'full' as const,
          fetchedAt: '2026-10-27T10:00:00.000Z',
          warnings: [],
        }
      },
    }
  },
  async listCourses(context) {
    return [
      {
        sourceId: context.sourceId,
        externalCourseId: 'FAKE101',
        termId: '2026-fall',
        code: 'FAKE101',
        title: 'Fake Course',
      },
    ]
  },
}

async function setup() {
  const clock = fixedClock()
  const app = await createAcademicApp({
    databasePath: ':memory:',
    clock,
    credentialVault: new InMemoryCredentialVault(),
    sourceEngines: [fakeEngine],
  })
  cleanup.push(() => app.close())
  return { app, clock }
}

function addSource(
  app: Awaited<ReturnType<typeof setup>>['app'],
  sourceId: string,
  authKind: 'none' | 'token' = 'none',
) {
  return app.sources.create({
    sourceId,
    engine: 'fake-http',
    displayName: sourceId,
    authKind,
    config: {},
  })
}

describe('per-source sync jobs', () => {
  it('creates a stable job for each real source and leaves the fixture alone', async () => {
    const { app } = await setup()
    addSource(app, 'source-a')

    const job = app.scheduler.getJob('source.sync.source-a')
    expect(job?.kind).toBe('connector.sync.source')
    expect(job?.payload).toEqual({ sourceId: 'source-a' })
    expect(job?.enabled).toBe(true)
    expect(job?.policy.intervalMs).toBe(60 * 60_000)

    expect(app.scheduler.getJob('source.sync.fixture-lms')).toBeUndefined()

    addSource(app, 'source-b')
    expect(app.scheduler.listJobs().filter((entry) => entry.kind === 'connector.sync.source'))
      .toHaveLength(2)
  })

  it('syncs the scheduled source into the kernel', async () => {
    const { app, clock } = await setup()
    addSource(app, 'source-a')
    const job = app.scheduler.getJob('source.sync.source-a')!
    const dueAt = new Date(Date.parse(job.nextRunAt) + 1_000).toISOString()

    const results = await app.scheduler.runDueJobs(dueAt)
    const sourceRun = results.find(
      (result) => result.jobId === 'source.sync.source-a',
    )
    expect(sourceRun?.status).toBe('succeeded')

    const courses = await app.store.queries.listCourses()
    expect(courses.items.map((course) => course.title)).toContain('Fake Course')
    const runs = await app.store.queries.listSyncRuns(undefined, 5)
    expect(runs.items[0]?.sourceId).toBe('source-a')

    const updated = app.scheduler.getJob('source.sync.source-a')!
    expect(updated.enabled).toBe(true)
    expect(updated.nextRunAt).toBe(
      new Date(Date.parse(clock.now()) + updated.policy.intervalMs).toISOString(),
    )
  })

  it('pauses on archive/disable and resumes on restore/enable', async () => {
    const { app } = await setup()
    addSource(app, 'source-a')

    app.sources.archive('source-a')
    expect(app.scheduler.getJob('source.sync.source-a')?.enabled).toBe(false)

    app.sources.restore('source-a')
    expect(app.scheduler.getJob('source.sync.source-a')?.enabled).toBe(true)

    app.sources.update('source-a', { enabled: false })
    expect(app.scheduler.getJob('source.sync.source-a')?.enabled).toBe(false)

    app.sources.update('source-a', { enabled: true })
    expect(app.scheduler.getJob('source.sync.source-a')?.enabled).toBe(true)
  })

  it('pauses the job when the source is deleted', async () => {
    const { app } = await setup()
    addSource(app, 'source-a')

    app.sources.delete('source-a')
    const job = app.scheduler.getJob('source.sync.source-a')
    expect(job?.enabled).toBe(false)

    app.reconcileSourceSyncJobs()
    expect(app.scheduler.getJob('source.sync.source-a')?.enabled).toBe(false)
  })

  it('skips a source without a verified connection instead of failing', async () => {
    const { app } = await setup()
    addSource(app, 'source-a', 'token')
    const job = app.scheduler.getJob('source.sync.source-a')!

    const results = await app.scheduler.runDueJobs(job.nextRunAt)
    expect(results[0]?.status).toBe('succeeded')
    const [run] = app.scheduler.listRuns('source.sync.source-a', 1)
    expect(run?.summary).toEqual({ sourceId: 'source-a', skipped: 'auth-required' })

    const updated = app.scheduler.getJob('source.sync.source-a')!
    expect(updated.enabled).toBe(true)
    expect(updated.consecutiveFailures).toBe(0)
  })

  it('applies the settings interval to the fixture and every source job', async () => {
    const { app } = await setup()
    addSource(app, 'source-a')
    addSource(app, 'source-b')

    const fixture = app.applySyncInterval(30)
    expect(fixture?.jobId).toBe('fixture-lms-sync')
    expect(fixture?.policy.intervalMs).toBe(30 * 60_000)
    for (const jobId of ['source.sync.source-a', 'source.sync.source-b']) {
      expect(app.scheduler.getJob(jobId)?.policy.intervalMs).toBe(30 * 60_000)
    }
  })

  it('keeps a user pause when the interval changes', async () => {
    const { app } = await setup()
    addSource(app, 'source-a')
    app.scheduler.pause('source.sync.source-a')

    app.applySyncInterval(15)
    expect(app.scheduler.getJob('source.sync.source-a')?.enabled).toBe(false)
  })

  it('keeps a manual pause when the source is edited for another reason', async () => {
    const { app } = await setup()
    addSource(app, 'source-a')
    app.scheduler.pause('source.sync.source-a')

    app.sources.update('source-a', { displayName: 'Renamed source' })
    expect(app.scheduler.getJob('source.sync.source-a')?.enabled).toBe(false)
  })
})
