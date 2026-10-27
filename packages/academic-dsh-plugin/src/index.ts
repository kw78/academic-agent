import { homedir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { ACADEMIC_TOOL_NAMES } from '@academic/agent-tools'
import { createAcademicApp, type AcademicApp } from '@academic/cli'

export const name = 'academic-agent'
export const inject = ['tools']

export interface Config {
  databasePath?: string
  migrationsDir?: string
  agentWrites?: boolean
  startBackground?: boolean
  logLoad?: boolean
  selfTest?: boolean
}

const DEFAULT_MIGRATIONS_DIR = fileURLToPath(new URL('../migrations/', import.meta.url))

function defaultDatabasePath(): string {
  const home = process.env.DSH_HOME ?? join(homedir(), '.dsh')
  return join(home, 'academic-agent', 'academic.db')
}

interface ToolSpec {
  name: string
  description: string
  parameters: Record<string, unknown>
  write: boolean
}

const TOOL_SPECS: ToolSpec[] = [
  {
    name: ACADEMIC_TOOL_NAMES.ListCourses,
    description:
      'List academic courses stored by Academic Agent. Read-only; use termId to filter one term.',
    parameters: {
      termId: { type: 'string', description: 'Optional term id, e.g. 2026-fall' },
    },
    write: false,
  },
  {
    name: ACADEMIC_TOOL_NAMES.ListDueItems,
    description:
      'List active academic items (assignments, exams, quizzes) ordered by due date. Read-only.',
    parameters: {
      courseId: { type: 'string', description: 'Optional internal course id' },
      dueBefore: { type: 'string', description: 'Optional ISO-8601 upper bound' },
      limit: { type: 'integer', description: 'Optional page size, 1-200' },
    },
    write: false,
  },
  {
    name: ACADEMIC_TOOL_NAMES.GetItem,
    description: 'Get one academic item by its internal id. Read-only.',
    parameters: {
      itemId: { type: 'string', required: true, description: 'Internal academic item id' },
    },
    write: false,
  },
  {
    name: ACADEMIC_TOOL_NAMES.GetStudyPlan,
    description:
      'Get the active study plan overlapping a time range. Read-only. Returns null when no plan exists.',
    parameters: {
      rangeStart: { type: 'string', required: true, description: 'ISO-8601 range start' },
      rangeEnd: { type: 'string', required: true, description: 'ISO-8601 range end' },
    },
    write: false,
  },
  {
    name: ACADEMIC_TOOL_NAMES.UpdateTask,
    description:
      'Complete, reopen, or change the estimate of a study task. This is a write; the host must obtain trusted user approval for each call.',
    parameters: {
      taskId: { type: 'string', required: true, description: 'Internal study task id' },
      action: {
        type: 'string',
        required: true,
        enum: ['complete', 'reopen', 'change-estimate'],
        description: 'State transition to apply',
      },
      estimateMinutes: {
        type: 'integer',
        description: 'Required for change-estimate; 5-1440 minutes',
      },
    },
    write: true,
  },
  {
    name: ACADEMIC_TOOL_NAMES.RequestReplan,
    description:
      'Queue a replan request for a time range. Does not change academic facts; requires the planner capability.',
    parameters: {
      reason: {
        type: 'string',
        enum: ['items-changed', 'tasks-changed', 'availability-changed', 'manual'],
        description: 'Why replanning is requested; defaults to manual',
      },
      rangeStart: { type: 'string', required: true, description: 'ISO-8601 range start' },
      rangeEnd: { type: 'string', required: true, description: 'ISO-8601 range end' },
    },
    write: true,
  },
]

function toJsonValue(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value ?? null))
}

function registerTools(ctx: Context, app: AcademicApp): void {
  for (const spec of TOOL_SPECS) {
    ctx.tools.register(
      defineTool({
        name: spec.name,
        description: spec.description,
        parameters: spec.parameters,
        output: {
          schema: { type: 'json' },
          render: (_args, value) => [
            {
              type: 'text',
              text: typeof value === 'string' ? value : JSON.stringify(value, null, 2),
            },
          ],
        },
        timeoutMs: 30_000,
        async execute(args, exec) {
          if (exec.signal.aborted) throw new Error('Tool call was aborted')
          const result = await app.agentBridge.host.call(spec.name, args)
          if (!result.ok) {
            throw new Error(`${result.code}: ${result.message}`)
          }
          return toJsonValue(result.data)
        },
      }),
    )
  }
}

export function apply(ctx: Context, config: Config = {}): void {
  ctx.effect(async () => {
    const databasePath =
      config.databasePath ??
      process.env.ACADEMIC_AGENT_DB ??
      defaultDatabasePath()
    const app = await createAcademicApp({
      databasePath,
      migrationsDir: config.migrationsDir ?? DEFAULT_MIGRATIONS_DIR,
      agentWrites: config.agentWrites ?? false,
    })

    try {
      if (config.startBackground !== false) app.start()
      registerTools(ctx, app)

      const [courses, items] = await Promise.all([
        app.store.queries.listCourses(),
        app.store.queries.listAcademicItems({ limit: 1 }),
      ])
      const registered = ctx.tools.get(ACADEMIC_TOOL_NAMES.ListCourses) !== undefined
      if (config.logLoad !== false) {
        console.log(
          `[academic-agent] loaded db=${databasePath} tools=${app.agentBridge.host.list().length} registered=${registered} courses=${courses.items.length} items=${items.items.length}`,
        )
      }

      if (config.selfTest ?? process.env.ACADEMIC_AGENT_SELFTEST === '1') {
        try {
          const signal = new AbortController().signal
          const read = await ctx.tools.execute({
            callId: 'academic-selftest-read',
            name: ACADEMIC_TOOL_NAMES.ListCourses,
            arguments: {},
            signal,
          })
          const readCourses = read.isError
            ? -1
            : ((read.value as { courses?: unknown[] } | undefined)?.courses?.length ?? -1)
          const write = await ctx.tools.execute({
            callId: 'academic-selftest-write',
            name: ACADEMIC_TOOL_NAMES.UpdateTask,
            arguments: { taskId: 'selftest', action: 'complete' },
            signal,
          })
          console.log(
            `[academic-agent] selftest readIsError=${read.isError} readCourses=${readCourses} writeIsError=${write.isError} writeError=${write.error?.message ?? ''}`,
          )
        } catch (error) {
          console.log(
            `[academic-agent] selftest failed: ${
              error instanceof Error ? error.message : String(error)
            }`,
          )
        }
      }

      return () => app.close()
    } catch (error) {
      app.close()
      throw error
    }
  }, 'academic-agent')
}
