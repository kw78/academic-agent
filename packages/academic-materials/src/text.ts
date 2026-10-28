import { inflateRawSync } from 'node:zlib'
import type { ExtractedBlock, ExtractedDocument } from './types.js'
import { extractPdf } from './pdf.js'

const MAX_ZIP_ENTRIES = 2000
const MAX_ZIP_ENTRY_BYTES = 40 * 1024 * 1024
const MAX_ZIP_TOTAL_BYTES = 96 * 1024 * 1024

const HTML_BLOCK_TAGS = new Set([
  'p',
  'div',
  'section',
  'article',
  'li',
  'tr',
  'td',
  'th',
  'blockquote',
  'pre',
  'br',
  'hr',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
])

function decodeUtf8(bytes: Uint8Array): string {
  const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  return text.replace(/^\uFEFF/, '')
}

/** Chinese course materials are often GB18030-encoded text files. */
export function decodeTextBytes(bytes: Uint8Array): string {
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return new TextDecoder('utf-16le').decode(bytes.subarray(2)).replace(/^\uFEFF/, '')
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return new TextDecoder('utf-16be').decode(bytes.subarray(2)).replace(/^\uFEFF/, '')
  }
  try {
    return decodeUtf8(bytes)
  } catch {
    try {
      return new TextDecoder('gb18030').decode(bytes)
    } catch {
      return new TextDecoder('utf-8').decode(bytes)
    }
  }
}

function compact(value: string): string {
  return value.replace(/\r\n?/g, '\n').replace(/[ \t]+\n/g, '\n').trim()
}

function textBlocks(text: string): ExtractedBlock[] {
  const normalized = compact(text)
  if (!normalized) return []
  return normalized
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => ({ text: block }))
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  ensp: ' ',
  emsp: ' ',
  middot: '·',
  mdash: '—',
  ndash: '–',
  hellip: '…',
}

export function decodeHtmlEntities(value: string): string {
  return value.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, entity: string) => {
    if (entity.startsWith('#x') || entity.startsWith('#X')) {
      const code = Number.parseInt(entity.slice(2), 16)
      return Number.isFinite(code) ? String.fromCodePoint(code) : match
    }
    if (entity.startsWith('#')) {
      const code = Number.parseInt(entity.slice(1), 10)
      return Number.isFinite(code) ? String.fromCodePoint(code) : match
    }
    return NAMED_ENTITIES[entity.toLowerCase()] ?? match
  })
}

function stripInlineHtml(value: string): string {
  return decodeHtmlEntities(
    value
      .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
      .replace(/<noscript\b[\s\S]*?<\/noscript>/gi, ' ')
      .replace(/<svg\b[\s\S]*?<\/svg>/gi, ' ')
      .replace(/<[^>]*>/g, ' '),
  )
    .replace(/[ \t\u00a0]+/g, ' ')
    .trim()
}

