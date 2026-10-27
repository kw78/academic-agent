import type {
  Due,
  LockedBlock,
  PlanBlock,
  PlannerIdentity,
  Range,
  TimeBlock,
} from '@academic/contracts'
import { deadlineForDue } from './time.js'

export const PLANNER_ID = 'academic.planner.basic'
export const PLANNER_VERSION = '1.0.0'

export interface PlannerTaskInput {
  taskId: string
  title: string
  estimateMinutes: number
  due?: Due
  dueAt?: string
  priority?: number
  status?: 'active' | 'completed'
  itemId?: string
}

export interface PlannerInput {
  range: Range
  tasks: readonly PlannerTaskInput[]
  busyBlocks?: readonly TimeBlock[]
  lockedBlocks?: readonly LockedBlock[]
  now: string
  granularityMinutes?: number
  timeZone?: string
}

export type UnscheduledReason =
  | 'deadline-passed'
  | 'insufficient-time'
  | 'no-available-time'
  | 'invalid-duration'

export interface UnscheduledTask {
  taskId: string
  title: string
  remainingMinutes: number
  reason: UnscheduledReason
}

export interface PlanSuggestion {
  planner: PlannerIdentity
  range: Range
  blocks: PlanBlock[]
  lockedBlocks: LockedBlock[]
  unscheduled: UnscheduledTask[]
  warnings: string[]
  stats: {
    taskCount: number
    scheduledMinutes: number
    unscheduledMinutes: number
  }
}

interface Interval {
  start: number
  end: number
}

function parseInterval(block: TimeBlock): Interval | undefined {
  const start = Date.parse(block.start)
  const end = Date.parse(block.end)
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return undefined
  return { start, end }
}

function subtractIntervals(base: Interval[], cuts: Interval[]): Interval[] {
  let result = base
  for (const cut of cuts) {
    const next: Interval[] = []
    for (const slot of result) {
      if (cut.end <= slot.start || cut.start >= slot.end) {
        next.push(slot)
        continue
      }
      if (cut.start > slot.start) next.push({ start: slot.start, end: cut.start })
      if (cut.end < slot.end) next.push({ start: cut.end, end: slot.end })
    }
    result = next
  }
  return result.filter((slot) => slot.end > slot.start)
}

function alignUp(value: number, step: number): number {
  return Math.ceil(value / step) * step
}

function alignDown(value: number, step: number): number {
  return Math.floor(value / step) * step
}

function taskDeadline(
  task: PlannerTaskInput,
  timeZone: string,
  warnings: string[],
): number | undefined {
  if (task.dueAt) {
    const parsed = Date.parse(task.dueAt)
    if (Number.isFinite(parsed)) return parsed
    warnings.push(`${task.title}: invalid dueAt ${task.dueAt}; ignoring the deadline`)
    return undefined
  }
  if (!task.due) return undefined
  const result = deadlineForDue(task.due, timeZone)
  if (result.warning) warnings.push(`${task.title}: ${result.warning}`)
  return result.deadline ? Date.parse(result.deadline) : undefined
}

/**
 * Deterministic heuristic: filter completed tasks, order by deadline/priority,
 * subtract fixed and locked time, then fill the remaining slots in order.
 * No model calls, network access or side effects.
 */
