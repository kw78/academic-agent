import type { DatabaseSync } from 'node:sqlite'
import type { CheckpointStore, ConsumerCheckpoint } from '@academic/contracts'
import type { SqlRow } from './database.js'

export class SqliteCheckpointStore implements CheckpointStore {
  readonly #db: DatabaseSync

  constructor(db: DatabaseSync) {
    this.#db = db
  }

  async getCheckpoint(consumerId: string): Promise<ConsumerCheckpoint | undefined> {
    const row = this.#db
      .prepare('SELECT * FROM consumer_checkpoints WHERE consumer_id = ?')
      .get(consumerId) as SqlRow | undefined
    if (!row) return undefined
    return {
      consumerId: String(row.consumer_id),
      lastPosition: Number(row.last_position),
      projectionVersion: Number(row.projection_version),
      updatedAt: String(row.updated_at),
    }
  }

  async setCheckpoint(checkpoint: ConsumerCheckpoint): Promise<void> {
    this.#db
      .prepare(
        `INSERT INTO consumer_checkpoints (
           consumer_id, last_position, projection_version, updated_at
         ) VALUES (?, ?, ?, ?)
         ON CONFLICT(consumer_id) DO UPDATE SET
           last_position = excluded.last_position,
           projection_version = excluded.projection_version,
           updated_at = excluded.updated_at`,
      )
      .run(
        checkpoint.consumerId,
        checkpoint.lastPosition,
        checkpoint.projectionVersion,
        checkpoint.updatedAt,
      )
  }

  async deleteCheckpoint(consumerId: string): Promise<void> {
    this.#db
      .prepare('DELETE FROM consumer_checkpoints WHERE consumer_id = ?')
      .run(consumerId)
  }
}
