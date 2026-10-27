import type { DatabaseSync } from 'node:sqlite'
import { z } from 'zod'
import {
  lockedBlockSchema,
  type Clock,
  type LockedBlock,
  type Range,
  type TimeBlock,
} from '@academic/contracts'
import { inTransaction, type SqlRow } from './database.js'
import { zonedDateTimeToUtc } from './time.js'

const AVAILABILITY_ID = 'default'
const DAY_MS = 86_400_000
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const

const timeOfDay = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Expected HH:mm')
const weeklySlotSchema = z
  .object({
    weekday: z.number().int().min(0).max(6),
    start: timeOfDay,
    end: timeOfDay,
  })
  .refine((slot) => minutesOfDay(slot.end) > minutesOfDay(slot.start), {
    message: 'Weekly slot end must be after start',
  })

export const availabilitySettingsSchema = z.object({
  timeZone: z.string().min(1).refine(isValidTimeZone, 'Invalid IANA time zone'),
  weeklySlots: z.array(weeklySlotSchema),
  temporaryBlocks: z.array(lockedBlockSchema),
  granularityMinutes: z.number().int().min(5).max(60),
})

export type WeeklySlot = z.infer<typeof weeklySlotSchema>
export type AvailabilitySettings = z.infer<typeof availabilitySettingsSchema> & {
  updatedAt: string
}

export interface AvailabilityUpdate {
  timeZone?: string
  weeklySlots?: WeeklySlot[]
  temporaryBlocks?: LockedBlock[]
  granularityMinutes?: number
}

function minutesOfDay(value: string): number {
  const [hour, minute] = value.split(':').map(Number)
  return (hour ?? 0) * 60 + (minute ?? 0)
}

function isValidTimeZone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone }).format()
    return true
  } catch {
    return false
  }
}

function overlaps(left: TimeBlock, right: TimeBlock): boolean {
  return (
    Date.parse(left.start) < Date.parse(right.end) &&
    Date.parse(right.start) < Date.parse(left.end)
  )
}

function defaultSettings(clock: Clock): AvailabilitySettings {
  const timeZone =
    new Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  const weeklySlots: WeeklySlot[] = []
  for (const weekday of [1, 2, 3, 4, 5]) {
    weeklySlots.push({ weekday, start: '19:00', end: '22:00' })
  }
  for (const weekday of [0, 6]) {
    weeklySlots.push({ weekday, start: '09:00', end: '12:00' })
    weeklySlots.push({ weekday, start: '14:00', end: '18:00' })
  }
  return {
    timeZone,
    weeklySlots,
    temporaryBlocks: [],
    granularityMinutes: 15,
    updatedAt: clock.now(),
  }
}

export class AvailabilityStore {
  readonly #db: DatabaseSync
  readonly #clock: Clock

  constructor(db: DatabaseSync, clock: Clock) {
    this.#db = db
    this.#clock = clock
  }

  get(): AvailabilitySettings {
    const row = this.#db
      .prepare('SELECT * FROM user_availability WHERE availability_id = ?')
      .get(AVAILABILITY_ID) as SqlRow | undefined
    if (row) return this.#toSettings(row)

    const defaults = defaultSettings(this.#clock)
    this.#write(defaults)
    return defaults
  }

  update(update: AvailabilityUpdate): AvailabilitySettings {
    const current = this.get()
    const next = availabilitySettingsSchema.parse({
      timeZone: update.timeZone ?? current.timeZone,
      weeklySlots: update.weeklySlots ?? current.weeklySlots,
      temporaryBlocks: update.temporaryBlocks ?? current.temporaryBlocks,
      granularityMinutes:
        update.granularityMinutes ?? current.granularityMinutes,
    })
    for (let index = 0; index < next.temporaryBlocks.length; index += 1) {
      for (let other = index + 1; other < next.temporaryBlocks.length; other += 1) {
        if (overlaps(next.temporaryBlocks[index]!, next.temporaryBlocks[other]!)) {
          throw new Error('Temporary unavailable blocks overlap')
        }
      }
    }
    const settings: AvailabilitySettings = {
      ...next,
      updatedAt: this.#clock.now(),
    }
    this.#write(settings)
    return settings
  }

  addTemporaryBlock(block: LockedBlock): AvailabilitySettings {
    const current = this.get()
    return this.update({
      temporaryBlocks: [...current.temporaryBlocks, block],
    })
  }

  removeTemporaryBlock(blockId: string): AvailabilitySettings {
    const current = this.get()
    if (!current.temporaryBlocks.some((block) => block.id === blockId)) {
      throw new Error(`Temporary block not found: ${blockId}`)
    }
    return this.update({
      temporaryBlocks: current.temporaryBlocks.filter(
        (block) => block.id !== blockId,
      ),
    })
  }

  #write(settings: AvailabilitySettings): void {
    inTransaction(this.#db, () => {
      this.#db
        .prepare(
          `INSERT INTO user_availability (
             availability_id, time_zone, weekly_slots_json,
             temporary_blocks_json, granularity_minutes, updated_at
           ) VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT(availability_id) DO UPDATE SET
             time_zone = excluded.time_zone,
             weekly_slots_json = excluded.weekly_slots_json,
             temporary_blocks_json = excluded.temporary_blocks_json,
             granularity_minutes = excluded.granularity_minutes,
             updated_at = excluded.updated_at`,
        )
        .run(
          AVAILABILITY_ID,
          settings.timeZone,
          JSON.stringify(settings.weeklySlots),
          JSON.stringify(settings.temporaryBlocks),
          settings.granularityMinutes,
          settings.updatedAt,
        )
    })
  }

  #toSettings(row: SqlRow): AvailabilitySettings {
    return {
      timeZone: String(row.time_zone),
      weeklySlots: JSON.parse(String(row.weekly_slots_json)) as WeeklySlot[],
      temporaryBlocks: JSON.parse(
        String(row.temporary_blocks_json),
      ) as LockedBlock[],
      granularityMinutes: Number(row.granularity_minutes),
      updatedAt: String(row.updated_at),
    }
  }
}

