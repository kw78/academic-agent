import type { MaterialKind } from '@academic/contracts'

const KIND_BY_EXTENSION: Record<string, MaterialKind> = {
  pdf: 'pdf',
  html: 'html',
  htm: 'html',
  xhtml: 'html',
  md: 'markdown',
  markdown: 'markdown',
  txt: 'text',
  text: 'text',
  log: 'text',
  csv: 'text',
  pptx: 'pptx',
  docx: 'docx',
}

const MIME_BY_KIND: Record<MaterialKind, string> = {
  pdf: 'application/pdf',
  html: 'text/html',
  markdown: 'text/markdown',
  text: 'text/plain',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
}

const EXTENSION_BY_KIND: Record<MaterialKind, string> = {
  pdf: '.pdf',
  html: '.html',
  markdown: '.md',
  text: '.txt',
  pptx: '.pptx',
  docx: '.docx',
}

export function kindFromFileName(fileName: string): MaterialKind | undefined {
  const extension = /\.([a-zA-Z0-9]+)$/.exec(fileName)?.[1]?.toLowerCase()
  return extension ? KIND_BY_EXTENSION[extension] : undefined
}

export function kindFromContentType(contentType: string | undefined): MaterialKind | undefined {
  const value = (contentType ?? '').toLowerCase()
  if (value.includes('application/pdf')) return 'pdf'
  if (value.includes('text/html') || value.includes('application/xhtml')) return 'html'
  if (value.includes('text/markdown')) return 'markdown'
  if (value.includes('presentationml.presentation')) return 'pptx'
  if (value.includes('wordprocessingml.document')) return 'docx'
  if (value.startsWith('text/')) return 'text'
  return undefined
}

export function mimeForKind(kind: MaterialKind): string {
  return MIME_BY_KIND[kind]
}

export function extensionForKind(kind: MaterialKind): string {
  return EXTENSION_BY_KIND[kind]
}

/** Store the page URL without query/fragment, which may carry tokens. */
export function safeSourceUrl(value: string): string | undefined {
  try {
    const url = new URL(value)
    url.username = ''
    url.password = ''
    url.search = ''
    url.hash = ''
    return url.toString()
  } catch {
    return undefined
  }
}

export const MATERIAL_ATTACHMENT_EXTENSIONS = new Set(Object.keys(KIND_BY_EXTENSION))
