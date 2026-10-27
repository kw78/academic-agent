import { describe, expect, it } from 'vitest'
import type { PlanBlock, TimeBlock } from '@academic/contracts'
import { buildPlan, endOfDayUtc } from '@academic/planner-basic'

const range = {
  start: '2026-11-01T08:00:00.000Z',
  end: '2026-11-01T12:00:00.000Z',
}
const now = '2026-11-01T08:00:00.000Z'

function overlaps(left: TimeBlock, right: TimeBlock): boolean {
  return (
    Date.parse(left.start) < Date.parse(right.end) &&
    Date.parse(right.start) < Date.parse(left.end)
  )
}

function expectNoOverlaps(blocks: PlanBlock[], excluded: TimeBlock[]) {
  for (let index = 0; index < blocks.length; index += 1) {
    for (let other = index + 1; other < blocks.length; other += 1) {
      expect(overlaps(blocks[index]!, blocks[other]!)).toBe(false)
    }
    for (const block of excluded) {
      expect(overlaps(blocks[index]!, block)).toBe(false)
    }
  }
}

describe('deterministic planner', () => {
  it('orders by deadline and fills slots without overlaps', () => {
    const suggestion = buildPlan({
      range,
      now,
      granularityMinutes: 15,
      tasks: [
        {
          taskId: 'b',
          title: 'Task B',
          estimateMinutes: 60,
          dueAt: '2026-11-01T11:00:00.000Z',
          priority: 1,
        },
        {
          taskId: 'a',
          title: 'Task A',
          estimateMinutes: 120,
          dueAt: '2026-11-01T10:00:00.000Z',
          priority: 0,
        },
      ],
    })

    expect(suggestion.blocks).toEqual([
      {
        taskId: 'a',
        start: '2026-11-01T08:00:00.000Z',
        end: '2026-11-01T10:00:00.000Z',
      },
      {
        taskId: 'b',
        start: '2026-11-01T10:00:00.000Z',
        end: '2026-11-01T11:00:00.000Z',
      },
    ])
    expect(suggestion.unscheduled).toEqual([])
    expect(suggestion.stats).toMatchObject({
      taskCount: 2,
      scheduledMinutes: 180,
      unscheduledMinutes: 0,
    })
    expectNoOverlaps(suggestion.blocks, [])
  })

  it('excludes busy time, locked time and the past', () => {
    const busy = [
      { start: '2026-11-01T08:00:00.000Z', end: '2026-11-01T09:00:00.000Z' },
    ]
    const locked = [
      {
        id: 'lock-1',
        title: 'Lab',
        start: '2026-11-01T09:30:00.000Z',
        end: '2026-11-01T10:00:00.000Z',
      },
    ]
    const suggestion = buildPlan({
      range,
      now,
      granularityMinutes: 15,
      busyBlocks: busy,
      lockedBlocks: locked,
      tasks: [
        {
          taskId: 'a',
          title: 'Task A',
          estimateMinutes: 120,
        },
      ],
    })

    expect(suggestion.blocks).toEqual([
      {
        taskId: 'a',
        start: '2026-11-01T09:00:00.000Z',
        end: '2026-11-01T09:30:00.000Z',
      },
      {
        taskId: 'a',
        start: '2026-11-01T10:00:00.000Z',
        end: '2026-11-01T11:30:00.000Z',
      },
    ])
    expectNoOverlaps(suggestion.blocks, [...busy, ...locked])
    expect(suggestion.lockedBlocks).toEqual(locked)
  })

  it('plans date-only deadlines against end of day in the source zone', () => {
    const suggestion = buildPlan({
      range: {
        start: '2026-11-10T14:00:00.000Z',
        end: '2026-11-10T16:30:00.000Z',
      },
      now: '2026-11-10T14:00:00.000Z',
      timeZone: 'Asia/Shanghai',
      granularityMinutes: 15,
      tasks: [
        {
          taskId: 'exam',
          title: 'Midterm',
          estimateMinutes: 60,
          due: { kind: 'local-date', date: '2026-11-10', zone: 'Asia/Shanghai' },
        },
      ],
    })

    const deadline = endOfDayUtc('2026-11-10', 'Asia/Shanghai')
    expect(deadline).toBe('2026-11-10T15:59:59.999Z')
    expect(suggestion.blocks).toHaveLength(1)
    expect(Date.parse(suggestion.blocks[0]!.end)).toBeLessThanOrEqual(
      Date.parse(deadline),
    )
    expect(suggestion.warnings.some((warning) => warning.includes('date-only'))).toBe(true)
  })

  it('reports insufficient and passed deadlines explicitly', () => {
    const suggestion = buildPlan({
      range: { start: range.start, end: '2026-11-01T09:00:00.000Z' },
      now,
      tasks: [
        {
          taskId: 'long',
          title: 'Long task',
          estimateMinutes: 120,
        },
        {
          taskId: 'late',
          title: 'Late task',
          estimateMinutes: 30,
          dueAt: '2026-11-01T07:00:00.000Z',
        },
      ],
    })

    expect(suggestion.blocks).toEqual([
      {
        taskId: 'long',
        start: '2026-11-01T08:00:00.000Z',
        end: '2026-11-01T09:00:00.000Z',
      },
    ])
    expect(suggestion.unscheduled).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ taskId: 'long', reason: 'insufficient-time' }),
        expect.objectContaining({ taskId: 'late', reason: 'deadline-passed' }),
      ]),
    )
  })

  it('is deterministic for the same input', () => {
    const input = {
      range,
      now,
      tasks: [
        { taskId: 'a', title: 'A', estimateMinutes: 45, priority: 1 },
        { taskId: 'b', title: 'B', estimateMinutes: 30, priority: 2 },
      ],
    }
    expect(buildPlan(input)).toEqual(buildPlan(input))
  })
})
