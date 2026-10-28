import { createHash } from 'node:crypto'
import { z } from 'zod'
import {
  actorSchema,
  dueSchema,
  isoDateTimeSchema,
  itemProgressSchema,
  rangeSchema,
} from './primitives.js'
import type { Actor } from './primitives.js'

export const commandSourceRefSchema = z.object({
  sourceId: z.string().min(1),
  externalCourseId: z.string().min(1),
})

export const academicItemSourceSchema = z.object({
  sourceId: z.string().min(1),
  externalItemId: z.string().min(1).optional(),
  sourceUpdatedAt: isoDateTimeSchema.optional(),
  sourceObservedAt: isoDateTimeSchema,
  contentHash: z.string().min(1),
})

export const academicItemSnapshotSchema = z.object({
  courseId: z.string().min(1),
  kind: z.enum(['assignment', 'exam', 'quiz']),
  title: z.string().min(1),
  description: z.string().optional(),
  due: dueSchema,
  sourceUrl: z.string().url().optional(),
  source: academicItemSourceSchema,
})

export type AcademicItemSnapshot = z.infer<typeof academicItemSnapshotSchema>

export const plannerIdentitySchema = z.object({
  id: z.string().min(1),
  version: z.string().min(1),
})

export const planBlockSchema = z
  .object({
    taskId: z.string().min(1),
    start: isoDateTimeSchema,
    end: isoDateTimeSchema,
  })
  .refine((block) => Date.parse(block.end) > Date.parse(block.start), {
    message: 'Plan block end must be after start',
  })

export const lockedBlockSchema = z
  .object({
    id: z.string().min(1),
    title: z.string().optional(),
    start: isoDateTimeSchema,
    end: isoDateTimeSchema,
  })
  .refine((block) => Date.parse(block.end) > Date.parse(block.start), {
    message: 'Locked block end must be after start',
  })

const emptyPayloadSchema = z.object({})

export const COMMAND_SCHEMAS = {
  'academic.course.create.v1': z.object({
    termId: z.string().min(1),
    code: z.string().min(1),
    title: z.string().min(1),
    source: commandSourceRefSchema.optional(),
  }),
  'academic.course.rename.v1': z.object({
    title: z.string().min(1),
  }),
  'academic.course.update.v1': z.object({
    termId: z.string().min(1).optional(),
    code: z.string().min(1).optional(),
    title: z.string().min(1).optional(),
  }),
  'academic.course.archive.v1': z.object({
    reason: z.string().max(500).optional(),
  }),
  'academic.course.restore.v1': emptyPayloadSchema,
  'academic.course.delete.v1': z.object({
    reason: z.string().max(500).optional(),
  }),
  'academic.item.discover.v1': academicItemSnapshotSchema,
  'academic.item.sync.v1': academicItemSnapshotSchema,
  'academic.item.set-progress.v1': z.object({
    progress: itemProgressSchema,
  }),
  'academic.item.archive.v1': z.object({
    reason: z.string().max(500).optional(),
  }),
  'academic.item.restore.v1': emptyPayloadSchema,
  'academic.task.create.v1': z.object({
    title: z.string().min(1),
    itemId: z.string().min(1).optional(),
    estimateMinutes: z.number().int().min(5).max(1440),
    dueAt: isoDateTimeSchema.optional(),
    priority: z.number().int().min(0).max(3).optional(),
  }),
  'academic.task.change-estimate.v1': z.object({
    estimateMinutes: z.number().int().min(5).max(1440),
  }),
  'academic.task.change-details.v1': z.object({
    title: z.string().min(1).optional(),
    dueAt: isoDateTimeSchema.nullable().optional(),
    priority: z.number().int().min(0).max(3).optional(),
    estimateMinutes: z.number().int().min(5).max(1440).optional(),
  }),
  'academic.task.archive.v1': z.object({
    reason: z.string().max(500).optional(),
  }),
  'academic.task.restore.v1': emptyPayloadSchema,
  'academic.task.complete.v1': emptyPayloadSchema,
  'academic.task.reopen.v1': emptyPayloadSchema,
  'academic.plan.accept.v1': z.object({
    range: rangeSchema,
    blocks: z.array(planBlockSchema),
    lockedBlocks: z.array(lockedBlockSchema).optional(),
    planner: plannerIdentitySchema,
    replanRequestId: z.string().min(1).optional(),
  }),
  'academic.plan.revise.v1': z.object({
    blocks: z.array(planBlockSchema),
    lockedBlocks: z.array(lockedBlockSchema).optional(),
  }),
  'academic.plan.archive.v1': z.object({
    reason: z.string().max(500).optional(),
  }),
} as const

