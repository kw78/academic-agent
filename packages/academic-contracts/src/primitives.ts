import { randomUUID } from 'node:crypto'
import { z } from 'zod'

export const ACTOR_KINDS = ['user', 'automation', 'agent', 'system'] as const
export type ActorKind = (typeof ACTOR_KINDS)[number]

export const actorSchema = z.object({
  kind: z.enum(ACTOR_KINDS),
  id: z.string().min(1),
})

export type Actor = z.infer<typeof actorSchema>

export const isoDateTimeSchema = z.string().refine(
  (value) => !Number.isNaN(Date.parse(value)),
  { message: 'Expected an ISO 8601 date-time' },
)

export const dueSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('instant'),
    utc: isoDateTimeSchema,
    zone: z.string().min(1),
  }),
  z.object({
    kind: z.literal('local-date'),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD'),
    zone: z.string().min(1).optional(),
  }),
  z.object({ kind: z.literal('unknown') }),
])

export type Due = z.infer<typeof dueSchema>

export const itemProgressSchema = z.object({
  status: z.enum(['not-started', 'in-progress', 'done']),
  percent: z.number().int().min(0).max(100),
  note: z.string().max(2000).optional(),
})

export type ItemProgress = z.infer<typeof itemProgressSchema>

export const timeBlockSchema = z
  .object({
    start: isoDateTimeSchema,
    end: isoDateTimeSchema,
  })
  .refine((block) => Date.parse(block.end) > Date.parse(block.start), {
    message: 'Block end must be after start',
  })

export type TimeBlock = z.infer<typeof timeBlockSchema>

export const rangeSchema = z
  .object({
    start: isoDateTimeSchema,
    end: isoDateTimeSchema,
  })
  .refine((range) => Date.parse(range.end) > Date.parse(range.start), {
    message: 'Range end must be after start',
  })

export type Range = z.infer<typeof rangeSchema>

export const newId = (): string => randomUUID()

export function dueEquals(left: Due, right: Due): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

/**
 * Lexicographic sort key for mixed due kinds. Date-only dues sort at the start
 * of their day; unknown dues sort last and must not be interpreted as a time.
 */
export function dueSortKey(due: Due): string {
  switch (due.kind) {
    case 'instant':
      return due.utc
    case 'local-date':
      return due.date
    case 'unknown':
      return '9999-12-31T23:59:59.999Z'
  }
}
