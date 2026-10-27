import type { DatabaseSync } from 'node:sqlite'
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright-core'
import type { CredentialVault } from '@academic/connections'
import type { Clock, IdGenerator } from '@academic/contracts'

const MAX_BODY_BYTES = 2 * 1024 * 1024
const DEFAULT_LOGIN_TIMEOUT_MS = 5 * 60_000

export interface WebCookie {
  name: string
  value: string
  domain?: string
  path?: string
  expires?: number
  httpOnly?: boolean
  secure?: boolean
  sameSite?: string
}

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

function hostMatches(hostname: string, domain: string): boolean {
  const host = normalizeDomain(hostname)
  const base = normalizeDomain(domain)
  return host === base || host.endsWith(`.${base}`)
}

function cookieHeader(cookies: WebCookie[]): string {
  return cookies
    .map((cookie) => `${cookie.name}=${cookie.value}`)
    .join('; ')
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
  readonly #fetch: typeof fetch

  constructor(options: WebSessionStoreOptions) {
    this.#db = options.db
    this.#vault = options.vault
    this.#clock = options.clock
    this.#ids = options.ids
    this.#fetch = options.fetchImpl ?? fetch
  }

  async create(input: {
    loginUrl: string
    cookies: WebCookie[]
    label?: string
  }): Promise<WebSessionView> {
    const url = assertHttpUrl(input.loginUrl)
    const cookies = input.cookies.filter((cookie) => cookie.name && cookie.value)
    if (cookies.length === 0) throw new Error('No session cookies were captured')
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
        input.loginUrl,
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

  async fetch(
    sessionId: string,
    targetUrl: string,
    init: RequestInit = {},
  ): Promise<WebSessionFetchResult> {
    const row = this.#db
      .prepare('SELECT * FROM web_sessions WHERE session_id = ?')
      .get(sessionId) as unknown as WebSessionRow | undefined
    if (!row) throw new Error('Web session not found')
    const url = assertHttpUrl(targetUrl)
    if (!hostMatches(url.hostname, row.domain)) {
      throw new Error(`URL host does not match session domain ${row.domain}`)
    }
    const raw = await this.#vault.get(row.vault_ref)
    if (!raw) throw new Error('Web session credential is unavailable')
    const parsed = JSON.parse(raw) as { cookies?: WebCookie[] }
    const header = cookieHeader(parsed.cookies ?? [])
    if (!header) throw new Error('Web session has no cookies')
    const response = await this.#fetch(targetUrl, {
      ...init,
      headers: {
        ...(init.headers ?? {}),
        Cookie: header,
      },
      redirect: 'follow',
    })
    const text = await response.text()
    const truncated = text.length > MAX_BODY_BYTES
    const now = this.#clock.now()
    this.#db
      .prepare('UPDATE web_sessions SET last_used_at = ?, updated_at = ? WHERE session_id = ?')
      .run(now, now, sessionId)
    return {
      sessionId,
      url: targetUrl,
      finalUrl: response.url || targetUrl,
      status: response.status,
      ...(response.headers.get('content-type')
        ? { contentType: response.headers.get('content-type')! }
        : {}),
      body: truncated ? text.slice(0, MAX_BODY_BYTES) : text,
      truncated,
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
