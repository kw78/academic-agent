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
  fetch(context?: AdapterFetchContext): Promise<AdapterResult>
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
