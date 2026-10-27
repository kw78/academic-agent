import type { CommandResult, DomainCommand } from './commands.js'
import type { DomainEvent } from './events.js'
import type { QueryApi } from './queries.js'

export interface CommandApi {
  execute(command: DomainCommand): Promise<CommandResult>
}

export interface EventLogReader {
  readAll(fromPosition: number, limit: number): Promise<DomainEvent[]>
  readStream(streamId: string, fromVersion?: number): Promise<DomainEvent[]>
  maxPosition(): Promise<number>
}

export interface ConsumerCheckpoint {
  consumerId: string
  lastPosition: number
  projectionVersion: number
  updatedAt: string
}

export interface CheckpointStore {
  getCheckpoint(consumerId: string): Promise<ConsumerCheckpoint | undefined>
  setCheckpoint(checkpoint: ConsumerCheckpoint): Promise<void>
  deleteCheckpoint(consumerId: string): Promise<void>
}

export interface Clock {
  now(): string
}

export interface IdGenerator {
  next(): string
}

export const systemClock: Clock = {
  now: () => new Date().toISOString(),
}

export type AcademicServices = {
  commands: CommandApi
  queries: QueryApi
  events: EventLogReader
  checkpoints: CheckpointStore
}
