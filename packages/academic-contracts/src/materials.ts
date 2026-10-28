export type MaterialKind = 'pdf' | 'html' | 'markdown' | 'text' | 'pptx' | 'docx'

export type MaterialSourceKind = 'file' | 'text' | 'url' | 'attachment'

export type MaterialExtractionStatus = 'indexed' | 'empty' | 'failed'

export interface MaterialView {
  materialId: string
  courseId: string
  itemId?: string
  title: string
  kind: MaterialKind
  sourceKind: MaterialSourceKind
  sourceUrl?: string
  originLabel?: string
  sha256: string
  bytes: number
  mime: string
  pageCount?: number
  extractionStatus: MaterialExtractionStatus
  extractionNote?: string
  chunkCount: number
  createdAt: string
  updatedAt: string
}

export interface MaterialSearchParams {
  query: string
  courseId?: string
  itemId?: string
  limit?: number
}

export interface MaterialChunkHit {
  materialId: string
  courseId: string
  title: string
  kind: MaterialKind
  page?: number
  heading?: string
  snippet: string
}

export interface MaterialSearchResult {
  query: string
  hits: MaterialChunkHit[]
  total: number
}

export interface MaterialImportResult {
  material: MaterialView
  duplicate: boolean
  chunks: number
}

export interface MaterialListParams {
  courseId?: string
  itemId?: string
  limit?: number
}

export interface MaterialImportTextInput {
  courseId: string
  itemId?: string
  title: string
  text: string
  sourceUrl?: string
  originLabel?: string
}

export interface MaterialImportFileInput {
  courseId: string
  itemId?: string
  filePath: string
  title?: string
  originLabel?: string
}

export interface MaterialImportBytesInput {
  courseId: string
  itemId?: string
  fileName: string
  bytes: Uint8Array
  title?: string
  sourceKind?: MaterialSourceKind
  sourceUrl?: string
  originLabel?: string
}

export interface MaterialImportUrlInput {
  courseId: string
  itemId?: string
  url: string
  title?: string
  sourceId?: string
  sessionId?: string
}

export interface MaterialAttachmentImportInput {
  courseId: string
  sourceId: string
  pageUrl: string
  itemId?: string
  pathPrefix?: string
  maxFiles?: number
}

export interface MaterialAttachmentFailure {
  url: string
  message: string
}

export interface MaterialAttachmentImportResult {
  pageUrl: string
  discovered: number
  imported: number
  duplicates: number
  skipped: number
  failed: number
  stopReason?: string
  items: MaterialImportResult[]
  failures: MaterialAttachmentFailure[]
}

export interface MaterialSubscriptionView {
  sourceId: string
  courseId: string
  enabled: boolean
  createdAt: string
  updatedAt: string
}

export interface MaterialRebuildResult {
  materials: number
  chunks: number
  missingFiles: number
}

/**
 * Read/write surface for agent tools. The host still authorizes every write;
 * this port cannot grant access to credentials or source sessions.
 */
export interface MaterialToolPort {
  list(params?: MaterialListParams): MaterialView[]
  search(params: MaterialSearchParams): MaterialSearchResult
  importText(input: MaterialImportTextInput): MaterialImportResult | Promise<MaterialImportResult>
  importUrl(input: MaterialImportUrlInput): Promise<MaterialImportResult>
  delete(materialId: string): void
}
