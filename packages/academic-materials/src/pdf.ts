import { inflateRawSync, inflateSync } from 'node:zlib'
import type { ExtractedBlock, ExtractedDocument } from './types.js'

interface PdfObject {
  num: number
  body: string
  stream?: Buffer
}

interface CMapTable {
  maxWidth: number
  map: Map<number, string>
}

interface FontInfo {
  cmap?: CMapTable
}

type ContentToken =
  | { type: 'string'; value: Buffer }
  | { type: 'number'; value: number }
  | { type: 'name'; value: string }
  | { type: 'array'; values: ContentToken[] }
  | { type: 'op'; value: string }

function stripWhitespace(value: string): string {
  return value.replace(/\r\n?/g, '\n').replace(/[ \t]+/g, ' ').trim()
}

function decodeStream(dict: string, data: Buffer): Buffer | undefined {
  if (!/\/FlateDecode/.test(dict)) return data
  try {
    return inflateSync(data)
  } catch {
    try {
      return inflateRawSync(data)
    } catch {
      return undefined
    }
  }
}

function parseObjects(text: string): Map<number, PdfObject> {
  const objects = new Map<number, PdfObject>()
  const pattern = /(\d+)\s+(\d+)\s+obj\b/g
  for (;;) {
    const match = pattern.exec(text)
    if (!match) break
    const start = match.index + match[0].length
    const end = text.indexOf('endobj', start)
    if (end < 0) break
    const body = text.slice(start, end)
    const object: PdfObject = { num: Number(match[1]), body }
    const streamMatch = /\bstream\b/.exec(body)
    if (streamMatch) {
      let dataStart = streamMatch.index + streamMatch[0].length
      if (body[dataStart] === '\r') dataStart += 1
      if (body[dataStart] === '\n') dataStart += 1
      let dataEnd = body.lastIndexOf('endstream')
      if (dataEnd < dataStart) dataEnd = body.length
      let raw = body.slice(dataStart, dataEnd)
      if (raw.endsWith('\r\n')) raw = raw.slice(0, -2)
      else if (raw.endsWith('\n')) raw = raw.slice(0, -1)
      const decoded = decodeStream(body.slice(0, streamMatch.index), Buffer.from(raw, 'latin1'))
      if (decoded) object.stream = decoded
    }
    objects.set(object.num, object)
    pattern.lastIndex = end + 'endobj'.length
  }
  return objects
}

function objectRefs(value: string): number[] {
  const refs: number[] = []
  for (const match of value.matchAll(/(\d+)\s+\d+\s+R\b/g)) refs.push(Number(match[1]))
  return refs
}

function refObject(objects: Map<number, PdfObject>, value: string): PdfObject | undefined {
  const ref = /(\d+)\s+\d+\s+R\b/.exec(value)
  return ref ? objects.get(Number(ref[1])) : undefined
}

function dictArrayValue(body: string, key: string): string | undefined {
  const match = new RegExp(`/${key}\\s*(\\[[\\s\\S]*?\\])`).exec(body)
  return match?.[1]
}

function pageTree(ojects: Map<number, PdfObject>): number[] | undefined {
  const roots = [...ojects.values()].filter(
    (object) =>
      /\/Type\s*\/Pages\b/.test(object.body) &&
      !/\/Parent\s+\d+\s+\d+\s+R/.test(object.body),
  )
  if (roots.length === 0) return undefined
  const pages: number[] = []
  const visited = new Set<number>()
  const walk = (ref: number) => {
    if (visited.has(ref)) return
    visited.add(ref)
    const object = ojects.get(ref)
    if (!object) return
    if (/\/Type\s*\/Page\b/.test(object.body)) {
      pages.push(ref)
      return
    }
    const kids = dictArrayValue(object.body, 'Kids')
    if (!kids) return
    for (const child of objectRefs(kids)) walk(child)
  }
  walk(roots[0]!.num)
  return pages.length > 0 ? pages : undefined
}

function hexToUnicode(hex: string): string {
  const clean = hex.length % 2 === 0 ? hex : `0${hex}`
  let value = ''
  for (let index = 0; index < clean.length; index += 4) {
    const code = Number.parseInt(clean.slice(index, index + 4).padEnd(4, '0'), 16)
    if (Number.isFinite(code) && code !== 0) value += String.fromCharCode(code)
  }
  return value
}

