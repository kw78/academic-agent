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
      'Read one page with a saved source session and return sanitized evidence (title, headings, links, scripts, endpoint candidates, JSON shape). Any public HTTPS host is allowed by default (SSRF checks still apply); a source can restrict this with probeAllowAnyPublicHost=false or list extra hosts in probeAllowedHosts. Cross-host requests do not carry the other host\'s cookies. POST is allowed only as an explicit JSON body for read-only list/detail APIs; forms and custom headers are never sent. Read-only; never returns cookies or URL query strings. If the page is an SPA shell or the data lives on another host, stop guessing URLs: ask the user to click “登录并录制” in the 连接 page, then read academic_list_capture_endpoints.',
    parameters: {
      sourceId: {
        type: 'string',
        required: true,
        description: 'Source id with a saved session',
      },
      url: {
        type: 'string',
        description:
          'Optional URL to probe; any public HTTPS host is allowed by default (cross-host requests carry no cookies for that host); defaults to the configured portal/verify URL',
      },
      capture: {
        type: 'boolean',
        description:
          'Store the raw response in the host sample store and return an opaque sampleId for offline validation',
      },
      method: {
        type: 'string',
        enum: ['GET', 'POST'],
        description:
          'HTTP method; default GET. Use POST only for read-only JSON list/detail APIs.',
      },
      body: {
        type: 'object',
        additionalProperties: true,
        description:
          'JSON body for POST (max 16 KB); requires method POST. No form encoding or custom headers.',
      },
    },
    write: false,
  },
  {
    name: ACADEMIC_TOOL_NAMES.CrawlSource,
    description:
      'Read a bounded section of a site from one URL with a saved source session. Follows GET links only, stays within a path prefix, allows any public HTTPS host by default (restrictable via probeAllowAnyPublicHost=false/probeAllowedHosts), never submits forms. Read-only; max 10 pages and depth 2.',
    parameters: {
      sourceId: { type: 'string', required: true, description: 'Source id with a saved session' },
      url: { type: 'string', required: true, description: 'Start URL; host must be authorized' },
      maxPages: { type: 'integer', description: 'Pages to fetch, 1-10; default 5' },
      maxDepth: { type: 'integer', description: 'Link depth, 0-2; default 1' },
      pathPrefix: { type: 'string', description: 'Optional path prefix, e.g. /space/' },
      capture: { type: 'boolean', description: 'Keep raw page bodies in the host sample store' },
    },
    write: false,
  },
  {
    name: ACADEMIC_TOOL_NAMES.ListCaptureEndpoints,
    description:
      'List endpoints observed in the user’s guided “登录并录制” session: method, masked URL, collections[] with exact JSON paths, field paths, pagination parameter, transport and sampleIds. Use the matching collection path as the Manifest items path; pass sampleIds to academic_validate_adapter_candidate. If transport is “form” or custom headers are required, stop and report. Read-only.',
    parameters: {
      sourceId: { type: 'string', required: true, description: 'Source id with a capture' },
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
      'Activate a validated declarative adapter version and create/update its sync source. Requires the user-enabled adapter automation preference or trusted host approval; previous versions remain for rollback.',
    parameters: {
      adapterId: { type: 'string', required: true, description: 'Adapter id' },
      version: { type: 'string', required: true, description: 'Validated version' },
    },
    write: true,
  },
  {
    name: ACADEMIC_TOOL_NAMES.PreviewSourceSync,
    description:
      'Preview a declarative source sync with the host-held session. Read-only; requires the user-enabled adapter automation preference.',
    parameters: {
      sourceId: { type: 'string', required: true, description: 'Declarative source id' },
    },
    write: false,
  },
  {
    name: ACADEMIC_TOOL_NAMES.SyncSource,
    description:
      'Sync one declarative source through Connector and Kernel. Deterministic write; requires the user-enabled adapter automation preference.',
    parameters: {
      sourceId: { type: 'string', required: true, description: 'Declarative source id' },
    },
    write: true,
  },
  {
    name: ACADEMIC_TOOL_NAMES.ListMaterials,
    description:
      'List indexed course materials. Read-only; returns metadata only, never file bytes.',
    parameters: {
      courseId: { type: 'string', description: 'Optional internal course id' },
      itemId: { type: 'string', description: 'Optional academic item id' },
      limit: { type: 'integer', description: 'Optional page size, 1-200' },
    },
    write: false,
  },
  {
    name: ACADEMIC_TOOL_NAMES.SearchMaterials,
    description:
      'Search indexed course material chunks. Returns short snippets with material title, course, page/slide and heading. Read-only; never returns a whole document.',
    parameters: {
      query: { type: 'string', required: true, description: 'Keywords, e.g. 组合逻辑 半加器' },
      courseId: { type: 'string', description: 'Optional internal course id' },
      itemId: { type: 'string', description: 'Optional academic item id' },
      limit: { type: 'integer', description: 'Optional hit count, 1-30' },
    },
    write: false,
  },
  {
    name: ACADEMIC_TOOL_NAMES.ImportMaterial,
    description:
      'Import user-provided text or one user-provided URL into a course material library. Write; requires trusted host approval. Never crawls other pages and never submits work.',
    parameters: {
      courseId: { type: 'string', required: true, description: 'Internal course id' },
      itemId: { type: 'string', description: 'Optional academic item id' },
      title: { type: 'string', description: 'Title; required with text' },
      text: { type: 'string', description: 'Pasted text to index' },
      url: { type: 'string', description: 'One user-provided http(s) URL' },
    },
    write: true,
  },
  {
    name: ACADEMIC_TOOL_NAMES.DeleteMaterial,
    description:
      'Delete one material file and its search index. Never touches academic events or school platforms. Write; requires trusted host approval.',
    parameters: {
      materialId: { type: 'string', required: true, description: 'Internal material id' },
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

