import type { DatabaseSync } from 'node:sqlite'
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright-core'
import type { CredentialVault } from '@academic/connections'
import type { Clock, IdGenerator } from '@academic/contracts'
import {
  SafeFetchError,
  safeFetch,
  safeUrlForDisplay,
  validateCookies,
  type AllowedProtocol,
  type PinnedRequest,
  type ResolveHost,
  type WebCookie,
} from './http.js'

export { SafeFetchError, safeFetch, safeUrlForDisplay, validateCookies } from './http.js'
export type {
  AllowedProtocol,
  PinnedRequest,
  PinnedTarget,
  ResolveHost,
  WebCookie,
} from './http.js'

const DEFAULT_LOGIN_TIMEOUT_MS = 5 * 60_000

export interface WebSessionView {
  sessionId: string
  loginUrl: string
  domain: string
  label?: string
  createdAt: string
  updatedAt: string
  lastUsedAt?: string
}

export interface WebSessionFetchResult {
  sessionId: string
  url: string
  finalUrl: string
  status: number
  contentType?: string
  body: string
  truncated: boolean
}

export interface WebLoginResult {
  loginUrl: string
  domain: string
  cookies: WebCookie[]
}

interface WebSessionRow {
  session_id: string
  login_url: string
  domain: string
  label: string | null
  vault_ref: string
  created_at: string
  updated_at: string
  last_used_at: string | null
}

export interface WebSessionStoreOptions {
  db: DatabaseSync
  vault: CredentialVault
  clock: Clock
  ids: IdGenerator
  fetchImpl?: typeof fetch
  requestImpl?: PinnedRequest
  resolveHost?: ResolveHost
  timeoutMs?: number
  maxBytes?: number
  allowedProtocols?: AllowedProtocol[]
  allowedPorts?: number[]
  allowedPathPrefixes?: string[]
}

function vaultRef(sessionId: string): string {
  return `academic-agent/web-session/${sessionId}`
}

