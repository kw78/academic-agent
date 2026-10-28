import { createHash, randomUUID } from 'node:crypto'
import { mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import {
  AdapterAuthError,
  AdapterTransientError,
  COMMAND,
  CapabilityRegistry,
  courseIdentityKey,
  CapabilityUnavailableError,
  EVENT,
  SourceConflictError,
  SourceEngineRegistry,
  parseCommand,
  systemClock,
  timeBlockSchema,
  type AcademicItemView,
  type AcademicSourceAdapter,
  type AdapterCandidateSummary,
  type Clock,
  type CommandResult,
  type ConnectionSyncBinding,
  type CourseView,
  type CredentialAccess,
  type DisposableRegistration,
  type IdGenerator,
  type LockedBlock,
  type NormalizedCourse,
  type PlanBlock,
  type Range,
  type ReplanReason,
  type SourceEngine,
  type SourceCrawlOptions,
  type SourceCrawlResult,
  type SourceCaptureOptions,
  type SourceCaptureSummary,
  type SourceConfig,
  type SourceProbeEvidence,
  type StudyPlanView,
  type SyncPreview,
  type SyncRunSummary,
} from '@academic/contracts'
import {
  ConnectionManager,
  createDefaultCredentialVault,
  type CredentialVault,
} from '@academic/connections'
import {
  SourceConfigStore,
  ProbeSampleStore,
  ProbeRateLimiter,
  buildCaptureSummary,
  crawlSourcePages,
  probeSourcePage,
} from '@academic/sources'
import {
  WebSessionStore,
  safeFetchBytes,
  type ResolveHost,
  type WebCookie,
} from '@academic/web-sessions'
import {
  createBrowserSessionEngine,
  type BrowserSessionEngineOptions,
} from '@academic/source-browser'
import {
  DEFAULT_FIXTURE_COURSE,
  FixtureLmsAdapter,
  createFixtureSourceEngine,
} from '@academic/adapter-fixture-lms'
import { createBlackboardEngine } from '@academic/adapter-ustc-blackboard'
import {
  AdapterCandidateService,
  ManifestRegistry,
  ManifestStore,
  createDeclarativeEngine,
} from '@academic/adapter-runtime'
import {
  MaterialError,
  MaterialLibrary,
  MATERIAL_LIMITS,
  type MaterialFetchedResource,
  type MaterialFetcher,
} from '@academic/materials'
import {
  InMemoryToolHost,
  registerAcademicTools,
  type AcademicToolRegistration,
  type AgentWriteAuthorizer,
} from '@academic/agent-tools'
import { ConnectorService } from '@academic/connectors'
import { EventDispatcher } from '@academic/event-dispatcher'
import {
  NotificationStore,
  registerNotificationReaction,
  scanDeadlineReminders,
  type DeadlineScanResult,
} from '@academic/notifications'
import {
  AvailabilityStore,
  PlannerService,
  PreferenceStore,
  ReplanStore,
  registerPlannerCapability as registerPlannerCapabilityInRegistry,
  type AcceptPlanOptions,
  type PlanSuggestion,
  type PreviewOptions,
} from '@academic/planner-basic'
import {
  Scheduler,
  SchedulerPauseError,
  type JobRun,
  type ScheduledJob,
} from '@academic/scheduler'
import {
  createAcademicStore,
  type AcademicStore,
  type ProjectionHealth,
} from '@academic/storage-sqlite'
import {
  backupApplication,
  backupDatabase,
  type ApplicationBackupManifest,
} from './backup.js'

const FIXTURE_SYNC_JOB_ID = 'fixture-lms-sync'
const SOURCE_SYNC_JOB_KIND = 'connector.sync.source'
const DEFAULT_SYNC_INTERVAL_MS = 60 * 60_000

/** Stable per-source job id, so restarts and re-enables target the same row. */
function sourceSyncJobId(sourceId: string): string {
  return `source.sync.${sourceId}`
}

export class ModelUsageMeter {
  #calls = 0

  recordCall(): void {
    this.#calls += 1
  }

  count(): number {
    return this.#calls
  }
}

async function retryTransient<T>(
  operation: () => Promise<T>,
  attempts = 2,
): Promise<T> {
  let lastError: unknown
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation()
    } catch (error) {
      lastError = error
      if (!(error instanceof AdapterTransientError) || attempt >= attempts) {
        throw error
      }
      await new Promise((resolve) => setTimeout(resolve, 200 * attempt))
    }
  }
  throw lastError
}

export interface AcademicAppOptions {
  databasePath: string
  migrationsDir?: string
  clock?: Clock
  ids?: IdGenerator
  agentWrites?: boolean
  /** Trusted host approval for each concrete agent write. */
  authorizeAgentWrite?: AgentWriteAuthorizer
  /** Set false when a host plugin owns the planner capability lifecycle. */
  registerPlannerCapability?: boolean
  credentialVault?: CredentialVault
  credentialVaultDir?: string
  notificationWindowDays?: number
  replanHorizonDays?: number
  defaultTaskEstimates?: Partial<Record<'assignment' | 'exam' | 'quiz', number>>
  /** Additional vendor-neutral engines (tests or reviewed extensions). */
  sourceEngines?: SourceEngine[]
  /** Explicitly load the legacy Blackboard engine for new databases. */
  enableBlackboardEngine?: boolean
  manifestRegistry?: ManifestRegistry
  /** Test seams for the read-only source probe. */
  probeFetch?: typeof fetch
  probeResolveHost?: ResolveHost
  /** Override the default 1.2s spacing between source probes (tests use 0). */
  probeMinIntervalMs?: number
  /** Root directory for course material files; defaults beside the database. */
  materialsDir?: string
  /** Test seam for URL/attachment imports. */
  materialFetch?: MaterialFetcher
  /** Test seam for the guided “登录并录制” browser. */
  browserCaptureImpl?: BrowserSessionEngineOptions['captureImpl']
}

export interface AutomationStatus {
  health: ProjectionHealth
  lastSync?: SyncRunSummary
  syncRuns: SyncRunSummary[]
  jobs: ScheduledJob[]
  jobRuns: JobRun[]
  unreadNotifications: number
}

export interface CreateCourseInput {
  termId: string
  code: string
  title: string
}

export interface CreateTaskInput {
  title: string
  itemId?: string
  estimateMinutes: number
  dueAt?: string
  priority?: number
}

export interface UpdateCourseInput {
  termId?: string
  code?: string
  title?: string
}

export interface UpdateTaskDetailsInput {
  title?: string
  dueAt?: string | null
  priority?: number
  estimateMinutes?: number
}

export interface CourseMergeSummary {
  groups: number
  mergedCourses: number
  movedItems: number
  movedMaterials: number
  removedMaterials: number
  mergedInto: Array<{ fromCourseId: string; toCourseId: string }>
}

export interface LockPlanBlockInput {
  start: string
  end: string
  title?: string
}

export interface LockPlanResult {
  command: CommandResult
  removedBlocks: PlanBlock[]
  lock?: LockedBlock
  plan?: StudyPlanView
}

