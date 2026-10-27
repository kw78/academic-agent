import { afterEach, describe, expect, it } from 'vitest'
import {
  COMMAND,
  EVENT,
  type AcademicItemSnapshot,
} from '@academic/contracts'
import { EventDispatcher } from '@academic/event-dispatcher'
import {
  DEFAULT_NOTIFICATION_CONSUMER_ID,
  NotificationStore,
  registerNotificationReaction,
} from '@academic/notifications'
import {
  createTestStore,
  execute,
  fixedClock,
  makeCommand,
} from '../helpers/store.js'

const cleanup: Array<() => void> = []

afterEach(() => {
  for (const dispose of cleanup.splice(0)) dispose()
})

function snapshot(
  externalItemId: string,
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
      externalItemId,
      sourceObservedAt: '2026-10-27T10:00:00.000Z',
      contentHash: `hash-${externalItemId}`,
    },
  }
}

async function discover(
  store: ReturnType<typeof createTestStore>,
  itemId: string,
  payload: AcademicItemSnapshot,
) {
  return execute(
    store,
    makeCommand(
      COMMAND.AcademicItemDiscover,
      itemId,
      payload as unknown as Record<string, unknown>,
    ),
  )
}

function setup() {
  const clock = fixedClock()
  const store = createTestStore({ clock })
  const dispatcher = new EventDispatcher({
    events: store.events,
    checkpoints: store.checkpoints,
    clock,
  })
  const notifications = new NotificationStore(store.database, clock)
  cleanup.push(() => {
    dispatcher.close()
    store.close()
  })
  return { clock, store, dispatcher, notifications }
}

describe('T11 notification replay safety', () => {
  it('never resends historical reminders and notifies only new events', async () => {
    const { clock, store, dispatcher, notifications } = setup()
    await execute(
      store,
      makeCommand(COMMAND.CourseCreate, 'course-1', {
        termId: '2026-fall',
        code: 'CS101',
        title: 'Computer Science',
      }),
    )
    await discover(
      store,
      'item-1',
      snapshot('assignment-1', 'Historical assignment', {
        kind: 'instant',
        utc: '2026-11-01T15:00:00.000Z',
        zone: 'Asia/Shanghai',
      }),
    )

    const registration = await registerNotificationReaction({
      dispatcher,
      events: store.events,
      queries: store.queries,
      notifications,
      clock,
    })
    cleanup.push(() => registration.dispose())
    expect(notifications.list()).toHaveLength(0)

    // Simulate a full historical replay by resetting the consumer checkpoint.
    await store.checkpoints.setCheckpoint({
      consumerId: DEFAULT_NOTIFICATION_CONSUMER_ID,
      lastPosition: 0,
      projectionVersion: 1,
      updatedAt: clock.now(),
    })
    await dispatcher.processOnce()
    expect(notifications.list()).toHaveLength(0)

    await discover(
      store,
      'item-2',
      snapshot('assignment-2', 'New assignment', {
        kind: 'instant',
        utc: '2026-11-03T15:00:00.000Z',
        zone: 'Asia/Shanghai',
      }),
    )
    await dispatcher.processOnce()
    expect(notifications.list()).toHaveLength(1)
    expect(notifications.list()[0]).toMatchObject({
      type: 'item-discovered',
      title: 'New assignment: New assignment',
    })

    const itemTwo = await store.queries.getAcademicItem('item-2')
    expect(itemTwo).toBeDefined()
    await execute(
      store,
      makeCommand(COMMAND.AcademicItemSync, 'item-2', {
        ...snapshot('assignment-2', 'New assignment', {
          kind: 'instant',
          utc: '2026-11-04T15:00:00.000Z',
          zone: 'Asia/Shanghai',
        }),
        source: {
          ...snapshot('assignment-2', 'New assignment', {
            kind: 'instant',
            utc: '2026-11-04T15:00:00.000Z',
            zone: 'Asia/Shanghai',
          }).source,
          sourceObservedAt: clock.now(),
          contentHash: 'hash-assignment-2-updated',
        },
      } as unknown as Record<string, unknown>),
    )
    await dispatcher.processOnce()
    expect(notifications.list()).toHaveLength(2)
    expect(notifications.list()[0]).toMatchObject({
      type: 'deadline-changed',
      title: 'Deadline changed: New assignment',
    })

    // Far-future items are outside the reminder window.
    await discover(
      store,
      'item-3',
      snapshot('assignment-3', 'Far future', {
        kind: 'instant',
        utc: '2027-06-01T15:00:00.000Z',
        zone: 'Asia/Shanghai',
      }),
    )
    await dispatcher.processOnce()
    expect(notifications.list()).toHaveLength(2)

    // Re-enabling moves activation to the current head; an old event replayed
    // from zero still must not notify.
    registration.dispose()
    const secondRegistration = await registerNotificationReaction({
      dispatcher,
      events: store.events,
      queries: store.queries,
      notifications,
      clock,
    })
    cleanup.push(() => secondRegistration.dispose())
    await store.checkpoints.setCheckpoint({
      consumerId: DEFAULT_NOTIFICATION_CONSUMER_ID,
      lastPosition: 0,
      projectionVersion: 1,
      updatedAt: clock.now(),
    })
    await dispatcher.processOnce()
    expect(notifications.list()).toHaveLength(2)

    const unread = notifications.unreadCount()
    expect(unread).toBe(2)
    const first = notifications.list()[0]!
    expect(notifications.markRead(first.notificationId)).toBe(true)
    expect(notifications.unreadCount()).toBe(1)
  })
})
