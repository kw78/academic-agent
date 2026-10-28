import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { createAcademicStore } from '@academic/storage-sqlite'
import { fixedClock, sequentialIds } from '../helpers/store.js'

const cleanup: Array<() => void> = []

afterEach(() => {
  for (const dispose of cleanup.splice(0).reverse()) dispose()
})

const migrationsDir = fileURLToPath(
  new URL('../../migrations', import.meta.url),
)

describe('database upgrade', () => {
  it('keeps existing data and applies new migrations on reopen', async () => {
    const root = mkdtempSync(join(tmpdir(), 'academic-upgrade-'))
    cleanup.push(() => rmSync(root, { recursive: true, force: true }))
    const oldMigrations = join(root, 'old-migrations')
    mkdirSync(oldMigrations)
    for (const file of readdirSync(migrationsDir).sort()) {
      if (Number(file.slice(0, 4)) >= 13) continue
      copyFileSync(join(migrationsDir, file), join(oldMigrations, file))
    }

    const databasePath = join(root, 'upgrade.db')
    const clock = fixedClock()
    const before = createAcademicStore({
      databasePath,
      migrationsDir: oldMigrations,
      clock,
      ids: sequentialIds('before'),
    })
    // Simulate a course row written by the pre-0013 schema. The upgrade must
    // keep it and add the new soft-delete column with a safe default.
    before.database
      .prepare(
        `INSERT INTO courses_current (
           course_id, term_id, code, title, archived, source_id,
           external_course_id, source_json, created_at, updated_at, version
         ) VALUES (?, ?, ?, ?, 0, NULL, NULL, NULL, ?, ?, 1)`,
      )
      .run(
        'course-before-upgrade',
        '2026FA',
        'CS101',
        'Before upgrade',
        clock.now(),
        clock.now(),
      )
    before.close()

    const after = createAcademicStore({
      databasePath,
      migrationsDir,
      clock,
      ids: sequentialIds('after'),
    })
    cleanup.push(() => after.close())
    const courses = await after.queries.listCourses()
    const upgraded = courses.items.find(
      (course) => course.courseId === 'course-before-upgrade',
    )
    expect(upgraded?.deleted).toBe(false)

    const applied = after.database
      .prepare('SELECT id FROM schema_migrations ORDER BY id')
      .all() as Array<{ id: string }>
    expect(applied.map((row) => row.id)).toContain('0011_user_preferences.sql')
    expect(applied.map((row) => row.id)).toContain('0013_editable_records.sql')
    const columns = after.database
      .prepare('PRAGMA table_info(courses_current)')
      .all() as Array<{ name: string }>
    expect(columns.map((column) => column.name)).toContain('deleted')
    const table = after.database
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'user_preferences'",
      )
      .get() as { name?: string } | undefined
    expect(table?.name).toBe('user_preferences')

    const health = after.health()
    expect(health.consistent).toBe(true)
  })
})
