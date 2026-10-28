import type { AdapterFetchContext } from './connections.js'
import type { Due } from './primitives.js'

export interface NormalizedAcademicItem {
  sourceId: string
  externalItemId?: string
  courseExternalId?: string
  kind: 'assignment' | 'exam' | 'quiz'
  title: string
  description?: string
  due: Due
  sourceUrl?: string
  sourceUpdatedAt?: string
  contentHash: string
}

export type Completeness = 'full' | 'partial' | 'unknown'

export interface AdapterResult {
  items: NormalizedAcademicItem[]
  completeness: Completeness
  fetchedAt: string
  warnings: string[]
}

export interface AcademicSourceAdapter {
  readonly id: string
  readonly sourceId: string
  readonly version?: string
  fetch(context?: AdapterFetchContext): Promise<AdapterResult>
}

export type SyncPreviewAction =
  | 'create'
  | 'update'
  | 'unchanged'
  | 'skip'
  | 'missing'

export interface SyncPreviewItem {
  externalItemId?: string
  title: string
  kind: NormalizedAcademicItem['kind']
  courseExternalId?: string
  action: SyncPreviewAction
  reason?: string
}

export interface SyncPreview {
  sourceId: string
  fetchedAt: string
  completeness: AdapterResult['completeness']
  warnings: string[]
  counts: {
    create: number
    update: number
    unchanged: number
    skip: number
    missing: number
  }
  items: SyncPreviewItem[]
}

export const SYNC_RUN_STATUSES = ['running', 'success', 'partial', 'failed', 'auth-required'] as const
export type SyncRunStatus = (typeof SYNC_RUN_STATUSES)[number]

export interface SyncRunSummary {
  runId: string
  sourceId: string
  status: SyncRunStatus
  startedAt: string
  finishedAt?: string
  itemsSeen: number
  created: number
  updated: number
  warnings: string[]
  errorCode?: string
  errorMessage?: string
  adapterId?: string
  adapterVersion?: string
}

export class AdapterAuthError extends Error {
  readonly code = 'AUTH_REQUIRED'

  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'AdapterAuthError'
  }
}

export class AdapterTransientError extends Error {
  readonly code = 'TRANSIENT'

  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'AdapterTransientError'
  }
}

/**
 * The request never reached the site's data: blocked host/path, proxy refusal
 * or DNS failure. It must not be reported as an expired session, otherwise the
 * user is pushed into a pointless re-login loop.
 */
export class AdapterEgressError extends Error {
  readonly code = 'EGRESS_BLOCKED'

  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'AdapterEgressError'
  }
}
