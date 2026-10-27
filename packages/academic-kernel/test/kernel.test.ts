import { describe, expect, it } from 'vitest'
import {
  COMMAND,
  parseCommand,
  streamIdFor,
  type AcademicItemSnapshot,
  type DomainCommand,
  type DomainEvent,
  type NewEvent,
} from '@academic/contracts'
import {
  aggregateKindForCommand,
  handlerForCommand,
  replayAggregate,
  type AnyAggregateState,
  type DecisionContext,
} from '@academic/kernel'

const context: DecisionContext = { occurredAt: '2026-10-27T10:00:00.000Z' }
let eventCounter = 0

function command(
  type: string,
  aggregateId: string,
  payload: Record<string, unknown>,
): DomainCommand {
  return parseCommand({
    commandId: `command-${++eventCounter}`,
    type,
    aggregateId,
    actor: { kind: 'user', id: 'user-1' },
    correlationId: 'correlation-1',
    payload,
  })
}

function envelope(
  streamId: string,
  streamVersion: number,
  event: NewEvent,
  occurredAt = context.occurredAt,
): DomainEvent {
  return {
    eventId: `event-${++eventCounter}`,
    streamId,
    streamVersion,
    globalPosition: eventCounter,
    type: event.type,
    schemaVersion: 1,
    occurredAt,
    correlationId: 'correlation-1',
    actor: { kind: 'system', id: 'test' },
    payload: event.payload,
  } as DomainEvent
}

function decideAndApply(
  cmd: DomainCommand,
  state: AnyAggregateState,
  kind: 'course' | 'academic-item' | 'study-task' | 'study-plan',
): AnyAggregateState {
  const handler = handlerForCommand(cmd.type)
  expect(handler.kind).toBe(kind)
  const decision = handler.decide(state, cmd, context)
  if (!decision.ok) throw new Error(`${decision.code}: ${decision.message}`)
  let next = state
  let version = state.version
  for (const event of decision.events) {
    version += 1
    next = handler.apply(next, envelope(streamIdFor(kind, cmd.aggregateId), version, event))
  }
  return next
}

const snapshot: AcademicItemSnapshot = {
  courseId: 'course-1',
  kind: 'assignment',
  title: 'Problem Set 1',
  due: { kind: 'instant', utc: '2026-11-01T15:00:00.000Z', zone: 'Asia/Shanghai' },
  source: {
    sourceId: 'fixture-lms',
    externalItemId: 'assignment-1',
    sourceObservedAt: '2026-10-27T10:00:00.000Z',
    contentHash: 'hash-1',
  },
}

describe('course aggregate', () => {
  it('creates, renames and archives with no-op protection', () => {
    const handler = handlerForCommand(COMMAND.CourseCreate)
    let state = handler.empty('course-1')

    state = decideAndApply(
      command(COMMAND.CourseCreate, 'course-1', {
        termId: '2026-fall',
        code: 'CS101',
        title: 'Computer Science',
      }),
      state,
      'course',
    )
    expect(state).toMatchObject({ title: 'Computer Science', version: 1, archived: false })

    const renameDecision = handler.decide(
      state,
      command(COMMAND.CourseRename, 'course-1', { title: 'Computer Science' }),
      context,
    )
    expect(renameDecision).toEqual({ ok: true, events: [] })

    state = decideAndApply(
      command(COMMAND.CourseArchive, 'course-1', {}),
      state,
      'course',
    )
    expect(state).toMatchObject({ archived: true, version: 2 })

    const renameArchived = handler.decide(
      state,
      command(COMMAND.CourseRename, 'course-1', { title: 'New' }),
      context,
    )
    expect(renameArchived).toMatchObject({ ok: false, code: 'VALIDATION' })
  })

  it('replays a stream to the same state', () => {
    const handler = handlerForCommand(COMMAND.CourseCreate)
    const events = [
      envelope(
        'course/course-1',
        1,
        {
          type: 'academic.course.created',
          payload: { termId: '2026-fall', code: 'CS101', title: 'Computer Science' },
        },
        '2026-10-27T09:00:00.000Z',
      ),
      envelope(
        'course/course-1',
        2,
        { type: 'academic.course.renamed', payload: { title: 'CS', previousTitle: 'Computer Science' } },
        '2026-10-27T10:00:00.000Z',
      ),
    ]
    const state = replayAggregate(handler, 'course-1', events)
    expect(state).toMatchObject({ title: 'CS', version: 2 })
  })
})

