import type {
  AdapterSample,
  CaptureCollection,
  CaptureEndpoint,
  CaptureEndpointKind,
  CaptureField,
  CaptureNextStep,
  SourceCaptureSummary,
} from '@academic/contracts'

export interface CapturedSampleInput {
  sampleId: string
  sample: AdapterSample
  status: number
  headerNames: string[]
  requestContentType?: string
}

export interface BuildCaptureSummaryInput {
  sourceId: string
  captureId: string
  startedAt: string
  finishedAt: string
  hosts: string[]
  visited: number
  samples: CapturedSampleInput[]
  warnings?: string[]
  skipped?: {
    noise: number
    nonText: number
    tooLarge: number
    limit: number
    failed: number
  }
}

const SENSITIVE_PARAM =
  /token|sign|signature|auth|key|secret|session|ticket|password|passwd/i
const COURSE_KEY = /course|class|subject|课程|班级|教学班/i
const ASSIGNMENT_KEY =
  /homework|assignment|exam|quiz|task|paper|作业|考试|测验|ddl|due|deadline|endtime/i
const LIST_PATH = /list|query|search|feed|index|course|assign|home/i
const NOISE_PATH = /login|logout|signout|notice|message|unread|avatar|userinfo|config|dict|favicon/i
const FILTER_PATH = /filter|nav|menu|option|dict|tag|banner|carousel|breadcrumb/i
const PAGINATION_PARAM = /^(?:page|p|pn|pageNo|pageNum|pageIndex|pageSize|offset|start|startIndex|limit|size)$/i

