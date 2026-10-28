import { describe, expect, it } from 'vitest'
import type { AcademicItemView, CourseView } from '@academic/contracts'
import type { TaskCard } from '../../packages/academic-dsh-ui/src/protocol.js'
import {
  DEFAULT_TASK_FILTERS,
  filterTaskCards,
  formatDue,
  groupBlocksByDate,
  groupBlocksByWeek,
  sourceAuthenticationLabel,
  sourceConfigurationLabel,
  sourceStateLabel,
  sourceStateTone,
  sourceSyncHealthLabel,
  sourceSyncHealthTone,
} from '../../packages/academic-dsh-ui/src/client/view.js'
import {
  initialLoad,
  loadFailure,
  loadSuccess,
  viewState,
} from '../../packages/academic-dsh-ui/src/client/state.js'

const NOW = '2026-10-27T10:00:00.000Z'
const ZONE = 'Asia/Shanghai'

function item(overrides: Partial<AcademicItemView> = {}): AcademicItemView {
  return {
    itemId: 'item-1',
    courseId: 'course-1',
    kind: 'assignment',
    title: 'Problem Set',
    due: { kind: 'instant', utc: '2026-10-27T15:00:00.000Z', zone: 'UTC' },
    source: {
      sourceId: 'fixture-lms',
      externalItemId: 'ext-1',
      sourceObservedAt: NOW,
      contentHash: 'hash',
    },
    progress: { status: 'not-started', percent: 0 },
    archived: false,
    createdAt: NOW,
    updatedAt: NOW,
    version: 1,
    ...overrides,
  }
}

function course(): CourseView {
  return {
    courseId: 'course-1',
    termId: '2026-fall',
    code: 'CS101',
    title: 'Computer Science',
    archived: false,
    deleted: false,
    createdAt: NOW,
    updatedAt: NOW,
    version: 1,
  }
}

function task(
  overrides: Partial<TaskCard['task']> = {},
  extra: Partial<TaskCard> = {},
): TaskCard {
  return {
    task: {
      taskId: 'task-1',
      title: 'Review',
      estimateMinutes: 60,
      priority: 1,
      status: 'active',
      archived: false,
      createdAt: NOW,
      updatedAt: NOW,
      version: 1,
      ...overrides,
    },
    item: item(),
    course: course(),
    effectiveDue: { kind: 'instant', utc: '2026-10-27T15:00:00.000Z', zone: 'UTC' },
    dueSource: 'item',
    planned: false,
    ...extra,
  }
}

describe('UI due presentation', () => {
  it('keeps exact instants and marks today/overdue', () => {
    expect(formatDue({ kind: 'instant', utc: '2026-10-27T15:00:00.000Z', zone: 'UTC' }, ZONE, NOW)).toMatchObject({
      tone: 'today',
      exact: true,
    })
    expect(formatDue({ kind: 'instant', utc: '2026-10-26T15:00:00.000Z', zone: 'UTC' }, ZONE, NOW).tone).toBe('overdue')
    expect(formatDue({ kind: 'instant', utc: '2026-10-30T15:00:00.000Z', zone: 'UTC' }, ZONE, NOW).tone).toBe('soon')
  })

  it('shows date-only deadlines as date-only and never as midnight', () => {
    const display = formatDue({ kind: 'local-date', date: '2026-11-10' }, ZONE, NOW)
    expect(display.label).toContain('仅日期')
    expect(display.exact).toBe(false)
    expect(display.note).toContain('未当作午夜')
  })

  it('shows unknown deadlines explicitly', () => {
    const display = formatDue({ kind: 'unknown' }, ZONE, NOW)
    expect(display.tone).toBe('unknown')
    expect(display.exact).toBe(false)
    expect(display.label).toContain('未知')
  })
})

