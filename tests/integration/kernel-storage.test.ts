import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  COMMAND,
  EVENT,
  parseCommand,
  type AcademicItemSnapshot,
  type DomainCommand,
} from '@academic/contracts'
import {
  countRows,
  createTestStore,
  execute,
  fixedClock,
  makeCommand,
} from '../helpers/store.js'

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

const cleanup: Array<() => void> = []

afterEach(() => {
  for (const dispose of cleanup.splice(0)) dispose()
})

async function createCourse(
  store: ReturnType<typeof createTestStore>,
  commandId = 'course-create-1',
) {
  const result = await execute(
    store,
    makeCommand(
      COMMAND.CourseCreate,
      'course-1',
      { termId: '2026-fall', code: 'CS101', title: 'Computer Science' },
      { commandId },
    ),
  )
  expect(result.ok).toBe(true)
  return result
}

describe('T01 command idempotency', () => {
  it('returns the first result for a retried command and rejects id reuse with new content', async () => {
    const store = createTestStore()
    cleanup.push(() => store.close())

    const command = makeCommand(
      COMMAND.CourseCreate,
      'course-1',
      { termId: '2026-fall', code: 'CS101', title: 'Computer Science' },
      { commandId: 'fixed-command-1' },
    )
    const first = await execute(store, command)
    const second = await execute(store, command)
    expect(first).toEqual(second)
    expect(first).toMatchObject({ ok: true, version: 1 })

    const conflicting = parseCommand({
      commandId: 'fixed-command-1',
      type: COMMAND.CourseCreate,
      aggregateId: 'course-1',
      actor: { kind: 'system', id: 'test-runner' },
      correlationId: 'other-correlation',
      payload: { termId: '2026-fall', code: 'CS101', title: 'Different title' },
    })
    const conflictResult = await execute(store, conflicting)
    expect(conflictResult).toMatchObject({ ok: false, code: 'CONFLICT' })

    expect(countRows(store, 'domain_events')).toBe(1)
    expect(countRows(store, 'command_receipts')).toBe(1)
    const courses = await store.queries.listCourses()
    expect(courses.items).toHaveLength(1)
    expect(courses.items[0]?.title).toBe('Computer Science')
  })

  it('stores a receipt for a no-op command without generating events', async () => {
    const store = createTestStore()
    cleanup.push(() => store.close())
    await createCourse(store)

    const noop = makeCommand(
      COMMAND.CourseRename,
      'course-1',
      { title: 'Computer Science' },
      { commandId: 'noop-rename-1' },
    )
    const first = await execute(store, noop)
    const second = await execute(store, noop)
    expect(first).toEqual({ ok: true, aggregateId: 'course-1', version: 1, eventIds: [] })
    expect(second).toEqual(first)
    expect(countRows(store, 'domain_events')).toBe(1)
  })

  it('returns VALIDATION for a payload that violates the runtime schema', async () => {
    const store = createTestStore()
    cleanup.push(() => store.close())

    const invalid = {
      commandId: 'invalid-1',
      type: COMMAND.CourseCreate,
      aggregateId: 'course-1',
      actor: { kind: 'system', id: 'test-runner' },
      correlationId: 'correlation-1',
      payload: { termId: '2026-fall' },
    } as unknown as DomainCommand
    const result = await execute(store, invalid)
    expect(result).toMatchObject({ ok: false, code: 'VALIDATION' })
    expect(countRows(store, 'domain_events')).toBe(0)
  })
})

