import type { ExtractedBlock, MaterialChunkDraft } from './types.js'

const TARGET_CHARS = 1200
const MAX_CHARS = 2000
const OVERLAP_CHARS = 160

function normalize(value: string): string {
  return value
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+/g, ' ')
    // PDF line breaks inside Chinese runs are layout artifacts; keeping them
    // would split trigram/LIKE matches such as 中国 or 隐函数.
    .replace(/([\u3400-\u9fff])\n(?=[\u3400-\u9fff])/g, '$1')
    .trim()
}

function splitLongBlock(block: ExtractedBlock): ExtractedBlock[] {
  const text = normalize(block.text)
  if (text.length <= MAX_CHARS) return [{ ...block, text }]
  const parts: ExtractedBlock[] = []
  let start = 0
  while (start < text.length) {
    let end = Math.min(text.length, start + MAX_CHARS)
    if (end < text.length) {
      const window = text.slice(start, end)
      const boundary = Math.max(
        window.lastIndexOf('。'),
        window.lastIndexOf('！'),
        window.lastIndexOf('？'),
        window.lastIndexOf('. '),
        window.lastIndexOf('; '),
        window.lastIndexOf('\n'),
      )
      if (boundary > MAX_CHARS * 0.5) end = start + boundary + 1
    }
    const value = text.slice(start, end).trim()
    if (value) parts.push({ ...block, text: value })
    if (end >= text.length) break
    start = Math.max(start + 1, end - OVERLAP_CHARS)
  }
  return parts
}

/**
 * Chunks keep the page/heading of the first block they contain. Overlap is
 * only used when a single block must be split, so search hits stay readable.
 */
export function buildChunks(blocks: ExtractedBlock[]): MaterialChunkDraft[] {
  const normalized = blocks
    .map((block) => ({ ...block, text: normalize(block.text) }))
    .filter((block) => block.text.length > 0)
    .flatMap(splitLongBlock)

  const chunks: MaterialChunkDraft[] = []
  let current: MaterialChunkDraft | undefined

  const flush = () => {
    if (!current) return
    const text = current.text.trim()
    if (text) chunks.push({ ...current, text })
    current = undefined
  }

  for (const block of normalized) {
    const contextChanged =
      current !== undefined &&
      (current.page !== block.page || current.heading !== block.heading)
    if (contextChanged) flush()
    if (!current) {
      current = {
        text: block.text,
        ...(block.page !== undefined ? { page: block.page } : {}),
        ...(block.heading ? { heading: block.heading } : {}),
      }
      if (current.text.length >= TARGET_CHARS) flush()
      continue
    }
    if (current.text.length + block.text.length + 1 > MAX_CHARS) {
      flush()
      current = {
        text: block.text,
        ...(block.page !== undefined ? { page: block.page } : {}),
        ...(block.heading ? { heading: block.heading } : {}),
      }
      if (current.text.length >= TARGET_CHARS) flush()
      continue
    }
    current.text += `\n${block.text}`
    if (current.text.length >= TARGET_CHARS) flush()
  }
  flush()
  return chunks
}

export const MATERIAL_CHUNK_LIMITS = {
  targetChars: TARGET_CHARS,
  maxChars: MAX_CHARS,
  overlapChars: OVERLAP_CHARS,
}
