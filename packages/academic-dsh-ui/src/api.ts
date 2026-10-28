import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import {
  CapabilityUnavailableError,
  dueSortKey,
  type AcademicItemView,
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
import type { AcademicApp } from '@academic/cli'
import type { NotificationView } from '@academic/notifications'
import { loginWebSession, safeUrlForDisplay } from '@academic/web-sessions'
import { zonedDateTimeToUtc, type PlanSuggestion } from '@academic/planner-basic'
import type { JobRun, ScheduledJob } from '@academic/scheduler'
import type {
  AcceptPlanRequest,
  AutomationJob,
  AutomationRun,
  AutomationView,
  AvailabilityView,
  CommandReceipt,
  ConnectionIdRequest,
  ConnectionSecretRequest,
  ConnectionsView,
  CoursesView,
  CreateConnectionRequest,
  CreateCourseRequest,
  CreateSourceRequest,
  CreateTaskRequest,
  DashboardView,
  HostStatus,
  ItemCard,
  ItemsRequest,
  JobEnabledRequest,
  LockBlockRequest,
  NotificationCard,
  NotificationReadRequest,
  PlanCandidate,
  PlanMutationResult,
  PlanView,
  PreviewPlanRequest,
  SettingsView,
  SourceIdRequest,
  SourceSecretRequest,
  SourceStatus,
  SyncNowRequest,
  TaskCard,
  TasksRequest,
  TasksView,
  UiErrorCode,
  UiFailure,
  UiResult,
  UnlockBlockRequest,
  UpdateAvailabilityRequest,
  UpdateReminderSettingsRequest,
  UpdateSourceRequest,
  UpdateSyncScheduleRequest,
  WebFetchRequest,
  WebLoginRequest,
  WebSessionFetchView,
  WebSessionIdRequest,
  WebSessionView,
} from './protocol.js'

const MAX_TASKS = 500
const MAX_ITEMS = 200
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

function addMinutes(iso: string, minutes: number): string {
  return new Date(Date.parse(iso) + minutes * 60_000).toISOString()
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

function validateSourceCapabilities(
  descriptor: {
    supportsLogin: boolean
    authKinds?: readonly string[]
    loginModes?: readonly string[]
  },
  authKind: string,
  loginMode: string | undefined,
): string | undefined {
  if (descriptor.authKinds && !descriptor.authKinds.includes(authKind)) {
    return `该引擎不支持认证方式 ${authKind}`
  }
  if (loginMode) {
    if (authKind === 'none') return '认证方式为 none 时不应配置登录方式'
    if (!descriptor.supportsLogin) return '该引擎不支持登录流程'
    if (descriptor.loginModes && !descriptor.loginModes.includes(loginMode)) {
      return `该引擎不支持登录方式 ${loginMode}`
    }
  }
  return undefined
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
  for (const config of app.sources.list()) {
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
        connection,
      })
    }
  }
  const now = app.clock.now()
  for (const source of catalog.values()) {
    const run = syncRuns.find((candidate) => candidate.sourceId === source.sourceId)
    if (run) source.lastSync = run
    source.authentication = authenticationState(source)
    source.syncHealth = syncHealthState(source.lastSync, now)
    source.state = sourceState(source)
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

interface LoadedTasks {
  cards: TaskCard[]
  courses: CourseView[]
  items: ItemCard[]
  truncated: boolean
  plan?: StudyPlanView
}

async function loadTasks(
  app: AcademicApp,
  options: { status?: 'active' | 'completed' | 'all' } = {},
): Promise<LoadedTasks> {
  const [taskPage, itemPage, coursePage, plan] = await Promise.all([
    app.store.queries.listStudyTasks(
      options.status ? { status: options.status } : {},
    ),
    app.store.queries.listAcademicItems({ status: 'all', limit: MAX_ITEMS }),
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
  const planned = new Set(
    plan?.status === 'active' ? plan.blocks.map((block) => block.taskId) : [],
  )
  const timeZone = app.availability.get().timeZone
  const truncated = taskPage.items.length > MAX_TASKS
  const cards = taskPage.items.slice(0, MAX_TASKS).map((task): TaskCard => {
    const item = task.itemId ? itemById.get(task.itemId) : undefined
    const due = task.dueAt
      ? instantDue(task.dueAt, timeZone)
      : item?.due
    const course = item ? courseById.get(item.courseId) : undefined
    return {
      task,
      ...(item ? { item } : {}),
      ...(course ? { course } : {}),
      ...(due ? { effectiveDue: due } : {}),
      dueSource: task.dueAt ? 'task' : item ? 'item' : 'none',
      planned: planned.has(task.taskId),
    }
  })
  return {
    cards,
    courses,
    items,
    truncated,
    ...(plan ? { plan } : {}),
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
  sourceLogin(request: unknown): Promise<UiResult<ConnectionView>>
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
  updateReminderSettings(
    request: unknown,
  ): Promise<UiResult<{ enabled: boolean; thresholdsHours: number[]; updatedAt: string }>>
  addCourse(request: unknown): Promise<UiResult<CommandReceipt>>
  archiveCourse(request: unknown): Promise<UiResult<CommandReceipt>>
  createTask(request: unknown): Promise<UiResult<CommandReceipt>>
  completeTask(request: unknown): Promise<UiResult<CommandReceipt>>
  reopenTask(request: unknown): Promise<UiResult<CommandReceipt>>
  changeTaskEstimate(request: unknown): Promise<UiResult<CommandReceipt>>
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
        version: '0.1.0',
        generatedAt: app.clock.now(),
        plannerAvailable: app.registry.get('academic.planner.basic') !== undefined,
        notificationAvailable: app.registry.list('notification').length > 0,
      })
    },

    async dashboard() {
      const now = app.clock.now()
      const availability = app.availability.get()
      const range = dayRange(availability.timeZone, now)
      const loaded = await loadTasks(app, { status: 'active' })
      const plan = loaded.plan?.status === 'active' ? loaded.plan : undefined
      const todayBlocks = (plan?.blocks ?? [])
        .filter((block) => overlapsRange(block, range))
        .map((block) => {
          const task = loaded.cards.find((card) => card.task.taskId === block.taskId)?.task
          return { block, ...(task ? { task } : {}) }
        })
      const todayTasks = loaded.cards.filter(
        (card) =>
          dueWithin(card.effectiveDue, range, availability.timeZone) ||
          (plan?.blocks ?? []).some(
            (block) => block.taskId === card.task.taskId && overlapsRange(block, range),
          ),
      )
      const upcoming = loaded.items
        .filter((card) => dueSoon(card.item.due, now, availability.timeZone, 7))
        .sort((left, right) => dueSortKey(left.item.due).localeCompare(dueSortKey(right.item.due)))
        .slice(0, 20)
      const recentChanges = [...loaded.items]
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
          activeTasks: loaded.cards.length,
          overdueTasks: loaded.cards.filter((card) =>
            dueBeforeNow(card.effectiveDue, now, availability.timeZone),
          ).length,
          unreadNotifications: app.notifications.unreadCount(),
          unscheduledTasks: loaded.cards.filter((card) => !card.planned).length,
          itemsDueSoon: upcoming.length,
        },
        todayTasks,
        upcoming,
        recentChanges,
        todayBlocks,
        ...(plan ? { plan } : {}),
        unread,
        connections,
        sources: buildSources(app, connections, syncRuns),
        ...(lastSync ? { lastSync } : {}),
        ...(lastSuccessfulSync ? { lastSuccessfulSync } : {}),
        syncHealth: syncHealth(
          lastSync,
          now,
          (app.scheduler.getJob(FIXTURE_SYNC_JOB_ID)?.policy.intervalMs ?? 15 * 60_000) * 2,
        ),
        plannerAvailable: app.registry.get('academic.planner.basic') !== undefined,
        projection,
      })
    },

    async courses() {
      const [courses, items] = await Promise.all([
        app.store.queries.listCourses(),
        loadTasks(app, { status: 'all' }),
      ])
      return ok({
        courses: courses.items,
        items: items.items,
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
      const loaded = await loadTasks(app, parsed.value)
      return ok({
        cards: loaded.cards,
        courses: loaded.courses,
        items: loaded.items,
        planBlocks: loaded.plan?.blocks ?? [],
        truncated: loaded.truncated,
        timeZone: app.availability.get().timeZone,
        generatedAt: app.clock.now(),
      })
    },

    async plan() {
      const [plan, loaded] = await Promise.all([
        app.getLatestPlan(),
        loadTasks(app, { status: 'active' }),
      ])
      return ok({
        ...(plan ? { plan } : {}),
        plannerAvailable: app.registry.get('academic.planner.basic') !== undefined,
        availability: mapAvailability(app.availability.get()),
        tasks: loaded.cards,
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
      previews.clear()
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
        generatedAt: app.clock.now(),
      })
    },

    async createConnection(request) {
      const parsed = parse(createConnectionSchema, request)
      if (!parsed.ok) return parsed
      const body: CreateConnectionRequest = parsed.value
      const sources = buildSources(app, app.connections.list(), [])
      const source = sources.find((candidate) => candidate.sourceId === body.sourceId)
      if (!source || !source.adapterAvailable) {
        return failure('CAPABILITY_UNAVAILABLE', '当前版本不支持该数据源')
      }
      if (source.authKind !== 'unknown' && source.authKind !== body.authKind) {
        return failure('VALIDATION', '认证方式与数据源能力不匹配')
      }
      try {
        return ok(app.connections.create(body))
      } catch (error) {
        return fromError(error)
      }
    },

    async createSource(request) {
      const parsed = parse(createSourceSchema, request)
      if (!parsed.ok) return parsed
      const body: CreateSourceRequest = parsed.value
      const engine = app.sourceEngines.get(body.engine)
      if (!engine) {
        return failure('CAPABILITY_UNAVAILABLE', '该数据源引擎尚未加载')
      }
      const invalid = validateSourceCapabilities(
        engine.descriptor,
        body.authKind,
        body.loginMode,
      )
      if (invalid) return failure('VALIDATION', invalid)
      const invalidConfig = engine.descriptor.validateConfig?.(body.config ?? {})
      if (invalidConfig) {
        return failure('VALIDATION', `配置无效：${invalidConfig}`)
      }
      try {
        const created = app.sources.create(body)
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
      const current = app.sources.get(body.sourceId)
      if (!current) return failure('NOT_FOUND', '数据源不存在')
      const engine = app.sourceEngines.get(current.engine)
      if (!engine) {
        return failure('CAPABILITY_UNAVAILABLE', '该数据源引擎尚未加载')
      }
      const invalid = validateSourceCapabilities(
        engine.descriptor,
        body.authKind ?? current.authKind,
        body.loginMode ?? current.loginMode,
      )
      if (invalid) return failure('VALIDATION', invalid)
      const invalidConfig = engine.descriptor.validateConfig?.(
        body.config ?? current.config,
      )
      if (invalidConfig) {
        return failure('VALIDATION', `配置无效：${invalidConfig}`)
      }
      try {
        app.sources.update(body.sourceId, body, body.expectedVersion)
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
        app.sources.archive(body.sourceId)
        const source = sourceStatusFor(app, body.sourceId)
        return source ? ok(source) : failure('NOT_FOUND', '数据源不存在')
      } catch (error) {
        return fromError(error)
      }
    },

    async sourceLogin(request) {
      const parsed = parse(sourceIdSchema, request)
      if (!parsed.ok) return parsed
      const body: SourceIdRequest = parsed.value
      const source = app.sources.get(body.sourceId)
      if (!source) return failure('NOT_FOUND', '数据源不存在')
      if (!source.enabled || source.archived) {
        return failure('CAPABILITY_UNAVAILABLE', '数据源未启用')
      }
      const engine = app.sourceEngines.get(source.engine)
      if (!engine?.login) {
        return failure('CAPABILITY_UNAVAILABLE', '该数据源没有可用的登录流程')
      }
      const context = { sourceId: source.sourceId, config: source.config }
      try {
        const login = await engine.login(context)
        const connection =
          app.connections.list().find((entry) => entry.sourceId === source.sourceId) ??
          app.connections.create({
            sourceId: source.sourceId,
            displayName: source.displayName,
            authKind: source.authKind,
            scopes: source.capabilities,
            ...(login.accountLabel ? { accountLabel: login.accountLabel } : {}),
          })
        if (connection.authKind === 'none') return ok(connection)
        await app.connections.setSecret(connection.connectionId, login.secret)
        const verified = await app.connections.verify(
          connection.connectionId,
          async (secret) =>
            engine.verify
              ? engine.verify(context, secret)
              : { ok: true, ...(login.accountLabel ? { accountLabel: login.accountLabel } : {}) },
        )
        if (verified.status === 'auth-required') {
          return failure('AUTH_REQUIRED', verified.lastError ?? '登录会话验证失败')
        }
        return ok(verified)
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
      const job = app.scheduler.getJob(FIXTURE_SYNC_JOB_ID)
      if (!job) return failure('NOT_FOUND', '同步任务尚未初始化')
      const updated = app.scheduler.schedule({
        jobId: job.jobId,
        kind: job.kind,
        payload: job.payload,
        enabled: job.enabled,
        nextRunAt: addMinutes(app.clock.now(), body.intervalMinutes),
        policy: {
          ...job.policy,
          intervalMs: body.intervalMinutes * 60_000,
        },
      })
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
          const candidates = app.sources
            .list()
            .filter(
              (source) =>
                source.enabled &&
                app.sourceEngines.get(source.engine)?.createAdapter,
            )
          let last: SyncRunSummary | undefined
          for (const source of candidates) {
            const connection = app.connections
              .list()
              .find((entry) => entry.sourceId === source.sourceId)
            if (source.authKind !== 'none' && !connection) continue
            last = await app.syncSource(source.sourceId, connection?.connectionId)
          }
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
        reminders,
        sync: {
          jobId: FIXTURE_SYNC_JOB_ID,
          enabled: job?.enabled ?? false,
          intervalMinutes: job ? Math.round(job.policy.intervalMs / 60_000) : 15,
          ...(job ? { nextRunAt: job.nextRunAt } : {}),
        },
        plannerAvailable: app.registry.get('academic.planner.basic') !== undefined,
        generatedAt: app.clock.now(),
      })
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

    async archiveCourse(request) {
      const parsed = parse(idSchema, request)
      if (!parsed.ok) return parsed
      const body = parsed.value
      return commandReceipt(await app.archiveCourse(body.id))
    },

    async createTask(request) {
      const parsed = parse(createTaskSchema, request)
      if (!parsed.ok) return parsed
      const body: CreateTaskRequest = parsed.value
      const result = commandReceipt(await app.createTask(body))
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
  createCourse: createCourseSchema,
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
} as const
