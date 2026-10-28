import { z } from 'zod'
import {
  AdapterAuthError,
  AdapterTransientError,
  type AcademicSourceAdapter,
  type AdapterFetchContext,
  type AdapterResult,
  type CredentialAccess,
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
  type PinnedRequest,
  type ResolveHost,
  type WebCookie,
} from '@academic/web-sessions'
import {
  findContentAreaUrls,
  isLoginPage,
  parseAssessmentDetail,
  parseAssignmentDetail,
  parseContentPage,
  parseCourseLinks,
  type ParsedContentItemRef,
} from './parse.js'

export const blackboardConfigSchema = browserConfigSchema.extend({
  portalUrl: z.string().url().optional(),
  maxCourses: z.number().int().min(1).max(200).optional(),
  maxAssignments: z.number().int().min(1).max(500).optional(),
  maxContentPages: z.number().int().min(1).max(100).optional(),
  termFilter: z.array(z.string().min(1)).max(20).optional(),
  courseFilter: z.array(z.string().min(1)).max(50).optional(),
  delayMs: z.number().int().min(0).max(5_000).optional(),
  timeZone: z.string().min(1).optional(),
  utcOffsetMinutes: z.number().int().min(-840).max(840).optional(),
})

export type BlackboardConfig = z.infer<typeof blackboardConfigSchema>

export interface BlackboardEngineOptions extends BrowserSessionEngineOptions {
  now?: () => string
}

interface ClientOptions {
  fetchImpl?: typeof fetch
  requestImpl?: PinnedRequest
  resolveHost?: ResolveHost
  now?: () => string
}

function protocolError(config: BlackboardConfig): string | undefined {
  if (config.allowHttp) return undefined
  const urls = [config.loginUrl, config.portalUrl, config.verifyUrl].filter(
    (value): value is string => Boolean(value),
  )
  for (const value of urls) {
    if (new URL(value).protocol !== 'https:') {
      return `Blackboard 地址必须使用 HTTPS：${value}`
    }
  }
  return undefined
}

