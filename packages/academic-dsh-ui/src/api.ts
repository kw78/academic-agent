import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import {
  CapabilityUnavailableError,
  dueSortKey,
  type AcademicItemView,
  type AdapterCandidateReport,
  type AdapterCandidateSummary,
  type AdapterSample,
  type CommandResult,
  type ConnectionView,
  type CourseView,
  type Due,
  type LockedBlock,
  type PlanBlock,
  type Range,
  type StudyPlanView,
  type StudyTaskView,
  type SyncPreview,
  type SyncRunSummary,
} from '@academic/contracts'
import type { AcademicApp } from '@academic/application'
import type { NotificationView } from '@academic/notifications'
import { loginWebSession, safeUrlForDisplay } from '@academic/web-sessions'
import { zonedDateTimeToUtc, type PlanSuggestion } from '@academic/planner-basic'
import type { JobRun, ScheduledJob } from '@academic/scheduler'
import type {
  AcceptPlanRequest,
  AdapterCandidateActivationView,
  AdapterCandidateManifestRequest,
  AdapterCandidateRegistrationView,
  AdapterCandidateValidationView,
  AdapterCandidateVersionRequest,
  AdapterCandidatesView,
  AutomationJob,
  AutomationRun,
  AutomationView,
  AvailabilityView,
  CommandReceipt,
  ConnectionIdRequest,
  ConnectionSecretRequest,
  ConnectionsView,
  CourseMergeView,
  CoursesView,
  CreateConnectionRequest,
  CreateCourseRequest,
  CreateSourceRequest,
  CreateTaskRequest,
  DashboardView,
  DeleteMaterialRequest,
  HostStatus,
  ImportMaterialAttachmentsRequest,
  ImportMaterialFileRequest,
  ImportMaterialTextRequest,
  ImportMaterialUrlRequest,
  ItemCard,
  ItemsRequest,
  JobEnabledRequest,
  LockBlockRequest,
  MaterialAttachmentsView,
  MaterialImportView,
  MaterialRebuildView,
  MaterialSearchRequest,
  MaterialSearchView,
  MaterialsView,
  MaterialSubscriptionRequest,
  MaterialSubscriptionView,
  NotificationCard,
  NotificationReadRequest,
  PlanCandidate,
  PlanMutationResult,
  PlanView,
  PreferencesView,
  PreviewPlanRequest,
  SettingsView,
  SourceCaptureView,
  SourceIdRequest,
  SourceDiagnosis,
  SourceProbeEvidence,
  SourceProbeRequest,
  SourceNextStep,
  SourceSecretRequest,
  SourceStage,
  SourceStatus,
  SyncNowRequest,
  TaskCard,
  TasksRequest,
  TasksView,
  TaskScope,
  TaskViewCounts,
  UiErrorCode,
  UiFailure,
  UiResult,
  UnlockBlockRequest,
  UpdateAvailabilityRequest,
  UpdatePreferencesRequest,
  UpdateReminderSettingsRequest,
  UpdateSourceRequest,
  UpdateSyncScheduleRequest,
  WebFetchRequest,
  WebLoginRequest,
  WebSessionFetchView,
  WebSessionIdRequest,
  WebSessionView,
} from './protocol.js'

const MAX_ITEMS = 200
const MAX_ITEM_SCAN_PAGES = 25
const DEFAULT_TASK_PAGE = 200
const MAX_TASK_PAGE = 500
const PREVIEW_TTL_MS = 10 * 60_000
const PREVIEW_LIMIT = 20
const FIXTURE_SYNC_JOB_ID = 'fixture-lms-sync'

const emptySchema = z.object({})
const itemsSchema = z.object({
  courseId: z.string().min(1).optional(),
  sourceId: z.string().min(1).optional(),
  dueBefore: z.string().min(1).optional(),
  status: z.enum(['active', 'archived', 'all']).optional(),
  limit: z.number().int().min(1).max(MAX_ITEMS).optional(),
  cursor: z.string().min(1).optional(),
})
const tasksSchema = z.object({
  status: z.enum(['active', 'completed', 'all']).optional(),
  includeArchived: z.boolean().optional(),
  courseId: z.string().min(1).max(200).optional(),
  kind: z.enum(['all', 'assignment', 'exam', 'quiz']).optional(),
  due: z
    .enum(['all', 'today', 'week', 'overdue', 'unknown', 'unscheduled'])
    .optional(),
  search: z.string().max(200).optional(),
  limit: z.number().int().min(1).max(MAX_TASK_PAGE).optional(),
  offset: z.number().int().min(0).max(1_000_000).optional(),
})
const previewSchema = z.object({
  start: z.string().min(1),
  end: z.string().min(1),
})
const acceptSchema = z.object({
  previewId: z.string().min(1),
})
const lockSchema = z.object({
  start: z.string().min(1),
  end: z.string().min(1),
  title: z.string().max(200).optional(),
})
const unlockSchema = z.object({
  lockId: z.string().min(1),
})
const weeklySlotSchema = z.object({
  weekday: z.number().int().min(0).max(6),
  start: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  end: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
})
const temporaryBlockSchema = z.object({
  id: z.string().min(1),
  start: z.string().min(1),
  end: z.string().min(1),
  title: z.string().max(200).optional(),
})
const availabilitySchema = z.object({
  timeZone: z.string().min(1).optional(),
  weeklySlots: z.array(weeklySlotSchema).optional(),
  temporaryBlocks: z.array(temporaryBlockSchema).optional(),
  granularityMinutes: z.number().int().min(5).max(60).optional(),
})
const updatePreferencesSchema = z.object({
  coursePriorities: z.record(
    z.string().min(1).max(200),
    z.number().int().min(0).max(3),
  ),
  agentAdapterAutomation: z.boolean().optional(),
})
const createTaskSchema = z.object({
  title: z.string().min(1).max(500),
  estimateMinutes: z.number().int().min(5).max(24 * 60),
  itemId: z.string().min(1).optional(),
  dueAt: z.string().min(1).optional(),
  priority: z.number().int().min(0).max(9).optional(),
})
const createCourseSchema = z.object({
  termId: z.string().min(1).max(100),
  code: z.string().min(1).max(100),
  title: z.string().min(1).max(300),
})
const createConnectionSchema = z.object({
  sourceId: z.string().min(1),
  displayName: z.string().min(1).max(200),
  authKind: z.enum(['password', 'token', 'oauth', 'none']),
  accountLabel: z.string().min(1).max(200).optional(),
  scopes: z.array(z.string().min(1).max(200)).max(50).optional(),
})
const createSourceSchema = z.object({
  sourceId: z.string().min(1).max(200).optional(),
  engine: z.string().min(1).max(100),
  displayName: z.string().min(1).max(200),
  authKind: z.enum(['password', 'token', 'oauth', 'none']),
  loginMode: z.enum(['browser', 'manual']).optional(),
  config: z.record(z.string(), z.unknown()).optional(),
  capabilities: z.array(z.string().min(1).max(200)).max(50).optional(),
  enabled: z.boolean().optional(),
})
const updateCourseSchema = z.object({
  id: z.string().min(1),
  termId: z.string().min(1).max(100).optional(),
  code: z.string().min(1).max(100).optional(),
  title: z.string().min(1).max(300).optional(),
})
const updateTaskSchema = z.object({
  taskId: z.string().min(1),
  title: z.string().min(1).max(500).optional(),
  dueAt: z.string().min(1).nullable().optional(),
  priority: z.number().int().min(0).max(3).optional(),
  estimateMinutes: z.number().int().min(5).max(1440).optional(),
})
const updateSourceSchema = z.object({
  sourceId: z.string().min(1),
  displayName: z.string().min(1).max(200).optional(),
  authKind: z.enum(['password', 'token', 'oauth', 'none']).optional(),
  loginMode: z.enum(['browser', 'manual']).optional(),
  config: z.record(z.string(), z.unknown()).optional(),
  capabilities: z.array(z.string().min(1).max(200)).max(50).optional(),
  enabled: z.boolean().optional(),
  expectedVersion: z.number().int().min(1).optional(),
})
const sourceIdSchema = z.object({ sourceId: z.string().min(1) })
const sourceProbeSchema = sourceIdSchema.extend({
  url: z.string().url().optional(),
})
const candidateManifestSchema = z.object({
  manifest: z.unknown(),
  samples: z
    .array(
      z.object({
        url: z.string().url().max(2_000),
        body: z.string().max(2_000_000),
        contentType: z.string().max(200).optional(),
        method: z.enum(['GET', 'POST']).optional(),
        requestBody: z.string().max(16_384).optional(),
      }),
    )
    .min(1)
    .max(20),
})
const candidateVersionSchema = z.object({
  adapterId: z.string().min(1).max(200),
  version: z.string().min(1).max(50).optional(),
})
const webLoginSchema = z.object({
  url: z.string().url(),
  label: z.string().min(1).max(200).optional(),
})
const webFetchSchema = z.object({
  sessionId: z.string().min(1),
  url: z.string().url(),
})
const webSessionIdSchema = z.object({ sessionId: z.string().min(1) })
const sourceSecretSchema = z.object({
  sourceId: z.string().min(1),
  secret: z.string().min(1).max(8192),
})
const secretSchema = z.object({
  connectionId: z.string().min(1),
  // Bounded only; the value is never logged, echoed or persisted by this layer.
  secret: z.string().min(1).max(8192),
})
const connectionIdSchema = z.object({
  connectionId: z.string().min(1),
})
const jobEnabledSchema = z.object({
  jobId: z.string().min(1),
  enabled: z.boolean(),
})
const syncScheduleSchema = z.object({
  intervalMinutes: z.number().int().min(1).max(7 * 24 * 60),
})
const reminderSchema = z.object({
  enabled: z.boolean().optional(),
  thresholdsHours: z
    .array(z.number().int().min(1).max(720))
    .min(1)
    .max(10)
    .optional(),
})
const notificationReadSchema = z.object({
  notificationId: z.string().min(1),
})
const syncNowSchema = z.object({
  sourceId: z.string().min(1).optional(),
  connectionId: z.string().min(1).optional(),
})
const estimateSchema = z.object({
  taskId: z.string().min(1),
  estimateMinutes: z.number().int().min(5).max(24 * 60),
})
const idSchema = z.object({ id: z.string().min(1) })
const materialSearchSchema = z.object({
  query: z.string().min(1).max(200),
  courseId: z.string().min(1).max(200).optional(),
  itemId: z.string().min(1).max(200).optional(),
  limit: z.number().int().min(1).max(50).optional(),
})
const importMaterialTextSchema = z.object({
  courseId: z.string().min(1).max(200),
  itemId: z.string().min(1).max(200).optional(),
  title: z.string().min(1).max(300),
  text: z.string().min(1).max(2_000_000),
})
const importMaterialFileSchema = z.object({
  courseId: z.string().min(1).max(200),
  itemId: z.string().min(1).max(200).optional(),
  title: z.string().min(1).max(300).optional(),
  fileName: z.string().min(1).max(300),
  contentBase64: z.string().min(1).max(112 * 1024 * 1024),
})
const importMaterialUrlSchema = z.object({
  courseId: z.string().min(1).max(200),
  itemId: z.string().min(1).max(200).optional(),
  title: z.string().min(1).max(300).optional(),
  url: z.string().url().max(2_000),
  sourceId: z.string().min(1).max(200).optional(),
  sessionId: z.string().min(1).max(200).optional(),
})
const deleteMaterialSchema = z.object({
  materialId: z.string().min(1).max(200),
})
const importMaterialAttachmentsSchema = z.object({
  courseId: z.string().min(1).max(200),
  sourceId: z.string().min(1).max(200),
  pageUrl: z.string().url().max(2_000),
  pathPrefix: z.string().max(500).optional(),
  maxFiles: z.number().int().min(1).max(30).optional(),
})
const materialSubscriptionSchema = z.object({
  sourceId: z.string().min(1).max(200),
  courseId: z.string().min(1).max(200),
  enabled: z.boolean(),
})

