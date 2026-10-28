import type { Due } from './primitives.js'

export interface AdapterSample {
  url: string
  body: string
  contentType?: string
}

export interface AdapterCandidateReport {
  ok: boolean
  errors: string[]
  warnings: string[]
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

export interface AdapterCandidateSummary {
  adapterId: string
  version: string
  displayName: string
  status: AdapterCandidateStatus
  createdAt: string
  updatedAt: string
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
