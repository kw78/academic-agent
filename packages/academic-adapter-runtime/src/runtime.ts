import { createHash } from 'node:crypto'
import { z } from 'zod'
import {
  AdapterAuthError,
  AdapterTransientError,
  dueSchema,
  type AcademicSourceAdapter,
  type AdapterCandidateCheck,
  type AdapterCandidateReport,
  type AdapterFetchContext,
  type AdapterResult,
  type AdapterSample,
  type CredentialAccess,
  type Due,
  type NormalizedAcademicItem,
  type NormalizedCourse,
  type SourceEngine,
  type SourceEngineContext,
  type SourceLoginResult,
  type SourceVerification,
} from '@academic/contracts'
import {
  browserConfigSchema,
  createBrowserSessionEngine,
  type BrowserSessionEngineOptions,
} from '@academic/source-browser'
import {
  SafeFetchError,
  safeFetch,
  type AllowedProtocol,
  type PinnedRequest,
  type ResolveHost,
  type WebCookie,
} from '@academic/web-sessions'
import {
  extractPage,
  readJsonPath,
  regexSafetyError,
  type FieldDiagnostic,
} from './extract.js'
import {
  ManifestRegistry,
  parseManifest,
  type AdapterManifest,
  type ManifestRequest,
} from './manifest.js'

const MAX_TOTAL_ROWS = 5_000

export const declarativeConfigSchema = browserConfigSchema.extend({
  manifestId: z.string().min(1).max(200),
  manifestVersion: z.string().min(1).max(50).optional(),
  baseUrl: z.string().url().optional(),
  termFilter: z.array(z.string().min(1)).max(20).optional(),
  courseFilter: z.array(z.string().min(1)).max(50).optional(),
  maxCourses: z.number().int().min(1).max(200).optional(),
  maxAssignments: z.number().int().min(1).max(500).optional(),
  delayMs: z.number().int().min(0).max(5_000).optional(),
  maxRequests: z.number().int().min(1).max(500).optional(),
  maxDurationMs: z.number().int().min(1_000).max(10 * 60_000).optional(),
  maxBytes: z.number().int().min(10_000).max(50 * 1024 * 1024).optional(),
})

export type DeclarativeConfig = z.infer<typeof declarativeConfigSchema>

export interface DeclarativeEngineOptions extends BrowserSessionEngineOptions {
  now?: () => string
}

interface RuntimeOptions {
  fetchImpl?: typeof fetch
  requestImpl?: PinnedRequest
  resolveHost?: ResolveHost
  now?: () => string
}

type Row = Record<string, unknown>

function text(value: unknown): string | undefined {
  if (typeof value === 'string') return value.trim() || undefined
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return undefined
}

function requiredText(row: Row, key: string): string | undefined {
  return text(row[key])
}

function renderTemplate(template: string, vars: Row): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g, (_, path: string) => {
    const value = readJsonPath(vars, path)
    if (value === undefined || value === null || value === '') {
      throw new Error(`Template variable is missing: ${path}`)
    }
    return encodeURIComponent(String(value))
  })
}

function absoluteUrl(value: string, baseUrl: string): string {
  return new URL(value, baseUrl).toString()
}

function withQuery(url: string, param: string, value: number): string {
  const parsed = new URL(url)
  parsed.searchParams.set(param, String(value))
  return parsed.toString()
}

export function renderManifestUrl(
  template: string,
  vars: Row,
  baseUrl: string,
): string {
  return absoluteUrl(renderTemplate(template, vars), baseUrl)
}

const STRUCTURAL_REQUIRED_FIELDS = new Set([
  'externalCourseId',
  'externalItemId',
  'title',
])

function diagnosticWarnings(
  label: string,
  request: ManifestRequest,
  diagnostics: FieldDiagnostic[],
  rowCount: number,
): string[] {
  const warnings: string[] = []
  for (const diagnostic of diagnostics) {
    const required =
      request.fields[diagnostic.field]?.required === true ||
      STRUCTURAL_REQUIRED_FIELDS.has(diagnostic.field)
    if (diagnostic.invalid > 0) {
      warnings.push(
        `${label}有 ${diagnostic.invalid} 行字段「${diagnostic.field}」类型转换失败`,
      )
    }
    if (diagnostic.missing > 0 && required) {
      warnings.push(
        diagnostic.missing === rowCount
          ? `${label}的所有行都缺少必需字段「${diagnostic.field}」；页面结构可能已变化`
          : `${label}有 ${diagnostic.missing} 行缺少必需字段「${diagnostic.field}」`,
      )
    }
  }
  return warnings
}

