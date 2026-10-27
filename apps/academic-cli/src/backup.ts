import { copyFileSync, existsSync, mkdirSync, rmSync } from 'node:fs'
import { dirname } from 'node:path'
import type { AcademicStore } from '@academic/storage-sqlite'

/**
 * Uses SQLite's VACUUM INTO for a consistent snapshot while the database is
 * live, instead of copying the file underneath an active writer.
 */
export function backupDatabase(store: AcademicStore, targetPath: string): void {
  if (targetPath === ':memory:') throw new Error('Cannot back up to :memory:')
  if (existsSync(targetPath)) {
    throw new Error(`Backup target already exists: ${targetPath}`)
  }
  mkdirSync(dirname(targetPath), { recursive: true })
  store.database.prepare('VACUUM INTO ?').run(targetPath)
}

export function restoreDatabase(backupPath: string, targetPath: string): void {
  if (!existsSync(backupPath)) {
    throw new Error(`Backup does not exist: ${backupPath}`)
  }
  if (existsSync(targetPath)) {
    throw new Error(`Restore target already exists: ${targetPath}`)
  }
  mkdirSync(dirname(targetPath), { recursive: true })
  for (const suffix of ['', '-wal', '-shm']) {
    rmSync(`${targetPath}${suffix}`, { force: true })
  }
  copyFileSync(backupPath, targetPath)
}