function localDateAndWeekday(
  zone: string,
  instant: Date,
): { date: string; weekday: number } {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
  })
  const parts: Record<string, string> = {}
  for (const part of formatter.formatToParts(instant)) {
    if (part.type !== 'literal') parts[part.type] = part.value
  }
  const weekday = WEEKDAYS.indexOf(
    parts.weekday as (typeof WEEKDAYS)[number],
  )
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    weekday: weekday >= 0 ? weekday : 0,
  }
}

/**
 * Returns the time inside `range` that is *not* covered by the user's weekly
 * availability, so the existing planner can subtract it as busy time.
 */
export function computeUnavailableBlocks(
  range: Range,
  settings: AvailabilitySettings,
): TimeBlock[] {
  const rangeStart = Date.parse(range.start)
  const rangeEnd = Date.parse(range.end)
  if (!Number.isFinite(rangeStart) || !Number.isFinite(rangeEnd) || rangeEnd <= rangeStart) {
    throw new Error('Invalid planning range')
  }

  const byWeekday = new Map<number, WeeklySlot[]>()
  for (const slot of settings.weeklySlots) {
    const entries = byWeekday.get(slot.weekday) ?? []
    entries.push(slot)
    byWeekday.set(slot.weekday, entries)
  }

  const allowed: Array<{ start: number; end: number }> = []
  const days = Math.ceil((rangeEnd - rangeStart) / DAY_MS) + 3
  for (let offset = -1; offset <= days; offset += 1) {
    const instant = new Date(rangeStart + offset * DAY_MS)
    const local = localDateAndWeekday(settings.timeZone, instant)
    for (const slot of byWeekday.get(local.weekday) ?? []) {
      const start = Date.parse(
        zonedDateTimeToUtc(
          local.date,
          ...splitTime(slot.start),
          settings.timeZone,
        ),
      )
      const end = Date.parse(
        zonedDateTimeToUtc(
          local.date,
          ...splitTime(slot.end),
          settings.timeZone,
        ),
      )
      if (end <= rangeStart || start >= rangeEnd) continue
      allowed.push({
        start: Math.max(start, rangeStart),
        end: Math.min(end, rangeEnd),
      })
    }
  }

  allowed.sort((left, right) => left.start - right.start || left.end - right.end)
  const merged: Array<{ start: number; end: number }> = []
  for (const interval of allowed) {
    const previous = merged[merged.length - 1]
    if (previous && interval.start <= previous.end) {
      previous.end = Math.max(previous.end, interval.end)
    } else {
      merged.push({ ...interval })
    }
  }

  const unavailable: TimeBlock[] = []
  let cursor = rangeStart
  for (const interval of merged) {
    if (interval.start > cursor) {
      unavailable.push({
        start: new Date(cursor).toISOString(),
        end: new Date(interval.start).toISOString(),
      })
    }
    cursor = Math.max(cursor, interval.end)
  }
  if (cursor < rangeEnd) {
    unavailable.push({
      start: new Date(cursor).toISOString(),
      end: new Date(rangeEnd).toISOString(),
    })
  }
  return unavailable
}

function splitTime(value: string): [number, number] {
  const [hour, minute] = value.split(':').map(Number)
  return [hour ?? 0, minute ?? 0]
}
