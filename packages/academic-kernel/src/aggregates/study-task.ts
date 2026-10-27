import { COMMAND, EVENT } from '@academic/contracts'
import type { DomainEvent, StudyTaskState } from '@academic/contracts'
import { accepted, rejected } from '../types.js'
import type { AggregateHandler } from '../types.js'

export const studyTaskHandler: AggregateHandler<StudyTaskState> = {
  kind: 'study-task',

  empty(aggregateId) {
    return {
      taskId: aggregateId,
      title: '',
      estimateMinutes: 0,
      priority: 0,
      status: 'active',
      createdAt: '',
      updatedAt: '',
      version: 0,
    }
  },

  apply(state, event: DomainEvent): StudyTaskState {
    switch (event.type) {
      case EVENT.StudyTaskCreated:
        return {
          ...state,
          title: event.payload.title,
          itemId: event.payload.itemId,
          estimateMinutes: event.payload.estimateMinutes,
          dueAt: event.payload.dueAt,
          priority: event.payload.priority,
          status: 'active',
          completedAt: undefined,
          createdAt: event.occurredAt,
          updatedAt: event.occurredAt,
          version: event.streamVersion,
        }
      case EVENT.StudyTaskEstimateChanged:
        return {
          ...state,
          estimateMinutes: event.payload.estimateMinutes,
          updatedAt: event.occurredAt,
          version: event.streamVersion,
        }
      case EVENT.StudyTaskCompleted:
        return {
          ...state,
          status: 'completed',
          completedAt: event.payload.completedAt,
          updatedAt: event.occurredAt,
          version: event.streamVersion,
        }
      case EVENT.StudyTaskReopened:
        return {
          ...state,
          status: 'active',
          completedAt: undefined,
          updatedAt: event.occurredAt,
          version: event.streamVersion,
        }
      default:
        throw new Error(`Unexpected study task event: ${event.type}`)
    }
  },

  decide(state, command, context) {
    if (command.aggregateId !== state.taskId) {
      return rejected('VALIDATION', 'Command aggregateId does not match the study task stream')
    }

    switch (command.type) {
      case COMMAND.StudyTaskCreate:
        if (state.version > 0) return rejected('CONFLICT', 'Study task already exists')
        return accepted({
          type: EVENT.StudyTaskCreated,
          payload: {
            title: command.payload.title,
            ...(command.payload.itemId ? { itemId: command.payload.itemId } : {}),
            estimateMinutes: command.payload.estimateMinutes,
            ...(command.payload.dueAt ? { dueAt: command.payload.dueAt } : {}),
            priority: command.payload.priority ?? 0,
          },
        })

      case COMMAND.StudyTaskChangeEstimate:
        if (state.version === 0) return rejected('NOT_FOUND', 'Study task does not exist')
        if (state.status === 'completed') {
          return rejected('VALIDATION', 'Completed study task cannot change its estimate')
        }
        if (state.estimateMinutes === command.payload.estimateMinutes) return accepted()
        return accepted({
          type: EVENT.StudyTaskEstimateChanged,
          payload: {
            estimateMinutes: command.payload.estimateMinutes,
            previousEstimateMinutes: state.estimateMinutes,
          },
        })

      case COMMAND.StudyTaskComplete:
        if (state.version === 0) return rejected('NOT_FOUND', 'Study task does not exist')
        if (state.status === 'completed') return accepted()
        return accepted({
          type: EVENT.StudyTaskCompleted,
          payload: { completedAt: context.occurredAt },
        })

      case COMMAND.StudyTaskReopen:
        if (state.version === 0) return rejected('NOT_FOUND', 'Study task does not exist')
        if (state.status === 'active') return accepted()
        return accepted({ type: EVENT.StudyTaskReopened, payload: {} })

      default:
        return rejected('VALIDATION', `Command ${command.type} is not valid for a study task`)
    }
  },
}
