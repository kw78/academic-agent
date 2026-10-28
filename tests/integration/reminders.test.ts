import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { COMMAND, type AcademicItemSnapshot } from '@academic/contracts'
import { createAcademicApp } from '@academic/cli'
import { fixedClock, makeCommand } from '../helpers/store.js'

const cleanup: Array<() => void | Promise<void>> = []

afterEach(async () => {
  for (const dispose of cleanup.splice(0).reverse()) await dispose()
})

function tempDb(prefix: string): string {
  mkdirSync('.data', { recursive: true })
  const directory = mkdtempSync(join('.data', prefix))
  cleanup.push(() => rmSync(directory, { recursive: true, force: true }))
  return join(directory, 'academic.db')
}

async function createApp(databasePath = ':memory:') {
  const clock = fixedClock()
  const app = await createAcademicApp({ databasePath, clock })
  cleanup.push(() => app.close())
  return { app, clock }
}

function itemSnapshot(
  title: string,
  due: AcademicItemSnapshot['due'],
): AcademicItemSnapshot {
  return {
    courseId: 'course-1',
    kind: 'assignment',
    title,
    due,
    source: {
      sourceId: 'fixture-lms',
      externalItemId: title,
      sourceObservedAt: '2026-10-27T10:00:00.000Z',
      contentHash: `hash-${title}`,
    },
  }
}

async function addItem(
  app: Awaited<ReturnType<typeof createAcademicApp>>,
  id: string,
  due: AcademicItemSnapshot['due'],
) {
  expect(
    await app.store.commands.execute(
      makeCommand(
        COMMAND.AcademicItemDiscover,
        id,
        itemSnapshot(id, due) as unknown as Record<string, unknown>,
      ),
    ),
  ).toMatchObject({ ok: true })
}

describe('FIX-06 deadline reminders', () => {
  it('sends one most-urgent reminder per item/threshold and respects settings', async () => {
    const { app } = await createApp()
    expect(app.notifications.getSettings()).toMatchObject({
      enabled: true,
      thresholdsHours: [72, 24],
    })

    await addItem(app, 'due-48h', {
      kind: 'instant',
      utc: '2026-10-29T10:00:00.000Z',
      zone: 'Asia/Shanghai',
    })
    expect(await app.scanDeadlineReminders()).toMatchObject({ sent: 1 })
    expect(app.notifications.list(10, { unreadOnly: true })[0]).toMatchObject({
      type: 'deadline-reminder',
      title: '截止提醒：due-48h',
    })
    expect(app.notifications.list(10)[0]?.body).toContain('72')
    expect(await app.scanDeadlineReminders()).toMatchObject({ sent: 0 })
    expect(app.notifications.list(10)).toHaveLength(1)

    app.notifications.updateSettings({ enabled: false })
    await addItem(app, 'due-10h', {
      kind: 'instant',
      utc: '2026-10-27T20:00:00.000Z',
      zone: 'Asia/Shanghai',
    })
    expect(await app.scanDeadlineReminders()).toMatchObject({ sent: 0 })

    app.notifications.updateSettings({ enabled: true, thresholdsHours: [24] })
    expect(await app.scanDeadlineReminders()).toMatchObject({ sent: 1 })
    expect(app.notifications.list(10)[0]?.body).toContain('24')

    await addItem(app, 'due-48h-b', {
      kind: 'instant',
      utc: '2026-10-29T10:00:00.000Z',
      zone: 'Asia/Shanghai',
    })
    expect(await app.scanDeadlineReminders()).toMatchObject({ sent: 0 })
    app.notifications.updateSettings({ thresholdsHours: [72] })
    expect(await app.scanDeadlineReminders()).toMatchObject({ sent: 1 })
    expect(app.notifications.list(10)).toHaveLength(3)
  })

  it('deduplicates across restart and scheduler compensation', async () => {
    const databasePath = tempDb('reminders-')
    const first = await createApp(databasePath)
    await addItem(first.app, 'due-48h', {
      kind: 'instant',
      utc: '2026-10-29T10:00:00.000Z',
      zone: 'Asia/Shanghai',
    })
    const runs = await first.app.scheduler.runDueJobs(first.clock.now())
    expect(runs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          jobId: 'academic.reminders.scan',
          status: 'succeeded',
        }),
      ]),
    )
    expect(first.app.notifications.list(10)).toHaveLength(1)
    await first.app.close()

    const second = await createApp(databasePath)
    expect(second.app.notifications.getSettings()).toMatchObject({
      enabled: true,
      thresholdsHours: [72, 24],
    })
    expect(await second.app.scanDeadlineReminders()).toMatchObject({ sent: 0 })
    expect(second.app.notifications.list(10)).toHaveLength(1)
  })

  it('handles date-only deadlines in the source time zone', async () => {
    const { app } = await createApp()
    await addItem(app, 'date-only', {
      kind: 'local-date',
      date: '2026-10-29',
      zone: 'Asia/Shanghai',
    })
    expect(await app.scanDeadlineReminders()).toMatchObject({ sent: 1 })
    const notification = app.notifications.list(10)[0]
    expect(notification?.body).toContain('2026-10-29')
  })
})
