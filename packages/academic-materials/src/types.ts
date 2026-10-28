export interface ExtractedBlock {
  text: string
  page?: number
  heading?: string
}

export interface ExtractedDocument {
  blocks: ExtractedBlock[]
  pageCount?: number
  note?: string
}

export interface MaterialChunkDraft {
  text: string
  page?: number
  heading?: string
}
