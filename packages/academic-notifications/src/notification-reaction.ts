import {
  EVENT,
  type Clock,
  type DisposableRegistration,
  type Due,
  type EventLogReader,
  type QueryApi,
} from '@academic/contracts'
import type { EventDispatcher } from '@academic/event-dispatcher'
import type { NotificationStore } from './notification-store.js'

export const DEFAULT_NOTIFICATION_CONSUMER_ID = 'academic.notifications.in-app.v1'
export const DEFAULT_ACTIVATION_ID = 'in-app'

export interface NotificationReactionOptions {
  dispatcher: EventDispatcher
  events: EventLogReader
  queries: QueryApi
  notifications: NotificationStore
  clock: Clock
  consumerId?: string
  activationId?: string
  windowDays?: number
}

function kindLabel(kind: 'assignment' | 'exam' | 'quiz'): string {
  switch (kind) {
    case 'assignment':
      return 'assignment'
    case 'exam':
      return 'exam'
    case 'quiz':
      return 'quiz'
  }
}

function describeDue(due: Due): string {
  switch (due.kind) {
    case 'instant':
      return `${due.utc} (${due.zone})`
    case 'local-date':
      return `${due.date} (date only${due.zone ? `, ${due.zone}` : ''})`
    case 'unknown':
      return 'unknown'
  }
}

function dueEpoch(due: Due): number | undefined {
  switch (due.kind) {
    case 'instant':
      return Date.parse(due.utc)
    case 'local-date':
      return Date.parse(`${due.date}T23:59:59.999Z`)
    case 'unknown':
      return undefined
  }
}

/**
 * Registers the in-app deadline reaction. Activation always starts at the
 * current head, and every notification remembers that position, so replaying
 * history (even from position 0) cannot resend old reminders.
 */
export async function registerNotificationReaction(
  options: NotificationReactionOptions,
): Promise<DisposableRegistration> {
  const consumerId = options.consumerId ?? DEFAULT_NOTIFICATION_CONSUMER_ID
  const activationId = options.activationId ?? DEFAULT_ACTIVATION_ID
  const windowDays = options.windowDays ?? 14

  const activation = await options.events.maxPosition()
  options.notifications.setActivation(activation, activationId)

  return options.dispatcher.register({
    consumerId,
    eventTypes: [EVENT.AcademicItemDiscovered, EVENT.AcademicItemDeadlineChanged],
    projectionVersion: 1,
    startPosition: 'latest',
    async handler(event) {
      const current = options.notifications.getActivation(activationId)
      if (!current || event.globalPosition <= current.lastPosition) return

      let type: string
      let title: string
      let body: string
      let due: Due

      if (event.type === EVENT.AcademicItemDiscovered) {
        type = 'item-discovered'
        title = `New ${kindLabel(event.payload.kind)}: ${event.payload.title}`
        due = event.payload.due
        body = `Due ${describeDue(due)}.`
      } else if (event.type === EVENT.AcademicItemDeadlineChanged) {
        const itemId = event.streamId.slice(event.streamId.indexOf('/') + 1)
        const item = await options.queries.getAcademicItem(itemId)
        if (!item || item.archived) return
        type = 'deadline-changed'
        title = `Deadline changed: ${item.title}`
        due = event.payload.to
        body = `New deadline ${describeDue(due)} (was ${describeDue(event.payload.from)}).`
      } else {
        return
      }

      const deadline = dueEpoch(due)
      if (
        deadline !== undefined &&
        deadline > Date.parse(options.clock.now()) + windowDays * 86_400_000
      ) {
        return
      }

      options.notifications.insert({
        notificationId: `${consumerId}:${event.eventId}`,
        consumerId,
        eventId: event.eventId,
        activationPosition: current.lastPosition,
        type,
        title,
        body,
      })
    },
  })
}
