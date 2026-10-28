export {
  MaterialError,
  MaterialLibrary,
  MATERIAL_LIMITS,
  type MaterialErrorCode,
  type MaterialFetchedResource,
  type MaterialFetcher,
  type MaterialFetchOptions,
  type MaterialLibraryOptions,
} from './library.js'
export { buildChunks, MATERIAL_CHUNK_LIMITS } from './chunk.js'
export {
  decodeTextBytes,
  extractDocument,
  extractHtmlText,
  extractMarkdownText,
  extractPlainText,
} from './text.js'
export {
  extensionForKind,
  kindFromContentType,
  kindFromFileName,
  MATERIAL_ATTACHMENT_EXTENSIONS,
  mimeForKind,
  safeSourceUrl,
} from './media.js'
export type { ExtractedBlock, ExtractedDocument, MaterialChunkDraft } from './types.js'
