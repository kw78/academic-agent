import type { DatabaseSync } from 'node:sqlite'

export type SqlRow = Record<string, unknown>

export function inTransaction<T>(db: DatabaseSync, operation: () => T): T {
  db.exec('BEGIN IMMEDIATE')
  try {
    const result = operation()
    db.exec('COMMIT')
    return result
  } catch (error) {
    try {
      db.exec('ROLLBACK')
    } catch {
      // Preserve the original failure.
    }
    throw error
  }
}
