import { createHash } from 'node:crypto'
import type { Due } from '@academic/contracts'

export interface ParsedCourseRef {
  externalCourseId: string
  code: string
  termId: string
  title: string
  url: string
}

export interface ParsedAssignmentRef {
  externalItemId: string
  courseExternalId: string
  title: string
  url: string
}

export interface ParsedAssignment {
  externalItemId: string
  courseExternalId: string
  kind: 'assignment' | 'exam' | 'quiz'
  title: string
  description?: string
  due: Due
  sourceUrl: string
  contentHash: string
}

export interface CourseFilter {
  baseUrl: string
  termFilter?: string[]
  courseFilter?: string[]
  maxCourses?: number
}

export interface ParsedCourseList {
  courses: ParsedCourseRef[]
  truncated: boolean
}

export interface ParsedAssignmentList {
  assignments: ParsedAssignmentRef[]
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  ndash: '–',
  mdash: '—',
  hellip: '…',
  rsquo: '’',
  lsquo: '‘',
  rdquo: '”',
  ldquo: '“',
}

export function decodeEntities(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) =>
      String.fromCodePoint(Number.parseInt(hex, 16)),
    )
    .replace(/&#(\d+);/g, (_, decimal: string) =>
      String.fromCodePoint(Number(decimal)),
    )
    .replace(/&([a-z]+);/gi, (entity, name: string) => {
      return NAMED_ENTITIES[name.toLowerCase()] ?? entity
    })
}

export function stripHtml(value: string): string {
  return decodeEntities(
    value
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/\s+/g, ' ')
    .trim()
}

export function absoluteUrl(href: string, baseUrl: string): string | undefined {
  try {
    return new URL(href.replace(/&amp;/g, '&'), baseUrl).toString()
  } catch {
    return undefined
  }
}

interface Anchor {
  text: string
  title?: string
  href: string
}

function anchors(html: string, baseUrl: string): Anchor[] {
  const result: Anchor[] = []
  for (const match of html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
    const attributes = match[1] ?? ''
    const href = /href\s*=\s*["']([^"']+)["']/i.exec(attributes)?.[1]
    if (!href) continue
    const url = absoluteUrl(href, baseUrl)
    if (!url) continue
    const title = /title\s*=\s*["']([^"']*)["']/i.exec(attributes)?.[1]
    const text = stripHtml(match[2] ?? '') || (title ? decodeEntities(title) : '')
    result.push({
      href: url,
      text: text.slice(0, 300),
      ...(title ? { title: decodeEntities(title).slice(0, 300) } : {}),
    })
  }
  return result
}

function searchParam(url: string, names: string[]): string | undefined {
  try {
    const parsed = new URL(url)
    for (const name of names) {
      const value = parsed.searchParams.get(name)
      if (value) return value
    }
  } catch {
    return undefined
  }
  return undefined
}

export function courseExternalIdFromUrl(url: string): string | undefined {
  return searchParam(url, ['course_id', 'id'])
}

export function parseCourseTitle(value: string): {
  code: string
  termId: string
  title: string
} {
  const text = stripHtml(value)
  const split = text.match(/^(.+?)[:：]\s*(.+)$/)
  if (!split?.[1] || !split[2]) return { code: '', termId: 'unknown', title: text }
  const left = split[1].trim()
  const title = split[2].trim()
  const parts = left.split('.').filter(Boolean)
  const term = parts.at(-1)
  if (term && /^\d{4}(FA|SP|SU|WI)$/i.test(term)) {
    return {
      code: parts.slice(0, -1).join('.'),
      termId: term.toUpperCase(),
      title,
    }
  }
  return { code: left, termId: 'unknown', title }
}

const TERM_RANK: Record<string, number> = { WI: 0, SP: 1, SU: 2, FA: 3 }

export function compareTerms(left: string, right: string): number {
  const parse = (value: string) => {
    const match = /^(\d{4})(WI|SP|SU|FA)$/i.exec(value)
    if (!match?.[1] || !match[2]) return undefined
    return { year: Number(match[1]), term: TERM_RANK[match[2].toUpperCase()] ?? 0 }
  }
  const a = parse(left)
  const b = parse(right)
  if (!a || !b) return left.localeCompare(right)
  return a.year - b.year || a.term - b.term
}

