import { lookup as dnsLookup } from 'node:dns/promises'
import { request as httpRequest } from 'node:http'
import { request as httpsRequest } from 'node:https'
import { BlockList, isIP } from 'node:net'
import { Readable } from 'node:stream'

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

export interface ResolvedAddress {
  address: string
  family: number
}

export type ResolveHost = (hostname: string) => Promise<ResolvedAddress[]>

export type SafeFetchErrorCode =
  | 'INVALID_URL'
  | 'UNSAFE_HOST'
  | 'UNSAFE_PROTOCOL'
  | 'UNSAFE_PORT'
  | 'UNSAFE_PATH'
  | 'DNS_FAILED'
  | 'REDIRECT_LIMIT'
  | 'DOWNGRADE_BLOCKED'
  | 'TIMEOUT'
  | 'INVALID_COOKIE'
  | 'NETWORK'
  | 'RATE_LIMITED'

export class SafeFetchError extends Error {
  readonly code: SafeFetchErrorCode

  constructor(code: SafeFetchErrorCode, message: string) {
    super(message)
    this.name = 'SafeFetchError'
    this.code = code
  }
}

export type AllowedProtocol = 'http:' | 'https:'

export interface PinnedTarget {
  address: string
  family: number
}

export interface SafeRequestInit {
  headers: Record<string, string>
  signal: AbortSignal
}

/** Transport seam: receives only the address that passed validation. */
export type PinnedRequest = (
  url: URL,
  init: SafeRequestInit,
  target: PinnedTarget,
) => Promise<Response>

export interface SafeFetchOptions {
  allowedHosts: string[]
  cookies?: WebCookie[]
  timeoutMs?: number
  maxRedirects?: number
  maxBytes?: number
  /** Defaults to HTTPS only; HTTP must be enabled explicitly. */
  allowedProtocols?: AllowedProtocol[]
  /** Defaults to 443 (and 80 only when HTTP is enabled). */
  allowedPorts?: number[]
  allowedPathPrefixes?: string[]
  /** Defaults true for existing session callers; manifests use exact hosts. */
  allowSubdomains?: boolean
  fetchImpl?: typeof fetch
  requestImpl?: PinnedRequest
  resolveHost?: ResolveHost
  now?: () => number
}

export interface SafeFetchResult {
  status: number
  finalUrl: string
  contentType?: string
  body: string
  truncated: boolean
  redirects: string[]
}

const DEFAULT_TIMEOUT_MS = 15_000
const DEFAULT_MAX_REDIRECTS = 5
const DEFAULT_MAX_BYTES = 2 * 1024 * 1024

const BLOCKED_NETWORKS = new BlockList()
BLOCKED_NETWORKS.addSubnet('0.0.0.0', 8, 'ipv4')
BLOCKED_NETWORKS.addSubnet('10.0.0.0', 8, 'ipv4')
BLOCKED_NETWORKS.addSubnet('100.64.0.0', 10, 'ipv4')
BLOCKED_NETWORKS.addSubnet('127.0.0.0', 8, 'ipv4')
BLOCKED_NETWORKS.addSubnet('169.254.0.0', 16, 'ipv4')
BLOCKED_NETWORKS.addSubnet('172.16.0.0', 12, 'ipv4')
BLOCKED_NETWORKS.addSubnet('192.0.0.0', 24, 'ipv4')
BLOCKED_NETWORKS.addSubnet('192.0.2.0', 24, 'ipv4')
BLOCKED_NETWORKS.addSubnet('192.88.99.0', 24, 'ipv4')
BLOCKED_NETWORKS.addSubnet('192.168.0.0', 16, 'ipv4')
BLOCKED_NETWORKS.addSubnet('198.18.0.0', 15, 'ipv4')
BLOCKED_NETWORKS.addSubnet('198.51.100.0', 24, 'ipv4')
BLOCKED_NETWORKS.addSubnet('203.0.113.0', 24, 'ipv4')
BLOCKED_NETWORKS.addSubnet('224.0.0.0', 4, 'ipv4')
BLOCKED_NETWORKS.addSubnet('240.0.0.0', 4, 'ipv4')
BLOCKED_NETWORKS.addAddress('::', 'ipv6')
BLOCKED_NETWORKS.addAddress('::1', 'ipv6')
BLOCKED_NETWORKS.addSubnet('::', 96, 'ipv6')
BLOCKED_NETWORKS.addSubnet('fc00::', 7, 'ipv6')
BLOCKED_NETWORKS.addSubnet('fe80::', 10, 'ipv6')
BLOCKED_NETWORKS.addSubnet('ff00::', 8, 'ipv6')
BLOCKED_NETWORKS.addSubnet('2001:db8::', 32, 'ipv6')
BLOCKED_NETWORKS.addSubnet('64:ff9b::', 96, 'ipv6')
BLOCKED_NETWORKS.addSubnet('2002::', 16, 'ipv6')
BLOCKED_NETWORKS.addSubnet('2001::', 32, 'ipv6')

