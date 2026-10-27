import type { DatabaseSync } from 'node:sqlite'
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
           notification_type, title, body, created_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
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
      )
    return Number(result.changes) > 0
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
