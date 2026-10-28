import type {
  AcademicItemView,
  AdapterCandidateReport,
  AdapterCandidateSummary,
  AdapterSample,
  ConnectionView,
  CourseView,
  Due,
  LockedBlock,
  PlanBlock,
  Range,
  StudyPlanView,
  StudyTaskView,
  SyncRunSummary,
  SourceEngineDescriptor,
} from '@academic/contracts'

export type {
  AdapterCandidateSummary,
  SourceProbeEvidence,
  SourceProbeLink,
} from '@academic/contracts'

export type UiErrorCode =
  | 'UNAVAILABLE'
  | 'VALIDATION'
  | 'CONFLICT'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'AUTH_REQUIRED'
  | 'CAPABILITY_UNAVAILABLE'
  | 'ERROR'

export interface UiFailure {
  code: UiErrorCode
  message: string
}

export type UiResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: UiFailure }

export interface HostStatus {
  host: 'connected'
  version: string
  generatedAt: string
  plannerAvailable: boolean
  notificationAvailable: boolean
}

export interface TaskCard {
  task: StudyTaskView
  item?: AcademicItemView
  course?: CourseView
  effectiveDue?: Due
  dueSource: 'task' | 'item' | 'none'
  planned: boolean
}

export interface ItemCard {
  item: AcademicItemView
  course?: CourseView
}

export interface NotificationCard {
  notificationId: string
  type: string
  title: string
  body: string
  createdAt: string
  readAt?: string
}

export type SourceConfigurationState = 'configured' | 'disabled' | 'archived'

export type SourceAuthenticationState =
  | 'not-required'
  | 'missing'
  | 'saved'
  | 'verified'
  | 'expired'
  | 'rejected'

export type SourceSyncHealth =
  | 'never-synced'
  | 'running'
  | 'healthy'
  | 'partial'
  | 'auth-required'
  | 'failed'
  | 'stale'

export type SourceStage =
  | 'archived'
  | 'disabled'
  | 'unsupported'
  | 'login-required'
  | 'login-saved'
  | 'verified'
  | 'ready'
  | 'syncing'
  | 'degraded'
  | 'failed'
  | 'enabled'

export type SourceNextAction =
  | 'login'
  | 'verify'
  | 'sync'
  | 'fix'
  | 'none'

export interface SourceNextStep {
  action: SourceNextAction
  label: string
  reason?: string
}

export interface SourceStatus {
  sourceId: string
  displayName: string
  engine: string
  engineKnown: boolean
  syncAvailable: boolean
  canLogin: boolean
  canVerify: boolean
  loginMode?: 'browser' | 'manual'
  capabilities: string[]
  config: Record<string, unknown>
  enabled: boolean
  version: number
  adapterAvailable: boolean
  adapterReady: boolean
  authKind: 'password' | 'token' | 'oauth' | 'none' | 'unknown'
  configuration: SourceConfigurationState
  authentication: SourceAuthenticationState
  syncHealth: SourceSyncHealth
  state:
    | 'unconfigured'
    | 'configured'
    | 'connected'
    | 'auth-required'
    | 'error'
    | 'disconnected'
    | 'unavailable'
    | 'degraded'
  stage: SourceStage
  nextStep: SourceNextStep
  connection?: ConnectionView
  lastSync?: SyncRunSummary
  detail?: string
}

export interface AdapterCandidateManifestRequest {
  manifest: unknown
  samples: AdapterSample[]
}

export interface AdapterCandidateVersionRequest {
  adapterId: string
  version?: string
}

export interface AdapterCandidateValidationView {
  report: AdapterCandidateReport
}

export interface AdapterCandidateRegistrationView {
  candidate: AdapterCandidateSummary
  report: AdapterCandidateReport
}

export interface AdapterCandidateActivationView {
  candidate: AdapterCandidateSummary
  source?: SourceStatus
  warning?: string
}

export interface AdapterCandidatesView {
  candidates: AdapterCandidateSummary[]
  active: Array<{ adapterId: string; active?: string }>
}

export interface DashboardView {
  generatedAt: string
  range: Range
  timeZone: string
  counts: {
    activeTasks: number
    overdueTasks: number
    unreadNotifications: number
    unscheduledTasks: number
    itemsDueSoon: number
  }
  todayTasks: TaskCard[]
  upcoming: ItemCard[]
  recentChanges: ItemCard[]
  todayBlocks: Array<{ block: PlanBlock; task?: StudyTaskView }>
  plan?: StudyPlanView
  unread: NotificationCard[]
  connections: ConnectionView[]
  sources: SourceStatus[]
  lastSync?: SyncRunSummary
  lastSuccessfulSync?: SyncRunSummary
  syncHealth: 'ok' | 'stale' | 'failed' | 'auth-required' | 'degraded' | 'unknown'
  plannerAvailable: boolean
  projection: { projectionPosition: number; generatedAt: string }
}

export interface CoursesView {
  courses: CourseView[]
  items: ItemCard[]
  projection: { projectionPosition: number; generatedAt: string }
}

export interface TasksView {
  cards: TaskCard[]
  courses: CourseView[]
  items: ItemCard[]
  planBlocks: PlanBlock[]
  truncated: boolean
  timeZone: string
  generatedAt: string
}

