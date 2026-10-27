import type { Due } from '@academic/contracts'

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
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(hour),
    Number(parts.minute),
    Number(parts.second),
  )
  return asUtc - truncated.getTime()
}

function zonedTimeToUtc(
  date: string,
  hour: number,
  minute: number,
  second: number,
  millisecond: number,
  zone: string,
): string {
  const [year, month, day] = date.split('-').map(Number)
  if (!year || !month || !day) throw new Error(`Invalid local date: ${date}`)
  const guess = Date.UTC(year, month - 1, day, hour, minute, second, millisecond)
  const firstOffset = zoneOffsetMs(zone, new Date(guess))
  const adjusted = guess - firstOffset
  const secondOffset = zoneOffsetMs(zone, new Date(adjusted))
  return new Date(guess - secondOffset).toISOString()
}

export function zonedDateTimeToUtc(
  date: string,
  hour: number,
  minute: number,
  zone: string,
): string {
  return zonedTimeToUtc(date, hour, minute, 0, 0, zone)
}

/**
 * Date-only deadlines are interpreted as the end of that day in the source
 * zone for planning purposes. The stored due value itself is never rewritten.
 */
export function endOfDayUtc(date: string, zone: string): string {
  return zonedTimeToUtc(date, 23, 59, 59, 999, zone)
}

export function deadlineForDue(
  due: Due,
  fallbackZone = 'UTC',
): { deadline?: string; warning?: string } {
  switch (due.kind) {
    case 'instant':
      return { deadline: due.utc }
    case 'local-date': {
      const zone = due.zone ?? fallbackZone
      try {
        return {
          deadline: endOfDayUtc(due.date, zone),
          warning: `date-only deadline ${due.date} planned against end of day in ${zone}`,
        }
      } catch {
        return { warning: `unresolvable time zone ${zone}; deadline ignored` }
      }
    }
    case 'unknown':
      return { warning: 'deadline is unknown; task is planned without a deadline' }
  }
}
