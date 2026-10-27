import { z } from 'zod'
import {
  COMMAND,
  CapabilityUnavailableError,
  isoDateTimeSchema,
  parseCommand,
  PLANNER_CAPABILITY_ID,
  type CapabilityRegistryApi,
  type CommandApi,
  type IdGenerator,
  type QueryApi,
  type ReplanReason,
  type ReplanRequestPort,
} from '@academic/contracts'

export type ToolFailureCode =
  | 'VALIDATION'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFIRM_REQUIRED'
  | 'CAPABILITY_UNAVAILABLE'
  | 'CONFLICT'
  | 'UNAVAILABLE'

export type ToolResult =
  | { ok: true; data: unknown }
  | { ok: false; code: ToolFailureCode; message: string }

export interface AcademicTool {
  name: string
  description: string
  inputSchema: z.ZodType
  execute(input: unknown): Promise<ToolResult>
}

export interface AgentWriteRequest {
  tool: string
  arguments: Record<string, unknown>
}

/**
 * Trusted host-side authorization for one concrete agent write. The model's
 * tool arguments are never sufficient proof of user consent.
 */
export type AgentWriteAuthorizer = (
  request: AgentWriteRequest,
) => boolean | Promise<boolean>

export interface AcademicToolDependencies {
  queries: QueryApi
  commands: CommandApi
  replans: ReplanRequestPort
  registry: CapabilityRegistryApi
  ids: IdGenerator
  /** Deployment permission for the agent bridge; read-only tools always work. */
  allowWrites?: boolean
  /** Per-operation trusted approval. Without it, agent writes are rejected. */
  authorizeWrite?: AgentWriteAuthorizer
}

export const ACADEMIC_TOOL_NAMES = {
  ListCourses: 'academic_list_courses',
  ListDueItems: 'academic_list_due_items',
  GetItem: 'academic_get_item',
  GetStudyPlan: 'academic_get_study_plan',
  UpdateTask: 'academic_update_task',
  RequestReplan: 'academic_request_replan',
} as const

function failure(code: ToolFailureCode, message: string): ToolResult {
  return { ok: false, code, message }
}

function success(data: unknown): ToolResult {
  return { ok: true, data }
}

function formatInputError(error: unknown): string {
  if (error instanceof z.ZodError) {
    return error.issues
      .map((issue) => `${issue.path.join('.') || 'input'}: ${issue.message}`)
      .join('; ')
  }
  return error instanceof Error ? error.message : String(error)
}

function defineTool<I>(
  name: string,
  description: string,
  schema: z.ZodType<I>,
  run: (input: I) => ToolResult | Promise<ToolResult>,
): AcademicTool {
  return {
    name,
    description,
    inputSchema: schema as unknown as z.ZodType,
    async execute(input) {
      let parsed: I
      try {
        parsed = schema.parse(input)
      } catch (error) {
        return failure('VALIDATION', formatInputError(error))
      }
      try {
        return await run(parsed)
      } catch (error) {
        if (error instanceof CapabilityUnavailableError) {
          return failure('CAPABILITY_UNAVAILABLE', error.message)
        }
        return failure(
          'UNAVAILABLE',
          error instanceof Error ? error.message : String(error),
        )
      }
    },
  }
}

const listCoursesSchema = z.object({
  termId: z.string().min(1).optional(),
})

const listDueItemsSchema = z.object({
  courseId: z.string().min(1).optional(),
  dueBefore: isoDateTimeSchema.optional(),
  limit: z.number().int().min(1).max(200).optional(),
})

const getItemSchema = z.object({
  itemId: z.string().min(1),
})

const flatRangeSchema = z
  .object({
    rangeStart: isoDateTimeSchema,
    rangeEnd: isoDateTimeSchema,
  })
  .refine((value) => Date.parse(value.rangeEnd) > Date.parse(value.rangeStart), {
    message: 'rangeEnd must be after rangeStart',
  })

const updateTaskSchema = z
  .object({
    taskId: z.string().min(1),
    action: z.enum(['complete', 'reopen', 'change-estimate']),
    estimateMinutes: z.number().int().min(5).max(1440).optional(),
  })
  .superRefine((value, context) => {
    if (value.action === 'change-estimate' && value.estimateMinutes === undefined) {
      context.addIssue({
        code: 'custom',
        path: ['estimateMinutes'],
        message: 'estimateMinutes is required for change-estimate',
      })
    }
  })

const requestReplanSchema = z
  .object({
    reason: z
      .enum(['items-changed', 'tasks-changed', 'availability-changed', 'manual'])
      .optional(),
    rangeStart: isoDateTimeSchema,
    rangeEnd: isoDateTimeSchema,
  })
  .refine((value) => Date.parse(value.rangeEnd) > Date.parse(value.rangeStart), {
    message: 'rangeEnd must be after rangeStart',
  })

