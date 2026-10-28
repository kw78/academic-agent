import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import type { DatabaseSync } from 'node:sqlite'
import type {
  Clock,
  IdGenerator,
  MaterialAttachmentImportInput,
  MaterialAttachmentImportResult,
  MaterialChunkHit,
  MaterialImportBytesInput,
  MaterialImportFileInput,
  MaterialImportResult,
  MaterialImportTextInput,
  MaterialImportUrlInput,
  MaterialKind,
  MaterialListParams,
  MaterialRebuildResult,
  MaterialSearchParams,
  MaterialSearchResult,
  MaterialSourceKind,
  MaterialSubscriptionView,
  MaterialToolPort,
  MaterialView,
} from '@academic/contracts'
import { buildChunks } from './chunk.js'
import { extractDocument, decodeHtmlEntities, decodeTextBytes, htmlTitle } from './text.js'
import {
  MATERIAL_ATTACHMENT_EXTENSIONS,
  extensionForKind,
  kindFromContentType,
  kindFromFileName,
  mimeForKind,
  safeSourceUrl,
} from './media.js'

export type MaterialErrorCode =
  | 'VALIDATION'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'AUTH_REQUIRED'
  | 'RATE_LIMITED'
  | 'NETWORK'
  | 'UNSUPPORTED'
  | 'SUBSCRIPTION_REQUIRED'
  | 'CAPABILITY_UNAVAILABLE'

export class MaterialError extends Error {
  readonly code: MaterialErrorCode

  constructor(code: MaterialErrorCode, message: string) {
    super(message)
    this.name = 'MaterialError'
    this.code = code
  }
}

export interface MaterialFetchedResource {
  status: number
  finalUrl: string
  contentType?: string
  body: Uint8Array
  truncated: boolean
}

export interface MaterialFetchOptions {
  binary: boolean
  maxBytes?: number
  sourceId?: string
  sessionId?: string
}

export type MaterialFetcher = (
  url: string,
  options: MaterialFetchOptions,
) => Promise<MaterialFetchedResource>

export interface MaterialLibraryOptions {
  db: DatabaseSync
  clock: Clock
  ids: IdGenerator
  rootDir: string
  fetchResource?: MaterialFetcher
  validateCourse?: (courseId: string) => Promise<boolean>
  validateItem?: (itemId: string, courseId: string) => Promise<boolean>
  maxFileBytes?: number
}

export const MATERIAL_LIMITS = {
  maxFileBytes: 80 * 1024 * 1024,
  maxPageBytes: 4 * 1024 * 1024,
  maxAttachmentFiles: 12,
  maxAttachmentCandidates: 40,
  maxDiscoveredLinks: 400,
  attachmentDeadlineMs: 120_000,
  maxTitleChars: 300,
  maxChunksPerMaterial: 4000,
} as const

interface MaterialRow {
  material_id: string
  course_id: string
  item_id: string | null
  title: string
  kind: string
  source_kind: string
  source_url: string | null
  origin_label: string | null
  file_path: string
  sha256: string
  bytes: number
  mime: string
  page_count: number | null
  extraction_status: string
  extraction_note: string | null
  chunk_count: number
  created_at: string
  updated_at: string
}

interface ChunkRow {
  rowid: number
  chunk_id: string
  material_id: string
  ordinal: number
  page: number | null
  heading: string | null
  text: string
}

interface SubscriptionRow {
  source_id: string
  course_id: string
  enabled: number
  created_at: string
  updated_at: string
}

interface ExtractionResult {
  chunks: Array<{ text: string; page?: number; heading?: string }>
  status: 'indexed' | 'empty' | 'failed'
  note?: string
  pageCount?: number
}

function transaction<T>(db: DatabaseSync, operation: () => T): T {
  db.exec('BEGIN IMMEDIATE')
  try {
    const result = operation()
    db.exec('COMMIT')
    return result
  } catch (error) {
    try {
      db.exec('ROLLBACK')
    } catch {
      // Preserve the original failure.
    }
    throw error
  }
}