interface ParsedFailure {
  ok: false
  error: UiFailure
}

function failure(code: UiErrorCode, message: string): ParsedFailure {
  return { ok: false, error: { code, message } }
}

function ok<T>(value: T): UiResult<T> {
  return { ok: true, value }
}

function parse<T>(schema: z.ZodType<T>, input: unknown): { ok: true; value: T } | ParsedFailure {
  const result = schema.safeParse(input ?? {})
  if (result.success) return { ok: true, value: result.data }
  const first = result.error.issues[0]
  const field = first?.path.length ? first.path.join('.') : 'request'
  return failure('VALIDATION', `参数无效：${field}`)
}

function safeMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  return message
    .replace(/https?:\/\/[^\s"'<>]+/gi, (match) => safeUrlForDisplay(match) || '[url]')
    .replace(/\s+/g, ' ')
    .slice(0, 500)
}

function fromError(error: unknown): UiResult<never> {
  if (error instanceof CapabilityUnavailableError) {
    return {
      ok: false,
      error: {
        code: 'CAPABILITY_UNAVAILABLE',
        message: '当前版本不支持该能力或该能力尚未加载',
      },
    }
  }
  const code = (error as { code?: unknown } | null)?.code
  if (
    code === 'VALIDATION' ||
    code === 'CONFLICT' ||
    code === 'FORBIDDEN' ||
    code === 'NOT_FOUND' ||
    code === 'AUTH_REQUIRED' ||
    code === 'UNAVAILABLE'
  ) {
    return { ok: false, error: { code, message: safeMessage(error) } }
  }
  if (
    code === 'RATE_LIMITED' ||
    code === 'SUBSCRIPTION_REQUIRED' ||
    code === 'UNSUPPORTED' ||
    code === 'NETWORK'
  ) {
    return { ok: false, error: { code: 'UNAVAILABLE', message: safeMessage(error) } }
  }
  return { ok: false, error: { code: 'ERROR', message: safeMessage(error) } }
}

function commandReceipt(result: CommandResult): UiResult<CommandReceipt> {
  if (!result.ok) return { ok: false, error: { code: result.code, message: result.message } }
  return ok({
    aggregateId: result.aggregateId,
    version: result.version,
    eventIds: result.eventIds,
  })
}

function notificationCard(view: NotificationView): NotificationCard {
  return {
    notificationId: view.notificationId,
    type: view.type,
    title: view.title,
    body: view.body,
    createdAt: view.createdAt,
    ...(view.readAt ? { readAt: view.readAt } : {}),
  }
}

function localDate(zone: string, instant: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: zone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(instant)
  return parts
}

function nextDate(date: string): string {
  const [year, month, day] = date.split('-').map(Number)
  if (!year || !month || !day) throw new Error(`Invalid date: ${date}`)
  return new Date(Date.UTC(year, month - 1, day + 1)).toISOString().slice(0, 10)
}

function dayRange(zone: string, now: string): Range {
  const date = localDate(zone, new Date(now))
  return {
    start: zonedDateTimeToUtc(date, 0, 0, zone),
    end: zonedDateTimeToUtc(nextDate(date), 0, 0, zone),
  }
}

function instantDue(utc: string, zone: string): Due {
  return { kind: 'instant', utc, zone }
}

function isWithin(iso: string | undefined, range: Range): boolean {
  if (!iso) return false
  const value = Date.parse(iso)
  return value >= Date.parse(range.start) && value < Date.parse(range.end)
}

function overlapsRange(block: { start: string; end: string }, range: Range): boolean {
  return (
    Date.parse(block.start) < Date.parse(range.end) &&
    Date.parse(range.start) < Date.parse(block.end)
  )
}

function dueWithin(due: Due | undefined, range: Range, zone: string): boolean {
  if (!due) return false
  switch (due.kind) {
    case 'instant':
      return isWithin(due.utc, range)
    case 'local-date': {
      const date = localDate(zone, new Date(range.start))
      const endDate = localDate(zone, new Date(Date.parse(range.end) - 1))
      return due.date >= date && due.date <= endDate
    }
    case 'unknown':
      return false
  }
}

function dueBeforeNow(due: Due | undefined, now: string, zone: string): boolean {
  if (!due) return false
  switch (due.kind) {
    case 'instant':
      return Date.parse(due.utc) < Date.parse(now)
    case 'local-date':
      return due.date < localDate(zone, new Date(now))
    case 'unknown':
      return false
  }
}

function dueSoon(due: Due | undefined, now: string, zone: string, days: number): boolean {
  if (!due) return false
  const end = new Date(Date.parse(now) + days * 86_400_000).toISOString()
  switch (due.kind) {
    case 'instant': {
      const value = Date.parse(due.utc)
      return value >= Date.parse(now) - 86_400_000 && value <= Date.parse(end)
    }
    case 'local-date': {
      const startDate = localDate(zone, new Date(now))
      const endDate = localDate(zone, new Date(end))
      return due.date >= startDate && due.date <= endDate
    }
    case 'unknown':
      return false
  }
}

function mapAvailability(settings: {
  timeZone: string
  weeklySlots: Array<{ weekday: number; start: string; end: string }>
  temporaryBlocks: LockedBlock[]
  granularityMinutes: number
  updatedAt: string
}): AvailabilityView {
  return {
    timeZone: settings.timeZone,
    weeklySlots: settings.weeklySlots.map((slot) => ({ ...slot })),
    temporaryBlocks: settings.temporaryBlocks.map((block) => ({ ...block })),
    granularityMinutes: settings.granularityMinutes,
    updatedAt: settings.updatedAt,
  }
}

function mapJob(job: ScheduledJob): AutomationJob {
  return {
    jobId: job.jobId,
    kind: job.kind,
    enabled: job.enabled,
    nextRunAt: job.nextRunAt,
    intervalMinutes: Math.round(job.policy.intervalMs / 60_000),
    consecutiveFailures: job.consecutiveFailures,
    updatedAt: job.updatedAt,
  }
}

function mapRun(run: JobRun): AutomationRun {
  return {
    runId: run.runId,
    jobId: run.jobId,
    kind: run.kind,
    status: run.status,
    startedAt: run.startedAt,
    ...(run.finishedAt ? { finishedAt: run.finishedAt } : {}),
    attempt: run.attempt,
    ...(run.errorCode ? { errorCode: run.errorCode } : {}),
    ...(run.errorMessage ? { errorMessage: run.errorMessage } : {}),
  }
}

async function buildPreferencesView(app: AcademicApp): Promise<PreferencesView> {
  const preferences = app.preferences.get()
  const page = await app.store.queries.listCourses()
  return {
    coursePriorities: preferences.coursePriorities,
    agentAdapterAutomation: preferences.agentAdapterAutomation,
    courses: page.items
      .filter((course) => !course.archived && !course.deleted)
      .map((course) => ({
        courseId: course.courseId,
        code: course.code,
        title: course.title,
        priority: preferences.coursePriorities[course.courseId] ?? 0,
      })),
    updatedAt: preferences.updatedAt,
  }
}

const SYNC_STALE_AFTER_MS = 24 * 60 * 60 * 1000

function configurationState(config: {
  enabled: boolean
  archived: boolean
}): SourceStatus['configuration'] {
  if (config.archived) return 'archived'
  return config.enabled ? 'configured' : 'disabled'
}

function authenticationState(
  source: Pick<SourceStatus, 'authKind' | 'connection'>,
): SourceStatus['authentication'] {
  if (source.authKind === 'none') return 'not-required'
  if (!source.connection) return 'missing'
  switch (source.connection.status) {
    case 'configured':
      return 'saved'
    case 'connected':
      return 'verified'
    case 'auth-required':
      return 'expired'
    case 'disconnected':
    case 'unconfigured':
      return 'missing'
    case 'error':
      return 'rejected'
  }
}

function syncHealthState(
  lastSync: SyncRunSummary | undefined,
  now: string,
): SourceStatus['syncHealth'] {
  if (!lastSync) return 'never-synced'
  if (lastSync.status === 'running') return 'running'
  if (lastSync.status === 'partial') return 'partial'
  if (lastSync.status === 'failed') return 'failed'
  if (lastSync.status === 'auth-required') return 'auth-required'
  const finished = lastSync.finishedAt ?? lastSync.startedAt
  if (Date.parse(now) - Date.parse(finished) > SYNC_STALE_AFTER_MS) return 'stale'
  return 'healthy'
}

function sourceState(source: SourceStatus): SourceStatus['state'] {
  if (!source.adapterAvailable) return 'unavailable'
  if (source.syncHealth === 'partial') return 'degraded'
  if (source.syncHealth === 'failed') return 'error'
  if (
    source.syncHealth === 'auth-required' ||
    source.authentication === 'expired'
  ) {
    return 'auth-required'
  }
  if (source.authentication === 'rejected') return 'error'
  if (source.authentication === 'saved') return 'configured'
  if (source.authentication === 'missing' && source.authKind !== 'none') {
    return 'unconfigured'
  }
  if (
    source.syncHealth === 'healthy' ||
    source.syncHealth === 'stale' ||
    source.syncHealth === 'running'
  ) {
    return 'connected'
  }
  return 'configured'
}

function sourceStage(source: SourceStatus): SourceStage {
  if (source.configuration === 'archived') return 'archived'
  if (source.configuration === 'disabled') return 'disabled'
  if (!source.engineKnown) return 'unsupported'
  if (source.syncHealth === 'running') return 'syncing'
  if (
    source.syncHealth === 'auth-required' ||
    source.authentication === 'missing' ||
    source.authentication === 'expired' ||
    source.authentication === 'rejected'
  ) {
    return 'login-required'
  }
  if (source.authentication === 'saved') return 'login-saved'
  if (!source.adapterReady) return 'verified'
  if (source.syncHealth === 'failed') return 'failed'
  if (source.syncHealth === 'partial') return 'degraded'
  if (source.syncHealth === 'never-synced') return 'ready'
  return 'enabled'
}

function sourceNextStep(source: SourceStatus): SourceNextStep {
  if (source.configuration === 'archived') {
    return { action: 'none', label: '数据源已归档；历史数据仍保留' }
  }
  if (source.configuration === 'disabled') {
    return { action: 'none', label: '数据源已停用；启用后才能同步' }
  }
  if (!source.engineKnown) {
    return {
      action: 'fix',
      label: '加载或升级对应数据源引擎',
      reason: '当前版本未加载该引擎',
    }
  }
  if (
    source.syncHealth === 'auth-required' ||
    source.authentication === 'missing' ||
    source.authentication === 'expired' ||
    source.authentication === 'rejected'
  ) {
    if (source.canLogin) {
      return {
        action: 'login',
        label:
          source.authentication === 'missing' ? '登录平台' : '重新登录平台',
        ...(source.connection?.lastError
          ? { reason: source.connection.lastError }
          : {}),
      }
    }
    return {
      action: 'fix',
      label: '配置认证会话',
      reason: '该引擎没有浏览器登录入口',
    }
  }
  if (source.authentication === 'saved') {
    return source.canVerify
      ? { action: 'verify', label: '验证连接后同步' }
      : { action: 'fix', label: '当前引擎不支持会话验证' }
  }
  if (!source.adapterReady) {
    return {
      action: 'none',
      label: '生成或配置同步 Adapter',
      reason: '当前引擎没有可用的同步 Adapter',
    }
  }
  if (source.syncHealth === 'running') {
    return { action: 'none', label: '同步进行中' }
  }
  if (source.syncHealth === 'failed') {
    return {
      action: 'sync',
      label: '查看失败原因后重试同步',
      ...(source.connection?.lastError
        ? { reason: source.connection.lastError }
        : {}),
    }
  }
  if (source.syncHealth === 'partial') {
    return { action: 'sync', label: '重新同步（上次为部分结果）' }
  }
  if (source.syncHealth === 'never-synced') {
    return { action: 'sync', label: '预览并同步' }
  }
  return { action: 'sync', label: '立即同步' }
}

function sourceDiagnosis(source: SourceStatus): SourceDiagnosis | undefined {
  const run = source.lastSync
  const message = [run?.errorMessage, source.connection?.lastError]
    .filter((entry): entry is string => Boolean(entry))
    .join('\n')
  const haystack = `${message}\n${(run?.warnings ?? []).join('\n')}`

  if (
    run?.status === 'auth-required' ||
    run?.errorCode === 'AUTH_REQUIRED' ||
    source.authentication === 'expired' ||
    source.authentication === 'rejected' ||
    /会话.*(失效|过期)|重新登录|登录已失效/i.test(haystack)
  ) {
    return {
      category: 'auth',
      summary: '登录会话已失效或尚未验证',
      suggestion: '重新登录并验证连接；已同步的学业数据会保留',
    }
  }
  if (/分页|maxPages|最大页|达到上限|下一页/i.test(haystack)) {
    return {
      category: 'schema',
      summary: '分页达到上限或分页链接异常',
      suggestion: '检查分页规则和 maxPages；确认 partial 结果符合预期',
    }
  }
  if (
    /未授权|UNSAFE_|allowedOrigins|allowedPathPrefixes|主机|路径/i.test(haystack)
  ) {
    return {
      category: 'permission',
      summary: '请求超出已授权的主机或路径范围',
      suggestion: '核对 Manifest 访问范围；不要为绕过错误而扩大权限',
    }
  }
  if (
    /页面结构|缺少必需字段|选择器|正则|解析|JSON|schema|模板/i.test(haystack)
  ) {
    return {
      category: 'schema',
      summary: '页面结构或字段映射可能已变化',
      suggestion:
        '让 Agent 用新样本生成修复候选；验证与预览通过后再启用',
    }
  }
  if (
    run?.errorCode === 'TRANSIENT' ||
    /超时|timeout|429|限流|rate limit|HTTP 5\d\d|5xx/i.test(haystack)
  ) {
    return {
      category: 'network',
      summary: '网络超时、限流或平台暂时不可用',
      suggestion: '稍后重试；检查网络和平台状态，旧数据已保留',
    }
  }
  if (run?.status === 'partial') {
    return {
      category: 'quality',
      summary: '部分数据未能抓取',
      suggestion: '查看同步警告并重试；旧数据已保留',
    }
  }
  if (run?.status === 'failed') {
    return {
      category: 'unknown',
      summary: '同步失败',
      suggestion: '查看错误信息后重试；必要时让 Agent 检查适配规则',
    }
  }
  return undefined
}

function sourceDetail(source: SourceStatus): string {
  if (!source.engineKnown) return '当前版本未加载该数据源引擎'
  if (source.configuration === 'archived') return '数据源已归档'
  if (source.configuration === 'disabled') return '数据源已停用'
  if (source.authentication === 'saved') {
    return '凭据或会话已保存，尚未验证；保存凭据不代表平台可用'
  }
  if (source.authentication === 'expired') {
    return source.connection?.lastError ?? '需要重新认证'
  }
  if (source.authentication === 'rejected') {
    return source.connection?.lastError ?? '认证被拒绝'
  }
  if (source.authentication === 'missing' && source.authKind !== 'none') {
    return '尚未保存凭据'
  }
  if (source.syncHealth === 'partial') {
    return '部分数据抓取成功；旧数据保留，请查看同步警告'
  }
  if (source.syncHealth === 'failed') {
    return source.connection?.lastError ?? '同步失败；保留最后一次有效数据'
  }
  if (!source.adapterReady) {
    return '会话可用；当前 engine 没有同步 Adapter'
  }
  if (source.syncHealth === 'never-synced') return '尚未执行同步'
  if (source.syncHealth === 'stale') return '最近同步已过期'
  if (source.syncHealth === 'running') return '同步进行中'
  return '最近同步成功'
}

function buildSources(
  app: AcademicApp,
  connections: ConnectionView[],
  syncRuns: SyncRunSummary[],
): SourceStatus[] {
  const catalog = new Map<string, SourceStatus>()
  for (const config of app.sources.list({ includeArchived: true })) {
    const engine = app.sourceEngines.get(config.engine)
    const available = Boolean(engine) && config.enabled && !config.archived
    const adapterReady = available && Boolean(engine?.createAdapter)
    catalog.set(config.sourceId, {
      sourceId: config.sourceId,
      displayName: config.displayName,
      engine: config.engine,
      engineKnown: Boolean(engine),
      syncAvailable: adapterReady,
      canLogin: available && Boolean(engine?.login),
      canVerify: available && Boolean(engine?.verify),
      canCapture:
        available &&
        Boolean(engine?.capture) &&
        engine?.descriptor.supportsCapture === true,
      ...(config.loginMode ? { loginMode: config.loginMode } : {}),
      capabilities: config.capabilities,
      config: config.config,
      enabled: config.enabled,
      version: config.version,
      adapterAvailable: available,
      adapterReady,
      authKind: config.authKind,
      configuration: configurationState(config),
      authentication:
        config.authKind === 'none' ? 'not-required' : 'missing',
      syncHealth: 'never-synced',
      state: 'unconfigured',
      stage: 'login-required',
      nextStep: { action: 'none', label: '正在检查数据源状态' },
      ...(engine?.descriptor.description
        ? { detail: engine.descriptor.description }
        : {}),
    })
  }
  for (const connection of connections) {
    const existing = catalog.get(connection.sourceId)
    if (existing) {
      existing.connection = connection
    } else {
      catalog.set(connection.sourceId, {
        sourceId: connection.sourceId,
        displayName: connection.displayName,
        engine: '',
        engineKnown: false,
        syncAvailable: false,
        canLogin: false,
        canVerify: false,
        canCapture: false,
        capabilities: [],
        config: {},
        enabled: false,
        version: 0,
        adapterAvailable: false,
        adapterReady: false,
        authKind: connection.authKind,
        configuration: 'disabled',
        authentication: 'missing',
        syncHealth: 'never-synced',
        state: 'unavailable',
        stage: 'unsupported',
        nextStep: {
          action: 'fix',
          label: '加载或升级对应数据源引擎',
          reason: '当前版本未加载该引擎',
        },
        connection,
      })
    }
  }
  const now = app.clock.now()
  for (const source of catalog.values()) {
    const run = syncRuns.find((candidate) => candidate.sourceId === source.sourceId)
    if (run) source.lastSync = run
    const successful = syncRuns.find(
      (candidate) =>
        candidate.sourceId === source.sourceId &&
        (candidate.status === 'success' || candidate.status === 'partial'),
    )
    if (successful) source.lastSuccessfulSync = successful
    source.authentication = authenticationState(source)
    source.syncHealth = syncHealthState(source.lastSync, now)
    source.state = sourceState(source)
    source.stage = sourceStage(source)
    source.nextStep = sourceNextStep(source)
    const diagnosis = sourceDiagnosis(source)
    if (diagnosis) source.diagnosis = diagnosis
    const detail = sourceDetail(source)
    if (detail) source.detail = detail
  }
  return [...catalog.values()]
}

function sourceStatusFor(app: AcademicApp, sourceId: string): SourceStatus | undefined {
  return buildSources(app, app.connections.list(), []).find(
    (source) => source.sourceId === sourceId,
  )
}

function syncHealth(
  lastSync: SyncRunSummary | undefined,
  now: string,
  staleAfterMs: number,
): DashboardView['syncHealth'] {
  if (!lastSync) return 'unknown'
  if (lastSync.status === 'auth-required') return 'auth-required'
  if (lastSync.status === 'failed') return 'failed'
  if (lastSync.status === 'partial') return 'degraded'
  const finished = lastSync.finishedAt ?? lastSync.startedAt
  if (Date.parse(now) - Date.parse(finished) > staleAfterMs) return 'stale'
  return 'ok'
}

interface LoadedItems {
  items: AcademicItemView[]
  complete: boolean
}

async function loadAllItems(app: AcademicApp): Promise<LoadedItems> {
  const items: AcademicItemView[] = []
  let cursor: string | undefined
  for (let page = 0; page < MAX_ITEM_SCAN_PAGES; page += 1) {
    const result = await app.store.queries.listAcademicItems({
      status: 'all',
      limit: MAX_ITEMS,
      ...(cursor ? { cursor } : {}),
    })
    items.push(...result.items)
    if (!result.nextCursor) return { items, complete: true }
    cursor = result.nextCursor
  }
  return { items, complete: false }
}

interface Workspace {
  cards: TaskCard[]
  courses: CourseView[]
  items: ItemCard[]
  itemsComplete: boolean
  plan?: StudyPlanView
}

/**
 * Loads the whole workspace once and derives counts from it. List pages then
 * filter and paginate this snapshot in the host, so a client-side page can never
 * silently under-count or hide records that never left the host.
 */
async function loadWorkspace(app: AcademicApp): Promise<Workspace> {
  const [taskPage, itemPage, coursePage, plan] = await Promise.all([
    app.store.queries.listStudyTasks({ status: 'all', includeArchived: true }),
    loadAllItems(app),
    app.store.queries.listCourses(),
    app.getLatestPlan(),
  ])
  const courses = coursePage.items
  const courseById = new Map(courses.map((course) => [course.courseId, course]))
  const items = itemPage.items.map((item) => ({
    item,
    ...(courseById.get(item.courseId) ? { course: courseById.get(item.courseId)! } : {}),
  }))
  const itemById = new Map(itemPage.items.map((item) => [item.itemId, item]))
  const planBlocks = plan?.status === 'active' ? plan.blocks : []
  const planned = new Set(planBlocks.map((block) => block.taskId))
  const timeZone = app.availability.get().timeZone
  const todayRange = dayRange(timeZone, app.clock.now())
  const plannedToday = new Set(
    planBlocks
      .filter((block) => overlapsRange(block, todayRange))
      .map((block) => block.taskId),
  )
  const cards = taskPage.items.map((task): TaskCard => {
    const item = task.itemId ? itemById.get(task.itemId) : undefined
    const due = task.dueAt ? instantDue(task.dueAt, timeZone) : item?.due
    const course = item ? courseById.get(item.courseId) : undefined
    return {
      task,
      ...(item ? { item } : {}),
      ...(course ? { course } : {}),
      ...(due ? { effectiveDue: due } : {}),
      dueSource: task.dueAt ? 'task' : item ? 'item' : 'none',
      planned: planned.has(task.taskId),
      plannedToday: plannedToday.has(task.taskId),
    }
  })
  return {
    cards,
    courses,
    items,
    itemsComplete: itemPage.complete,
    ...(plan ? { plan } : {}),
  }
}

function isArchivedTask(card: TaskCard): boolean {
  return card.task.archived
}

function sortTaskCards(cards: TaskCard[]): TaskCard[] {
  return [...cards].sort((left, right) => {
    const leftKey = left.effectiveDue ? dueSortKey(left.effectiveDue) : ''
    const rightKey = right.effectiveDue ? dueSortKey(right.effectiveDue) : ''
    if (leftKey !== rightKey) return leftKey.localeCompare(rightKey)
    return left.task.title.localeCompare(right.task.title, 'zh-CN')
  })
}

function cardMatchesScope(
  card: TaskCard,
  scope: TaskScope,
  timeZone: string,
  now: string,
): boolean {
  if (scope === 'all') return true
  if (scope === 'unscheduled') return !card.planned
  if (!card.effectiveDue) return scope === 'unknown'
  const due = card.effectiveDue
  if (scope === 'unknown') return due.kind === 'unknown'
  if (scope === 'overdue') return dueBeforeNow(due, now, timeZone)
  if (scope === 'today') {
    return (
      Boolean(card.plannedToday) ||
      dueWithin(due, dayRange(timeZone, now), timeZone)
    )
  }
  // week: today, overdue and the next seven days; unknown stays separate.
  return dueSoon(due, now, timeZone, 7)
}

interface TaskFilterInput {
  status?: 'active' | 'completed' | 'all'
  includeArchived?: boolean
  courseId?: string
  kind?: 'all' | 'assignment' | 'exam' | 'quiz'
  due?: TaskScope
  search?: string
}

function filterWorkspaceCards(
  cards: TaskCard[],
  filters: TaskFilterInput,
  timeZone: string,
  now: string,
): TaskCard[] {
  const status = filters.status ?? 'all'
  const includeArchived = filters.includeArchived ?? false
  const dueScope = filters.due ?? 'all'
  const search = filters.search?.trim().toLocaleLowerCase('zh-CN')
  return sortTaskCards(
    cards.filter((card) => {
      if (!includeArchived && isArchivedTask(card)) return false
      if (status !== 'all' && card.task.status !== status) return false
      if (filters.courseId && filters.courseId !== 'all') {
        if (card.item?.courseId !== filters.courseId) return false
      }
      if (filters.kind && filters.kind !== 'all') {
        if (card.item?.kind !== filters.kind) return false
      }
      if (search) {
        const haystack = `${card.task.title}\n${card.item?.title ?? ''}`.toLocaleLowerCase(
          'zh-CN',
        )
        if (!haystack.includes(search)) return false
      }
      return cardMatchesScope(card, dueScope, timeZone, now)
    }),
  )
}

function taskViewCounts(
  workspace: Workspace,
  timeZone: string,
  now: string,
): TaskViewCounts {
  const visible = workspace.cards.filter((card) => !isArchivedTask(card))
  const active = visible.filter((card) => card.task.status === 'active')
  return {
    active: active.length,
    completed: visible.filter((card) => card.task.status === 'completed').length,
    archived: workspace.cards.length - visible.length,
    overdue: active.filter((card) => dueBeforeNow(card.effectiveDue, now, timeZone)).length,
    today: active.filter(
      (card) =>
        Boolean(card.plannedToday) ||
        dueWithin(card.effectiveDue, dayRange(timeZone, now), timeZone),
    ).length,
    unscheduled: active.filter((card) => !card.planned).length,
  }
}

export interface AcademicUiApi {
  status(request: unknown): Promise<UiResult<HostStatus>>
  dashboard(request: unknown): Promise<UiResult<DashboardView>>
  courses(request: unknown): Promise<UiResult<CoursesView>>
  items(request: unknown): Promise<UiResult<{ items: ItemCard[]; nextCursor?: string }>>
  tasks(request: unknown): Promise<UiResult<TasksView>>
  plan(request: unknown): Promise<UiResult<PlanView>>
  previewPlan(request: unknown): Promise<UiResult<PlanCandidate>>
  acceptPlan(request: unknown): Promise<UiResult<PlanMutationResult>>
  lockPlanBlock(request: unknown): Promise<UiResult<PlanMutationResult>>
  unlockPlanBlock(request: unknown): Promise<UiResult<PlanMutationResult>>
  archivePlan(request: unknown): Promise<UiResult<PlanMutationResult>>
  availability(request: unknown): Promise<UiResult<AvailabilityView>>
  updateAvailability(request: unknown): Promise<UiResult<AvailabilityView>>
  connections(request: unknown): Promise<UiResult<ConnectionsView>>
  createSource(request: unknown): Promise<UiResult<SourceStatus>>
  updateSource(request: unknown): Promise<UiResult<SourceStatus>>
  archiveSource(request: unknown): Promise<UiResult<SourceStatus>>
  restoreSource(request: unknown): Promise<UiResult<SourceStatus>>
  deleteSource(request: unknown): Promise<UiResult<{ deleted: boolean }>>
  sourceLogin(request: unknown): Promise<UiResult<ConnectionView>>
  sourceCapture(request: unknown): Promise<UiResult<SourceCaptureView>>
  probeSource(request: unknown): Promise<UiResult<SourceProbeEvidence>>
  adapterCandidates(request: unknown): Promise<UiResult<AdapterCandidatesView>>
  validateAdapterCandidate(
    request: unknown,
  ): Promise<UiResult<AdapterCandidateValidationView>>
  registerAdapterCandidate(
    request: unknown,
  ): Promise<UiResult<AdapterCandidateRegistrationView>>
  activateAdapterCandidate(
    request: unknown,
  ): Promise<UiResult<AdapterCandidateActivationView>>
  rollbackAdapterCandidate(
    request: unknown,
  ): Promise<UiResult<AdapterCandidateSummary>>
  sourceSetSecret(request: unknown): Promise<UiResult<ConnectionView>>
  webSessions(request: unknown): Promise<UiResult<{ sessions: WebSessionView[] }>>
  webLogin(request: unknown): Promise<UiResult<WebSessionView>>
  webFetch(request: unknown): Promise<UiResult<WebSessionFetchView>>
  webDelete(request: unknown): Promise<UiResult<{ deleted: boolean }>>
  createConnection(request: unknown): Promise<UiResult<ConnectionView>>
  setConnectionSecret(request: unknown): Promise<UiResult<ConnectionView>>
  verifyConnection(request: unknown): Promise<UiResult<ConnectionView>>
  disconnectConnection(request: unknown): Promise<UiResult<ConnectionView>>
  deleteConnectionCredential(request: unknown): Promise<UiResult<ConnectionView>>
  automation(request: unknown): Promise<UiResult<AutomationView>>
  setJobEnabled(request: unknown): Promise<UiResult<AutomationJob>>
  updateSyncSchedule(request: unknown): Promise<UiResult<AutomationJob>>
  syncNow(request: unknown): Promise<UiResult<SyncRunSummary>>
  previewSourceSync(request: unknown): Promise<UiResult<SyncPreview>>
  markNotificationRead(request: unknown): Promise<UiResult<{ changed: boolean }>>
  markAllNotificationsRead(request: unknown): Promise<UiResult<{ changed: number }>>
  settings(request: unknown): Promise<UiResult<SettingsView>>
  preferences(request: unknown): Promise<UiResult<PreferencesView>>
  updatePreferences(request: unknown): Promise<UiResult<PreferencesView>>
  updateReminderSettings(
    request: unknown,
  ): Promise<UiResult<{ enabled: boolean; thresholdsHours: number[]; updatedAt: string }>>
  addCourse(request: unknown): Promise<UiResult<CommandReceipt>>
  updateCourse(request: unknown): Promise<UiResult<CommandReceipt>>
  archiveCourse(request: unknown): Promise<UiResult<CommandReceipt>>
  restoreCourse(request: unknown): Promise<UiResult<CommandReceipt>>
  deleteCourse(request: unknown): Promise<UiResult<CommandReceipt>>
  archiveItem(request: unknown): Promise<UiResult<CommandReceipt>>
  restoreItem(request: unknown): Promise<UiResult<CommandReceipt>>
  createTask(request: unknown): Promise<UiResult<CommandReceipt>>
  updateTask(request: unknown): Promise<UiResult<CommandReceipt>>
  archiveTask(request: unknown): Promise<UiResult<CommandReceipt>>
  restoreTask(request: unknown): Promise<UiResult<CommandReceipt>>
  completeTask(request: unknown): Promise<UiResult<CommandReceipt>>
  reopenTask(request: unknown): Promise<UiResult<CommandReceipt>>
  changeTaskEstimate(request: unknown): Promise<UiResult<CommandReceipt>>
  mergeDuplicateCourses(request: unknown): Promise<UiResult<CourseMergeView>>
  materials(request: unknown): Promise<UiResult<MaterialsView>>
  materialSearch(request: unknown): Promise<UiResult<MaterialSearchView>>
  importMaterialText(request: unknown): Promise<UiResult<MaterialImportView>>
  importMaterialFile(request: unknown): Promise<UiResult<MaterialImportView>>
  importMaterialUrl(request: unknown): Promise<UiResult<MaterialImportView>>
  deleteMaterial(request: unknown): Promise<UiResult<{ deleted: boolean }>>
  rebuildMaterials(request: unknown): Promise<UiResult<MaterialRebuildView>>
  importMaterialAttachments(
    request: unknown,
  ): Promise<UiResult<MaterialAttachmentsView>>
  setMaterialSubscription(
    request: unknown,
  ): Promise<UiResult<MaterialSubscriptionView>>
}

export function createAcademicUiApi(app: AcademicApp): AcademicUiApi {
  const previews = new Map<string, { suggestion: PlanSuggestion; expiresAt: number }>()

  function rememberPreview(suggestion: PlanSuggestion): string {
    const previewId = randomUUID()
    const now = Date.parse(app.clock.now())
    for (const [key, value] of previews) {
      if (value.expiresAt <= now) previews.delete(key)
    }
    while (previews.size >= PREVIEW_LIMIT) {
      const oldest = previews.keys().next().value
      if (oldest === undefined) break
      previews.delete(oldest)
    }
    previews.set(previewId, {
      suggestion,
      expiresAt: now + PREVIEW_TTL_MS,
    })
    return previewId
  }

  function takePreview(previewId: string): PlanSuggestion | undefined {
    const cached = previews.get(previewId)
    if (!cached) return undefined
    if (cached.expiresAt <= Date.parse(app.clock.now())) {
      previews.delete(previewId)
      return undefined
    }
    return cached.suggestion
  }

  return {
    async status() {
      return ok({
        host: 'connected' as const,
        version: '0.2.0',
        generatedAt: app.clock.now(),
        plannerAvailable: app.registry.get('academic.planner.basic') !== undefined,
        notificationAvailable: app.registry.list('notification').length > 0,
        unreadNotifications: app.notifications.unreadCount(),
      })
    },

    async dashboard() {
      const now = app.clock.now()
      const availability = app.availability.get()
      const range = dayRange(availability.timeZone, now)
      const workspace = await loadWorkspace(app)
      const plan = workspace.plan?.status === 'active' ? workspace.plan : undefined
      const blocksToday = (plan?.blocks ?? []).filter((block) =>
        overlapsRange(block, range),
      )
      const plannedToday = new Set(blocksToday.map((block) => block.taskId))
      const todayBlocks = [...blocksToday]
        .sort((left, right) => left.start.localeCompare(right.start))
        .map((block) => {
          const task = workspace.cards.find(
            (card) => card.task.taskId === block.taskId,
          )?.task
          return { block, ...(task ? { task } : {}) }
        })
      const activeCards = workspace.cards.filter(
        (card) => !isArchivedTask(card) && card.task.status === 'active',
      )
      const todayTasks = sortTaskCards(
        activeCards.filter(
          (card) =>
            dueWithin(card.effectiveDue, range, availability.timeZone) ||
            plannedToday.has(card.task.taskId),
        ),
      )
      const overdueTasks = sortTaskCards(
        activeCards.filter((card) =>
          dueBeforeNow(card.effectiveDue, now, availability.timeZone),
        ),
      )
      const dueSoonItems = workspace.items
        .filter(
          (card) =>
            !card.item.archived &&
            dueSoon(card.item.due, now, availability.timeZone, 7),
        )
        .sort((left, right) =>
          dueSortKey(left.item.due).localeCompare(dueSortKey(right.item.due)),
        )
      const upcoming = dueSoonItems.slice(0, 20)
      const recentChanges = [...workspace.items]
        .sort((left, right) => right.item.updatedAt.localeCompare(left.item.updatedAt))
        .slice(0, 5)
      const connections = app.connections.list()
      const syncRuns = (await app.store.queries.listSyncRuns(undefined, 20)).items
      const lastSync = syncRuns[0]
      const lastSuccessfulSync = syncRuns.find(
        (run) => run.status === 'success' || run.status === 'partial',
      )
      const unread = app.notifications.list(5, { unreadOnly: true }).map(notificationCard)
      const projection = (await app.store.queries.getDashboardSummary(range)).meta
      return ok({
        generatedAt: now,
        range,
        timeZone: availability.timeZone,
        counts: {
          activeTasks: activeCards.length,
          completedTasks: workspace.cards.filter(
            (card) => !isArchivedTask(card) && card.task.status === 'completed',
          ).length,
          overdueTasks: overdueTasks.length,
          todayTasks: todayTasks.length,
          unreadNotifications: app.notifications.unreadCount(),
          unscheduledTasks: activeCards.filter((card) => !card.planned).length,
          itemsDueSoon: dueSoonItems.length,
          complete: workspace.itemsComplete,
          generatedAt: now,
        },
        todayTasks: todayTasks.slice(0, 20),
        todayTasksTotal: todayTasks.length,
        overdueTasks: overdueTasks.slice(0, 10),
        upcoming,
        upcomingTotal: dueSoonItems.length,
        recentChanges,
        todayBlocks,
        ...(plan ? { plan } : {}),
        unread,
        connections,
        sources: buildSources(app, connections, syncRuns),
        coursesCount: workspace.courses.filter(
          (course) => !course.archived && !course.deleted,
        ).length,
        availabilityConfigured: availability.weeklySlots.length > 0,
        ...(lastSync ? { lastSync } : {}),
        ...(lastSuccessfulSync ? { lastSuccessfulSync } : {}),
        syncHealth: syncHealth(
          lastSync,
          now,
          (app.scheduler.getJob(FIXTURE_SYNC_JOB_ID)?.policy.intervalMs ?? 60 * 60_000) * 2,
        ),
        plannerAvailable: app.registry.get('academic.planner.basic') !== undefined,
        projection,
      })
    },

    async courses() {
      const [courses, workspace, syncRuns] = await Promise.all([
        app.store.queries.listCourses(),
        loadWorkspace(app),
        app.store.queries.listSyncRuns(undefined, 30),
      ])
      const connections = app.connections.list()
      const sources = buildSources(app, connections, syncRuns.items)
      const materialCounts = new Map<string, number>()
      for (const material of app.materials.list()) {
        materialCounts.set(
          material.courseId,
          (materialCounts.get(material.courseId) ?? 0) + 1,
        )
      }
      const summaries = courses.items.map((course) => {
        const tasks = workspace.cards.filter(
          (card) =>
            !isArchivedTask(card) &&
            card.item?.courseId === course.courseId,
        )
        const active = tasks.filter((card) => card.task.status === 'active')
        const sourceIds = new Set<string>()
        if (course.source) sourceIds.add(course.source.sourceId)
        for (const card of workspace.items) {
          if (card.item.courseId === course.courseId) {
            sourceIds.add(card.item.source.sourceId)
          }
        }
        return {
          courseId: course.courseId,
          activeTasks: active.length,
          completedTasks: tasks.filter(
            (card) => card.task.status === 'completed',
          ).length,
          activeItems: workspace.items.filter(
            (card) =>
              !card.item.archived && card.item.courseId === course.courseId,
          ).length,
          plannedTasks: active.filter((card) => card.planned).length,
          materialCount: materialCounts.get(course.courseId) ?? 0,
          sourceIds: [...sourceIds],
        }
      })
      return ok({
        courses: courses.items,
        items: workspace.items,
        summaries,
        sources,
        generatedAt: app.clock.now(),
        projection: courses.meta,
      })
    },

    async items(request) {
      const parsed = parse(itemsSchema, request)
      if (!parsed.ok) return parsed
      const params: ItemsRequest = parsed.value
      const page = await app.store.queries.listAcademicItems({
        ...(params.courseId ? { courseId: params.courseId } : {}),
        ...(params.sourceId ? { sourceId: params.sourceId } : {}),
        ...(params.dueBefore ? { dueBefore: params.dueBefore } : {}),
        ...(params.status ? { status: params.status } : {}),
        ...(params.limit ? { limit: params.limit } : { limit: MAX_ITEMS }),
        ...(params.cursor ? { cursor: params.cursor } : {}),
      })
      const courses = await app.store.queries.listCourses()
      const courseById = new Map(courses.items.map((course) => [course.courseId, course]))
      return ok({
        items: page.items.map((item) => ({
          item,
          ...(courseById.get(item.courseId) ? { course: courseById.get(item.courseId)! } : {}),
        })),
        ...(page.nextCursor ? { nextCursor: page.nextCursor } : {}),
      })
    },

    async tasks(request) {
      const parsed = parse(tasksSchema, request)
      if (!parsed.ok) return parsed
      const body: TasksRequest = parsed.value
      const now = app.clock.now()
      const timeZone = app.availability.get().timeZone
      const workspace = await loadWorkspace(app)
      const matched = filterWorkspaceCards(workspace.cards, body, timeZone, now)
      const offset = body.offset ?? 0
      const limit = body.limit ?? DEFAULT_TASK_PAGE
      const page = matched.slice(offset, offset + limit)
      return ok({
        cards: page,
        total: matched.length,
        offset,
        hasMore: offset + page.length < matched.length,
        counts: taskViewCounts(workspace, timeZone, now),
        courses: workspace.courses,
        items: workspace.items,
        planBlocks: workspace.plan?.status === 'active' ? workspace.plan.blocks : [],
        truncated: offset + page.length < matched.length,
        itemsComplete: workspace.itemsComplete,
        timeZone,
        generatedAt: now,
      })
    },

    async plan() {
      const [plan, workspace] = await Promise.all([
        app.getLatestPlan(),
        loadWorkspace(app),
      ])
      return ok({
        ...(plan ? { plan } : {}),
        plannerAvailable: app.registry.get('academic.planner.basic') !== undefined,
        availability: mapAvailability(app.availability.get()),
        tasks: sortTaskCards(
          workspace.cards.filter(
            (card) => !isArchivedTask(card) && card.task.status === 'active',
          ),
        ),
        generatedAt: app.clock.now(),
      })
    },

    async previewPlan(request) {
      const parsed = parse(previewSchema, request)
      if (!parsed.ok) return parsed
      const body: PreviewPlanRequest = parsed.value
      const range: Range = { start: body.start, end: body.end }
      if (Date.parse(range.end) <= Date.parse(range.start)) {
        return failure('VALIDATION', '计划区间结束时间必须晚于开始时间')
      }
      try {
        const suggestion = await app.previewPlan(range)
        const previewId = rememberPreview(suggestion)
        return ok({
          previewId,
          planner: suggestion.planner,
          range: suggestion.range,
          blocks: suggestion.blocks,
          lockedBlocks: suggestion.lockedBlocks,
          unscheduled: suggestion.unscheduled.map((entry) => ({
            taskId: entry.taskId,
            title: entry.title,
            remainingMinutes: entry.remainingMinutes,
            reason: entry.reason,
          })),
          warnings: suggestion.warnings,
          stats: suggestion.stats,
        })
      } catch (error) {
        return fromError(error)
      }
    },

    async acceptPlan(request) {
      const parsed = parse(acceptSchema, request)
      if (!parsed.ok) return parsed
      const body: AcceptPlanRequest = parsed.value
      const suggestion = takePreview(body.previewId)
      if (!suggestion) {
        return failure('CONFLICT', '候选计划已失效，请重新生成')
      }
      const active = await app.store.queries.getActiveStudyPlan(suggestion.range)
      if (active) {
        return failure('CONFLICT', '已有确认计划，请先归档旧计划，候选计划未写入')
      }
      try {
        const result = await app.acceptPlan(suggestion)
        if (!result.ok) return { ok: false, error: { code: result.code, message: result.message } }
        previews.clear()
        const plan = await app.getLatestPlan()
        return ok({
          receipt: {
            aggregateId: result.aggregateId,
            version: result.version,
            eventIds: result.eventIds,
          },
          ...(plan ? { plan } : {}),
        })
      } catch (error) {
        return fromError(error)
      }
    },

    async lockPlanBlock(request) {
      const parsed = parse(lockSchema, request)
      if (!parsed.ok) return parsed
      const body: LockBlockRequest = parsed.value
      const result = await app.lockPlanBlock(body)
      if (!result.command.ok) {
        return {
          ok: false,
          error: { code: result.command.code, message: result.command.message },
        }
      }
      previews.clear()
      return ok({
        receipt: {
          aggregateId: result.command.aggregateId,
          version: result.command.version,
          eventIds: result.command.eventIds,
        },
        ...(result.plan ? { plan: result.plan } : {}),
        removedBlocks: result.removedBlocks,
      })
    },

    async unlockPlanBlock(request) {
      const parsed = parse(unlockSchema, request)
      if (!parsed.ok) return parsed
      const body: UnlockBlockRequest = parsed.value
      const result = await app.unlockPlanBlock(body.lockId)
      if (!result.command.ok) {
        return {
          ok: false,
          error: { code: result.command.code, message: result.command.message },
        }
      }
      previews.clear()
      return ok({
        receipt: {
          aggregateId: result.command.aggregateId,
          version: result.command.version,
          eventIds: result.command.eventIds,
        },
        ...(result.plan ? { plan: result.plan } : {}),
      })
    },

    async archivePlan() {
      const result = await app.archivePlan()
      const receipt = commandReceipt(result)
      if (!receipt.ok) return receipt
      // Keep the preview alive: confirming a candidate after archiving the old
      // plan is an explicit two-step flow, and a failed accept must be retryable.
      return ok({ receipt: receipt.value })
    },

    async availability() {
      return ok(mapAvailability(app.availability.get()))
    },

    async updateAvailability(request) {
      const parsed = parse(availabilitySchema, request)
      if (!parsed.ok) return parsed
      const body: UpdateAvailabilityRequest = parsed.value
      try {
        const settings = app.availability.update(body)
        previews.clear()
        return ok(mapAvailability(settings))
      } catch (error) {
        return failure('VALIDATION', safeMessage(error))
      }
    },

    async connections() {
      const connections = app.connections.list()
      const [syncRuns, courses] = await Promise.all([
        app.store.queries.listSyncRuns(undefined, 30),
        app.store.queries.listCourses(),
      ])
      return ok({
        sources: buildSources(app, connections, syncRuns.items),
        connections,
        engines: app.sourceEngines.list().map((engine) => engine.descriptor),
        courses: courses.items,
        syncRuns: syncRuns.items,
        agentAdapterAutomation: app.preferences.get().agentAdapterAutomation,
        generatedAt: app.clock.now(),
      })
    },

    async createConnection(request) {
      const parsed = parse(createConnectionSchema, request)
      if (!parsed.ok) return parsed
      const body: CreateConnectionRequest = parsed.value
      try {
        return ok(app.ensureConnection(body))
      } catch (error) {
        return fromError(error)
      }
    },

    async createSource(request) {
      const parsed = parse(createSourceSchema, request)
      if (!parsed.ok) return parsed
      const body: CreateSourceRequest = parsed.value
      try {
        const created = app.createSource(body)
        const source = sourceStatusFor(app, created.sourceId)
        return source
          ? ok(source)
          : failure('NOT_FOUND', '数据源已创建但未能读取')
      } catch (error) {
        return fromError(error)
      }
    },

    async updateSource(request) {
      const parsed = parse(updateSourceSchema, request)
      if (!parsed.ok) return parsed
      const body: UpdateSourceRequest = parsed.value
      try {
        app.updateSource(body.sourceId, body, body.expectedVersion)
        const source = sourceStatusFor(app, body.sourceId)
        return source ? ok(source) : failure('NOT_FOUND', '数据源不存在')
      } catch (error) {
        return fromError(error)
      }
    },

    async archiveSource(request) {
      const parsed = parse(sourceIdSchema, request)
      if (!parsed.ok) return parsed
      const body: SourceIdRequest = parsed.value
      try {
        app.archiveSource(body.sourceId)
        const source = sourceStatusFor(app, body.sourceId)
        return source ? ok(source) : failure('NOT_FOUND', '数据源不存在')
      } catch (error) {
        return fromError(error)
      }
    },

    async restoreSource(request) {
      const parsed = parse(sourceIdSchema, request)
      if (!parsed.ok) return parsed
      const body: SourceIdRequest = parsed.value
      try {
        app.restoreSource(body.sourceId)
        const source = sourceStatusFor(app, body.sourceId)
        return source ? ok(source) : failure('NOT_FOUND', '数据源不存在')
      } catch (error) {
        return fromError(error)
      }
    },

    async deleteSource(request) {
      const parsed = parse(sourceIdSchema, request)
      if (!parsed.ok) return parsed
      const body: SourceIdRequest = parsed.value
      try {
        await app.deleteSource(body.sourceId)
        return ok({ deleted: true })
      } catch (error) {
        return fromError(error)
      }
    },

    async sourceLogin(request) {
      const parsed = parse(sourceIdSchema, request)
      if (!parsed.ok) return parsed
      const body: SourceIdRequest = parsed.value
      try {
        const connection = await app.loginSource(body.sourceId)
        if (connection.status === 'auth-required') {
          return failure('AUTH_REQUIRED', connection.lastError ?? '登录会话验证失败')
        }
        return ok(connection)
      } catch (error) {
        return fromError(error)
      }
    },

    async sourceCapture(request) {
      const parsed = parse(sourceIdSchema, request)
      if (!parsed.ok) return parsed
      const body: SourceIdRequest = parsed.value
      const source = app.sources.get(body.sourceId)
      if (!source || source.archived) return failure('NOT_FOUND', '数据源不存在')
      const engine = app.sourceEngines.get(source.engine)
      if (!engine?.capture || engine.descriptor.supportsCapture !== true) {
        return failure('CAPABILITY_UNAVAILABLE', '该数据源不支持“登录并录制”')
      }
      try {
        const capture = await app.captureSource(source.sourceId)
        return ok({ capture } satisfies SourceCaptureView)
      } catch (error) {
        return fromError(error)
      }
    },

    async probeSource(request) {
      const parsed = parse(sourceProbeSchema, request)
      if (!parsed.ok) return parsed
      const body: SourceProbeRequest = parsed.value
      const source = app.sources.get(body.sourceId)
      if (!source) return failure('NOT_FOUND', '数据源不存在')
      if (source.authKind === 'none') {
        return failure('VALIDATION', '该数据源不需要会话探测')
      }
      try {
        const evidence = await app.probeSource(source.sourceId, body.url)
        if (evidence.status === 401 || evidence.status === 403) {
          return failure(
            'AUTH_REQUIRED',
            `平台返回 HTTP ${evidence.status}；请确认会话权限或重新登录`,
          )
        }
        if (evidence.loginLike) {
          return failure('AUTH_REQUIRED', '会话可能已失效；请重新登录后再探测')
        }
        return ok(evidence)
      } catch (error) {
        return fromError(error)
      }
    },

    async adapterCandidates() {
      return ok({
        candidates: app.adapterCandidates.list(),
        active: app.manifestRegistry.list().map((entry) => ({
          adapterId: entry.adapterId,
          ...(entry.active ? { active: entry.active } : {}),
        })),
      } satisfies AdapterCandidatesView)
    },

    async validateAdapterCandidate(request) {
      const parsed = parse(candidateManifestSchema, request)
      if (!parsed.ok) return parsed
      const body: AdapterCandidateManifestRequest = parsed.value
      try {
        const report = await app.adapterCandidates.validate(
          body.manifest,
          body.samples as AdapterSample[],
        )
        return ok({ report } satisfies AdapterCandidateValidationView)
      } catch (error) {
        return fromError(error)
      }
    },

    async registerAdapterCandidate(request) {
      const parsed = parse(candidateManifestSchema, request)
      if (!parsed.ok) return parsed
      const body: AdapterCandidateManifestRequest = parsed.value
      try {
        const result = await app.adapterCandidates.register(
          body.manifest,
          body.samples as AdapterSample[],
        )
        return ok({
          candidate: result.summary,
          report: result.report,
        } satisfies AdapterCandidateRegistrationView)
      } catch (error) {
        return fromError(error)
      }
    },

    async activateAdapterCandidate(request) {
      const parsed = parse(candidateVersionSchema, request)
      if (!parsed.ok) return parsed
      const body: AdapterCandidateVersionRequest = parsed.value
      if (!body.version) {
        return failure('VALIDATION', '启用候选需要明确版本')
      }
      try {
        const activation = await app.activateAdapterCandidate(
          body.adapterId,
          body.version,
        )
        const source = activation.sourceId
          ? sourceStatusFor(app, activation.sourceId)
          : undefined
        return ok({
          candidate: activation.candidate,
          ...(source ? { source } : {}),
          ...(activation.warning ? { warning: activation.warning } : {}),
        } satisfies AdapterCandidateActivationView)
      } catch (error) {
        return fromError(error)
      }
    },

    async rollbackAdapterCandidate(request) {
      const parsed = parse(candidateVersionSchema, request)
      if (!parsed.ok) return parsed
      const body: AdapterCandidateVersionRequest = parsed.value
      try {
        const activation = await app.rollbackAdapterCandidate(
          body.adapterId,
          body.version,
        )
        return ok(activation.candidate)
      } catch (error) {
        return fromError(error)
      }
    },

    async sourceSetSecret(request) {
      const parsed = parse(sourceSecretSchema, request)
      if (!parsed.ok) return parsed
      const body: SourceSecretRequest = parsed.value
      const source = app.sources.get(body.sourceId)
      if (!source) return failure('NOT_FOUND', '数据源不存在')
      if (source.authKind === 'none') return failure('VALIDATION', '该数据源不使用凭据')
      const engine = app.sourceEngines.get(source.engine)
      if (!engine) return failure('CAPABILITY_UNAVAILABLE', '该数据源引擎尚未加载')
      try {
        const connection =
          app.connections.list().find((entry) => entry.sourceId === source.sourceId) ??
          app.connections.create({
            sourceId: source.sourceId,
            displayName: source.displayName,
            authKind: source.authKind,
            scopes: source.capabilities,
          })
        await app.connections.setSecret(connection.connectionId, body.secret)
        if (engine.verify) {
          const context = { sourceId: source.sourceId, config: source.config }
          const verified = await app.connections.verify(
            connection.connectionId,
            async (secret) => engine.verify!(context, secret),
          )
          if (verified.status === 'auth-required') {
            return failure('AUTH_REQUIRED', verified.lastError ?? '凭据验证失败')
          }
          return ok(verified)
        }
        return ok(app.connections.get(connection.connectionId)!)
      } catch {
        return failure('UNAVAILABLE', '系统凭据库不可用，凭据未保存')
      }
    },

    async setConnectionSecret(request) {
      const parsed = parse(secretSchema, request)
      if (!parsed.ok) return parsed
      const body: ConnectionSecretRequest = parsed.value
      const connection = app.connections.get(body.connectionId)
      if (!connection) return failure('NOT_FOUND', '连接不存在')
      const source = app.sources.get(connection.sourceId)
      if (!source) return failure('NOT_FOUND', '数据源不存在')
      if (!app.sourceEngines.get(source.engine)) {
        return failure('CAPABILITY_UNAVAILABLE', '该数据源引擎尚未加载')
      }
      if (connection.authKind === 'none') {
        return failure('VALIDATION', '该连接不使用凭据')
      }
      try {
        return ok(await app.connections.setSecret(body.connectionId, body.secret))
      } catch {
        return failure('UNAVAILABLE', '系统凭据库不可用，凭据未保存')
      }
    },

    async verifyConnection(request) {
      const parsed = parse(connectionIdSchema, request)
      if (!parsed.ok) return parsed
      const body: ConnectionIdRequest = parsed.value
      const connection = app.connections.get(body.connectionId)
      if (!connection) return failure('NOT_FOUND', '连接不存在')
      const source = app.sources.get(connection.sourceId)
      if (!source) return failure('NOT_FOUND', '数据源不存在')
      const engine = app.sourceEngines.get(source.engine)
      if (!engine?.verify) {
        return failure('CAPABILITY_UNAVAILABLE', '该数据源没有可用的验证流程')
      }
      try {
        const context = { sourceId: source.sourceId, config: source.config }
        const verified = await app.connections.verify(
          connection.connectionId,
          async (secret) => engine.verify!(context, secret),
        )
        return verified.status === 'auth-required'
          ? failure('AUTH_REQUIRED', verified.lastError ?? '会话验证失败')
          : ok(verified)
      } catch (error) {
        return fromError(error)
      }
    },

    async disconnectConnection(request) {
      const parsed = parse(connectionIdSchema, request)
      if (!parsed.ok) return parsed
      const body: ConnectionIdRequest = parsed.value
      try {
        return ok(await app.connections.disconnect(body.connectionId))
      } catch (error) {
        return fromError(error)
      }
    },

    async deleteConnectionCredential(request) {
      const parsed = parse(connectionIdSchema, request)
      if (!parsed.ok) return parsed
      const body: ConnectionIdRequest = parsed.value
      try {
        return ok(await app.connections.deleteCredential(body.connectionId))
      } catch {
        return failure('UNAVAILABLE', '系统凭据库不可用，凭据未删除')
      }
    },

    async webSessions() {
      return ok({ sessions: app.webSessions.list() })
    },

    async webLogin(request) {
      const parsed = parse(webLoginSchema, request)
      if (!parsed.ok) return parsed
      const body: WebLoginRequest = parsed.value
      try {
        const login = await loginWebSession(body.url)
        const session = await app.webSessions.create({
          loginUrl: login.loginUrl,
          cookies: login.cookies,
          ...(body.label ? { label: body.label } : {}),
        })
        return ok(session)
      } catch (error) {
        return failure('ERROR', safeMessage(error))
      }
    },

    async webFetch(request) {
      const parsed = parse(webFetchSchema, request)
      if (!parsed.ok) return parsed
      const body: WebFetchRequest = parsed.value
      try {
        return ok(await app.webSessions.fetch(body.sessionId, body.url))
      } catch (error) {
        return fromError(error)
      }
    },

    async webDelete(request) {
      const parsed = parse(webSessionIdSchema, request)
      if (!parsed.ok) return parsed
      const body: WebSessionIdRequest = parsed.value
      try {
        await app.webSessions.delete(body.sessionId)
        return ok({ deleted: true })
      } catch (error) {
        return fromError(error)
      }
    },

    async automation() {
      const [status, syncPage] = await Promise.all([
        app.getAutomationStatus(),
        app.store.queries.listSyncRuns(undefined, 30),
      ])
      return ok({
        jobs: status.jobs.map(mapJob),
        jobRuns: status.jobRuns.map(mapRun),
        syncRuns: syncPage.items,
        notifications: app.notifications.list(50).map(notificationCard),
        unread: app.notifications.unreadCount(),
        reminderSettings: app.notifications.getSettings(),
        timeZone: app.availability.get().timeZone,
        projection: status.health,
        generatedAt: app.clock.now(),
      })
    },

    async setJobEnabled(request) {
      const parsed = parse(jobEnabledSchema, request)
      if (!parsed.ok) return parsed
      const body: JobEnabledRequest = parsed.value
      const job = app.scheduler.getJob(body.jobId)
      if (!job) return failure('NOT_FOUND', '自动化任务不存在')
      if (body.enabled) app.scheduler.resume(body.jobId)
      else app.scheduler.pause(body.jobId)
      const updated = app.scheduler.getJob(body.jobId)
      return updated ? ok(mapJob(updated)) : failure('NOT_FOUND', '自动化任务不存在')
    },

    async updateSyncSchedule(request) {
      const parsed = parse(syncScheduleSchema, request)
      if (!parsed.ok) return parsed
      const body: UpdateSyncScheduleRequest = parsed.value
      // One interval governs the fixture and every real source sync job.
      const updated = app.applySyncInterval(body.intervalMinutes)
      if (!updated) return failure('NOT_FOUND', '同步任务尚未初始化')
      return ok(mapJob(updated))
    },

    async previewSourceSync(request) {
      const parsed = parse(syncNowSchema, request)
      if (!parsed.ok) return parsed
      const body: SyncNowRequest = parsed.value
      let sourceId = body.sourceId
      if (!sourceId && body.connectionId) {
        const connection = app.connections.get(body.connectionId)
        if (!connection) return failure('NOT_FOUND', '连接不存在')
        sourceId = connection.sourceId
      }
      if (!sourceId) return failure('VALIDATION', '缺少数据源 ID')
      try {
        return ok(await app.previewSourceSync(sourceId, body.connectionId))
      } catch (error) {
        return fromError(error)
      }
    },

    async syncNow(request) {
      const parsed = parse(syncNowSchema, request)
      if (!parsed.ok) return parsed
      const body: SyncNowRequest = parsed.value
      let sourceId = body.sourceId
      if (body.connectionId) {
        const connection = app.connections.get(body.connectionId)
        if (!connection) return failure('NOT_FOUND', '连接不存在')
        sourceId = connection.sourceId
      }
      try {
        if (!sourceId) {
          const summaries = await app.syncAllSources()
          const last = summaries[summaries.length - 1]
          if (!last) {
            return failure('CAPABILITY_UNAVAILABLE', '没有可同步的数据源')
          }
          previews.clear()
          return ok(last)
        }
        if (!app.sources.get(sourceId)) {
          return failure('NOT_FOUND', '数据源不存在')
        }
        const summary = await app.syncSource(sourceId, body.connectionId)
        previews.clear()
        return ok(summary)
      } catch (error) {
        return fromError(error)
      }
    },

    async markNotificationRead(request) {
      const parsed = parse(notificationReadSchema, request)
      if (!parsed.ok) return parsed
      const body: NotificationReadRequest = parsed.value
      return ok({ changed: app.markNotificationRead(body.notificationId) })
    },

    async markAllNotificationsRead() {
      return ok({ changed: app.markAllNotificationsRead() })
    },

    async settings() {
      const availability = app.availability.get()
      const reminders = app.notifications.getSettings()
      const job = app.scheduler.getJob(FIXTURE_SYNC_JOB_ID)
      return ok({
        availability: mapAvailability(availability),
        preferences: await buildPreferencesView(app),
        capabilities: app.registry.list().map((entry) => ({
          id: entry.id,
          kind: entry.kind,
          version: entry.version,
          providerPlugin: entry.providerPlugin,
          capabilities: [...entry.capabilities],
          requiredPermissions: [...entry.requiredPermissions],
        })),
        reminders,
        sync: {
          jobId: FIXTURE_SYNC_JOB_ID,
          enabled: job?.enabled ?? false,
          intervalMinutes: job ? Math.round(job.policy.intervalMs / 60_000) : 60,
          ...(job ? { nextRunAt: job.nextRunAt } : {}),
        },
        plannerAvailable: app.registry.get('academic.planner.basic') !== undefined,
        generatedAt: app.clock.now(),
      })
    },

    async preferences() {
      return ok(await buildPreferencesView(app))
    },

    async updatePreferences(request) {
      const parsed = parse(updatePreferencesSchema, request)
      if (!parsed.ok) return parsed
      const body: UpdatePreferencesRequest = parsed.value
      const courseIds = new Set(
        (await app.store.queries.listCourses()).items.map(
          (course) => course.courseId,
        ),
      )
      const unknown = Object.keys(body.coursePriorities).find(
        (courseId) => !courseIds.has(courseId),
      )
      if (unknown) return failure('VALIDATION', `未知课程：${unknown}`)
      try {
        app.preferences.update(body)
        return ok(await buildPreferencesView(app))
      } catch (error) {
        return failure('VALIDATION', safeMessage(error))
      }
    },

    async updateReminderSettings(request) {
      const parsed = parse(reminderSchema, request)
      if (!parsed.ok) return parsed
      const body: UpdateReminderSettingsRequest = parsed.value
      if (
        body.thresholdsHours &&
        new Set(body.thresholdsHours).size !== body.thresholdsHours.length
      ) {
        return failure('VALIDATION', '提醒阈值不能重复')
      }
      try {
        return ok(app.notifications.updateSettings(body))
      } catch (error) {
        return failure('VALIDATION', safeMessage(error))
      }
    },

    async addCourse(request) {
      const parsed = parse(createCourseSchema, request)
      if (!parsed.ok) return parsed
      const body: CreateCourseRequest = parsed.value
      return commandReceipt(await app.addCourse(body))
    },

    async updateCourse(request) {
      const parsed = parse(updateCourseSchema, request)
      if (!parsed.ok) return parsed
      const { id, ...input } = parsed.value
      return commandReceipt(await app.updateCourse(id, input))
    },

    async archiveCourse(request) {
      const parsed = parse(idSchema, request)
      if (!parsed.ok) return parsed
      const body = parsed.value
      return commandReceipt(await app.archiveCourse(body.id))
    },

    async restoreCourse(request) {
      const parsed = parse(idSchema, request)
      if (!parsed.ok) return parsed
      const body = parsed.value
      return commandReceipt(await app.restoreCourse(body.id))
    },

    async deleteCourse(request) {
      const parsed = parse(idSchema, request)
      if (!parsed.ok) return parsed
      const body = parsed.value
      return commandReceipt(await app.deleteCourse(body.id))
    },

    async archiveItem(request) {
      const parsed = parse(idSchema, request)
      if (!parsed.ok) return parsed
      const body = parsed.value
      return commandReceipt(await app.archiveItem(body.id))
    },

    async restoreItem(request) {
      const parsed = parse(idSchema, request)
      if (!parsed.ok) return parsed
      const body = parsed.value
      return commandReceipt(await app.restoreItem(body.id))
    },

    async createTask(request) {
      const parsed = parse(createTaskSchema, request)
      if (!parsed.ok) return parsed
      const body: CreateTaskRequest = parsed.value
      const result = commandReceipt(await app.createTask(body))
      if (result.ok) previews.clear()
      return result
    },

    async updateTask(request) {
      const parsed = parse(updateTaskSchema, request)
      if (!parsed.ok) return parsed
      const { taskId, ...input } = parsed.value
      const result = commandReceipt(await app.updateTask(taskId, input))
      if (result.ok) previews.clear()
      return result
    },

    async archiveTask(request) {
      const parsed = parse(idSchema, request)
      if (!parsed.ok) return parsed
      const result = commandReceipt(await app.archiveTask(parsed.value.id))
      if (result.ok) previews.clear()
      return result
    },

    async restoreTask(request) {
      const parsed = parse(idSchema, request)
      if (!parsed.ok) return parsed
      const result = commandReceipt(await app.restoreTask(parsed.value.id))
      if (result.ok) previews.clear()
      return result
    },

    async completeTask(request) {
      const parsed = parse(idSchema, request)
      if (!parsed.ok) return parsed
      const result = commandReceipt(await app.completeTask(parsed.value.id))
      if (result.ok) previews.clear()
      return result
    },

    async reopenTask(request) {
      const parsed = parse(idSchema, request)
      if (!parsed.ok) return parsed
      const result = commandReceipt(await app.reopenTask(parsed.value.id))
      if (result.ok) previews.clear()
      return result
    },

    async changeTaskEstimate(request) {
      const parsed = parse(estimateSchema, request)
      if (!parsed.ok) return parsed
      const body = parsed.value
      const result = commandReceipt(
        await app.changeTaskEstimate(body.taskId, body.estimateMinutes),
      )
      if (result.ok) previews.clear()
      return result
    },

    async mergeDuplicateCourses() {
      try {
        return ok(await app.mergeDuplicateCourses())
      } catch (error) {
        return fromError(error)
      }
    },

    async materials() {
      const courses = await app.store.queries.listCourses()
      const visibleCourses = courses.items.filter(
        (course) => !course.deleted && !course.archived,
      )
      const byId = new Map(visibleCourses.map((course) => [course.courseId, course]))
      const materials = app.materials.list({ limit: 500 }).map((material) => ({
        material,
        ...(byId.get(material.courseId) ? { course: byId.get(material.courseId)! } : {}),
      }))
      const connections = app.connections.list()
      const sources = app.sources.list({ includeArchived: true }).map((source) => ({
        sourceId: source.sourceId,
        displayName: source.displayName,
        engine: source.engine,
        archived: source.archived,
        hasSession: connections.some(
          (connection) =>
            connection.sourceId === source.sourceId && connection.hasCredential,
        ),
      }))
      const view: MaterialsView = {
        courses: visibleCourses,
        materials,
        subscriptions: app.materials.subscriptions(),
        sources,
        webSessions: app.webSessions.list(),
      }
      return ok(view)
    },

    async materialSearch(request) {
      const parsed = parse(materialSearchSchema, request)
      if (!parsed.ok) return parsed
      const body: MaterialSearchRequest = parsed.value
      try {
        return ok({ result: app.materials.search(body) })
      } catch (error) {
        return fromError(error)
      }
    },

    async importMaterialText(request) {
      const parsed = parse(importMaterialTextSchema, request)
      if (!parsed.ok) return parsed
      const body: ImportMaterialTextRequest = parsed.value
      try {
        return ok({
          result: await app.materials.importText({
            courseId: body.courseId,
            ...(body.itemId ? { itemId: body.itemId } : {}),
            title: body.title,
            text: body.text,
            originLabel: 'ui',
          }),
        })
      } catch (error) {
        return fromError(error)
      }
    },

    async importMaterialFile(request) {
      const parsed = parse(importMaterialFileSchema, request)
      if (!parsed.ok) return parsed
      const body: ImportMaterialFileRequest = parsed.value
      if (!/^[A-Za-z0-9+/]*={0,2}$/.test(body.contentBase64)) {
        return failure('VALIDATION', '文件内容编码无效')
      }
      let bytes: Buffer
      try {
        bytes = Buffer.from(body.contentBase64, 'base64')
      } catch {
        return failure('VALIDATION', '文件内容编码无效')
      }
      if (bytes.byteLength === 0) return failure('VALIDATION', '文件内容为空')
      if (bytes.byteLength > 80 * 1024 * 1024) {
        return failure('VALIDATION', '文件超过 80 MB 上限；请压缩后重试')
      }
      try {
        return ok({
          result: await app.materials.importBytes({
            courseId: body.courseId,
            ...(body.itemId ? { itemId: body.itemId } : {}),
            ...(body.title ? { title: body.title } : {}),
            fileName: body.fileName,
            bytes,
            sourceKind: 'file',
            originLabel: 'ui',
          }),
        })
      } catch (error) {
        return fromError(error)
      }
    },

    async importMaterialUrl(request) {
      const parsed = parse(importMaterialUrlSchema, request)
      if (!parsed.ok) return parsed
      const body: ImportMaterialUrlRequest = parsed.value
      try {
        return ok({
          result: await app.materials.importUrl({
            courseId: body.courseId,
            ...(body.itemId ? { itemId: body.itemId } : {}),
            ...(body.title ? { title: body.title } : {}),
            url: body.url,
            ...(body.sourceId ? { sourceId: body.sourceId } : {}),
            ...(body.sessionId ? { sessionId: body.sessionId } : {}),
          }),
        })
      } catch (error) {
        return fromError(error)
      }
    },

    async deleteMaterial(request) {
      const parsed = parse(deleteMaterialSchema, request)
      if (!parsed.ok) return parsed
      const body: DeleteMaterialRequest = parsed.value
      try {
        app.materials.delete(body.materialId)
        return ok({ deleted: true })
      } catch (error) {
        return fromError(error)
      }
    },

    async rebuildMaterials() {
      try {
        return ok({ result: app.materials.rebuildIndex() })
      } catch (error) {
        return fromError(error)
      }
    },

    async importMaterialAttachments(request) {
      const parsed = parse(importMaterialAttachmentsSchema, request)
      if (!parsed.ok) return parsed
      const body: ImportMaterialAttachmentsRequest = parsed.value
      try {
        return ok({
          result: await app.materials.importAttachments({
            courseId: body.courseId,
            sourceId: body.sourceId,
            pageUrl: body.pageUrl,
            ...(body.pathPrefix ? { pathPrefix: body.pathPrefix } : {}),
            ...(body.maxFiles ? { maxFiles: body.maxFiles } : {}),
          }),
        })
      } catch (error) {
        return fromError(error)
      }
    },

    async setMaterialSubscription(request) {
      const parsed = parse(materialSubscriptionSchema, request)
      if (!parsed.ok) return parsed
      const body: MaterialSubscriptionRequest = parsed.value
      try {
        return ok(app.materials.setSubscription(body.sourceId, body.courseId, body.enabled))
      } catch (error) {
        return fromError(error)
      }
    },
  }
}

// Keep the unused `emptySchema` import path honest for future zero-argument
// methods and make the exported schema surface testable without exposing inputs.
export const uiRequestSchemas = {
  empty: emptySchema,
  items: itemsSchema,
  tasks: tasksSchema,
  preview: previewSchema,
  accept: acceptSchema,
  lock: lockSchema,
  unlock: unlockSchema,
  availability: availabilitySchema,
  createTask: createTaskSchema,
  updateTask: updateTaskSchema,
  createCourse: createCourseSchema,
  updateCourse: updateCourseSchema,
  createConnection: createConnectionSchema,
  secret: secretSchema,
  connectionId: connectionIdSchema,
  jobEnabled: jobEnabledSchema,
  syncSchedule: syncScheduleSchema,
  reminder: reminderSchema,
  notificationRead: notificationReadSchema,
  syncNow: syncNowSchema,
  estimate: estimateSchema,
  id: idSchema,
  materialSearch: materialSearchSchema,
  importMaterialText: importMaterialTextSchema,
  importMaterialFile: importMaterialFileSchema,
  importMaterialUrl: importMaterialUrlSchema,
  deleteMaterial: deleteMaterialSchema,
  importMaterialAttachments: importMaterialAttachmentsSchema,
  materialSubscription: materialSubscriptionSchema,
} as const
