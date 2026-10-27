import type { Due, ItemProgress, Range, TimeBlock } from './primitives.js'
import type {
  AcademicItemSource,
  CourseSource,
  LockedBlock,
  PlanBlock,
  PlannerIdentity,
  StudyPlanStatus,
  StudyTaskStatus,
} from './domain.js'
import type { SyncRunSummary } from './connector.js'

export interface QueryMeta {
  projectionPosition: number
  generatedAt: string
}

export interface Page<T> {
  items: T[]
  nextCursor?: string
  meta: QueryMeta
}

export interface CourseView {
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

export interface AcademicItemView {
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

export interface ListAcademicItemsParams {
  courseId?: string
  sourceId?: string
  dueBefore?: string
  status?: 'active' | 'archived' | 'all'
  limit?: number
  cursor?: string
}

export interface StudyTaskView {
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

export interface ListStudyTasksParams {
  from?: string
  to?: string
  status?: StudyTaskStatus | 'all'
}

export interface StudyPlanView {
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

export interface DashboardSummary {
  range: Range
  itemsDue: number
  itemsOverdue: number
  activeTasks: number
  completedTasks: number
  plannedMinutes: number
  planId?: string
  meta: QueryMeta
}

export interface QueryApi {
  listCourses(termId?: string): Promise<Page<CourseView>>
  getCourse(courseId: string): Promise<(CourseView & { meta: QueryMeta }) | undefined>
  getCourseBySource(
    sourceId: string,
    externalCourseId: string,
  ): Promise<(CourseView & { meta: QueryMeta }) | undefined>
  listAcademicItems(params?: ListAcademicItemsParams): Promise<Page<AcademicItemView>>
  getAcademicItem(
    itemId: string,
  ): Promise<(AcademicItemView & { meta: QueryMeta }) | undefined>
  getAcademicItemBySource(
    sourceId: string,
    externalItemId: string,
  ): Promise<(AcademicItemView & { meta: QueryMeta }) | undefined>
  listStudyTasks(params?: ListStudyTasksParams): Promise<Page<StudyTaskView>>
  getStudyTask(
    taskId: string,
  ): Promise<(StudyTaskView & { meta: QueryMeta }) | undefined>
  getActiveStudyPlan(range: Range): Promise<(StudyPlanView & { meta: QueryMeta }) | undefined>
  getLatestStudyPlan(): Promise<(StudyPlanView & { meta: QueryMeta }) | undefined>
  getDashboardSummary(range: Range): Promise<DashboardSummary>
  listSyncRuns(sourceId?: string, limit?: number): Promise<Page<SyncRunSummary>>
}

export interface PlannerTimeConstraint extends TimeBlock {
  id: string
  title?: string
}
