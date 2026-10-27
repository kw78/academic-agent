import { COMMAND, EVENT } from '@academic/contracts'
import type { CourseState, DomainEvent } from '@academic/contracts'
import { accepted, rejected } from '../types.js'
import type { AggregateHandler } from '../types.js'

export const courseHandler: AggregateHandler<CourseState> = {
  kind: 'course',

  empty(aggregateId) {
    return {
      courseId: aggregateId,
      termId: '',
      code: '',
      title: '',
      archived: false,
      createdAt: '',
      updatedAt: '',
      version: 0,
    }
  },

  apply(state, event: DomainEvent): CourseState {
    switch (event.type) {
      case EVENT.CourseCreated:
        return {
          ...state,
          termId: event.payload.termId,
          code: event.payload.code,
          title: event.payload.title,
          source: event.payload.source,
          createdAt: event.occurredAt,
          updatedAt: event.occurredAt,
          version: event.streamVersion,
        }
      case EVENT.CourseRenamed:
        return {
          ...state,
          title: event.payload.title,
          updatedAt: event.occurredAt,
          version: event.streamVersion,
        }
      case EVENT.CourseArchived:
        return {
          ...state,
          archived: true,
          updatedAt: event.occurredAt,
          version: event.streamVersion,
        }
      default:
        throw new Error(`Unexpected course event: ${event.type}`)
    }
  },

  decide(state, command, context) {
    if (command.aggregateId !== state.courseId) {
      return rejected('VALIDATION', 'Command aggregateId does not match the course stream')
    }

    switch (command.type) {
      case COMMAND.CourseCreate:
        if (state.version > 0) {
          return rejected('CONFLICT', 'Course already exists')
        }
        return accepted({
          type: EVENT.CourseCreated,
          payload: {
            termId: command.payload.termId,
            code: command.payload.code,
            title: command.payload.title,
            source: command.payload.source,
          },
        })

      case COMMAND.CourseRename:
        if (state.version === 0) return rejected('NOT_FOUND', 'Course does not exist')
        if (state.archived) return rejected('VALIDATION', 'Archived course cannot be renamed')
        if (state.title === command.payload.title) return accepted()
        return accepted({
          type: EVENT.CourseRenamed,
          payload: {
            title: command.payload.title,
            previousTitle: state.title,
          },
        })

      case COMMAND.CourseArchive:
        if (state.version === 0) return rejected('NOT_FOUND', 'Course does not exist')
        if (state.archived) return accepted()
        return accepted({
          type: EVENT.CourseArchived,
          payload: command.payload.reason ? { reason: command.payload.reason } : {},
        })

      default:
        return rejected('VALIDATION', `Command ${command.type} is not valid for a course`)
    }
  },
}