export function createAcademicTools(
  dependencies: AcademicToolDependencies,
): AcademicTool[] {
  const allowWrites = dependencies.allowWrites ?? false

  async function requireWriteApproval(
    tool: string,
    args: Record<string, unknown>,
  ): Promise<ToolResult | undefined> {
    if (!allowWrites) {
      return failure('FORBIDDEN', 'Agent write access is not enabled')
    }
    if (!dependencies.authorizeWrite) {
      return failure(
        'CONFIRM_REQUIRED',
        'No trusted user-approval channel is available for this write',
      )
    }
    const approved = await dependencies.authorizeWrite({ tool, arguments: args })
    return approved
      ? undefined
      : failure('CONFIRM_REQUIRED', 'The user did not approve this write')
  }

  return [
    defineTool(
      ACADEMIC_TOOL_NAMES.ListCourses,
      'List courses from the academic database. Read-only.',
      listCoursesSchema,
      async (input) => {
        const page = await dependencies.queries.listCourses(input.termId)
        return success({ courses: page.items, meta: page.meta })
      },
    ),

    defineTool(
      ACADEMIC_TOOL_NAMES.ListDueItems,
      'List academic items ordered by due date. Read-only.',
      listDueItemsSchema,
      async (input) => {
        const page = await dependencies.queries.listAcademicItems({
          status: 'active',
          ...(input.courseId ? { courseId: input.courseId } : {}),
          ...(input.dueBefore ? { dueBefore: input.dueBefore } : {}),
          ...(input.limit ? { limit: input.limit } : {}),
        })
        return success({
          items: page.items,
          nextCursor: page.nextCursor ?? null,
          meta: page.meta,
        })
      },
    ),

    defineTool(
      ACADEMIC_TOOL_NAMES.GetItem,
      'Get one academic item by its internal id. Read-only.',
      getItemSchema,
      async (input) => {
        const item = await dependencies.queries.getAcademicItem(input.itemId)
        if (!item) return failure('NOT_FOUND', `Academic item not found: ${input.itemId}`)
        return success({ item })
      },
    ),

    defineTool(
      ACADEMIC_TOOL_NAMES.GetStudyPlan,
      'Get the active study plan overlapping a time range. Read-only.',
      flatRangeSchema,
      async (input) => {
        const plan = await dependencies.queries.getActiveStudyPlan({
          start: input.rangeStart,
          end: input.rangeEnd,
        })
        return success({ plan: plan ?? null })
      },
    ),

    defineTool(
      ACADEMIC_TOOL_NAMES.UpdateTask,
      'Complete, reopen, or change the estimate of a study task. The host must authorize each write; no model-provided flag can approve it.',
      updateTaskSchema,
      async (input) => {
        const rejection = await requireWriteApproval(
          ACADEMIC_TOOL_NAMES.UpdateTask,
          { ...input },
        )
        if (rejection) return rejection
        const task = await dependencies.queries.getStudyTask(input.taskId)
        if (!task) return failure('NOT_FOUND', `Study task not found: ${input.taskId}`)

        const type =
          input.action === 'complete'
            ? COMMAND.StudyTaskComplete
            : input.action === 'reopen'
              ? COMMAND.StudyTaskReopen
              : COMMAND.StudyTaskChangeEstimate
        const payload =
          input.action === 'change-estimate'
            ? { estimateMinutes: input.estimateMinutes! }
            : {}

        const command = parseCommand({
          commandId: dependencies.ids.next(),
          type,
          aggregateId: input.taskId,
          expectedVersion: task.version,
          actor: { kind: 'agent', id: 'academic-agent-tools' },
          correlationId: `agent-tool/${dependencies.ids.next()}`,
          payload,
        })
        const result = await dependencies.commands.execute(command)
        if (!result.ok) return failure(result.code, result.message)
        return success({
          taskId: result.aggregateId,
          version: result.version,
          eventIds: result.eventIds,
        })
      },
    ),

    defineTool(
      ACADEMIC_TOOL_NAMES.RequestReplan,
      'Queue a replan request for a time range. The host must authorize the request; an available planner is also required.',
      requestReplanSchema,
      async (input) => {
        const rejection = await requireWriteApproval(
          ACADEMIC_TOOL_NAMES.RequestReplan,
          { ...input },
        )
        if (rejection) return rejection
        dependencies.registry.require(PLANNER_CAPABILITY_ID)
        const reason: ReplanReason = input.reason ?? 'manual'
        const request = dependencies.replans.enqueue({
          reason,
          range: { start: input.rangeStart, end: input.rangeEnd },
          sourceKey: `agent:${dependencies.ids.next()}`,
        })
        return success({
          replanRequestId: request.replanRequestId,
          status: request.status,
        })
      },
    ),
  ]
}