/** Keeps block boundaries and headings so chunks retain page context. */
export function extractHtmlText(html: string): { blocks: ExtractedBlock[]; title?: string } {
  const body = html
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript\b[\s\S]*?<\/noscript>/gi, ' ')
  const titleMatch = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(body)
  const title = titleMatch?.[1] ? stripInlineHtml(titleMatch[1]) : undefined

  const blocks: ExtractedBlock[] = []
  let currentHeading: string | undefined
  const tokenPattern = /<\/?([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>/g
  let cursor = 0
  let pendingText = ''

  const flushText = () => {
    const text = stripInlineHtml(pendingText)
    pendingText = ''
    if (!text) return
    blocks.push(
      currentHeading ? { text, heading: currentHeading } : { text },
    )
  }

  for (;;) {
    const match = tokenPattern.exec(body)
    if (!match) break
    pendingText += body.slice(cursor, match.index)
    cursor = match.index + match[0].length
    const tag = match[1]!.toLowerCase()
    const closing = match[0].startsWith('</')
    if (!HTML_BLOCK_TAGS.has(tag)) continue
    flushText()
    if (/^h[1-6]$/.test(tag) && !closing) {
      currentHeading = undefined
    } else if (/^h[1-6]$/.test(tag) && closing) {
      // The heading text was flushed above; remember it for following blocks.
      const last = blocks[blocks.length - 1]
      if (last && !last.heading) {
        currentHeading = last.text.slice(0, 200)
        last.heading = currentHeading
      }
    }
  }
  pendingText += body.slice(cursor)
  flushText()
  return { blocks, ...(title ? { title } : {}) }
}

export function extractMarkdownText(markdown: string): ExtractedBlock[] {
  const withoutFrontMatter = markdown.replace(/^---\n[\s\S]*?\n---\n?/, '')
  const blocks: ExtractedBlock[] = []
  let currentHeading: string | undefined
  let buffer: string[] = []

  const flush = () => {
    const text = buffer.join('\n').trim()
    buffer = []
    if (!text) return
    blocks.push(currentHeading ? { text, heading: currentHeading } : { text })
  }

  for (const line of withoutFrontMatter.replace(/\r\n?/g, '\n').split('\n')) {
    const heading = /^(#{1,6})\s+(.+)$/.exec(line)
    if (heading) {
      flush()
      currentHeading = heading[2]!.trim().slice(0, 200)
      blocks.push({ text: currentHeading, heading: currentHeading })
      continue
    }
    if (!line.trim()) {
      flush()
      continue
    }
    buffer.push(line)
  }
  flush()
  return blocks
}

export function extractPlainText(text: string): ExtractedBlock[] {
  return textBlocks(text)
}

interface ZipEntry {
  name: string
  method: number
  compressedSize: number
  uncompressedSize: number
  localHeaderOffset: number
}

function readUInt32LE(buffer: Buffer, offset: number): number {
  if (offset < 0 || offset + 4 > buffer.length) return -1
  return buffer.readUInt32LE(offset)
}

function readUInt16LE(buffer: Buffer, offset: number): number {
  if (offset < 0 || offset + 2 > buffer.length) return -1
  return buffer.readUInt16LE(offset)
}

function readZipEntries(bytes: Uint8Array): Map<string, ZipEntry> {
  const buffer = Buffer.from(bytes)
  let eocd = -1
  for (let offset = buffer.length - 22; offset >= Math.max(0, buffer.length - 66_000); offset -= 1) {
    if (readUInt32LE(buffer, offset) === 0x06054b50) {
      eocd = offset
      break
    }
  }
  if (eocd < 0) throw new Error('ZIP 文件缺少目录结尾')
  const entryCount = readUInt16LE(buffer, eocd + 10)
  const centralOffset = readUInt32LE(buffer, eocd + 16)
  if (entryCount < 0 || entryCount > MAX_ZIP_ENTRIES || centralOffset < 0) {
    throw new Error('ZIP 条目数量或目录位置异常')
  }
  const entries = new Map<string, ZipEntry>()
  let cursor = centralOffset
  for (let index = 0; index < entryCount; index += 1) {
    if (readUInt32LE(buffer, cursor) !== 0x02014b50) break
    const method = readUInt16LE(buffer, cursor + 10)
    const compressedSize = readUInt32LE(buffer, cursor + 20)
    const uncompressedSize = readUInt32LE(buffer, cursor + 24)
    const nameLength = readUInt16LE(buffer, cursor + 28)
    const extraLength = readUInt16LE(buffer, cursor + 30)
    const commentLength = readUInt16LE(buffer, cursor + 32)
    const localHeaderOffset = readUInt32LE(buffer, cursor + 42)
    if (nameLength < 0 || localHeaderOffset < 0) break
    const name = buffer
      .subarray(cursor + 46, cursor + 46 + nameLength)
      .toString('utf8')
    if (compressedSize > MAX_ZIP_ENTRY_BYTES || uncompressedSize > MAX_ZIP_ENTRY_BYTES) {
      throw new Error(`ZIP 条目过大：${name}`)
    }
    entries.set(name, {
      name,
      method,
      compressedSize,
      uncompressedSize,
      localHeaderOffset,
    })
    cursor += 46 + nameLength + extraLength + commentLength
  }
  return entries
}

function readZipEntry(bytes: Uint8Array, entry: ZipEntry): Buffer {
  const buffer = Buffer.from(bytes)
  if (readUInt32LE(buffer, entry.localHeaderOffset) !== 0x04034b50) {
    throw new Error(`ZIP 本地头无效：${entry.name}`)
  }
  const nameLength = readUInt16LE(buffer, entry.localHeaderOffset + 26)
  const extraLength = readUInt16LE(buffer, entry.localHeaderOffset + 28)
  if (nameLength < 0 || extraLength < 0) throw new Error(`ZIP 本地头损坏：${entry.name}`)
  const dataStart = entry.localHeaderOffset + 30 + nameLength + extraLength
  const dataEnd = dataStart + entry.compressedSize
  if (dataEnd > buffer.length) throw new Error(`ZIP 数据越界：${entry.name}`)
  const data = buffer.subarray(dataStart, dataEnd)
  if (entry.method === 0) return Buffer.from(data)
  if (entry.method === 8) {
    return inflateRawSync(data, { maxOutputLength: MAX_ZIP_ENTRY_BYTES })
  }
  throw new Error(`不支持的 ZIP 压缩方式：${entry.method}`)
}

function extractDocxText(bytes: Uint8Array): ExtractedDocument {
  const entries = readZipEntries(bytes)
  const parts = ['word/document.xml']
  for (const [name] of entries) {
    if (/^word\/(header|footer)\d*\.xml$/.test(name)) parts.push(name)
  }
  const blocks: ExtractedBlock[] = []
  let total = 0
  for (const part of parts) {
    const entry = entries.get(part)
    if (!entry) continue
    total += entry.uncompressedSize
    if (total > MAX_ZIP_TOTAL_BYTES) throw new Error('DOCX 内容超过上限')
    const xml = readZipEntry(bytes, entry).toString('utf8')
    let currentHeading: string | undefined
    for (const paragraph of xml.matchAll(/<w:p\b[^>]*>([\s\S]*?)<\/w:p>/g)) {
      const inner = paragraph[1] ?? ''
      const style = /<w:pStyle\b[^>]*w:val="([^"]+)"/.exec(inner)?.[1]
      if (style && /^heading[1-6]$/i.test(style)) {
        const headingText = inner
          .replace(/<w:tab\/>/g, '\t')
          .replace(/<w:br\/>/g, '\n')
          .replace(/<[^>]*>/g, '')
        const decoded = decodeHtmlEntities(headingText).replace(/\s+/g, ' ').trim()
        if (decoded) currentHeading = decoded.slice(0, 200)
      }
      const text = inner
        .replace(/<w:tab\/>/g, '\t')
        .replace(/<w:br\/>/g, '\n')
        .replace(/<\/w:p>/g, '\n')
        .replace(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g, (_, value: string) =>
          decodeHtmlEntities(value),
        )
        .replace(/<[^>]*>/g, '')
        .replace(/[ \t]+\n/g, '\n')
        .trim()
      if (!text) continue
      blocks.push(currentHeading ? { text, heading: currentHeading } : { text })
    }
  }
  return { blocks, ...(blocks.length > 0 ? {} : { note: '未从 DOCX 中抽取到文字' }) }
}