describe('academic item aggregate', () => {
  it('does not emit events for an unchanged sync and preserves local progress', () => {
    const handler = handlerForCommand(COMMAND.AcademicItemDiscover)
    let state = handler.empty('item-1')
    state = decideAndApply(
      command(COMMAND.AcademicItemDiscover, 'item-1', snapshot),
      state,
      'academic-item',
    )
    state = decideAndApply(
      command(COMMAND.AcademicItemSetProgress, 'item-1', {
        progress: { status: 'in-progress', percent: 40 },
      }),
      state,
      'academic-item',
    )
    expect(state).toMatchObject({ progress: { status: 'in-progress', percent: 40 }, version: 2 })

    const unchanged = handler.decide(
      state,
      command(COMMAND.AcademicItemSync, 'item-1', {
        ...snapshot,
        source: {
          ...snapshot.source,
          sourceObservedAt: '2026-10-28T10:00:00.000Z',
          contentHash: 'hash-2',
        },
      }),
      context,
    )
    expect(unchanged).toEqual({ ok: true, events: [] })
  })

  it('emits details and deadline events separately and keeps progress', () => {
    const handler = handlerForCommand(COMMAND.AcademicItemDiscover)
    let state = handler.empty('item-1')
    state = decideAndApply(
      command(COMMAND.AcademicItemDiscover, 'item-1', snapshot),
      state,
      'academic-item',
    )
    state = decideAndApply(
      command(COMMAND.AcademicItemSetProgress, 'item-1', {
        progress: { status: 'done', percent: 100 },
      }),
      state,
      'academic-item',
    )

    state = decideAndApply(
      command(COMMAND.AcademicItemSync, 'item-1', {
        ...snapshot,
        title: 'Problem Set 1 (revised)',
        due: { kind: 'instant', utc: '2026-11-05T15:00:00.000Z', zone: 'Asia/Shanghai' },
        source: { ...snapshot.source, contentHash: 'hash-3' },
      }),
      state,
      'academic-item',
    )

    expect(state).toMatchObject({
      title: 'Problem Set 1 (revised)',
      due: { kind: 'instant', utc: '2026-11-05T15:00:00.000Z' },
      progress: { status: 'done', percent: 100 },
      version: 4,
    })
  })

  it('rejects sync for a non-existent or archived item', () => {
    const handler = handlerForCommand(COMMAND.AcademicItemSync)
    const empty = handler.empty('missing')
    expect(
      handler.decide(empty, command(COMMAND.AcademicItemSync, 'missing', snapshot), context),
    ).toMatchObject({ ok: false, code: 'NOT_FOUND' })

    const discover = handlerForCommand(COMMAND.AcademicItemDiscover)
    let state = discover.empty('item-1')
    state = decideAndApply(
      command(COMMAND.AcademicItemDiscover, 'item-1', snapshot),
      state,
      'academic-item',
    )
    state = decideAndApply(
      command(COMMAND.AcademicItemArchive, 'item-1', {}),
      state,
      'academic-item',
    )
    expect(
      handler.decide(state, command(COMMAND.AcademicItemSync, 'item-1', snapshot), context),
    ).toMatchObject({ ok: false, code: 'VALIDATION' })
  })
})

