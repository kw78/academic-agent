import type { Due, ItemProgress, Range, TimeBlock } from './primitives.js'

export const AGGREGATE_KINDS = ['course', 'academic-item', 'study-task', 'study-plan'] as const
export type AggregateKind = (typeof AGGREGATE_KINDS)[number]

const STREAM_PREFIX: Record<AggregateKind, string> = {
  course: 'course',
  'academic-item': 'academic-item',
  'study-task': 'study-task',
  'study-plan': 'study-plan',
}

export function streamIdFor(kind: AggregateKind, aggregateId: string): string {
  return `${STREAM_PREFIX[kind]}/${aggregateId}`
}

export interface CourseSource {
  sourceId: string
  externalCourseId: string
}

export interface CourseState {
  courseId: string
  termId: string
  code: string
  title: string
  archived: boolean
  source?: CourseSource
  createdAt: string
  updatedAt: string
  version: number
}

export interface AcademicItemSource {
  sourceId: string
  externalItemId?: string
  sourceUpdatedAt?: string
  sourceObservedAt: string
  contentHash: string
}

export interface AcademicItemState {
  itemId: string
  courseId: string
  kind: 'assignment' | 'exam' | 'quiz'
  title: string
  description?: string
  due: Due
  sourceUrl?: string
  source: AcademicItemSource
  progress: ItemProgress
  archived: boolean
  createdAt: string
  updatedAt: string
  version: number
}

export const STUDY_TASK_STATUSES = ['active', 'completed'] as const
export type StudyTaskStatus = (typeof STUDY_TASK_STATUSES)[number]

export interface StudyTaskState {
  taskId: string
  title: string
  itemId?: string
  estimateMinutes: number
  dueAt?: string
  priority: number
  status: StudyTaskStatus
  completedAt?: string
  createdAt: string
  updatedAt: string
  version: number
}

export const STUDY_PLAN_STATUSES = ['active', 'archived'] as const
export type StudyPlanStatus = (typeof STUDY_PLAN_STATUSES)[number]

export interface PlannerIdentity {
  id: string
  version: string
}

export interface PlanBlock extends TimeBlock {
  taskId: string
}

export interface LockedBlock extends TimeBlock {
  id: string
  title?: string
}

export interface StudyPlanState {
  planId: string
  status: StudyPlanStatus
  range: Range
  blocks: PlanBlock[]
  lockedBlocks: LockedBlock[]
  planner: PlannerIdentity
  replanRequestId?: string
  acceptedAt: string
  updatedAt: string
  version: number
}
