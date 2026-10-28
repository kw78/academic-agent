import { chromium, type Browser, type BrowserContext } from 'playwright-core'
import { z } from 'zod'
import {
  safeFetch,
  type AllowedProtocol,
  type PinnedRequest,
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
  allowHttp: z.boolean().optional(),
})

export type BrowserSessionConfig = z.infer<typeof browserConfigSchema>

export interface BrowserSessionEngineOptions {
  /** Test seam: bypass the real browser while keeping the cookie result shape. */
  loginImpl?: (config: BrowserSessionConfig) => Promise<SourceLoginResult>
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
    const title = (
      /<title[^>]*>([\s\S]*?)<\/title>/i.exec(result.body)?.[1] ?? ''
    )
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
    const loginForm = /name=["']login["']|id=["']loginForm["']/i.test(
      result.body.slice(0, 20_000),
    )
    const loggedOut =
      /\/login|\/signin|\/cas\/login/i.test(result.finalUrl) ||
      /登录|sign in|log in/i.test(title) ||
      matchesAny(config.loggedOutPatterns ?? [], result.finalUrl) ||
      matchesAny(config.loggedOutPatterns ?? [], title) ||
      loginForm
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
        options.requestImpl,
        options.resolveHost,
        options.timeoutMs,
      )
    },
  }
}
