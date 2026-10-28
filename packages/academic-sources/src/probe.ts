import { createHash } from 'node:crypto'
import type {
  SourceProbeContainer,
  SourceProbeEvidence,
  SourceProbeLink,
  SourceProbeTable,
} from '@academic/contracts'
import {
  safeFetch,
  safeUrlForDisplay,
  type ResolveHost,
  type WebCookie,
} from '@academic/web-sessions'
import type { ProbeSampleStore } from './sample-store.js'

export interface ProbeSourcePageInput {
  sourceId: string
  config: Record<string, unknown>
  secret: string
  probedAt: string
  url?: string
  captureSample?: boolean
  sampleStore?: ProbeSampleStore
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

export function hostAllowed(host: string, allowed: string[]): boolean {
  const value = host.toLowerCase()
  return allowed.some((entry) => {
    const base = entry.toLowerCase().replace(/^\./, '')
    return value === base || value.endsWith(`.${base}`)
  })
}

export function cookiesFromSecret(secret: string): WebCookie[] {
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
  contentType?: string,
): boolean {
  if (/\/login|\/signin|\/cas\/login/i.test(finalUrl)) return true
  // JS/JSON bundles commonly contain route strings such as "/login"; matching
  // their body would turn a healthy asset into a false AUTH_REQUIRED.
  const isHtml =
    contentType === undefined ||
    contentType.toLowerCase().includes('html')
  if (!isHtml) return false
  const title = plainText(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(body)?.[1] ?? '')
  if (/登录|sign in|log in/i.test(title)) return true
  if (!Array.isArray(patterns)) return false
  // Patterns are URL/title hints, not arbitrary body grep rules.
  const haystack = `${finalUrl}\n${title}`
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

const ASSET_EXTENSION =
  /\.(?:js|mjs|css|png|jpe?g|gif|svg|ico|woff2?|ttf|map)(?:$|[?#])/i

function allowedTarget(
  raw: string,
  base: string,
  allowedHosts: string[],
): URL | undefined {
  try {
    const target = new URL(raw, base)
    if (target.protocol !== 'http:' && target.protocol !== 'https:') {
      return undefined
    }
    if (!hostAllowed(target.hostname, allowedHosts)) return undefined
    target.hash = ''
    return target
  } catch {
    return undefined
  }
}

function scriptLinks(
  body: string,
  finalUrl: string,
  allowedHosts: string[],
): SourceProbeLink[] {
  const links: SourceProbeLink[] = []
  const seen = new Set<string>()
  for (const match of body.matchAll(
    /<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>/gi,
  )) {
    const target = allowedTarget(match[1] ?? '', finalUrl, allowedHosts)
    if (!target) continue
    const safe = safeUrlForDisplay(target.toString())
    if (!safe || seen.has(safe)) continue
    seen.add(safe)
    const name =
      target.pathname.split('/').filter(Boolean).pop() ?? target.pathname
    links.push({ text: name, url: safe })
    if (links.length >= 10) break
  }
  return links
}

function endpointLinks(
  text: string,
  finalUrl: string,
  allowedHosts: string[],
): SourceProbeLink[] {
  const links: SourceProbeLink[] = []
  const seen = new Set<string>()
  const scan = (raw: string): void => {
    if (!raw || ASSET_EXTENSION.test(raw)) return
    const target = allowedTarget(raw, finalUrl, allowedHosts)
    if (!target) return
    const safe = safeUrlForDisplay(target.toString())
    if (!safe || seen.has(safe)) return
    seen.add(safe)
    links.push({ text: target.pathname, url: safe })
  }
  for (const match of text.matchAll(/["'`](\/(?!\/)[^"'`\s]{2,200})["'`]/g)) {
    scan(match[1] ?? '')
    if (links.length >= 20) break
  }
  if (links.length < 20) {
    for (const match of text.matchAll(
      /["'`](https?:\/\/[^"'`\s]{4,300})["'`]/g,
    )) {
      scan(match[1] ?? '')
      if (links.length >= 20) break
    }
  }
  return links.slice(0, 20)
}

function attributeValue(attrs: string, name: string): string | undefined {
  return new RegExp(`\\b${name}\\s*=\\s*["']([^"']+)["']`, 'i').exec(attrs)?.[1]
}

function tableEvidence(body: string): SourceProbeTable[] {
  const tables: SourceProbeTable[] = []
  for (const match of body.matchAll(/<table\b([^>]*)>([\s\S]*?)<\/table>/gi)) {
    const attrs = match[1] ?? ''
    const content = match[2] ?? ''
    const headers: string[] = []
    for (const header of content.matchAll(/<th\b[^>]*>([\s\S]*?)<\/th>/gi)) {
      const text = plainText(header[1] ?? '').slice(0, 80)
      if (text && !headers.includes(text)) headers.push(text)
      if (headers.length >= 12) break
    }
    const firstRow = /<tr\b[^>]*>([\s\S]*?)<\/tr>/i.exec(content)?.[1] ?? ''
    tables.push({
      ...(attributeValue(attrs, 'class')
        ? { className: attributeValue(attrs, 'class')! }
        : {}),
      ...(attributeValue(attrs, 'id')
        ? { id: attributeValue(attrs, 'id')! }
        : {}),
      headers,
      rowCount: (content.match(/<tr\b/gi) ?? []).length,
      cellCount: (firstRow.match(/<(?:td|th)\b/gi) ?? []).length,
    })
    if (tables.length >= 5) break
  }
  return tables
}

function containerEvidence(body: string): SourceProbeContainer[] {
  const containers: SourceProbeContainer[] = []
  const seen = new Set<string>()
  for (const match of body.matchAll(
    /<(ul|ol|li|div|span|a|table|tbody|tr|td|th|form|main|section|article)\b([^>]*)>/gi,
  )) {
    const tag = (match[1] ?? '').toLowerCase()
    const attrs = match[2] ?? ''
    const className = attributeValue(attrs, 'class')
    const id = attributeValue(attrs, 'id')
    if (!className && !id) continue
    const key = `${tag}|${className ?? ''}|${id ?? ''}`
    if (seen.has(key)) continue
    seen.add(key)
    containers.push({
      tag,
      ...(className ? { className } : {}),
      ...(id ? { id } : {}),
    })
    if (containers.length >= 30) break
  }
  return containers
}

export function buildEvidence(
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
  const scripts = scriptLinks(result.body, result.finalUrl, allowedHosts)
  let endpointCandidates: SourceProbeLink[] = []
  if (
    contentType?.includes('javascript') ||
    contentType?.includes('ecmascript')
  ) {
    endpointCandidates = endpointLinks(
      result.body.slice(0, 200_000),
      result.finalUrl,
      allowedHosts,
    )
  } else if (contentType?.includes('html')) {
    let inline = ''
    for (const match of result.body.matchAll(
      /<script\b([^>]*)>([\s\S]*?)<\/script>/gi,
    )) {
      if (/\bsrc\s*=/i.test(match[1] ?? '')) continue
      inline += `\n${match[2] ?? ''}`
      if (inline.length >= 200_000) break
    }
    if (inline) {
      endpointCandidates = endpointLinks(
        inline.slice(0, 200_000),
        result.finalUrl,
        allowedHosts,
      )
    }
  }
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
    scripts,
    endpointCandidates,
    tables: tableEvidence(result.body),
    containers: containerEvidence(result.body),
    formCount: (result.body.match(/<form\b/gi) ?? []).length,
    tableCount: (result.body.match(/<table\b/gi) ?? []).length,
    ...(contentType?.includes('json') && jsonShapeText
      ? { jsonShape: jsonShapeText }
      : {}),
    loginLike: loginLikePage(
      result.finalUrl,
      result.body,
      patterns,
      result.contentType,
    ),
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
  const url = input.url?.trim() || probeUrlFor(input.config)
  if (!url) throw new Error('数据源配置中没有可探测的 URL')
  const cookies = cookiesFromSecret(input.secret)
  const host = new URL(url).hostname
  const cookieDomains = Array.isArray(input.config.cookieDomains)
    ? input.config.cookieDomains.filter(
        (entry): entry is string => typeof entry === 'string',
      )
    : []
  const probeAllowedHosts = Array.isArray(input.config.probeAllowedHosts)
    ? input.config.probeAllowedHosts.filter(
        (entry): entry is string => typeof entry === 'string',
      )
    : []
  const allowedHosts = [
    ...new Set([...cookieDomains, ...probeAllowedHosts]),
  ]
  if (input.url && allowedHosts.length === 0) {
    throw new Error('该来源未配置授权域名，不能探测额外 URL')
  }
  const effectiveHosts = allowedHosts.length > 0 ? allowedHosts : [host]
  if (!hostAllowed(host, effectiveHosts)) {
    throw new Error(
      `探测 URL 主机未授权：${host}。已授权主机：${effectiveHosts.join(', ')}；跨主机的只读探测需在来源配置的 probeAllowedHosts 中显式加入该主机（不会自动携带该域名的 Cookie）`,
    )
  }
  const pathPrefixes = Array.isArray(input.config.probePathPrefixes)
    ? input.config.probePathPrefixes.filter(
        (entry): entry is string => typeof entry === 'string' && entry.startsWith('/'),
      )
    : []
  if (input.captureSample && input.sampleStore) {
    const cached = input.sampleStore.findByUrl(url)
    if (cached?.evidence) {
      return { ...cached.evidence, sampleId: cached.sampleId }
    }
  }
  const result = await safeFetch(url, {
    cookies,
    allowedHosts: effectiveHosts,
    allowedProtocols:
      input.config.allowHttp === true ? ['http:', 'https:'] : ['https:'],
    ...(pathPrefixes.length > 0 ? { allowedPathPrefixes: pathPrefixes } : {}),
    timeoutMs: input.timeoutMs ?? 15_000,
    maxBytes: input.maxBytes ?? 512 * 1024,
    ...(input.fetchImpl ? { fetchImpl: input.fetchImpl } : {}),
    ...(input.resolveHost ? { resolveHost: input.resolveHost } : {}),
  })
  const evidence = buildEvidence(
    input.sourceId,
    url,
    result,
    effectiveHosts,
    input.config.loggedOutPatterns,
    input.probedAt,
  )
  if (!input.captureSample || !input.sampleStore) return evidence
  const captured = input.sampleStore.put(
    {
      url,
      body: result.body,
      ...(result.contentType ? { contentType: result.contentType } : {}),
    },
    evidence,
  )
  return { ...evidence, sampleId: captured.sampleId }
}
