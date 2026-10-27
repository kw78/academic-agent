import {
  COMMAND,
  parseCommand,
  type CapabilityRegistryApi,
  type Clock,
  type CommandApi,
  type CommandResult,
  type DisposableRegistration,
  type Due,
  type IdGenerator,
  type LockedBlock,
  type QueryApi,
  type Range,
  type TimeBlock,
} from '@academic/contracts'
import {
  buildPlan,
  PLANNER_ID,
  PLANNER_VERSION,
  type PlannerInput,
  type PlannerTaskInput,
  type PlanSuggestion,
} from './planner.js'
import type { ReplanRequest, ReplanStore } from './replan-store.js'

export interface PlannerServiceDependencies {
  registry: CapabilityRegistryApi
  queries: QueryApi
  commands: CommandApi
  replans: ReplanStore
  clock: Clock
  ids: IdGenerator
}

export interface PreviewOptions {
  range: Range
  busyBlocks?: readonly TimeBlock[]
  lockedBlocks?: readonly LockedBlock[]
  granularityMinutes?: number
  timeZone?: string
  now?: string
}

export interface AcceptPlanOptions {
  planId?: string
  replanRequestId?: string
  actor?: { kind: 'user' | 'automation' | 'agent' | 'system'; id: string }
}

export interface ProcessReplanOptions {
  accept?: boolean
  planId?: string
  busyBlocks?: readonly TimeBlock[]
  lockedBlocks?: readonly LockedBlock[]
  granularityMinutes?: number
  timeZone?: string
  now?: string
}

export interface ReplanProcessResult {
  request: ReplanRequest
  suggestion: PlanSuggestion
  planId?: string
  command?: CommandResult
}

export function registerPlannerCapability(
  registry: CapabilityRegistryApi,
): DisposableRegistration {
  return registry.register({
    id: PLANNER_ID,
    kind: 'planner',
    version: PLANNER_VERSION,
    providerPlugin: '@academic/planner-basic',
    capabilities: [
      'academic.plan.preview',
      'academic.plan.accept',
      'academic.plan.replan',
    ],
    requiredPermissions: [],
  })
}

export class PlannerService {
  readonly #registry: CapabilityRegistryApi
  readonly #queries: QueryApi
  readonly #commands: CommandApi
  readonly #replans: ReplanStore
  readonly #clock: Clock
  readonly #ids: IdGenerator

  constructor(dependencies: PlannerServiceDependencies) {
    this.#registry = dependencies.registry
    this.#queries = dependencies.queries
    this.#commands = dependencies.commands
    this.#replans = dependencies.replans
    this.#clock = dependencies.clock
    this.#ids = dependencies.ids
  }

  plan(input: PlannerInput): PlanSuggestion {
    this.#assertAvailable()
    return buildPlan(input)
  }

  async preview(options: PreviewOptions): Promise<PlanSuggestion> {
    this.#assertAvailable()
    return buildPlan(await this.#buildInput(options))
  }

  async accept(
    suggestion: PlanSuggestion,
    options: AcceptPlanOptions = {},
  ): Promise<CommandResult> {
    this.#assertAvailable()
    const planId = options.planId ?? this.#ids.next()
    const command = parseCommand({
      commandId: this.#ids.next(),
      type: COMMAND.StudyPlanAccept,
      aggregateId: planId,
      expectedVersion: 0,
      actor: options.actor ?? { kind: 'user', id: 'local-user' },
      correlationId: `plan/${planId}`,
      payload: {
        range: suggestion.range,
        blocks: suggestion.blocks,
        lockedBlocks: suggestion.lockedBlocks,
        planner: suggestion.planner,
        ...(options.replanRequestId
          ? { replanRequestId: options.replanRequestId }
          : {}),
      },
    })
    return this.#commands.execute(command)
  }

  async processReplanRequest(
    replanRequestId: string,
    options: ProcessReplanOptions = {},
  ): Promise<ReplanProcessResult> {
    this.#assertAvailable()
    const request = this.#replans.get(replanRequestId)
    if (!request) throw new Error(`Unknown replan request: ${replanRequestId}`)
    if (request.suggestion) {
      if (options.accept && !request.planId) {
        const command = await this.accept(request.suggestion, {
          replanRequestId,
          ...(options.planId ? { planId: options.planId } : {}),
        })
        if (command.ok) {
          this.#replans.markAccepted(replanRequestId, command.aggregateId)
        }
        const updated = this.#replans.get(replanRequestId)!
        return {
          request: updated,
          suggestion: request.suggestion,
          ...(updated.planId ? { planId: updated.planId } : {}),
          command,
        }
      }
      return {
        request,
        suggestion: request.suggestion,
        ...(request.planId ? { planId: request.planId } : {}),
      }
    }

    const suggestion = buildPlan(
      await this.#buildInput({
        range: request.range,
        ...(options.busyBlocks ? { busyBlocks: options.busyBlocks } : {}),
        ...(options.lockedBlocks ? { lockedBlocks: options.lockedBlocks } : {}),
        ...(options.granularityMinutes
          ? { granularityMinutes: options.granularityMinutes }
          : {}),
        ...(options.timeZone ? { timeZone: options.timeZone } : {}),
        ...(options.now ? { now: options.now } : {}),
      }),
    )
    this.#replans.saveSuggestion(replanRequestId, suggestion)

    let command: CommandResult | undefined
    if (options.accept) {
      command = await this.accept(suggestion, {
        replanRequestId,
        ...(options.planId ? { planId: options.planId } : {}),
      })
      if (command.ok) {
        this.#replans.markAccepted(replanRequestId, command.aggregateId)
      }
    }

    const updated = this.#replans.get(replanRequestId)!
    return {
      request: updated,
      suggestion,
      ...(updated.planId ? { planId: updated.planId } : {}),
      ...(command ? { command } : {}),
    }
  }

  async #buildInput(options: PreviewOptions): Promise<PlannerInput> {
    const tasks = await this.#queries.listStudyTasks({ status: 'active' })
    const itemDue = new Map<string, Due | undefined>()
    const plannerTasks: PlannerTaskInput[] = []

    for (const task of tasks.items) {
      let due: Due | undefined
      if (!task.dueAt && task.itemId) {
        if (!itemDue.has(task.itemId)) {
          const item = await this.#queries.getAcademicItem(task.itemId)
          itemDue.set(task.itemId, item?.due)
        }
        due = itemDue.get(task.itemId)
      }
      plannerTasks.push({
        taskId: task.taskId,
        title: task.title,
        estimateMinutes: task.estimateMinutes,
        priority: task.priority,
        status: task.status,
        ...(task.itemId ? { itemId: task.itemId } : {}),
        ...(task.dueAt ? { dueAt: task.dueAt } : {}),
        ...(due ? { due } : {}),
      })
    }

    return {
      range: options.range,
      tasks: plannerTasks,
      ...(options.busyBlocks ? { busyBlocks: options.busyBlocks } : {}),
      ...(options.lockedBlocks ? { lockedBlocks: options.lockedBlocks } : {}),
      now: options.now ?? this.#clock.now(),
      ...(options.granularityMinutes
        ? { granularityMinutes: options.granularityMinutes }
        : {}),
      ...(options.timeZone ? { timeZone: options.timeZone } : {}),
    }
  }

  #assertAvailable(): void {
    this.#registry.require(PLANNER_ID)
  }
}