describe('study task aggregate', () => {
  it('moves between active and completed states', () => {
    const handler = handlerForCommand(COMMAND.StudyTaskCreate)
    let state = handler.empty('task-1')
    state = decideAndApply(
      command(COMMAND.StudyTaskCreate, 'task-1', {
        title: 'Read chapter 2',
        estimateMinutes: 60,
        priority: 2,
      }),
      state,
      'study-task',
    )
    expect(state).toMatchObject({ status: 'active', priority: 2, version: 1 })

    state = decideAndApply(
      command(COMMAND.StudyTaskComplete, 'task-1', {}),
      state,
      'study-task',
    )
    expect(state).toMatchObject({
      status: 'completed',
      completedAt: '2026-10-27T10:00:00.000Z',
    })

    const repeat = handler.decide(
      state,
      command(COMMAND.StudyTaskComplete, 'task-1', {}),
      context,
    )
    expect(repeat).toEqual({ ok: true, events: [] })

    state = decideAndApply(
      command(COMMAND.StudyTaskReopen, 'task-1', {}),
      state,
      'study-task',
    )
    expect(state).toMatchObject({ status: 'active', version: 3 })
  })
})

describe('study plan aggregate', () => {
  const range = {
    start: '2026-11-01T00:00:00.000Z',
    end: '2026-11-02T00:00:00.000Z',
  }

  it('rejects overlapping blocks and blocks over locked time', () => {
    const handler = handlerForCommand(COMMAND.StudyPlanAccept)
    const empty = handler.empty('plan-1')
    const overlapping = handler.decide(
      empty,
      command(COMMAND.StudyPlanAccept, 'plan-1', {
        range,
        blocks: [
          { taskId: 'a', start: '2026-11-01T09:00:00.000Z', end: '2026-11-01T10:00:00.000Z' },
          { taskId: 'b', start: '2026-11-01T09:30:00.000Z', end: '2026-11-01T10:30:00.000Z' },
        ],
        planner: { id: 'basic', version: '1' },
      }),
      context,
    )
    expect(overlapping).toMatchObject({ ok: false, code: 'VALIDATION' })

    const overLocked = handler.decide(
      empty,
      command(COMMAND.StudyPlanAccept, 'plan-1', {
        range,
        blocks: [
          { taskId: 'a', start: '2026-11-01T09:00:00.000Z', end: '2026-11-01T10:00:00.000Z' },
        ],
        lockedBlocks: [
          { id: 'lock-1', start: '2026-11-01T09:30:00.000Z', end: '2026-11-01T11:00:00.000Z' },
        ],
        planner: { id: 'basic', version: '1' },
      }),
      context,
    )
    expect(overLocked).toMatchObject({ ok: false, code: 'VALIDATION' })
  })

  it('accepts, revises and archives a valid plan', () => {
    const handler = handlerForCommand(COMMAND.StudyPlanAccept)
    let state = handler.empty('plan-1')
    state = decideAndApply(
      command(COMMAND.StudyPlanAccept, 'plan-1', {
        range,
        blocks: [
          { taskId: 'a', start: '2026-11-01T10:00:00.000Z', end: '2026-11-01T11:00:00.000Z' },
        ],
        planner: { id: 'basic', version: '1' },
      }),
      state,
      'study-plan',
    )
    expect(state).toMatchObject({ status: 'active', version: 1 })

    const same = handler.decide(
      state,
      command(COMMAND.StudyPlanRevise, 'plan-1', {
        blocks: [
          { taskId: 'a', start: '2026-11-01T10:00:00.000Z', end: '2026-11-01T11:00:00.000Z' },
        ],
      }),
      context,
    )
    expect(same).toEqual({ ok: true, events: [] })

    state = decideAndApply(
      command(COMMAND.StudyPlanArchive, 'plan-1', { reason: 'new plan' }),
      state,
      'study-plan',
    )
    expect(state).toMatchObject({ status: 'archived', version: 2 })
  })
})

describe('command routing', () => {
  it('maps every command to the expected aggregate kind', () => {
    expect(aggregateKindForCommand(COMMAND.CourseCreate)).toBe('course')
    expect(aggregateKindForCommand(COMMAND.AcademicItemSync)).toBe('academic-item')
    expect(aggregateKindForCommand(COMMAND.StudyTaskComplete)).toBe('study-task')
    expect(aggregateKindForCommand(COMMAND.StudyPlanRevise)).toBe('study-plan')
  })
})
