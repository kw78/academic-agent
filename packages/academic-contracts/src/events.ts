import { z } from 'zod'
import {
  academicItemSnapshotSchema,
  academicItemSourceSchema,
  lockedBlockSchema,
  planBlockSchema,
  plannerIdentitySchema,
} from './commands.js'
import { actorSchema, dueSchema, isoDateTimeSchema, itemProgressSchema, rangeSchema } from './primitives.js'
import type { Actor, Due, ItemProgress, Range } from './primitives.js'
import type { AggregateKind, LockedBlock, PlanBlock, PlannerIdentity } from './domain.js'

export const CURRENT_EVENT_SCHEMA_VERSION = 1

export const EVENT_SCHEMAS = {
  'academic.course.created': z.object({
    termId: z.string().min(1),
    code: z.string().min(1),
    title: z.string().min(1),
    source: z
      .object({
        sourceId: z.string().min(1),
        externalCourseId: z.string().min(1),
      })
      .optional(),
  }),
  'academic.course.renamed': z.object({
    title: z.string().min(1),
    previousTitle: z.string().min(1),
  }),
  'academic.course.archived': z.object({
    reason: z.string().max(500).optional(),
  }),
  'academic.item.discovered': academicItemSnapshotSchema,
  'academic.item.details-changed': z.object({
    snapshot: academicItemSnapshotSchema,
    changedFields: z.array(z.enum(['title', 'description', 'kind', 'sourceUrl'])).min(1),
  }),
  'academic.item.deadline-changed': z.object({
    from: dueSchema,
    to: dueSchema,
    source: academicItemSourceSchema,
  }),
  'academic.item.progress-changed': z.object({
    progress: itemProgressSchema,
  }),
  'academic.item.archived': z.object({
    reason: z.string().max(500).optional(),
  }),
  'academic.task.created': z.object({
    title: z.string().min(1),
    itemId: z.string().min(1).optional(),
    estimateMinutes: z.number().int().min(5).max(1440),
    dueAt: isoDateTimeSchema.optional(),
    priority: z.number().int().min(0).max(3),
  }),
  'academic.task.estimate-changed': z.object({
    estimateMinutes: z.number().int().min(5).max(1440),
    previousEstimateMinutes: z.number().int().min(5).max(1440),
  }),
  'academic.task.completed': z.object({
    completedAt: isoDateTimeSchema,
  }),
  'academic.task.reopened': z.object({}),
  'academic.plan.accepted': z.object({
    range: rangeSchema,
    blocks: z.array(planBlockSchema),
    lockedBlocks: z.array(lockedBlockSchema),
    planner: plannerIdentitySchema,
    replanRequestId: z.string().min(1).optional(),
  }),
  'academic.plan.revised': z.object({
    blocks: z.array(planBlockSchema),
    lockedBlocks: z.array(lockedBlockSchema),
  }),
  'academic.plan.archived': z.object({
    reason: z.string().max(500).optional(),
  }),
} as const

export type EventType = keyof typeof EVENT_SCHEMAS
export type EventPayload<T extends EventType> = z.infer<(typeof EVENT_SCHEMAS)[T]>

export const EVENT = {
  CourseCreated: 'academic.course.created',
  CourseRenamed: 'academic.course.renamed',
  CourseArchived: 'academic.course.archived',
  AcademicItemDiscovered: 'academic.item.discovered',
  AcademicItemDetailsChanged: 'academic.item.details-changed',
  AcademicItemDeadlineChanged: 'academic.item.deadline-changed',
  AcademicItemProgressChanged: 'academic.item.progress-changed',
  AcademicItemArchived: 'academic.item.archived',
  StudyTaskCreated: 'academic.task.created',
  StudyTaskEstimateChanged: 'academic.task.estimate-changed',
  StudyTaskCompleted: 'academic.task.completed',
  StudyTaskReopened: 'academic.task.reopened',
  StudyPlanAccepted: 'academic.plan.accepted',
  StudyPlanRevised: 'academic.plan.revised',
  StudyPlanArchived: 'academic.plan.archived',
} as const satisfies Record<string, EventType>

export interface DomainEventEnvelope<T = unknown> {
  eventId: string
  streamId: string
  streamVersion: number
  globalPosition: number
  type: string
  schemaVersion: number
  occurredAt: string
  correlationId: string
  causationId?: string
  actor: Actor
  payload: T
  metadata?: Record<string, unknown>
}

export interface DomainEventOf<T extends EventType> extends DomainEventEnvelope<EventPayload<T>> {
  type: T
}

export type DomainEvent = { [K in EventType]: DomainEventOf<K> }[EventType]

export interface NewEventOf<T extends EventType> {
  type: T
  schemaVersion?: number
  payload: EventPayload<T>
}

export type NewEvent = { [K in EventType]: NewEventOf<K> }[EventType]

export const domainEventEnvelopeSchema = z.object({
  eventId: z.string().min(1),
  streamId: z.string().min(1),
  streamVersion: z.number().int().positive(),
  globalPosition: z.number().int().positive(),
  type: z.string().min(1),
  schemaVersion: z.number().int().positive(),
  occurredAt: isoDateTimeSchema,
  correlationId: z.string().min(1),
  causationId: z.string().min(1).optional(),
  actor: actorSchema,
  payload: z.unknown(),
  metadata: z.record(z.string(), z.unknown()).optional(),
})

export function isEventType(value: string): value is EventType {
  return value in EVENT_SCHEMAS
}

export function validateEventPayload(type: EventType, payload: unknown): EventPayload<EventType> {
  return EVENT_SCHEMAS[type].parse(payload) as EventPayload<EventType>
}

export function parseDomainEvent(input: unknown): DomainEvent {
  const envelope = domainEventEnvelopeSchema.parse(input)
  if (!isEventType(envelope.type)) {
    throw new Error(`Unknown event type: ${envelope.type}`)
  }
  const payload = validateEventPayload(envelope.type, envelope.payload)
  return { ...envelope, payload } as DomainEvent
}

export function aggregateKindForEvent(type: EventType): AggregateKind {
  if (type.startsWith('academic.course.')) return 'course'
  if (type.startsWith('academic.item.')) return 'academic-item'
  if (type.startsWith('academic.task.')) return 'study-task'
  return 'study-plan'
}

export interface EventUpcaster {
  readonly eventType: string
  readonly fromVersion: number
  readonly toVersion: number
  upcast(payload: unknown): unknown
}

export interface ReplanRequestedPayload {
  replanRequestId: string
  reason: 'items-changed' | 'tasks-changed' | 'availability-changed' | 'manual'
  range: Range
  correlationId: string
}