describe('T02 optimistic concurrency', () => {
  it('rejects a stale expectedVersion and keeps the winning update', async () => {
    const store = createTestStore()
    cleanup.push(() => store.close())
    await createCourse(store)

    const winner = await execute(
      store,
      makeCommand(
        COMMAND.CourseRename,
        'course-1',
        { title: 'Winning title' },
        { commandId: 'rename-winner', expectedVersion: 1 },
      ),
    )
    expect(winner).toMatchObject({ ok: true, version: 2 })

    const stale = await execute(
      store,
      makeCommand(
        COMMAND.CourseRename,
        'course-1',
        { title: 'Stale title' },
        { commandId: 'rename-stale', expectedVersion: 1 },
      ),
    )
    expect(stale).toMatchObject({ ok: false, code: 'CONFLICT' })

    const course = await store.queries.getCourse('course-1')
    expect(course?.title).toBe('Winning title')
    expect(course?.version).toBe(2)
    expect(countRows(store, 'domain_events')).toBe(2)
  })

  it('detects a stale writer through a second database connection', async () => {
    mkdirSync('.data', { recursive: true })
    const directory = mkdtempSync(join('.data', 't02-'))
    const databasePath = join(directory, 'academic.db')
    const storeA = createTestStore({ databasePath })
    const storeB = createTestStore({ databasePath })
    cleanup.push(() => {
      storeB.close()
      storeA.close()
      rmSync(directory, { recursive: true, force: true })
    })

    await createCourse(storeA)

    const first = await execute(
      storeA,
      makeCommand(
        COMMAND.CourseRename,
        'course-1',
        { title: 'From A' },
        { commandId: 'connection-a', expectedVersion: 1 },
      ),
    )
    expect(first.ok).toBe(true)

    const second = await execute(
      storeB,
      makeCommand(
        COMMAND.CourseRename,
        'course-1',
        { title: 'From B' },
        { commandId: 'connection-b', expectedVersion: 1 },
      ),
    )
    expect(second).toMatchObject({ ok: false, code: 'CONFLICT' })

    const course = await storeA.queries.getCourse('course-1')
    expect(course?.title).toBe('From A')
  })
})

describe('T03 projection failure rollback', () => {
  it('rolls back events, receipts and projection rows together', async () => {
    const store = createTestStore()
    cleanup.push(() => store.close())

    store.database.exec(`
      CREATE TRIGGER fail_item_insert
      BEFORE INSERT ON academic_items_current
      BEGIN
        SELECT RAISE(ABORT, 'projection write failed');
      END;
    `)

    const discover = makeCommand(
      COMMAND.AcademicItemDiscover,
      'item-1',
      itemSnapshot as unknown as Record<string, unknown>,
      { commandId: 'rollback-discover' },
    )
    const failed = await execute(store, discover)
    expect(failed).toMatchObject({ ok: false, code: 'UNAVAILABLE' })
    expect(countRows(store, 'domain_events')).toBe(0)
    expect(countRows(store, 'event_streams')).toBe(0)
    expect(countRows(store, 'command_receipts')).toBe(0)
    expect(countRows(store, 'academic_items_current')).toBe(0)

    store.database.exec('DROP TRIGGER fail_item_insert;')
    const retried = await execute(store, discover)
    expect(retried).toMatchObject({ ok: true, version: 1 })
    expect(countRows(store, 'domain_events')).toBe(1)
    expect(countRows(store, 'command_receipts')).toBe(1)
    expect(countRows(store, 'academic_items_current')).toBe(1)
  })
})

