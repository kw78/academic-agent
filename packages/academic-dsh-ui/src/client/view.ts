import type { Due, LockedBlock, PlanBlock } from '@academic/contracts'
import type { ItemCard, TaskCard } from '../protocol.js'

export type DueTone = 'overdue' | 'today' | 'soon' | 'later' | 'unknown'

export interface DueDisplay {
  label: string
  tone: DueTone
  exact: boolean
  note?: string
}

export interface TaskFilters {
  courseId: string
  kind: 'all' | 'assignment' | 'exam' | 'quiz'
  due: 'all' | 'today' | 'week' | 'overdue' | 'unknown' | 'unscheduled'
  status: 'active' | 'completed' | 'all'
}

export const DEFAULT_TASK_FILTERS: TaskFilters = {
  courseId: 'all',
  kind: 'all',
  due: 'all',
  status: 'active',
}

const DATE_FORMATTERS = new Map<string, Intl.DateTimeFormat>()

function dateFormatter(timeZone: string): Intl.DateTimeFormat {
  const key = `date:${timeZone}`
  const existing = DATE_FORMATTERS.get(key)
  if (existing) return existing
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  DATE_FORMATTERS.set(key, formatter)
  return formatter
}

const DATE_TIME_FORMATTERS = new Map<string, Intl.DateTimeFormat>()

function dateTimeFormatter(timeZone: string): Intl.DateTimeFormat {
  const key = `datetime:${timeZone}`
  const existing = DATE_TIME_FORMATTERS.get(key)
  if (existing) return existing
  const formatter = new Intl.DateTimeFormat('zh-CN', {
    timeZone,
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
  DATE_TIME_FORMATTERS.set(key, formatter)
  return formatter
}

export function localDate(value: string | Date, timeZone: string): string {
  const instant = value instanceof Date ? value : new Date(value)
  return dateFormatter(timeZone).format(instant)
}

export function addDays(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number)
  if (!year || !month || !day) return date
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10)
}

export function formatDate(value: string, timeZone: string): string {
  return dateFormatter(timeZone).format(new Date(value))
}

export function formatDateTime(value: string, timeZone: string): string {
  return dateTimeFormatter(timeZone).format(new Date(value))
}

export function formatDateTimeOrDash(
  value: string | undefined,
  timeZone: string,
): string {
  return value ? formatDateTime(value, timeZone) : '—'
}

export function formatMinutes(minutes: number): string {
  if (!Number.isFinite(minutes)) return '—'
  if (minutes < 60) return `${Math.max(0, Math.round(minutes))} 分钟`
  const hours = Math.floor(minutes / 60)
  const rest = Math.round(minutes % 60)
  return rest === 0 ? `${hours} 小时` : `${hours} 小时 ${rest} 分钟`
}

export function formatDue(
  due: Due | undefined,
  timeZone: string,
  now = new Date().toISOString(),
): DueDisplay {
  if (!due) {
    return {
      label: '截止时间未知',
      tone: 'unknown',
      exact: false,
      note: '未提供截止时间，不会猜成确定日期',
    }
  }
  const today = localDate(now, timeZone)
  switch (due.kind) {
    case 'instant': {
      const date = localDate(due.utc, timeZone)
      const tone: DueTone =
        Date.parse(due.utc) < Date.parse(now)
          ? 'overdue'
          : date === today
            ? 'today'
            : date <= addDays(today, 7)
              ? 'soon'
              : 'later'
      return {
        label: formatDateTime(due.utc, timeZone),
        tone,
        exact: true,
      }
    }
    case 'local-date': {
      const tone: DueTone =
        due.date < today
          ? 'overdue'
          : due.date === today
            ? 'today'
            : due.date <= addDays(today, 7)
              ? 'soon'
              : 'later'
      return {
        label: `${due.date}（仅日期）`,
        tone,
        exact: false,
        note: '来源只提供日期，未当作午夜时间',
      }
    }
    case 'unknown':
      return {
        label: '截止时间未知',
        tone: 'unknown',
        exact: false,
        note: '来源未提供截止时间',
      }
  }
}

export function isTaskOverdue(card: TaskCard, timeZone: string, now: string): boolean {
  return formatDue(card.effectiveDue, timeZone, now).tone === 'overdue'
}

export function taskMatches(
  card: TaskCard,
  filters: TaskFilters,
  timeZone: string,
  now: string,
): boolean {
  if (filters.status !== 'all' && card.task.status !== filters.status) return false
  if (filters.courseId !== 'all' && card.item?.courseId !== filters.courseId) return false
  if (filters.kind !== 'all' && card.item?.kind !== filters.kind) return false
  const due = formatDue(card.effectiveDue, timeZone, now)
  switch (filters.due) {
    case 'all':
      break
    case 'today':
      if (due.tone !== 'today') return false
      break
    case 'week':
      if (due.tone !== 'today' && due.tone !== 'soon' && due.tone !== 'overdue') return false
      break
    case 'overdue':
      if (due.tone !== 'overdue') return false
      break
    case 'unknown':
      if (due.tone !== 'unknown') return false
      break
    case 'unscheduled':
      if (card.planned) return false
      break
  }
  return true
}

export function filterTaskCards(
  cards: TaskCard[],
  filters: TaskFilters,
  timeZone: string,
  now = new Date().toISOString(),
): TaskCard[] {
  return cards
    .filter((card) => taskMatches(card, filters, timeZone, now))
    .sort((left, right) => {
      const leftDue = left.effectiveDue
      const rightDue = right.effectiveDue
      const leftKey = dueKey(leftDue)
      const rightKey = dueKey(rightDue)
      if (leftKey !== rightKey) return leftKey.localeCompare(rightKey)
      return left.task.title.localeCompare(right.task.title, 'zh-CN')
    })
}

