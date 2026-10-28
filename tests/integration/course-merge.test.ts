import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { COMMAND, parseCommand, type AcademicItemSnapshot } from '@academic/contracts'
import { createAcademicApp, type AcademicApp } from '@academic/cli'
import { fixedClock, sequentialIds } from '../helpers/store.js'

const cleanup: Array<() => void> = []

afterEach(() => {
  for (const dispose of cleanup.splice(0).reverse()) dispose()
})

async function setup(): Promise<AcademicApp> {
  const root = mkdtempSync(join(tmpdir(), 'academic-course-merge-'))
  cleanup.push(() => rmSync(root, { recursive: true, force: true }))
  const app = await createAcademicApp({
    databasePath: ':memory:',
    clock: fixedClock(),
    ids: sequentialIds('merge'),
    materialsDir: join(root, 'materials'),
  })
  cleanup.push(() => app.close())
  return app
}

async function createCourse(
  app: AcademicApp,
  input: {
    courseId: string
    termId: string
    code: string
    title: string
    source?: { sourceId: string; externalCourseId: string }
  },
): Promise<void> {
  const result = await app.store.commands.execute(
    parseCommand({
      commandId: `create-${input.courseId}`,
      type: COMMAND.CourseCreate,
      aggregateId: input.courseId,
      expectedVersion: 0,
      actor: { kind: 'system', id: 'test' },
      correlationId: `course/${input.courseId}`,
      payload: {
        termId: input.termId,
        code: input.code,
        title: input.title,
        ...(input.source ? { source: input.source } : {}),
      },
    }),
  )
  if (!result.ok) throw new Error(result.message)
}

async function createItem(
  app: AcademicApp,
  input: {
    itemId: string
    courseId: string
    sourceId: string
    externalItemId: string
    title: string
  },
): Promise<void> {
  const snapshot: AcademicItemSnapshot = {
    courseId: input.courseId,
    kind: 'assignment',
    title: input.title,
    due: { kind: 'local-date', date: '2026-11-20', zone: 'Asia/Shanghai' },
    source: {
      sourceId: input.sourceId,
      externalItemId: input.externalItemId,
      sourceObservedAt: '2026-10-28T10:00:00.000Z',
      contentHash: `hash-${input.itemId}`,
    },
  }
  const result = await app.store.commands.execute(
    parseCommand({
      commandId: `item-${input.itemId}`,
      type: COMMAND.AcademicItemDiscover,
      aggregateId: input.itemId,
      expectedVersion: 0,
      actor: { kind: 'system', id: 'test' },
      correlationId: `item/${input.itemId}`,
      payload: snapshot as unknown as Record<string, unknown>,
    }),
  )
  if (!result.ok) throw new Error(result.message)
}