function parseDue(
  value: unknown,
  zone: string,
  utcOffsetMinutes: number,
): Due {
  if (value && typeof value === 'object') {
    const parsed = dueSchema.safeParse(value)
    return parsed.success ? parsed.data : { kind: 'unknown' }
  }
  if (typeof value !== 'string' || !value.trim()) return { kind: 'unknown' }
  const input = value.trim()
  const iso = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?)?(Z|[+-]\d{2}:\d{2})?$/.exec(
    input,
  )
  if (iso?.[1] && iso[2] && iso[3]) {
    const year = Number(iso[1])
    const month = Number(iso[2])
    const day = Number(iso[3])
    const date = `${year}-${iso[2]}-${iso[3]}`
    if (!iso[4] || !iso[5]) return { kind: 'local-date', date, zone }
    if (iso[7]) {
      const parsed = new Date(input)
      if (!Number.isNaN(parsed.getTime())) {
        return { kind: 'instant', utc: parsed.toISOString(), zone }
      }
    }
    const utc = new Date(
      Date.UTC(year, month - 1, day, Number(iso[4]), Number(iso[5]), Number(iso[6] ?? 0)) -
        utcOffsetMinutes * 60_000,
    )
    if (Number.isNaN(utc.getTime())) return { kind: 'unknown' }
    return { kind: 'instant', utc: utc.toISOString(), zone }
  }
  const slash = /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/.exec(input)
  if (slash?.[1] && slash[2] && slash[3]) {
    return {
      kind: 'local-date',
      date: `${slash[1]}-${slash[2].padStart(2, '0')}-${slash[3].padStart(2, '0')}`,
      zone,
    }
  }
  return { kind: 'unknown' }
}

function sessionCookies(secret: string): WebCookie[] {
  try {
    const parsed = JSON.parse(secret) as { cookies?: unknown }
    if (!Array.isArray(parsed.cookies) || parsed.cookies.length === 0) {
      throw new Error('missing cookies')
    }
    return parsed.cookies as WebCookie[]
  } catch {
    throw new AdapterAuthError('网站会话格式已过期，请重新登录')
  }
}

class ManifestClient {
  readonly #manifest: AdapterManifest
  readonly #config: DeclarativeConfig
  readonly #cookies: WebCookie[]
  readonly #baseUrl: string
  readonly #options: RuntimeOptions
  readonly #protocols: AllowedProtocol[]
  readonly #ports: number[]
  readonly #startedAt = Date.now()
  #requests = 0
  #bytes = 0

  constructor(
    manifest: AdapterManifest,
    config: DeclarativeConfig,
    cookies: WebCookie[],
    options: RuntimeOptions,
  ) {
    this.#manifest = manifest
    this.#config = config
    this.#cookies = cookies
    this.#baseUrl = config.baseUrl ?? manifest.baseUrl
    this.#options = options
    const allowHttp = config.allowHttp ?? manifest.allowHttp ?? false
    this.#protocols = allowHttp ? ['http:', 'https:'] : ['https:']
    const baseUrl = new URL(this.#baseUrl)
    this.#ports = baseUrl.port
      ? [Number(baseUrl.port)]
      : allowHttp
        ? [80, 443]
        : [443]
  }

  get baseUrl(): string {
    return this.#baseUrl
  }

  async get(url: string): Promise<string> {
    if (this.#requests >= (this.#config.maxRequests ?? 100)) {
      throw new AdapterTransientError('声明式抓取请求次数超过上限')
    }
    if (Date.now() - this.#startedAt > (this.#config.maxDurationMs ?? 120_000)) {
      throw new AdapterTransientError('声明式抓取超过执行时间上限')
    }
    this.#requests += 1
    let lastError: unknown
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      try {
        const body = await this.#getOnce(url)
        this.#bytes += Buffer.byteLength(body, 'utf8')
        if (this.#bytes > (this.#config.maxBytes ?? 5 * 1024 * 1024)) {
          throw new Error('声明式抓取响应总大小超过上限')
        }
        return body
      } catch (error) {
        lastError = error
        if (!(error instanceof AdapterTransientError) || attempt >= 2) {
          throw error
        }
        await new Promise((resolve) => setTimeout(resolve, 200 * attempt))
      }
    }
    throw lastError
  }

