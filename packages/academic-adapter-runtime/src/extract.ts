import { createContext, Script } from 'node:vm'
import { parseHTML } from 'linkedom'
import type { ManifestExtractor, ManifestRequest } from './manifest.js'

export interface ExtractedPage {
  rows: Array<Record<string, unknown>>
  next?: string
  truncated?: boolean
}

export const MAX_REGEX_INPUT = 10_000
export const MAX_ROWS_PER_PAGE = 1_000

export interface RegexBudget {
  remainingMs: number
}

interface RegexContext {
  pattern: string
  value: string
}

const REGEX_BUDGET_MS = 500
const REGEX_TIMEOUT_MS = 100
const regexContext = createContext({
  pattern: '',
  value: '',
}) as unknown as RegexContext
const regexScript = new Script(
  '(() => {' +
    'const m = new RegExp(pattern).exec(value);' +
    'return m ? Array.prototype.map.call(m, (entry) => entry === undefined ? null : String(entry)) : null' +
    '})()',
)

/** Reject patterns that are prone to catastrophic backtracking. */
export function regexSafetyError(pattern: string): string | undefined {
  if (pattern.length > 300) return '正则表达式过长'
  if (/\\[1-9]/.test(pattern)) return '不允许正则反向引用'
  if (/\(\?[=!<]/.test(pattern)) return '不允许环视或后行断言'
  if (/\((?:[^()\\]|\\.)*[+*](?:[^()\\]|\\.)*\)\s*(?:[+*]|\{\d+,?\d*\})/.test(pattern)) {
    return '不允许嵌套量词'
  }
  if (/\((?:[^()\\]|\\.)*\|(?:[^()\\]|\\.)*\)\s*(?:[+*]|\{\d+,?\d*\})/.test(pattern)) {
    return '不允许对含分支的组使用量词'
  }
  for (const match of pattern.matchAll(/\{\s*(\d+)(?:\s*,\s*(\d*))?\s*\}/g)) {
    const upper = match[2] && match[2] !== '' ? Number(match[2]) : Number(match[1])
    if (upper > 1_000) return '不允许过大的有界重复'
  }
  if (/(?:\.\*|\.\+)(?:[^()|]{0,40})(?:\.\*|\.\+)/.test(pattern)) {
    return '不允许连续无限通配量词'
  }
  return undefined
}

function runRegex(
  pattern: string,
  value: string,
  budget: RegexBudget,
): string[] | null {
  const error = regexSafetyError(pattern)
  if (error) throw new Error(`Unsafe regex: ${error}`)
  const timeout = Math.max(
    1,
    Math.min(REGEX_TIMEOUT_MS, Math.floor(budget.remainingMs)),
  )
  const started = Date.now()
  let result: unknown
  try {
    regexContext.pattern = pattern
    regexContext.value = value.slice(0, MAX_REGEX_INPUT)
    result = regexScript.runInContext(regexContext, { timeout })
  } catch {
    throw new Error('正则执行超时或过于复杂')
  }
  budget.remainingMs -= Date.now() - started
  if (budget.remainingMs <= 0) {
    throw new Error('正则执行超过页面预算')
  }
  return result as string[] | null
}

type HtmlRow = {
  textContent?: string | null
  getAttribute(name: string): string | null
  querySelector(selector: string): HtmlRow | null
}

function segments(path: string): Array<string | number> {
  const normalized = path.replace(/^\$?\.?/, '')
  if (!normalized) return []
  const result: Array<string | number> = []
  for (const part of normalized.split('.')) {
    const match = /^([^[\]]*)((?:\[\d+\])*)$/.exec(part)
    if (!match) {
      result.push(part)
      continue
    }
    if (match[1]) result.push(match[1])
    for (const index of match[2]?.matchAll(/\[(\d+)\]/g) ?? []) {
      result.push(Number(index[1]))
    }
  }
  return result
}

export function readJsonPath(value: unknown, path: string): unknown {
  let current = value
  for (const segment of segments(path)) {
    if (typeof segment === 'number') {
      if (!Array.isArray(current)) return undefined
      current = current[segment]
      continue
    }
    if (current === null || typeof current !== 'object') return undefined
    current = (current as Record<string, unknown>)[segment]
  }
  return current
}

function applyRegex(
  value: string,
  extractor: ManifestExtractor,
  budget: RegexBudget,
): string | undefined {
  if (!extractor.regex) return value
  const match = runRegex(extractor.regex, value, budget)
  if (!match) return undefined
  return match[extractor.group ?? 1] ?? ''
}

function extractHtmlField(
  row: HtmlRow,
  extractor: ManifestExtractor,
  budget: RegexBudget,
): string | undefined {
  if (!extractor.selector) return undefined
  const element = row.querySelector(extractor.selector)
  if (!element) return undefined
  const raw = extractor.attribute
    ? (element.getAttribute(extractor.attribute) ?? '')
    : (element.textContent ?? '')
  const matched = applyRegex(raw, extractor, budget)
  if (matched === undefined) return undefined
  return extractor.trim === false ? matched : matched.trim()
}

function extractJsonField(
  row: unknown,
  extractor: ManifestExtractor,
  budget: RegexBudget,
): unknown {
  if (!extractor.path) return undefined
  const value = readJsonPath(row, extractor.path)
  if (typeof value !== 'string') return value
  const matched = applyRegex(value, extractor, budget)
  if (matched === undefined) return undefined
  return extractor.trim === false ? matched : matched.trim()
}

function scalarText(value: unknown): string | undefined {
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return undefined
}

function renderFieldTemplate(
  template: string,
  record: Record<string, unknown>,
): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g, (_, path: string) => {
    return scalarText(readJsonPath(record, path)) ?? ''
  })
}