export interface PlanCandidate {
  previewId: string
  planner: { id: string; version: string }
  range: Range
  blocks: PlanBlock[]
  lockedBlocks: LockedBlock[]
  unscheduled: Array<{
    taskId: string
    title: string
    remainingMinutes: number
    reason: string
  }>
  warnings: string[]
  stats: {
    taskCount: number
    scheduledMinutes: number
    unscheduledMinutes: number
  }
}

export interface PlanView {
  plan?: StudyPlanView
  plannerAvailable: boolean
  availability: AvailabilityView
  tasks: TaskCard[]
  generatedAt: string
}

export interface AvailabilityView {
  timeZone: string
  weeklySlots: Array<{ weekday: number; start: string; end: string }>
  temporaryBlocks: LockedBlock[]
  granularityMinutes: number
  updatedAt: string
}

export interface ConnectionsView {
  sources: SourceStatus[]
  connections: ConnectionView[]
  courses: CourseView[]
  syncRuns: SyncRunSummary[]
  engines: SourceEngineDescriptor[]
  generatedAt: string
}

export interface AutomationJob {
  jobId: string
  kind: string
  enabled: boolean
  nextRunAt: string
  intervalMinutes: number
  consecutiveFailures: number
  updatedAt: string
}

export interface AutomationRun {
  runId: string
  jobId: string
  kind: string
  status: string
  startedAt: string
  finishedAt?: string
  attempt: number
  errorCode?: string
  errorMessage?: string
}

export interface AutomationView {
  jobs: AutomationJob[]
  jobRuns: AutomationRun[]
  syncRuns: SyncRunSummary[]
  notifications: NotificationCard[]
  unread: number
  reminderSettings: { enabled: boolean; thresholdsHours: number[]; updatedAt: string }
  timeZone: string
  projection: {
    eventPosition: number
    projectionPosition: number
    pendingEvents: number
    consistent: boolean
  }
  generatedAt: string
}

export interface SettingsView {
  availability: AvailabilityView
  reminders: { enabled: boolean; thresholdsHours: number[]; updatedAt: string }
  sync: {
    jobId: string
    enabled: boolean
    intervalMinutes: number
    nextRunAt?: string
  }
  plannerAvailable: boolean
  generatedAt: string
}

export interface CommandReceipt {
  aggregateId: string
  version: number
  eventIds: string[]
}

export interface PlanMutationResult {
  receipt?: CommandReceipt
  plan?: StudyPlanView
  removedBlocks?: PlanBlock[]
}

export interface DashboardRequest {
  now?: string
}

export interface ItemsRequest {
  courseId?: string
  sourceId?: string
  dueBefore?: string
  status?: 'active' | 'archived' | 'all'
  limit?: number
  cursor?: string
}

export interface TasksRequest {
  status?: 'active' | 'completed' | 'all'
}

export interface PreviewPlanRequest {
  start: string
  end: string
}

export interface AcceptPlanRequest {
  previewId: string
}

export interface LockBlockRequest {
  start: string
  end: string
  title?: string
}

export interface UnlockBlockRequest {
  lockId: string
}

export interface UpdateAvailabilityRequest {
  timeZone?: string
  weeklySlots?: Array<{ weekday: number; start: string; end: string }>
  temporaryBlocks?: LockedBlock[]
  granularityMinutes?: number
}

export interface CreateTaskRequest {
  title: string
  estimateMinutes: number
  itemId?: string
  dueAt?: string
  priority?: number
}

export interface CreateCourseRequest {
  termId: string
  code: string
  title: string
}

export interface CreateSourceRequest {
  sourceId?: string
  engine: string
  displayName: string
  authKind: 'password' | 'token' | 'oauth' | 'none'
  loginMode?: 'browser' | 'manual'
  config?: Record<string, unknown>
  capabilities?: string[]
  enabled?: boolean
}

export interface UpdateSourceRequest {
  sourceId: string
  displayName?: string
  authKind?: 'password' | 'token' | 'oauth' | 'none'
  loginMode?: 'browser' | 'manual'
  config?: Record<string, unknown>
  capabilities?: string[]
  enabled?: boolean
  expectedVersion?: number
}

export interface SourceIdRequest {
  sourceId: string
}

export interface SourceSecretRequest {
  sourceId: string
  secret: string
}

export interface CreateConnectionRequest {
  sourceId: string
  displayName: string
  authKind: 'password' | 'token' | 'oauth' | 'none'
  accountLabel?: string
  scopes?: string[]
}

export interface ConnectionSecretRequest {
  connectionId: string
  secret: string
}

export interface ConnectionIdRequest {
  connectionId: string
}

export interface JobEnabledRequest {
  jobId: string
  enabled: boolean
}

export interface UpdateSyncScheduleRequest {
  intervalMinutes: number
}

export interface UpdateReminderSettingsRequest {
  enabled?: boolean
  thresholdsHours?: number[]
}

export interface NotificationReadRequest {
  notificationId: string
}

export interface SyncNowRequest {
  sourceId?: string
  connectionId?: string
}

export interface WebSessionView {
  sessionId: string
  loginUrl: string
  domain: string
  label?: string
  createdAt: string
  updatedAt: string
  lastUsedAt?: string
}

export interface WebSessionFetchView {
  sessionId: string
  url: string
  finalUrl: string
  status: number
  contentType?: string
  body: string
  truncated: boolean
}

export interface WebLoginRequest {
  url: string
  label?: string
}

export interface WebFetchRequest {
  sessionId: string
  url: string
}

export interface WebSessionIdRequest {
  sessionId: string
}
