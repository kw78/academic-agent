import { afterEach, describe, expect, it } from 'vitest'
import { COMMAND, EVENT, type AcademicItemSnapshot } from '@academic/contracts'
import { EventDispatcher } from '@academic/event-dispatcher'
import {
  createTestStore,
  execute,
  fixedClock,
  makeCommand,
} from '../helpers/store.js'

const cleanup: Array<() => void> = []

function teardown() {
  for (const dispose of cleanup.splice(0)) dispose()
}

afterEach(teardown)

const itemSnapshot: AcademicItemSnapshot = {
  courseId: 'course-1',
  kind: 'assignment',
  title: 'Problem Set 1',
  due: { kind: 'instant', utc: '2026-11-01T15:00:00.000Z', zone: 'Asia/Shanghai' },
  source: {
    sourceId: 'fixture-lms',
    externalItemId: 'assignment-1',
    sourceObservedAt: '2026-10-27T10:00:00.000Z',
    contentHash: 'hash-1',
  },
}

async function seedThreeEvents(store: ReturnType<typeof createTestStore>) {
  expect(
    await execute(
      store,
      makeCommand(COMMAND.CourseCreate, 'course-1', {
        termId: '2026-fall',
        code: 'CS101',
        title: 'Computer Science',
      }),
    ),
  ).toMatchObject({ ok: true })
  expect(
    await execute(
      store,
      makeCommand(
        COMMAND.AcademicItemDiscover,
        'item-1',
        itemSnapshot as unknown as Record<string, unknown>,
      ),
    ),
  ).toMatchObject({ ok: true })
  expect(
    await execute(
      store,
      makeCommand(COMMAND.AcademicItemSetProgress, 'item-1', {
        progress: { status: 'in-progress', percent: 30 },
      }),
    ),
  ).toMatchObject({ ok: true })
}

describe('T10 extension projection full replay', () => {
  it('builds analytics from history without changing core state', async () => {
    const store = createTestStore()
    const dispatcher = new EventDispatcher({
      events: store.events,
      checkpoints: store.checkpoints,
      clock: fixedClock(),
    })
    cleanup.push(() => {
      dispatcher.close()
      store.close()
    })

    store.database.exec(`
      CREATE TABLE analytics_events (
        event_id TEXT PRIMARY KEY,
        event_type TEXT NOT NULL
      );
    `)
    await seedThreeEvents(store)
    const coreBefore = {
      courses: await store.queries.listCourses(),
      items: await store.queries.listAcademicItems({ status: 'all' }),
    }

    const handle = await dispatcher.register({
      consumerId: 'academic.analytics.count.v1',
      eventTypes: '*',
      projectionVersion: 1,
      startPosition: 'beginning',
      handler(event) {
        store.database
          .prepare('INSERT OR IGNORE INTO analytics_events (event_id, event_type) VALUES (?, ?)')
          .run(event.eventId, event.type)
      },
    })
    cleanup.push(() => handle.dispose())

    const summary = await dispatcher.processOnce()
    expect(summary).toMatchObject({ scanned: 3, processed: 3, failures: 0 })

    const analytics = store.database
      .prepare('SELECT event_type FROM analytics_events ORDER BY event_id')
      .all() as Array<{ event_type: string }>
    expect(analytics.map((row) => row.event_type)).toEqual([
      EVENT.CourseCreated,
      EVENT.AcademicItemDiscovered,
      EVENT.AcademicItemProgressChanged,
    ])
    expect({
      courses: await store.queries.listCourses(),
      items: await store.queries.listAcademicItems({ status: 'all' }),
    }).toEqual(coreBefore)

    const checkpoint = await store.checkpoints.getCheckpoint('academic.analytics.count.v1')
    expect(checkpoint).toMatchObject({ lastPosition: 3, projectionVersion: 1 })

    expect(
      await execute(
        store,
        makeCommand(COMMAND.AcademicItemSetProgress, 'item-1', {
          progress: { status: 'in-progress', percent: 50 },
        }),
      ),
    ).toMatchObject({ ok: true })
    expect(await dispatcher.processOnce()).toMatchObject({ processed: 1 })
    expect(
      store.database.prepare('SELECT COUNT(*) AS count FROM analytics_events').get(),
    ).toMatchObject({ count: 4 })

    store.rebuildProjection()
    expect(
      store.database.prepare('SELECT COUNT(*) AS count FROM analytics_events').get(),
    ).toMatchObject({ count: 4 })
    teardown()
  })
})