function extractRecord(
  row: unknown,
  request: ManifestRequest,
  html: boolean,
  budget: RegexBudget,
): Record<string, unknown> {
  const record: Record<string, unknown> = {}
  const entries = Object.entries(request.fields)
  for (const [name, extractor] of entries) {
    if (extractor.constant !== undefined) record[name] = extractor.constant
  }
  for (const [name, extractor] of entries) {
    if (extractor.constant !== undefined || extractor.template !== undefined) continue
    const value = html
      ? extractHtmlField(row as HtmlRow, extractor, budget)
      : extractJsonField(row, extractor, budget)
    if (value !== undefined) record[name] = value
  }
  for (const [name, extractor] of entries) {
    if (!extractor.template) continue
    const raw = renderFieldTemplate(extractor.template, record)
    const value = extractor.trim === false ? raw : raw.trim()
    if (value) record[name] = value
  }
  return record
}

export function extractPage(
  payload: string,
  request: ManifestRequest,
): ExtractedPage {
  const budget: RegexBudget = { remainingMs: REGEX_BUDGET_MS }
  if (request.responseType === 'json') {
    let parsed: unknown
    try {
      parsed = JSON.parse(payload)
    } catch {
      throw new Error('Response is not valid JSON')
    }
    const rawRows = readJsonPath(parsed, request.items)
    const allRows = Array.isArray(rawRows)
      ? rawRows
      : rawRows !== undefined && rawRows !== null
        ? [rawRows]
        : []
    const rows = allRows.slice(0, MAX_ROWS_PER_PAGE)
    const result: ExtractedPage = {
      rows: rows.map((row) => extractRecord(row, request, false, budget)),
      ...(allRows.length > rows.length ? { truncated: true } : {}),
    }
    if (request.next) {
      const next = readJsonPath(parsed, request.next)
      if (typeof next === 'string' && next.trim()) result.next = next.trim()
    }
    return result
  }

  const { document } = parseHTML(payload)
  const allRows = Array.from(
    document.querySelectorAll(request.items),
  ) as unknown as HtmlRow[]
  const rows = allRows.slice(0, MAX_ROWS_PER_PAGE)
  const result: ExtractedPage = {
    rows: rows.map((row) => extractRecord(row, request, true, budget)),
    ...(allRows.length > rows.length ? { truncated: true } : {}),
  }
  if (request.next) {
    const next = document.querySelector(request.next) as HtmlRow | null
    const href = next?.getAttribute('href')
    if (href) result.next = href
  }
  return result
}
