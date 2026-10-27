import type { DatabaseSync } from 'node:sqlite'
import { z } from 'zod'
import type { Clock } from '@academic/contracts'
import { inTransaction, type SqlRow } from './database.js'

export interface NotificationView {
  notificationId: string
  consumerId: string
  eventId: string
  type: string
  title: string
  body: string
  createdAt: string
  readAt?: string
}

export interface InsertNotificationInput {
  notificationId: string
  consumerId: string
  eventId: string
  activationPosition: number
  type: string
  title: string
  body: string
  dedupeKey?: string
}

export interface NotificationSettings {
  enabled: boolean
  thresholdsHours: number[]
  updatedAt: string
}

export interface UpdateNotificationSettings {
  enabled?: boolean
  thresholdsHours?: number[]
}

const notificationSettingsSchema = z.object({
  enabled: z.boolean(),
  thresholdsHours: z
    .array(z.number().int().min(1).max(720))
    .refine(
      (values) => new Set(values).size === values.length,
      'thresholdsHours must not contain duplicates',
    ),
})

function defaultNotificationSettings(clock: Clock): NotificationSettings {
  return {
    enabled: true,
    thresholdsHours: [72, 24],
    updatedAt: clock.now(),
  }
}

export interface ActivationState {
  lastPosition: number
  updatedAt: string
}

export class NotificationStore {
  readonly #db: DatabaseSync
  readonly #clock: Clock

  constructor(db: DatabaseSync, clock: Clock) {
    this.#db = db
    this.#clock = clock
  }

  getActivation(activationId = 'in-app'): ActivationState | undefined {
    const row = this.#db
      .prepare('SELECT * FROM notification_activations WHERE activation_id = ?')
      .get(activationId) as SqlRow | undefined
    if (!row) return undefined
    return {
      lastPosition: Number(row.last_position),
      updatedAt: String(row.updated_at),
    }
  }

  setActivation(lastPosition: number, activationId = 'in-app'): void {
    this.#db
      .prepare(
        `INSERT INTO notification_activations (activation_id, last_position, updated_at)
         VALUES (?, ?, ?)
         ON CONFLICT(activation_id) DO UPDATE SET
           last_position = excluded.last_position,
           updated_at = excluded.updated_at`,
      )
      .run(activationId, lastPosition, this.#clock.now())
  }

  insert(input: InsertNotificationInput): boolean {
    const result = this.#db
      .prepare(
        `INSERT OR IGNORE INTO notifications (
           notification_id, consumer_id, event_id, activation_position,
           notification_type, title, body, created_at, dedupe_key
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        input.notificationId,
        input.consumerId,
        input.eventId,
        input.activationPosition,
        input.type,
        input.title,
        input.body,
        this.#clock.now(),
        input.dedupeKey ?? null,
      )
    return Number(result.changes) > 0
  }

  getSettings(): NotificationSettings {
    const row = this.#db
      .prepare('SELECT * FROM notification_settings WHERE settings_id = ?')
      .get('default') as SqlRow | undefined
    if (row) {
      return {
        enabled: Boolean(row.enabled),
        thresholdsHours: JSON.parse(
          String(row.thresholds_hours_json),
        ) as number[],
        updatedAt: String(row.updated_at),
      }
    }
    const settings = defaultNotificationSettings(this.#clock)
    this.#writeSettings(settings)
    return settings
  }

  updateSettings(
    update: UpdateNotificationSettings,
  ): NotificationSettings {
    const current = this.getSettings()
    const parsed = notificationSettingsSchema.parse({
      enabled: update.enabled ?? current.enabled,
      thresholdsHours: update.thresholdsHours ?? current.thresholdsHours,
    })
    const settings: NotificationSettings = {
      ...parsed,
      updatedAt: this.#clock.now(),
    }
    this.#writeSettings(settings)
    return settings
  }

  #writeSettings(settings: NotificationSettings): void {
    inTransaction(this.#db, () => {
      this.#db
        .prepare(
          `INSERT INTO notification_settings (
             settings_id, enabled, thresholds_hours_json, updated_at
           ) VALUES ('default', ?, ?, ?)
           ON CONFLICT(settings_id) DO UPDATE SET
             enabled = excluded.enabled,
             thresholds_hours_json = excluded.thresholds_hours_json,
             updated_at = excluded.updated_at`,
        )
        .run(
          Number(settings.enabled),
          JSON.stringify(settings.thresholdsHours),
          settings.updatedAt,
        )
    })
  }

  list(limit = 20, options: { unreadOnly?: boolean } = {}): NotificationView[] {
    const bounded = Math.min(100, Math.max(1, Math.trunc(limit)))
    const rows = (
      options.unreadOnly
        ? this.#db
            .prepare(
              `SELECT * FROM notifications WHERE read_at IS NULL
               ORDER BY created_at DESC, rowid DESC LIMIT ?`,
            )
            .all(bounded)
        : this.#db
            .prepare(
              `SELECT * FROM notifications
               ORDER BY created_at DESC, rowid DESC LIMIT ?`,
            )
            .all(bounded)
    ) as SqlRow[]
    return rows.map((row) => this.#toView(row))
  }

  /** Thresholds already delivered for an item, used to avoid retroactive reminders. */
  reminderThresholds(itemId: string, consumerId: string): number[] {
    const rows = this.#db
      .prepare(
        `SELECT dedupe_key FROM notifications
         WHERE consumer_id = ? AND notification_type = 'deadline-reminder'
           AND dedupe_key LIKE ?`,
      )
      .all(consumerId, `deadline:${itemId}:%`) as SqlRow[]
    return rows
      .map((row) => Number(String(row.dedupe_key).split(':')[2]))
      .filter((value) => Number.isFinite(value))
  }

  unreadCount(): number {
    const row = this.#db
      .prepare('SELECT COUNT(*) AS count FROM notifications WHERE read_at IS NULL')
      .get() as SqlRow
    return Number(row.count)
  }

  markRead(notificationId: string): boolean {
    return inTransaction(this.#db, () => {
      const result = this.#db
        .prepare(
          'UPDATE notifications SET read_at = ? WHERE notification_id = ? AND read_at IS NULL',
        )
        .run(this.#clock.now(), notificationId)
      return Number(result.changes) > 0
    })
  }

  markAllRead(): number {
    const result = this.#db
      .prepare('UPDATE notifications SET read_at = ? WHERE read_at IS NULL')
      .run(this.#clock.now())
    return Number(result.changes)
  }

  #toView(row: SqlRow): NotificationView {
    return {
      notificationId: String(row.notification_id),
      consumerId: String(row.consumer_id),
      eventId: String(row.event_id),
      type: String(row.notification_type),
      title: String(row.title),
      body: String(row.body),
      createdAt: String(row.created_at),
      readAt: row.read_at == null ? undefined : String(row.read_at),
    }
  }
}
