import { createHash } from 'node:crypto'
import type {
  SourceProbeEvidence,
  SourceProbeLink,
} from '@academic/contracts'
import {
  safeFetch,
  safeUrlForDisplay,
  type ResolveHost,
  type WebCookie,
} from '@academic/web-sessions'

export interface ProbeSourcePageInput {
  sourceId: string
  config: Record<string, unknown>
  secret: string
  probedAt: string
  fetchImpl?: typeof fetch
  resolveHost?: ResolveHost
  timeoutMs?: number
  maxBytes?: number
}

function plainText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

export function probeUrlFor(config: Record<string, unknown>): string | undefined {
  for (const key of ['portalUrl', 'baseUrl', 'verifyUrl', 'loginUrl']) {
    const value = config[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return undefined
}

function hostAllowed(host: string, allowed: string[]): boolean {
  const value = host.toLowerCase()
  return allowed.some((entry) => {
    const base = entry.toLowerCase().replace(/^\./, '')
    return value === base || value.endsWith(`.${base}`)
  })
}

function cookiesFromSecret(secret: string): WebCookie[] {
  const parsed = JSON.parse(secret) as { cookies?: unknown }
  if (!Array.isArray(parsed.cookies) || parsed.cookies.length === 0) {
    throw new Error('会话格式无效，请重新登录')
  }
  return parsed.cookies as WebCookie[]
}

function loginLikePage(
  finalUrl: string,
  body: string,
  patterns: unknown,
): boolean {
  if (/\/login|\/signin|\/cas\/login/i.test(finalUrl)) return true
  const title = plainText(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(body)?.[1] ?? '')
  if (/登录|sign in|log in/i.test(title)) return true
  if (!Array.isArray(patterns)) return false
  const haystack = `${finalUrl}\n${body.slice(0, 20_000)}`
  return patterns.some((pattern) => {
    if (typeof pattern !== 'string') return false
    try {
      return new RegExp(pattern).test(haystack)
    } catch {
      return false
    }
  })
}

function jsonShape(value: unknown, depth = 0): string {
  if (Array.isArray(value)) {
    const first = value[0]
    return `array(${value.length}${
      first !== undefined && depth < 1 ? ` of ${jsonShape(first, depth + 1)}` : ''
    })`
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).slice(0, 8)
    return `{${entries
      .map(([key, entry]) => `${key}: ${jsonShape(entry, depth + 1)}`)
      .join(', ')}}`
  }
  if (value === null) return 'null'
  return typeof value
}

function buildEvidence(
  sourceId: string,
  url: string,
  result: Awaited<ReturnType<typeof safeFetch>>,
  allowedHosts: string[],
  patterns: unknown,
  probedAt: string,
): SourceProbeEvidence {
  const title = plainText(
    /<title[^>]*>([\s\S]*?)<\/title>/i.exec(result.body)?.[1] ?? '',
  )
  const headings: string[] = []
  for (const match of result.body.matchAll(/<h[1-3]\b[^>]*>([\s\S]*?)<\/h[1-3]>/gi)) {
    const text = plainText(match[1] ?? '').slice(0, 120)
    if (text && !headings.includes(text)) headings.push(text)
    if (headings.length >= 10) break
  }
  const links: SourceProbeLink[] = []
  const paginationLinks: SourceProbeLink[] = []
  const seen = new Set<string>()
  for (const match of result.body.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
    const href = /href\s*=\s*["']([^"']+)["']/i.exec(match[1] ?? '')?.[1]
    if (!href) continue
    let target: URL
    try {
      target = new URL(href, result.finalUrl)
    } catch {
      continue
    }
    if (target.protocol !== 'http:' && target.protocol !== 'https:') continue
    if (!hostAllowed(target.hostname, allowedHosts)) continue
    const text = plainText(match[2] ?? '').slice(0, 80)
    const safe = safeUrlForDisplay(target.toString())
    if (!safe || seen.has(`${safe}\n${text}`)) continue
    seen.add(`${safe}\n${text}`)
    const entry = { text: text || safe, url: safe }
    if (
      paginationLinks.length < 10 &&
      (/下一页|下页|next|»|›/i.test(text) ||
        /(?:startIndex|page|offset)=/i.test(target.search))
    ) {
      paginationLinks.push(entry)
    }
    if (links.length < 20) links.push(entry)
  }
  const contentType = result.contentType
  let jsonShapeText: string | undefined
  if (contentType?.includes('json')) {
    try {
      jsonShapeText = jsonShape(JSON.parse(result.body)).slice(0, 500)
    } catch {
      jsonShapeText = undefined
    }
  }
  return {
    sourceId,
    url: safeUrlForDisplay(url),
    finalUrl: safeUrlForDisplay(result.finalUrl),
    status: result.status,
    ...(title ? { title } : {}),
    ...(contentType ? { contentType } : {}),
    bytes: result.body.length,
    truncated: result.truncated,
    headings,
    links,
    paginationLinks,
    formCount: (result.body.match(/<form\b/gi) ?? []).length,
    tableCount: (result.body.match(/<table\b/gi) ?? []).length,
    ...(contentType?.includes('json') && jsonShapeText
      ? { jsonShape: jsonShapeText }
      : {}),
    loginLike: loginLikePage(result.finalUrl, result.body, patterns),
    warnings: result.truncated ? ['响应超过大小上限，仅分析前 512KB'] : [],
    probedAt,
    digest: createHash('sha256').update(result.body).digest('hex'),
  }
}

/**
 * Read one authorized page with a saved session and return sanitized evidence.
 * Never writes, never returns cookies, and strips URL credentials and queries.
 */
export async function probeSourcePage(
  input: ProbeSourcePageInput,
): Promise<SourceProbeEvidence> {
  const url = probeUrlFor(input.config)
  if (!url) throw new Error('数据源配置中没有可探测的 URL')
  const cookies = cookiesFromSecret(input.secret)
  const host = new URL(url).hostname
  const cookieDomains = Array.isArray(input.config.cookieDomains)
    ? input.config.cookieDomains.filter(
        (entry): entry is string => typeof entry === 'string',
      )
    : []
  const allowedHosts = cookieDomains.length > 0 ? cookieDomains : [host]
  const result = await safeFetch(url, {
    cookies,
    allowedHosts,
    allowedProtocols:
      input.config.allowHttp === true ? ['http:', 'https:'] : ['https:'],
    timeoutMs: input.timeoutMs ?? 15_000,
    maxBytes: input.maxBytes ?? 512 * 1024,
    ...(input.fetchImpl ? { fetchImpl: input.fetchImpl } : {}),
    ...(input.resolveHost ? { resolveHost: input.resolveHost } : {}),
  })
  return buildEvidence(
    input.sourceId,
    url,
    result,
    allowedHosts,
    input.config.loggedOutPatterns,
    input.probedAt,
  )
}