function parseCMap(text: string): CMapTable | undefined {
  const map = new Map<number, string>()
  let maxWidth = 0
  for (const block of text.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) {
    for (const match of (block[1] ?? '').matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>/g)) {
      const source = match[1]!
      const width = Math.ceil(source.length / 2)
      maxWidth = Math.max(maxWidth, width)
      map.set(Number.parseInt(source, 16), hexToUnicode(match[2]!))
    }
  }
  for (const block of text.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
    const body = block[1] ?? ''
    for (const match of body.matchAll(
      /<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*(?:<([0-9a-fA-F]+)>|\[([\s\S]*?)\])/g,
    )) {
      const low = Number.parseInt(match[1]!, 16)
      const high = Number.parseInt(match[2]!, 16)
      if (!Number.isFinite(low) || !Number.isFinite(high) || high < low) continue
      const width = Math.ceil(match[1]!.length / 2)
      maxWidth = Math.max(maxWidth, width)
      if (match[3]) {
        const base = hexToUnicode(match[3])
        const baseCode = base.codePointAt(0) ?? 0
        for (let offset = 0; offset <= Math.min(high - low, 65_535); offset += 1) {
          const target = baseCode + offset
          if (target > 0x10ffff) break
          map.set(low + offset, String.fromCodePoint(target))
        }
        continue
      }
      const destinations = [...(match[4] ?? '').matchAll(/<([0-9a-fA-F]+)>/g)]
      destinations.forEach((destination, offset) => {
        if (low + offset <= high) {
          map.set(low + offset, hexToUnicode(destination[1]!))
        }
      })
    }
  }
  if (map.size === 0) return undefined
  return { maxWidth: Math.max(1, Math.min(maxWidth, 4)), map }
}

function decodePdfString(bytes: Buffer, font: FontInfo | undefined): string {
  if (bytes.length === 0) return ''
  const cmap = font?.cmap
  if (cmap) {
    let value = ''
    for (let index = 0; index < bytes.length; ) {
      const width = Math.min(cmap.maxWidth, bytes.length - index)
      let code = 0
      for (let offset = 0; offset < width; offset += 1) {
        code = (code << 8) | bytes[index + offset]!
      }
      const mapped = cmap.map.get(code)
      if (mapped !== undefined) {
        value += mapped
      } else if (width === 1 && bytes[index]! >= 0x20 && bytes[index]! < 0x7f) {
        value += String.fromCharCode(bytes[index]!)
      }
      index += width
    }
    return value
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    let value = ''
    for (let index = 2; index + 1 < bytes.length; index += 2) {
      const code = (bytes[index]! << 8) | bytes[index + 1]!
      if (code !== 0) value += String.fromCharCode(code)
    }
    return value
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return bytes
      .toString('latin1')
      .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
  }
}

function readLiteralString(source: string, start: number): { value: Buffer; next: number } {
  const bytes: number[] = []
  let depth = 1
  let index = start + 1
  while (index < source.length) {
    const char = source[index]!
    if (char === '\\') {
      const next = source[index + 1]
      index += 2
      if (next === undefined) break
      if (next === 'n') bytes.push(0x0a)
      else if (next === 'r') bytes.push(0x0d)
      else if (next === 't') bytes.push(0x09)
      else if (next === 'b') bytes.push(0x08)
      else if (next === 'f') bytes.push(0x0c)
      else if (next === '\n') continue
      else if (next === '\r') {
        if (source[index] === '\n') index += 1
      } else if (/[0-7]/.test(next)) {
        let octal = next
        while (octal.length < 3 && /[0-7]/.test(source[index] ?? '')) {
          octal += source[index]
          index += 1
        }
        bytes.push(Number.parseInt(octal, 8) & 0xff)
      } else bytes.push(next.charCodeAt(0) & 0xff)
      continue
    }
    if (char === '(') depth += 1
    if (char === ')') {
      depth -= 1
      if (depth === 0) return { value: Buffer.from(bytes), next: index + 1 }
    }
    bytes.push(char.charCodeAt(0) & 0xff)
    index += 1
  }
  return { value: Buffer.from(bytes), next: index }
}

function hexString(source: string, start: number): { value: Buffer; next: number } {
  const end = source.indexOf('>', start + 1)
  const hex = source.slice(start + 1, end < 0 ? source.length : end)
  const clean = hex.replace(/[^0-9a-fA-F]/g, '')
  return {
    value: Buffer.from(clean.length % 2 === 0 ? clean : `${clean}0`, 'hex'),
    next: end < 0 ? source.length : end + 1,
  }
}

