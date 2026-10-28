import type {
  SourceCrawlFailure,
  SourceCrawlOptions,
  SourceCrawlResult,
  SourceProbeEvidence,
} from '@academic/contracts'
import {
  SafeFetchError,
  safeFetch,
  safeUrlForDisplay,
  type ResolveHost,
} from '@academic/web-sessions'
import {
  buildEvidence,
  cookiesFromSecret,
  hostAllowed,
} from './probe.js'
import type { ProbeSampleStore } from './sample-store.js'

const CRAWL_SKIP_PATH =
  /\/(?:logout|signout|sign-out|login|signin|sign-in|cas\/login)(?:[/?#]|$)/i
const CRAWL_SKIP_EXTENSION =
  /\.(?:pdf|zip|7z|rar|tar|gz|tgz|png|jpe?g|gif|svg|ico|webp|woff2?|ttf|mp3|mp4|mov|avi|css|js|mjs)(?:$|[?#])/i

export interface CrawlSourcePagesInput {
  sourceId: string
  config: Record<string, unknown>
  secret: string
  startUrl: string
  options?: SourceCrawlOptions
  sampleStore?: ProbeSampleStore
  fetchImpl?: typeof fetch
  resolveHost?: ResolveHost
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))]
}

function pathAllowedBy(prefixes: string[], pathname: string): boolean {
  if (prefixes.length === 0) return true
  return prefixes.some((prefix) => {
    const base = prefix.startsWith('/') ? prefix : `/${prefix}`
    return (
      pathname === base ||
      pathname.startsWith(base.endsWith('/') ? base : `${base}/`)
    )
  })
}

function crawlScope(
  config: Record<string, unknown>,
  start: URL,
): { allowedHosts: string[]; pathPrefixes: string[]; allowAnyPublicHost: boolean } {
  const cookieDomains = Array.isArray(config.cookieDomains)
    ? config.cookieDomains.filter(
        (entry): entry is string => typeof entry === 'string',
      )
    : []
  const extraHosts = Array.isArray(config.probeAllowedHosts)
    ? config.probeAllowedHosts.filter(
        (entry): entry is string => typeof entry === 'string',
      )
    : []
  const allowAnyPublicHost = config.probeAllowAnyPublicHost !== false
  const allowedHosts = allowAnyPublicHost
    ? ['*']
    : uniqueStrings([...cookieDomains, ...extraHosts])
  if (allowedHosts.length === 0) {
    throw new Error('该来源未配置授权域名，不能抓取站点')
  }
  if (!hostAllowed(start.hostname, allowedHosts)) {
    throw new Error(
      `抓取 URL 主机未授权：${start.hostname}。当前允许主机：${allowedHosts.join(', ')}；该来源设置了 probeAllowAnyPublicHost=false，可改为 true 或把主机加入 probeAllowedHosts`,
    )
  }
  const configured = Array.isArray(config.probePathPrefixes)
    ? config.probePathPrefixes.filter(
        (entry): entry is string =>
          typeof entry === 'string' && entry.startsWith('/'),
      )
    : []
  const defaultPathPrefix = allowAnyPublicHost
    ? '/'
    : start.pathname.endsWith('/')
      ? start.pathname
      : start.pathname.slice(0, start.pathname.lastIndexOf('/') + 1) || '/'
  return {
    allowedHosts,
    pathPrefixes: configured.length > 0 ? configured : [defaultPathPrefix],
    allowAnyPublicHost,
  }
}

/**
 * Reads a bounded section starting from one URL. It follows GET links only,
 * never submits forms, never leaves the explicitly allowed hosts/path
 * prefixes, and returns sanitized page evidence instead of raw HTML.
 */
export async function crawlSourcePages(
  input: CrawlSourcePagesInput,
): Promise<SourceCrawlResult> {
  const start = new URL(input.startUrl)
  if (start.protocol !== 'http:' && start.protocol !== 'https:') {
    throw new Error('只允许 http(s) 抓取')
  }
  const options = input.options ?? {}
  const { allowedHosts, pathPrefixes, allowAnyPublicHost } = crawlScope(
    input.config,
    start,
  )
  const requestedPrefix = options.pathPrefix
    ? options.pathPrefix.startsWith('/')
      ? options.pathPrefix
      : `/${options.pathPrefix}`
    : undefined
  if (requestedPrefix) {
    const normalized = requestedPrefix.replace(/\/+$/, '') || '/'
    const within = pathPrefixes.some((prefix) => {
      const base = prefix.replace(/\/+$/, '') || '/'
      return normalized === base || normalized.startsWith(base === '/' ? '/' : `${base}/`)
    })
    if (!within) {
      throw new Error(
        `抓取路径前缀不在来源授权范围内：${requestedPrefix}（已授权：${pathPrefixes.join(', ')}）`,
      )
    }
  }
  const prefixes = requestedPrefix ? [requestedPrefix] : pathPrefixes
  const maxPages = Math.min(Math.max(options.maxPages ?? 5, 1), 10)
  const maxDepth = Math.min(Math.max(options.maxDepth ?? 1, 0), 2)
  const totalTimeoutMs = Math.min(
    Math.max(options.totalTimeoutMs ?? 25_000, 2_000),
    60_000,
  )
  const delayMs = Math.min(Math.max(options.delayMs ?? 200, 0), 2_000)
  const maxBytes = options.maxBytes ?? 512 * 1024
  const cookies = cookiesFromSecret(input.secret)
  const queue: Array<{ url: string; depth: number }> = []
  const seen = new Set<string>()
  const pages: SourceProbeEvidence[] = []
  const failures: SourceCrawlFailure[] = []
  let discovered = 0
  let fetched = 0
  let skipped = 0
  let stopReason: SourceCrawlResult['stopReason']

  const enqueue = (raw: string, base: string, depth: number): void => {
    if (depth > maxDepth) return
    let target: URL
    try {
      target = new URL(raw, base)
    } catch {
      skipped += 1
      return
    }
    if (target.protocol !== 'http:' && target.protocol !== 'https:') {
      skipped += 1
      return
    }
    if (!hostAllowed(target.hostname, allowedHosts)) {
      skipped += 1
      return
    }
    if (!pathAllowedBy(prefixes, target.pathname)) {
      skipped += 1
      return
    }
    if (CRAWL_SKIP_PATH.test(target.pathname)) {
      skipped += 1
      return
    }
    if (CRAWL_SKIP_EXTENSION.test(target.pathname)) {
      skipped += 1
      return
    }
    target.hash = ''
    const url = target.toString()
    if (seen.has(url)) return
    seen.add(url)
    discovered += 1
    queue.push({ url, depth })
  }

  enqueue(start.toString(), start.toString(), 0)
  const deadline = Date.now() + totalTimeoutMs
  while (queue.length > 0 && fetched < maxPages) {
    if (Date.now() > deadline) {
      stopReason = 'time-limit'
      break
    }
    const item = queue.shift()!
    fetched += 1
    try {
      const itemHost = new URL(item.url).hostname
      const result = await safeFetch(item.url, {
        cookies,
        allowedHosts: allowAnyPublicHost ? [itemHost] : allowedHosts,
        allowedProtocols:
          input.config.allowHttp === true ? ['http:', 'https:'] : ['https:'],
        ...(prefixes.length > 0 ? { allowedPathPrefixes: prefixes } : {}),
        timeoutMs: 15_000,
        maxBytes,
        ...(input.fetchImpl ? { fetchImpl: input.fetchImpl } : {}),
        ...(input.resolveHost ? { resolveHost: input.resolveHost } : {}),
      })
      const evidence = buildEvidence(
        input.sourceId,
        item.url,
        result,
        allowedHosts,
        input.config.loggedOutPatterns,
        new Date().toISOString(),
      )
      if (result.status === 401 || result.status === 403) {
        pages.push(evidence)
        stopReason = 'auth-required'
        break
      }
      if (evidence.loginLike) {
        pages.push(evidence)
        stopReason = 'login-page'
        break
      }
      if (options.captureSample && input.sampleStore) {
        const captured = input.sampleStore.put(
          {
            url: item.url,
            body: result.body,
            ...(result.contentType ? { contentType: result.contentType } : {}),
          },
          evidence,
        )
        pages.push({ ...evidence, sampleId: captured.sampleId })
      } else {
        pages.push(evidence)
      }
      if (item.depth < maxDepth) {
        for (const match of result.body.matchAll(
          /<a\b[^>]*\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))[^>]*>/gi,
        )) {
          const href = match[1] ?? match[2] ?? match[3] ?? ''
          if (href) enqueue(href, result.finalUrl, item.depth + 1)
        }
      }
    } catch (error) {
      if (error instanceof SafeFetchError && error.code === 'RATE_LIMITED') {
        stopReason = 'rate-limited'
        break
      }
      failures.push({
        url: safeUrlForDisplay(item.url) ?? '[url]',
        message: error instanceof Error ? error.message : String(error),
      })
    }
    if (fetched < maxPages && Date.now() + delayMs <= deadline) {
      await new Promise((resolve) => setTimeout(resolve, delayMs))
    }
  }
  if (!stopReason && fetched >= maxPages && queue.length > 0) {
    stopReason = 'max-pages'
  }
  return {
    sourceId: input.sourceId,
    startUrl: safeUrlForDisplay(start.toString()) ?? start.toString(),
    pages,
    failures,
    discovered,
    fetched,
    skipped,
    ...(stopReason ? { stopReason } : {}),
    crawledAt: new Date().toISOString(),
  }
}
