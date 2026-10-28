import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { ACADEMIC_TOOL_NAMES } from '@academic/agent-tools'
import type { AcademicApp } from '@academic/cli'

export const name = 'academic-tools'
export const inject = ['academicApp', 'tools']

export interface AcademicToolsConfig {
  logLoad?: boolean
  selfTest?: boolean
}

interface ToolSpec {
  name: string
  description: string
  parameters: Record<string, unknown>
  write: boolean
}

export const TOOL_SPECS: ToolSpec[] = [
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
      'Queue a replan request for a time range. Does not change academic facts; requires the planner capability and trusted host approval.',
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
  {
    name: ACADEMIC_TOOL_NAMES.ListSources,
    description:
      'List database-backed data sources and available source engines. Read-only; never returns credentials.',
    parameters: {
      includeArchived: {
        type: 'boolean',
        description: 'Include archived source definitions',
      },
    },
    write: false,
  },
  {
    name: ACADEMIC_TOOL_NAMES.ListSourceEngines,
    description: 'List generic source engines available in this Host. Read-only.',
    parameters: {},
    write: false,
  },
  {
    name: ACADEMIC_TOOL_NAMES.ProbeSource,
    description:
      'Read one authorized same-host page with a saved source session and return sanitized evidence (title, headings, links, scripts, endpoint candidates, JSON shape). Read-only; never returns cookies or URL query strings.',
    parameters: {
      sourceId: {
        type: 'string',
        required: true,
        description: 'Source id with a saved session',
      },
      url: {
        type: 'string',
        description:
          'Optional same-host URL to probe; defaults to the configured portal/verify URL',
      },
      capture: {
        type: 'boolean',
        description:
          'Store the raw response in the host sample store and return an opaque sampleId for offline validation',
      },
    },
    write: false,
  },
  {
    name: ACADEMIC_TOOL_NAMES.CreateSource,
    description:
      'Create a database-backed source definition from a known engine and non-secret JSON config. Write; requires trusted host approval. Cannot install code.',
    parameters: {
      sourceId: { type: 'string', description: 'Optional stable source id' },
      engine: { type: 'string', required: true, description: 'Engine id from academic_list_source_engines' },
      displayName: { type: 'string', required: true, description: 'Human-readable source name' },
      authKind: {
        type: 'string',
        required: true,
        enum: ['none', 'password', 'token', 'oauth'],
        description: 'Credential kind; secrets belong in the vault, never config',
      },
      loginMode: {
        type: 'string',
        enum: ['browser', 'manual'],
        description: 'Optional login interaction mode',
      },
      config: {
        type: 'object',
        additionalProperties: true,
        description: 'Non-secret engine config: URLs, selectors, rules',
      },
      capabilities: {
        type: 'array',
        items: { type: 'string' },
        description: 'Optional capability names',
      },
      enabled: { type: 'boolean', description: 'Default true' },
    },
    write: true,
  },
  {
    name: ACADEMIC_TOOL_NAMES.UpdateSource,
    description:
      'Update a database-backed source config. Write; requires trusted host approval and optimistic version when provided.',
    parameters: {
      sourceId: { type: 'string', required: true },
      displayName: { type: 'string' },
      config: { type: 'object', additionalProperties: true, description: 'Replacement non-secret config' },
      capabilities: { type: 'array', items: { type: 'string' } },
      enabled: { type: 'boolean' },
      expectedVersion: { type: 'integer', description: 'Optimistic concurrency version' },
    },
    write: true,
  },
  {
    name: ACADEMIC_TOOL_NAMES.ListWebSessions,
    description:
      'List saved website sessions (domain, label, timestamps). Read-only; never returns cookies.',
    parameters: {},
    write: false,
  },
  {
    name: ACADEMIC_TOOL_NAMES.FetchWebSession,
    description:
      'Fetch a URL with a saved website session. Returns the response body, never the Cookie. The URL host must match the saved session domain.',
    parameters: {
      sessionId: { type: 'string', required: true, description: 'Saved web session id' },
      url: { type: 'string', required: true, description: 'http(s) URL on the same domain' },
    },
    write: false,
  },
  {
    name: ACADEMIC_TOOL_NAMES.ValidateAdapterCandidate,
    description:
      'Validate a declarative adapter manifest against real page samples or host-captured sampleIds. Read-only; no network access and no generated code execution. Synthetic samples must not be used for acceptance.',
    parameters: {
      manifest: {
        type: 'object',
        additionalProperties: true,
        required: true,
        description: 'Versioned adapter manifest',
      },
      samples: {
        type: 'array',
        description:
          'Explicit real URL/body samples used for deterministic replay; never synthetic HTML',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            url: { type: 'string', required: true },
            body: { type: 'string', required: true },
            contentType: { type: 'string' },
          },
        },
      },
      sampleIds: {
        type: 'array',
        description:
          'Opaque ids from academic_probe_source with capture=true; raw bodies stay in the host',
        items: { type: 'string' },
      },
    },
    write: false,
  },
  {
    name: ACADEMIC_TOOL_NAMES.ListAdapterCandidates,
    description: 'List stored declarative adapter candidates and versions. Read-only.',
    parameters: {
      adapterId: { type: 'string', description: 'Optional adapter id filter' },
    },
    write: false,
  },
  {
    name: ACADEMIC_TOOL_NAMES.RegisterAdapterCandidate,
    description:
      'Store a declarative adapter candidate for user review. Never activates the adapter and never creates a sync source; activation is a separate user-authorized step. Use real samples or captured sampleIds.',
    parameters: {
      manifest: {
        type: 'object',
        additionalProperties: true,
        required: true,
        description: 'Versioned adapter manifest',
      },
      samples: {
        type: 'array',
        description:
          'Explicit real URL/body samples used for deterministic replay; never synthetic HTML',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            url: { type: 'string', required: true },
            body: { type: 'string', required: true },
            contentType: { type: 'string' },
          },
        },
      },
      sampleIds: {
        type: 'array',
        description:
          'Opaque ids from academic_probe_source with capture=true; raw bodies stay in the host',
        items: { type: 'string' },
      },
    },
    write: false,
  },
  {
    name: ACADEMIC_TOOL_NAMES.ActivateAdapterCandidate,
    description:
      'Activate a validated declarative adapter version and create/update its sync source. Write; requires trusted host approval; previous versions remain for rollback.',
    parameters: {
      adapterId: { type: 'string', required: true, description: 'Adapter id' },
      version: { type: 'string', required: true, description: 'Validated version' },
    },
    write: true,
  },
]