export function parseCourseLinks(html: string, options: CourseFilter): ParsedCourseList {
  const filters = {
    terms: options.termFilter?.map((value) => value.toUpperCase()),
    courses: options.courseFilter?.map((value) => value.toLowerCase()),
  }
  const byId = new Map<string, ParsedCourseRef>()

  for (const anchor of anchors(html, options.baseUrl)) {
    if (
      !/launcher\?type=Course/i.test(anchor.href) &&
      !/listContent\.jsp\?course_id=/i.test(anchor.href) &&
      !/courseMain\?course_id=/i.test(anchor.href)
    ) {
      continue
    }
    const externalCourseId = courseExternalIdFromUrl(anchor.href)
    if (!externalCourseId) continue
    const parsed = parseCourseTitle(anchor.text || anchor.title || '')
    if (!parsed.title) continue
    const existing = byId.get(externalCourseId)
    const candidate = {
      externalCourseId,
      code: parsed.code,
      termId: parsed.termId,
      title: parsed.title,
      url: anchor.href,
    }
    if (!existing) {
      byId.set(externalCourseId, candidate)
      continue
    }
    if (existing.termId === 'unknown' && candidate.termId !== 'unknown') {
      byId.set(externalCourseId, candidate)
    }
  }

  const courses = [...byId.values()].filter((course) => {
    if (
      filters.terms &&
      filters.terms.length > 0 &&
      !filters.terms.includes(course.termId.toUpperCase())
    ) {
      return false
    }
    if (filters.courses && filters.courses.length > 0) {
      const haystack = `${course.code} ${course.title}`.toLowerCase()
      if (!filters.courses.some((value) => haystack.includes(value))) return false
    }
    return true
  })

  let truncated = false
  const limit = options.maxCourses ?? 50
  if (courses.length > limit) {
    courses.length = limit
    truncated = true
  }
  return { courses, truncated }
}

export function findAssignmentsAreaUrl(
  courseHtml: string,
  baseUrl: string,
): string | undefined {
  const candidate = anchors(courseHtml, baseUrl).find((anchor) => {
    if (!/listContent\.jsp\?/i.test(anchor.href)) return false
    const label = `${anchor.text} ${anchor.title ?? ''}`
    return /作业|assignment/i.test(label)
  })
  return candidate?.href
}

export function parseAssignmentLinks(
  assignmentsHtml: string,
  baseUrl: string,
  courseExternalId: string,
): ParsedAssignmentList {
  const seen = new Set<string>()
  const assignments: ParsedAssignmentRef[] = []
  for (const anchor of anchors(assignmentsHtml, baseUrl)) {
    if (!/\/webapps\/assignment\//i.test(anchor.href)) continue
    const contentId = searchParam(anchor.href, ['content_id'])
    if (!contentId) continue
    const courseId = searchParam(anchor.href, ['course_id']) ?? courseExternalId
    const externalItemId = `bb:${courseId}:${contentId}`
    if (seen.has(externalItemId)) continue
    seen.add(externalItemId)
    assignments.push({
      externalItemId,
      courseExternalId: courseId,
      title: anchor.text || anchor.title || contentId,
      url: anchor.href,
    })
  }
  return { assignments }
}

export function isLoginPage(
  finalUrl: string,
  body: string,
  loggedOutPatterns: string[] = [],
): boolean {
  const haystack = `${finalUrl}\n${body.slice(0, 20_000)}`
  for (const pattern of loggedOutPatterns) {
    try {
      if (new RegExp(pattern).test(haystack)) return true
    } catch {
      // Ignore a malformed optional pattern; the structural checks still apply.
    }
  }
  return (
    /\/webapps\/login|\/cas\/login|id\.ustc\.edu\.cn/i.test(finalUrl) ||
    /name=["']login["']|id=["']loginForm["']/i.test(body)
  )
}

const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
]

function validDate(year: number, month: number, day: number): boolean {
  const date = new Date(Date.UTC(year, month - 1, day))
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  )
}

function two(value: number): string {
  return String(value).padStart(2, '0')
}

