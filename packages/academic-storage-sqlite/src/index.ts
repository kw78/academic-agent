import { randomUUID } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'
import {
  systemClock,
  type AcademicServices,
  type Clock,
  type EventUpcaster,
  type IdGenerator,
} from '@academic/contracts'
import { SqliteCheckpointStore } from './checkpoint-store.js'
import { SqliteCommandBus } from './command-bus.js'
import { CoreProjection } from './core-projection.js'
import { openDatabase, type SqlRow } from './database.js'
import { SqliteEventLog } from './event-store.js'
import { SqliteQueryService } from './query-service.js'

export * from './database.js'
export * from './event-store.js'
export * from './command-bus.js'
export * from './core-projection.js'
export * from './checkpoint-store.js'
export * from './query-service.js'

export interface CreateAcademicStoreOptions {
  databasePath: string
  migrationsDir?: string
  clock?: Clock
  ids?: IdGenerator
  upcasters?: EventUpcaster[]
}

export interface ProjectionHealth {
  eventPosition: number
  projectionPosition: number
  pendingEvents: number
  consistent: boolean
}

export interface AcademicStore extends AcademicServices {
  database: DatabaseSync
  events: SqliteEventLog
  commands: SqliteCommandBus
  queries: SqliteQueryService
  checkpoints: SqliteCheckpointStore
  projection: CoreProjection
  onAppended(listener: () => void): () => void
  rebuildProjection(): void
  health(): ProjectionHealth
  close(): void
}

const defaultIds: IdGenerator = { next: () => randomUUID() }

export function createAcademicStore(options: CreateAcademicStoreOptions): AcademicStore {
  const db = openDatabase(
    options.databasePath,
    options.migrationsDir,
  )
  const clock = options.clock ?? systemClock
  const ids = options.ids ?? defaultIds
  const events = new SqliteEventLog(db, clock, ids, options.upcasters)
  const projection = new CoreProjection(db, clock)
  const listeners = new Set<() => void>()

  const commands = new SqliteCommandBus({
    db,
    events,
    projection,
    clock,
    onAppended: () => {
      for (const listener of listeners) {
        try {
          listener()
        } catch {
          // A wake-up listener must never break a committed command.
        }
      }
    },
  })
  const queries = new SqliteQueryService(db, clock, projection)
  const checkpoints = new SqliteCheckpointStore(db)

  return {
    database: db,
    events,
    commands,
    queries,
    checkpoints,
    projection,
    onAppended(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    rebuildProjection() {
      projection.rebuild(events.readAllSync(0))
    },
    health() {
      const eventPosition = events.maxPositionSync()
      const projectionPosition = projection.getPosition()
      return {
        eventPosition,
        projectionPosition,
        pendingEvents: Math.max(0, eventPosition - projectionPosition),
        consistent: eventPosition === projectionPosition,
      }
    },
    close() {
      listeners.clear()
      db.close()
    },
  }
}

export function readProjectionPosition(db: DatabaseSync): number {
  const row = db
    .prepare("SELECT last_position FROM projection_state WHERE projection_id = 'core'")
    .get() as SqlRow
  return Number(row.last_position)
}