export type CommandType = keyof typeof COMMAND_SCHEMAS
export type CommandPayload<T extends CommandType> = z.infer<(typeof COMMAND_SCHEMAS)[T]>

export const COMMAND = {
  CourseCreate: 'academic.course.create.v1',
  CourseRename: 'academic.course.rename.v1',
  CourseUpdate: 'academic.course.update.v1',
  CourseArchive: 'academic.course.archive.v1',
  CourseRestore: 'academic.course.restore.v1',
  CourseDelete: 'academic.course.delete.v1',
  AcademicItemDiscover: 'academic.item.discover.v1',
  AcademicItemSync: 'academic.item.sync.v1',
  AcademicItemSetProgress: 'academic.item.set-progress.v1',
  AcademicItemArchive: 'academic.item.archive.v1',
  AcademicItemRestore: 'academic.item.restore.v1',
  StudyTaskCreate: 'academic.task.create.v1',
  StudyTaskChangeEstimate: 'academic.task.change-estimate.v1',
  StudyTaskChangeDetails: 'academic.task.change-details.v1',
  StudyTaskArchive: 'academic.task.archive.v1',
  StudyTaskRestore: 'academic.task.restore.v1',
  StudyTaskComplete: 'academic.task.complete.v1',
  StudyTaskReopen: 'academic.task.reopen.v1',
  StudyPlanAccept: 'academic.plan.accept.v1',
  StudyPlanRevise: 'academic.plan.revise.v1',
  StudyPlanArchive: 'academic.plan.archive.v1',
} as const satisfies Record<string, CommandType>

export interface DomainCommandOf<T extends CommandType> {
  commandId: string
  type: T
  aggregateId: string
  expectedVersion?: number
  actor: Actor
  correlationId: string
  payload: CommandPayload<T>
}

export type DomainCommand = { [K in CommandType]: DomainCommandOf<K> }[CommandType]

export type CommandErrorCode =
  | 'VALIDATION'
  | 'CONFLICT'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'UNAVAILABLE'

export type CommandResult =
  | {
      ok: true
      aggregateId: string
      version: number
      eventIds: string[]
    }
  | {
      ok: false
      code: CommandErrorCode
      message: string
    }

const commandEnvelopeSchema = z.object({
  commandId: z.string().min(1),
  type: z.string().min(1),
  aggregateId: z.string().min(1),
  expectedVersion: z.number().int().nonnegative().optional(),
  actor: actorSchema,
  correlationId: z.string().min(1),
  payload: z.unknown(),
})

export function parseCommand(input: unknown): DomainCommand {
  const envelope = commandEnvelopeSchema.parse(input)
  if (!(envelope.type in COMMAND_SCHEMAS)) {
    throw new Error(`Unknown command type: ${envelope.type}`)
  }
  const type = envelope.type as CommandType
  const payload = COMMAND_SCHEMAS[type].parse(envelope.payload)
  return { ...envelope, type, payload } as DomainCommand
}

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

/**
 * Digest of the business content of a command. `commandId` and
 * `correlationId` are excluded so that a transport-level retry with a fresh
 * correlation still resolves to the original receipt.
 */
export function digestCommand(command: DomainCommand): string {
  const content = canonicalize({
    type: command.type,
    aggregateId: command.aggregateId,
    expectedVersion: command.expectedVersion ?? null,
    actor: command.actor,
    payload: command.payload,
  })
  return createHash('sha256').update(JSON.stringify(content)).digest('hex')
}
