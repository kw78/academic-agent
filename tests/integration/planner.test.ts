import { afterEach, describe, expect, it } from 'vitest'
import {
  CapabilityRegistry,
  CapabilityUnavailableError,
  COMMAND,
  type Range,
} from '@academic/contracts'
import {
  AvailabilityStore,
  PlannerService,
  PreferenceStore,
  registerPlannerCapability,
  ReplanStore,
} from '@academic/planner-basic'
import {
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

const range: Range = {
  start: '2026-11-01T08:00:00.000Z',
  end: '2026-11-01T12:00:00.000Z',
}

const planNow = '2026-11-01T08:00:00.000Z'

function allDayAvailability(
  db: ReturnType<typeof createTestStore>['database'],
  clock: ReturnType<typeof fixedClock>,
) {
  const availability = new AvailabilityStore(db, clock)
  availability.update({
    timeZone: 'UTC',
    weeklySlots: Array.from({ length: 7 }, (_, weekday) => ({
      weekday,
      start: '00:00',
      end: '23:59',
    })),
    temporaryBlocks: [],
    granularityMinutes: 15,
  })
  return availability
}

function setup() {
  const clock = fixedClock()
  const store = createTestStore({ clock })
  const registry = new CapabilityRegistry()
  const replans = new ReplanStore(store.database, clock)
  const availability = allDayAvailability(store.database, clock)
  const preferences = new PreferenceStore(store.database, clock)
  const planner = new PlannerService({
    registry,
    queries: store.queries,
    commands: store.commands,
    replans,
    availability,
    preferences,
    clock,
    ids: sequentialIds('planner'),
  })
  const capability = registerPlannerCapability(registry)
  cleanup.push(() => {
    capability.dispose()
    store.close()
  })
  return { clock, store, registry, replans, planner, capability, preferences }
}

async function createTask(store: ReturnType<typeof createTestStore>) {
  expect(
    await execute(
      store,
      makeCommand(COMMAND.StudyTaskCreate, 'task-1', {
        title: 'Read chapter 2',
        estimateMinutes: 60,
        dueAt: '2026-11-01T11:00:00.000Z',
        priority: 1,
      }),
    ),
  ).toMatchObject({ ok: true })
}

function planCount(store: ReturnType<typeof createTestStore>): number {
  const row = store.database
    .prepare('SELECT COUNT(*) AS count FROM study_plans_current')
    .get() as { count: number }
  return Number(row.count)
}

describe('T08 planner capability lifecycle', () => {
  it('returns capability unavailable after the planner is disposed', async () => {
    const clock = fixedClock()
    const store = createTestStore({ clock })
    const registry = new CapabilityRegistry()
    const replans = new ReplanStore(store.database, clock)
    const planner = new PlannerService({
      registry,
      queries: store.queries,
      commands: store.commands,
      replans,
      availability: allDayAvailability(store.database, clock),
      preferences: new PreferenceStore(store.database, clock),
      clock,
      ids: sequentialIds('planner'),
    })
    const registration = registerPlannerCapability(registry)
    cleanup.push(() => store.close())

    await createTask(store)
    const suggestion = await planner.preview({ range, now: planNow })
    expect(await planner.accept(suggestion)).toMatchObject({ ok: true })
    const planBefore = await store.queries.getActiveStudyPlan(range)

    registration.dispose()

    expect(() =>
      planner.plan({
        range,
        now: planNow,
        tasks: [{ taskId: 'x', title: 'X', estimateMinutes: 30 }],
      }),
    ).toThrow(CapabilityUnavailableError)
    await expect(planner.preview({ range, now: planNow })).rejects.toThrow(
      /academic\.planner\.basic/,
    )
    await expect(planner.processReplanRequest('missing')).rejects.toThrow(
      CapabilityUnavailableError,
    )

    expect(await store.queries.getActiveStudyPlan(range)).toEqual(planBefore)
  })
})

describe('T09 replanning deduplication', () => {
  it('coalesces pending requests and never creates a second plan for the same request', async () => {
    const { store, registry, replans, planner, capability } = setup()
    await createTask(store)

    const first = replans.enqueue({
      replanRequestId: 'req-1',
      reason: 'manual',
      range,
    })
    const duplicate = replans.enqueue({
      replanRequestId: 'req-1',
      reason: 'manual',
      range,
    })
    expect(duplicate.replanRequestId).toBe(first.replanRequestId)
    expect(replans.list()).toHaveLength(1)
    expect(planCount(store)).toBe(0)

    const suggested = await planner.processReplanRequest('req-1', {
      now: planNow,
    })
    expect(suggested.suggestion.blocks).toHaveLength(1)
    expect(suggested.request.status).toBe('suggested')
    expect(planCount(store)).toBe(0)

    const repeated = await planner.processReplanRequest('req-1', {
      now: planNow,
    })
    expect(repeated.suggestion).toEqual(suggested.suggestion)
    expect(planCount(store)).toBe(0)

    const accepted = await planner.processReplanRequest('req-1', {
      now: planNow,
      accept: true,
    })
    expect(accepted.command).toMatchObject({ ok: true })
    expect(accepted.planId).toBeDefined()
    expect(accepted.request.status).toBe('accepted')
    expect(planCount(store)).toBe(1)

    const cached = await planner.processReplanRequest('req-1', {
      now: planNow,
    })
    expect(cached.planId).toBe(accepted.planId)
    expect(planCount(store)).toBe(1)

    capability.dispose()
    const afterReEnable = registerPlannerCapability(registry)
    cleanup.push(() => afterReEnable.dispose())
    const reenabled = await planner.processReplanRequest('req-1', {
      now: planNow,
    })
    expect(reenabled.planId).toBe(accepted.planId)
    expect(planCount(store)).toBe(1)
  })
})
