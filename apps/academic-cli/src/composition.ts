import { createHash, randomUUID } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import {
  COMMAND,
  CapabilityRegistry,
  CapabilityUnavailableError,
  EVENT,
  parseCommand,
  systemClock,
  timeBlockSchema,
  type Clock,
  type CommandResult,
  type CourseView,
  type DisposableRegistration,
  type IdGenerator,
  type LockedBlock,
  type PlanBlock,
  type Range,
  type ReplanReason,
  type StudyPlanView,
  type SyncRunSummary,
} from '@academic/contracts'
import {
  DEFAULT_FIXTURE_COURSE,
  FixtureLmsAdapter,
} from '@academic/adapter-fixture-lms'
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
} from '@academic/notifications'
import {
  AvailabilityStore,
  PlannerService,
  ReplanStore,
  registerPlannerCapability,
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
import { backupDatabase } from './backup.js'

export class ModelUsageMeter {
  #calls = 0

  recordCall(): void {
    this.#calls += 1
  }

  count(): number {
    return this.#calls
  }
}

export interface AcademicAppOptions {
  databasePath: string
  migrationsDir?: string
  clock?: Clock
  ids?: IdGenerator
  agentWrites?: boolean
  /** Trusted host approval for each concrete agent write. */
  authorizeAgentWrite?: AgentWriteAuthorizer
  notificationWindowDays?: number
  replanHorizonDays?: number
  defaultTaskEstimates?: Partial<Record<'assignment' | 'exam' | 'quiz', number>>
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
  replans: ReplanStore
  availability: AvailabilityStore
  planner: PlannerService
  notifications: NotificationStore
  agentBridge: {
    host: InMemoryToolHost
    registration: AcademicToolRegistration
  }
  modelUsage: ModelUsageMeter
  ensureFixtureCourse(): Promise<CourseView>
  syncFixture(): Promise<SyncRunSummary>
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
  archiveCourse(courseId: string): Promise<CommandResult>
  createTask(input: CreateTaskInput): Promise<CommandResult>
  completeTask(taskId: string): Promise<CommandResult>
  reopenTask(taskId: string): Promise<CommandResult>
  changeTaskEstimate(taskId: string, estimateMinutes: number): Promise<CommandResult>
  getLatestPlan(): Promise<StudyPlanView | undefined>
  lockPlanBlock(input: LockPlanBlockInput): Promise<LockPlanResult>
  unlockPlanBlock(lockId: string): Promise<LockPlanResult>
  archivePlan(): Promise<CommandResult>
  markNotificationRead(notificationId: string): boolean
  markAllNotificationsRead(): number
  getAutomationStatus(): Promise<AutomationStatus>
  backup(targetPath: string): void
  start(): void
  stop(): void
  close(): void
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

export async function createAcademicApp(
  options: AcademicAppOptions,
): Promise<AcademicApp> {
  if (options.databasePath !== ':memory:') {
    mkdirSync(dirname(options.databasePath), { recursive: true })
  }
  const clock = options.clock ?? systemClock
  const ids = options.ids ?? { next: () => randomUUID() }
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
  const planner = new PlannerService({
    registry,
    queries: store.queries,
    commands: store.commands,
    replans,
    availability,
    clock,
    ids,
  })
  const notifications = new NotificationStore(store.database, clock)
  const adapter = new FixtureLmsAdapter()
  const connectors = new ConnectorService({
    db: store.database,
    commands: store.commands,
    queries: store.queries,
    clock,
    ids,
  })

  const plannerCapability = registerPlannerCapability(registry)
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

  const host = new InMemoryToolHost()
  const agentRegistration = registerAcademicTools(host, {
    queries: store.queries,
    commands: store.commands,
    replans,
    registry,
    ids,
    allowWrites: options.agentWrites ?? false,
    ...(options.authorizeAgentWrite
      ? { authorizeWrite: options.authorizeAgentWrite }
      : {}),
  })

  const disposables: DisposableRegistration[] = [
    plannerCapability,
    adapterCapability,
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
    nextRunAt: addMilliseconds(clock.now(), 15 * 60_000),
    policy: { intervalMs: 15 * 60_000, timeoutMs: 120_000 },
  })
  scheduler.ensureJob({
    jobId: 'planner.process-replans',
    kind: 'planner.process-replans',
    nextRunAt: addMilliseconds(clock.now(), 60_000),
    policy: { intervalMs: 60_000, timeoutMs: 60_000 },
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

  const app: AcademicApp = {
    store,
    clock,
    registry,
    dispatcher,
    scheduler,
    connectors,
    adapter,
    replans,
    availability,
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

    markNotificationRead(notificationId) {
      return notifications.markRead(notificationId)
    },

    markAllNotificationsRead() {
      return notifications.markAllRead()
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

    backup(targetPath) {
      backupDatabase(store, targetPath)
    },

    start() {
      if (started || closed) return
      started = true
      dispatcher.start()
      scheduler.start()
    },

    stop() {
      scheduler.stop()
      dispatcher.stop()
      started = false
    },

    close() {
      if (closed) return
      closed = true
      unsubscribe()
      for (const disposable of disposables.splice(0)) disposable.dispose()
      scheduler.close()
      dispatcher.close()
      store.close()
    },
  }

  return app
}