function view(row: WebSessionRow): WebSessionView {
  return {
    sessionId: row.session_id,
    loginUrl: row.login_url,
    domain: row.domain,
    ...(row.label ? { label: row.label } : {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...(row.last_used_at ? { lastUsedAt: row.last_used_at } : {}),
  }
}

function normalizeDomain(hostname: string): string {
  return hostname.toLowerCase().replace(/^\./, '')
}

function cookieDomainApplies(hostname: string, domain: string): boolean {
  const host = hostname.toLowerCase()
  const value = domain.toLowerCase()
  if (value.startsWith('.')) {
    const base = value.replace(/^\./, '')
    return host === base || host.endsWith(`.${base}`)
  }
  return host === value
}

function assertHttpUrl(value: string): URL {
  const url = new URL(value)
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Only http(s) URLs are supported')
  }
  if (url.username || url.password) {
    throw new Error('URL must not contain embedded credentials')
  }
  return url
}

export class WebSessionStore {
  readonly #db: DatabaseSync
  readonly #vault: CredentialVault
  readonly #clock: Clock
  readonly #ids: IdGenerator
  readonly #fetch: typeof fetch | undefined
  readonly #request: PinnedRequest | undefined
  readonly #resolveHost: ResolveHost | undefined
  readonly #timeoutMs: number | undefined
  readonly #maxBytes: number | undefined
  readonly #allowedProtocols: AllowedProtocol[]
  readonly #allowedPorts: number[] | undefined
  readonly #allowedPathPrefixes: string[] | undefined

  constructor(options: WebSessionStoreOptions) {
    this.#db = options.db
    this.#vault = options.vault
    this.#clock = options.clock
    this.#ids = options.ids
    this.#fetch = options.fetchImpl
    this.#request = options.requestImpl
    this.#resolveHost = options.resolveHost
    this.#timeoutMs = options.timeoutMs
    this.#maxBytes = options.maxBytes
    this.#allowedProtocols = options.allowedProtocols ?? ['https:']
    this.#allowedPorts = options.allowedPorts
    this.#allowedPathPrefixes = options.allowedPathPrefixes
  }

  async create(input: {
    loginUrl: string
    cookies: WebCookie[]
    label?: string
  }): Promise<WebSessionView> {
    const url = assertHttpUrl(input.loginUrl)
    if (!this.#allowedProtocols.includes(url.protocol as AllowedProtocol)) {
      throw new SafeFetchError(
        'UNSAFE_PROTOCOL',
        `登录站点协议未授权：${url.protocol}`,
      )
    }
    const cookies = input.cookies
      .filter((cookie) => cookie.name && cookie.value)
      .map((cookie) => ({
        ...cookie,
        domain: cookie.domain || url.hostname,
        path: cookie.path || '/',
      }))
    if (cookies.length === 0) throw new Error('No session cookies were captured')
    validateCookies(cookies)
    for (const cookie of cookies) {
      if (!cookie.domain || !cookieDomainApplies(url.hostname, cookie.domain)) {
        throw new SafeFetchError(
          'INVALID_COOKIE',
          `Cookie ${cookie.name} 不属于登录站点`,
        )
      }
    }
    const sessionId = this.#ids.next()
    const now = this.#clock.now()
    const ref = vaultRef(sessionId)
    await this.#vault.set(ref, JSON.stringify({ cookies }))
    this.#db
      .prepare(
        `INSERT INTO web_sessions (
           session_id, login_url, domain, label, vault_ref,
           created_at, updated_at, last_used_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL)`,
      )
      .run(
        sessionId,
        safeUrlForDisplay(input.loginUrl),
        normalizeDomain(url.hostname),
        input.label ?? null,
        ref,
        now,
        now,
      )
    return this.get(sessionId)!
  }

  get(sessionId: string): WebSessionView | undefined {
    const row = this.#db
      .prepare('SELECT * FROM web_sessions WHERE session_id = ?')
      .get(sessionId) as unknown as WebSessionRow | undefined
    return row ? view(row) : undefined
  }

  list(): WebSessionView[] {
    const rows = this.#db
      .prepare('SELECT * FROM web_sessions ORDER BY updated_at DESC, rowid DESC')
      .all() as unknown as WebSessionRow[]
    return rows.map(view)
  }

  async delete(sessionId: string): Promise<void> {
    const row = this.#db
      .prepare('SELECT * FROM web_sessions WHERE session_id = ?')
      .get(sessionId) as unknown as WebSessionRow | undefined
    if (!row) return
    await this.#vault.delete(row.vault_ref)
    this.#db.prepare('DELETE FROM web_sessions WHERE session_id = ?').run(sessionId)
  }

  async fetch(sessionId: string, targetUrl: string): Promise<WebSessionFetchResult> {
    const row = this.#db
      .prepare('SELECT * FROM web_sessions WHERE session_id = ?')
      .get(sessionId) as unknown as WebSessionRow | undefined
    if (!row) throw new Error('Web session not found')
    const raw = await this.#vault.get(row.vault_ref)
    if (!raw) throw new Error('Web session credential is unavailable')
    const parsed = JSON.parse(raw) as { cookies?: WebCookie[] }
    const cookies = parsed.cookies ?? []
    if (cookies.length === 0) throw new Error('Web session has no cookies')

    const result = await safeFetch(targetUrl, {
      cookies,
      allowedHosts: [row.domain],
      allowedProtocols: this.#allowedProtocols,
      ...(this.#allowedPorts ? { allowedPorts: this.#allowedPorts } : {}),
      ...(this.#allowedPathPrefixes
        ? { allowedPathPrefixes: this.#allowedPathPrefixes }
        : {}),
      ...(this.#resolveHost ? { resolveHost: this.#resolveHost } : {}),
      ...(this.#timeoutMs ? { timeoutMs: this.#timeoutMs } : {}),
      ...(this.#maxBytes ? { maxBytes: this.#maxBytes } : {}),
      ...(this.#fetch ? { fetchImpl: this.#fetch } : {}),
      ...(this.#request ? { requestImpl: this.#request } : {}),
    })

    const now = this.#clock.now()
    this.#db
      .prepare('UPDATE web_sessions SET last_used_at = ?, updated_at = ? WHERE session_id = ?')
      .run(now, now, sessionId)
    return {
      sessionId,
      url: safeUrlForDisplay(targetUrl),
      finalUrl: safeUrlForDisplay(result.finalUrl),
      status: result.status,
      ...(result.contentType ? { contentType: result.contentType } : {}),
      body: result.body,
      truncated: result.truncated,
    }
  }
}

function isLoginCookie(domain: string | undefined, hostname: string): boolean {
  if (!domain) return true
  const cookieDomain = normalizeDomain(domain)
  const host = normalizeDomain(hostname)
  return host === cookieDomain || host.endsWith(`.${cookieDomain}`)
}

async function injectDoneButton(page: Page): Promise<void> {
  try {
    await page.evaluate(() => {
      if (document.getElementById('__academic_web_session_done')) return
      const button = document.createElement('button')
      button.id = '__academic_web_session_done'
      button.textContent = '完成登录'
      Object.assign(button.style, {
        position: 'fixed',
        top: '12px',
        right: '12px',
        zIndex: '2147483647',
        padding: '10px 16px',
        borderRadius: '8px',
        border: '1px solid #ffffff66',
        background: '#1f6feb',
        color: '#ffffff',
        font: '14px sans-serif',
        cursor: 'pointer',
        boxShadow: '0 4px 16px #00000055',
      })
      button.addEventListener('click', () => {
        ;(window as unknown as { __academicWebSessionDone?: boolean }).__academicWebSessionDone = true
        button.textContent = '已记录登录会话'
        button.style.background = '#238636'
      })
      document.documentElement.appendChild(button)
    })
  } catch {
    // Some pages cannot accept injected UI; the user can still close the window.
  }
}

async function launch(): Promise<Browser> {
  let lastError: unknown
  for (const channel of ['msedge', 'chrome'] as const) {
    try {
      return await chromium.launch({
        channel,
        headless: false,
        args: ['--no-first-run', '--no-default-browser-check'],
      })
    } catch (error) {
      lastError = error
    }
  }
  throw new Error(
    `无法启动 Edge/Chrome：${lastError instanceof Error ? lastError.message : String(lastError)}`,
  )
}

/**
 * Open a real browser for an arbitrary website. The user logs in and clicks
 * the injected "完成登录" button; only cookies for that host are captured.
 */
export async function loginWebSession(
  loginUrl: string,
  options: { timeoutMs?: number } = {},
): Promise<WebLoginResult> {
  const url = assertHttpUrl(loginUrl)
  const browser = await launch()
  let context: BrowserContext | undefined
  try {
    context = await browser.newContext({
      locale: 'zh-CN',
      viewport: { width: 1280, height: 900 },
    })
    const page = await context.newPage()
    context.on('page', (next) => {
      next.on('domcontentloaded', () => {
        void injectDoneButton(next)
      })
    })
    page.on('domcontentloaded', () => {
      void injectDoneButton(page)
    })
    await page.goto(loginUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 })
    await injectDoneButton(page)

    const deadline = Date.now() + (options.timeoutMs ?? DEFAULT_LOGIN_TIMEOUT_MS)
    let completed = false
    while (Date.now() < deadline) {
      if (!browser.isConnected()) {
        throw new Error('登录窗口已关闭，未保存会话')
      }
      const pages = context.pages()
      if (pages.length === 0) {
        throw new Error('登录窗口已关闭，未保存会话')
      }
      for (const candidate of pages) {
        try {
          const done = await candidate.evaluate(
            () =>
              Boolean(
                (window as unknown as { __academicWebSessionDone?: boolean })
                  .__academicWebSessionDone,
              ),
          )
          if (done) {
            completed = true
            break
          }
        } catch {
          // Navigation can temporarily detach the page.
        }
      }
      if (completed) break
      await new Promise((resolve) => setTimeout(resolve, 500))
    }
    if (!completed) {
      throw new Error('登录超时：请重新打开登录窗口并在完成后点击“完成登录”')
    }
    await new Promise((resolve) => setTimeout(resolve, 300))
    const cookies = (await context.cookies())
      .filter((cookie) => isLoginCookie(cookie.domain, url.hostname))
      .map((cookie) => ({
        name: cookie.name,
        value: cookie.value,
        ...(cookie.domain ? { domain: cookie.domain } : {}),
        ...(cookie.path ? { path: cookie.path } : {}),
        ...(cookie.expires !== undefined && cookie.expires >= 0
          ? { expires: cookie.expires }
          : {}),
        ...(cookie.httpOnly ? { httpOnly: true } : {}),
        ...(cookie.secure ? { secure: true } : {}),
        ...(cookie.sameSite ? { sameSite: cookie.sameSite } : {}),
      }))
    if (cookies.length === 0) throw new Error('未读取到该网站的会话 Cookie')
    return {
      loginUrl,
      domain: normalizeDomain(url.hostname),
      cookies,
    }
  } finally {
    await context?.close().catch(() => undefined)
    await browser.close().catch(() => undefined)
  }
}