export function buildPlan(input: PlannerInput): PlanSuggestion {
  const warnings: string[] = []
  const rangeStart = Date.parse(input.range.start)
  const rangeEnd = Date.parse(input.range.end)
  if (!Number.isFinite(rangeStart) || !Number.isFinite(rangeEnd) || rangeEnd <= rangeStart) {
    throw new Error('Invalid planning range')
  }
  const nowMs = Math.max(Date.parse(input.now), rangeStart)
  if (!Number.isFinite(nowMs)) throw new Error('Invalid planning time')
  const granularity = Math.min(60, Math.max(5, Math.trunc(input.granularityMinutes ?? 15)))
  const step = granularity * 60_000
  const timeZone = input.timeZone ?? 'UTC'

  const cuts = [...(input.busyBlocks ?? []), ...(input.lockedBlocks ?? [])]
    .map((block) => parseInterval(block))
    .filter((interval): interval is Interval => interval !== undefined)

  const slots = subtractIntervals([{ start: rangeStart, end: rangeEnd }], cuts)
    .map((slot) => ({ start: Math.max(slot.start, nowMs), end: slot.end }))
    .filter((slot) => slot.end > slot.start)
    .map((slot) => ({ start: alignUp(slot.start, step), end: alignDown(slot.end, step) }))
    .filter((slot) => slot.end - slot.start >= 60_000)
    .sort((left, right) => left.start - right.start)

  const blocks: PlanBlock[] = []
  const unscheduled: UnscheduledTask[] = []
  let scheduledMinutes = 0
  let unscheduledMinutes = 0

  const tasks = input.tasks
    .filter((task) => task.status !== 'completed')
    .map((task) => ({ ...task, deadline: taskDeadline(task, timeZone, warnings) }))
    .sort(
      (left, right) =>
        (left.deadline ?? Number.POSITIVE_INFINITY) -
          (right.deadline ?? Number.POSITIVE_INFINITY) ||
        (right.priority ?? 0) - (left.priority ?? 0) ||
        left.taskId.localeCompare(right.taskId),
    )

  for (const task of tasks) {
    const estimate = Math.trunc(task.estimateMinutes)
    if (!Number.isFinite(estimate) || estimate <= 0) {
      unscheduled.push({
        taskId: task.taskId,
        title: task.title,
        remainingMinutes: Math.max(0, estimate || 0),
        reason: 'invalid-duration',
      })
      warnings.push(`${task.title}: estimate must be a positive number of minutes`)
      continue
    }

    if (task.deadline !== undefined && task.deadline <= nowMs) {
      unscheduledMinutes += estimate
      unscheduled.push({
        taskId: task.taskId,
        title: task.title,
        remainingMinutes: estimate,
        reason: 'deadline-passed',
      })
      warnings.push(`${task.title}: deadline has already passed`)
      continue
    }

    let remaining = estimate
    let allocatedAny = false
    for (const slot of slots) {
      if (remaining <= 0) break
      if (slot.end <= slot.start) continue
      if (task.deadline !== undefined && slot.start >= task.deadline) break

      const start = Math.max(slot.start, nowMs)
      const end = Math.min(slot.end, task.deadline ?? slot.end)
      const availableMinutes = Math.floor((end - start) / 60_000)
      if (availableMinutes <= 0) continue

      const maximum = Math.min(remaining, availableMinutes)
      const take =
        remaining <= granularity
          ? maximum
          : Math.min(remaining, Math.floor(maximum / granularity) * granularity)
      if (take <= 0) continue

      const blockEnd = start + take * 60_000
      blocks.push({
        taskId: task.taskId,
        start: new Date(start).toISOString(),
        end: new Date(blockEnd).toISOString(),
      })
      scheduledMinutes += take
      remaining -= take
      allocatedAny = true
      slot.start = alignUp(blockEnd, step)
    }

    if (remaining > 0) {
      unscheduledMinutes += remaining
      unscheduled.push({
        taskId: task.taskId,
        title: task.title,
        remainingMinutes: remaining,
        reason: allocatedAny ? 'insufficient-time' : 'no-available-time',
      })
      warnings.push(`${task.title}: ${remaining} minutes could not be scheduled`)
    }
  }

  blocks.sort(
    (left, right) =>
      Date.parse(left.start) - Date.parse(right.start) ||
      Date.parse(left.end) - Date.parse(right.end),
  )
  const lockedBlocks = [...(input.lockedBlocks ?? [])].sort(
    (left, right) =>
      Date.parse(left.start) - Date.parse(right.start) ||
      Date.parse(left.end) - Date.parse(right.end),
  )

  return {
    planner: { id: PLANNER_ID, version: PLANNER_VERSION },
    range: input.range,
    blocks,
    lockedBlocks,
    unscheduled,
    warnings,
    stats: {
      taskCount: tasks.length,
      scheduledMinutes,
      unscheduledMinutes,
    },
  }
}
