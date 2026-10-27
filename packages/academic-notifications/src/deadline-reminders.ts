import { createHash } from 'node:crypto'
import type { Clock, Due, QueryApi } from '@academic/contracts'
import type { NotificationStore } from './notification-store.js'

export const DEADLINE_REMINDER_CONSUMER_ID = 'academic.notifications.deadline.v1'

export interface DeadlineScanResult {
  scanned: number
  sent: number
}

export interface DeadlineReminderDependencies {
  queries: QueryApi
  notifications: NotificationStore
  clock: Clock
  consumerId?: string
}

function zoneOffsetMs(zone: string, instant: Date): number {
  const truncated = new Date(Math.floor(instant.getTime() / 1000) * 1000)
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
  const parts: Record<string, string> = {}
  for (const part of formatter.formatToParts(truncated)) {
    if (part.type !== 'literal') parts[part.type] = part.value
  }
  const hour = parts.hour === '24' ? '00' : parts.hour!
  return (
    Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(hour),
      Number(parts.minute),
      Number(parts.second),
    ) - truncated.getTime()
  )
}

function endOfDayUtc(date: string, zone: string): string {
  const [year, month, day] = date.split('-').map(Number)
  const guess = Date.UTC(year!, month! - 1, day!, 23, 59, 59, 999)
  const firstOffset = zoneOffsetMs(zone, new Date(guess))
  const adjusted = guess - firstOffset
  const secondOffset = zoneOffsetMs(zone, new Date(adjusted))
  return new Date(guess - secondOffset).toISOString()
}

function deadlineMs(due: Due): number | undefined {
  switch (due.kind) {
    case 'instant':
      return Date.parse(due.utc)
    case 'local-date':
      try {
        return Date.parse(endOfDayUtc(due.date, due.zone ?? 'UTC'))
      } catch {
        return undefined
      }
    case 'unknown':
      return undefined
  }
}

function describeDue(due: Due): string {
  switch (due.kind) {
    case 'instant':
      return `${due.utc} (${due.zone})`
    case 'local-date':
      return `${due.date}（仅日期${due.zone ? `，${due.zone}` : ''}）`
    case 'unknown':
      return '未知'
  }
}

function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 32)
}

/**
 * Periodically scans active items and creates at most one in-app reminder for
 * the most urgent configured threshold. Dedupe keys persist in SQLite, so a
 * restart or repeated scan cannot resend the same reminder.
 */
export async function scanDeadlineReminders(
  dependencies: DeadlineReminderDependencies,
): Promise<DeadlineScanResult> {
  const consumerId =
    dependencies.consumerId ?? DEADLINE_REMINDER_CONSUMER_ID
  const settings = dependencies.notifications.getSettings()
  if (!settings.enabled || settings.thresholdsHours.length === 0) {
    return { scanned: 0, sent: 0 }
  }
  const thresholds = [...settings.thresholdsHours].sort((a, b) => a - b)
  const now = Date.parse(dependencies.clock.now())
  let scanned = 0
  let sent = 0
  let cursor: string | undefined

  do {
    const page = await dependencies.queries.listAcademicItems({
      status: 'active',
      limit: 200,
      ...(cursor ? { cursor } : {}),
    })
    for (const item of page.items) {
      scanned += 1
      if (item.progress.status === 'done') continue
      const dueAt = deadlineMs(item.due)
      if (dueAt === undefined || dueAt <= now) continue
      const remainingHours = (dueAt - now) / 3_600_000
      const eligible = thresholds.filter(
        (threshold) => remainingHours <= threshold,
      )
      if (eligible.length === 0) continue
      const threshold = Math.min(...eligible)
      const alreadySent = dependencies.notifications.reminderThresholds(
        item.itemId,
        consumerId,
      )
      // A more urgent reminder already delivered means a changed threshold
      // must not retroactively add a less urgent one.
      if (alreadySent.some((value) => value <= threshold)) continue
      const dedupeKey = `deadline:${item.itemId}:${threshold}:${hash(
        JSON.stringify(item.due),
      )}`
      const id = `reminder:${hash(dedupeKey)}`
      const inserted = dependencies.notifications.insert({
        notificationId: id,
        consumerId,
        eventId: id,
        activationPosition: 0,
        type: 'deadline-reminder',
        title: `截止提醒：${item.title}`,
        body: `还有约 ${threshold} 小时（截止 ${describeDue(item.due)}）。`,
        dedupeKey,
      })
      if (inserted) sent += 1
    }
    cursor = page.nextCursor
  } while (cursor)

  return { scanned, sent }
}
