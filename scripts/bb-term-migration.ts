/**
 * One-off: normalise legacy Blackboard term codes (2026FA) to the domain
 * vocabulary (2026-fall) on already-synced courses.
 *
 *   npx tsx scripts/bb-term-migration.ts <dbPath> [sourceId] [--apply]
 *
 * Without a sourceId every course whose term still uses the legacy code is
 * migrated. Idempotent: already-normalised terms are skipped.
 */
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { createAcademicApp } from '@academic/cli'
import { normalizeTermId } from '@academic/adapter-ustc-blackboard'

const USTC_BLACKBOARD_SOURCE_ID = 'f023b674-8b06-4a77-a7b3-4de3e04ff166'
const LEGACY_TERM = /^\d{4}(WI|SP|SU|FA)$/i

const [dbPath, ...rest] = process.argv.slice(2)
if (!dbPath) throw new Error('usage: bb-term-migration.ts <dbPath> [sourceId] [--apply]')
const apply = rest.includes('--apply')
const sourceId = rest.find((value) => !value.startsWith('--')) ?? USTC_BLACKBOARD_SOURCE_ID

const app = await createAcademicApp({
  databasePath: dbPath,
  migrationsDir: 'packages/academic-dsh-plugin/migrations',
  agentWrites: false,
  registerPlannerCapability: false,
})

const planned: Array<{
  courseId: string
  title: string
  from: string
  to: string
}> = []
try {
  const courses = (await app.store.queries.listCourses()).items
  for (const course of courses) {
    if (course.source?.sourceId !== sourceId) continue
    if (!LEGACY_TERM.test(course.termId)) continue
    const next = normalizeTermId(course.termId)
    if (next === course.termId) continue
    planned.push({
      courseId: course.courseId,
      title: course.title,
      from: course.termId,
      to: next,
    })
  }

  console.log(`mode=${apply ? 'apply' : 'dry-run'} planned=${planned.length}`)
  for (const entry of planned) {
    console.log(`  ${entry.from} -> ${entry.to}  ${entry.title}`)
  }

  if (apply && planned.length > 0) {
    let ok = 0
    const failures: string[] = []
    for (const entry of planned) {
      const result = await app.updateCourse(entry.courseId, { termId: entry.to })
      if (result.ok) ok += 1
      else failures.push(`${entry.title}: ${result.message}`)
    }
    console.log(`applied=${ok} failed=${failures.length}`)
    for (const failure of failures) console.log(`  FAIL ${failure}`)
    writeFileSync(
      join(dirname(dbPath), 'bb-term-migration.rollback.json'),
      JSON.stringify(
        { dbPath, sourceId, appliedAt: new Date().toISOString(), planned },
        null,
        2,
      ),
      'utf8',
    )
  }
} finally {
  app.close()
}
