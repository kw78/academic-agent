import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'
import {
  AdapterAuthError,
  AdapterTransientError,
  dueSchema,
  isoDateTimeSchema,
  type AcademicSourceAdapter,
  type AdapterResult,
  type NormalizedAcademicItem,
} from '@academic/contracts'

export const fixtureCourseSchema = z.object({
  externalCourseId: z.string().min(1),
  termId: z.string().min(1),
  code: z.string().min(1),
  title: z.string().min(1),
})

export const fixtureItemSchema = z.object({
  externalItemId: z.string().min(1),
  courseExternalId: z.string().min(1).optional(),
  kind: z.enum(['assignment', 'exam', 'quiz']),
  title: z.string().min(1),
  description: z.string().optional(),
  due: dueSchema,
  sourceUrl: z.string().url().optional(),
  sourceUpdatedAt: isoDateTimeSchema.optional(),
})

export const fixtureSnapshotSchema = z.object({
  sourceId: z.string().min(1).default('fixture-lms'),
  fetchedAt: isoDateTimeSchema,
  completeness: z.enum(['full', 'partial', 'unknown']).default('full'),
  warnings: z.array(z.string()).default([]),
  courses: z.array(fixtureCourseSchema).default([]),
  items: z.array(fixtureItemSchema).default([]),
  error: z
    .object({
      kind: z.enum(['auth', 'transient']),
      message: z.string().min(1),
    })
    .optional(),
})

export type FixtureCourse = z.infer<typeof fixtureCourseSchema>
export type FixtureItem = z.infer<typeof fixtureItemSchema>
export type FixtureSnapshotInput = z.input<typeof fixtureSnapshotSchema>
export type FixtureSnapshot = z.output<typeof fixtureSnapshotSchema>

export const defaultFixturePath = fileURLToPath(
  new URL('../../../fixtures/fixture-lms/snapshot.json', import.meta.url),
)

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize)
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>
    const result: Record<string, unknown> = {}
    for (const key of Object.keys(record).sort()) {
      const entry = record[key]
      if (entry !== undefined) result[key] = canonicalize(entry)
    }
    return result
  }
  return value
}

export function contentHashForItem(sourceId: string, item: FixtureItem): string {
  const content = canonicalize({
    sourceId,
    courseExternalId: item.courseExternalId ?? null,
    kind: item.kind,
    title: item.title,
    description: item.description ?? null,
    due: item.due,
    sourceUrl: item.sourceUrl ?? null,
    sourceUpdatedAt: item.sourceUpdatedAt ?? null,
  })
  return createHash('sha256').update(JSON.stringify(content)).digest('hex')
}

export function normalizeFixtureSnapshot(snapshot: FixtureSnapshot): AdapterResult {
  const items: NormalizedAcademicItem[] = snapshot.items.map((item) => ({
    sourceId: snapshot.sourceId,
    externalItemId: item.externalItemId,
    courseExternalId: item.courseExternalId,
    kind: item.kind,
    title: item.title,
    description: item.description,
    due: item.due,
    sourceUrl: item.sourceUrl,
    sourceUpdatedAt: item.sourceUpdatedAt,
    contentHash: contentHashForItem(snapshot.sourceId, item),
  }))
  return {
    items,
    completeness: snapshot.completeness,
    fetchedAt: snapshot.fetchedAt,
    warnings: [...snapshot.warnings],
  }
}

export interface FixtureLmsAdapterOptions {
  fixturePath?: string
  snapshot?: FixtureSnapshotInput
  id?: string
  sourceId?: string
}

export class FixtureLmsAdapter implements AcademicSourceAdapter {
  readonly id: string
  readonly sourceId: string
  readonly #fixturePath: string | undefined
  readonly #snapshot: FixtureSnapshotInput | undefined

  constructor(options: FixtureLmsAdapterOptions = {}) {
    this.id = options.id ?? 'fixture-lms'
    this.sourceId = options.sourceId ?? 'fixture-lms'
    this.#fixturePath = options.fixturePath
    this.#snapshot = options.snapshot
  }

  async fetch(): Promise<AdapterResult> {
    const snapshot = this.#loadSnapshot()
    if (snapshot.error) {
      if (snapshot.error.kind === 'auth') {
        throw new AdapterAuthError(snapshot.error.message)
      }
      throw new AdapterTransientError(snapshot.error.message)
    }
    return normalizeFixtureSnapshot(snapshot)
  }

  #loadSnapshot(): FixtureSnapshot {
    if (this.#snapshot) return fixtureSnapshotSchema.parse(this.#snapshot)
    const path = this.#fixturePath ?? defaultFixturePath
    const raw = JSON.parse(readFileSync(path, 'utf8')) as unknown
    return fixtureSnapshotSchema.parse(raw)
  }
}

export function createFixtureAdapter(
  snapshot: FixtureSnapshotInput,
  options: Omit<FixtureLmsAdapterOptions, 'snapshot'> = {},
): FixtureLmsAdapter {
  return new FixtureLmsAdapter({ ...options, snapshot })
}