const BLOCKED_HOSTNAMES = new Set([
  'metadata',
  'metadata.google.internal',
  'metadata.goog',
  'instance-data',
  'instance-data.ec2.internal',
])

const COOKIE_NAME = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/

export function safeUrlForDisplay(value: string): string {
  try {
    const url = new URL(value)
    url.username = ''
    url.password = ''
    url.search = ''
    url.hash = ''
    return url.toString()
  } catch {
    return ''
  }
}

function sanitizeErrorText(value: string): string {
  return value
    .replace(/https?:\/\/[^\s"'<>]+/gi, (match) => safeUrlForDisplay(match) || '[url]')
    .replace(/\s+/g, ' ')
    .slice(0, 300)
}

function normalizeHostname(hostname: string): string {
  return hostname
    .toLowerCase()
    .replace(/^\[/, '')
    .replace(/\]$/, '')
    .replace(/\.$/, '')
}

function normalizeDomain(domain: string): string {
  return normalizeHostname(domain).replace(/^\./, '')
}

function hostMatches(
  hostname: string,
  allowed: string,
  allowSubdomains = true,
): boolean {
  const host = normalizeHostname(hostname)
  const base = normalizeDomain(allowed)
  return host === base || (allowSubdomains && host.endsWith(`.${base}`))
}

function isBlockedHostname(hostname: string): boolean {
  const host = normalizeHostname(hostname)
  if (host === 'localhost' || host.endsWith('.localhost')) return true
  if (host.endsWith('.local') || host.endsWith('.internal')) return true
  return BLOCKED_HOSTNAMES.has(host)
}

function mappedIpv4(address: string): string | undefined {
  const lower = address.toLowerCase()
  const dotted = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(lower)
  if (dotted?.[1]) return dotted[1]
  const hex = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(lower)
  if (!hex?.[1] || !hex[2]) return undefined
  const high = Number.parseInt(hex[1], 16)
  const low = Number.parseInt(hex[2], 16)
  return [high >> 8, high & 255, low >> 8, low & 255].join('.')
}

function isBlockedAddress(address: string): boolean {
  const family = isIP(address)
  if (family === 0) return true
  if (family === 6) {
    const mapped = mappedIpv4(address)
    if (mapped) return isBlockedAddress(mapped)
  }
  try {
    return BLOCKED_NETWORKS.check(address, family === 4 ? 'ipv4' : 'ipv6')
  } catch {
    return true
  }
}

async function defaultResolveHost(hostname: string): Promise<ResolvedAddress[]> {
  const host = normalizeHostname(hostname)
  const family = isIP(host)
  if (family !== 0) return [{ address: host, family }]
  const entries = await dnsLookup(host, { all: true, verbatim: true })
  return entries.map((entry) => ({ address: entry.address, family: entry.family }))
}

function prepareUrl(value: string): URL {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new SafeFetchError('INVALID_URL', 'URL 无效')
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new SafeFetchError('INVALID_URL', '只允许 http(s) URL')
  }
  if (url.username || url.password) {
    throw new SafeFetchError('INVALID_URL', 'URL 不能包含内嵌凭据')
  }
  url.hash = ''
  return url
}

function targetPort(url: URL): number {
  if (url.port) return Number(url.port)
  return url.protocol === 'https:' ? 443 : 80
}

function pathAllowed(pathname: string, prefixes: string[] | undefined): boolean {
  if (!prefixes || prefixes.length === 0) return true
  const path = pathname || '/'
  return prefixes.some((prefix) => {
    const base = prefix.startsWith('/') ? prefix : `/${prefix}`
    if (path === base) return true
    return path.startsWith(base.endsWith('/') ? base : `${base}/`)
  })
}

function assertUrlPolicy(
  url: URL,
  allowedProtocols: AllowedProtocol[],
  allowedPorts: number[],
  allowedPathPrefixes: string[] | undefined,
): void {
  if (!allowedProtocols.includes(url.protocol as AllowedProtocol)) {
    throw new SafeFetchError('UNSAFE_PROTOCOL', `目标协议不允许：${url.protocol}`)
  }
  const port = targetPort(url)
  if (!allowedPorts.includes(port)) {
    throw new SafeFetchError('UNSAFE_PORT', `目标端口不允许：${port}`)
  }
  if (!pathAllowed(url.pathname, allowedPathPrefixes)) {
    throw new SafeFetchError('UNSAFE_PATH', `目标路径不在授权范围内：${url.pathname}`)
  }
}

async function assertSafeTarget(
  url: URL,
  allowedHosts: string[],
  resolveHost: ResolveHost,
  signal: AbortSignal,
  allowedProtocols: AllowedProtocol[],
  allowedPorts: number[],
  allowedPathPrefixes: string[] | undefined,
  allowSubdomains: boolean,
): Promise<PinnedTarget> {
  assertUrlPolicy(url, allowedProtocols, allowedPorts, allowedPathPrefixes)
  const host = normalizeHostname(url.hostname)
  if (
    !allowedHosts.some((allowed) =>
      hostMatches(host, allowed, allowSubdomains),
    )
  ) {
    throw new SafeFetchError('UNSAFE_HOST', `目标主机不在授权范围内：${host}`)
  }
  if (isBlockedHostname(host)) {
    throw new SafeFetchError('UNSAFE_HOST', `目标主机不允许访问：${host}`)
  }

  let addresses: ResolvedAddress[]
  try {
    addresses = await Promise.race([
      resolveHost(host),
      new Promise<never>((_, reject) => {
        if (signal.aborted) {
          reject(new Error('aborted'))
          return
        }
        signal.addEventListener('abort', () => reject(new Error('aborted')), {
          once: true,
        })
      }),
    ])
  } catch (error) {
    if (signal.aborted) throw new SafeFetchError('TIMEOUT', '请求超时')
    throw new SafeFetchError('DNS_FAILED', `无法解析目标主机：${host}`)
  }

  if (addresses.length === 0) {
    throw new SafeFetchError('DNS_FAILED', `无法解析目标主机：${host}`)
  }
  for (const entry of addresses) {
    if (isBlockedAddress(entry.address)) {
      throw new SafeFetchError('UNSAFE_HOST', `目标主机解析到受限地址：${host}`)
    }
  }
  const preferred =
    addresses.find((entry) => entry.family === 4) ?? addresses[0]!
  return { address: preferred.address, family: preferred.family }
}

function toResponseHeaders(headers: Record<string, string[] | undefined>): Headers {
  const result = new Headers()
  for (const [name, values] of Object.entries(headers)) {
    if (!values) continue
    for (const value of values) result.append(name, value)
  }
  return result
}

/** Connect only to the validated address; host/SNI stay those of the URL. */
const pinnedNodeRequest: PinnedRequest = (url, init, target) =>
  new Promise((resolve, reject) => {
    const send = url.protocol === 'https:' ? httpsRequest : httpRequest
    const request = send(
      url,
      {
        method: 'GET',
        headers: init.headers,
        signal: init.signal,
        lookup: (_hostname, options, callback) => {
          const wantsAll =
            typeof options === 'object' && options !== null && options.all === true
          if (wantsAll) {
            ;(callback as unknown as (error: null, addresses: unknown[]) => void)(
              null,
              [{ address: target.address, family: target.family }],
            )
            return
          }
          ;(callback as unknown as (error: null, address: string, family: number) => void)(
            null,
            target.address,
            target.family,
          )
        },
      },
      (response) => {
        const status = response.statusCode ?? 0
        const body =
          status === 204 || status === 304
            ? null
            : (Readable.toWeb(response) as unknown as BodyInit)
        resolve(
          new Response(body, {
            status,
            headers: toResponseHeaders(response.headersDistinct),
          }),
        )
      },
    )
    request.on('error', reject)
    request.end()
  })

function injectedFetch(fetchImpl: typeof fetch): PinnedRequest {
  return (url, init) =>
    fetchImpl(url.toString(), {
      method: 'GET',
      redirect: 'manual',
      headers: init.headers,
      signal: init.signal,
    })
}

function cookieDomainMatches(hostname: string, domain: string): boolean {
  const host = normalizeHostname(hostname)
  if (domain.startsWith('.')) {
    const base = normalizeDomain(domain)
    return host === base || host.endsWith(`.${base}`)
  }
  return host === normalizeHostname(domain)
}

function cookiePathMatches(pathname: string, path: string): boolean {
  const target = path || '/'
  if (!target.startsWith('/')) return false
  if (!pathname.startsWith(target)) return false
  if (pathname.length === target.length) return true
  return target.endsWith('/') || pathname[target.length] === '/'
}

export function validateCookies(cookies: WebCookie[]): void {
  for (const cookie of cookies) {
    if (!COOKIE_NAME.test(cookie.name)) {
      throw new SafeFetchError('INVALID_COOKIE', 'Cookie 名称不合法')
    }
    if (/[\u0000-\u001F\u007F;,]/.test(cookie.value)) {
      throw new SafeFetchError(
        'INVALID_COOKIE',
        `Cookie ${cookie.name} 的值包含非法字符`,
      )
    }
    if (cookie.domain && /[\u0000-\u001F\u007F]/.test(cookie.domain)) {
      throw new SafeFetchError('INVALID_COOKIE', `Cookie ${cookie.name} 的域不合法`)
    }
    if (cookie.path && !cookie.path.startsWith('/')) {
      throw new SafeFetchError('INVALID_COOKIE', `Cookie ${cookie.name} 的路径不合法`)
    }
  }
}

function cookieHeaderFor(
  cookies: WebCookie[],
  url: URL,
  nowMs: number,
): string | undefined {
  const host = normalizeHostname(url.hostname)
  const pathname = url.pathname || '/'
  const nowSeconds = nowMs / 1000
  const selected = cookies
    .filter((cookie) => {
      if (!cookie.domain) return false
      if (!cookieDomainMatches(host, cookie.domain)) return false
      if (!cookiePathMatches(pathname, cookie.path ?? '/')) return false
      if (cookie.secure && url.protocol !== 'https:') return false
      if (cookie.expires !== undefined) {
        if (!Number.isFinite(cookie.expires) || cookie.expires <= nowSeconds) {
          return false
        }
      }
      return true
    })
    .sort((left, right) => (right.path?.length ?? 1) - (left.path?.length ?? 1))

  if (selected.length === 0) return undefined
  return selected.map((cookie) => `${cookie.name}=${cookie.value}`).join('; ')
}

function isRedirect(status: number): boolean {
  return (
    status === 301 || status === 302 || status === 303 || status === 307 || status === 308
  )
}

async function readBody(
  response: Response,
  finalUrl: string,
  maxBytes: number,
  signal: AbortSignal,
): Promise<SafeFetchResult> {
  if (!response.body) {
    return {
      status: response.status,
      finalUrl,
      ...(response.headers.get('content-type')
        ? { contentType: response.headers.get('content-type')! }
        : {}),
      body: '',
      truncated: false,
      redirects: [],
    }
  }

  const encoding = response.headers.get('content-encoding')?.trim().toLowerCase()
  let stream = response.body
  try {
    if (encoding === 'gzip' || encoding === 'x-gzip') {
      stream = stream.pipeThrough(new DecompressionStream('gzip'))
    } else if (encoding === 'deflate') {
      stream = stream.pipeThrough(new DecompressionStream('deflate'))
    }
  } catch (error) {
    throw new SafeFetchError(
      'NETWORK',
      `响应解压失败：${sanitizeErrorText(
        error instanceof Error ? error.message : String(error),
      )}`,
    )
  }

  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let text = ''
  let bytes = 0
  let truncated = false

  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      if (!value || value.byteLength === 0) continue
      const remaining = maxBytes - bytes
      if (value.byteLength > remaining) {
        if (remaining > 0) {
          text += decoder.decode(value.subarray(0, remaining), { stream: true })
          bytes += remaining
        }
        truncated = true
        await reader.cancel().catch(() => undefined)
        break
      }
      bytes += value.byteLength
      text += decoder.decode(value, { stream: true })
    }
    text += decoder.decode()
  } catch (error) {
    if (signal.aborted) throw new SafeFetchError('TIMEOUT', '请求超时')
    throw new SafeFetchError(
      'NETWORK',
      `读取响应失败：${sanitizeErrorText(
        error instanceof Error ? error.message : String(error),
      )}`,
    )
  }

  return {
    status: response.status,
    finalUrl,
    ...(response.headers.get('content-type')
      ? { contentType: response.headers.get('content-type')! }
      : {}),
    body: text,
    truncated,
    redirects: [],
  }
}