export interface AcademicApp {
  store: AcademicStore
  clock: Clock
  registry: CapabilityRegistry
  dispatcher: EventDispatcher
  scheduler: Scheduler
  connectors: ConnectorService
  adapter: FixtureLmsAdapter
  sources: SourceConfigStore
  sourceEngines: SourceEngineRegistry
  manifestRegistry: ManifestRegistry
  manifestStore: ManifestStore
  adapterCandidates: AdapterCandidateService
  activateAdapterCandidate(
    adapterId: string,
    version: string,
  ): Promise<{
    candidate: AdapterCandidateSummary
    sourceId?: string
    warning?: string
  }>
  rollbackAdapterCandidate(
    adapterId: string,
    version?: string,
  ): Promise<{
    candidate: AdapterCandidateSummary
    sourceId?: string
    warning?: string
  }>
  connections: ConnectionManager
  webSessions: WebSessionStore
  materials: MaterialLibrary
  replans: ReplanStore
  availability: AvailabilityStore
  preferences: PreferenceStore
  planner: PlannerService
  notifications: NotificationStore
  agentBridge: {
    host: InMemoryToolHost
    registration: AcademicToolRegistration
  }
  modelUsage: ModelUsageMeter
  ensureFixtureCourse(): Promise<CourseView>
  syncFixture(): Promise<SyncRunSummary>
  syncConnection(
    connectionId: string,
    adapter: AcademicSourceAdapter,
  ): Promise<SyncRunSummary>
  probeSource(
    sourceId: string,
    url?: string,
    options?: { captureSample?: boolean },
  ): Promise<SourceProbeEvidence>
  crawlSource(
    sourceId: string,
    startUrl: string,
    options?: SourceCrawlOptions,
  ): Promise<SourceCrawlResult>
  /**
   * Opens the source's login browser, records the traffic the user produces,
   * refreshes the saved session and returns an endpoint inventory.
   */
  captureSource(
    sourceId: string,
    options?: SourceCaptureOptions,
  ): Promise<SourceCaptureSummary>
  latestCapture(sourceId: string): SourceCaptureSummary | undefined
  previewSourceSync(sourceId: string, connectionId?: string): Promise<SyncPreview>
  syncSource(sourceId: string, connectionId?: string): Promise<SyncRunSummary>
  previewPlan(
    range: Range,
    options?: Omit<PreviewOptions, 'range'>,
  ): Promise<PlanSuggestion>
  acceptPlan(
    suggestion: PlanSuggestion,
    options?: AcceptPlanOptions,
  ): Promise<CommandResult>
  requestReplan(range: Range, reason?: ReplanReason): { replanRequestId: string; status: string }
  processPendingReplans(limit?: number): Promise<number>
  addCourse(input: CreateCourseInput): Promise<CommandResult>
  mergeDuplicateCourses(): Promise<CourseMergeSummary>
  updateCourse(courseId: string, input: UpdateCourseInput): Promise<CommandResult>
  archiveCourse(courseId: string): Promise<CommandResult>
  restoreCourse(courseId: string): Promise<CommandResult>
  deleteCourse(courseId: string): Promise<CommandResult>
  archiveItem(itemId: string): Promise<CommandResult>
  restoreItem(itemId: string): Promise<CommandResult>
  createTask(input: CreateTaskInput): Promise<CommandResult>
  updateTask(taskId: string, input: UpdateTaskDetailsInput): Promise<CommandResult>
  archiveTask(taskId: string): Promise<CommandResult>
  restoreTask(taskId: string): Promise<CommandResult>
  completeTask(taskId: string): Promise<CommandResult>
  reopenTask(taskId: string): Promise<CommandResult>
  changeTaskEstimate(taskId: string, estimateMinutes: number): Promise<CommandResult>
  getLatestPlan(): Promise<StudyPlanView | undefined>
  lockPlanBlock(input: LockPlanBlockInput): Promise<LockPlanResult>
  unlockPlanBlock(lockId: string): Promise<LockPlanResult>
  archivePlan(): Promise<CommandResult>
  registerPlannerCapability(): DisposableRegistration
  markNotificationRead(notificationId: string): boolean
  markAllNotificationsRead(): number
  scanDeadlineReminders(): Promise<DeadlineScanResult>
  getAutomationStatus(): Promise<AutomationStatus>
  /** Aligns per-source sync jobs after a source is created/archived/restored. */
  reconcileSourceSyncJobs(options?: { resume?: boolean }): void
  /** Applies one interval to the fixture and every per-source sync job. */
  applySyncInterval(intervalMinutes: number): ScheduledJob | undefined
  backup(targetPath: string): void
  /** Database + material files + SHA-256 manifest in one directory. */
  backupApplication(targetDir: string): ApplicationBackupManifest
  start(): void
  stop(): void
  /** Stops intake, waits for in-flight work, then closes the store. */
  close(): Promise<void>
}

function blocksOverlap(left: PlanBlock, right: LockedBlock): boolean {
  return (
    Date.parse(left.start) < Date.parse(right.end) &&
    Date.parse(right.start) < Date.parse(left.end)
  )
}

function failure(message: string): CommandResult {
  return { ok: false, code: 'NOT_FOUND', message }
}

