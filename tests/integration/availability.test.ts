import { afterEach, describe, expect, it } from 'vitest'
import {
  CapabilityRegistry,
  COMMAND,
  type Range,
} from '@academic/contracts'
import {
  AvailabilityStore,
  computeUnavailableBlocks,
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

const monday: Range = {
  start: '2026-11-02T08:00:00.000Z',
  end: '2026-11-02T12:00:00.000Z',
}

function setup() {
  const clock = fixedClock()
  const store = createTestStore({ clock })
  const availability = new AvailabilityStore(store.database, clock)
  const preferences = new PreferenceStore(store.database, clock)
  const registry = new CapabilityRegistry()
  const replans = new ReplanStore(store.database, clock)
  const planner = new PlannerService({
    registry,
    queries: store.queries,
    commands: store.commands,
    replans,
    availability,
    preferences,
    clock,
    ids: sequentialIds('availability'),
  })
  registerPlannerCapability(registry)
  cleanup.push(() => store.close())
  return { clock, store, availability, preferences, planner }
}

async function addTask(store: ReturnType<typeof createTestStore>) {
  expect(
    await execute(
      store,
      makeCommand(COMMAND.StudyTaskCreate, 'task-1', {
        title: 'Read chapter 2',
        estimateMinutes: 60,
        dueAt: '2026-11-02T13:00:00.000Z',
        priority: 1,
      }),
    ),
  ).toMatchObject({ ok: true })
}

function utcMondayNineToTen(availability: AvailabilityStore) {
  availability.update({
    timeZone: 'UTC',
    weeklySlots: [{ weekday: 1, start: '09:00', end: '10:00' }],
    temporaryBlocks: [],
    granularityMinutes: 15,
  })
}

describe('FIX-05 user availability', () => {
  it('derives unavailable time from weekly slots and creates a conservative default', () => {
    const { store, availability } = setup()
    const defaults = availability.get()
    expect(defaults.weeklySlots.length).toBeGreaterThan(0)
    expect(defaults.granularityMinutes).toBeGreaterThanOrEqual(5)

    utcMondayNineToTen(availability)
    const unavailable = computeUnavailableBlocks(monday, availability.get())
    expect(unavailable).toEqual([
      {
        start: '2026-11-02T08:00:00.000Z',
        end: '2026-11-02T09:00:00.000Z',
      },
      {
        start: '2026-11-02T10:00:00.000Z',
        end: '2026-11-02T12:00:00.000Z',
      },
    ])
    void store
  })

  it('plans only inside weekly availability and excludes temporary blocks', async () => {
    const { clock, store, availability, planner } = setup()
    utcMondayNineToTen(availability)
    await addTask(store)

    const first = await planner.preview({
      range: monday,
      now: '2026-11-02T08:00:00.000Z',
    })
    expect(first.blocks).toEqual([
      {
        taskId: 'task-1',
        start: '2026-11-02T09:00:00.000Z',
        end: '2026-11-02T10:00:00.000Z',
      },
    ])

    availability.addTemporaryBlock({
      id: 'temp-1',
      title: 'Doctor appointment',
      start: '2026-11-02T09:00:00.000Z',
      end: '2026-11-02T09:30:00.000Z',
    })
    const second = await planner.preview({
      range: monday,
      now: '2026-11-02T08:00:00.000Z',
    })
    expect(second.blocks).toEqual([
      {
        taskId: 'task-1',
        start: '2026-11-02T09:30:00.000Z',
        end: '2026-11-02T10:00:00.000Z',
      },
    ])
    expect(second.unscheduled).toEqual([
      expect.objectContaining({ taskId: 'task-1', remainingMinutes: 30 }),
    ])
    void clock
  })

  it('converts weekly local slots through the configured time zone', async () => {
    const { store, availability, planner } = setup()
    availability.update({
      timeZone: 'Asia/Shanghai',
      weeklySlots: [{ weekday: 1, start: '19:00', end: '20:00' }],
      temporaryBlocks: [],
      granularityMinutes: 15,
    })
    await addTask(store)

    const suggestion = await planner.preview({
      range: {
        start: '2026-11-02T10:00:00.000Z',
        end: '2026-11-02T13:00:00.000Z',
      },
      now: '2026-11-02T10:00:00.000Z',
    })
    expect(suggestion.blocks).toEqual([
      {
        taskId: 'task-1',
        start: '2026-11-02T11:00:00.000Z',
        end: '2026-11-02T12:00:00.000Z',
      },
    ])
  })

  it('rejects invalid time zones and overlapping temporary blocks', () => {
    const { availability } = setup()
    expect(() => availability.update({ timeZone: 'Not/AZone' })).toThrow()
    availability.addTemporaryBlock({
      id: 'temp-1',
      start: '2026-11-02T09:00:00.000Z',
      end: '2026-11-02T10:00:00.000Z',
    })
    expect(() =>
      availability.addTemporaryBlock({
        id: 'temp-2',
        start: '2026-11-02T09:30:00.000Z',
        end: '2026-11-02T10:30:00.000Z',
      }),
    ).toThrow(/overlap/i)
  })
})
