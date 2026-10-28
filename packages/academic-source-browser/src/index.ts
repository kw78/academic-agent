import { createHash } from 'node:crypto'
import {
  chromium,
  type Browser,
  type BrowserContext,
  type Page,
  type Response as PlaywrightResponse,
} from 'playwright-core'
import { z } from 'zod'
import {
  loginPageSignals,
  safeFetch,
  type AllowedProtocol,
  type PinnedRequest,
  type ResolveHost,
  type WebCookie,
} from '@academic/web-sessions'
import type {
  CapturedResponse,
  SourceCaptureOptions,
  SourceCaptureSession,
  SourceEngine,
  SourceEngineContext,
  SourceLoginResult,
  SourceVerification,
} from '@academic/contracts'

export const browserConfigSchema = z.object({
  loginUrl: z.string().url(),
  authenticatedUrlPatterns: z.array(z.string().min(1)).min(1),
  cookieDomains: z.array(z.string().min(1)).min(1),
  verifyUrl: z.string().url().optional(),
  loggedOutPatterns: z.array(z.string().min(1)).optional(),
  probePathPrefixes: z
    .array(z.string().regex(/^\//, 'Expected a path beginning with /'))
    .max(20)
    .optional(),
  /** Defaults to true; set false to restrict probe/crawl to cookieDomains/probeAllowedHosts. */
  probeAllowAnyPublicHost: z.boolean().optional(),
  /** Extra hosts the user explicitly allows the read-only probe to visit. */
  probeAllowedHosts: z
    .array(
      z
        .string()
        .min(1)
        .max(253)
        .regex(/^[a-z0-9.-]+$/i, 'Expected a hostname without scheme or path'),
    )
    .max(20)
    .optional(),
  timeoutMs: z.number().int().min(1_000).max(10 * 60_000).optional(),
  channel: z.enum(['msedge', 'chrome']).optional(),
  allowHttp: z.boolean().optional(),
})

export type BrowserSessionConfig = z.infer<typeof browserConfigSchema>

export interface BrowserSessionEngineOptions {
  /** Test seam: bypass the real browser while keeping the cookie result shape. */
  loginImpl?: (config: BrowserSessionConfig) => Promise<SourceLoginResult>
  /** Test seam for the guided capture browser. */
  captureImpl?: (
    config: BrowserSessionConfig,
    options: SourceCaptureOptions,
  ) => Promise<SourceCaptureSession>
  fetchImpl?: typeof fetch
  requestImpl?: PinnedRequest
  resolveHost?: ResolveHost
  timeoutMs?: number
}

function protocolsFor(config: { allowHttp?: boolean }): AllowedProtocol[] {
  return config.allowHttp ? ['http:', 'https:'] : ['https:']
}

function matchesAny(patterns: string[], value: string): boolean {
  return patterns.some((pattern) => {
    try {
      return new RegExp(pattern).test(value)
    } catch {
      return false
    }
  })
}

function cookieDomainAllowed(cookieDomain: string, domains: string[]): boolean {
  const domain = cookieDomain.replace(/^\./, '').toLowerCase()
  return domains.some((wanted) => {
    const host = wanted.replace(/^\./, '').toLowerCase()
    return (
      host === domain ||
      host.endsWith(`.${domain}`) ||
      domain.endsWith(`.${host}`)
    )
  })
}

/**
 * Some portals serve their homepage at an already "authenticated" URL before
 * the user signs in. Those must wait for explicit confirmation instead of
 * closing the browser as soon as the URL matches.
 */
export function loginRequiresConfirmation(
  config: Pick<
    BrowserSessionConfig,
    'authenticatedUrlPatterns' | 'loggedOutPatterns'
  >,
  url: string,
): boolean {
  return (
    matchesAny(config.authenticatedUrlPatterns, url) &&
    !matchesAny(config.loggedOutPatterns ?? [], url)
  )
}

async function launch(channel: 'msedge' | 'chrome' | undefined): Promise<Browser> {
  const channels = channel ? [channel] : (['msedge', 'chrome'] as const)
  let lastError: unknown
  for (const candidate of channels) {
    try {
      return await chromium.launch({
        channel: candidate,
        headless: false,
        args: ['--no-first-run', '--no-default-browser-check'],
      })
    } catch (error) {
      lastError = error
    }
  }
  throw new Error(
    `无法启动 Edge/Chrome 登录窗口：${
      lastError instanceof Error ? lastError.message : String(lastError)
    }`,
  )
}

const LOGIN_HELPER_SCRIPT = `(() => {
  const install = () => {
    if (document.getElementById('academic-login-save')) return
    const panel = document.createElement('div')
    panel.id = 'academic-login-panel'
    panel.style.cssText = 'position:fixed;top:12px;right:12px;z-index:2147483647;background:#111827;color:#fff;padding:10px 12px;border-radius:8px;font:13px/1.4 system-ui,-apple-system,sans-serif;box-shadow:0 4px 16px rgba(0,0,0,.35);max-width:320px'
    const status = document.createElement('div')
    status.id = 'academic-login-status'
    status.style.cssText = 'margin-bottom:8px'
    status.textContent = '完成登录后点击下方按钮保存会话（不会保存密码）'
    const button = document.createElement('button')
    button.id = 'academic-login-save'
    button.type = 'button'
    button.textContent = '已完成登录，保存会话'
    button.style.cssText = 'background:#2563eb;color:#fff;border:0;border-radius:6px;padding:8px 10px;cursor:pointer;font:inherit'
    button.addEventListener('click', () => {
      status.textContent = '正在读取并校验会话…'
      if (typeof window.__academicLoginConfirm === 'function') {
        window.__academicLoginConfirm()
      } else {
        status.textContent = '无法连接宿主，请关闭窗口后重试'
      }
    })
    panel.appendChild(status)
    panel.appendChild(button)
    document.documentElement.appendChild(panel)
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', install, { once: true })
  } else {
    install()
  }
})()`

async function sessionCookies(
  context: BrowserContext,
  config: BrowserSessionConfig,
): Promise<WebCookie[]> {
  return (await context.cookies())
    .filter((cookie) => cookieDomainAllowed(cookie.domain, config.cookieDomains))
    .map((cookie) => ({
      name: cookie.name,
      value: cookie.value,
      domain: cookie.domain,
      path: cookie.path,
      ...(cookie.expires >= 0 ? { expires: cookie.expires } : {}),
      ...(cookie.httpOnly ? { httpOnly: true } : {}),
      ...(cookie.secure ? { secure: true } : {}),
      ...(cookie.sameSite ? { sameSite: cookie.sameSite } : {}),
    }))
}

async function updateLoginStatus(
  context: BrowserContext,
  text: string,
): Promise<void> {
  for (const page of context.pages()) {
    await page
      .evaluate((message) => {
        const element = document.getElementById('academic-login-status')
        if (element) element.textContent = message
      }, text)
      .catch(() => undefined)
  }
}

const CAPTURE_HELPER_SCRIPT = `(() => {
  const install = () => {
    if (document.getElementById('academic-capture-done')) return
    const panel = document.createElement('div')
    panel.id = 'academic-capture-panel'
    panel.style.cssText = 'position:fixed;top:12px;right:12px;z-index:2147483647;background:#111827;color:#fff;padding:10px 12px;border-radius:8px;font:13px/1.5 system-ui,-apple-system,sans-serif;box-shadow:0 4px 16px rgba(0,0,0,.35);max-width:340px'
    const status = document.createElement('div')
    status.id = 'academic-capture-status'
    status.textContent = '正在录制：请登录，然后打开课程列表和作业列表（最好翻一页）。'
    const count = document.createElement('div')
    count.id = 'academic-capture-count'
    count.style.cssText = 'opacity:.75;margin:4px 0 8px'
    count.textContent = '已录制 0 个接口'
    const button = document.createElement('button')
    button.id = 'academic-capture-done'
    button.type = 'button'
    button.textContent = '完成录制并保存会话'
    button.style.cssText = 'background:#2563eb;color:#fff;border:0;border-radius:6px;padding:8px 10px;cursor:pointer;font:inherit'
    button.addEventListener('click', () => {
      count.textContent = '正在保存…'
      if (typeof window.__academicCaptureDone === 'function') {
        window.__academicCaptureDone()
      } else {
        count.textContent = '无法连接宿主，请关闭窗口后重试'
      }
    })
    panel.appendChild(status)
    panel.appendChild(count)
    panel.appendChild(button)
    document.documentElement.appendChild(panel)
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', install, { once: true })
  } else {
    install()
  }
})()`

const CAPTURE_SKIP_URL =
  /\/(?:logout|signout|sign-out|favicon\.ico|robots\.txt)(?:[/?#]|$)/i
const CAPTURE_MAX_BODY = 512 * 1024
const CAPTURE_MAX_TOTAL = 8 * 1024 * 1024
const CAPTURE_MAX_SAMPLES = 40
const CAPTURE_MAX_REQUEST_BODY = 16 * 1024
const CAPTURE_TIMEOUT_MS = 8 * 60_000

async function updateCaptureCount(
  context: BrowserContext,
  captured: number,
): Promise<void> {
  for (const page of context.pages()) {
    await page
      .evaluate((value) => {
        const element = document.getElementById('academic-capture-count')
        if (element) element.textContent = `已录制 ${value} 个接口`
      }, captured)
      .catch(() => undefined)
  }
}

/**
 * Records read-only JSON/HTML traffic while the user logs in and opens the
 * pages they care about. The agent then plans a manifest from observed
 * requests instead of guessing URLs. Forms are never submitted by us; the
 * bodies recorded here are the site's own read requests.
 */
export async function captureBrowserSession(
  config: BrowserSessionConfig,
  options: SourceCaptureOptions = {},
): Promise<SourceCaptureSession> {
  const browser = await launch(config.channel)
  const startedAt = new Date().toISOString()
  const captured: CapturedResponse[] = []
  const seen = new Set<string>()
  const hosts = new Set<string>(config.cookieDomains)
  const pending = new Set<Promise<void>>()
  const maxSamples = Math.min(
    Math.max(options.maxSamples ?? CAPTURE_MAX_SAMPLES, 1),
    80,
  )
  const maxTotal = Math.min(
    Math.max(options.maxBytes ?? CAPTURE_MAX_TOTAL, 64 * 1024),
    32 * 1024 * 1024,
  )
  let totalBytes = 0
  let visited = 0
  let confirmed = false
  let warning: string | undefined
  const skipped = { noise: 0, nonText: 0, tooLarge: 0, limit: 0, failed: 0 }

  try {
    const context = await browser.newContext({
      locale: 'zh-CN',
      viewport: { width: 1280, height: 900 },
    })
    try {
      await context.exposeBinding('__academicCaptureDone', () => {
        confirmed = true
      })
      await context.addInitScript({ content: CAPTURE_HELPER_SCRIPT })

      const record = async (response: PlaywrightResponse): Promise<void> => {
        try {
          const request = response.request()
          const resourceType = request.resourceType()
          if (resourceType !== 'xhr' && resourceType !== 'fetch' && resourceType !== 'document') {
            return
          }
          const status = response.status()
          if (status < 200 || status >= 300) {
            skipped.failed += 1
            return
          }
          const url = response.url()
          if (!/^https?:/i.test(url)) return
          if (CAPTURE_SKIP_URL.test(new URL(url).pathname)) {
            skipped.noise += 1
            return
          }
          const responseHeaders = await response.allHeaders()
          const contentType = responseHeaders['content-type'] ?? ''
          if (!/(?:json|html)/i.test(contentType)) {
            skipped.nonText += 1
            return
          }
          const declared = Number(responseHeaders['content-length'] ?? '0')
          if (declared > CAPTURE_MAX_BODY) {
            skipped.tooLarge += 1
            return
          }
          const buffer = await response.body()
          if (buffer.length === 0) return
          if (buffer.length > CAPTURE_MAX_BODY) {
            skipped.tooLarge += 1
            return
          }
          if (captured.length >= maxSamples || totalBytes + buffer.length > maxTotal) {
            warning ??= '录制已达上限，后续请求被丢弃'
            skipped.limit += 1
            return
          }
          const body = buffer.toString('utf8')
          const method = request.method().toUpperCase() === 'POST' ? 'POST' : 'GET'
          const postData = method === 'POST' ? request.postData() : null
          const key = `${method} ${url} ${createHash('sha256').update(body).digest('hex')}`
          if (seen.has(key)) return
          seen.add(key)
          const requestHeaders: Record<string, string> = await request
            .allHeaders()
            .catch(() => ({}) as Record<string, string>)
          const requestContentType = requestHeaders['content-type']
          captured.push({
            url,
            method,
            status,
            body,
            contentType,
            ...(requestContentType ? { requestContentType } : {}),
            ...(postData && postData.length <= CAPTURE_MAX_REQUEST_BODY
              ? { requestBody: postData }
              : {}),
            headerNames: Object.keys(requestHeaders),
          })
          totalBytes += buffer.length
          hosts.add(new URL(url).hostname)
          await updateCaptureCount(context, captured.length)
        } catch {
          // Body unavailable (navigation/aborted). Skipping is the safe default.
          skipped.failed += 1
        }
      }

      const attach = (page: Page): void => {
        page.on('request', () => {
          visited += 1
        })
        page.on('response', (response) => {
          const task = record(response)
          pending.add(task)
          void task.finally(() => pending.delete(task))
        })
      }
      context.on('page', attach)
      const page = await context.newPage()
      attach(page)
      await page.goto(config.loginUrl, {
        waitUntil: 'domcontentloaded',
        timeout: 60_000,
      })
      const deadline =
        Date.now() + Math.max(options.timeoutMs ?? CAPTURE_TIMEOUT_MS, 60_000)
      while (Date.now() < deadline && !confirmed) {
        if (!browser.isConnected()) throw new Error('录制窗口已关闭，未保存')
        await new Promise((resolve) => setTimeout(resolve, 500))
      }
      if (!confirmed && captured.length === 0) {
        throw new Error('录制超时：请在浏览器中登录并打开列表页面后点击“完成录制”')
      }
      if (!confirmed) warning ??= '录制超时，已保留当前捕获的内容'
      await Promise.allSettled([...pending])
      const observedHosts = [...hosts].filter(Boolean)
      const cookies = (await context.cookies()).filter((cookie) =>
        cookieDomainAllowed(cookie.domain, observedHosts),
      )
      if (cookies.length === 0) {
        throw new Error('未读取到会话 Cookie，请确认已完成登录')
      }
      return {
        secret: JSON.stringify({ cookies }),
        captures: captured,
        hosts: observedHosts,
        visited,
        startedAt,
        finishedAt: new Date().toISOString(),
        warnings: warning ? [warning] : [],
        skipped,
      }
    } finally {
      await context.close().catch(() => undefined)
    }
  } finally {
    await browser.close().catch(() => undefined)
  }
}

async function browserLogin(
  config: BrowserSessionConfig,
): Promise<SourceLoginResult> {
  const browser = await launch(config.channel)
  let context: BrowserContext | undefined
  try {
    context = await browser.newContext({
      locale: 'zh-CN',
      viewport: { width: 1280, height: 900 },
    })
    let confirmed = false
    await context.exposeBinding('__academicLoginConfirm', () => {
      confirmed = true
    })
    await context.addInitScript({ content: LOGIN_HELPER_SCRIPT })
    const page = await context.newPage()
    await page.goto(config.loginUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 60_000,
    })
    const initialUrl = page.url()
    // A portal homepage often already matches the authenticated URL pattern
    // before the user signs in. In that case URL matching alone would close the
    // window too early, so require an explicit completion click instead.
    const requireConfirm = loginRequiresConfirmation(config, initialUrl)
    const deadline = Date.now() + (config.timeoutMs ?? 4 * 60_000)
    let loggedPage = page
    while (Date.now() < deadline) {
      if (!browser.isConnected()) {
        throw new Error('登录窗口已关闭，未完成登录')
      }
      if (confirmed) {
        confirmed = false
        const cookies = await sessionCookies(context, config)
        if (cookies.length === 0) {
          await updateLoginStatus(
            context,
            '仍未读取到会话 Cookie，请完成登录后再点击',
          )
          continue
        }
        const secret = JSON.stringify({ cookies })
        if (config.verifyUrl) {
          await updateLoginStatus(context, '正在校验会话…')
          const verified = await verifySession(
            config,
            secret,
            undefined,
            undefined,
            undefined,
            config.timeoutMs,
          )
          if (!verified.ok) {
            await updateLoginStatus(
              context,
              `会话校验未通过：${verified.message ?? '请继续登录'}；完成登录后再点击`,
            )
            continue
          }
        }
        return { secret }
      }
      const reached = context.pages().find((candidate) => {
        try {
          const url = candidate.url()
          return (
            !matchesAny(config.loggedOutPatterns ?? [], url) &&
            matchesAny(config.authenticatedUrlPatterns, url)
          )
        } catch {
          return false
        }
      })
      if (reached && !requireConfirm) {
        loggedPage = reached
        break
      }
      await new Promise((resolve) => setTimeout(resolve, 500))
    }
    if (requireConfirm && Date.now() >= deadline) {
      throw new Error(
        '登录超时：请在浏览器中完成登录后点击右上角“已完成登录，保存会话”',
      )
    }
    const finalUrl = loggedPage.url()
    if (
      !matchesAny(config.authenticatedUrlPatterns, finalUrl) ||
      matchesAny(config.loggedOutPatterns ?? [], finalUrl)
    ) {
      throw new Error('登录超时：未检测到已认证页面')
    }
    await loggedPage.waitForLoadState('domcontentloaded').catch(() => undefined)
    const cookies = await sessionCookies(context, config)
    if (cookies.length === 0) {
      throw new Error('登录成功但未读取到会话 Cookie')
    }
    return { secret: JSON.stringify({ cookies }) }
  } finally {
    await context?.close().catch(() => undefined)
    await browser.close().catch(() => undefined)
  }
}

async function verifySession(
  config: BrowserSessionConfig,
  secret: string,
  fetchImpl: typeof fetch | undefined,
  requestImpl: PinnedRequest | undefined,
  resolveHost: ResolveHost | undefined,
  timeoutMs: number | undefined,
): Promise<SourceVerification> {
  if (!config.verifyUrl) return { ok: true }
  let cookies: WebCookie[]
  try {
    const parsed = JSON.parse(secret) as { cookies?: unknown }
    if (!Array.isArray(parsed.cookies) || parsed.cookies.length === 0) {
      return { ok: false, message: '会话格式已过期，请重新登录' }
    }
    cookies = parsed.cookies as WebCookie[]
  } catch {
    return { ok: false, message: '会话格式无效，请重新登录' }
  }
  try {
    const result = await safeFetch(config.verifyUrl, {
      cookies,
      allowedHosts: config.cookieDomains,
      allowSubdomains: false,
      allowedProtocols: protocolsFor(config),
      ...(fetchImpl ? { fetchImpl } : {}),
      ...(requestImpl ? { requestImpl } : {}),
      ...(resolveHost ? { resolveHost } : {}),
      ...(timeoutMs ? { timeoutMs } : {}),
    })
    const loggedOut = loginPageSignals({
      finalUrl: result.finalUrl,
      body: result.body,
      ...(result.contentType ? { contentType: result.contentType } : {}),
      patterns: config.loggedOutPatterns,
    })
    return loggedOut
      ? { ok: false, message: '会话已失效或被重定向到登录页' }
      : { ok: true }
  } catch (error) {
    return {
      ok: false,
      message: `校验请求失败：${error instanceof Error ? error.message : String(error)}`,
    }
  }
}

export function createBrowserSessionEngine(
  options: BrowserSessionEngineOptions = {},
): SourceEngine {
  const fetchImpl = options.fetchImpl
  return {
    descriptor: {
      id: 'browser-session',
      displayName: '浏览器会话',
      description:
        '由宿主拉起真实浏览器，用户完成登录后读取配置域名的会话 Cookie；不读取密码。',
      supportsSync: false,
      supportsLogin: true,
      supportsVerify: true,
      supportsCapture: true,
      authKinds: ['token'],
      loginModes: ['browser', 'manual'],
      validateConfig(config) {
        const parsed = browserConfigSchema.safeParse(config)
        if (parsed.success) return undefined
        return parsed.error.issues
          .map((issue) => `${issue.path.join('.') || 'config'}: ${issue.message}`)
          .join('; ')
      },
    },
    async login(context: SourceEngineContext) {
      const config = browserConfigSchema.parse(context.config)
      return options.loginImpl
        ? options.loginImpl(config)
        : browserLogin(config)
    },
    async capture(context: SourceEngineContext, captureOptions?: SourceCaptureOptions) {
      const config = browserConfigSchema.parse(context.config)
      return options.captureImpl
        ? options.captureImpl(config, captureOptions ?? {})
        : captureBrowserSession(config, captureOptions ?? {})
    },
    async verify(context: SourceEngineContext, secret: string) {
      const config = browserConfigSchema.parse(context.config)
      return verifySession(
        config,
        secret,
        fetchImpl,
        options.requestImpl,
        options.resolveHost,
        options.timeoutMs,
      )
    },
  }
}
