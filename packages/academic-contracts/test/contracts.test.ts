import { describe, expect, it } from 'vitest'
import {
  COMMAND_SCHEMAS,
  digestCommand,
  dueSchema,
  EVENT_SCHEMAS,
  parseCommand,
  parseDomainEvent,
  validateEventPayload,
} from '@academic/contracts'

const courseCreate = {
  commandId: 'command-1',
  type: 'academic.course.create.v1',
  aggregateId: 'course-1',
  actor: { kind: 'user', id: 'user-1' },
  correlationId: 'correlation-1',
  payload: {
    termId: '2026-fall',
    code: 'CS101',
    title: 'Introduction to Computer Science',
  },
}

describe('command contracts', () => {
  it('parses a known command and validates its payload', () => {
    const command = parseCommand(courseCreate)
    expect(command.type).toBe('academic.course.create.v1')
    expect(command.payload).toMatchObject({ title: 'Introduction to Computer Science' })
  })

  it('rejects unknown types and malformed payloads', () => {
    expect(() => parseCommand({ ...courseCreate, type: 'academic.unknown.v1' })).toThrow(
      /Unknown command type/,
    )
    expect(() =>
      parseCommand({ ...courseCreate, payload: { termId: '2026-fall' } }),
    ).toThrow()
  })

  it('rejects a non-user actor kind', () => {
    expect(() =>
      parseCommand({ ...courseCreate, actor: { kind: 'robot', id: 'x' } }),
    ).toThrow()
  })

  it('digests business content but ignores correlation and command ids', () => {
    const command = parseCommand(courseCreate)
    const retried = parseCommand({
      ...courseCreate,
      commandId: 'command-2',
      correlationId: 'correlation-2',
    })
    const changed = parseCommand({
      ...courseCreate,
      payload: { ...courseCreate.payload, title: 'Discrete Mathematics' },
    })
    expect(digestCommand(retried)).toBe(digestCommand(command))
    expect(digestCommand(changed)).not.toBe(digestCommand(command))
  })

  it('declares a runtime schema for every command type', () => {
    for (const [type, schema] of Object.entries(COMMAND_SCHEMAS)) {
      expect(type).toMatch(/^academic\.[a-z-]+\.[a-z-]+\.v1$/)
      expect(schema).toBeDefined()
    }
  })
})

describe('event contracts', () => {
  it('validates known event payloads and rejects unknown ones', () => {
    const payload = validateEventPayload('academic.course.created', {
      termId: '2026-fall',
      code: 'CS101',
      title: 'Introduction to Computer Science',
    })
    expect(payload).toMatchObject({ code: 'CS101' })

    expect(() =>
      validateEventPayload('academic.course.created', { title: 'missing fields' }),
    ).toThrow()
    expect(() => parseDomainEvent({ type: 'academic.nope', payload: {} })).toThrow()
  })

  it('keeps date-only due values distinct from instants', () => {
    expect(dueSchema.parse({ kind: 'local-date', date: '2026-11-03' })).toEqual({
      kind: 'local-date',
      date: '2026-11-03',
    })
    expect(() => dueSchema.parse({ kind: 'instant', utc: 'not-a-date', zone: 'UTC' })).toThrow()
  })

  it('declares a runtime schema for every event type', () => {
    for (const [type, schema] of Object.entries(EVENT_SCHEMAS)) {
      expect(type).toMatch(/^academic\.[a-z-]+\.[a-z-]+$/)
      expect(schema).toBeDefined()
    }
  })
})
