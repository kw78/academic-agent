import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { COMMAND, newId, parseCommand } from '@academic/contracts'
import { createAcademicApp, restoreDatabase } from '@academic/cli'
import {
  countRows,
  fixedClock,
} from '../helpers/store.js'

const cleanup: Array<() => void> = []

afterEach(() => {
  for (const dispose of cleanup.splice(0).reverse()) dispose()
})

function tempDir(prefix: string): string {
  mkdirSync('.data', { recursive: true })
  const directory = mkdtempSync(join('.data', prefix))
  cleanup.push(() => rmSync(directory, { recursive: true, force: true }))
  return directory
}

async function createTask(
  app: Awaited<ReturnType<typeof createAcademicApp>>,
  title = 'Review notes',
) {
  const result = await app.store.commands.execute(
    parseCommand({
      commandId: newId(),
      type: COMMAND.StudyTaskCreate,
      aggregateId: newId(),
      expectedVersion: 0,
      actor: { kind: 'user', id: 'test-user' },
      correlationId: newId(),
      payload: {
        title,
        estimateMinutes: 60,
        dueAt: new Date(Date.parse(app.clock.now()) + 2 * 86_400_000).toISOString(),
        priority: 1,
      },
    }),
  )
  expect(result.ok).toBe(true)
}

async function createApp(databasePath: string, clock = fixedClock()) {
  const app = await createAcademicApp({ databasePath, clock })
  cleanup.push(() => app.close())
  return app
}

describe('application composition', () => {
  it('T14/T15 keeps automation running after the agent bridge unloads with zero model calls', async () => {
    const app = await createApp(join(tempDir('app-e2e-'), 'academic.db'))
    await app.syncFixture()
    expect((await app.store.queries.listAcademicItems()).items).toHaveLength(2)
    expect(app.notifications.unreadCount()).toBeGreaterThan(0)
    await createTask(app)
    expect(await app.processPendingReplans()).toBeGreaterThan(0)

    app.agentBridge.registration.dispose()
    expect(app.agentBridge.host.list()).toHaveLength(0)

    const eventsBefore = countRows(app.store, 'domain_events')
    const summary = await app.syncFixture()
    expect(summary.status).toBe('success')
    expect(countRows(app.store, 'domain_events')).toBe(eventsBefore)

    app.scheduler.schedule({
      jobId: 'probe-job',
      kind: 'probe',
      nextRunAt: app.clock.now(),
    })
    let ran = false
    app.scheduler.registerHandler('probe', () => {
      ran = true
    })
    const runs = await app.scheduler.runDueJobs(app.clock.now())
    expect(ran).toBe(true)
    expect(runs).toMatchObject([{ jobId: 'probe-job', status: 'succeeded' }])

    await app.processPendingReplans()
    expect(app.modelUsage.count()).toBe(0)
  })

  it('T18 backs up and restores a consistent event-sourced database', async () => {
    const directory = tempDir('app-backup-')
    const databasePath = join(directory, 'academic.db')
    const backupPath = join(directory, 'backup.db')
    const restoredPath = join(directory, 'restored.db')
    const app = await createApp(databasePath)
    await app.syncFixture()
    await createTask(app)

    const before = {
      courses: await app.store.queries.listCourses(),
      items: await app.store.queries.listAcademicItems({ status: 'all' }),
      tasks: await app.store.queries.listStudyTasks(),
    }
    const eventCount = countRows(app.store, 'domain_events')
    app.backup(backupPath)

    await createTask(app, 'Only in the original database')
    app.close()

    restoreDatabase(backupPath, restoredPath)
    const restored = await createApp(restoredPath)
    expect(restored.store.health()).toMatchObject({ consistent: true })
    expect(countRows(restored.store, 'domain_events')).toBe(eventCount)
    expect({
      courses: await restored.store.queries.listCourses(),
      items: await restored.store.queries.listAcademicItems({ status: 'all' }),
      tasks: await restored.store.queries.listStudyTasks(),
    }).toEqual(before)

    restored.store.rebuildProjection()
    expect(restored.store.health()).toMatchObject({ consistent: true })
    expect({
      courses: await restored.store.queries.listCourses(),
      items: await restored.store.queries.listAcademicItems({ status: 'all' }),
      tasks: await restored.store.queries.listStudyTasks(),
    }).toEqual(before)
  })

  it('T20 keeps academic state and background jobs across an application restart', async () => {
    const directory = tempDir('app-restart-')
    const databasePath = join(directory, 'academic.db')
    const clock = fixedClock()

    const first = await createApp(databasePath, clock)
    await first.syncFixture()
    await createTask(first)
    const eventCount = countRows(first.store, 'domain_events')
    first.start()
    first.stop()
    first.close()

    const second = await createApp(databasePath, clock)
    expect(second.store.health()).toMatchObject({ consistent: true })
    expect(countRows(second.store, 'domain_events')).toBe(eventCount)
    expect((await second.store.queries.listAcademicItems()).items).toHaveLength(2)
    expect((await second.store.queries.listStudyTasks({ status: 'active' })).items).toHaveLength(1)

    const summary = await second.syncFixture()
    expect(summary).toMatchObject({ created: 0, updated: 0 })
    expect(countRows(second.store, 'domain_events')).toBe(eventCount)
    expect(second.scheduler.listJobs().map((job) => job.jobId)).toEqual(
      expect.arrayContaining(['fixture-lms-sync', 'planner.process-replans']),
    )
  })
})
