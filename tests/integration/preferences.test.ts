import { afterEach, describe, expect, it } from 'vitest'
import { buildPlan, PreferenceStore } from '@academic/planner-basic'
import { createTestStore, fixedClock } from '../helpers/store.js'

const cleanup: Array<() => void> = []

afterEach(() => {
  for (const dispose of cleanup.splice(0)) dispose()
})

describe('user preferences', () => {
  it('persists course priorities across store instances', () => {
    const clock = fixedClock()
    const store = createTestStore({ clock })
    cleanup.push(() => store.close())
    const preferences = new PreferenceStore(store.database, clock)

    expect(preferences.get().coursePriorities).toEqual({})
    expect(preferences.get().agentAdapterAutomation).toBe(false)
    const updated = preferences.update({
      coursePriorities: { 'course-1': 3, 'course-2': 1 },
      agentAdapterAutomation: true,
    })
    expect(updated.coursePriorities).toEqual({ 'course-1': 3, 'course-2': 1 })
    expect(updated.agentAdapterAutomation).toBe(true)

    const reopened = new PreferenceStore(store.database, clock)
    expect(reopened.get().coursePriorities).toEqual({
      'course-1': 3,
      'course-2': 1,
    })
    expect(reopened.get().agentAdapterAutomation).toBe(true)
  })

  it('explains overloaded plans with available time', () => {
    const suggestion = buildPlan({
      range: {
        start: '2026-11-01T08:00:00.000Z',
        end: '2026-11-01T10:00:00.000Z',
      },
      now: '2026-11-01T08:00:00.000Z',
      timeZone: 'UTC',
      granularityMinutes: 15,
      tasks: ['a', 'b', 'c'].map((suffix) => ({
        taskId: `task-${suffix}`,
        title: `Task ${suffix}`,
        estimateMinutes: 60,
        priority: 1,
      })),
    })

    expect(suggestion.stats.availableMinutes).toBe(120)
    expect(suggestion.stats.scheduledMinutes).toBe(120)
    expect(suggestion.stats.unscheduledMinutes).toBe(60)
    expect(suggestion.unscheduled).toHaveLength(1)
    expect(suggestion.unscheduled[0]?.reason).toBe('no-available-time')
    expect(suggestion.warnings.join(' ')).toMatch(/可用时间不足/)
  })

  it('uses course priority only after explicit task priority', () => {
    const suggestion = buildPlan({
      range: {
        start: '2026-11-01T08:00:00.000Z',
        end: '2026-11-01T12:00:00.000Z',
      },
      now: '2026-11-01T08:00:00.000Z',
      timeZone: 'UTC',
      granularityMinutes: 15,
      tasks: [
        {
          taskId: 'low-course',
          title: 'Low course',
          estimateMinutes: 60,
          priority: 1,
          coursePriority: 0,
        },
        {
          taskId: 'high-course',
          title: 'High course',
          estimateMinutes: 60,
          priority: 1,
          coursePriority: 3,
        },
        {
          taskId: 'explicit',
          title: 'Explicit task priority',
          estimateMinutes: 60,
          priority: 2,
          coursePriority: 0,
        },
      ],
    })

    expect(suggestion.blocks[0]?.taskId).toBe('explicit')
    expect(suggestion.blocks[1]?.taskId).toBe('high-course')
    expect(suggestion.blocks[2]?.taskId).toBe('low-course')
  })
})
