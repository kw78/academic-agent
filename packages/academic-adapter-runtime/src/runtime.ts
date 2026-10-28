import { createHash } from 'node:crypto'
import { z } from 'zod'
import {
  AdapterAuthError,
  AdapterTransientError,
  dueSchema,
  type AcademicSourceAdapter,
  type AdapterFetchContext,
  type AdapterResult,
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
  type ResolveHost,
  type WebCookie,
} from '@academic/web-sessions'
import { extractPage, readJsonPath } from './extract.js'
import {
  ManifestRegistry,
  type AdapterManifest,
  type ManifestRequest,
} from './manifest.js'

export const declarativeConfigSchema = browserConfigSchema.extend({
  manifestId: z.string().min(1).max(200),
  manifestVersion: z.string().min(1).max(50).optional(),
  baseUrl: z.string().url().optional(),
  termFilter: z.array(z.string().min(1)).max(20).optional(),
  courseFilter: z.array(z.string().min(1)).max(50).optional(),
  maxCourses: z.number().int().min(1).max(200).optional(),
  maxAssignments: z.number().int().min(1).max(500).optional(),
  delayMs: z.number().int().min(0).max(5_000).optional(),
})

export type DeclarativeConfig = z.infer<typeof declarativeConfigSchema>

export interface DeclarativeEngineOptions extends BrowserSessionEngineOptions {
  now?: () => string
}

interface RuntimeOptions {
  fetchImpl?: typeof fetch
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
    return String(value)
  })
}

function absoluteUrl(value: string, baseUrl: string): string {
  return new URL(value, baseUrl).toString()
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
  }

  get baseUrl(): string {
    return this.#baseUrl
  }

  async get(url: string): Promise<string> {
    try {
      const result = await safeFetch(url, {
        cookies: this.#cookies,
        allowedHosts: this.#manifest.allowedOrigins,
        ...(this.#config.timeoutMs ? { timeoutMs: this.#config.timeoutMs } : {}),
        ...(this.#options.fetchImpl ? { fetchImpl: this.#options.fetchImpl } : {}),
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
  ): Promise<{ rows: Row[]; complete: boolean }> {
    const maxPages = request.maxPages ?? 1
    const rows: Row[] = []
    let currentUrl = absoluteUrl(renderTemplate(request.url, vars), this.#baseUrl)
    for (let page = 0; page < maxPages; page += 1) {
      const body = await this.get(currentUrl)
      const extracted = extractPage(body, request)
      rows.push(...extracted.rows)
      if (!extracted.next) return { rows, complete: true }
      if (page + 1 >= maxPages) return { rows, complete: false }
      currentUrl = absoluteUrl(extracted.next, currentUrl)
    }
    return { rows, complete: true }
  }

  async delay(): Promise<void> {
    const delay = this.#config.delayMs ?? 100
    if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay))
  }
}

class ManifestAdapter implements AcademicSourceAdapter {
  readonly id: string
  readonly sourceId: string
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
    const terms = this.#config.termFilter?.map((term) => term.toUpperCase())
    const filters = this.#config.courseFilter?.map((value) => value.toLowerCase())
    const courses: Array<Row & {
      externalCourseId: string
      code: string
      title: string
      termId: string
    }> = []
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
      for (const assignment of assignments.rows) {
        if (items.length >= maxAssignments) {
          truncatedAssignments = true
          partial = true
          break
        }
        const externalItemId = requiredText(assignment, 'externalItemId')
        const title = requiredText(assignment, 'title')
        if (!externalItemId || !title) {
          warnings.push(`课程「${course.title}」跳过缺少作业 ID/名称的条目`)
          continue
        }
        let detail: Row = {}
        if (this.#manifest.detail) {
          await client.delay()
          try {
            const loaded = await client.loadRows(this.#manifest.detail, {
              course,
              assignment,
            })
            detail = loaded.rows[0] ?? {}
            if (!loaded.rows[0]) {
              warnings.push(`作业「${title}」详情为空`)
              partial = true
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
        const normalized: NormalizedAcademicItem = {
          sourceId: this.sourceId,
          externalItemId,
          courseExternalId:
            requiredText(merged, 'courseExternalId') ?? course.externalCourseId,
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
                courseExternalId: course.externalCourseId,
              }),
            )
            .digest('hex'),
        }
        items.push(normalized)
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