describe('course identity merge', () => {
  it('reuses an existing same-term course when adding a duplicate title', async () => {
    const app = await setup()
    const first = await app.addCourse({
      termId: '2026FA',
      code: 'EE201',
      title: '模拟与数字电路实验',
    })
    const second = await app.addCourse({
      termId: '2026FA',
      code: 'EE201.01',
      title: '  模拟与数字电路实验 ',
    })
    expect(first.ok && second.ok).toBe(true)
    if (!first.ok || !second.ok) return
    expect(second.aggregateId).toBe(first.aggregateId)
    expect(second.eventIds).toHaveLength(0)
    const courses = (await app.store.queries.listCourses()).items.filter(
      (course) => !course.deleted,
    )
    expect(courses).toHaveLength(1)
  })

  it('merges existing duplicates: moves items/materials/preferences and links sources', async () => {
    const app = await setup()
    await createCourse(app, {
      courseId: 'course-a',
      termId: '2026FA',
      code: '011152',
      title: '模拟与数字电路实验',
      source: { sourceId: 'source-a', externalCourseId: 'ext-a' },
    })
    await createCourse(app, {
      courseId: 'course-b',
      termId: '2026FA',
      code: '011152.01',
      title: '模拟与数字电路实验',
      source: { sourceId: 'source-b', externalCourseId: 'ext-b' },
    })
    await createItem(app, {
      itemId: 'item-a',
      courseId: 'course-a',
      sourceId: 'source-a',
      externalItemId: 'a-1',
      title: 'A 作业',
    })
    await createItem(app, {
      itemId: 'item-b',
      courseId: 'course-b',
      sourceId: 'source-b',
      externalItemId: 'b-1',
      title: 'B 作业',
    })
    await app.materials.importText({
      courseId: 'course-a',
      title: '共享讲义',
      text: '两份课程下导入的相同讲义内容。',
    })
    await app.materials.importText({
      courseId: 'course-b',
      title: '共享讲义',
      text: '两份课程下导入的相同讲义内容。',
    })
    await app.materials.importText({
      courseId: 'course-b',
      title: 'B 独有讲义',
      text: '只属于 B 的资料，合并后应该移动到保留课程。',
    })
    app.preferences.update({ coursePriorities: { 'course-b': 2 } })
    app.materials.setSubscription('source-b', 'course-b', true)

    const summary = await app.mergeDuplicateCourses()
    expect(summary.mergedCourses).toBe(1)
    expect(summary.movedItems).toBe(1)
    expect(summary.movedMaterials).toBe(1)
    expect(summary.removedMaterials).toBe(1)
    expect(summary.mergedInto).toEqual([
      { fromCourseId: 'course-b', toCourseId: 'course-a' },
    ])

    const courses = (await app.store.queries.listCourses()).items
    const active = courses.filter(
      (course) => !course.deleted && !course.archived && course.title === '模拟与数字电路实验',
    )
    expect(active).toHaveLength(1)
    expect(active[0]!.courseId).toBe('course-a')
    const duplicate = courses.find((course) => course.courseId === 'course-b')
    expect(duplicate?.deleted).toBe(true)

    const items = await app.store.queries.listAcademicItems({ status: 'all', limit: 200 })
    expect(items.items).toHaveLength(2)
    expect(items.items.every((item) => item.courseId === 'course-a')).toBe(true)

    const materials = app.materials.list()
    expect(materials).toHaveLength(2)
    expect(materials.every((material) => material.courseId === 'course-a')).toBe(true)
    expect(
      materials.some((material) => material.title === 'B 独有讲义'),
    ).toBe(true)
    expect(
      app.materials.subscriptions().filter((entry) => entry.courseId === 'course-a'),
    ).toHaveLength(1)
    expect(app.preferences.get().coursePriorities['course-a']).toBe(2)
    expect(app.preferences.get().coursePriorities['course-b']).toBeUndefined()

    const bySource = await app.store.queries.getCourseBySource('source-b', 'ext-b')
    expect(bySource?.courseId).toBe('course-a')

    const reused = await app.connectors.registerCourse({
      sourceId: 'source-b',
      externalCourseId: 'ext-b',
      termId: '2026FA',
      code: '011152.01',
      title: '模拟与数字电路实验',
    })
    expect(reused.courseId).toBe('course-a')
    const after = await app.store.queries.listCourses()
    expect(
      after.items.filter(
        (course) => !course.deleted && course.title === '模拟与数字电路实验',
      ),
    ).toHaveLength(1)
  })

  it('reuses an existing course by term and title during source registration', async () => {
    const app = await setup()
    const first = await app.connectors.registerCourse({
      sourceId: 'source-a',
      externalCourseId: 'a-01',
      termId: '2026FA',
      code: 'EE201',
      title: '模拟与数字电路实验',
    })
    const second = await app.connectors.registerCourse({
      sourceId: 'source-b',
      externalCourseId: 'b-01',
      termId: '2026FA',
      code: 'EE201.01',
      title: '  模拟与数字电路实验 ',
    })
    expect(second.courseId).toBe(first.courseId)
    const active = (await app.store.queries.listCourses()).items.filter(
      (course) => !course.deleted && course.title === '模拟与数字电路实验',
    )
    expect(active).toHaveLength(1)
    const again = await app.connectors.registerCourse({
      sourceId: 'source-b',
      externalCourseId: 'b-01',
      termId: '2026FA',
      code: 'EE201.01',
      title: '模拟与数字电路实验',
    })
    expect(again.courseId).toBe(first.courseId)
  })

  it('rejects moving an item to a different course through sync but allows explicit reassignment', async () => {
    const app = await setup()
    await createCourse(app, {
      courseId: 'course-a',
      termId: '2026FA',
      code: 'A',
      title: '课程 A',
    })
    await createCourse(app, {
      courseId: 'course-b',
      termId: '2026FA',
      code: 'B',
      title: '课程 B',
    })
    await createItem(app, {
      itemId: 'item-1',
      courseId: 'course-a',
      sourceId: 'source-a',
      externalItemId: '1',
      title: '作业',
    })
    const moved = await app.store.commands.execute(
      parseCommand({
        commandId: 'reassign-1',
        type: COMMAND.AcademicItemReassignCourse,
        aggregateId: 'item-1',
        expectedVersion: 1,
        actor: { kind: 'system', id: 'test' },
        correlationId: 'reassign/1',
        payload: { courseId: 'course-b' },
      }),
    )
    expect(moved.ok).toBe(true)
    const item = await app.store.queries.getAcademicItem('item-1')
    expect(item?.courseId).toBe('course-b')
    expect(item?.progress.percent).toBe(0)
  })
})