function addMilliseconds(iso: string, milliseconds: number): string {
  return new Date(Date.parse(iso) + milliseconds).toISOString()
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function escapePattern(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function candidateSourceId(adapterId: string): string {
  const slug = adapterId.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').slice(0, 80)
  return `adapter-${slug}`
}

function configAllowsHost(
  config: Record<string, unknown>,
  host: string,
): boolean {
  const domains = Array.isArray(config.cookieDomains)
    ? config.cookieDomains.filter(
        (entry): entry is string => typeof entry === 'string',
      )
    : []
  const target = host.toLowerCase()
  return domains.some((entry) => {
    const domain = entry.toLowerCase().replace(/^\./, '')
    return target === domain || target.endsWith(`.${domain}`)
  })
}

export async function createAcademicApp(
  options: AcademicAppOptions,
): Promise<AcademicApp> {
  if (options.databasePath !== ':memory:') {
    mkdirSync(dirname(options.databasePath), { recursive: true })
  }
  const clock = options.clock ?? systemClock
  const ids = options.ids ?? { next: () => randomUUID() }
  // Source mutations reach this store before the scheduler wiring below; the
  // callback stays inert until reconcileSourceSyncJobs can run safely.
  let sourceJobsReady = false
  const store = createAcademicStore({
    databasePath: options.databasePath,
    ...(options.migrationsDir ? { migrationsDir: options.migrationsDir } : {}),
    clock,
    ids,
  })
  const registry = new CapabilityRegistry()
  const dispatcher = new EventDispatcher({
    events: store.events,
    checkpoints: store.checkpoints,
    clock,
  })
  const scheduler = new Scheduler({ db: store.database, clock, ids })
  const replans = new ReplanStore(store.database, clock)
  const availability = new AvailabilityStore(store.database, clock)
  const preferences = new PreferenceStore(store.database, clock)
  const planner = new PlannerService({
    registry,
    queries: store.queries,
    commands: store.commands,
    replans,
    availability,
    preferences,
    clock,
    ids,
  })
  const notifications = new NotificationStore(store.database, clock)
  const scanReminders = (): Promise<DeadlineScanResult> =>
    scanDeadlineReminders({
      queries: store.queries,
      notifications,
      clock,
    })
  const adapter = new FixtureLmsAdapter()
  const connectors = new ConnectorService({
    db: store.database,
    commands: store.commands,
    queries: store.queries,
    clock,
    ids,
  })
  const credentialVault =
    options.credentialVault ??
    createDefaultCredentialVault(options.credentialVaultDir)
  const connections = new ConnectionManager({
    db: store.database,
    vault: credentialVault,
    clock,
    ids,
  })
  const webSessions = new WebSessionStore({
    db: store.database,
    vault: credentialVault,
    clock,
    ids,
  })

  const plannerCapability =
    options.registerPlannerCapability === false
      ? undefined
      : registerPlannerCapabilityInRegistry(registry)
  const adapterCapability = registry.register({
    id: `academic.adapter.${adapter.id}`,
    kind: 'adapter',
    version: '1.0.0',
    providerPlugin: '@academic/adapter-fixture-lms',
    capabilities: ['academic.sync', 'academic.items.normalize'],
    requiredPermissions: [],
  })
  const notificationCapability = registry.register({
    id: 'academic.notification.in-app',
    kind: 'notification',
    version: '1.0.0',
    providerPlugin: '@academic/notifications',
    capabilities: ['academic.reminder.in-app'],
    requiredPermissions: [],
  })
  const sourceEngines = new SourceEngineRegistry()
  const manifestRegistry = options.manifestRegistry ?? new ManifestRegistry()
  const manifestStore = new ManifestStore({ db: store.database, clock })
  const adapterCandidates = new AdapterCandidateService(
    manifestStore,
    manifestRegistry,
    { now: () => clock.now() },
  )
  adapterCandidates.loadActive()
  const configuredEngines = options.sourceEngines ?? []
  const configuredIds = new Set(
    configuredEngines.map((engine) => engine.descriptor.id),
  )
  const sourceEngineRegistrations: DisposableRegistration[] = []
  if (!configuredIds.has('fixture')) {
    sourceEngineRegistrations.push(
      sourceEngines.register(createFixtureSourceEngine()),
    )
  }
  if (!configuredIds.has('browser-session')) {
    sourceEngineRegistrations.push(
      sourceEngines.register(
        createBrowserSessionEngine({
          ...(options.browserCaptureImpl
            ? { captureImpl: options.browserCaptureImpl }
            : {}),
        }),
      ),
    )
  }
  const hasExistingBlackboardSource =
    store.database
      .prepare(
        "SELECT 1 AS present FROM academic_sources WHERE engine = 'blackboard' LIMIT 1",
      )
      .get() !== undefined
  if (
    !configuredIds.has('blackboard') &&
    (hasExistingBlackboardSource || options.enableBlackboardEngine)
  ) {
    sourceEngineRegistrations.push(
      sourceEngines.register(createBlackboardEngine()),
    )
  }
  if (!configuredIds.has('declarative')) {
    sourceEngineRegistrations.push(
      sourceEngines.register(createDeclarativeEngine(manifestRegistry)),
    )
  }
  for (const engine of configuredEngines) {
    sourceEngineRegistrations.push(sourceEngines.register(engine))
  }

  const sources = new SourceConfigStore({
    db: store.database,
    clock,
    ids,
    validateSource(input) {
      const registered = sourceEngines.get(input.engine)
      if (!registered) return `未知 engine：${input.engine}`
      const descriptor = registered.descriptor
      if (
        descriptor.authKinds &&
        !(descriptor.authKinds as readonly string[]).includes(input.authKind)
      ) {
        return `该引擎不支持认证方式 ${input.authKind}`
      }
      if (input.loginMode) {
        if (input.authKind === 'none') return '认证方式为 none 时不应配置登录方式'
        if (!descriptor.supportsLogin) return '该引擎不支持登录流程'
        if (
          descriptor.loginModes &&
          !(descriptor.loginModes as readonly string[]).includes(input.loginMode)
        ) {
          return `该引擎不支持登录方式 ${input.loginMode}`
        }
      }
      return descriptor.validateConfig?.(input.config)
    },
    onChange(change) {
      if (!sourceJobsReady) return
      reconcileSourceSyncJobs({
        resume:
          change.type === 'created' ||
          change.type === 'restored' ||
          // Only a real disabled -> enabled transition resumes the job; an
          // unrelated edit must not override a manual pause.
          (change.type === 'updated' &&
            change.enabled &&
            change.previouslyEnabled === false),
      })
    },
  })
  sources.ensure({
    sourceId: 'fixture-lms',
    engine: 'fixture',
    displayName: 'Fixture LMS（内置演示）',
    authKind: 'none',
    capabilities: ['academic.sync', 'academic.courses.probe'],
    config: {},
  })

  // Older activations reused the manifest name, which made the sync source
  // indistinguishable from the login source in the UI.
  for (const entry of manifestRegistry.list()) {
    if (!entry.active) continue
    const manifest = manifestRegistry.get(entry.adapterId, entry.active)
    const source = sources.get(candidateSourceId(entry.adapterId))
    if (
      manifest &&
      source &&
      !source.archived &&
      source.displayName === manifest.displayName
    ) {
      sources.update(source.sourceId, {
        displayName: `${manifest.displayName}（同步）`,
      })
    }
  }

  const ephemeralMaterials =
    options.databasePath === ':memory:' && options.materialsDir === undefined
  const materialRoot =
    options.materialsDir ??
    (options.databasePath === ':memory:'
      ? join(tmpdir(), `academic-materials-${randomUUID()}`)
      : join(dirname(options.databasePath), 'materials'))

  const toMaterialResource = (
    result: Awaited<ReturnType<typeof safeFetchBytes>>,
  ): MaterialFetchedResource => ({
    status: result.status,
    finalUrl: result.finalUrl,
    ...(result.contentType ? { contentType: result.contentType } : {}),
    body: result.body,
    truncated: result.truncated,
  })

  const fetchMaterialResource: MaterialFetcher = async (url, fetchOptions) => {
    if (options.materialFetch) return options.materialFetch(url, fetchOptions)
    const target = new URL(url)
    const maxBytes = fetchOptions.maxBytes ?? MATERIAL_LIMITS.maxFileBytes
    const timeoutMs = 20_000

    if (fetchOptions.sourceId) {
      const source = sources.get(fetchOptions.sourceId)
      if (!source || source.archived || !source.enabled) {
        throw new MaterialError(
          'CAPABILITY_UNAVAILABLE',
          `数据源不可用：${fetchOptions.sourceId}`,
        )
      }
      const connection = connections
        .list()
        .find(
          (entry) => entry.sourceId === source.sourceId && entry.hasCredential,
        )
      if (!connection) {
        throw new MaterialError('AUTH_REQUIRED', '该来源没有已保存的登录会话')
      }
      const lease = await connections.openCredential(
        connection.connectionId,
        source.sourceId,
      )
      let cookies: WebCookie[] = []
      try {
        const parsed = JSON.parse(await lease.getSecret()) as {
          cookies?: WebCookie[]
        }
        cookies = parsed.cookies ?? []
      } catch {
        cookies = []
      }
      if (cookies.length === 0) {
        throw new MaterialError(
          'AUTH_REQUIRED',
          '该来源没有浏览器会话 Cookie，无法抓取资料',
        )
      }
      const configured = Array.isArray(source.config.cookieDomains)
        ? source.config.cookieDomains.filter(
            (entry): entry is string => typeof entry === 'string',
          )
        : []
      const result = await safeFetchBytes(url, {
        cookies,
        allowedHosts: configured.length > 0 ? configured : [target.hostname],
        allowSubdomains: true,
        allowedProtocols:
          source.config.allowHttp === true ? ['http:', 'https:'] : ['https:'],
        timeoutMs,
        maxBytes,
      })
      return toMaterialResource(result)
    }

    const session = webSessions.list().find((entry) => {
      const host = target.hostname.toLowerCase()
      const domain = entry.domain.toLowerCase().replace(/^\./, '')
      return host === domain || host.endsWith(`.${domain}`)
    })
    if (session || fetchOptions.sessionId) {
      const result = await webSessions.fetchBytes(
        fetchOptions.sessionId ?? session!.sessionId,
        url,
        { maxBytes, timeoutMs },
      )
      return {
        status: result.status,
        finalUrl: result.finalUrl,
        ...(result.contentType ? { contentType: result.contentType } : {}),
        body: result.body,
        truncated: result.truncated,
      }
    }

    if (target.protocol !== 'http:' && target.protocol !== 'https:') {
      throw new MaterialError('VALIDATION', '只允许 http(s) 链接')
    }
    const result = await safeFetchBytes(url, {
      allowedHosts: [target.hostname],
      allowSubdomains: false,
      allowedProtocols: target.protocol === 'http:' ? ['http:'] : ['https:'],
      timeoutMs,
      maxBytes,
    })
    return toMaterialResource(result)
  }

  const materials = new MaterialLibrary({
    db: store.database,
    clock,
    ids,
    rootDir: materialRoot,
    fetchResource: fetchMaterialResource,
    validateCourse: async (courseId) => {
      const course = await store.queries.getCourse(courseId)
      return Boolean(course && !course.deleted)
    },
    validateItem: async (itemId, courseId) => {
      const item = await store.queries.getAcademicItem(itemId)
      return Boolean(item && item.courseId === courseId && !item.archived)
    },
  })

  // A guided capture can hold 40 samples; keep the store above that so a
  // returned sampleId is never evicted before the agent can validate it.
  const probeSamples = new ProbeSampleStore({ maxSamples: 80 })
  const probeLimiter = new ProbeRateLimiter({
    ...(options.probeMinIntervalMs !== undefined
      ? { minIntervalMs: options.probeMinIntervalMs }
      : {}),
  })

  const probeSourceById = async (
    sourceId: string,
    url?: string,
    probeOptions: {
      captureSample?: boolean
      method?: 'GET' | 'POST'
      body?: Record<string, unknown>
    } = {},
  ): Promise<SourceProbeEvidence> => {
    const source = sources.get(sourceId)
    if (!source || source.archived) {
      throw new CapabilityUnavailableError(`source.${sourceId}`)
    }
    if (source.authKind === 'none') {
      throw new CapabilityUnavailableError(`source.session.${sourceId}`)
    }
    const connection = connections
      .list()
      .find((entry) => entry.sourceId === sourceId)
    if (!connection) {
      throw new CapabilityUnavailableError(`source.session.${sourceId}`)
    }
    const credentials = await connections.openCredential(
      connection.connectionId,
      sourceId,
    )
    await probeLimiter.acquire(sourceId)
    return probeSourcePage({
      sourceId,
      config: source.config,
      secret: await credentials.getSecret(),
      probedAt: clock.now(),
      ...(url ? { url } : {}),
      ...(probeOptions.method ? { method: probeOptions.method } : {}),
      ...(probeOptions.body ? { body: probeOptions.body } : {}),
      ...(probeOptions.captureSample ? { captureSample: true } : {}),
      sampleStore: probeSamples,
      ...(options.probeFetch ? { fetchImpl: options.probeFetch } : {}),
      ...(options.probeResolveHost
        ? { resolveHost: options.probeResolveHost }
        : {}),
    })
  }

  const crawlSourceById = async (
    sourceId: string,
    startUrl: string,
    crawlOptions: SourceCrawlOptions = {},
  ): Promise<SourceCrawlResult> => {
    const source = sources.get(sourceId)
    if (!source || source.archived) {
      throw new CapabilityUnavailableError(`source.${sourceId}`)
    }
    if (source.authKind === 'none') {
      throw new CapabilityUnavailableError(`source.session.${sourceId}`)
    }
    const connection = connections
      .list()
      .find((entry) => entry.sourceId === sourceId)
    if (!connection) {
      throw new CapabilityUnavailableError(`source.session.${sourceId}`)
    }
    const credentials = await connections.openCredential(
      connection.connectionId,
      sourceId,
    )
    await probeLimiter.acquire(sourceId)
    return crawlSourcePages({
      sourceId,
      config: source.config,
      secret: await credentials.getSecret(),
      startUrl,
      options: crawlOptions,
      sampleStore: probeSamples,
      ...(options.probeFetch ? { fetchImpl: options.probeFetch } : {}),
      ...(options.probeResolveHost
        ? { resolveHost: options.probeResolveHost }
        : {}),
    })
  }

  const captures = new Map<string, SourceCaptureSummary>()

  const captureSourceById = async (
    sourceId: string,
    captureOptions: SourceCaptureOptions = {},
  ): Promise<SourceCaptureSummary> => {
    const source = sources.get(sourceId)
    if (!source || source.archived) {
      throw new CapabilityUnavailableError(`source.${sourceId}`)
    }
    if (source.authKind === 'none') {
      throw new CapabilityUnavailableError(`source.session.${sourceId}`)
    }
    const engine = sourceEngines.get(source.engine)
    if (!engine?.capture) {
      throw new CapabilityUnavailableError(`source.capture.${sourceId}`)
    }
    const session = await engine.capture(
      { sourceId, config: source.config },
      captureOptions,
    )
    let connection = connections
      .list()
      .find((entry) => entry.sourceId === sourceId)
    if (!connection) {
      connection = connections.create({
        sourceId,
        displayName: source.displayName,
        authKind: source.authKind,
        scopes: source.capabilities,
      })
    }
    await connections.setSecret(connection.connectionId, session.secret)
    const warnings = [...session.warnings]
    const verify = engine.verify
    if (verify) {
      const verification = await connections.verify(
        connection.connectionId,
        async (secret) => verify({ sourceId, config: source.config }, secret),
      )
      if (verification.status === 'auth-required') {
        warnings.push(
          `会话校验未通过：${verification.lastError ?? '请确认已完成登录'}`,
        )
      }
    }
    const configuredDomains = Array.isArray(source.config.cookieDomains)
      ? source.config.cookieDomains.filter(
          (entry): entry is string => typeof entry === 'string',
        )
      : []
    const mergedDomains = [...new Set([...configuredDomains, ...session.hosts])]
    if (mergedDomains.length !== configuredDomains.length) {
      sources.update(sourceId, {
        config: { ...source.config, cookieDomains: mergedDomains },
      })
    }
    const stored = session.captures.map((capture) => {
      const sample = {
        url: capture.url,
        method: capture.method,
        body: capture.body,
        ...(capture.contentType ? { contentType: capture.contentType } : {}),
        ...(capture.requestBody ? { requestBody: capture.requestBody } : {}),
      }
      return { capture, sample, stored: probeSamples.put(sample) }
    })
    const summary = buildCaptureSummary({
      sourceId,
      captureId: ids.next(),
      startedAt: session.startedAt,
      finishedAt: session.finishedAt,
      hosts: session.hosts,
      visited: session.visited,
      samples: stored.map(({ capture, sample, stored: entry }) => ({
        sampleId: entry.sampleId,
        sample,
        status: capture.status,
        headerNames: capture.headerNames,
        ...(capture.requestContentType
          ? { requestContentType: capture.requestContentType }
          : {}),
      })),
      ...(session.skipped ? { skipped: session.skipped } : {}),
      warnings,
    })
    const available = summary.endpoints.filter(
      (endpoint) => probeSamples.get(endpoint.sampleId) !== undefined,
    )
    if (available.length !== summary.endpoints.length) {
      summary.endpoints = available
      summary.warnings.push('部分样本已过期，已从清单移除；请重新录制')
    }
    captures.set(sourceId, summary)
    return summary
  }

  const ensureCandidateSource = async (
    candidate: AdapterCandidateSummary,
  ): Promise<{ sourceId?: string; warning?: string }> => {
    const manifest = manifestRegistry.get(candidate.adapterId, candidate.version)
    // Activation already registered the manifest; missing prerequisites here
    // mean the source cannot be wired, so fail instead of leaving an active
    // version without a syncable source.
    if (!manifest) {
      throw new CapabilityUnavailableError(
        `manifest.${candidate.adapterId}@${candidate.version}`,
      )
    }
    if (!sourceEngines.get('declarative')) {
      throw new CapabilityUnavailableError('source.engine.declarative')
    }
    const syncDisplayName = manifest.displayName.endsWith('（同步）')
      ? manifest.displayName
      : `${manifest.displayName}（同步）`
    const base = new URL(manifest.baseUrl)
    const host = base.hostname
    const config = {
      manifestId: candidate.adapterId,
      manifestVersion: candidate.version,
      baseUrl: base.toString(),
      loginUrl: base.toString(),
      authenticatedUrlPatterns: [`^${escapePattern(base.origin)}/`],
      cookieDomains: [host],
      verifyUrl: base.toString(),
    }
    let sourceId = candidateSourceId(candidate.adapterId)
    let existing = sources.get(sourceId)
    if (existing?.archived) {
      sourceId = `${sourceId}-${candidate.version}`.slice(0, 200)
      existing = sources.get(sourceId)
    }
    if (!existing) {
      sources.create({
        sourceId,
        engine: 'declarative',
        displayName: syncDisplayName,
        authKind: 'token',
        loginMode: 'browser',
        capabilities: ['academic.sync'],
        config,
      })
    } else {
      sources.update(sourceId, {
        displayName: syncDisplayName,
        authKind: 'token',
        loginMode: 'browser',
        capabilities: ['academic.sync'],
        config,
      })
    }

    let warning: string | undefined
    const loginSource = sources
      .list()
      .find(
        (source) =>
          source.sourceId !== sourceId &&
          source.engine !== 'fixture' &&
          source.engine !== 'declarative' &&
          source.authKind !== 'none' &&
          configAllowsHost(source.config, host),
      )
    const loginConnection = loginSource
      ? connections
          .list()
          .find(
            (connection) =>
              connection.sourceId === loginSource.sourceId &&
              connection.hasCredential &&
              connection.status === 'connected',
          )
      : undefined
    if (loginSource && loginConnection) {
      try {
        const lease = await connections.openCredential(
          loginConnection.connectionId,
          loginSource.sourceId,
        )
        const secret = await lease.getSecret()
        const target =
          connections
            .list()
            .find((connection) => connection.sourceId === sourceId) ??
          connections.create({
            sourceId,
            displayName: syncDisplayName,
            authKind: 'token',
          })
        await connections.setSecret(target.connectionId, secret)
        // The source session was verified and the host scope already matched.
        await connections.verify(target.connectionId, async () => ({ ok: true }))
      } catch {
        warning = '已有会话无法复制；请在该数据源上重新登录'
      }
    } else if (loginSource && loginConnection === undefined) {
      warning = '请先验证原会话，再启用候选'
    } else {
      warning = '请在该数据源上完成登录后再同步'
    }
    return { sourceId, ...(warning ? { warning } : {}) }
  }

  const activateCandidate = async (
    adapterId: string,
    version: string,
  ): Promise<{
    candidate: AdapterCandidateSummary
    sourceId?: string
    warning?: string
  }> => {
    // Registry active version mirrors the persisted activation; capture it so a
    // failed source wiring can be undone instead of leaving an active version
    // that no source points at.
    const previousActiveVersion = manifestRegistry.get(adapterId)?.version
    const candidate = adapterCandidates.activate(adapterId, version)
    try {
      const activation = await ensureCandidateSource(candidate)
      return { candidate, ...activation }
    } catch (error) {
      if (previousActiveVersion) {
        try {
          adapterCandidates.rollback(adapterId, previousActiveVersion)
        } catch {
          // Keep the original failure; the message names the lost rollback.
        }
        throw new Error(
          `启用候选失败，已恢复到 ${previousActiveVersion}：${errorMessage(error)}`,
        )
      }
      throw new Error(
        `启用候选失败，且没有可恢复的旧版本；请重试启用：${errorMessage(error)}`,
      )
    }
  }

  const rollbackCandidate = async (
    adapterId: string,
    version?: string,
  ): Promise<{
    candidate: AdapterCandidateSummary
    sourceId?: string
    warning?: string
  }> => {
    const candidate = adapterCandidates.rollback(adapterId, version)
    const activation = await ensureCandidateSource(candidate)
    return { candidate, ...activation }
  }

  let appRef: AcademicApp | undefined
  const requireApp = (): AcademicApp => {
    if (!appRef) throw new Error('Academic app is not ready')
    return appRef
  }
  const requireDeclarativeSource = (sourceId: string): void => {
    const source = sources.get(sourceId)
    if (!source || source.archived) throw new Error(`Source not found: ${sourceId}`)
    if (source.engine !== 'declarative') {
      throw new Error('Adapter automation only applies to declarative sources')
    }
  }
  const connectedSessionFor = (sourceId: string) =>
    connections
      .list()
      .find(
        (connection) =>
          connection.sourceId === sourceId &&
          connection.hasCredential &&
          connection.status === 'connected',
      )
  const previewAdapterSource = async (sourceId: string): Promise<unknown> => {
    requireDeclarativeSource(sourceId)
    const connection = connectedSessionFor(sourceId)
    return requireApp().previewSourceSync(sourceId, connection?.connectionId)
  }
  const syncAdapterSource = async (sourceId: string): Promise<unknown> => {
    requireDeclarativeSource(sourceId)
    const connection = connectedSessionFor(sourceId)
    return requireApp().syncSource(sourceId, connection?.connectionId)
  }

  const host = new InMemoryToolHost()
  const agentRegistration = registerAcademicTools(host, {
    queries: store.queries,
    commands: store.commands,
    replans,
    registry,
    ids,
    sources,
    sourceEngines,
    webSessions,
    materials,
    adapterCandidates,
    activateAdapterCandidate: (request) =>
      activateCandidate(request.adapterId, request.version),
    adapterAutomation: () => preferences.get().agentAdapterAutomation,
    previewAdapterSource,
    syncAdapterSource,
    probeSource: probeSourceById,
    crawlSource: crawlSourceById,
    captureSummary: (sourceId: string) => captures.get(sourceId),
    getProbeSample: (sampleId: string) => probeSamples.get(sampleId),
    allowWrites: options.agentWrites ?? false,
    ...(options.authorizeAgentWrite
      ? { authorizeWrite: options.authorizeAgentWrite }
      : {}),
  })

  const disposables: DisposableRegistration[] = [
    ...(plannerCapability ? [plannerCapability] : []),
    adapterCapability,
    ...sourceEngineRegistrations,
    notificationCapability,
    agentRegistration,
  ]

  try {
    const notificationRegistration = await registerNotificationReaction({
      dispatcher,
      events: store.events,
      queries: store.queries,
      notifications,
      clock,
      ...(options.notificationWindowDays
        ? { windowDays: options.notificationWindowDays }
        : {}),
    })
    disposables.push(notificationRegistration)

    const horizonDays = options.replanHorizonDays ?? 14
    const replanTrigger = await dispatcher.register({
      consumerId: 'academic.planner.replan-trigger.v1',
      eventTypes: [
        EVENT.AcademicItemDiscovered,
        EVENT.AcademicItemDeadlineChanged,
        EVENT.StudyTaskCreated,
        EVENT.StudyTaskCompleted,
      ],
      projectionVersion: 1,
      startPosition: 'latest',
      handler(event) {
        const hour = new Date(clock.now())
        hour.setUTCMinutes(0, 0, 0)
        const range: Range = {
          start: hour.toISOString(),
          end: addMilliseconds(hour.toISOString(), horizonDays * 86_400_000),
        }
        const reason: ReplanReason =
          event.type === EVENT.StudyTaskCreated ||
          event.type === EVENT.StudyTaskCompleted
            ? 'tasks-changed'
            : 'items-changed'
        replans.enqueue({ reason, range, sourceKey: `event:${event.eventId}` })
      },
    })
    disposables.push(replanTrigger)

    const estimates = {
      assignment: 60,
      exam: 120,
      quiz: 30,
      ...options.defaultTaskEstimates,
    }
    const defaultTasks = await dispatcher.register({
      consumerId: 'academic.tasks.default-item-task.v1',
      eventTypes: [EVENT.AcademicItemDiscovered],
      projectionVersion: 1,
      // Beginning replays existing items exactly once; deterministic task ids
      // make the backfill and every redelivery idempotent.
      startPosition: 'beginning',
      async handler(event) {
        if (event.type !== EVENT.AcademicItemDiscovered) return
        const itemId = event.streamId.slice(event.streamId.indexOf('/') + 1)
        const taskId = `task-default-${createHash('sha256')
          .update(itemId)
          .digest('hex')
          .slice(0, 32)}`
        const result = await store.commands.execute(
          parseCommand({
            commandId: `default-task:${event.eventId}`,
            type: COMMAND.StudyTaskCreate,
            aggregateId: taskId,
            expectedVersion: 0,
            actor: { kind: 'automation', id: 'academic-task-automation' },
            correlationId: event.eventId,
            payload: {
              title:
                event.payload.kind === 'exam'
                  ? `复习：${event.payload.title}`
                  : `完成：${event.payload.title}`,
              itemId,
              estimateMinutes: estimates[event.payload.kind],
              priority: event.payload.kind === 'exam' ? 2 : 1,
              // The task intentionally has no dueAt: the planner reads the
              // linked item's current due each run, so deadline changes flow
              // through without rewriting user-editable tasks.
            },
          }),
        )
        if (!result.ok && result.code !== 'CONFLICT') {
          throw new Error(
            `Could not create default task for ${itemId}: ${result.message}`,
          )
        }
      },
    })
    disposables.push(defaultTasks)
  } catch (error) {
    scheduler.close()
    dispatcher.close()
    store.close()
    throw error
  }

  const unsubscribe = store.onAppended(() => dispatcher.wake())

  scheduler.ensureJob({
    jobId: 'fixture-lms-sync',
    kind: 'connector.sync.fixture-lms',
    nextRunAt: addMilliseconds(clock.now(), 60 * 60_000),
    policy: { intervalMs: 60 * 60_000, timeoutMs: 120_000 },
  })
  scheduler.ensureJob({
    jobId: 'planner.process-replans',
    kind: 'planner.process-replans',
    nextRunAt: addMilliseconds(clock.now(), 60_000),
    policy: { intervalMs: 60_000, timeoutMs: 60_000 },
  })
  scheduler.ensureJob({
    jobId: 'academic.reminders.scan',
    kind: 'notifications.scan-deadlines',
    nextRunAt: clock.now(),
    policy: { intervalMs: 15 * 60_000, timeoutMs: 30_000 },
  })
  scheduler.registerHandler('connector.sync.fixture-lms', async () => {
    await connectors.registerCourse(DEFAULT_FIXTURE_COURSE)
    const summary = await connectors.sync(adapter)
    await dispatcher.processOnce()
    if (summary.status === 'auth-required') {
      throw new SchedulerPauseError(
        summary.errorMessage ?? 'The fixture source requires authorization',
      )
    }
    return { summary }
  })
  scheduler.registerHandler('planner.process-replans', async () => {
    const pending = replans.listPending(20)
    let processed = 0
    for (const request of pending) {
      try {
        await planner.processReplanRequest(request.replanRequestId)
        processed += 1
      } catch (error) {
        if (error instanceof CapabilityUnavailableError) throw error
        replans.markFailed(request.replanRequestId, errorMessage(error))
      }
    }
    return { summary: { processed } }
  })
  scheduler.registerHandler('notifications.scan-deadlines', async () => ({
    summary: await scanReminders(),
  }))
  scheduler.registerHandler(SOURCE_SYNC_JOB_KIND, async ({ payload }) => {
    const sourceId =
      typeof (payload as { sourceId?: unknown } | undefined)?.sourceId === 'string'
        ? (payload as { sourceId: string }).sourceId
        : undefined
    if (!sourceId) throw new Error('source sync job is missing sourceId')
    const source = sources.get(sourceId)
    if (!source || !sourceHasSyncJob(source)) {
      // Archived, disabled, deleted or adapter-less: leave the queue instead
      // of failing every interval. restore/enable calls resume through onChange.
      throw new SchedulerPauseError(`Source is not syncable: ${sourceId}`)
    }
    let connectionId: string | undefined
    if (source.authKind !== 'none') {
      const connection = connections
        .list()
        .find(
          (entry) =>
            entry.sourceId === sourceId && entry.status === 'connected',
        )
      // No verified session: skip quietly. The connection stage already tells
      // the user to log in; retrying with a dead session only adds noise.
      if (!connection) return { summary: { sourceId, skipped: 'auth-required' } }
      connectionId = connection.connectionId
    }
    try {
      return { summary: await runSourceSync(sourceId, connectionId) }
    } catch (error) {
      if (error instanceof SourceConflictError) {
        return { summary: { sourceId, skipped: 'busy' } }
      }
      if (error instanceof AdapterAuthError) {
        return { summary: { sourceId, skipped: 'auth-required' } }
      }
      if (error instanceof CapabilityUnavailableError) {
        throw new SchedulerPauseError(error.message)
      }
      throw error
    }
  })
  // Existing sources predate the per-source jobs; install them without
  // resuming anything the user paused on purpose.
  reconcileSourceSyncJobs()
  sourceJobsReady = true

  const userActor = { kind: 'user' as const, id: 'local-user' }

  async function taskCommand(
    taskId: string,
    type: string,
    payload: unknown,
  ): Promise<CommandResult> {
    const task = await store.queries.getStudyTask(taskId)
    if (!task) return failure(`Study task not found: ${taskId}`)
    return store.commands.execute(
      parseCommand({
        commandId: ids.next(),
        type,
        aggregateId: taskId,
        expectedVersion: task.version,
        actor: userActor,
        correlationId: `task/${taskId}`,
        payload,
      }),
    )
  }

  async function revisePlan(
    plan: StudyPlanView,
    blocks: PlanBlock[],
    lockedBlocks: LockedBlock[],
  ): Promise<CommandResult> {
    const result = await store.commands.execute(
      parseCommand({
        commandId: ids.next(),
        type: COMMAND.StudyPlanRevise,
        aggregateId: plan.planId,
        expectedVersion: plan.version,
        actor: userActor,
        correlationId: `plan/${plan.planId}`,
        payload: { blocks, lockedBlocks },
      }),
    )
    if (result.ok) {
      replans.invalidateSuggestions(plan.range)
      replans.enqueue({
        reason: 'availability-changed',
        range: plan.range,
        sourceKey: `plan-change:${ids.next()}`,
      })
    }
    return result
  }

  let started = false
  let closed = false
  let closing: Promise<void> | undefined
  const syncInFlight = new Set<string>()

  const runSourceSync = async (
    sourceId: string,
    connectionId?: string,
  ): Promise<SyncRunSummary> => {
    if (syncInFlight.has(sourceId)) {
      throw new SourceConflictError(`Sync already running: ${sourceId}`)
    }
    syncInFlight.add(sourceId)
    try {
      const source = sources.get(sourceId)
      if (!source || !source.enabled || source.archived) {
        throw new CapabilityUnavailableError(`source.${sourceId}`)
      }
      const engine = sourceEngines.get(source.engine)
      if (!engine?.createAdapter) {
        throw new CapabilityUnavailableError(`source.engine.${source.engine}`)
      }
      const context = { sourceId, config: source.config }
      let credentials: CredentialAccess | undefined
      let connection: ConnectionSyncBinding | undefined
      if (connectionId) {
        const record = connections.get(connectionId)
        if (!record) throw new Error(`Connection not found: ${connectionId}`)
        if (record.sourceId !== sourceId) {
          throw new Error('Connection does not belong to the requested source')
        }
        if (source.authKind !== 'none' && record.status !== 'connected') {
          throw new Error('请先验证连接；未验证会话不能进入正式同步')
        }
        credentials = await connections.openCredential(connectionId, sourceId)
        connection = { connectionId, credentials: connections }
      } else if (source.authKind !== 'none') {
        throw new CapabilityUnavailableError(`source.credentials.${sourceId}`)
      }
      let courses: NormalizedCourse[] | undefined
      if (engine.listCourses) {
        try {
          courses = await retryTransient(() =>
            engine.listCourses!(context, credentials),
          )
          for (const course of courses) {
            await connectors.registerCourse({ ...course, sourceId })
          }
        } catch (error) {
          if (connectionId && error instanceof AdapterAuthError) {
            await connections.markAuthRequired(connectionId, error.message)
          }
          throw error
        }
      }
      const summary = await connectors.sync(engine.createAdapter(context), {
        ...(connection ? { connection } : {}),
        // The engine only covers these courses (for example after termFilter),
        // so items of other courses must not look "missing".
        ...(courses
          ? {
              scopeCourseExternalIds: courses.map(
                (course) => course.externalCourseId,
              ),
            }
          : {}),
      })
      await dispatcher.processOnce()
      return summary
    } finally {
      syncInFlight.delete(sourceId)
    }
  }

  function currentSyncIntervalMs(): number {
    return (
      scheduler.getJob(FIXTURE_SYNC_JOB_ID)?.policy.intervalMs ??
      DEFAULT_SYNC_INTERVAL_MS
    )
  }

  function sourceHasSyncJob(source: SourceConfig): boolean {
    // The fixture source keeps its dedicated job and seeded course.
    if (source.engine === 'fixture') return false
    if (!source.enabled || source.archived) return false
    return Boolean(sourceEngines.get(source.engine)?.createAdapter)
  }

  function reconcileSourceSyncJobs(options: { resume?: boolean } = {}): void {
    const intervalMs = currentSyncIntervalMs()
    for (const source of sources.list()) {
      if (!sourceHasSyncJob(source)) continue
      const jobId = sourceSyncJobId(source.sourceId)
      const existing = scheduler.getJob(jobId)
      if (!existing) {
        scheduler.ensureJob({
          jobId,
          kind: SOURCE_SYNC_JOB_KIND,
          payload: { sourceId: source.sourceId },
          nextRunAt: addMilliseconds(clock.now(), intervalMs),
          policy: { intervalMs, timeoutMs: 180_000 },
        })
      } else if (options.resume && !existing.enabled) {
        scheduler.resume(jobId)
      }
    }
    for (const job of scheduler.listJobs()) {
      if (job.kind !== SOURCE_SYNC_JOB_KIND) continue
      const sourceId = (job.payload as { sourceId?: unknown }).sourceId
      const source =
        typeof sourceId === 'string' ? sources.get(sourceId) : undefined
      if (source && sourceHasSyncJob(source)) continue
      if (job.enabled) scheduler.pause(job.jobId)
    }
  }

  function applySyncInterval(
    intervalMinutes: number,
  ): ScheduledJob | undefined {
    const intervalMs = Math.max(60_000, Math.trunc(intervalMinutes) * 60_000)
    const now = clock.now()
    let fixtureJob: ScheduledJob | undefined
    for (const job of scheduler.listJobs()) {
      if (job.jobId !== FIXTURE_SYNC_JOB_ID && job.kind !== SOURCE_SYNC_JOB_KIND) {
        continue
      }
      const updated = scheduler.schedule({
        jobId: job.jobId,
        kind: job.kind,
        payload: job.payload,
        enabled: job.enabled,
        nextRunAt: addMilliseconds(now, intervalMs),
        policy: { ...job.policy, intervalMs },
      })
      if (job.jobId === FIXTURE_SYNC_JOB_ID) fixtureJob = updated
    }
    return fixtureJob
  }

  const app: AcademicApp = {
    store,
    clock,
    registry,
    dispatcher,
    scheduler,
    connectors,
    adapter,
    sources,
    sourceEngines,
    manifestRegistry,
    manifestStore,
    adapterCandidates,
    activateAdapterCandidate: activateCandidate,
    rollbackAdapterCandidate: rollbackCandidate,
    connections,
    webSessions,
    materials,
    replans,
    availability,
    preferences,
    planner,
    notifications,
    agentBridge: { host, registration: agentRegistration },
    modelUsage: new ModelUsageMeter(),

    async ensureFixtureCourse() {
      return connectors.registerCourse(DEFAULT_FIXTURE_COURSE)
    },

    async syncFixture() {
      await connectors.registerCourse(DEFAULT_FIXTURE_COURSE)
      const summary = await connectors.sync(adapter)
      await dispatcher.processOnce()
      return summary
    },

    async syncConnection(connectionId, sourceAdapter) {
      const summary = await connectors.sync(sourceAdapter, {
        connection: { connectionId, credentials: connections },
      })
      await dispatcher.processOnce()
      return summary
    },

    probeSource: probeSourceById,
    crawlSource: crawlSourceById,
    captureSource: captureSourceById,
    latestCapture: (sourceId) => captures.get(sourceId),

    async previewSourceSync(sourceId, connectionId) {
      const source = sources.get(sourceId)
      if (!source || !source.enabled || source.archived) {
        throw new CapabilityUnavailableError(`source.${sourceId}`)
      }
      const engine = sourceEngines.get(source.engine)
      if (!engine?.createAdapter) {
        throw new CapabilityUnavailableError(`source.engine.${source.engine}`)
      }
      let connection: ConnectionSyncBinding | undefined
      if (connectionId) {
        const record = connections.get(connectionId)
        if (!record) throw new Error(`Connection not found: ${connectionId}`)
        if (record.sourceId !== sourceId) {
          throw new Error('Connection does not belong to the requested source')
        }
        connection = { connectionId, credentials: connections }
      } else if (source.authKind !== 'none') {
        throw new CapabilityUnavailableError(`source.credentials.${sourceId}`)
      }
      try {
        return await connectors.preview(
          engine.createAdapter({ sourceId, config: source.config }),
          connection ? { connection } : {},
        )
      } catch (error) {
        if (connectionId && error instanceof AdapterAuthError) {
          await connections.markAuthRequired(connectionId, error.message)
        }
        throw error
      }
    },

    syncSource: runSourceSync,

    async previewPlan(range, previewOptions = {}) {
      return planner.preview({ range, ...previewOptions })
    },

    async acceptPlan(suggestion, acceptOptions = {}) {
      return planner.accept(suggestion, acceptOptions)
    },

    requestReplan(range, reason = 'manual') {
      return replans.enqueue({
        reason,
        range,
        sourceKey: `manual:${ids.next()}`,
      })
    },

    async processPendingReplans(limit = 20) {
      const pending = replans.listPending(limit)
      let processed = 0
      for (const request of pending) {
        await planner.processReplanRequest(request.replanRequestId)
        processed += 1
      }
      return processed
    },

    async addCourse(input) {
      const existing = (await store.queries.listCourses(input.termId)).items.find(
        (course) =>
          !course.deleted &&
          !course.archived &&
          courseIdentityKey(course.termId, course.title) ===
            courseIdentityKey(input.termId, input.title),
      )
      if (existing) {
        return {
          ok: true,
          aggregateId: existing.courseId,
          version: existing.version,
          eventIds: [],
        }
      }
      const courseId = ids.next()
      return store.commands.execute(
        parseCommand({
          commandId: ids.next(),
          type: COMMAND.CourseCreate,
          aggregateId: courseId,
          expectedVersion: 0,
          actor: userActor,
          correlationId: `course/${courseId}`,
          payload: input,
        }),
      )
    },

    async mergeDuplicateCourses() {
      const actor = { kind: 'automation' as const, id: 'academic-course-merge' }
      const courses = (await store.queries.listCourses()).items.filter(
        (course) => !course.deleted && !course.archived,
      )
      const groups = new Map<string, CourseView[]>()
      for (const course of courses) {
        const key = courseIdentityKey(course.termId, course.title)
        const group = groups.get(key)
        if (group) group.push(course)
        else groups.set(key, [course])
      }

      let groupsMerged = 0
      let mergedCourses = 0
      let movedItems = 0
      let movedMaterials = 0
      let removedMaterials = 0
      const mergedInto: Array<{ fromCourseId: string; toCourseId: string }> = []

      for (const group of groups.values()) {
        if (group.length < 2) continue
        groupsMerged += 1
        group.sort(
          (left, right) =>
            left.createdAt.localeCompare(right.createdAt) ||
            left.courseId.localeCompare(right.courseId),
        )
        const canonical = group[0]!
        if (canonical.source) {
          connectors.linkCourseSource(
            canonical.source.sourceId,
            canonical.source.externalCourseId,
            canonical.courseId,
          )
        }

        for (const duplicate of group.slice(1)) {
          const items: AcademicItemView[] = []
          let cursor: string | undefined
          do {
            const page = await store.queries.listAcademicItems({
              courseId: duplicate.courseId,
              status: 'all',
              limit: 200,
              ...(cursor ? { cursor } : {}),
            })
            items.push(...page.items)
            cursor = page.nextCursor
          } while (cursor)

          for (const item of items) {
            let current = item
            for (let attempt = 0; attempt < 3; attempt += 1) {
              const result = await store.commands.execute(
                parseCommand({
                  commandId: ids.next(),
                  type: COMMAND.AcademicItemReassignCourse,
                  aggregateId: item.itemId,
                  expectedVersion: current.version,
                  actor,
                  correlationId: `course-merge/${canonical.courseId}`,
                  payload: { courseId: canonical.courseId },
                }),
              )
              if (result.ok) {
                if (result.eventIds.length > 0) movedItems += 1
                break
              }
              if (result.code !== 'CONFLICT' || attempt === 2) {
                throw new Error(`Could not move item ${item.itemId}: ${result.message}`)
              }
              const refreshed = await store.queries.getAcademicItem(item.itemId)
              if (!refreshed) break
              current = refreshed
            }
          }

          const materialMerge = materials.mergeCourse(
            duplicate.courseId,
            canonical.courseId,
          )
          movedMaterials += materialMerge.movedMaterials
          removedMaterials += materialMerge.removedMaterials

          const preference = preferences.get()
          const priority = preference.coursePriorities[duplicate.courseId]
          if (priority !== undefined) {
            const coursePriorities = { ...preference.coursePriorities }
            delete coursePriorities[duplicate.courseId]
            coursePriorities[canonical.courseId] = Math.max(
              coursePriorities[canonical.courseId] ?? 0,
              priority,
            )
            preferences.update({ coursePriorities })
          }

          if (duplicate.source) {
            connectors.linkCourseSource(
              duplicate.source.sourceId,
              duplicate.source.externalCourseId,
              canonical.courseId,
            )
          }

          const deleted = await store.commands.execute(
            parseCommand({
              commandId: ids.next(),
              type: COMMAND.CourseDelete,
              aggregateId: duplicate.courseId,
              expectedVersion: duplicate.version,
              actor,
              correlationId: `course-merge/${canonical.courseId}`,
              payload: { reason: `merged into ${canonical.courseId}` },
            }),
          )
          if (!deleted.ok) {
            throw new Error(
              `Could not close duplicate course ${duplicate.courseId}: ${deleted.message}`,
            )
          }
          mergedCourses += 1
          mergedInto.push({
            fromCourseId: duplicate.courseId,
            toCourseId: canonical.courseId,
          })
        }
      }

      return {
        groups: groupsMerged,
        mergedCourses,
        movedItems,
        movedMaterials,
        removedMaterials,
        mergedInto,
      }
    },

    async updateCourse(courseId, input) {
      const course = await store.queries.getCourse(courseId)
      if (!course) return failure(`Course not found: ${courseId}`)
      return store.commands.execute(
        parseCommand({
          commandId: ids.next(),
          type: COMMAND.CourseUpdate,
          aggregateId: courseId,
          expectedVersion: course.version,
          actor: userActor,
          correlationId: `course/${courseId}`,
          payload: input,
        }),
      )
    },

    async archiveCourse(courseId) {
      const course = await store.queries.getCourse(courseId)
      if (!course) return failure(`Course not found: ${courseId}`)
      return store.commands.execute(
        parseCommand({
          commandId: ids.next(),
          type: COMMAND.CourseArchive,
          aggregateId: courseId,
          expectedVersion: course.version,
          actor: userActor,
          correlationId: `course/${courseId}`,
          payload: {},
        }),
      )
    },

    async restoreCourse(courseId) {
      const course = await store.queries.getCourse(courseId)
      if (!course) return failure(`Course not found: ${courseId}`)
      return store.commands.execute(
        parseCommand({
          commandId: ids.next(),
          type: COMMAND.CourseRestore,
          aggregateId: courseId,
          expectedVersion: course.version,
          actor: userActor,
          correlationId: `course/${courseId}`,
          payload: {},
        }),
      )
    },

    async deleteCourse(courseId) {
      const course = await store.queries.getCourse(courseId)
      if (!course) return failure(`Course not found: ${courseId}`)

      // Deleting a course must not leave its synced items and local tasks
      // pointing at a hidden course. Archive them through their own commands.
      const items = []
      let cursor: string | undefined
      do {
        const page = await store.queries.listAcademicItems({
          courseId,
          status: 'all',
          limit: 200,
          ...(cursor ? { cursor } : {}),
        })
        items.push(...page.items)
        cursor = page.nextCursor
      } while (cursor)
      const itemIds = new Set(items.map((item) => item.itemId))

      for (const item of items) {
        if (item.archived) continue
        let version = item.version
        let archived = false
        for (let attempt = 1; attempt <= 3 && !archived; attempt += 1) {
          const result = await store.commands.execute(
            parseCommand({
              commandId: ids.next(),
              type: COMMAND.AcademicItemArchive,
              aggregateId: item.itemId,
              expectedVersion: version,
              actor: userActor,
              correlationId: `course-delete/${courseId}`,
              payload: { reason: 'course deleted' },
            }),
          )
          if (result.ok) {
            archived = true
            break
          }
          if (result.code !== 'CONFLICT') return result
          // A concurrent update won; re-read and retry rather than claiming
          // the course is fully deleted while one item stays active.
          const current = await store.queries.getAcademicItem(item.itemId)
          if (!current || current.archived) {
            archived = true
            break
          }
          version = current.version
        }
        if (!archived) {
          return {
            ok: false,
            code: 'CONFLICT',
            message: `归档事项并发冲突，课程未删除，可重试：${item.itemId}`,
          }
        }
      }

      const tasks = (
        await store.queries.listStudyTasks({
          status: 'all',
          includeArchived: true,
        })
      ).items
      for (const task of tasks) {
        if (task.archived || !task.itemId || !itemIds.has(task.itemId)) continue
        let version = task.version
        let archived = false
        for (let attempt = 1; attempt <= 3 && !archived; attempt += 1) {
          const result = await store.commands.execute(
            parseCommand({
              commandId: ids.next(),
              type: COMMAND.StudyTaskArchive,
              aggregateId: task.taskId,
              expectedVersion: version,
              actor: userActor,
              correlationId: `course-delete/${courseId}`,
              payload: { reason: 'course deleted' },
            }),
          )
          if (result.ok) {
            archived = true
            break
          }
          if (result.code !== 'CONFLICT') return result
          const current = await store.queries.getStudyTask(task.taskId)
          if (!current || current.archived) {
            archived = true
            break
          }
          version = current.version
        }
        if (!archived) {
          return {
            ok: false,
            code: 'CONFLICT',
            message: `归档任务并发冲突，课程未删除，可重试：${task.taskId}`,
          }
        }
      }

      let courseVersion = course.version
      for (let attempt = 1; attempt <= 3; attempt += 1) {
        const result = await store.commands.execute(
          parseCommand({
            commandId: ids.next(),
            type: COMMAND.CourseDelete,
            aggregateId: courseId,
            expectedVersion: courseVersion,
            actor: userActor,
            correlationId: `course/${courseId}`,
            payload: {},
          }),
        )
        if (result.ok) return result
        if (result.code !== 'CONFLICT') return result
        const current = await store.queries.getCourse(courseId)
        if (!current || current.deleted) {
          return {
            ok: true,
            aggregateId: courseId,
            version: courseVersion,
            eventIds: [],
          }
        }
        courseVersion = current.version
      }
      return {
        ok: false,
        code: 'CONFLICT',
        message: '删除课程并发冲突，事项与任务已归档，可重试删除课程',
      }
    },

    async archiveItem(itemId) {
      const item = await store.queries.getAcademicItem(itemId)
      if (!item) return failure(`Academic item not found: ${itemId}`)
      return store.commands.execute(
        parseCommand({
          commandId: ids.next(),
          type: COMMAND.AcademicItemArchive,
          aggregateId: itemId,
          expectedVersion: item.version,
          actor: userActor,
          correlationId: `item/${itemId}`,
          payload: {},
        }),
      )
    },

    async restoreItem(itemId) {
      const item = await store.queries.getAcademicItem(itemId)
      if (!item) return failure(`Academic item not found: ${itemId}`)
      return store.commands.execute(
        parseCommand({
          commandId: ids.next(),
          type: COMMAND.AcademicItemRestore,
          aggregateId: itemId,
          expectedVersion: item.version,
          actor: userActor,
          correlationId: `item/${itemId}`,
          payload: {},
        }),
      )
    },

    async createTask(input) {
      const taskId = ids.next()
      return store.commands.execute(
        parseCommand({
          commandId: ids.next(),
          type: COMMAND.StudyTaskCreate,
          aggregateId: taskId,
          expectedVersion: 0,
          actor: userActor,
          correlationId: `task/${taskId}`,
          payload: {
            title: input.title,
            estimateMinutes: input.estimateMinutes,
            ...(input.itemId ? { itemId: input.itemId } : {}),
            ...(input.dueAt ? { dueAt: input.dueAt } : {}),
            ...(input.priority !== undefined ? { priority: input.priority } : {}),
          },
        }),
      )
    },

    async updateTask(taskId, input) {
      return taskCommand(taskId, COMMAND.StudyTaskChangeDetails, input)
    },

    async archiveTask(taskId) {
      return taskCommand(taskId, COMMAND.StudyTaskArchive, {})
    },

    async restoreTask(taskId) {
      return taskCommand(taskId, COMMAND.StudyTaskRestore, {})
    },

    async completeTask(taskId) {
      return taskCommand(taskId, COMMAND.StudyTaskComplete, {})
    },

    async reopenTask(taskId) {
      return taskCommand(taskId, COMMAND.StudyTaskReopen, {})
    },

    async changeTaskEstimate(taskId, estimateMinutes) {
      return taskCommand(taskId, COMMAND.StudyTaskChangeEstimate, {
        estimateMinutes,
      })
    },

    async getLatestPlan() {
      return store.queries.getLatestStudyPlan()
    },

    async lockPlanBlock(input) {
      const block = timeBlockSchema.parse({ start: input.start, end: input.end })
      const plan = await store.queries.getLatestStudyPlan()
      if (!plan) {
        return { command: failure('No active study plan'), removedBlocks: [] }
      }
      const lock: LockedBlock = {
        id: `lock-${ids.next()}`,
        start: block.start,
        end: block.end,
        ...(input.title ? { title: input.title } : {}),
      }
      const removedBlocks = plan.blocks.filter((candidate) =>
        blocksOverlap(candidate, lock),
      )
      const remainingBlocks = plan.blocks.filter(
        (candidate) => !blocksOverlap(candidate, lock),
      )
      const command = await revisePlan(plan, remainingBlocks, [
        ...plan.lockedBlocks,
        lock,
      ])
      const updated = command.ok ? await store.queries.getLatestStudyPlan() : undefined
      return {
        command,
        removedBlocks,
        lock,
        ...(updated ? { plan: updated } : {}),
      }
    },

    async unlockPlanBlock(lockId) {
      const plan = await store.queries.getLatestStudyPlan()
      if (!plan) {
        return { command: failure('No active study plan'), removedBlocks: [] }
      }
      const lock = plan.lockedBlocks.find((candidate) => candidate.id === lockId)
      if (!lock) {
        return { command: failure(`Lock not found: ${lockId}`), removedBlocks: [] }
      }
      const command = await revisePlan(
        plan,
        plan.blocks,
        plan.lockedBlocks.filter((candidate) => candidate.id !== lockId),
      )
      const updated = command.ok ? await store.queries.getLatestStudyPlan() : undefined
      return {
        command,
        removedBlocks: [],
        lock,
        ...(updated ? { plan: updated } : {}),
      }
    },

    async archivePlan() {
      const plan = await store.queries.getLatestStudyPlan()
      if (!plan) return failure('No active study plan')
      const result = await store.commands.execute(
        parseCommand({
          commandId: ids.next(),
          type: COMMAND.StudyPlanArchive,
          aggregateId: plan.planId,
          expectedVersion: plan.version,
          actor: userActor,
          correlationId: `plan/${plan.planId}`,
          payload: { reason: 'user archived the plan' },
        }),
      )
      if (result.ok) replans.invalidateSuggestions(plan.range)
      return result
    },

    registerPlannerCapability() {
      return registerPlannerCapabilityInRegistry(registry)
    },

    markNotificationRead(notificationId) {
      return notifications.markRead(notificationId)
    },

    markAllNotificationsRead() {
      return notifications.markAllRead()
    },

    scanDeadlineReminders() {
      return scanReminders()
    },

    async getAutomationStatus() {
      const runs = await store.queries.listSyncRuns(undefined, 5)
      return {
        health: store.health(),
        ...(runs.items[0] ? { lastSync: runs.items[0] } : {}),
        syncRuns: runs.items,
        jobs: scheduler.listJobs(),
        jobRuns: scheduler.listRuns(undefined, 5),
        unreadNotifications: notifications.unreadCount(),
      }
    },

    reconcileSourceSyncJobs,

    applySyncInterval,

    backup(targetPath) {
      backupDatabase(store, targetPath)
    },

    backupApplication(targetDir) {
      return backupApplication({
        store,
        materialsDir: materialRoot,
        targetDir,
        createdAt: clock.now(),
      })
    },

    start() {
      if (started || closed) return
      started = true
      dispatcher.start()
      scheduler.start()
      // Compensation for reminders whose threshold passed while DSH was off.
      void scanReminders().catch(() => undefined)
    },

    stop() {
      scheduler.stop()
      dispatcher.stop()
      started = false
    },

    close() {
      if (closing) return closing
      closed = true
      closing = (async () => {
        unsubscribe()
        scheduler.stop()
        dispatcher.stop()
        // In-flight handlers may still write; only close the store once they
        // have finished so a reload cannot pull the database out from under them.
        await Promise.all([scheduler.waitForIdle(), dispatcher.waitForIdle()])
        for (const disposable of disposables.splice(0)) disposable.dispose()
        scheduler.close()
        dispatcher.close()
        store.close()
        if (ephemeralMaterials) {
          rmSync(materialRoot, { recursive: true, force: true })
        }
      })()
      return closing
    },
  }
  appRef = app

  return app
}
