import type { DatabaseSync } from 'node:sqlite'
import {
  CURRENT_EVENT_SCHEMA_VERSION,
  parseDomainEvent,
  validateEventPayload,
  type Clock,
  type DomainCommand,
  type DomainEvent,
  type EventLogReader,
  type EventUpcaster,
  type IdGenerator,
  type NewEvent,
} from '@academic/contracts'
import type { SqlRow } from './database.js'

export class StreamVersionConflictError extends Error {
  readonly streamId: string
  readonly expectedVersion: number
  readonly actualVersion: number

  constructor(streamId: string, expectedVersion: number, actualVersion: number) {
    super(
      `Stream ${streamId} is at version ${actualVersion}, expected ${expectedVersion}`,
    )
    this.name = 'StreamVersionConflictError'
    this.streamId = streamId
    this.expectedVersion = expectedVersion
    this.actualVersion = actualVersion
  }
}

export class SqliteEventLog implements EventLogReader {
  readonly #db: DatabaseSync
  readonly #clock: Clock
  readonly #ids: IdGenerator
  readonly #upcasters: EventUpcaster[]

  constructor(
    db: DatabaseSync,
    clock: Clock,
    ids: IdGenerator,
    upcasters: EventUpcaster[] = [],
  ) {
    this.#db = db
    this.#clock = clock
    this.#ids = ids
    this.#upcasters = upcasters
  }

  getStreamVersion(streamId: string): number {
    const row = this.#db
      .prepare('SELECT version FROM event_streams WHERE stream_id = ?')
      .get(streamId) as SqlRow | undefined
    return row ? Number(row.version) : 0
  }

  append(
    command: DomainCommand,
    streamId: string,
    expectedVersion: number,
    drafts: readonly NewEvent[],
    occurredAt = this.#clock.now(),
  ): DomainEvent[] {
    if (drafts.length === 0) return []
    const actualVersion = this.getStreamVersion(streamId)
    if (actualVersion !== expectedVersion) {
      throw new StreamVersionConflictError(streamId, expectedVersion, actualVersion)
    }
    const inserted: DomainEvent[] = []
    let streamVersion = actualVersion

    for (const draft of drafts) {
      streamVersion += 1
      const payload = validateEventPayload(draft.type, draft.payload)
      const schemaVersion = draft.schemaVersion ?? CURRENT_EVENT_SCHEMA_VERSION
      const eventId = this.#ids.next()
      const result = this.#db
        .prepare(
          `INSERT INTO domain_events (
             event_id, stream_id, stream_version, event_type, schema_version,
             occurred_at, correlation_id, causation_id, actor_json, payload_json
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          eventId,
          streamId,
          streamVersion,
          draft.type,
          schemaVersion,
          occurredAt,
          command.correlationId,
          command.commandId,
          JSON.stringify(command.actor),
          JSON.stringify(payload),
        )
      const globalPosition = Number(result.lastInsertRowid)
      inserted.push({
        eventId,
        streamId,
        streamVersion,
        globalPosition,
        type: draft.type,
        schemaVersion,
        occurredAt,
        correlationId: command.correlationId,
        causationId: command.commandId,
        actor: command.actor,
        payload,
      } as DomainEvent)
    }

    if (actualVersion === 0) {
      this.#db
        .prepare('INSERT INTO event_streams (stream_id, version) VALUES (?, ?)')
        .run(streamId, streamVersion)
    } else {
      const result = this.#db
        .prepare('UPDATE event_streams SET version = ? WHERE stream_id = ? AND version = ?')
        .run(streamVersion, streamId, actualVersion)
      if (Number(result.changes) !== 1) {
        throw new StreamVersionConflictError(streamId, expectedVersion, this.getStreamVersion(streamId))
      }
    }

    return inserted
  }

  async readAll(fromPosition: number, limit: number): Promise<DomainEvent[]> {
    return this.readAllSync(fromPosition, Math.max(1, Math.trunc(limit)))
  }

  readAllSync(fromPosition: number, limit = -1): DomainEvent[] {
    const rows = (
      limit > 0
        ? this.#db
            .prepare(
              `SELECT * FROM domain_events
               WHERE global_position > ?
               ORDER BY global_position ASC
               LIMIT ?`,
            )
            .all(fromPosition, limit)
        : this.#db
            .prepare(
              `SELECT * FROM domain_events
               WHERE global_position > ?
               ORDER BY global_position ASC`,
            )
            .all(fromPosition)
    ) as SqlRow[]
    return rows.map((row) => this.#toDomainEvent(row))
  }

  async readStream(streamId: string, fromVersion = 0): Promise<DomainEvent[]> {
    return this.readStreamSync(streamId, fromVersion)
  }

  readStreamSync(streamId: string, fromVersion = 0): DomainEvent[] {
    const rows = this.#db
      .prepare(
        `SELECT * FROM domain_events
         WHERE stream_id = ? AND stream_version > ?
         ORDER BY stream_version ASC`,
      )
      .all(streamId, fromVersion) as SqlRow[]
    return rows.map((row) => this.#toDomainEvent(row))
  }

  async maxPosition(): Promise<number> {
    const row = this.#db
      .prepare('SELECT COALESCE(MAX(global_position), 0) AS position FROM domain_events')
      .get() as SqlRow
    return Number(row.position)
  }

  maxPositionSync(): number {
    const row = this.#db
      .prepare('SELECT COALESCE(MAX(global_position), 0) AS position FROM domain_events')
      .get() as SqlRow
    return Number(row.position)
  }

  #toDomainEvent(row: SqlRow): DomainEvent {
    let schemaVersion = Number(row.schema_version)
    let payload: unknown = JSON.parse(String(row.payload_json))
    for (;;) {
      const upcaster = this.#upcasters.find(
        (candidate) =>
          candidate.eventType === String(row.event_type) &&
          candidate.fromVersion === schemaVersion,
      )
      if (!upcaster) break
      payload = upcaster.upcast(payload)
      schemaVersion = upcaster.toVersion
    }

    return parseDomainEvent({
      eventId: String(row.event_id),
      streamId: String(row.stream_id),
      streamVersion: Number(row.stream_version),
      globalPosition: Number(row.global_position),
      type: String(row.event_type),
      schemaVersion,
      occurredAt: String(row.occurred_at),
      correlationId: String(row.correlation_id),
      ...(row.causation_id ? { causationId: String(row.causation_id) } : {}),
      actor: JSON.parse(String(row.actor_json)),
      payload,
      metadata:
        row.metadata_json && String(row.metadata_json) !== '{}'
          ? JSON.parse(String(row.metadata_json))
          : undefined,
    })
  }
}