describe('task filtering', () => {
  const base = task()

  it('filters by course, type, due and status', () => {
    expect(
      filterTaskCards([base], { courseId: 'course-1', kind: 'assignment', due: 'today', status: 'active' }, ZONE, NOW),
    ).toHaveLength(1)
    expect(
      filterTaskCards([base], { ...{ courseId: 'other', kind: 'all' as const, due: 'all' as const, status: 'active' as const } }, ZONE, NOW),
    ).toHaveLength(0)
    expect(
      filterTaskCards([base], { courseId: 'all', kind: 'all', due: 'all', status: 'completed' }, ZONE, NOW),
    ).toHaveLength(0)
  })

  it('filters by task or source title', () => {
    const filters = { ...DEFAULT_TASK_FILTERS, search: 'problem' }
    expect(filterTaskCards([base], filters, ZONE, NOW)).toHaveLength(1)
    expect(
      filterTaskCards([base], { ...DEFAULT_TASK_FILTERS, search: 'lecture' }, ZONE, NOW),
    ).toHaveLength(0)
  })

  it('filters unscheduled tasks separately from planned ones', () => {
    const planned = task({}, { planned: true })
    const filters = { courseId: 'all', kind: 'all' as const, due: 'unscheduled' as const, status: 'all' as const }
    expect(filterTaskCards([base, planned], filters, ZONE, NOW)).toHaveLength(1)
  })

  it('groups plan blocks by local date', () => {
    const groups = groupBlocksByDate(
      [
        { taskId: 'a', start: '2026-10-27T01:00:00.000Z', end: '2026-10-27T02:00:00.000Z' },
        { taskId: 'a', start: '2026-10-28T01:00:00.000Z', end: '2026-10-28T02:00:00.000Z' },
      ],
      ZONE,
    )
    expect(groups.map((group) => group.date)).toEqual(['2026-10-27', '2026-10-28'])
  })

  it('groups plan blocks by week for the week view', () => {
    const groups = groupBlocksByWeek(
      [
        { taskId: 'a', start: '2026-10-27T01:00:00.000Z', end: '2026-10-27T02:00:00.000Z' },
        { taskId: 'a', start: '2026-10-28T01:00:00.000Z', end: '2026-10-28T02:00:00.000Z' },
        { taskId: 'a', start: '2026-11-02T01:00:00.000Z', end: '2026-11-02T02:00:00.000Z' },
      ],
      ZONE,
    )
    expect(groups.map((group) => group.date)).toEqual(['2026-10-26', '2026-11-02'])
    expect(groups[0]?.blocks).toHaveLength(2)
  })
})

describe('load state transitions', () => {
  it('keeps previous data as stale when a refresh fails', () => {
    const loaded = loadSuccess({ value: 1 }, NOW)
    const failed = loadFailure(loaded, { code: 'ERROR', message: 'network' })
    expect(failed.data).toEqual({ value: 1 })
    expect(failed.stale).toBe(true)
    expect(viewState(failed)).toBe('stale')
  })

  it('distinguishes unavailable from empty', () => {
    expect(viewState(initialLoad<unknown>())).toBe('loading')
    expect(viewState(loadSuccess<unknown[]>([], NOW), (value) => value.length === 0)).toBe('empty')
    expect(
      viewState(loadFailure(initialLoad<unknown>(), { code: 'UNAVAILABLE', message: 'offline' })),
    ).toBe('unavailable')
    expect(
      viewState(loadFailure(initialLoad<unknown>(), { code: 'AUTH_REQUIRED', message: 'login' })),
    ).toBe('auth-required')
  })
})

describe('source status labels', () => {
  it('does not call a saved credential connected', () => {
    expect(sourceStateLabel('configured')).toBe('已配置')
    expect(sourceStateLabel('connected')).toBe('已连接')
    expect(sourceStateTone('configured')).toBe('warn')
    expect(sourceStateTone('unavailable')).toBe('bad')
    expect(sourceConfigurationLabel('disabled')).toBe('已停用')
    expect(sourceAuthenticationLabel('saved')).toBe('会话已保存')
    expect(sourceAuthenticationLabel('verified')).toBe('会话已验证')
    expect(sourceSyncHealthLabel('healthy')).toBe('同步正常')
    expect(sourceSyncHealthLabel('stale')).toBe('同步过期')
    expect(sourceSyncHealthTone('failed')).toBe('bad')
    expect(sourceSyncHealthTone('healthy')).toBe('ok')
  })
})
