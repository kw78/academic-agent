import type { DatabaseSync } from 'node:sqlite'
import {
  digestCommand,
  parseCommand,
  streamIdFor,
  type Clock,
  type CommandApi,
  type CommandResult,
  type DomainCommand,
  type DomainEvent,
} from '@academic/contracts'
import {
  aggregateKindForCommand,
  handlerForCommand,
  replayAggregate,
} from '@academic/kernel'
import type { CoreProjection } from './core-projection.js'
import { inTransaction, type SqlRow } from './database.js'
import { SqliteEventLog, StreamVersionConflictError } from './event-store.js'

export interface CommandBusDependencies {
  db: DatabaseSync
  events: SqliteEventLog
  projection: CoreProjection
  clock: Clock
  onAppended?: () => void
}

export class SqliteCommandBus implements CommandApi {
  readonly #db: DatabaseSync
  readonly #events: SqliteEventLog
  readonly #projection: CoreProjection
  readonly #clock: Clock
  readonly #onAppended?: () => void

  constructor(dependencies: CommandBusDependencies) {
    this.#db = dependencies.db
    this.#events = dependencies.events
    this.#projection = dependencies.projection
    this.#clock = dependencies.clock
    this.#onAppended = dependencies.onAppended
  }

  async execute(raw: DomainCommand): Promise<CommandResult> {
    let command: DomainCommand
    try {
      command = parseCommand(raw)
    } catch (error) {
      return {
        ok: false,
        code: 'VALIDATION',
        message: error instanceof Error ? error.message : String(error),
      }
    }

    const kind = aggregateKindForCommand(command.type)
    const streamId = streamIdFor(kind, command.aggregateId)
    const commandHash = digestCommand(command)
    const occurredAt = this.#clock.now()

    let result: CommandResult
    try {
      result = inTransaction(this.#db, () => {
        const receipt = this.#readReceipt(command.commandId)
        if (receipt) {
          if (receipt.commandHash !== commandHash) {
            return {
              ok: false,
              code: 'CONFLICT',
              message: 'commandId was reused with different command content',
            } satisfies CommandResult
          }
          return JSON.parse(receipt.resultJson) as CommandResult
        }

        const handler = handlerForCommand(command.type)
        const history = this.#events.readStreamSync(streamId)
        const state = replayAggregate(handler, command.aggregateId, history)

        if (
          command.expectedVersion !== undefined &&
          state.version !== command.expectedVersion
        ) {
          return {
            ok: false,
            code: 'CONFLICT',
            message: `Expected stream version ${command.expectedVersion}, current version is ${state.version}`,
          } satisfies CommandResult
        }

        const decision = handler.decide(state, command, { occurredAt })
        if (!decision.ok) return decision

        const appended: DomainEvent[] = this.#events.append(
          command,
          streamId,
          state.version,
          decision.events,
          occurredAt,
        )

        let finalState = state
        for (const event of appended) {
          finalState = handler.apply(finalState, event)
        }
        if (appended.length > 0) {
          this.#projection.project(
            finalState,
            appended[appended.length - 1]!.globalPosition,
          )
        }

        const success: CommandResult = {
          ok: true,
          aggregateId: command.aggregateId,
          version: finalState.version,
          eventIds: appended.map((event) => event.eventId),
        }
        this.#writeReceipt(command.commandId, commandHash, success, occurredAt)
        return success
      })
    } catch (error) {
      if (error instanceof StreamVersionConflictError) {
        return { ok: false, code: 'CONFLICT', message: error.message }
      }
      return {
        ok: false,
        code: 'UNAVAILABLE',
        message: `Command could not be committed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      }
    }

    if (result.ok && result.eventIds.length > 0) {
      try {
        this.#onAppended?.()
      } catch {
        // Waking consumers is a hint, never part of commit correctness.
      }
    }
    return result
  }

  #readReceipt(
    commandId: string,
  ): { commandHash: string; resultJson: string } | undefined {
    const row = this.#db
      .prepare('SELECT command_hash, result_json FROM command_receipts WHERE command_id = ?')
      .get(commandId) as SqlRow | undefined
    if (!row) return undefined
    return {
      commandHash: String(row.command_hash),
      resultJson: String(row.result_json),
    }
  }

  #writeReceipt(
    commandId: string,
    commandHash: string,
    result: CommandResult,
    committedAt: string,
  ): void {
    this.#db
      .prepare(
        `INSERT INTO command_receipts (command_id, command_hash, result_json, committed_at)
         VALUES (?, ?, ?, ?)`,
      )
      .run(commandId, commandHash, JSON.stringify(result), committedAt)
  }
}