  async #getOnce(url: string): Promise<string> {
    try {
      const result = await safeFetch(url, {
        cookies: this.#cookies,
        allowedHosts: this.#manifest.allowedOrigins,
        allowedPathPrefixes: this.#manifest.allowedPathPrefixes,
        allowSubdomains: false,
        allowedProtocols: this.#protocols,
        allowedPorts: this.#ports,
        ...(this.#config.timeoutMs ? { timeoutMs: this.#config.timeoutMs } : {}),
        ...(this.#options.fetchImpl ? { fetchImpl: this.#options.fetchImpl } : {}),
        ...(this.#options.requestImpl ? { requestImpl: this.#options.requestImpl } : {}),
        ...(this.#options.resolveHost ? { resolveHost: this.#options.resolveHost } : {}),
      })
      if (result.status === 401 || result.status === 403) {
        throw new AdapterAuthError('会话已失效，请重新登录')
      }
      if (result.status >= 500) {
        throw new AdapterTransientError(`平台返回 HTTP ${result.status}`)
      }
      const loginLike = (this.#config.loggedOutPatterns ?? []).some((pattern) => {
        try {
          return new RegExp(pattern).test(`${result.finalUrl}\n${result.body.slice(0, 4_000)}`)
        } catch {
          return false
        }
      })
      if (loginLike) {
        throw new AdapterAuthError('会话已失效，请重新登录')
      }
      return result.body
    } catch (error) {
      if (
        error instanceof AdapterAuthError ||
        error instanceof AdapterTransientError
      ) {
        throw error
      }
      if (error instanceof SafeFetchError) {
        if (error.code === 'TIMEOUT' || error.code === 'NETWORK') {
          throw new AdapterTransientError(error.message)
        }
        if (error.code === 'UNSAFE_HOST') {
          throw new AdapterAuthError(
            '请求跳转到未授权站点，可能是会话失效；请重新登录',
          )
        }
        throw new AdapterTransientError(error.message)
      }
      throw new AdapterTransientError(
        error instanceof Error ? error.message : '请求失败',
      )
    }
  }

  async loadRows(
    request: ManifestRequest,
    vars: Row,
  ): Promise<{
    rows: Row[]
    complete: boolean
    diagnostics: FieldDiagnostic[]
  }> {
    const paginated = Boolean(request.pageParam || request.offsetParam)
    const maxPages = request.maxPages ?? (paginated ? 20 : 1)
    const rows: Row[] = []
    const diagnostics = new Map<string, FieldDiagnostic>()
    const collect = (page: FieldDiagnostic[]): void => {
      for (const entry of page) {
        const existing = diagnostics.get(entry.field)
        if (existing) {
          existing.missing += entry.missing
          existing.invalid += entry.invalid
        } else {
          diagnostics.set(entry.field, { ...entry })
        }
      }
    }
    const result = (complete: boolean) => ({
      rows,
      complete,
      diagnostics: [...diagnostics.values()],
    })
    const firstUrl = renderManifestUrl(request.url, vars, this.#baseUrl)
    const pageStart = request.pageStart ?? 1
    const pageStep = request.pageStep ?? 1
    let offset = request.offsetStart ?? 0
    let nextUrl: string | undefined
    for (let page = 0; page < maxPages; page += 1) {
      let currentUrl: string
      if (page === 0) {
        currentUrl = firstUrl
      } else if (request.pageParam) {
        currentUrl = withQuery(
          firstUrl,
          request.pageParam,
          pageStart + page * pageStep,
        )
      } else if (request.offsetParam) {
        currentUrl = withQuery(firstUrl, request.offsetParam, offset)
      } else if (nextUrl) {
        currentUrl = nextUrl
      } else {
        return result(true)
      }
      const body = await this.get(currentUrl)
      const extracted = extractPage(body, request)
      collect(extracted.diagnostics)
      const remaining = MAX_TOTAL_ROWS - rows.length
      if (extracted.rows.length > remaining) {
        rows.push(...extracted.rows.slice(0, Math.max(0, remaining)))
        return result(false)
      }
      rows.push(...extracted.rows)
      if (extracted.truncated) return result(false)
      if (request.pageParam || request.offsetParam) {
        if (extracted.rows.length === 0) return result(true)
        if (page + 1 >= maxPages) return result(false)
        if (request.offsetParam) {
          offset += request.offsetStep ?? extracted.rows.length
        }
        continue
      }
      if (!extracted.next) return result(true)
      if (page + 1 >= maxPages) return result(false)
      nextUrl = absoluteUrl(extracted.next, currentUrl)
    }
    return result(true)
  }

  async delay(): Promise<void> {
    const delay = this.#config.delayMs ?? 100
    if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay))
  }
}

class ManifestAdapter implements AcademicSourceAdapter {
  readonly id: string
  readonly sourceId: string
  readonly version: string
  readonly #manifest: AdapterManifest
  readonly #config: DeclarativeConfig
  readonly #options: RuntimeOptions