function toJsonValue(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value ?? null))
}

function registerTools(ctx: Context, app: AcademicApp): Array<() => void> {
  const disposers: Array<() => void> = []
  for (const spec of TOOL_SPECS) {
    try {
      disposers.push(ctx.tools.register(
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
      ))
    } catch (error) {
      // One bad schema must not silently drop every tool after it; report it
      // and keep registering the rest so diagnostics show the real gap.
      console.error(`[academic-tools] register failed: ${spec.name}`, error)
    }
  }
  return disposers
}

/**
 * The Agent Bridge: removing this fiber unregisters every academic tool while
 * the host's scheduler, dispatcher, planner and store keep running.
 */
export function apply(ctx: Context, config: AcademicToolsConfig = {}): void {
  ctx.effect(async () => {
    const app = await ctx.academicApp.appReady
    const disposers = registerTools(ctx, app)

    const registered = ctx.tools.get(ACADEMIC_TOOL_NAMES.ListCourses) !== undefined
    const missing = TOOL_SPECS.filter((spec) => !ctx.tools.get(spec.name)).map(
      (spec) => spec.name,
    )
    if (config.logLoad !== false) {
      console.log(
        `[academic-tools] tools=${TOOL_SPECS.length - missing.length} registered=${registered}` +
          (missing.length > 0 ? ` missing=${missing.join(',')}` : ''),
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
          `[academic-tools] selftest readIsError=${read.isError} readCourses=${readCourses} writeIsError=${write.isError} writeError=${write.error?.message ?? ''}`,
        )
      } catch (error) {
        console.log(
          `[academic-tools] selftest failed: ${
            error instanceof Error ? error.message : String(error)
          }`,
        )
      }
    }

    return () => {
      for (const dispose of disposers) dispose()
    }
  }, 'academic-tools')
}

export default { name, inject, apply }