function tokenizeContent(source: string): ContentToken[] {
  const tokens: ContentToken[] = []
  let index = 0
  const readArray = (): ContentToken[] => {
    const values: ContentToken[] = []
    while (index < source.length) {
      const token = nextToken()
      if (!token) break
      if (token.type === 'op' && token.value === ']') break
      values.push(token)
    }
    return values
  }
  const nextToken = (): ContentToken | undefined => {
    while (index < source.length) {
      const char = source[index]!
      if (/\s/.test(char)) {
        index += 1
        continue
      }
      if (char === '%') {
        const end = source.indexOf('\n', index)
        index = end < 0 ? source.length : end + 1
        continue
      }
      if (char === '(') {
        const result = readLiteralString(source, index)
        index = result.next
        return { type: 'string', value: result.value }
      }
      if (char === '<') {
        if (source[index + 1] === '<') {
          // Inline dictionaries in marked content are not needed for text.
          let depth = 0
          while (index < source.length) {
            if (source[index] === '<' && source[index + 1] === '<') {
              depth += 1
              index += 2
              continue
            }
            if (source[index] === '>' && source[index + 1] === '>') {
              depth -= 1
              index += 2
              if (depth <= 0) break
              continue
            }
            index += 1
          }
          continue
        }
        const result = hexString(source, index)
        index = result.next
        return { type: 'string', value: result.value }
      }
      if (char === '[') {
        index += 1
        return { type: 'array', values: readArray() }
      }
      if (char === ']') {
        index += 1
        return { type: 'op', value: ']' }
      }
      if (char === '/') {
        let end = index + 1
        while (end < source.length && !/[\s/<>\[\]()%{}]/.test(source[end]!)) end += 1
        const name = source.slice(index + 1, end)
        index = end
        return { type: 'name', value: name }
      }
      if (/[-+.\d]/.test(char)) {
        let end = index + 1
        while (end < source.length && /[-+.\d]/.test(source[end]!)) end += 1
        const value = Number(source.slice(index, end))
        index = end
        if (Number.isFinite(value)) return { type: 'number', value }
        continue
      }
      let end = index + 1
      while (end < source.length && !/[\s/<>\[\]()%]/.test(source[end]!)) end += 1
      const word = source.slice(index, end)
      index = end
      return { type: 'op', value: word }
    }
    return undefined
  }

  for (;;) {
    const token = nextToken()
    if (!token) break
    if (token.type === 'op' && token.value === 'BI') {
      // Skip inline image data: find the next EI operator.
      const end = source.indexOf('EI', index)
      index = end < 0 ? source.length : end + 2
      tokens.length = 0
      continue
    }
    tokens.push(token)
  }
  return tokens
}

function interpretContent(content: string, fonts: Map<string, FontInfo>): string {
  const tokens = tokenizeContent(content)
  const operands: ContentToken[] = []
  let font: FontInfo | undefined
  let output = ''
  let lineY: number | undefined
  let pendingSpace = false
  const newline = () => {
    if (output && !output.endsWith('\n')) output += '\n'
    pendingSpace = false
  }
  const append = (value: string) => {
    const text = value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
    if (!text) return
    if (pendingSpace) {
      if (output && !output.endsWith('\n') && !output.endsWith(' ')) output += ' '
      pendingSpace = false
    } else if (
      output &&
      !output.endsWith('\n') &&
      !output.endsWith(' ') &&
      /[A-Za-z0-9]$/.test(output) &&
      /^[A-Za-z0-9]/.test(text)
    ) {
      output += ' '
    }
    output += text
  }
  const numbersOf = () =>
    operands
      .filter((entry): entry is { type: 'number'; value: number } => entry.type === 'number')
      .map((entry) => entry.value)
  for (const token of tokens) {
    if (token.type !== 'op') {
      operands.push(token)
      continue
    }
    switch (token.value) {
      case 'Tf': {
        const name = operands.findLast((entry) => entry.type === 'name')
        font = name && name.type === 'name' ? fonts.get(name.value) : undefined
        break
      }
      case 'BT':
      case 'ET':
        break
      case 'Td':
      case 'TD': {
        // Glyph-positioned PDFs repeat Td with the same baseline for every
        // character; only a vertical jump starts a new extracted line.
        const y = numbersOf().at(-1)
        if (y !== undefined) {
          if (lineY === undefined) lineY = y
          else if (Math.abs(y - lineY) > 6) {
            newline()
            lineY = y
          }
        }
        break
      }
      case 'Tm': {
        const values = numbersOf()
        const y = values.at(-1)
        if (y !== undefined) {
          if (lineY === undefined || Math.abs(y - lineY) > 6) newline()
          lineY = y
        }
        break
      }
      case 'T*':
        newline()
        break
      case 'Tj': {
        const value = operands.at(-1)
        if (value?.type === 'string') append(decodePdfString(value.value, font))
        break
      }
      case 'TJ': {
        const array = operands.findLast((entry) => entry.type === 'array')
        if (array?.type === 'array') {
          for (const entry of array.values) {
            if (entry.type === 'string') append(decodePdfString(entry.value, font))
            else if (entry.type === 'number' && entry.value < -150) pendingSpace = true
          }
        }
        break
      }
      case "'":
      case '"': {
        newline()
        const value = operands.at(-1)
        if (value?.type === 'string') append(decodePdfString(value.value, font))
        break
      }
      default:
        break
    }
    operands.length = 0
  }
  return stripWhitespace(output)
}

