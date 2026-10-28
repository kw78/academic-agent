import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export const USTC_BLACKBOARD_SOURCE_ID = 'ustc-blackboard'
export const USTC_BLACKBOARD_PORTAL_URL =
  'https://www.bb.ustc.edu.cn/webapps/portal/execute/tabs/tabAction?tab_tab_group_id=_1_1'

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'

export interface BlackboardCourseLink {
  title: string
  url: string
}

export interface BlackboardProbeOptions {
  cookie: string
  outputDir: string
  portalUrl?: string
  maxCourses?: number
  fetchImpl?: typeof fetch
}

export interface BlackboardProbeResult {
  portalUrl: string
  finalUrl: string
  status: number
  requiresLogin: boolean
  title?: string
  courseLinks: BlackboardCourseLink[]
  saved: string[]
  warnings: string[]
}

function normalizeCookie(secret: string): string {
  const trimmed = secret.trim()
  if (!trimmed) throw new Error('会话 Cookie 不能为空')
  if (/[\r\n]/.test(trimmed)) {
    throw new Error('会话 Cookie 不能包含换行')
  }
  try {
    const parsed = JSON.parse(trimmed) as { cookie?: unknown; token?: unknown }
    if (typeof parsed.cookie === 'string' && parsed.cookie.trim()) {
      return parsed.cookie.trim()
    }
    if (typeof parsed.token === 'string' && parsed.token.trim()) {
      return parsed.token.trim()
    }
  } catch {
    // A raw Cookie header is the common manual-import form.
  }
  return trimmed
}

function decodeHtml(value: string): string {
  return value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
}

function textOf(html: string): string {
  return decodeHtml(html.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim()
}

function titleOf(html: string): string | undefined {
  const match = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)
  const title = match?.[1] ? textOf(match[1]) : ''
  return title || undefined
}

function isLoginUrl(url: string): boolean {
  return (
    /\/webapps\/login/i.test(url) ||
    /\/cas\/login/i.test(url) ||
    /id\.ustc\.edu\.cn/i.test(url)
  )
}

function looksLikeLoginPage(html: string): boolean {
  return (
    /name=["']login["']/i.test(html) ||
    /<form[^>]+action=["'][^"']*\/webapps\/login/i.test(html)
  )
}

/**
 * Extract course anchors without depending on a DOM implementation. The
 * selectors cover Classic Learn launcher links and content-list links.
 */
export function extractCourseLinks(
  html: string,
  baseUrl: string,
): BlackboardCourseLink[] {
  const links: BlackboardCourseLink[] = []
  const seen = new Set<string>()
  const anchor = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi
  let match: RegExpExecArray | null
  while ((match = anchor.exec(html)) !== null) {
    const attributes = match[1] ?? ''
    const body = match[2] ?? ''
    const href =
      /href\s*=\s*["']([^"']+)["']/i.exec(attributes)?.[1] ??
      /href\s*=\s*([^\s>]+)/i.exec(attributes)?.[1]
    if (!href) continue
    const decodedHref = decodeHtml(href)
    if (
      !/launcher\?type=Course/i.test(decodedHref) &&
      !/listContent\.jsp\?course_id=/i.test(decodedHref) &&
      !/course_id=/i.test(decodedHref)
    ) {
      continue
    }
    let url: string
    try {
      url = new URL(decodedHref, baseUrl).toString()
    } catch {
      continue
    }
    if (seen.has(url)) continue
    seen.add(url)
    const titleAttribute =
      /title\s*=\s*["']([^"']+)["']/i.exec(attributes)?.[1] ??
      /aria-label\s*=\s*["']([^"']+)["']/i.exec(attributes)?.[1]
    const title = textOf(body) || decodeHtml(titleAttribute ?? '') || url
    links.push({ title, url })
  }
  return links
}

function outputPath(outputDir: string, name: string): string {
  mkdirSync(outputDir, { recursive: true })
  return join(outputDir, name)
}

/**
 * Read-only diagnostic for a manually authenticated Blackboard session. It
 * writes HTML locally for parser development and never returns the cookie.
 */
export async function probeBlackboard(
  options: BlackboardProbeOptions,
): Promise<BlackboardProbeResult> {
  const cookie = normalizeCookie(options.cookie)
  const fetchImpl = options.fetchImpl ?? fetch
  const portalUrl = options.portalUrl ?? USTC_BLACKBOARD_PORTAL_URL
  const response = await fetchImpl(portalUrl, {
    headers: {
      Cookie: cookie,
      'User-Agent': USER_AGENT,
      Accept: 'text/html,application/xhtml+xml',
    },
    redirect: 'follow',
  })
  const html = await response.text()
  const finalUrl = response.url || portalUrl
  const requiresLogin = isLoginUrl(finalUrl) || looksLikeLoginPage(html)
  const courseLinks = requiresLogin ? [] : extractCourseLinks(html, finalUrl)
  const saved = [outputPath(options.outputDir, 'portal.html')]
  writeFileSync(saved[0]!, html)

  const warnings: string[] = []
  if (requiresLogin) {
    warnings.push('Blackboard returned the login page; the session cookie is invalid or expired')
  } else if (courseLinks.length === 0) {
    warnings.push('No course links matched the Classic Learn patterns; inspect portal.html')
  }

  const maxCourses = Math.min(10, Math.max(0, options.maxCourses ?? 3))
  for (const course of courseLinks.slice(0, maxCourses)) {
    try {
      const courseResponse = await fetchImpl(course.url, {
        headers: {
          Cookie: cookie,
          'User-Agent': USER_AGENT,
          Accept: 'text/html,application/xhtml+xml',
        },
        redirect: 'follow',
      })
      const courseHtml = await courseResponse.text()
      if (isLoginUrl(courseResponse.url) || looksLikeLoginPage(courseHtml)) {
        warnings.push(`Course page redirected to login: ${course.url}`)
        break
      }
      const index = saved.filter((path) => path.includes('course-')).length + 1
      const path = outputPath(options.outputDir, `course-${index}.html`)
      writeFileSync(path, courseHtml)
      saved.push(path)
    } catch (error) {
      warnings.push(
        `Course fetch failed: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }

  const result: BlackboardProbeResult = {
    portalUrl,
    finalUrl,
    status: response.status,
    requiresLogin,
    ...(titleOf(html) ? { title: titleOf(html) } : {}),
    courseLinks,
    saved,
    warnings,
  }
  writeFileSync(
    outputPath(options.outputDir, 'summary.json'),
    JSON.stringify(
      {
        ...result,
        // The cookie must never be written into the summary.
      },
      null,
      2,
    ),
  )
  return result
}

export {
  loginBlackboardWithBrowser,
  USTC_BLACKBOARD_LOGIN_URL,
  type BlackboardLoginOptions,
  type BlackboardLoginResult,
} from './login.js'
export {
  createBlackboardEngine,
  blackboardConfigSchema,
  type BlackboardConfig,
  type BlackboardEngineOptions,
} from './engine.js'
export { normalizeTermId } from './parse.js'
