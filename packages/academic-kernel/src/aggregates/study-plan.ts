import { COMMAND, EVENT } from '@academic/contracts'
import type {
  DomainEvent,
  LockedBlock,
  PlanBlock,
  Range,
  StudyPlanState,
  TimeBlock,
} from '@academic/contracts'
import { accepted, rejected } from '../types.js'
import type { AggregateHandler } from '../types.js'

function overlaps(left: TimeBlock, right: TimeBlock): boolean {
  return Date.parse(left.start) < Date.parse(right.end) && Date.parse(right.start) < Date.parse(left.end)
}

function sortByStart<T extends TimeBlock>(blocks: readonly T[]): T[] {
  return [...blocks].sort(
    (left, right) =>
      Date.parse(left.start) - Date.parse(right.start) ||
      Date.parse(left.end) - Date.parse(right.end),
  )
}

function validatePlan(
  range: Range,
  blocks: readonly PlanBlock[],
  lockedBlocks: readonly LockedBlock[],
): string | undefined {
  const rangeStart = Date.parse(range.start)
  const rangeEnd = Date.parse(range.end)
  for (const block of blocks) {
    if (Date.parse(block.start) < rangeStart || Date.parse(block.end) > rangeEnd) {
      return 'Plan block falls outside the plan range'
    }
  }
  for (let index = 0; index < blocks.length; index += 1) {
    for (let other = index + 1; other < blocks.length; other += 1) {
      if (overlaps(blocks[index]!, blocks[other]!)) {
        return 'Plan blocks overlap'
      }
    }
  }
  for (const block of blocks) {
    for (const locked of lockedBlocks) {
      if (overlaps(block, locked)) {
        return 'Plan block overlaps a locked time block'
      }
    }
  }
  for (let index = 0; index < lockedBlocks.length; index += 1) {
    for (let other = index + 1; other < lockedBlocks.length; other += 1) {
      if (overlaps(lockedBlocks[index]!, lockedBlocks[other]!)) {
        return 'Locked time blocks overlap'
      }
    }
  }
  return undefined
}

export const studyPlanHandler: AggregateHandler<StudyPlanState> = {
  kind: 'study-plan',

  empty(aggregateId) {
    return {
      planId: aggregateId,
      status: 'active',
      range: { start: '1970-01-01T00:00:00.000Z', end: '1970-01-01T00:00:00.000Z' },
      blocks: [],
      lockedBlocks: [],
      planner: { id: '', version: '' },
      acceptedAt: '',
      updatedAt: '',
      version: 0,
    }
  },

  apply(state, event: DomainEvent): StudyPlanState {
    switch (event.type) {
      case EVENT.StudyPlanAccepted:
        return {
          ...state,
          status: 'active',
          range: event.payload.range,
          blocks: event.payload.blocks,
          lockedBlocks: event.payload.lockedBlocks,
          planner: event.payload.planner,
          replanRequestId: event.payload.replanRequestId,
          acceptedAt: event.occurredAt,
          updatedAt: event.occurredAt,
          version: event.streamVersion,
        }
      case EVENT.StudyPlanRevised:
        return {
          ...state,
          blocks: event.payload.blocks,
          lockedBlocks: event.payload.lockedBlocks,
          updatedAt: event.occurredAt,
          version: event.streamVersion,
        }
      case EVENT.StudyPlanArchived:
        return {
          ...state,
          status: 'archived',
          updatedAt: event.occurredAt,
          version: event.streamVersion,
        }
      default:
        throw new Error(`Unexpected study plan event: ${event.type}`)
    }
  },

  decide(state, command, _context) {
    if (command.aggregateId !== state.planId) {
      return rejected('VALIDATION', 'Command aggregateId does not match the study plan stream')
    }

    switch (command.type) {
      case COMMAND.StudyPlanAccept: {
        if (state.version > 0) return rejected('CONFLICT', 'Study plan already exists')
        const lockedBlocks = sortByStart(command.payload.lockedBlocks ?? [])
        const blocks = sortByStart(command.payload.blocks)
        const problem = validatePlan(command.payload.range, blocks, lockedBlocks)
        if (problem) return rejected('VALIDATION', problem)
        return accepted({
          type: EVENT.StudyPlanAccepted,
          payload: {
            range: command.payload.range,
            blocks,
            lockedBlocks,
            planner: command.payload.planner,
            ...(command.payload.replanRequestId
              ? { replanRequestId: command.payload.replanRequestId }
              : {}),
          },
        })
      }

      case COMMAND.StudyPlanRevise: {
        if (state.version === 0) return rejected('NOT_FOUND', 'Study plan does not exist')
        if (state.status === 'archived') {
          return rejected('VALIDATION', 'Archived study plan cannot be revised')
        }
        const lockedBlocks = sortByStart(command.payload.lockedBlocks ?? state.lockedBlocks)
        const blocks = sortByStart(command.payload.blocks)
        const problem = validatePlan(state.range, blocks, lockedBlocks)
        if (problem) return rejected('VALIDATION', problem)
        if (
          JSON.stringify(blocks) === JSON.stringify(state.blocks) &&
          JSON.stringify(lockedBlocks) === JSON.stringify(state.lockedBlocks)
        ) {
          return accepted()
        }
        return accepted({
          type: EVENT.StudyPlanRevised,
          payload: { blocks, lockedBlocks },
        })
      }

      case COMMAND.StudyPlanArchive:
        if (state.version === 0) return rejected('NOT_FOUND', 'Study plan does not exist')
        if (state.status === 'archived') return accepted()
        return accepted({
          type: EVENT.StudyPlanArchived,
          payload: command.payload.reason ? { reason: command.payload.reason } : {},
        })

      default:
        return rejected('VALIDATION', `Command ${command.type} is not valid for a study plan`)
    }
  },
}
