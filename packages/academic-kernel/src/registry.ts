import { COMMAND } from '@academic/contracts'
import type {
  AggregateKind,
  AcademicItemState,
  CommandType,
  CourseState,
  DomainCommand,
  DomainEvent,
  StudyPlanState,
  StudyTaskState,
} from '@academic/contracts'
import { academicItemHandler } from './aggregates/academic-item.js'
import { courseHandler } from './aggregates/course.js'
import { studyPlanHandler } from './aggregates/study-plan.js'
import { studyTaskHandler } from './aggregates/study-task.js'
import type { AggregateHandler, Decision, DecisionContext } from './types.js'

export type AnyAggregateState =
  | CourseState
  | AcademicItemState
  | StudyTaskState
  | StudyPlanState

export interface RegisteredHandler {
  readonly kind: AggregateKind
  empty(aggregateId: string): AnyAggregateState
  apply(state: AnyAggregateState, event: DomainEvent): AnyAggregateState
  decide(
    state: AnyAggregateState,
    command: DomainCommand,
    context: DecisionContext,
  ): Decision
}

function asRegistered<S extends AnyAggregateState>(
  handler: AggregateHandler<S>,
): RegisteredHandler {
  return {
    kind: handler.kind,
    empty: (aggregateId) => handler.empty(aggregateId),
    apply: (state, event) => handler.apply(state as S, event),
    decide: (state, command, context) => handler.decide(state as S, command, context),
  }
}

const course = asRegistered(courseHandler)
const academicItem = asRegistered(academicItemHandler)
const studyTask = asRegistered(studyTaskHandler)
const studyPlan = asRegistered(studyPlanHandler)

const HANDLERS_BY_COMMAND: Record<CommandType, RegisteredHandler> = {
  [COMMAND.CourseCreate]: course,
  [COMMAND.CourseRename]: course,
  [COMMAND.CourseUpdate]: course,
  [COMMAND.CourseArchive]: course,
  [COMMAND.CourseRestore]: course,
  [COMMAND.CourseDelete]: course,
  [COMMAND.AcademicItemDiscover]: academicItem,
  [COMMAND.AcademicItemSync]: academicItem,
  [COMMAND.AcademicItemSetProgress]: academicItem,
  [COMMAND.AcademicItemArchive]: academicItem,
  [COMMAND.AcademicItemRestore]: academicItem,
  [COMMAND.StudyTaskCreate]: studyTask,
  [COMMAND.StudyTaskChangeEstimate]: studyTask,
  [COMMAND.StudyTaskChangeDetails]: studyTask,
  [COMMAND.StudyTaskArchive]: studyTask,
  [COMMAND.StudyTaskRestore]: studyTask,
  [COMMAND.StudyTaskComplete]: studyTask,
  [COMMAND.StudyTaskReopen]: studyTask,
  [COMMAND.StudyPlanAccept]: studyPlan,
  [COMMAND.StudyPlanRevise]: studyPlan,
  [COMMAND.StudyPlanArchive]: studyPlan,
}

const HANDLERS_BY_KIND: Record<AggregateKind, RegisteredHandler> = {
  course,
  'academic-item': academicItem,
  'study-task': studyTask,
  'study-plan': studyPlan,
}

export function handlerForCommand(type: CommandType): RegisteredHandler {
  return HANDLERS_BY_COMMAND[type]
}

export function handlerForKind(kind: AggregateKind): RegisteredHandler {
  return HANDLERS_BY_KIND[kind]
}

export function aggregateKindForCommand(type: CommandType): AggregateKind {
  return HANDLERS_BY_COMMAND[type].kind
}

export function replayAggregate(
  handler: RegisteredHandler,
  aggregateId: string,
  events: readonly DomainEvent[],
): AnyAggregateState {
  let state = handler.empty(aggregateId)
  for (const event of events) {
    if (event.streamVersion !== state.version + 1) {
      throw new Error(
        `Event stream ${event.streamId} is not contiguous: expected version ${state.version + 1}, got ${event.streamVersion}`,
      )
    }
    state = handler.apply(state, event)
  }
  return state
}

export function decideCommand(
  handler: RegisteredHandler,
  state: AnyAggregateState,
  command: DomainCommand,
  context: DecisionContext,
): Decision {
  return handler.decide(state, command, context)
}