function inlineDict(body: string, key: string): string | undefined {
  const index = body.search(new RegExp(`/${key}\\s*<<`))
  if (index < 0) return undefined
  let cursor = index + body.slice(index).indexOf('<<')
  let depth = 0
  for (; cursor < body.length; cursor += 1) {
    if (body[cursor] === '<' && body[cursor + 1] === '<') {
      depth += 1
      cursor += 1
      continue
    }
    if (body[cursor] === '>' && body[cursor + 1] === '>') {
      depth -= 1
      cursor += 1
      if (depth === 0) return body.slice(index, cursor + 1)
    }
  }
  return undefined
}

function pageFonts(
  page: PdfObject,
  objects: Map<number, PdfObject>,
): Map<string, FontInfo> {
  let resourcesBody = page.body
  const resourcesRef = /\/Resources\s+(\d+)\s+\d+\s+R\b/.exec(page.body)
  if (resourcesRef) {
    resourcesBody = objects.get(Number(resourcesRef[1]))?.body ?? ''
  } else {
    const inline = inlineDict(page.body, 'Resources')
    if (inline) resourcesBody = inline
  }
  const fontMatch = /\/Font\s*<<([\s\S]*?)>>/.exec(resourcesBody)
  const fonts = new Map<string, FontInfo>()
  if (!fontMatch) return fonts
  for (const match of (fontMatch[1] ?? '').matchAll(/\/([^\s/<>\[\]()]+)\s+(\d+)\s+\d+\s+R\b/g)) {
    const name = match[1]!
    const fontObject = objects.get(Number(match[2]))
    if (!fontObject) continue
    const toUnicode = /\/ToUnicode\s+(\d+)\s+\d+\s+R\b/.exec(fontObject.body)
    const cmapObject = toUnicode ? objects.get(Number(toUnicode[1])) : undefined
    const cmap =
      cmapObject?.stream && /beginbfchar|beginbfrange/.test(cmapObject.stream.toString('latin1'))
        ? parseCMap(cmapObject.stream.toString('latin1'))
        : undefined
    fonts.set(name, cmap ? { cmap } : {})
  }
  return fonts
}

function contentStreams(
  page: PdfObject,
  objects: Map<number, PdfObject>,
): Buffer[] {
  const match = /\/Contents\s*(\[[\s\S]*?\]|\d+\s+\d+\s+R)/.exec(page.body)
  if (!match) return []
  const refs = objectRefs(match[1]!)
  const streams: Buffer[] = []
  for (const ref of refs) {
    const object = objects.get(ref)
    if (object?.stream) streams.push(object.stream)
  }
  return streams
}

export function extractPdf(bytes: Uint8Array): ExtractedDocument {
  const text = Buffer.from(bytes).toString('latin1')
  if (!text.startsWith('%PDF')) throw new Error('不是有效的 PDF 文件')
  const objects = parseObjects(text)
  if (objects.size === 0) throw new Error('PDF 对象解析失败')
  const tree = pageTree(objects)
  const pageNumbers =
    tree ??
    [...objects.values()]
      .filter((object) => /\/Type\s*\/Page\b/.test(object.body))
      .sort((left, right) => left.num - right.num)
      .map((object) => object.num)

  const blocks: ExtractedBlock[] = []
  pageNumbers.forEach((ref, index) => {
    const page = objects.get(ref)
    if (!page) return
    const fonts = pageFonts(page, objects)
    const pageText = contentStreams(page, objects)
      .map((stream) => interpretContent(stream.toString('latin1'), fonts))
      .filter(Boolean)
      .join('\n')
    for (const paragraph of pageText.split(/\n{2,}/)) {
      const value = paragraph.trim()
      if (!value) continue
      blocks.push({
        text: value,
        page: index + 1,
        heading: `第 ${index + 1} 页`,
      })
    }
  })

  if (blocks.length === 0 && pageNumbers.length === 0) {
    // Damaged page trees still often contain extractable text streams.
    for (const object of objects.values()) {
      if (!object.stream) continue
      const value = interpretContent(object.stream.toString('latin1'), new Map())
      if (!value) continue
      blocks.push({ text: value })
    }
  }

  const countMatch = /\/Count\s+(\d+)/.exec(text)
  const pageCount = countMatch
    ? Number(countMatch[1])
    : pageNumbers.length > 0
      ? pageNumbers.length
      : undefined
  return {
    blocks,
    ...(pageCount ? { pageCount } : {}),
    ...(blocks.length === 0
      ? { note: 'PDF 中未抽取到可选文字（可能是扫描件或缺少 ToUnicode 映射）' }
      : {}),
  }
}
