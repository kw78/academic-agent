import type {
  AggregateKind,
  CommandErrorCode,
  DomainCommand,
  DomainEvent,
  NewEvent,
} from '@academic/contracts'

export interface DecisionContext {
  occurredAt: string
}

export type Decision =
  | { ok: true; events: NewEvent[] }
  | { ok: false; code: CommandErrorCode; message: string }

export interface AggregateHandler<S> {
  readonly kind: AggregateKind
  empty(aggregateId: string): S
  apply(state: S, event: DomainEvent): S
  decide(state: S, command: DomainCommand, context: DecisionContext): Decision
}

export function accepted(...events: NewEvent[]): Decision {
  return { ok: true, events }
}

export function rejected(code: CommandErrorCode, message: string): Decision {
  return { ok: false, code, message }
}