  constructor(
    manifest: AdapterManifest,
    sourceId: string,
    config: DeclarativeConfig,
    options: RuntimeOptions,
  ) {
    this.id = `declarative.${manifest.adapterId}`
    this.sourceId = sourceId
    this.version = manifest.version
    this.#manifest = manifest
    this.#config = config
    this.#options = options
  }

  async #client(credentials?: CredentialAccess): Promise<ManifestClient> {
    const cookies = credentials
      ? sessionCookies(await credentials.getSecret())
      : []
    return new ManifestClient(this.#manifest, this.#config, cookies, this.#options)
  }

  async listCourses(
    credentials?: CredentialAccess,
  ): Promise<NormalizedCourse[]> {
    const client = await this.#client(credentials)
    const courses = await this.#loadCourses(client)
    return courses.courses.map((course) => ({
      sourceId: this.sourceId,
      externalCourseId: course.externalCourseId,
      termId: course.termId,
      code: course.code,
      title: course.title,
    }))
  }

  async #loadCourses(
    client: ManifestClient,
  ): Promise<{ courses: Array<Row & { externalCourseId: string; code: string; title: string; termId: string }>; warnings: string[]; complete: boolean }> {
    const warnings: string[] = []
    const loaded = await client.loadRows(this.#manifest.courses, {})
    if (!loaded.complete) warnings.push('课程列表达到分页上限')
    warnings.push(
      ...diagnosticWarnings(
        '课程列表',
        this.#manifest.courses,
        loaded.diagnostics,
        loaded.rows.length,
      ),
    )
    const terms = this.#config.termFilter?.map((term) => term.toUpperCase())
    const filters = this.#config.courseFilter?.map((value) => value.toLowerCase())
    const courses: Array<Row & {
      externalCourseId: string
      code: string
      title: string
      termId: string
    }> = []
    const seenCourses = new Set<string>()
    for (const row of loaded.rows) {
      const externalCourseId = requiredText(row, 'externalCourseId')
      const code = requiredText(row, 'code')
      const title = requiredText(row, 'title')
      const termId = requiredText(row, 'termId') ?? 'unknown'
      if (!externalCourseId || !code || !title) {
        warnings.push('跳过缺少课程 ID/代码/名称的条目')
        continue
      }
      if (terms?.length && !terms.includes(termId.toUpperCase())) continue
      if (
        filters?.length &&
        !filters.some((value) => `${code} ${title}`.toLowerCase().includes(value))
      ) {
        continue
      }
      if (seenCourses.has(externalCourseId)) continue
      seenCourses.add(externalCourseId)
      courses.push({ ...row, externalCourseId, code, title, termId })
      if (courses.length >= (this.#config.maxCourses ?? 20)) break
    }
    return {
      courses,
      warnings,
      complete: loaded.complete && courses.length < (this.#config.maxCourses ?? 20),
    }
  }

  async fetch(context?: AdapterFetchContext): Promise<AdapterResult> {
    const client = await this.#client(context?.credentials)
    const warnings: string[] = []
    const items: NormalizedAcademicItem[] = []
    const loadedCourses = await this.#loadCourses(client)
    warnings.push(...loadedCourses.warnings)
    let partial = !loadedCourses.complete
    if (loadedCourses.courses.length === 0) {
      return {
        items,
        completeness: 'partial',
        fetchedAt: this.#options.now?.() ?? new Date().toISOString(),
        warnings: [...warnings, '没有匹配到课程；保留上一次有效数据'],
      }
    }
    const maxAssignments = this.#config.maxAssignments ?? 100
    const zone = this.#manifest.timeZone ?? 'UTC'
    const offset = this.#manifest.utcOffsetMinutes ?? 0
    let truncatedAssignments = false

    const appendItems = async (
      rows: Row[],
      course: (typeof loadedCourses.courses)[number] | undefined,
    ): Promise<void> => {
      for (const assignment of rows) {
        if (items.length >= maxAssignments) {
          truncatedAssignments = true
          partial = true
          return
        }
        const label = course ? `课程「${course.title}」` : '来源'
        const externalItemId = requiredText(assignment, 'externalItemId')
        const title = requiredText(assignment, 'title')
        if (!externalItemId || !title) {
          warnings.push(`${label}跳过缺少作业 ID/名称的条目`)
          continue
        }
        let detail: Row = {}
        if (this.#manifest.detail) {
          await client.delay()
          try {
            const loaded = await client.loadRows(
              this.#manifest.detail,
              course ? { course, assignment } : { assignment },
            )
            detail = loaded.rows[0] ?? {}
            if (!loaded.rows[0]) {
              warnings.push(`作业「${title}」详情为空`)
              partial = true
            } else {
              warnings.push(
                ...diagnosticWarnings(
                  `作业「${title}」详情`,
                  this.#manifest.detail,
                  loaded.diagnostics,
                  loaded.rows.length,
                ),
              )
            }
          } catch (error) {
            if (error instanceof AdapterAuthError) throw error
            warnings.push(`作业「${title}」详情读取失败：${messageOf(error)}`)
            partial = true
          }
        }
        const merged = { ...assignment, ...detail }
        const kindValue = text(merged.kind)
        const kind =
          kindValue === 'exam' || kindValue === 'quiz' || kindValue === 'assignment'
            ? kindValue
            : 'assignment'
        const due = parseDue(merged.due, zone, offset)
        const sourceUrlValue = text(merged.sourceUrl)
        const sourceUrl = sourceUrlValue
          ? absoluteUrl(sourceUrlValue, client.baseUrl)
          : undefined
        const description = text(merged.description)
        const courseExternalId =
          requiredText(merged, 'courseExternalId') ?? course?.externalCourseId
        const normalized: NormalizedAcademicItem = {
          sourceId: this.sourceId,
          externalItemId,
          ...(courseExternalId ? { courseExternalId } : {}),
          kind,
          title: requiredText(merged, 'title') ?? title,
          ...(description ? { description } : {}),
          due,
          ...(sourceUrl ? { sourceUrl } : {}),
          contentHash: createHash('sha256')
            .update(
              JSON.stringify({
                title: requiredText(merged, 'title') ?? title,
                description,
                due,
                courseExternalId: courseExternalId ?? '',
              }),
            )
            .digest('hex'),
        }
        items.push(normalized)
      }
    }

    if (this.#manifest.assignments.scope === 'source') {
      await client.delay()
      try {
        const assignments = await client.loadRows(this.#manifest.assignments, {})
        if (!assignments.complete) {
          warnings.push('作业分页达到上限')
          partial = true
        }
        warnings.push(
          ...diagnosticWarnings(
            '作业列表',
            this.#manifest.assignments,
            assignments.diagnostics,
            assignments.rows.length,
          ),
        )
        await appendItems(assignments.rows, undefined)
      } catch (error) {
        if (error instanceof AdapterAuthError) throw error
        warnings.push(`作业读取失败：${messageOf(error)}`)
        partial = true
      }
    } else {
      for (const course of loadedCourses.courses) {
        if (truncatedAssignments) break
        await client.delay()
        let assignments
        try {
          assignments = await client.loadRows(this.#manifest.assignments, {
            course,
          })
        } catch (error) {
          if (error instanceof AdapterAuthError) throw error
          warnings.push(`课程「${course.title}」作业读取失败：${messageOf(error)}`)
          partial = true
          continue
        }
        if (!assignments.complete) {
          warnings.push(`课程「${course.title}」作业分页达到上限`)
          partial = true
        }
        warnings.push(
          ...diagnosticWarnings(
            `课程「${course.title}」作业列表`,
            this.#manifest.assignments,
            assignments.diagnostics,
            assignments.rows.length,
          ),
        )
        await appendItems(assignments.rows, course)
      }
    }
    if (truncatedAssignments) {
      warnings.push(`作业数量达到上限 ${maxAssignments}，本次标记为部分同步`)
    }
    return {
      items,
      completeness: partial ? 'partial' : 'full',
      fetchedAt: this.#options.now?.() ?? new Date().toISOString(),
      warnings,
    }
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function createDeclarativeEngine(
  registry: ManifestRegistry,
  options: DeclarativeEngineOptions = {},
): SourceEngine {
  const browser = createBrowserSessionEngine(options)
  return {
    descriptor: {
      id: 'declarative',
      displayName: 'Declarative Adapter',
      description:
        '由版本化 Manifest 驱动的通用只读采集；优先声明式规则，不执行任意代码。',
      supportsSync: true,
      supportsLogin: true,
      supportsVerify: true,
      authKinds: ['token'],
      loginModes: ['browser', 'manual'],
      validateConfig(config) {
        const parsed = declarativeConfigSchema.safeParse(config)
        if (!parsed.success) {
          return parsed.error.issues
            .map((issue) => `${issue.path.join('.') || 'config'}: ${issue.message}`)
            .join('; ')
        }
        const manifest = registry.get(
          parsed.data.manifestId,
          parsed.data.manifestVersion,
        )
        if (!manifest) return `未知 Manifest：${parsed.data.manifestId}`
        const baseUrl = parsed.data.baseUrl ?? manifest.baseUrl
        const host = new URL(baseUrl).hostname
        if (
          !manifest.allowedOrigins.some(
            (origin) => host === origin || host.endsWith(`.${origin}`),
          )
        ) {
          return `baseUrl 主机不在 allowedOrigins：${host}`
        }
        return undefined
      },
    },
    async login(context: SourceEngineContext): Promise<SourceLoginResult> {
      return browser.login!(context)
    },
    async verify(
      context: SourceEngineContext,
      secret: string,
    ): Promise<SourceVerification> {
      return browser.verify!(context, secret)
    },
    async listCourses(
      context: SourceEngineContext,
      credentials?: CredentialAccess,
    ): Promise<NormalizedCourse[]> {
      const config = declarativeConfigSchema.parse(context.config)
      const manifest = registry.get(config.manifestId, config.manifestVersion)
      if (!manifest) throw new Error(`Unknown manifest: ${config.manifestId}`)
      const adapter = new ManifestAdapter(manifest, context.sourceId, config, options)
      return adapter.listCourses(credentials)
    },
    createAdapter(context: SourceEngineContext): AcademicSourceAdapter {
      const config = declarativeConfigSchema.parse(context.config)
      const manifest = registry.get(config.manifestId, config.manifestVersion)
      if (!manifest) throw new Error(`Unknown manifest: ${config.manifestId}`)
      return new ManifestAdapter(manifest, context.sourceId, config, options)
    },
  }
}

function hostAllowed(host: string, origins: string[]): boolean {
  return origins.includes(host)
}

function pathAllowed(pathname: string, prefixes: string[]): boolean {
  return prefixes.some((prefix) => {
    if (prefix === '/') return true
    if (pathname === prefix) return true
    return pathname.startsWith(prefix.endsWith('/') ? prefix : `${prefix}/`)
  })
}

interface ManifestIssue {
  stage: 'contract' | 'permissions'
  message: string
}

function validateManifestStatic(manifest: AdapterManifest): ManifestIssue[] {
  const errors: ManifestIssue[] = []
  const fail = (stage: ManifestIssue['stage'], message: string): void => {
    errors.push({ stage, message })
  }
  const allowHttp = manifest.allowHttp === true
  let basePort = 443
  try {
    const base = new URL(manifest.baseUrl)
    if (!allowHttp && base.protocol !== 'https:') {
      fail('permissions', 'baseUrl 必须使用 HTTPS，HTTP 需要显式 allowHttp')
    }
    basePort = base.port ? Number(base.port) : base.protocol === 'https:' ? 443 : 80
    if (!hostAllowed(base.hostname, manifest.allowedOrigins)) {
      fail('permissions', `baseUrl 主机不在 allowedOrigins：${base.hostname}`)
    }
  } catch {
    fail('permissions', 'baseUrl 无效')
  }

  const requests: Array<{
    name: string
    request: ManifestRequest
    vars: string[]
  }> = [
    { name: 'courses', request: manifest.courses, vars: [] },
    {
      name: 'assignments',
      request: manifest.assignments,
      vars: manifest.assignments.scope === 'source' ? [] : ['course'],
    },
    ...(manifest.detail
      ? [
          {
            name: 'detail',
            request: manifest.detail,
            vars:
              manifest.assignments.scope === 'source'
                ? ['assignment']
                : ['course', 'assignment'],
          },
        ]
      : []),
  ]
  for (const { name, request, vars } of requests) {
    for (const match of request.url.matchAll(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g)) {
      const root = match[1]?.split('.')[0]
      if (!root || !vars.includes(root)) {
        fail('contract', `${name} URL 使用了不允许的模板变量：${match[1]}`)
      }
    }
    try {
      const resolved = new URL(request.url, manifest.baseUrl)
      if (resolved.protocol !== 'http:' && resolved.protocol !== 'https:') {
        fail('permissions', `${name} URL 只允许 http(s)`)
      } else if (!allowHttp && resolved.protocol !== 'https:') {
        fail('permissions', `${name} URL 必须使用 HTTPS`)
      } else if (!allowHostInManifest(resolved.hostname, manifest)) {
        fail(
          'permissions',
          `${name} URL 主机不在 allowedOrigins：${resolved.hostname}`,
        )
      } else {
        const port = resolved.port
          ? Number(resolved.port)
          : resolved.protocol === 'https:'
            ? 443
            : 80
        if (port !== basePort) {
          fail('permissions', `${name} URL 端口必须与 baseUrl 一致：${port}`)
        }
        if (!pathAllowed(resolved.pathname, manifest.allowedPathPrefixes)) {
          fail(
            'permissions',
            `${name} URL 路径不在 allowedPathPrefixes：${resolved.pathname}`,
          )
        }
      }
    } catch {
      fail('contract', `${name} URL 无效`)
    }
    for (const [field, extractor] of Object.entries(request.fields)) {
      const derived =
        extractor.constant !== undefined || extractor.template !== undefined
      if (request.responseType === 'html' && !derived && !extractor.selector) {
        fail('contract', `${name}.${field} 需要 selector`)
      }
      if (request.responseType === 'json' && !derived && !extractor.path) {
        fail('contract', `${name}.${field} 需要 path`)
      }
      if (extractor.regex) {
        const regexError = regexSafetyError(extractor.regex)
        if (regexError) fail('contract', `${name}.${field} 正则不安全：${regexError}`)
      }
      if (extractor.template) {
        for (const match of extractor.template.matchAll(
          /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g,
        )) {
          const reference = match[1]
          if (!reference || !request.fields[reference]) {
            fail('contract', `${name}.${field} 模板引用了未知字段：${reference ?? ''}`)
          } else if (request.fields[reference]?.template) {
            fail('contract', `${name}.${field} 模板不能引用另一个模板字段`)
          }
        }
      }
    }
  }
  return errors
}

function allowHostInManifest(host: string, manifest: AdapterManifest): boolean {
  return hostAllowed(host, manifest.allowedOrigins)
}

function formatCandidateError(error: unknown): string {
  if (error && typeof error === 'object' && 'issues' in error) {
    const issues = (error as { issues?: Array<{ path: Array<string | number>; message: string }> })
      .issues
    if (Array.isArray(issues)) {
      return issues
        .map((issue) => `${issue.path.join('.') || 'manifest'}: ${issue.message}`)
        .join('; ')
    }
  }
  return error instanceof Error ? error.message : String(error)
}

/**
 * Deterministic sample replay. Requires an explicit, fully covered sample set;
 * it never hits the network and never executes generated code.
 */
export async function replayManifest(
  input: unknown,
  samples: AdapterSample[],
  options: { now?: () => string; maxCourses?: number; maxAssignments?: number } = {},
): Promise<AdapterCandidateReport> {
  const testedAt = options.now?.() ?? new Date().toISOString()
  const checks: AdapterCandidateCheck[] = []
  let manifest: AdapterManifest
  try {
    manifest = parseManifest(input)
    checks.push({ stage: 'schema', ok: true })
  } catch (error) {
    const message = formatCandidateError(error)
    return {
      ok: false,
      errors: [message],
      warnings: [],
      checks: [{ stage: 'schema', ok: false, detail: message }],
      courses: [],
      items: [],
      testedAt,
    }
  }

  const issues = validateManifestStatic(manifest)
  const contractIssues = issues.filter((issue) => issue.stage === 'contract')
  const permissionIssues = issues.filter((issue) => issue.stage === 'permissions')
  checks.push({
    stage: 'contract',
    ok: contractIssues.length === 0,
    ...(contractIssues[0] ? { detail: contractIssues[0].message } : {}),
  })
  checks.push({
    stage: 'permissions',
    ok: permissionIssues.length === 0,
    ...(permissionIssues[0] ? { detail: permissionIssues[0].message } : {}),
  })
  const errors = issues.map((issue) => issue.message)
  if (errors.length > 0) {
    return { ok: false, errors, warnings: [], courses: [], items: [], testedAt, checks }
  }

  const sampleMap = new Map<string, AdapterSample>()
  for (const sample of samples) {
    try {
      sampleMap.set(new URL(sample.url).toString(), sample)
    } catch {
      errors.push(`样本 URL 无效：${sample.url}`)
    }
  }
  if (errors.length > 0) {
    checks.push({ stage: 'sample-replay', ok: false, detail: errors[0] })
    return { ok: false, errors, warnings: [], courses: [], items: [], testedAt, checks }
  }

  const fetchImpl: typeof fetch = async (request) => {
    const key = new URL(String(request)).toString()
    const sample = sampleMap.get(key)
    if (!sample) return new Response('missing sample', { status: 404 })
    const contentType =
      sample.contentType ??
      (sample.body.trimStart().startsWith('{') ||
      sample.body.trimStart().startsWith('[')
        ? 'application/json'
        : 'text/html')
    return new Response(sample.body, {
      status: 200,
      headers: { 'content-type': contentType },
    })
  }

  const config: DeclarativeConfig = {
    loginUrl: manifest.baseUrl,
    authenticatedUrlPatterns: ['^https?://'],
    cookieDomains: manifest.allowedOrigins,
    manifestId: manifest.adapterId,
    manifestVersion: manifest.version,
    maxCourses: options.maxCourses ?? 50,
    maxAssignments: options.maxAssignments ?? 200,
    delayMs: 0,
    timeoutMs: 5_000,
  }

  try {
    const adapter = new ManifestAdapter(manifest, 'candidate', config, {
      fetchImpl,
      resolveHost: async () => [{ address: '93.184.216.34', family: 4 }],
      ...(options.now ? { now: options.now } : {}),
    })
    const courses = await adapter.listCourses()
    const result = await adapter.fetch()
    if (courses.length === 0) {
      errors.push('样本回放未识别到课程')
    }
    if (result.completeness !== 'full') {
      errors.push('样本回放未完整覆盖所有请求；请补充样本')
    }
    const replayOk = errors.length === 0
    checks.push({
      stage: 'sample-replay',
      ok: replayOk,
      ...(replayOk ? {} : { detail: errors[0] }),
    })
    return {
      ok: replayOk,
      errors,
      warnings: result.warnings,
      courses,
      items: result.items.map((item) => ({
        ...(item.externalItemId ? { externalItemId: item.externalItemId } : {}),
        title: item.title,
        kind: item.kind,
        due: item.due,
        ...(item.sourceUrl ? { sourceUrl: item.sourceUrl } : {}),
      })),
      testedAt,
      checks,
    }
  } catch (error) {
    errors.push(`样本回放失败：${formatCandidateError(error)}`)
    checks.push({ stage: 'sample-replay', ok: false, detail: errors[0] })
    return {
      ok: false,
      errors,
      warnings: [],
      courses: [],
      items: [],
      testedAt,
      checks,
    }
  }
}
