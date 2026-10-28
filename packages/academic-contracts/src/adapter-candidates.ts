import type { Due } from './primitives.js'

export interface AdapterSample {
  url: string
  body: string
  contentType?: string
  /** Defaults to GET. POST samples must also carry requestBody. */
  method?: 'GET' | 'POST'
  /** Exact JSON body sent by POST requests, so replay matches the real call. */
  requestBody?: string
}

export type AdapterCandidateCheckStage =
  | 'schema'
  | 'contract'
  | 'permissions'
  | 'sample-replay'

export interface AdapterCandidateCheck {
  stage: AdapterCandidateCheckStage
  ok: boolean
  detail?: string
}

export interface AdapterCandidateReport {
  ok: boolean
  errors: string[]
  warnings: string[]
  checks?: AdapterCandidateCheck[]
  courses: Array<{
    externalCourseId: string
    code: string
    title: string
    termId: string
  }>
  items: Array<{
    externalItemId?: string
    title: string
    kind: 'assignment' | 'exam' | 'quiz'
    due: Due
    sourceUrl?: string
  }>
  testedAt: string
}

export type AdapterCandidateStatus = 'candidate' | 'validated' | 'revoked'

export interface AdapterCandidateScope {
  allowedOrigins: string[]
  allowedPathPrefixes: string[]
  dataTypes: Array<'courses' | 'assignments' | 'detail'>
  fields: Record<string, string[]>
}

export interface AdapterCandidateSummary {
  adapterId: string
  version: string
  displayName: string
  status: AdapterCandidateStatus
  createdAt: string
  updatedAt: string
  scope?: AdapterCandidateScope
}

export interface AdapterCandidatePort {
  validate(
    manifest: unknown,
    samples: AdapterSample[],
  ): Promise<AdapterCandidateReport>
  register(
    manifest: unknown,
    samples: AdapterSample[],
  ): Promise<{ summary: AdapterCandidateSummary; report: AdapterCandidateReport }>
  list(adapterId?: string): AdapterCandidateSummary[]
  activate(adapterId: string, version: string): AdapterCandidateSummary
  rollback(adapterId: string, version?: string): AdapterCandidateSummary
}