const MAX_FIELDS = 40
const MAX_COLLECTIONS = 8
const COLLECTION_SCAN_DEPTH = 5
const MAX_EXAMPLE = 60
const MAX_ENDPOINTS = 40

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max)}…` : value
}

export function maskedUrl(raw: string): string {
  try {
    const url = new URL(raw)
    const entries = [...url.searchParams.entries()]
    if (entries.length === 0) return truncate(url.toString(), 500)
    const search = new URLSearchParams()
    for (const [key, value] of entries) {
      search.append(key, SENSITIVE_PARAM.test(key) ? '***' : value)
    }
    url.search = search.toString()
    return truncate(url.toString(), 500)
  } catch {
    return truncate(raw, 500)
  }
}

function hasMaskedParam(raw: string): boolean {
  try {
    const url = new URL(raw)
    return [...url.searchParams.keys()].some((key) => SENSITIVE_PARAM.test(key))
  } catch {
    return false
  }
}

function valueType(value: unknown): string {
  if (value === null) return 'null'
  if (Array.isArray(value)) return `array(${value.length})`
  if (typeof value === 'object') return 'object'
  return typeof value
}

function exampleOf(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined
  if (typeof value === 'string') return value ? truncate(value, MAX_EXAMPLE) : undefined
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return undefined
}

function fieldsOf(
  item: unknown,
  prefix = '',
  depth = 0,
  out: CaptureField[] = [],
): CaptureField[] {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return out
  for (const [key, value] of Object.entries(item as Record<string, unknown>)) {
    if (out.length >= MAX_FIELDS) break
    const path = prefix ? `${prefix}.${key}` : key
    const example = exampleOf(value)
    out.push({
      key,
      path,
      type: valueType(value),
      ...(example ? { example } : {}),
    })
    // One nested level is enough to name fields like details.due without
    // flooding the inventory with deep object trees.
    if (value && typeof value === 'object' && !Array.isArray(value) && depth < 1) {
      fieldsOf(value, path, depth + 1, out)
    }
  }
  return out
}

interface ArrayNode {
  path: string
  items: unknown[]
}

function collectArrayNodes(
  value: unknown,
  path = '',
  depth = 0,
  out: ArrayNode[] = [],
): ArrayNode[] {
  if (depth > COLLECTION_SCAN_DEPTH || out.length >= 24) return out
  if (Array.isArray(value)) {
    out.push({ path, items: value })
    return out
  }
  if (!value || typeof value !== 'object') return out
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (out.length >= 24) break
    collectArrayNodes(entry, path ? `${path}.${key}` : key, depth + 1, out)
  }
  return out
}

function collectionScore(
  path: string,
  items: unknown[],
  fields: CaptureField[],
): number {
  let score = 0
  if (items.length >= 1) score += 5
  if (items.length >= 3) score += 10
  if (items.length >= 8) score += 5
  if (items.length >= 20) score += 5
  if (fields.some((field) => COURSE_KEY.test(field.path ?? field.key))) score += 20
  if (fields.some((field) => ASSIGNMENT_KEY.test(field.path ?? field.key))) {
    score += 20
  }
  if (LIST_PATH.test(path)) score += 10
  if (NOISE_PATH.test(path)) score -= 15
  if (FILTER_PATH.test(path)) score -= 20
  return Math.max(0, Math.min(100, score))
}

const LIST_PATH_HINT = /list|record|item|course|assign|homework|exam|task|home|query/i
const REFERENCE_PATH =
  /school|dict|dictionary|area|region|province|city|college|organization|dept/i
const REFERENCE_FIELD =
  /schoolid|schoolname|loginurl|province|city|region|district|areacode|postal|collegeid/i

function isReferenceCollection(path: string, fields: CaptureField[]): boolean {
  if (COURSE_KEY.test(path) || ASSIGNMENT_KEY.test(path)) return false
  if (fields.some((field) => COURSE_KEY.test(field.path ?? field.key))) return false
  if (fields.some((field) => ASSIGNMENT_KEY.test(field.path ?? field.key))) return false
  return (
    REFERENCE_PATH.test(path) ||
    fields.some((field) => REFERENCE_FIELD.test(field.path ?? field.key))
  )
}

/**
 * Keeps empty arrays too: an empty course list still names the real endpoint,
 * and the agent needs that to ask for a re-record instead of guessing.
 */
function collectCollections(value: unknown): CaptureCollection[] {
  return collectArrayNodes(value)
    .filter(
      (node) =>
        node.items.length > 0 ||
        LIST_PATH_HINT.test(node.path) ||
        node.path.startsWith('data.'),
    )
    .map((node) => {
      const fields = fieldsOf(node.items[0])
      const reference = isReferenceCollection(node.path, fields)
      const base = collectionScore(node.path, node.items, fields)
      return {
        path: node.path || '$',
        itemCount: node.items.length,
        score: Math.max(0, base - (reference ? 40 : 0)),
        fields,
        ...(node.items.length === 0 ? { empty: true } : {}),
        ...(reference ? { reference: true } : {}),
      }
    })
    .sort((left, right) => right.score - left.score || right.itemCount - left.itemCount)
    .slice(0, MAX_COLLECTIONS)
}

function htmlFields(body: string): CaptureField[] {
  const fields: CaptureField[] = []
  for (const match of body.matchAll(/<th\b[^>]*>([\s\S]*?)<\/th>/gi)) {
    const text = (match[1] ?? '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim()
    if (!text || fields.some((field) => field.key === text)) continue
    fields.push({ key: text, type: 'string' })
    if (fields.length >= 12) break
  }
  return fields
}

interface JsonShape {
  root: 'array' | 'object' | 'other'
  itemCount?: number
  collectionPath?: string
  fields: CaptureField[]
  collections: CaptureCollection[]
}

function jsonShape(body: string): JsonShape {
  let parsed: unknown
  try {
    parsed = JSON.parse(body)
  } catch {
    return { root: 'other', fields: [], collections: [] }
  }
  if (Array.isArray(parsed)) {
    const collections = collectCollections(parsed)
    return {
      root: 'array',
      itemCount: parsed.length,
      collectionPath: '$',
      fields: collections[0]?.fields ?? fieldsOf(parsed[0]),
      collections,
    }
  }
  if (parsed && typeof parsed === 'object') {
    const collections = collectCollections(parsed)
    const best = collections[0]
    return {
      root: 'object',
      fields: best?.fields ?? fieldsOf(parsed),
      ...(best
        ? { itemCount: best.itemCount, collectionPath: best.path }
        : {}),
      collections,
    }
  }
  return { root: 'other', fields: [], collections: [] }
}

function kindOf(
  path: string,
  isHtml: boolean,
  shape: JsonShape,
): CaptureEndpointKind {
  if (isHtml) return 'document'
  const best = shape.collections[0]
  if (!best) {
    if (shape.root !== 'object') return 'other'
    return NOISE_PATH.test(path) ? 'other' : 'detail'
  }
  const hasListKeys = best.fields.some(
    (field) =>
      COURSE_KEY.test(field.path ?? field.key) ||
      ASSIGNMENT_KEY.test(field.path ?? field.key),
  )
  if (
    best.itemCount >= 2 ||
    hasListKeys ||
    (best.empty === true && LIST_PATH_HINT.test(path))
  ) {
    return 'list'
  }
  if (NOISE_PATH.test(path)) return 'other'
  return 'detail'
}

function scoreOf(kind: CaptureEndpointKind, shape: JsonShape): number {
  if (kind === 'document') return Math.min(shape.collections[0]?.score ?? 0, 20)
  if (kind === 'detail') return Math.max(10, shape.collections[0]?.score ?? 0)
  if (kind === 'other') return 0
  return shape.collections[0]?.score ?? 0
}

function maskedBodyPreview(
  body: string,
  contentType: string | undefined,
  transport: CaptureEndpoint['transport'],
): string {
  const isForm =
    transport === 'form' || /x-www-form-urlencoded/i.test(contentType ?? '')
  if (isForm) {
    try {
      const params = new URLSearchParams(body)
      const masked = new URLSearchParams()
      for (const [key, value] of params) {
        masked.append(key, SENSITIVE_PARAM.test(key) ? '***' : value)
      }
      return truncate(masked.toString(), 500)
    } catch {
      return truncate(body, 500)
    }
  }
  try {
    const parsed = JSON.parse(body) as unknown
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const masked: Record<string, unknown> = {}
      for (const [key, value] of Object.entries(parsed)) {
        masked[key] = SENSITIVE_PARAM.test(key) ? '***' : value
      }
      return truncate(JSON.stringify(masked), 500)
    }
  } catch {
    // Not JSON; fall back to a truncated raw preview.
  }
  return truncate(body, 500)
}

function transportOf(
  method: 'GET' | 'POST',
  requestContentType: string | undefined,
): CaptureEndpoint['transport'] {
  if (method !== 'POST') return undefined
  const type = requestContentType?.toLowerCase() ?? ''
  if (type.includes('json')) return 'json'
  if (type.includes('x-www-form-urlencoded')) return 'form'
  return 'other'
}

function sensitiveBodyKeys(requestBody?: string): string[] {
  if (!requestBody) return []
  const keys = new Set<string>()
  try {
    const parsed = JSON.parse(requestBody) as unknown
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      for (const key of Object.keys(parsed as Record<string, unknown>)) {
        if (SENSITIVE_PARAM.test(key)) keys.add(key)
      }
      return [...keys]
    }
  } catch {
    // Not JSON; try form encoding below.
  }
  try {
    for (const key of new URLSearchParams(requestBody).keys()) {
      if (SENSITIVE_PARAM.test(key)) keys.add(key)
    }
  } catch {
    // Unparseable body; nothing else to flag.
  }
  return [...keys]
}

function bodyKeys(requestBody?: string): string[] {
  if (!requestBody) return []
  try {
    const parsed = JSON.parse(requestBody) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return []
    return Object.keys(parsed as Record<string, unknown>).slice(0, 20)
  } catch {
    return []
  }
}

function bodyValue(requestBody: string | undefined, key: string): string | undefined {
  if (!requestBody) return undefined
  try {
    const parsed = JSON.parse(requestBody) as Record<string, unknown>
    const value = parsed?.[key]
    return typeof value === 'string' || typeof value === 'number'
      ? String(value)
      : undefined
  } catch {
    return undefined
  }
}

function headerHints(names: string[]): string[] {
  const wanted = /^(?:accept|x-requested-with|referer|origin|content-type|x-[\w-]+)$/i
  return [...new Set(names.filter((name) => wanted.test(name)))]
    .map((name) => name.toLowerCase())
    .slice(0, 6)
}

interface PaginationCandidate {
  key: string
  param: string
  values: string[]
}

function paginationFor(raw: CapturedSampleInput[]): PaginationCandidate | undefined {
  const byKey = new Map<string, CapturedSampleInput[]>()
  for (const item of raw) {
    let url: URL
    try {
      url = new URL(item.sample.url)
    } catch {
      continue
    }
    const key = `${item.sample.method ?? 'GET'} ${url.hostname}${url.pathname}`
    const list = byKey.get(key) ?? []
    list.push(item)
    byKey.set(key, list)
  }
  for (const [key, group] of byKey) {
    if (group.length < 2) continue
    let first: URL
    try {
      first = new URL(group[0]!.sample.url)
    } catch {
      continue
    }
    for (const param of first.searchParams.keys()) {
      const values = new Set<string>()
      for (const item of group) {
        values.add(new URL(item.sample.url).searchParams.get(param) ?? '')
      }
      if (values.size >= 2 && PAGINATION_PARAM.test(param)) {
        return { key, param, values: [...values].slice(0, 4) }
      }
    }
    for (const key2 of bodyKeys(group[0]!.sample.requestBody)) {
      const values = new Set<string>()
      for (const item of group) {
        const value = bodyValue(item.sample.requestBody, key2)
        if (value !== undefined) values.add(value)
      }
      if (values.size >= 2 && PAGINATION_PARAM.test(key2)) {
        return { key, param: key2, values: [...values].slice(0, 4) }
      }
    }
  }
  return undefined
}

function isTargetList(endpoint: CaptureEndpoint): boolean {
  const collection = endpoint.collections?.[0]
  if (!collection || collection.reference === true) return false
  if (
    collection.fields.some(
      (field) =>
        COURSE_KEY.test(field.path ?? field.key) ||
        ASSIGNMENT_KEY.test(field.path ?? field.key),
    )
  ) {
    return true
  }
  return (
    collection.empty === true &&
    /course|assign|homework|exam|task/i.test(endpoint.path)
  )
}

function nextStepFor(
  endpoints: CaptureEndpoint[],
  masked: string[],
  maskedBodies: string[],
): CaptureNextStep {
  const target = endpoints.find(isTargetList)
  if (!target) {
    const document = endpoints.find((endpoint) => endpoint.kind === 'document')
    if (document) {
      return {
        action: 'validate',
        label: '用页面样本验证 HTML 提取',
        reason: '没有课程/作业 JSON 列表，只能按页面结构提取',
      }
    }
    return {
      action: 'recapture',
      label: '重新录制：登录后打开课程/作业列表并翻页',
      reason:
        '录制里只有参考数据或其他接口，没有课程/作业列表；请确认账号身份并在列表渲染后结束录制',
    }
  }
  if (target.transport === 'other') {
    return {
      action: 'unsupported-transport',
      label: '该请求的编码方式暂不支持，请停止生成候选',
      reason: '只有 JSON 与扁平表单编码的只读 POST 可回放',
    }
  }
  if (masked.includes(target.path) || maskedBodies.includes(target.path)) {
    return {
      action: 'needs-confirmation',
      label: '接口含鉴权参数，需用户确认绑定方式',
      reason: maskedBodies.includes(target.path)
        ? '请求体含动态签名/令牌（如 secretStr），静态模板无法回放'
        : '离线回放可能无法精确匹配脱敏后的参数',
    }
  }
  if (target.transport === 'form') {
    return {
      action: 'validate',
      label: '用 sampleIds 离线验证 Manifest',
      reason: `表单请求需在 Manifest 声明 bodyFormat: "form"；items 路径：${target.response.collectionPath}`,
    }
  }
  if ((target.response.itemCount ?? 0) === 0) {
    return {
      action: 'recapture',
      label: '列表接口返回 0 条，请重新录制或确认账号',
      reason: '可能是账号身份不匹配、会话未生效或列表尚未渲染完成',
    }
  }
  if (!target.response.collectionPath) {
    return {
      action: 'needs-confirmation',
      label: '未识别出列表集合，请确认目标接口',
      reason: '响应里没有可用的对象数组',
    }
  }
  return {
    action: 'validate',
    label: '用 sampleIds 离线验证 Manifest',
    reason: `首选接口 items 路径：${target.response.collectionPath}`,
  }
}

function pathPrefixes(endpoints: CaptureEndpoint[]): string[] {
  const prefixes: string[] = []
  for (const endpoint of endpoints) {
    if (endpoint.kind !== 'list' && endpoint.kind !== 'detail') continue
    const segments = endpoint.path.split('/').filter(Boolean)
    if (segments.length === 0) continue
    const prefix = `/${segments[0]}`
    if (!prefixes.includes(prefix)) prefixes.push(prefix)
    if (prefixes.length >= 5) break
  }
  return prefixes.length > 0 ? prefixes : ['/']
}

/**
 * Turns observed traffic into a compact inventory the agent can plan from.
 * Raw bodies stay behind sample ids; only shapes, keys and masked URLs escape.
 */
export function buildCaptureSummary(
  input: BuildCaptureSummaryInput,
): SourceCaptureSummary {
  const warnings = [...(input.warnings ?? [])]
  const endpoints: CaptureEndpoint[] = []
  const masked: string[] = []
  const maskedBodies: string[] = []

  // Rank every observed response before applying the cap: login-time noise must
  // never push the business list out of the inventory.
  for (const item of input.samples) {
    const rawUrl = item.sample.url
    let parsed: URL
    try {
      parsed = new URL(rawUrl)
    } catch {
      continue
    }
    if (NOISE_PATH.test(parsed.pathname) && !/course|assign|home/i.test(parsed.pathname)) {
      continue
    }
    const contentType = item.sample.contentType?.toLowerCase() ?? ''
    const isHtml = contentType.includes('html')
    const shape: JsonShape = isHtml
      ? {
          root: 'other',
          fields: htmlFields(item.sample.body),
          collections: [],
        }
      : jsonShape(item.sample.body)
    const kind = kindOf(parsed.pathname, isHtml, shape)
    const method = item.sample.method ?? 'GET'
    const transport = transportOf(method, item.requestContentType)
    const bodyPreview = item.sample.requestBody
      ? maskedBodyPreview(item.sample.requestBody, item.requestContentType, transport)
      : undefined
    const endpoint: CaptureEndpoint = {
      sampleId: item.sampleId,
      host: parsed.hostname,
      path: parsed.pathname,
      url: maskedUrl(rawUrl),
      method,
      status: item.status,
      ...(item.sample.contentType ? { contentType: item.sample.contentType } : {}),
      bytes: Buffer.byteLength(item.sample.body, 'utf8'),
      kind,
      score: scoreOf(kind, shape),
      ...(transport ? { transport } : {}),
      request: {
        queryKeys: [...new Set(parsed.searchParams.keys())].slice(0, 20),
        bodyKeys: bodyKeys(item.sample.requestBody),
        ...(bodyPreview ? { bodyPreview } : {}),
        headerHints: headerHints(item.headerNames),
      },
      response: {
        root: shape.root,
        ...(shape.itemCount !== undefined ? { itemCount: shape.itemCount } : {}),
        ...(shape.collectionPath ? { collectionPath: shape.collectionPath } : {}),
        fields: shape.fields,
      },
      ...(shape.collections.length > 0 ? { collections: shape.collections } : {}),
    }
    if (hasMaskedParam(rawUrl)) masked.push(endpoint.path)
    if (sensitiveBodyKeys(item.sample.requestBody).length > 0) {
      maskedBodies.push(endpoint.path)
    }
    endpoints.push(endpoint)
  }

  endpoints.sort(
    (left, right) => right.score - left.score || left.path.localeCompare(right.path),
  )
  const kept = endpoints.slice(0, MAX_ENDPOINTS)
  if (endpoints.length > kept.length) {
    warnings.push(`接口较多，仅保留评分最高的 ${MAX_ENDPOINTS} 个`)
  }
  const unsupported = kept
    .filter((endpoint) => endpoint.transport === 'form')
    .map((endpoint) => endpoint.path)
  if (unsupported.length > 0) {
    warnings.push(
      `表单编码请求：${[...new Set(unsupported)].join(', ')}；Manifest 需声明 bodyFormat: "form"（仅扁平字段）`,
    )
  }
  if (input.skipped) {
    const parts: string[] = []
    if (input.skipped.noise > 0) parts.push(`静态/登出 ${input.skipped.noise}`)
    if (input.skipped.nonText > 0) parts.push(`非 JSON/HTML ${input.skipped.nonText}`)
    if (input.skipped.tooLarge > 0) parts.push(`超过大小上限 ${input.skipped.tooLarge}`)
    if (input.skipped.limit > 0) parts.push(`达到数量上限 ${input.skipped.limit}`)
    if (input.skipped.failed > 0) parts.push(`读取失败 ${input.skipped.failed}`)
    if (parts.length > 0) {
      warnings.push(`录制时过滤了部分响应（${parts.join('、')}），必要时重新打开目标列表补录`)
    }
  }

  const pagination = paginationFor(input.samples)
  if (pagination) {
    const target = kept.find(
      (endpoint) =>
        `${endpoint.method} ${endpoint.host}${endpoint.path}` === pagination.key,
    )
    if (target) {
      target.pagination = { param: pagination.param, values: pagination.values }
    }
  }

  if (masked.length > 0) {
    warnings.push(
      `部分接口含疑似鉴权参数（已屏蔽）：${[...new Set(masked)].join(', ')}；离线回放可能无法精确匹配，需模板化或重新探测`,
    )
  }
  if (maskedBodies.length > 0) {
    warnings.push(
      `请求体含动态签名/令牌（已屏蔽）：${[...new Set(maskedBodies)].join(', ')}；静态 Manifest 无法回放`,
    )
  }
  if (kept.length === 0) {
    warnings.push('没有捕获到可用的数据接口；请登录后打开课程/作业列表并翻一页再结束录制')
  }
  const hosts = [
    ...new Set([...input.hosts, ...kept.map((endpoint) => endpoint.host)]),
  ]

  return {
    captureId: input.captureId,
    sourceId: input.sourceId,
    startedAt: input.startedAt,
    finishedAt: input.finishedAt,
    hosts,
    visited: input.visited,
    endpoints: kept,
    nextStep: nextStepFor(kept, masked, maskedBodies),
    suggested: {
      cookieDomains: hosts,
      pathPrefixes: pathPrefixes(kept),
    },
    warnings,
  }
}