function parseConfig(config: Record<string, unknown>): BlackboardConfig {
  const parsed = blackboardConfigSchema.parse(config)
  const error = protocolError(parsed)
  if (error) throw new Error(error)
  return parsed
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

class BlackboardClient {
  readonly #config: BlackboardConfig
  readonly #cookies: WebCookie[]
  readonly #fetchImpl: typeof fetch | undefined
  readonly #requestImpl: PinnedRequest | undefined
  readonly #resolveHost: ResolveHost | undefined

  constructor(
    config: BlackboardConfig,
    cookies: WebCookie[],
    options: ClientOptions,
  ) {
    this.#config = config
    this.#cookies = cookies
    this.#fetchImpl = options.fetchImpl
    this.#requestImpl = options.requestImpl
    this.#resolveHost = options.resolveHost
  }

  async get(url: string): Promise<{ html: string; finalUrl: string }> {
    let lastError: unknown
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      try {
        return await this.#getOnce(url)
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

  async #getOnce(url: string): Promise<{ html: string; finalUrl: string }> {
    try {
      const result = await safeFetch(url, {
        cookies: this.#cookies,
        allowedHosts: this.#config.cookieDomains,
        allowSubdomains: false,
        allowedProtocols: this.#config.allowHttp
          ? ['http:', 'https:']
          : ['https:'],
        ...(this.#config.timeoutMs ? { timeoutMs: this.#config.timeoutMs } : {}),
        ...(this.#fetchImpl ? { fetchImpl: this.#fetchImpl } : {}),
        ...(this.#requestImpl ? { requestImpl: this.#requestImpl } : {}),
        ...(this.#resolveHost ? { resolveHost: this.#resolveHost } : {}),
      })
      if (result.status === 401 || result.status === 403) {
        throw new AdapterAuthError('Blackboard 会话已失效，请重新登录')
      }
      if (result.status >= 500) {
        throw new AdapterTransientError(`Blackboard 返回 HTTP ${result.status}`)
      }
      if (
        isLoginPage(
          result.finalUrl,
          result.body,
          this.#config.loggedOutPatterns ?? [],
        )
      ) {
        throw new AdapterAuthError('Blackboard 会话已失效，请重新登录')
      }
      return { html: result.body, finalUrl: result.finalUrl }
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
        error instanceof Error ? error.message : 'Blackboard 请求失败',
      )
    }
  }

  async delay(): Promise<void> {
    const delay = this.#config.delayMs ?? 100
    if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay))
  }
}

class BlackboardReadOnlyAdapter implements AcademicSourceAdapter {
  readonly id = 'blackboard.readonly'
  readonly version = '1.0.0'
  readonly sourceId: string
  readonly #config: BlackboardConfig
  readonly #options: ClientOptions

  constructor(
    sourceId: string,
    config: BlackboardConfig,
    options: ClientOptions,
  ) {
    this.sourceId = sourceId
    this.#config = config
    this.#options = options
  }

  async fetch(context?: AdapterFetchContext): Promise<AdapterResult> {
    if (!context?.credentials) {
      throw new AdapterAuthError('缺少 Blackboard 会话凭据')
    }
    const client = new BlackboardClient(
      this.#config,
      sessionCookies(await context.credentials.getSecret()),
      this.#options,
    )
    const portalUrl = this.#config.portalUrl ?? this.#config.loginUrl
    const portal = await client.get(portalUrl)
    const parsedCourses = parseCourseLinks(portal.html, {
      baseUrl: portal.finalUrl,
      ...(this.#config.termFilter ? { termFilter: this.#config.termFilter } : {}),
      ...(this.#config.courseFilter
        ? { courseFilter: this.#config.courseFilter }
        : {}),
      maxCourses: this.#config.maxCourses ?? 20,
    })

    const warnings: string[] = []
    const items: NormalizedAcademicItem[] = []
    let partial = parsedCourses.truncated
    let truncatedItems = false
    let hitItemCap = false
    let coursesWithContentArea = 0
    const maxItems = this.#config.maxAssignments ?? 100
    const maxContentPages = this.#config.maxContentPages ?? 20
    const zone = this.#config.timeZone ?? 'Asia/Shanghai'
    const utcOffsetMinutes = this.#config.utcOffsetMinutes ?? 480

    if (parsedCourses.courses.length === 0) {
      return {
        items,
        completeness: 'partial',
        fetchedAt: this.#options.now?.() ?? new Date().toISOString(),
        warnings: ['没有匹配到课程；保留上一次有效数据'],
      }
    }

    for (const course of parsedCourses.courses) {
      if (truncatedItems) break
      await client.delay()
      let courseHtml: string
      try {
        courseHtml = (await client.get(course.url)).html
      } catch (error) {
        if (error instanceof AdapterAuthError) throw error
        warnings.push(`课程「${course.title}」页面读取失败：${messageOf(error)}`)
        partial = true
        continue
      }

      const areaUrls = findContentAreaUrls(courseHtml, course.url)
      if (areaUrls.length === 0) continue
      coursesWithContentArea += 1

      const refs = new Map<string, ParsedContentItemRef>()
      let pagesRead = 0
      let truncatedContent = false
      for (const areaUrl of areaUrls) {
        const queue = [areaUrl]
        const visited = new Set<string>()
        while (queue.length > 0) {
          if (pagesRead >= maxContentPages || refs.size >= maxItems) {
            truncatedContent = true
            break
          }
          const pageUrl = queue.shift()!
          const pageKey = contentPageKey(pageUrl)
          if (visited.has(pageKey)) continue
          visited.add(pageKey)
          pagesRead += 1
          await client.delay()
          let pageHtml: string
          try {
            pageHtml = (await client.get(pageUrl)).html
          } catch (error) {
            if (error instanceof AdapterAuthError) throw error
            warnings.push(
              `课程「${course.title}」内容页读取失败：${messageOf(error)}`,
            )
            partial = true
            continue
          }
          const page = parseContentPage(
            pageHtml,
            pageUrl,
            course.externalCourseId,
          )
          for (const ref of page.items) {
            if (refs.has(ref.externalItemId)) continue
            refs.set(ref.externalItemId, ref)
            if (refs.size >= maxItems) {
              truncatedContent = true
              hitItemCap = true
              break
            }
          }
          for (const folder of page.folders) {
            if (!visited.has(contentPageKey(folder))) queue.push(folder)
          }
          if (page.nextPage && !visited.has(contentPageKey(page.nextPage))) {
            queue.push(page.nextPage)
          }
        }
        if (truncatedContent) break
      }

      if (truncatedContent) {
        partial = true
        truncatedItems = truncatedItems || hitItemCap
        if (!hitItemCap) {
          warnings.push(
            `课程「${course.title}」内容页数量达到上限 ${maxContentPages}，本次标记为部分同步`,
          )
        }
      }

      for (const ref of refs.values()) {
        if (truncatedItems) break
        if (items.length >= maxItems) {
          partial = true
          truncatedItems = true
          hitItemCap = true
          break
        }
        await client.delay()
        try {
          const detail = await client.get(ref.url)
          const parsed =
            ref.kind === 'assignment'
              ? parseAssignmentDetail(
                  detail.html,
                  ref.url,
                  course.externalCourseId,
                  ref.title,
                  { zone, utcOffsetMinutes },
                )
              : parseAssessmentDetail(
                  detail.html,
                  ref.url,
                  course.externalCourseId,
                  ref.title,
                  ref.kind === 'exam' ? 'exam' : 'quiz',
                  { zone, utcOffsetMinutes },
                )
          items.push({ sourceId: this.sourceId, ...parsed })
        } catch (error) {
          if (error instanceof AdapterAuthError) throw error
          warnings.push(
            `课程「${course.title}」${
              ref.kind === 'assignment' ? '作业' : '考试/测验'
            }「${ref.title}」读取失败：${messageOf(error)}`,
          )
          partial = true
        }
      }
    }

    if (coursesWithContentArea === 0) {
      warnings.push('未找到作业/考试区；保留上一次有效数据')
      partial = true
    }
    if (hitItemCap) {
      warnings.push(`事项数量达到上限 ${maxItems}，本次标记为部分同步`)
    }
    if (parsedCourses.truncated) {
      warnings.push(
        `课程数量达到上限 ${this.#config.maxCourses ?? 20}，本次标记为部分同步`,
      )
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

function contentPageKey(url: string): string {
  try {
    const parsed = new URL(url)
    parsed.hash = ''
    if (/listContent\.jsp/i.test(parsed.pathname)) {
      const courseId = parsed.searchParams.get('course_id') ?? ''
      const contentId = parsed.searchParams.get('content_id') ?? ''
      const start = parsed.searchParams.get('startIndex') ?? ''
      return `${parsed.origin}${parsed.pathname}?course_id=${courseId}&content_id=${contentId}&startIndex=${start}`
    }
    return parsed.toString()
  } catch {
    return url
  }
}

export function createBlackboardEngine(
  options: BlackboardEngineOptions = {},
): SourceEngine {
  const browser = createBrowserSessionEngine(options)
  return {
    descriptor: {
      id: 'blackboard',
      displayName: 'Blackboard Learn',
      description:
        'Blackboard Learn 只读同步：读取课程、作业、考试与测验；不提交作业，不读取附件与成绩。考试/测验解析已用 fixture 验证，当前真实账号暂无测试项样本。',
      supportsSync: true,
      supportsLogin: true,
      supportsVerify: true,
      authKinds: ['token'],
      loginModes: ['browser'],
      validateConfig(config) {
        const parsed = blackboardConfigSchema.safeParse(config)
        if (!parsed.success) {
          return parsed.error.issues
            .map((issue) => `${issue.path.join('.') || 'config'}: ${issue.message}`)
            .join('; ')
        }
        return protocolError(parsed.data)
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
      if (!credentials) throw new AdapterAuthError('缺少 Blackboard 会话凭据')
      const config = parseConfig(context.config)
      const client = new BlackboardClient(
        config,
        sessionCookies(await credentials.getSecret()),
        options,
      )
      const portalUrl = config.portalUrl ?? config.loginUrl
      const portal = await client.get(portalUrl)
      return parseCourseLinks(portal.html, {
        baseUrl: portal.finalUrl,
        ...(config.termFilter ? { termFilter: config.termFilter } : {}),
        ...(config.courseFilter ? { courseFilter: config.courseFilter } : {}),
        maxCourses: config.maxCourses ?? 20,
      }).courses.map((course) => ({
        sourceId: context.sourceId,
        externalCourseId: course.externalCourseId,
        termId: course.termId,
        code: course.code,
        title: course.title,
      }))
    },
    createAdapter(context: SourceEngineContext): AcademicSourceAdapter {
      return new BlackboardReadOnlyAdapter(
        context.sourceId,
        parseConfig(context.config),
        options,
      )
    },
  }
}

export {
  parseCourseLinks,
  parseContentPage,
  parseAssignmentLinks,
  parseAssignmentDetail,
  parseAssessmentDetail,
  findContentAreaUrls,
} from './parse.js'
