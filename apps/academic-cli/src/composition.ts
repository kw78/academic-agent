import { randomUUID } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import {
  CapabilityRegistry,
  CapabilityUnavailableError,
  EVENT,
  systemClock,
  type Clock,
  type CommandResult,
  type CourseView,
  type DisposableRegistration,
  type IdGenerator,
  type Range,
  type ReplanReason,
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
} from '@academic/agent-tools'
import { ConnectorService } from '@academic/connectors'
import { EventDispatcher } from '@academic/event-dispatcher'
import {
  NotificationStore,
  registerNotificationReaction,
} from '@academic/notifications'
import {
  PlannerService,
  ReplanStore,
  registerPlannerCapability,
  type AcceptPlanOptions,
  type PlanSuggestion,
  type PreviewOptions,
} from '@academic/planner-basic'
import { Scheduler, SchedulerPauseError } from '@academic/scheduler'
import { createAcademicStore, type AcademicStore } from '@academic/storage-sqlite'
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
  notificationWindowDays?: number
  replanHorizonDays?: number
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
  backup(targetPath: string): void
  start(): void
  stop(): void
  close(): void
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
  const planner = new PlannerService({
    registry,
    queries: store.queries,
    commands: store.commands,
    replans,
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
  } catch (error) {
    scheduler.close()
    dispatcher.close()
    store.close()
    throw error
  }

  const unsubscribe = store.onAppended(() => dispatcher.wake())

  scheduler.schedule({
    jobId: 'fixture-lms-sync',
    kind: 'connector.sync.fixture-lms',
    nextRunAt: addMilliseconds(clock.now(), 15 * 60_000),
    policy: { intervalMs: 15 * 60_000, timeoutMs: 120_000 },
  })
  scheduler.schedule({
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