describe('T11 activation from the latest position', () => {
  it('ignores historical events and only processes new ones after enable', async () => {
    const store = createTestStore()
    const dispatcher = new EventDispatcher({
      events: store.events,
      checkpoints: store.checkpoints,
      clock: fixedClock(),
    })
    cleanup.push(() => {
      dispatcher.close()
      store.close()
    })

    await seedThreeEvents(store)
    const seen: string[] = []
    let handle = await dispatcher.register({
      consumerId: 'academic.notifications.probe.v1',
      eventTypes: '*',
      projectionVersion: 1,
      startPosition: 'latest',
      handler(event) {
        seen.push(event.eventId)
      },
    })

    expect(await dispatcher.processOnce()).toMatchObject({ scanned: 0, processed: 0 })

    await execute(
      store,
      makeCommand(COMMAND.CourseRename, 'course-1', { title: 'CS' }),
    )
    expect(await dispatcher.processOnce()).toMatchObject({ processed: 1 })
    expect(seen).toHaveLength(1)

    handle.dispose()
    handle = await dispatcher.register({
      consumerId: 'academic.notifications.probe.v1',
      eventTypes: '*',
      projectionVersion: 1,
      startPosition: 'latest',
      handler(event) {
        seen.push(event.eventId)
      },
    })
    cleanup.push(() => handle.dispose())

    expect(await dispatcher.processOnce()).toMatchObject({ processed: 0 })
    await execute(
      store,
      makeCommand(COMMAND.CourseRename, 'course-1', { title: 'CS II' }),
    )
    expect(await dispatcher.processOnce()).toMatchObject({ processed: 1 })
    expect(seen).toHaveLength(2)
    teardown()
  })
})

describe('consumer failure isolation and backoff', () => {
  it('keeps the checkpoint and retries after a bounded delay', async () => {
    const clock = fixedClock()
    const store = createTestStore({ clock })
    const dispatcher = new EventDispatcher({
      events: store.events,
      checkpoints: store.checkpoints,
      clock,
    })
    cleanup.push(() => {
      dispatcher.close()
      store.close()
    })
    await seedThreeEvents(store)

    let shouldFail = true
    const seen: string[] = []
    await dispatcher.register({
      consumerId: 'probe.fragile.v1',
      eventTypes: '*',
      projectionVersion: 1,
      startPosition: 'beginning',
      handler(event) {
        if (shouldFail) throw new Error('temporary failure')
        seen.push(event.eventId)
      },
    })

    const failed = await dispatcher.processOnce()
    expect(failed).toMatchObject({ scanned: 1, processed: 0, failures: 1 })
    expect(await store.checkpoints.getCheckpoint('probe.fragile.v1')).toMatchObject({
      lastPosition: 0,
    })
    expect(dispatcher.listConsumers()[0]).toMatchObject({
      consecutiveFailures: 1,
      lastError: 'temporary failure',
    })

    shouldFail = false
    clock.advance(1_000)
    const retried = await dispatcher.processOnce()
    expect(retried).toMatchObject({ processed: 3, failures: 0 })
    expect(seen).toHaveLength(3)
    expect(await store.checkpoints.getCheckpoint('probe.fragile.v1')).toMatchObject({
      lastPosition: 3,
    })
    expect(dispatcher.listConsumers()[0]?.consecutiveFailures).toBe(0)
    teardown()
  })

  it('does not block other consumers when one fails', async () => {
    const clock = fixedClock()
    const store = createTestStore({ clock })
    const dispatcher = new EventDispatcher({
      events: store.events,
      checkpoints: store.checkpoints,
      clock,
    })
    cleanup.push(() => {
      dispatcher.close()
      store.close()
    })
    await seedThreeEvents(store)

    const healthySeen: string[] = []
    await dispatcher.register({
      consumerId: 'probe.failing.v1',
      eventTypes: '*',
      projectionVersion: 1,
      startPosition: 'beginning',
      handler() {
        throw new Error('always fails')
      },
    })
    await dispatcher.register({
      consumerId: 'probe.healthy.v1',
      eventTypes: '*',
      projectionVersion: 1,
      startPosition: 'beginning',
      handler(event) {
        healthySeen.push(event.eventId)
      },
    })

    const summary = await dispatcher.processOnce()
    expect(summary).toMatchObject({ processed: 3, failures: 1 })
    expect(healthySeen).toHaveLength(3)
    teardown()
  })
})

describe('T17 lifecycle release', () => {
  it('stops timers and removes consumers on close', async () => {
    const store = createTestStore()
    const dispatcher = new EventDispatcher({
      events: store.events,
      checkpoints: store.checkpoints,
      clock: fixedClock(),
    })
    cleanup.push(() => store.close())

    await dispatcher.register({
      consumerId: 'probe.lifecycle.v1',
      eventTypes: '*',
      projectionVersion: 1,
      startPosition: 'beginning',
      handler() {},
    })
    dispatcher.start(10)
    expect(dispatcher.isRunning()).toBe(true)
    expect(dispatcher.listConsumers()).toHaveLength(1)

    dispatcher.close()
    expect(dispatcher.isRunning()).toBe(false)
    expect(dispatcher.listConsumers()).toHaveLength(0)
    teardown()
  })
})