describe('T04 projection rebuild', () => {
  it('rebuilds core read models to an equivalent state without touching events', async () => {
    const clock = fixedClock()
    const store = createTestStore({ clock })
    cleanup.push(() => store.close())

    await createCourse(store)
    await execute(
      store,
      makeCommand(
        COMMAND.AcademicItemDiscover,
        'item-1',
        itemSnapshot as unknown as Record<string, unknown>,
        { commandId: 'discover-1' },
      ),
    )
    await execute(
      store,
      makeCommand(
        COMMAND.AcademicItemSetProgress,
        'item-1',
        { progress: { status: 'in-progress', percent: 60 } },
        { commandId: 'progress-1' },
      ),
    )
    await execute(
      store,
      makeCommand(
        COMMAND.StudyTaskCreate,
        'task-1',
        { title: 'Read chapter 2', estimateMinutes: 60, priority: 2 },
        { commandId: 'task-1' },
      ),
    )
    await execute(
      store,
      makeCommand(
        COMMAND.StudyTaskCreate,
        'task-2',
        { title: 'Problem set', estimateMinutes: 90, priority: 1 },
        { commandId: 'task-2' },
      ),
    )
    await execute(
      store,
      makeCommand(COMMAND.StudyTaskComplete, 'task-2', {}, { commandId: 'task-2-complete' }),
    )
    await execute(
      store,
      makeCommand(
        COMMAND.StudyPlanAccept,
        'plan-1',
        {
          range: {
            start: '2026-11-01T00:00:00.000Z',
            end: '2026-11-02T00:00:00.000Z',
          },
          blocks: [
            {
              taskId: 'task-1',
              start: '2026-11-01T10:00:00.000Z',
              end: '2026-11-01T11:00:00.000Z',
            },
          ],
          planner: { id: 'basic', version: '1' },
        },
        { commandId: 'plan-1' },
      ),
    )

    const range = {
      start: '2026-11-01T00:00:00.000Z',
      end: '2026-11-02T00:00:00.000Z',
    }
    const before = {
      courses: await store.queries.listCourses(),
      items: await store.queries.listAcademicItems({ status: 'all' }),
      tasks: await store.queries.listStudyTasks(),
      plan: await store.queries.getActiveStudyPlan(range),
      summary: await store.queries.getDashboardSummary(range),
    }
    const eventCount = countRows(store, 'domain_events')

    store.rebuildProjection()

    const after = {
      courses: await store.queries.listCourses(),
      items: await store.queries.listAcademicItems({ status: 'all' }),
      tasks: await store.queries.listStudyTasks(),
      plan: await store.queries.getActiveStudyPlan(range),
      summary: await store.queries.getDashboardSummary(range),
    }
    expect(after).toEqual(before)
    expect(countRows(store, 'domain_events')).toBe(eventCount)
    expect(store.health()).toMatchObject({ consistent: true, pendingEvents: 0 })
  })
})

describe('T07 deadline change keeps progress', () => {
  it('records the old deadline in the event and preserves local progress', async () => {
    const clock = fixedClock()
    const store = createTestStore({ clock })
    cleanup.push(() => store.close())

    await execute(
      store,
      makeCommand(
        COMMAND.AcademicItemDiscover,
        'item-1',
        itemSnapshot as unknown as Record<string, unknown>,
        { commandId: 'discover-1' },
      ),
    )
    await execute(
      store,
      makeCommand(
        COMMAND.AcademicItemSetProgress,
        'item-1',
        { progress: { status: 'in-progress', percent: 40 } },
        { commandId: 'progress-1' },
      ),
    )

    clock.advance(60_000)
    const updatedSnapshot = {
      ...itemSnapshot,
      title: 'Problem Set 1 (extended)',
      due: { kind: 'instant', utc: '2026-11-05T15:00:00.000Z', zone: 'Asia/Shanghai' },
      source: {
        ...itemSnapshot.source,
        sourceObservedAt: clock.now(),
        contentHash: 'hash-2',
      },
    }
    const sync = await execute(
      store,
      makeCommand(
        COMMAND.AcademicItemSync,
        'item-1',
        updatedSnapshot as unknown as Record<string, unknown>,
        { commandId: 'sync-1' },
      ),
    )
    expect(sync).toMatchObject({ ok: true, version: 4 })

    const item = await store.queries.getAcademicItem('item-1')
    expect(item).toMatchObject({
      title: 'Problem Set 1 (extended)',
      due: { kind: 'instant', utc: '2026-11-05T15:00:00.000Z' },
      progress: { status: 'in-progress', percent: 40 },
    })

    const events = await store.events.readStream('academic-item/item-1')
    expect(events.map((event) => event.type)).toEqual([
      EVENT.AcademicItemDiscovered,
      EVENT.AcademicItemProgressChanged,
      EVENT.AcademicItemDetailsChanged,
      EVENT.AcademicItemDeadlineChanged,
    ])
    const deadlineEvent = events.find(
      (event) => event.type === EVENT.AcademicItemDeadlineChanged,
    )
    expect(deadlineEvent?.payload).toMatchObject({
      from: { kind: 'instant', utc: '2026-11-01T15:00:00.000Z' },
      to: { kind: 'instant', utc: '2026-11-05T15:00:00.000Z' },
    })
  })
})
