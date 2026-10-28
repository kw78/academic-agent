import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { COMMAND, type Range } from '@academic/contracts'
import { createAcademicApp } from '@academic/cli'
import { execute, fixedClock, makeCommand } from '../helpers/store.js'

const cleanup: Array<() => void | Promise<void>> = []

afterEach(async () => {
  for (const dispose of cleanup.splice(0).reverse()) await dispose()
})

function tempDir(prefix: string): string {
  mkdirSync('.data', { recursive: true })
  const directory = mkdtempSync(join('.data', prefix))
  cleanup.push(() => rmSync(directory, { recursive: true, force: true }))
  return directory
}

async function createApp() {
  const clock = fixedClock()
  const app = await createAcademicApp({
    databasePath: join(tempDir('mgmt-'), 'academic.db'),
    clock,
  })
  cleanup.push(() => app.close())
  return { app, clock }
}

async function seed(app: Awaited<ReturnType<typeof createAcademicApp>>) {
  await app.syncFixture()
  const items = await app.store.queries.listAcademicItems({ limit: 5 })
  const result = await app.createTask({
    title: 'Read chapter 2',
    estimateMinutes: 60,
    dueAt: new Date(Date.parse(app.clock.now()) + 2 * 86_400_000).toISOString(),
    priority: 1,
    ...(items.items[0] ? { itemId: items.items[0].itemId } : {}),
  })
  if (!result.ok) throw new Error(result.message)
  return result.aggregateId
}

function planRange(app: Awaited<ReturnType<typeof createAcademicApp>>): Range {
  const now = Date.parse(app.clock.now())
  return {
    start: new Date(now).toISOString(),
    end: new Date(now + 7 * 86_400_000).toISOString(),
  }
}