function dueKey(due: Due | undefined): string {
  if (!due) return '9999-12-31T23:59:59.999Z'
  switch (due.kind) {
    case 'instant':
      return due.utc
    case 'local-date':
      return `${due.date}T23:59:59.999Z`
    case 'unknown':
      return '9999-12-31T23:59:59.999Z'
  }
}

export function groupBlocksByDate(
  blocks: PlanBlock[],
  timeZone: string,
): Array<{ date: string; blocks: PlanBlock[] }> {
  const groups = new Map<string, PlanBlock[]>()
  for (const block of blocks) {
    const date = localDate(block.start, timeZone)
    const entries = groups.get(date) ?? []
    entries.push(block)
    groups.set(date, entries)
  }
  return [...groups.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([date, entries]) => ({
      date,
      blocks: [...entries].sort((a, b) => a.start.localeCompare(b.start)),
    }))
}

function weekStart(date: string): string {
  const [year, month, day] = date.split('-').map(Number)
  if (!year || !month || !day) return date
  const value = new Date(Date.UTC(year, month - 1, day))
  const offset = (value.getUTCDay() + 6) % 7
  value.setUTCDate(value.getUTCDate() - offset)
  return value.toISOString().slice(0, 10)
}

export function groupBlocksByWeek(
  blocks: PlanBlock[],
  timeZone: string,
): Array<{ date: string; endDate: string; blocks: PlanBlock[] }> {
  const groups = new Map<string, PlanBlock[]>()
  for (const block of blocks) {
    const key = weekStart(localDate(block.start, timeZone))
    const entries = groups.get(key) ?? []
    entries.push(block)
    groups.set(key, entries)
  }
  return [...groups.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([date, entries]) => ({
      date,
      endDate: addDays(date, 6),
      blocks: [...entries].sort((a, b) => a.start.localeCompare(b.start)),
    }))
}

export function sortPlanBlocks(blocks: PlanBlock[]): PlanBlock[] {
  return [...blocks].sort((left, right) => left.start.localeCompare(right.start))
}

export function groupLockedByDate(
  blocks: LockedBlock[],
  timeZone: string,
): Array<{ date: string; blocks: LockedBlock[] }> {
  const groups = new Map<string, LockedBlock[]>()
  for (const block of blocks) {
    const date = localDate(block.start, timeZone)
    const entries = groups.get(date) ?? []
    entries.push(block)
    groups.set(date, entries)
  }
  return [...groups.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([date, entries]) => ({
      date,
      blocks: [...entries].sort((a, b) => a.start.localeCompare(b.start)),
    }))
}

export function weekdayLabel(date: string): string {
  const [year, month, day] = date.split('-').map(Number)
  if (!year || !month || !day) return ''
  return new Intl.DateTimeFormat('zh-CN', { weekday: 'short' }).format(
    new Date(Date.UTC(year, month - 1, day)),
  )
}

export function sourceStateLabel(state: string): string {
  switch (state) {
    case 'unconfigured':
      return '未配置'
    case 'configured':
      return '已保存凭据，未验证'
    case 'connected':
      return '已连接'
    case 'auth-required':
      return '需要重新认证'
    case 'error':
      return '同步失败'
    case 'disconnected':
      return '已断开'
    case 'unavailable':
      return '当前版本不支持'
    case 'degraded':
      return '同步降级'
    default:
      return state
  }
}

export function sourceStateTone(
  state: string,
): 'ok' | 'warn' | 'bad' | 'neutral' {
  switch (state) {
    case 'connected':
      return 'ok'
    case 'auth-required':
    case 'configured':
      return 'warn'
    case 'error':
    case 'unavailable':
    case 'degraded':
      return 'bad'
    default:
      return 'neutral'
  }
}

export function jobLabel(jobId: string): string {
  switch (jobId) {
    case 'fixture-lms-sync':
      return '数据源同步'
    case 'planner.process-replans':
      return '计划重算'
    case 'academic.reminders.scan':
      return '截止提醒扫描'
    default:
      return jobId
  }
}

export function runStatusLabel(status: string): string {
  switch (status) {
    case 'running':
      return '运行中'
    case 'succeeded':
      return '成功'
    case 'failed':
      return '失败'
    case 'interrupted':
      return '已中断'
    case 'paused':
      return '已暂停'
    default:
      return status
  }
}

export function syncStatusLabel(status: string): string {
  switch (status) {
    case 'success':
      return '成功'
    case 'partial':
      return '部分成功'
    case 'failed':
      return '失败'
    case 'auth-required':
      return '需要认证'
    case 'running':
      return '运行中'
    default:
      return status
  }
}

export function planStatusLabel(status: string): string {
  return status === 'active' ? '已确认' : '已归档'
}

export function toLocalInputValue(iso: string): string {
  const date = new Date(iso)
  const offset = date.getTimezoneOffset() * 60_000
  return new Date(date.getTime() - offset).toISOString().slice(0, 16)
}

export function fromLocalInputValue(value: string): string | undefined {
  if (!value) return undefined
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString()
}

export function itemDueText(item: ItemCard, timeZone: string, now: string): string {
  return formatDue(item.item.due, timeZone, now).label
}
