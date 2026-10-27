import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'

export type SqlRow = Record<string, unknown>

export const defaultMigrationsDir = fileURLToPath(
  new URL('../../../migrations/', import.meta.url),
)

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

export function runMigrations(db: DatabaseSync, migrationsDir = defaultMigrationsDir): string[] {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
  `)
  const appliedRows = db.prepare('SELECT id FROM schema_migrations').all() as SqlRow[]
  const applied = new Set(appliedRows.map((row) => String(row.id)))
  const files = readdirSync(migrationsDir)
    .filter((file) => /^\d+.*\.sql$/.test(file))
    .sort()

  const newlyApplied: string[] = []
  for (const file of files) {
    if (applied.has(file)) continue
    const sql = readFileSync(join(migrationsDir, file), 'utf8')
    inTransaction(db, () => {
      db.exec(sql)
      db.prepare('INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)').run(
        file,
        new Date().toISOString(),
      )
    })
    newlyApplied.push(file)
  }
  return newlyApplied
}

export function openDatabase(
  databasePath: string,
  migrationsDir = defaultMigrationsDir,
): DatabaseSync {
  const db = new DatabaseSync(databasePath)
  db.exec('PRAGMA foreign_keys = ON;')
  db.exec('PRAGMA busy_timeout = 5000;')
  if (databasePath !== ':memory:') {
    db.exec('PRAGMA journal_mode = WAL;')
  }
  runMigrations(db, migrationsDir)
  return db
}