function clampText(value: string | undefined, max: number): string | undefined {
  if (value === undefined) return undefined
  const trimmed = value.replace(/\s+/g, ' ').trim()
  return trimmed ? trimmed.slice(0, max) : undefined
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`)
}

function codepointLength(value: string): number {
  return [...value].length
}

function snippetAround(text: string, terms: string[]): string {
  const lower = text.toLowerCase()
  let index = -1
  let matched = ''
  for (const term of terms) {
    const found = lower.indexOf(term.toLowerCase())
    if (found >= 0 && (index < 0 || found < index)) {
      index = found
      matched = term
    }
  }
  if (index < 0) return text.slice(0, 180)
  const start = Math.max(0, index - 60)
  const end = Math.min(text.length, index + matched.length + 120)
  let snippet = text.slice(start, end)
  if (matchIndex(snippet.toLowerCase(), matched.toLowerCase()) >= 0) {
    const offset = matchIndex(snippet.toLowerCase(), matched.toLowerCase())
    snippet =
      snippet.slice(0, offset) +
      '[' +
      snippet.slice(offset, offset + matched.length) +
      ']' +
      snippet.slice(offset + matched.length)
  }
  return `${start > 0 ? '…' : ''}${snippet}${end < text.length ? '…' : ''}`
}

function matchIndex(haystack: string, needle: string): number {
  return needle ? haystack.indexOf(needle) : -1
}

function loginLike(url: string, html: string): boolean {
  if (/\/login|\/signin|\/sign-in|\/cas\/login|\/sso\//i.test(url)) return true
  const title = htmlTitle(html.slice(0, 100_000)) ?? ''
  if (/登录|sign in|log in|统一身份/i.test(title)) return true
  return /name=["'](?:username|password|login)["']/i.test(html.slice(0, 50_000))
}

function anchorLinks(html: string): Array<{ href: string; text: string }> {
  const links: Array<{ href: string; text: string }> = []
  for (const match of html.matchAll(
    /<a\b[^>]*\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))[^>]*>([\s\S]*?)<\/a>/gi,
  )) {
    const href = match[1] ?? match[2] ?? match[3] ?? ''
    if (!href) continue
    const text = decodeHtmlEntities((match[4] ?? '').replace(/<[^>]*>/g, ' '))
      .replace(/\s+/g, ' ')
      .trim()
    links.push({ href, text })
  }
  return links
}

function fileNameFromUrl(url: URL): string {
  const last = url.pathname.split('/').filter(Boolean).at(-1) ?? 'material'
  try {
    return decodeURIComponent(last)
  } catch {
    return last
  }
}

function safeTitle(value: string, fallback: string): string {
  return clampText(value, MATERIAL_LIMITS.maxTitleChars) ?? fallback
}

export class MaterialLibrary implements MaterialToolPort {
  readonly #db: DatabaseSync
  readonly #clock: Clock
  readonly #ids: IdGenerator
  readonly #rootDir: string
  readonly #fetchResource: MaterialFetcher | undefined
  readonly #validateCourse: ((courseId: string) => Promise<boolean>) | undefined
  readonly #validateItem:
    | ((itemId: string, courseId: string) => Promise<boolean>)
    | undefined
  readonly #maxFileBytes: number

  constructor(options: MaterialLibraryOptions) {
    this.#db = options.db
    this.#clock = options.clock
    this.#ids = options.ids
    this.#rootDir = options.rootDir
    this.#fetchResource = options.fetchResource
    this.#validateCourse = options.validateCourse
    this.#validateItem = options.validateItem
    this.#maxFileBytes = options.maxFileBytes ?? MATERIAL_LIMITS.maxFileBytes
    mkdirSync(this.#rootDir, { recursive: true })
  }

  get rootDir(): string {
    return this.#rootDir
  }

  list(params: MaterialListParams = {}): MaterialView[] {
    const limit = Math.min(Math.max(params.limit ?? 200, 1), 500)
    const clauses: string[] = []
    const values: string[] = []
    if (params.courseId) {
      clauses.push('course_id = ?')
      values.push(params.courseId)
    }
    if (params.itemId) {
      clauses.push('item_id = ?')
      values.push(params.itemId)
    }
    const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : ''
    const rows = this.#db
      .prepare(
        `SELECT * FROM materials ${where} ORDER BY created_at DESC, rowid DESC LIMIT ?`,
      )
      .all(...values, limit) as unknown as MaterialRow[]
    return rows.map((row) => this.#toView(row))
  }

  get(materialId: string): MaterialView | undefined {
    const row = this.#db
      .prepare('SELECT * FROM materials WHERE material_id = ?')
      .get(materialId) as unknown as MaterialRow | undefined
    return row ? this.#toView(row) : undefined
  }

  async importText(input: MaterialImportTextInput): Promise<MaterialImportResult> {
    const title = clampText(input.title, MATERIAL_LIMITS.maxTitleChars)
    if (!title) throw new MaterialError('VALIDATION', '资料标题不能为空')
    if (!input.text.trim()) {
      throw new MaterialError('VALIDATION', '资料正文不能为空')
    }
    return this.importBytes({
      courseId: input.courseId,
      ...(input.itemId ? { itemId: input.itemId } : {}),
      fileName: `${title.replace(/[\\/:*?"<>|\s]+/g, '-').slice(0, 80) || 'pasted'}.txt`,
      bytes: Buffer.from(input.text, 'utf8'),
      title,
      sourceKind: 'text',
      ...(input.sourceUrl ? { sourceUrl: input.sourceUrl } : {}),
      ...(input.originLabel ? { originLabel: input.originLabel } : {}),
    })
  }

  async importFile(input: MaterialImportFileInput): Promise<MaterialImportResult> {
    let bytes: Buffer
    try {
      bytes = readFileSync(input.filePath)
    } catch {
      throw new MaterialError('NOT_FOUND', `无法读取文件：${input.filePath}`)
    }
    const name = input.filePath.split(/[\\/]/).at(-1) ?? 'material'
    return this.importBytes({
      courseId: input.courseId,
      ...(input.itemId ? { itemId: input.itemId } : {}),
      fileName: name,
      bytes,
      ...(input.title ? { title: input.title } : {}),
      sourceKind: 'file',
      ...(input.originLabel ? { originLabel: input.originLabel } : {}),
    })
  }

  async importUrl(input: MaterialImportUrlInput): Promise<MaterialImportResult> {
    const target = new URL(input.url)
    if (target.protocol !== 'http:' && target.protocol !== 'https:') {
      throw new MaterialError('VALIDATION', '只允许 http(s) 链接')
    }
    const resource = await this.#fetch(input.url, {
      binary: true,
      maxBytes: MATERIAL_LIMITS.maxPageBytes,
      ...(input.sourceId ? { sourceId: input.sourceId } : {}),
      ...(input.sessionId ? { sessionId: input.sessionId } : {}),
    })
    const html = resource.body.byteLength > 0
      ? decodeTextBytes(resource.body)
      : ''
    this.#assertPageStatus(resource, html)
    const fromUrl = kindFromFileName(target.pathname)
    const contentTypeKind = kindFromContentType(resource.contentType)
    const head = html.slice(0, 200).trim().toLowerCase()
    const looksHtml =
      head.startsWith('<!doctype html') ||
      head.startsWith('<html') ||
      /<body[\s>]/.test(head)
    const kind = fromUrl ?? contentTypeKind ?? (looksHtml ? 'html' : undefined)
    if (!kind) {
      throw new MaterialError(
        'UNSUPPORTED',
        '无法从 URL 或 Content-Type 识别资料类型',
      )
    }
    const fileName = fromUrl
      ? fileNameFromUrl(target)
      : `${fileNameFromUrl(target).replace(/\.[^.]*$/, '') || 'page'}${extensionForKind(kind)}`
    const title =
      clampText(input.title, MATERIAL_LIMITS.maxTitleChars) ??
      (kind === 'html' ? clampText(htmlTitle(html), MATERIAL_LIMITS.maxTitleChars) : undefined) ??
      fileNameFromUrl(target)
    return this.importBytes({
      courseId: input.courseId,
      ...(input.itemId ? { itemId: input.itemId } : {}),
      fileName,
      bytes: resource.body,
      title,
      sourceKind: 'url',
      sourceUrl: safeSourceUrl(resource.finalUrl) ?? safeSourceUrl(input.url) ?? input.url,
      ...(input.sourceId ? { originLabel: input.sourceId } : {}),
    })
  }

  async importBytes(input: MaterialImportBytesInput): Promise<MaterialImportResult> {
    await this.#assertCourse(input.courseId)
    if (input.itemId) {
      const valid = await this.#validateItem?.(input.itemId, input.courseId)
      if (valid === false) {
        throw new MaterialError('NOT_FOUND', '关联事项不存在或不属于该课程')
      }
    }
    const kind = kindFromFileName(input.fileName)
    if (!kind) {
      throw new MaterialError(
        'UNSUPPORTED',
        '暂不支持该文件类型；支持 PDF、HTML、Markdown、TXT、PPTX、DOCX',
      )
    }
    const bytes = Buffer.from(input.bytes)
    if (bytes.byteLength === 0) {
      throw new MaterialError('VALIDATION', '资料内容为空')
    }
    if (bytes.byteLength > this.#maxFileBytes) {
      throw new MaterialError(
        'VALIDATION',
        `文件超过上限（${Math.round(this.#maxFileBytes / 1024 / 1024)} MB）`,
      )
    }
    const sha256 = createHash('sha256').update(bytes).digest('hex')
    const existing = this.#byCourseHash(input.courseId, sha256)
    if (existing) {
      return { material: this.#toView(existing), duplicate: true, chunks: existing.chunk_count }
    }

    const fallbackTitle = input.fileName.replace(/\.[^.]+$/, '') || '未命名资料'
    const title = safeTitle(input.title ?? fallbackTitle, fallbackTitle)
    const filePath = this.#writeContentFile(sha256, extensionForKind(kind), bytes)
    const extraction = this.#extract(kind, bytes)
    const chunks = extraction.chunks
    const materialId = this.#ids.next()
    const now = this.#clock.now()
    const pageCount =
      extraction.pageCount ??
      chunks.reduce<number | undefined>(
        (max, chunk) =>
          chunk.page !== undefined ? Math.max(max ?? 0, chunk.page) : max,
        undefined,
      )
    const sourceKind: MaterialSourceKind = input.sourceKind ?? 'file'
    const sourceUrl = input.sourceUrl ? safeSourceUrl(input.sourceUrl) : undefined
    const originLabel = clampText(input.originLabel, 200)

    try {
      transaction(this.#db, () => {
        this.#db
          .prepare(
            `INSERT INTO materials (
               material_id, course_id, item_id, title, kind, source_kind,
               source_url, origin_label, file_path, sha256, bytes, mime,
               page_count, extraction_status, extraction_note, chunk_count,
               created_at, updated_at
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            materialId,
            input.courseId,
            input.itemId ?? null,
            title,
            kind,
            sourceKind,
            sourceUrl ?? null,
            originLabel ?? null,
            filePath,
            sha256,
            bytes.byteLength,
            mimeForKind(kind),
            pageCount ?? null,
            extraction.status,
            extraction.note ?? null,
            chunks.length,
            now,
            now,
          )
        this.#insertChunks(materialId, chunks)
      })
    } catch (error) {
      const duplicate = this.#byCourseHash(input.courseId, sha256)
      if (duplicate) {
        return { material: this.#toView(duplicate), duplicate: true, chunks: duplicate.chunk_count }
      }
      throw error
    }

    return {
      material: this.get(materialId)!,
      duplicate: false,
      chunks: chunks.length,
    }
  }

  async importAttachments(
    input: MaterialAttachmentImportInput,
  ): Promise<MaterialAttachmentImportResult> {
    if (!this.#subscription(input.sourceId, input.courseId)) {
      throw new MaterialError(
        'SUBSCRIPTION_REQUIRED',
        '该来源与课程尚未开启自动导入；请先由用户开启',
      )
    }
    await this.#assertCourse(input.courseId)
    const resource = await this.#fetch(input.pageUrl, {
      binary: true,
      maxBytes: MATERIAL_LIMITS.maxPageBytes,
      sourceId: input.sourceId,
    })
    const html = resource.body.byteLength > 0 ? decodeTextBytes(resource.body) : ''
    this.#assertPageStatus(resource, html)
    const finalPage = new URL(resource.finalUrl)
    const links = anchorLinks(html)
    const candidates: Array<{ url: URL; title: string }> = []
    const seen = new Set<string>()
    let skipped = 0
    for (const link of links.slice(0, MATERIAL_LIMITS.maxDiscoveredLinks)) {
      let candidate: URL
      try {
        candidate = new URL(link.href, finalPage)
      } catch {
        skipped += 1
        continue
      }
      if (candidate.protocol !== 'http:' && candidate.protocol !== 'https:') {
        skipped += 1
        continue
      }
      if (candidate.host.toLowerCase() !== finalPage.host.toLowerCase()) {
        skipped += 1
        continue
      }
      if (input.pathPrefix && !candidate.pathname.startsWith(input.pathPrefix)) {
        skipped += 1
        continue
      }
      candidate.hash = ''
      const extension = /\.([a-zA-Z0-9]+)$/.exec(candidate.pathname)?.[1]?.toLowerCase()
      if (!extension || !MATERIAL_ATTACHMENT_EXTENSIONS.has(extension)) {
        skipped += 1
        continue
      }
      const key = candidate.toString()
      if (seen.has(key)) {
        skipped += 1
        continue
      }
      seen.add(key)
      candidates.push({ url: candidate, title: link.text })
      if (candidates.length >= MATERIAL_LIMITS.maxAttachmentCandidates) break
    }

    const limit = Math.min(
      Math.max(input.maxFiles ?? MATERIAL_LIMITS.maxAttachmentFiles, 1),
      MATERIAL_LIMITS.maxAttachmentCandidates,
    )
    const items: MaterialImportResult[] = []
    const failures: Array<{ url: string; message: string }> = []
    let duplicates = 0
    let stopReason: string | undefined
    const deadline = Date.now() + MATERIAL_LIMITS.attachmentDeadlineMs

    for (const candidate of candidates.slice(0, limit)) {
      if (Date.now() > deadline) {
        stopReason = 'time-limit'
        break
      }
      const display = safeSourceUrl(candidate.url.toString()) ?? candidate.url.toString()
      try {
        const attachment = await this.#fetch(candidate.url.toString(), {
          binary: true,
          maxBytes: this.#maxFileBytes,
          sourceId: input.sourceId,
        })
        if (attachment.status === 401 || attachment.status === 403) {
          stopReason = 'auth-required'
          break
        }
        if (attachment.status === 429) {
          stopReason = 'rate-limited'
          break
        }
        if (attachment.status < 200 || attachment.status >= 300) {
          failures.push({ url: display, message: `HTTP ${attachment.status}` })
          continue
        }
        if (attachment.truncated) {
          failures.push({ url: display, message: '文件超过大小上限，已跳过' })
          continue
        }
        const fromUrl = kindFromFileName(candidate.url.pathname)
        const kind = fromUrl ?? kindFromContentType(attachment.contentType)
        if (!kind) {
          failures.push({ url: display, message: '无法识别附件类型' })
          continue
        }
        const fileName = fromUrl ? fileNameFromUrl(candidate.url) : `${fileNameFromUrl(candidate.url)}${extensionForKind(kind)}`
        const result = await this.importBytes({
          courseId: input.courseId,
          ...(input.itemId ? { itemId: input.itemId } : {}),
          fileName,
          bytes: attachment.body,
          title: candidate.title || fileNameFromUrl(candidate.url),
          sourceKind: 'attachment',
          sourceUrl: safeSourceUrl(attachment.finalUrl) ?? display,
          originLabel: input.sourceId,
        })
        if (result.duplicate) duplicates += 1
        else items.push(result)
      } catch (error) {
        if (error instanceof MaterialError && error.code === 'AUTH_REQUIRED') {
          stopReason = 'auth-required'
          break
        }
        if (error instanceof MaterialError && error.code === 'RATE_LIMITED') {
          stopReason = 'rate-limited'
          break
        }
        failures.push({
          url: display,
          message: error instanceof Error ? error.message : String(error),
        })
      }
    }

    if (!stopReason && candidates.length > limit) {
      stopReason = 'max-files'
    }

    return {
      pageUrl: safeSourceUrl(resource.finalUrl) ?? safeSourceUrl(input.pageUrl) ?? input.pageUrl,
      discovered: candidates.length,
      imported: items.length,
      duplicates,
      skipped,
      failed: failures.length,
      ...(stopReason ? { stopReason } : {}),
      items,
      failures,
    }
  }

  delete(materialId: string): void {
    const material = this.get(materialId)
    if (!material) throw new MaterialError('NOT_FOUND', `资料不存在：${materialId}`)
    const row = this.#db
      .prepare('SELECT file_path FROM materials WHERE material_id = ?')
      .get(materialId) as { file_path: string } | undefined
    transaction(this.#db, () => {
      const chunkRows = this.#db
        .prepare('SELECT rowid FROM material_chunks WHERE material_id = ?')
        .all(materialId) as Array<{ rowid: number }>
      const removeFts = this.#db.prepare('DELETE FROM material_chunks_fts WHERE rowid = ?')
      for (const chunk of chunkRows) removeFts.run(chunk.rowid)
      this.#db.prepare('DELETE FROM materials WHERE material_id = ?').run(materialId)
    })
    if (row?.file_path) {
      const remaining = this.#db
        .prepare('SELECT COUNT(*) AS count FROM materials WHERE file_path = ?')
        .get(row.file_path) as { count: number }
      if (Number(remaining.count) === 0) {
        const absolute = join(this.#rootDir, row.file_path)
        if (existsSync(absolute)) rmSync(absolute, { force: true })
      }
    }
  }

  /** Moves materials and auto-import subscriptions from a duplicate course. */
  mergeCourse(
    fromCourseId: string,
    toCourseId: string,
  ): { movedMaterials: number; removedMaterials: number; movedSubscriptions: number } {
    if (fromCourseId === toCourseId) {
      return { movedMaterials: 0, removedMaterials: 0, movedSubscriptions: 0 }
    }
    const rows = this.#db
      .prepare('SELECT material_id, sha256 FROM materials WHERE course_id = ?')
      .all(fromCourseId) as Array<{ material_id: string; sha256: string }>
    let movedMaterials = 0
    let removedMaterials = 0
    const now = this.#clock.now()
    for (const row of rows) {
      const existing = this.#db
        .prepare('SELECT material_id FROM materials WHERE course_id = ? AND sha256 = ?')
        .get(toCourseId, row.sha256) as { material_id: string } | undefined
      if (existing) {
        // The canonical course already has identical bytes; keep one row.
        this.delete(row.material_id)
        removedMaterials += 1
        continue
      }
      this.#db
        .prepare('UPDATE materials SET course_id = ?, updated_at = ? WHERE material_id = ?')
        .run(toCourseId, now, row.material_id)
      movedMaterials += 1
    }

    const subscriptions = this.#db
      .prepare('SELECT source_id, enabled FROM material_source_subscriptions WHERE course_id = ?')
      .all(fromCourseId) as Array<{ source_id: string; enabled: number }>
    let movedSubscriptions = 0
    for (const subscription of subscriptions) {
      this.#db
        .prepare(
          `INSERT INTO material_source_subscriptions (
             source_id, course_id, enabled, created_at, updated_at
           ) VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(source_id, course_id) DO UPDATE SET
             enabled = MAX(material_source_subscriptions.enabled, excluded.enabled),
             updated_at = excluded.updated_at`,
        )
        .run(subscription.source_id, toCourseId, subscription.enabled, now, now)
      this.#db
        .prepare(
          'DELETE FROM material_source_subscriptions WHERE source_id = ? AND course_id = ?',
        )
        .run(subscription.source_id, fromCourseId)
      movedSubscriptions += 1
    }
    return { movedMaterials, removedMaterials, movedSubscriptions }
  }

  rebuildIndex(): MaterialRebuildResult {
    const rows = this.#db
      .prepare('SELECT * FROM materials ORDER BY created_at ASC, rowid ASC')
      .all() as unknown as MaterialRow[]
    let missingFiles = 0
    const prepared: Array<{
      materialId: string
      status: string
      note: string | null
      pageCount: number | undefined
      chunks: Array<{ text: string; page?: number; heading?: string }>
    }> = []
    for (const row of rows) {
      const absolute = join(this.#rootDir, row.file_path)
      if (!existsSync(absolute)) {
        missingFiles += 1
        const existing = this.#chunksFor(row.material_id)
        prepared.push({
          materialId: row.material_id,
          status: row.extraction_status,
          note: row.extraction_note,
          pageCount: row.page_count ?? undefined,
          chunks: existing.map((chunk) => ({
            text: chunk.text,
            ...(chunk.page !== null ? { page: chunk.page } : {}),
            ...(chunk.heading ? { heading: chunk.heading } : {}),
          })),
        })
        continue
      }
      let extraction: ExtractionResult
      try {
        extraction = this.#extract(row.kind as MaterialKind, readFileSync(absolute))
      } catch (error) {
        extraction = {
          chunks: [],
          status: 'failed',
          note: `重新抽取失败：${error instanceof Error ? error.message : String(error)}`,
        }
      }
      prepared.push({
        materialId: row.material_id,
        status: extraction.status,
        note: extraction.note ?? null,
        pageCount: extraction.pageCount,
        chunks: extraction.chunks,
      })
    }

    let chunkTotal = 0
    transaction(this.#db, () => {
      this.#db.exec('DELETE FROM material_chunks_fts')
      const now = this.#clock.now()
      for (const entry of prepared) {
        this.#db
          .prepare('DELETE FROM material_chunks WHERE material_id = ?')
          .run(entry.materialId)
        this.#insertChunks(entry.materialId, entry.chunks)
        this.#db
          .prepare(
            `UPDATE materials SET
               extraction_status = ?, extraction_note = ?, page_count = ?,
               chunk_count = ?, updated_at = ?
             WHERE material_id = ?`,
          )
          .run(
            entry.status,
            entry.note,
            entry.pageCount ?? null,
            entry.chunks.length,
            now,
            entry.materialId,
          )
        chunkTotal += entry.chunks.length
      }
    })
    return { materials: prepared.length, chunks: chunkTotal, missingFiles }
  }

  search(params: MaterialSearchParams): MaterialSearchResult {
    const query = params.query.trim()
    if (!query) throw new MaterialError('VALIDATION', '检索关键词不能为空')
    if (query.length > 200) {
      throw new MaterialError('VALIDATION', '检索关键词过长')
    }
    const limit = Math.min(Math.max(params.limit ?? 8, 1), 50)
    const terms = query.split(/\s+/).filter(Boolean).slice(0, 8)
    const supportsFts = terms.every((term) => codepointLength(term) >= 3)
    const filters: string[] = []
    const filterValues: string[] = []
    if (params.courseId) {
      filters.push('m.course_id = ?')
      filterValues.push(params.courseId)
    }
    if (params.itemId) {
      filters.push('m.item_id = ?')
      filterValues.push(params.itemId)
    }

    if (supportsFts) {
      const expression = terms.map((term) => `"${term.replace(/"/g, '""')}"`).join(' AND ')
      const where = [`material_chunks_fts MATCH ?`, ...filters].join(' AND ')
      const totalRow = this.#db
        .prepare(
          `SELECT COUNT(*) AS count
           FROM material_chunks_fts
           JOIN material_chunks c ON c.rowid = material_chunks_fts.rowid
           JOIN materials m ON m.material_id = c.material_id
           WHERE ${where}`,
        )
        .get(expression, ...filterValues) as { count: number }
      const rows = this.#db
        .prepare(
          `SELECT m.material_id, m.course_id, m.title, m.kind, c.page, c.heading,
                  snippet(material_chunks_fts, 0, '[', ']', '…', 16) AS snippet,
                  bm25(material_chunks_fts) AS rank
           FROM material_chunks_fts
           JOIN material_chunks c ON c.rowid = material_chunks_fts.rowid
           JOIN materials m ON m.material_id = c.material_id
           WHERE ${where}
           ORDER BY rank ASC, m.created_at DESC
           LIMIT ?`,
        )
        .all(expression, ...filterValues, limit) as unknown as Array<{
        material_id: string
        course_id: string
        title: string
        kind: string
        page: number | null
        heading: string | null
        snippet: string
      }>
      return {
        query,
        total: Number(totalRow.count),
        hits: rows.map((row) => this.#toHit(row)),
      }
    }

    const likeFilters = terms.map(() => '(c.text LIKE ? ESCAPE \'\\\' OR c.heading LIKE ? ESCAPE \'\\\')')
    const where = [...likeFilters, ...filters].join(' AND ')
    const likeValues = terms.flatMap((term) => {
      const pattern = `%${escapeLike(term)}%`
      return [pattern, pattern]
    })
    const totalRow = this.#db
      .prepare(
        `SELECT COUNT(*) AS count
         FROM material_chunks c
         JOIN materials m ON m.material_id = c.material_id
         WHERE ${where}`,
      )
      .get(...likeValues, ...filterValues) as { count: number }
    const rows = this.#db
      .prepare(
        `SELECT m.material_id, m.course_id, m.title, m.kind, c.page, c.heading, c.text
         FROM material_chunks c
         JOIN materials m ON m.material_id = c.material_id
         WHERE ${where}
         ORDER BY m.created_at DESC, c.ordinal ASC
         LIMIT ?`,
      )
      .all(...likeValues, ...filterValues, limit) as unknown as Array<{
        material_id: string
        course_id: string
        title: string
        kind: string
        page: number | null
        heading: string | null
        text: string
      }>
    return {
      query,
      total: Number(totalRow.count),
      hits: rows.map((row) => ({
        materialId: row.material_id,
        courseId: row.course_id,
        title: row.title,
        kind: row.kind as MaterialKind,
        ...(row.page !== null ? { page: row.page } : {}),
        ...(row.heading ? { heading: row.heading } : {}),
        snippet: snippetAround(row.text, terms),
      })),
    }
  }

  subscriptions(): MaterialSubscriptionView[] {
    const rows = this.#db
      .prepare(
        'SELECT * FROM material_source_subscriptions ORDER BY updated_at DESC, rowid DESC',
      )
      .all() as unknown as SubscriptionRow[]
    return rows.map((row) => ({
      sourceId: row.source_id,
      courseId: row.course_id,
      enabled: Boolean(row.enabled),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }))
  }

  setSubscription(sourceId: string, courseId: string, enabled: boolean): MaterialSubscriptionView {
    if (!sourceId.trim() || !courseId.trim()) {
      throw new MaterialError('VALIDATION', '来源与课程不能为空')
    }
    const now = this.#clock.now()
    this.#db
      .prepare(
        `INSERT INTO material_source_subscriptions (
           source_id, course_id, enabled, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(source_id, course_id) DO UPDATE SET
           enabled = excluded.enabled,
           updated_at = excluded.updated_at`,
      )
      .run(sourceId, courseId, enabled ? 1 : 0, now, now)
    const row = this.#db
      .prepare(
        'SELECT * FROM material_source_subscriptions WHERE source_id = ? AND course_id = ?',
      )
      .get(sourceId, courseId) as unknown as SubscriptionRow
    return {
      sourceId: row.source_id,
      courseId: row.course_id,
      enabled: Boolean(row.enabled),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }
  }

  #subscription(sourceId: string, courseId: string): boolean {
    const row = this.#db
      .prepare(
        'SELECT enabled FROM material_source_subscriptions WHERE source_id = ? AND course_id = ?',
      )
      .get(sourceId, courseId) as { enabled: number } | undefined
    return Boolean(row?.enabled)
  }

  #byCourseHash(courseId: string, sha256: string): MaterialRow | undefined {
    return this.#db
      .prepare('SELECT * FROM materials WHERE course_id = ? AND sha256 = ?')
      .get(courseId, sha256) as unknown as MaterialRow | undefined
  }

  #chunksFor(materialId: string): ChunkRow[] {
    return this.#db
      .prepare('SELECT rowid, * FROM material_chunks WHERE material_id = ? ORDER BY ordinal ASC')
      .all(materialId) as unknown as ChunkRow[]
  }

  #assertPageStatus(resource: MaterialFetchedResource, html: string): void {
    if (resource.status === 401 || resource.status === 403) {
      throw new MaterialError('AUTH_REQUIRED', '登录已失效或无访问权限，请重新登录该来源')
    }
    if (resource.status === 429) {
      throw new MaterialError('RATE_LIMITED', '网站返回 429 限流，请稍后再试')
    }
    if (resource.status < 200 || resource.status >= 300) {
      throw new MaterialError('NETWORK', `页面请求失败：HTTP ${resource.status}`)
    }
    if (loginLike(resource.finalUrl, html)) {
      throw new MaterialError('AUTH_REQUIRED', '页面被重定向到登录页，请重新登录该来源')
    }
  }

  async #fetch(url: string, options: MaterialFetchOptions): Promise<MaterialFetchedResource> {
    if (!this.#fetchResource) {
      throw new MaterialError('CAPABILITY_UNAVAILABLE', '当前 Host 未配置资料抓取')
    }
    try {
      return await this.#fetchResource(url, options)
    } catch (error) {
      if (error instanceof MaterialError) throw error
      const code =
        error && typeof error === 'object' && 'code' in error
          ? String((error as { code?: unknown }).code)
          : undefined
      const message = error instanceof Error ? error.message : String(error)
      if (code === 'RATE_LIMITED') {
        throw new MaterialError('RATE_LIMITED', `请求被限流：${message}`)
      }
      if (
        code === 'INVALID_URL' ||
        code === 'UNSAFE_HOST' ||
        code === 'UNSAFE_PROTOCOL' ||
        code === 'UNSAFE_PORT' ||
        code === 'UNSAFE_PATH'
      ) {
        throw new MaterialError('VALIDATION', `抓取范围不允许：${message}`)
      }
      throw new MaterialError('NETWORK', `抓取失败：${message}`)
    }
  }

  async #assertCourse(courseId: string): Promise<void> {
    if (!courseId.trim()) throw new MaterialError('VALIDATION', '必须关联课程')
    if (this.#validateCourse && !(await this.#validateCourse(courseId))) {
      throw new MaterialError('NOT_FOUND', `课程不存在或已删除：${courseId}`)
    }
  }

  #writeContentFile(sha256: string, extension: string, bytes: Uint8Array): string {
    const directory = join(this.#rootDir, sha256.slice(0, 2))
    mkdirSync(directory, { recursive: true })
    const absolute = join(directory, `${sha256}${extension}`)
    if (!existsSync(absolute)) {
      try {
        writeFileSync(absolute, bytes, { flag: 'wx' })
      } catch (error) {
        // Another import of the same content may have won the race.
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
      }
    }
    return relative(this.#rootDir, absolute).split(sep).join('/')
  }

  #extract(kind: MaterialKind, bytes: Uint8Array): ExtractionResult {
    try {
      const document = extractDocument(kind, bytes)
      const chunks = buildChunks(document.blocks)
      if (chunks.length > MATERIAL_LIMITS.maxChunksPerMaterial) {
        return {
          chunks: chunks.slice(0, MATERIAL_LIMITS.maxChunksPerMaterial),
          status: 'indexed',
          note: `分块超过上限，仅索引前 ${MATERIAL_LIMITS.maxChunksPerMaterial} 段`,
          ...(document.pageCount ? { pageCount: document.pageCount } : {}),
        }
      }
      if (chunks.length === 0) {
        return {
          chunks: [],
          status: 'empty',
          note: document.note ?? '未抽取到可检索的文字',
          ...(document.pageCount ? { pageCount: document.pageCount } : {}),
        }
      }
      return {
        chunks,
        status: 'indexed',
        ...(document.note ? { note: document.note } : {}),
        ...(document.pageCount ? { pageCount: document.pageCount } : {}),
      }
    } catch (error) {
      return {
        chunks: [],
        status: 'failed',
        note: `文本抽取失败：${error instanceof Error ? error.message : String(error)}`,
      }
    }
  }

  #insertChunks(
    materialId: string,
    chunks: Array<{ text: string; page?: number; heading?: string }>,
  ): void {
    const insert = this.#db.prepare(
      `INSERT INTO material_chunks (chunk_id, material_id, ordinal, page, heading, text)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    const insertFts = this.#db.prepare(
      'INSERT INTO material_chunks_fts (rowid, text, heading) VALUES (?, ?, ?)',
    )
    chunks.forEach((chunk, index) => {
      const result = insert.run(
        this.#ids.next(),
        materialId,
        index,
        chunk.page ?? null,
        chunk.heading ?? null,
        chunk.text,
      )
      insertFts.run(Number(result.lastInsertRowid), chunk.text, chunk.heading ?? '')
    })
  }

  #toView(row: MaterialRow): MaterialView {
    return {
      materialId: row.material_id,
      courseId: row.course_id,
      ...(row.item_id ? { itemId: row.item_id } : {}),
      title: row.title,
      kind: row.kind as MaterialKind,
      sourceKind: row.source_kind as MaterialSourceKind,
      ...(row.source_url ? { sourceUrl: row.source_url } : {}),
      ...(row.origin_label ? { originLabel: row.origin_label } : {}),
      sha256: row.sha256,
      bytes: Number(row.bytes),
      mime: row.mime,
      ...(row.page_count !== null ? { pageCount: Number(row.page_count) } : {}),
      extractionStatus: row.extraction_status as MaterialView['extractionStatus'],
      ...(row.extraction_note ? { extractionNote: row.extraction_note } : {}),
      chunkCount: Number(row.chunk_count),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }
  }

  #toHit(row: {
    material_id: string
    course_id: string
    title: string
    kind: string
    page: number | null
    heading: string | null
    snippet: string
  }): MaterialChunkHit {
    return {
      materialId: row.material_id,
      courseId: row.course_id,
      title: row.title,
      kind: row.kind as MaterialKind,
      ...(row.page !== null ? { page: Number(row.page) } : {}),
      ...(row.heading ? { heading: row.heading } : {}),
      snippet: row.snippet,
    }
  }
}