describe('MVP user control', () => {
  it('FIX-04 creates default tasks for synced items and preserves user edits', async () => {
    const { app } = await createApp()
    await app.syncFixture()

    const items = (await app.store.queries.listAcademicItems({ status: 'all' })).items
    expect(items).toHaveLength(2)
    const assignmentItem = items.find(
      (item) => item.source.externalItemId === 'assignment-1',
    )!
    const examItem = items.find((item) => item.source.externalItemId === 'exam-1')!
    const tasks = (await app.store.queries.listStudyTasks({ status: 'all' })).items
    expect(tasks).toHaveLength(2)
    const assignmentTask = tasks.find((task) => task.itemId === assignmentItem.itemId)!
    const examTask = tasks.find((task) => task.itemId === examItem.itemId)!
    expect(assignmentTask.estimateMinutes).toBe(60)
    expect(examTask.estimateMinutes).toBe(120)
    expect(assignmentTask.dueAt).toBeUndefined()
    expect(assignmentTask.itemId).toBe(assignmentItem.itemId)

    expect(await app.changeTaskEstimate(assignmentTask.taskId, 90)).toMatchObject({ ok: true })
    expect(await app.completeTask(examTask.taskId)).toMatchObject({ ok: true })
    await app.syncFixture()

    const after = (await app.store.queries.listStudyTasks({ status: 'all' })).items
    expect(after).toHaveLength(2)
    expect(after.find((task) => task.taskId === assignmentTask.taskId)).toMatchObject({
      estimateMinutes: 90,
      status: 'active',
    })
    expect(after.find((task) => task.taskId === examTask.taskId)).toMatchObject({
      status: 'completed',
    })

    const changedDue = '2026-10-27T10:30:00.000Z'
    expect(
      await execute(
        app.store,
        makeCommand(
          COMMAND.AcademicItemSync,
          assignmentItem.itemId,
          {
            courseId: assignmentItem.courseId,
            kind: assignmentItem.kind,
            title: assignmentItem.title,
            ...(assignmentItem.description
              ? { description: assignmentItem.description }
              : {}),
            due: { kind: 'instant', utc: changedDue, zone: 'Asia/Shanghai' },
            ...(assignmentItem.sourceUrl
              ? { sourceUrl: assignmentItem.sourceUrl }
              : {}),
            source: {
              ...assignmentItem.source,
              sourceObservedAt: '2026-10-27T10:05:00.000Z',
              contentHash: 'hash-changed-due',
            },
          } as unknown as Record<string, unknown>,
        ),
      ),
    ).toMatchObject({ ok: true })

    const replanned = await app.previewPlan(planRange(app))
    expect(replanned.unscheduled).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ taskId: assignmentTask.taskId }),
      ]),
    )
  })

  it('manages courses, tasks, notifications and automation status', async () => {
    const { app } = await createApp()
    await app.syncFixture()
    const taskId = await seed(app)

    const course = await app.addCourse({
      termId: '2026-spring',
      code: 'MA201',
      title: 'Linear Algebra',
    })
    expect(course).toMatchObject({ ok: true })
    const courses = await app.store.queries.listCourses()
    expect(courses.items.some((entry) => entry.code === 'MA201')).toBe(true)
    const courseId = course.ok ? course.aggregateId : ''
    expect(await app.archiveCourse(courseId)).toMatchObject({ ok: true })
    expect((await app.store.queries.getCourse(courseId))?.archived).toBe(true)

    expect(await app.completeTask(taskId)).toMatchObject({ ok: true })
    expect((await app.store.queries.getStudyTask(taskId))?.status).toBe('completed')
    expect(await app.reopenTask(taskId)).toMatchObject({ ok: true })
    expect((await app.store.queries.getStudyTask(taskId))?.status).toBe('active')
    expect(await app.changeTaskEstimate(taskId, 75)).toMatchObject({ ok: true })
    expect((await app.store.queries.getStudyTask(taskId))?.estimateMinutes).toBe(75)

    const unread = app.notifications.list(10, { unreadOnly: true })
    expect(unread.length).toBeGreaterThan(0)
    expect(app.markNotificationRead(unread[0]!.notificationId)).toBe(true)
    expect(app.notifications.unreadCount()).toBe(unread.length - 1)

    const status = await app.getAutomationStatus()
    expect(status.health).toMatchObject({ consistent: true, pendingEvents: 0 })
    expect(status.lastSync).toMatchObject({ status: 'success' })
    expect(status.jobs.map((job) => job.jobId)).toEqual(
      expect.arrayContaining(['fixture-lms-sync', 'planner.process-replans']),
    )
    expect(status.unreadNotifications).toBe(unread.length - 1)
  })

  it('locks plan time, removes overlapping blocks and replans around the lock', async () => {
    const { app } = await createApp()
    const taskId = await seed(app)
    const range = planRange(app)

    const suggestion = await app.previewPlan(range)
    expect(suggestion.blocks.length).toBeGreaterThan(0)
    expect(await app.acceptPlan(suggestion)).toMatchObject({ ok: true })
    const plan = await app.getLatestPlan()
    expect(plan).toBeDefined()
    expect(plan!.blocks.length).toBeGreaterThan(0)
    const firstBlock = plan!.blocks[0]!

    app.replans.enqueue({
      replanRequestId: 'req-before-lock',
      reason: 'manual',
      range: plan!.range,
    })
    const before = await app.planner.processReplanRequest('req-before-lock')
    expect(before.suggestion.blocks.length).toBeGreaterThan(0)
    expect(app.replans.get('req-before-lock')?.suggestion).toBeDefined()

    const locked = await app.lockPlanBlock({
      start: firstBlock.start,
      end: firstBlock.end,
      title: 'User locked focus time',
    })
    expect(locked.command).toMatchObject({ ok: true })
    expect(locked.removedBlocks.length).toBeGreaterThan(0)
    expect(locked.lock?.id).toBeTruthy()

    const afterLock = await app.replans.get('req-before-lock')!
    expect(afterLock.status).toBe('pending')
    expect(afterLock.suggestion).toBeUndefined()

    const replanned = await app.planner.processReplanRequest('req-before-lock')
    for (const block of replanned.suggestion.blocks) {
      expect(
        Date.parse(block.start) < Date.parse(locked.lock!.end) &&
          Date.parse(locked.lock!.start) < Date.parse(block.end),
      ).toBe(false)
    }

    const updatedPlan = await app.getLatestPlan()
    expect(updatedPlan?.lockedBlocks.map((entry) => entry.id)).toContain(locked.lock!.id)
    const preview = await app.previewPlan(updatedPlan!.range)
    for (const block of preview.blocks) {
      expect(
        Date.parse(block.start) < Date.parse(locked.lock!.end) &&
          Date.parse(locked.lock!.start) < Date.parse(block.end),
      ).toBe(false)
    }

    expect(await app.unlockPlanBlock(locked.lock!.id)).toMatchObject({
      command: { ok: true },
    })
    expect((await app.getLatestPlan())?.lockedBlocks).toHaveLength(0)

    expect(await app.archivePlan()).toMatchObject({ ok: true })
    expect(await app.getLatestPlan()).toBeUndefined()
  })

  it('retries a conflicting item archive during course deletion', async () => {
    const { app } = await createApp()
    await app.syncFixture()
    const course = (await app.store.queries.listCourses()).items[0]!

    const original = app.store.commands.execute.bind(app.store.commands)
    let injected = false
    app.store.commands.execute = (async (
      command: Parameters<typeof original>[0],
    ) => {
      if (!injected && command.type === COMMAND.AcademicItemArchive) {
        injected = true
        return { ok: false, code: 'CONFLICT', message: 'injected conflict' }
      }
      return original(command)
    }) as typeof app.store.commands.execute

    const result = await app.deleteCourse(course.courseId)
    app.store.commands.execute = original

    expect(injected).toBe(true)
    expect(result).toMatchObject({ ok: true })
    expect((await app.store.queries.getCourse(course.courseId))?.deleted).toBe(true)
    const items = (
      await app.store.queries.listAcademicItems({
        courseId: course.courseId,
        status: 'all',
      })
    ).items
    expect(items.length).toBeGreaterThan(0)
    expect(items.every((item) => item.archived)).toBe(true)
  })

  it('refuses to delete a course when an item archive keeps conflicting', async () => {
    const { app } = await createApp()
    await app.syncFixture()
    const course = (await app.store.queries.listCourses()).items[0]!

    const original = app.store.commands.execute.bind(app.store.commands)
    app.store.commands.execute = (async (
      command: Parameters<typeof original>[0],
    ) => {
      if (command.type === COMMAND.AcademicItemArchive) {
        return { ok: false, code: 'CONFLICT', message: 'injected conflict' }
      }
      return original(command)
    }) as typeof app.store.commands.execute

    const result = await app.deleteCourse(course.courseId)
    app.store.commands.execute = original

    expect(result).toMatchObject({ ok: false, code: 'CONFLICT' })
    expect((await app.store.queries.getCourse(course.courseId))?.deleted).toBe(false)
  })
})
