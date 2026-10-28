import { COMMAND, dueEquals, EVENT } from '@academic/contracts'
import type {
  AcademicItemSnapshot,
  AcademicItemState,
  DomainEvent,
  NewEvent,
} from '@academic/contracts'
import { accepted, rejected } from '../types.js'
import type { AggregateHandler } from '../types.js'

type ChangedField = 'title' | 'description' | 'kind' | 'sourceUrl'

function changedDetails(state: AcademicItemState, snapshot: AcademicItemSnapshot): ChangedField[] {
  const changed: ChangedField[] = []
  if (state.title !== snapshot.title) changed.push('title')
  if ((state.description ?? '') !== (snapshot.description ?? '')) changed.push('description')
  if (state.kind !== snapshot.kind) changed.push('kind')
  if ((state.sourceUrl ?? '') !== (snapshot.sourceUrl ?? '')) changed.push('sourceUrl')
  return changed
}

export const academicItemHandler: AggregateHandler<AcademicItemState> = {
  kind: 'academic-item',

  empty(aggregateId) {
    return {
      itemId: aggregateId,
      courseId: '',
      kind: 'assignment',
      title: '',
      due: { kind: 'unknown' },
      source: {
        sourceId: '',
        sourceObservedAt: '',
        contentHash: '',
      },
      progress: { status: 'not-started', percent: 0 },
      archived: false,
      createdAt: '',
      updatedAt: '',
      version: 0,
    }
  },

  apply(state, event: DomainEvent): AcademicItemState {
    switch (event.type) {
      case EVENT.AcademicItemDiscovered:
        return {
          ...state,
          courseId: event.payload.courseId,
          kind: event.payload.kind,
          title: event.payload.title,
          description: event.payload.description,
          due: event.payload.due,
          sourceUrl: event.payload.sourceUrl,
          source: event.payload.source,
          progress: { status: 'not-started', percent: 0 },
          archived: false,
          createdAt: event.occurredAt,
          updatedAt: event.occurredAt,
          version: event.streamVersion,
        }
      case EVENT.AcademicItemDetailsChanged:
        return {
          ...state,
          kind: event.payload.snapshot.kind,
          title: event.payload.snapshot.title,
          description: event.payload.snapshot.description,
          sourceUrl: event.payload.snapshot.sourceUrl,
          source: event.payload.snapshot.source,
          updatedAt: event.occurredAt,
          version: event.streamVersion,
        }
      case EVENT.AcademicItemDeadlineChanged:
        return {
          ...state,
          due: event.payload.to,
          source: event.payload.source,
          updatedAt: event.occurredAt,
          version: event.streamVersion,
        }
      case EVENT.AcademicItemProgressChanged:
        return {
          ...state,
          progress: event.payload.progress,
          updatedAt: event.occurredAt,
          version: event.streamVersion,
        }
      case EVENT.AcademicItemArchived:
        return {
          ...state,
          archived: true,
          updatedAt: event.occurredAt,
          version: event.streamVersion,
        }
      case EVENT.AcademicItemRestored:
        return {
          ...state,
          archived: false,
          updatedAt: event.occurredAt,
          version: event.streamVersion,
        }
      case EVENT.AcademicItemCourseChanged:
        return {
          ...state,
          courseId: event.payload.to,
          updatedAt: event.occurredAt,
          version: event.streamVersion,
        }
      default:
        throw new Error(`Unexpected academic item event: ${event.type}`)
    }
  },

  decide(state, command, _context) {
    if (command.aggregateId !== state.itemId) {
      return rejected('VALIDATION', 'Command aggregateId does not match the academic item stream')
    }

    switch (command.type) {
      case COMMAND.AcademicItemDiscover:
        if (state.version > 0) {
          return rejected('CONFLICT', 'Academic item already exists')
        }
        return accepted({
          type: EVENT.AcademicItemDiscovered,
          payload: command.payload,
        })

      case COMMAND.AcademicItemSync: {
        if (state.version === 0) return rejected('NOT_FOUND', 'Academic item does not exist')
        if (state.archived) {
          return rejected('VALIDATION', 'Archived academic item cannot be updated by sync')
        }
        if (command.payload.courseId !== state.courseId) {
          return rejected('VALIDATION', 'Sync must not move an item to a different course')
        }

        const details = changedDetails(state, command.payload)
        const deadlineChanged = !dueEquals(state.due, command.payload.due)
        if (details.length === 0 && !deadlineChanged) return accepted()

        const events: NewEvent[] = []
        if (details.length > 0) {
          events.push({
            type: EVENT.AcademicItemDetailsChanged,
            payload: {
              snapshot: command.payload,
              changedFields: details,
            },
          })
        }
        if (deadlineChanged) {
          events.push({
            type: EVENT.AcademicItemDeadlineChanged,
            payload: {
              from: state.due,
              to: command.payload.due,
              source: command.payload.source,
            },
          })
        }
        return accepted(...events)
      }

      case COMMAND.AcademicItemSetProgress: {
        if (state.version === 0) return rejected('NOT_FOUND', 'Academic item does not exist')
        if (state.archived) {
          return rejected('VALIDATION', 'Archived academic item cannot be updated')
        }
        const next = command.payload.progress
        const current = state.progress
        if (
          current.status === next.status &&
          current.percent === next.percent &&
          (current.note ?? '') === (next.note ?? '')
        ) {
          return accepted()
        }
        return accepted({
          type: EVENT.AcademicItemProgressChanged,
          payload: { progress: next },
        })
      }

      case COMMAND.AcademicItemReassignCourse: {
        if (state.version === 0) return rejected('NOT_FOUND', 'Academic item does not exist')
        if (state.courseId === command.payload.courseId) return accepted()
        return accepted({
          type: EVENT.AcademicItemCourseChanged,
          payload: { from: state.courseId, to: command.payload.courseId },
        })
      }

      case COMMAND.AcademicItemArchive:
        if (state.version === 0) return rejected('NOT_FOUND', 'Academic item does not exist')
        if (state.archived) return accepted()
        return accepted({
          type: EVENT.AcademicItemArchived,
          payload: command.payload.reason ? { reason: command.payload.reason } : {},
        })

      case COMMAND.AcademicItemRestore:
        if (state.version === 0) return rejected('NOT_FOUND', 'Academic item does not exist')
        if (!state.archived) return accepted()
        return accepted({ type: EVENT.AcademicItemRestored, payload: {} })

      default:
        return rejected(
          'VALIDATION',
          `Command ${command.type} is not valid for an academic item`,
        )
    }
  },
}
