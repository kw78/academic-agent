import { afterEach, describe, expect, it } from 'vitest'
import {
  CapabilityRegistry,
  COMMAND,
  type AcademicItemSnapshot,
} from '@academic/contracts'
import { InMemoryToolHost, registerAcademicTools, ACADEMIC_TOOL_NAMES } from '@academic/agent-tools'
import { registerPlannerCapability, ReplanStore } from '@academic/planner-basic'
import {
  countRows,
  createTestStore,
  execute,
  fixedClock,
  makeCommand,
  sequentialIds,
} from '../helpers/store.js'

const cleanup: Array<() => void> = []

afterEach(() => {
  for (const dispose of cleanup.splice(0)) dispose()
})

const range = {
  start: '2026-11-01T08:00:00.000Z',
  end: '2026-11-01T12:00:00.000Z',
}

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

async function seed(store: ReturnType<typeof createTestStore>) {
  await execute(
    store,
    makeCommand(COMMAND.CourseCreate, 'course-1', {
      termId: '2026-fall',
      code: 'CS101',
      title: 'Computer Science',
    }),
  )
  await execute(
    store,
    makeCommand(
      COMMAND.AcademicItemDiscover,
      'item-1',
      itemSnapshot as unknown as Record<string, unknown>,
    ),
  )
  await execute(
    store,
    makeCommand(COMMAND.StudyTaskCreate, 'task-1', {
      title: 'Read chapter 2',
      itemId: 'item-1',
      estimateMinutes: 60,
      dueAt: '2026-11-01T11:00:00.000Z',
      priority: 1,
    }),
  )
  await execute(
    store,
    makeCommand(COMMAND.StudyPlanAccept, 'plan-1', {
      range,
      blocks: [
        {
          taskId: 'task-1',
          start: '2026-11-01T08:00:00.000Z',
          end: '2026-11-01T09:00:00.000Z',
        },
      ],
      planner: { id: 'academic.planner.basic', version: '1.0.0' },
    }),
  )
}

function setup(options: { allowWrites: boolean; withPlanner?: boolean }) {
  const clock = fixedClock()
  const store = createTestStore({ clock })
  const registry = new CapabilityRegistry()
  const replans = new ReplanStore(store.database, clock)
  const host = new InMemoryToolHost()
  const registration = registerAcademicTools(host, {
    queries: store.queries,
    commands: store.commands,
    replans,
    registry,
    ids: sequentialIds('agent'),
    allowWrites: options.allowWrites,
  })
  const plannerCapability = options.withPlanner
    ? registerPlannerCapability(registry)
    : undefined

  cleanup.push(() => {
    registration.dispose()
    plannerCapability?.dispose()
    store.close()
  })
  return { clock, store, registry, replans, host, registration }
}

describe('academic agent tools', () => {
  it('answers read-only questions from the query API', async () => {
    const { store, host } = setup({ allowWrites: false })
    await seed(store)

    const courses = await host.call(ACADEMIC_TOOL_NAMES.ListCourses, {})
    expect(courses).toMatchObject({ ok: true })
    if (!courses.ok) throw new Error(courses.message)
    expect((courses.data as { courses: unknown[] }).courses).toHaveLength(1)

    const due = await host.call(ACADEMIC_TOOL_NAMES.ListDueItems, { limit: 10 })
    expect(due).toMatchObject({ ok: true })
    if (!due.ok) throw new Error(due.message)
    expect((due.data as { items: unknown[] }).items).toHaveLength(1)

    const item = await host.call(ACADEMIC_TOOL_NAMES.GetItem, { itemId: 'item-1' })
    expect(item).toMatchObject({ ok: true })

    const missing = await host.call(ACADEMIC_TOOL_NAMES.GetItem, { itemId: 'missing' })
    expect(missing).toMatchObject({ ok: false, code: 'NOT_FOUND' })

    const plan = await host.call(ACADEMIC_TOOL_NAMES.GetStudyPlan, {
      rangeStart: range.start,
      rangeEnd: range.end,
    })
    expect(plan).toMatchObject({ ok: true })
    if (!plan.ok) throw new Error(plan.message)
    expect((plan.data as { plan: { planId: string } | null }).plan?.planId).toBe('plan-1')
  })

  it('T16 refuses writes without permission or confirmation', async () => {
    const { store, host } = setup({ allowWrites: false })
    await seed(store)
    const before = countRows(store, 'domain_events')

    const forbidden = await host.call(ACADEMIC_TOOL_NAMES.UpdateTask, {
      taskId: 'task-1',
      action: 'complete',
      confirmed: true,
    })
    expect(forbidden).toMatchObject({ ok: false, code: 'FORBIDDEN' })
    expect(countRows(store, 'domain_events')).toBe(before)
    expect((await store.queries.getStudyTask('task-1'))?.status).toBe('active')

    const writable = setup({ allowWrites: true })
    await seed(writable.store)
    const unconfirmed = await writable.host.call(ACADEMIC_TOOL_NAMES.UpdateTask, {
      taskId: 'task-1',
      action: 'complete',
    })
    expect(unconfirmed).toMatchObject({ ok: false, code: 'CONFIRM_REQUIRED' })
    expect((await writable.store.queries.getStudyTask('task-1'))?.status).toBe('active')

    const confirmed = await writable.host.call(ACADEMIC_TOOL_NAMES.UpdateTask, {
      taskId: 'task-1',
      action: 'complete',
      confirmed: true,
    })
    expect(confirmed).toMatchObject({ ok: true })
    expect((await writable.store.queries.getStudyTask('task-1'))?.status).toBe('completed')

    const invalid = await writable.host.call(ACADEMIC_TOOL_NAMES.UpdateTask, {
      taskId: 'task-1',
      action: 'change-estimate',
      confirmed: true,
    })
    expect(invalid).toMatchObject({ ok: false, code: 'VALIDATION' })
  })

  it('requires the planner capability before queueing replans', async () => {
    const withoutPlanner = setup({ allowWrites: true })
    await seed(withoutPlanner.store)
    const unavailable = await withoutPlanner.host.call(
      ACADEMIC_TOOL_NAMES.RequestReplan,
      {
        rangeStart: range.start,
        rangeEnd: range.end,
      },
    )
    expect(unavailable).toMatchObject({
      ok: false,
      code: 'CAPABILITY_UNAVAILABLE',
    })
    expect(withoutPlanner.replans.list()).toHaveLength(0)

    const withPlanner = setup({ allowWrites: true, withPlanner: true })
    await seed(withPlanner.store)
    const queued = await withPlanner.host.call(ACADEMIC_TOOL_NAMES.RequestReplan, {
      reason: 'manual',
      rangeStart: range.start,
      rangeEnd: range.end,
    })
    expect(queued).toMatchObject({ ok: true })
    if (!queued.ok) throw new Error(queued.message)
    expect((queued.data as { replanRequestId: string }).replanRequestId).toBeTruthy()
    expect(withPlanner.replans.list()).toHaveLength(1)
  })

  it('unregisters tools on dispose', async () => {
    const { store, host, registration } = setup({ allowWrites: false })
    await seed(store)
    expect(host.list()).toHaveLength(6)
    registration.dispose()
    expect(host.list()).toHaveLength(0)
    expect(await host.call(ACADEMIC_TOOL_NAMES.ListCourses, {})).toMatchObject({
      ok: false,
      code: 'NOT_FOUND',
    })
  })
})