export function parseDue(
  value: string,
  zone: string,
  utcOffsetMinutes: number,
): Due {
  const text = stripHtml(value)
  const chinese = new RegExp(
    `(\\d{4})\\s*年\\s*(\\d{1,2})\\s*月\\s*(\\d{1,2})\\s*日` +
      `(?:\\s*星期[一二三四五六日天])?` +
      `(?:\\s*(上午|下午|晚上)?\\s*(\\d{1,2})\\s*[:：]\\s*(\\d{2}))?`,
  ).exec(text)
  if (chinese?.[1] && chinese[2] && chinese[3]) {
    const year = Number(chinese[1])
    const month = Number(chinese[2])
    const day = Number(chinese[3])
    if (!validDate(year, month, day)) return { kind: 'unknown' }
    const date = `${year}-${two(month)}-${two(day)}`
    const hourText = chinese[4]
    const hourRaw = chinese[5]
    const minuteRaw = chinese[6]
    if (hourRaw && minuteRaw) {
      let hour = Number(hourRaw)
      const minute = Number(minuteRaw)
      if (hourText && /上午/.test(hourText) && hour === 12) hour = 0
      if (hourText && /下午|晚上/.test(hourText) && hour < 12) hour += 12
      if (hour > 23 || minute > 59) return { kind: 'local-date', date, zone }
      const utc = new Date(
        Date.UTC(year, month - 1, day, hour, minute) - utcOffsetMinutes * 60_000,
      ).toISOString()
      return { kind: 'instant', utc, zone }
    }
    return { kind: 'local-date', date, zone }
  }

  const english = new RegExp(
    `(${MONTHS.join('|')})\\s+(\\d{1,2}),?\\s+(\\d{4})` +
      `(?:\\s+(\\d{1,2}):(\\d{2})\\s*(AM|PM)?)?`,
    'i',
  ).exec(text)
  if (english?.[1] && english[2] && english[3]) {
    const month = MONTHS.indexOf(
      MONTHS.find((name) => name.toLowerCase() === english[1]!.toLowerCase()) ??
        english[1]!,
    ) + 1
    const day = Number(english[2])
    const year = Number(english[3])
    if (!validDate(year, month, day)) return { kind: 'unknown' }
    const date = `${year}-${two(month)}-${two(day)}`
    if (english[4] && english[5]) {
      let hour = Number(english[4])
      const minute = Number(english[5])
      if (english[6]?.toUpperCase() === 'PM' && hour < 12) hour += 12
      if (english[6]?.toUpperCase() === 'AM' && hour === 12) hour = 0
      if (hour > 23 || minute > 59) return { kind: 'local-date', date, zone }
      const utc = new Date(
        Date.UTC(year, month - 1, day, hour, minute) - utcOffsetMinutes * 60_000,
      ).toISOString()
      return { kind: 'instant', utc, zone }
    }
    return { kind: 'local-date', date, zone }
  }

  const iso = /(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/.exec(text)
  if (iso?.[1] && iso[2] && iso[3]) {
    const year = Number(iso[1])
    const month = Number(iso[2])
    const day = Number(iso[3])
    if (!validDate(year, month, day)) return { kind: 'unknown' }
    const date = `${year}-${month.toString().padStart(2, '0')}-${day
      .toString()
      .padStart(2, '0')}`
    if (iso[4] && iso[5]) {
      const utc = new Date(
        Date.UTC(year, month - 1, day, Number(iso[4]), Number(iso[5])) -
          utcOffsetMinutes * 60_000,
      ).toISOString()
      return { kind: 'instant', utc, zone }
    }
    return { kind: 'local-date', date, zone }
  }

  return { kind: 'unknown' }
}

export function parseAssignmentDetail(
  html: string,
  url: string,
  courseExternalId: string,
  fallbackTitle: string,
  options: { zone: string; utcOffsetMinutes: number },
): ParsedAssignment {
  const contentId = searchParam(url, ['content_id'])
  if (!contentId) throw new Error('Assignment URL has no content_id')
  const pageTitle = decodeEntities(
    /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? '',
  )
  const titleMatch =
    /^(?:上载作业|复查提交历史记录|Upload Assignment|Review Submission History)\s*[:：]\s*(.+?)(?:\s+[–-]\s+.*)?$/i.exec(
      stripHtml(pageTitle),
    )
  const title = (titleMatch?.[1] ?? fallbackTitle).trim() || fallbackTitle
  const pageText = stripHtml(html)
  const dueHtml =
    /<div[^>]*id=["']assignMeta2["'][^>]*>[\s\S]*?截止日期[\s\S]*?<div[^>]*class=["'][^"']*metaField[^"']*["'][^>]*>([\s\S]*?)<\/div>/i.exec(
      html,
    )?.[1] ??
    /截止日期\s*([\s\S]{0,160})/i.exec(pageText)?.[1] ??
    ''
  const due = parseDue(
    stripHtml(dueHtml),
    options.zone,
    options.utcOffsetMinutes,
  )
  const instructions =
    /<li[^>]*id=["']instructions["'][^>]*>([\s\S]*?)<\/li>/i.exec(html)?.[1] ?? ''
  const description = stripHtml(instructions).slice(0, 4000)
  const kind = /考试|exam/i.test(title)
    ? 'exam'
    : /测验|quiz|test/i.test(title)
      ? 'quiz'
      : 'assignment'
  const contentHash = createHash('sha256')
    .update(
      JSON.stringify({
        title,
        description,
        due,
        courseExternalId,
      }),
    )
    .digest('hex')
  return {
    externalItemId: `bb:${courseExternalId}:${contentId}`,
    courseExternalId,
    kind,
    title,
    ...(description ? { description } : {}),
    due,
    sourceUrl: url,
    contentHash,
  }
}