function extractPptxText(bytes: Uint8Array): ExtractedDocument {
  const entries = readZipEntries(bytes)
  const slides = [...entries.values()]
    .map((entry) => {
      const match = /^ppt\/slides\/slide(\d+)\.xml$/.exec(entry.name)
      return match ? { entry, page: Number(match[1]) } : undefined
    })
    .filter((value): value is { entry: ZipEntry; page: number } => value !== undefined)
    .sort((left, right) => left.page - right.page)
  if (slides.length === 0) throw new Error('PPTX 中没有幻灯片')
  const blocks: ExtractedBlock[] = []
  let total = 0
  for (const slide of slides) {
    total += slide.entry.uncompressedSize
    if (total > MAX_ZIP_TOTAL_BYTES) throw new Error('PPTX 内容超过上限')
    const xml = readZipEntry(bytes, slide.entry).toString('utf8')
    const paragraphs: string[] = []
    for (const paragraph of xml.matchAll(/<a:p\b[^>]*>([\s\S]*?)<\/a:p>/g)) {
      const text = (paragraph[1] ?? '')
        .replace(/<a:br\/>/g, '\n')
        .replace(/<a:t\b[^>]*>([\s\S]*?)<\/a:t>/g, (_, value: string) =>
          decodeHtmlEntities(value),
        )
        .replace(/<[^>]*>/g, '')
        .replace(/\s+/g, ' ')
        .trim()
      if (text) paragraphs.push(text)
    }
    if (paragraphs.length === 0) continue
    blocks.push({
      text: paragraphs.join('\n'),
      page: slide.page,
      heading: `第 ${slide.page} 页`,
    })
  }
  return { blocks, pageCount: slides.length }
}

export function extractDocument(
  kind: 'pdf' | 'html' | 'markdown' | 'text' | 'pptx' | 'docx',
  bytes: Uint8Array,
): ExtractedDocument {
  switch (kind) {
    case 'text':
      return { blocks: extractPlainText(decodeTextBytes(bytes)) }
    case 'markdown':
      return { blocks: extractMarkdownText(decodeTextBytes(bytes)) }
    case 'html': {
      const html = decodeTextBytes(bytes)
      const { blocks } = extractHtmlText(html)
      return { blocks }
    }
    case 'pdf':
      return extractPdf(bytes)
    case 'docx':
      return extractDocxText(bytes)
    case 'pptx':
      return extractPptxText(bytes)
  }
}

export function htmlTitle(html: string): string | undefined {
  return extractHtmlText(html).title
}