/**
 * Fetch a URL with a saved session. Every hop is checked against the allowed
 * hosts and blocked network ranges; cookies are selected per URL attributes.
 */
export async function safeFetch(
  input: string,
  options: SafeFetchOptions,
): Promise<SafeFetchResult> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const maxRedirects = options.maxRedirects ?? DEFAULT_MAX_REDIRECTS
  const maxBytes = Math.max(1, options.maxBytes ?? DEFAULT_MAX_BYTES)
  const allowedProtocols = options.allowedProtocols ?? ['https:']
  const allowedPorts =
    options.allowedPorts ??
    (allowedProtocols.includes('http:') ? [80, 443] : [443])
  const request =
    options.requestImpl ??
    (options.fetchImpl ? injectedFetch(options.fetchImpl) : pinnedNodeRequest)
  const resolveHost = options.resolveHost ?? defaultResolveHost
  const now = options.now ?? Date.now
  const cookies = options.cookies ?? []
  validateCookies(cookies)

  const controller = new AbortController()
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, timeoutMs)

  try {
    let current = prepareUrl(input)
    const redirects: string[] = []

    for (let hop = 0; ; hop += 1) {
      const target = await assertSafeTarget(
        current,
        options.allowedHosts,
        resolveHost,
        controller.signal,
        allowedProtocols,
        allowedPorts,
        options.allowedPathPrefixes,
        options.allowSubdomains ?? true,
      )
      const cookie = cookieHeaderFor(cookies, current, now())

      let response: Response
      try {
        response = await request(
          current,
          {
            headers: {
              Accept:
                'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8',
              'Accept-Encoding': 'identity',
              ...(cookie ? { Cookie: cookie } : {}),
            },
            signal: controller.signal,
          },
          target,
        )
      } catch (error) {
        if (timedOut || controller.signal.aborted) {
          throw new SafeFetchError('TIMEOUT', `请求超时（${timeoutMs}ms）`)
        }
        throw new SafeFetchError(
          'NETWORK',
          `网络请求失败：${sanitizeErrorText(
            error instanceof Error ? error.message : String(error),
          )}`,
        )
      }

      if (response.status === 429) {
        await response.body?.cancel().catch(() => undefined)
        throw new SafeFetchError('RATE_LIMITED', '请求被限流（429）')
      }

      if (isRedirect(response.status)) {
        if (hop >= maxRedirects) {
          throw new SafeFetchError('REDIRECT_LIMIT', '重定向次数超过上限')
        }
        const location = response.headers.get('location')
        if (!location) return await readBody(response, current.toString(), maxBytes, controller.signal)

        let next: URL
        try {
          next = prepareUrl(new URL(location, current).toString())
        } catch {
          throw new SafeFetchError('INVALID_URL', '重定向地址无效')
        }
        if (current.protocol === 'https:' && next.protocol === 'http:') {
          throw new SafeFetchError('DOWNGRADE_BLOCKED', '禁止从 HTTPS 降级到 HTTP')
        }
        redirects.push(safeUrlForDisplay(next.toString()))
        await response.body?.cancel().catch(() => undefined)
        current = next
        continue
      }

      const result = await readBody(response, current.toString(), maxBytes, controller.signal)
      return { ...result, redirects }
    }
  } finally {
    clearTimeout(timer)
  }
}
