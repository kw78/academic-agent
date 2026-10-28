import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { COMMAND } from '@academic/contracts'
import { createAcademicStore } from '@academic/storage-sqlite'
import {
  execute,
  fixedClock,
  makeCommand,
  sequentialIds,
} from '../helpers/store.js'

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
      if (Number(file.slice(0, 4)) >= 11) continue
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
    const created = await execute(
      before,
      makeCommand(COMMAND.CourseCreate, 'course-before-upgrade', {
        termId: '2026FA',
        code: 'CS101',
        title: 'Before upgrade',
      }),
    )
    expect(created.ok).toBe(true)
    before.close()

    const after = createAcademicStore({
      databasePath,
      migrationsDir,
      clock,
      ids: sequentialIds('after'),
    })
    cleanup.push(() => after.close())
    const courses = await after.queries.listCourses()
    expect(
      courses.items.some((course) => course.courseId === 'course-before-upgrade'),
    ).toBe(true)

    const applied = after.database
      .prepare('SELECT id FROM schema_migrations ORDER BY id')
      .all() as Array<{ id: string }>
    expect(applied.map((row) => row.id)).toContain('0011_user_preferences.sql')
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
