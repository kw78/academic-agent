import { chromium, type Browser, type BrowserContext } from 'playwright-core'
import { z } from 'zod'
import {
  safeFetch,
  type ResolveHost,
  type WebCookie,
} from '@academic/web-sessions'
import type {
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
  timeoutMs: z.number().int().min(1_000).max(10 * 60_000).optional(),
  channel: z.enum(['msedge', 'chrome']).optional(),
})

export type BrowserSessionConfig = z.infer<typeof browserConfigSchema>

export interface BrowserSessionEngineOptions {
  /** Test seam: bypass the real browser while keeping the cookie result shape. */
  loginImpl?: (config: BrowserSessionConfig) => Promise<SourceLoginResult>
  fetchImpl?: typeof fetch
  resolveHost?: ResolveHost
  timeoutMs?: number
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
    const page = await context.newPage()
    await page.goto(config.loginUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 60_000,
    })
    const deadline = Date.now() + (config.timeoutMs ?? 4 * 60_000)
    let loggedPage = page
    while (Date.now() < deadline) {
      if (!browser.isConnected()) {
        throw new Error('登录窗口已关闭，未完成登录')
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
      if (reached) {
        loggedPage = reached
        break
      }
      await new Promise((resolve) => setTimeout(resolve, 500))
    }
    const finalUrl = loggedPage.url()
    if (
      !matchesAny(config.authenticatedUrlPatterns, finalUrl) ||
      matchesAny(config.loggedOutPatterns ?? [], finalUrl)
    ) {
      throw new Error('登录超时：未检测到已认证页面')
    }
    await loggedPage.waitForLoadState('domcontentloaded').catch(() => undefined)
    const cookies: WebCookie[] = (await context.cookies())
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
  fetchImpl: typeof fetch,
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
      fetchImpl,
      ...(resolveHost ? { resolveHost } : {}),
      ...(timeoutMs ? { timeoutMs } : {}),
    })
    const loggedOut =
      matchesAny(config.loggedOutPatterns ?? [], result.finalUrl) ||
      matchesAny(config.loggedOutPatterns ?? [], result.body)
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
  const fetchImpl = options.fetchImpl ?? fetch
  return {
    descriptor: {
      id: 'browser-session',
      displayName: '浏览器会话',
      description:
        '由宿主拉起真实浏览器，用户完成登录后读取配置域名的会话 Cookie；不读取密码。',
      supportsSync: false,
      supportsLogin: true,
      supportsVerify: true,
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
    async verify(context: SourceEngineContext, secret: string) {
      const config = browserConfigSchema.parse(context.config)
      return verifySession(
        config,
        secret,
        fetchImpl,
        options.resolveHost,
        options.timeoutMs,
      )
    },
  }
}
