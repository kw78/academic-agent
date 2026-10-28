import { createHash } from 'node:crypto'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join, relative } from 'node:path'
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

export interface ApplicationBackupEntry {
  /** Path relative to the backup root, always forward slashes. */
  path: string
  sha256: string
  bytes: number
}

export interface ApplicationBackupManifest {
  formatVersion: 1
  createdAt: string
  database: ApplicationBackupEntry
  /** Original files under materials/; metadata and indexes live in SQLite. */
  materials: ApplicationBackupEntry[]
}

function sha256File(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

function describeFile(path: string): { sha256: string; bytes: number } {
  return { sha256: sha256File(path), bytes: statSync(path).size }
}

function listFiles(root: string): string[] {
  const found: string[] = []
  const walk = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const full = join(directory, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (entry.isFile()) found.push(relative(root, full))
    }
  }
  walk(root)
  return found.sort()
}

function assertSafeRelativePath(path: string, prefix?: string): void {
  const normalized = path.replace(/\\/g, '/')
  if (normalized.startsWith('/') || /^[a-zA-Z]:/.test(normalized)) {
    throw new Error(`Backup manifest contains an absolute path: ${path}`)
  }
  const segments = normalized.split('/')
  if (segments.some((segment) => !segment || segment === '.' || segment === '..')) {
    throw new Error(`Backup manifest contains an unsafe path: ${path}`)
  }
  if (prefix && segments[0] !== prefix) {
    throw new Error(`Backup manifest path must stay under ${prefix}/: ${path}`)
  }
}

function parseManifest(raw: string): ApplicationBackupManifest {
  const parsed = JSON.parse(raw) as Partial<ApplicationBackupManifest>
  if (parsed.formatVersion !== 1) {
    throw new Error(`Unsupported application backup format: ${String(parsed.formatVersion)}`)
  }
  if (!parsed.database || parsed.database.path !== 'academic.db') {
    throw new Error('Application backup is missing its database entry')
  }
  if (!Array.isArray(parsed.materials)) {
    throw new Error('Application backup is missing its materials list')
  }
  const checkEntry = (entry: ApplicationBackupEntry): void => {
    if (typeof entry.path !== 'string' || typeof entry.sha256 !== 'string') {
      throw new Error('Application backup contains a malformed entry')
    }
  }
  checkEntry(parsed.database)
  parsed.materials.forEach(checkEntry)
  return {
    formatVersion: 1,
    createdAt: typeof parsed.createdAt === 'string' ? parsed.createdAt : '',
    database: parsed.database,
    materials: parsed.materials,
  }
}

function verifyEntry(root: string, entry: ApplicationBackupEntry): void {
  const full = join(root, entry.path)
  if (!existsSync(full)) {
    throw new Error(`Application backup is missing ${entry.path}`)
  }
  const actual = describeFile(full)
  if (actual.sha256 !== entry.sha256 || actual.bytes !== entry.bytes) {
    throw new Error(`Application backup checksum mismatch: ${entry.path}`)
  }
}

/**
 * Snapshot of everything the app needs to run: the database plus the
 * content-addressed material files and a SHA-256 manifest of both.
 */
export function backupApplication(options: {
  store: AcademicStore
  materialsDir: string
  targetDir: string
  createdAt?: string
}): ApplicationBackupManifest {
  const { store, materialsDir, targetDir } = options
  if (existsSync(targetDir)) {
    throw new Error(`Backup target already exists: ${targetDir}`)
  }
  mkdirSync(targetDir, { recursive: true })
  try {
    const databasePath = join(targetDir, 'academic.db')
    backupDatabase(store, databasePath)
    const database: ApplicationBackupEntry = {
      path: 'academic.db',
      ...describeFile(databasePath),
    }
    const materials: ApplicationBackupEntry[] = []
    if (existsSync(materialsDir)) {
      for (const file of listFiles(materialsDir)) {
        const target = join(targetDir, 'materials', file)
        mkdirSync(dirname(target), { recursive: true })
        copyFileSync(join(materialsDir, file), target)
        materials.push({
          path: `materials/${file.replace(/\\/g, '/')}`,
          ...describeFile(target),
        })
      }
    }
    const manifest: ApplicationBackupManifest = {
      formatVersion: 1,
      createdAt: options.createdAt ?? new Date().toISOString(),
      database,
      materials,
    }
    writeFileSync(join(targetDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)
    return manifest
  } catch (error) {
    rmSync(targetDir, { recursive: true, force: true })
    throw error
  }
}

/**
 * Verifies every checksum before copying, then restores into a fresh
 * directory. Nothing is written if any entry is missing or altered.
 */
export function restoreApplication(options: {
  backupDir: string
  targetDir: string
}): ApplicationBackupManifest {
  const { backupDir, targetDir } = options
  const manifestPath = join(backupDir, 'manifest.json')
  if (!existsSync(manifestPath)) {
    throw new Error(`Application backup manifest is missing: ${manifestPath}`)
  }
  if (existsSync(targetDir)) {
    throw new Error(`Restore target already exists: ${targetDir}`)
  }
  const manifest = parseManifest(readFileSync(manifestPath, 'utf8'))
  assertSafeRelativePath(manifest.database.path)
  for (const entry of manifest.materials) {
    assertSafeRelativePath(entry.path, 'materials')
  }
  verifyEntry(backupDir, manifest.database)
  for (const entry of manifest.materials) verifyEntry(backupDir, entry)

  mkdirSync(targetDir, { recursive: true })
  try {
    copyFileSync(join(backupDir, manifest.database.path), join(targetDir, 'academic.db'))
    for (const entry of manifest.materials) {
      const target = join(targetDir, entry.path)
      mkdirSync(dirname(target), { recursive: true })
      copyFileSync(join(backupDir, entry.path), target)
    }
    copyFileSync(manifestPath, join(targetDir, 'manifest.json'))
    return manifest
  } catch (error) {
    rmSync(targetDir, { recursive: true, force: true })
    throw error
  }
}
