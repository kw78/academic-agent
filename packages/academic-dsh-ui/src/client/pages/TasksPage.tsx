import { useCallback, useEffect, useMemo, useState } from 'react'
import type { AcademicItemView } from '@academic/contracts'
import { callApi } from '../api.js'
import {
  Badge,
  ConfirmAction,
  EmptyState,
  Field,
  LoadingLine,
  NoticeBar,
  Section,
  StateBanner,
} from '../components.js'
import { useAction, useLoad } from '../hooks.js'
import { viewState } from '../state.js'
import {
  DEFAULT_TASK_FILTERS,
  formatDateTimeOrDash,
  formatDue,
  formatMinutes,
  type DueTone,
  type TaskFilters,
} from '../view.js'
import type {
  CommandReceipt,
  ItemCard,
  TasksView,
  TaskCard,
  UiResult,
} from '../../protocol.js'
import { askAgent, type PageProps } from './types.js'

function kindLabel(kind: AcademicItemView['kind']): string {
  switch (kind) {
    case 'assignment':
      return '作业'
    case 'exam':
      return '考试'
    case 'quiz':
      return '测验'
  }
}

function toneForDue(tone: DueTone): 'ok' | 'warn' | 'bad' | 'neutral' | 'info' {
  switch (tone) {
    case 'overdue':
      return 'bad'
    case 'today':
      return 'warn'
    case 'soon':
      return 'info'
    default:
      return 'neutral'
  }
}

function tutorPrompt(
  card: TaskCard | ItemCard,
  timeZone: string,
  now: string,
): string {
  const course = card.course
  const item = 'item' in card ? card.item : undefined
  const task = 'task' in card ? card.task : undefined
  const due = 'task' in card ? card.effectiveDue : item?.due
  const lines = [
    '帮我看看下面这项学习内容该怎么入手，给我一个可以先做的小步骤。',
    `课程：${course ? `${course.code} ${course.title}` : '未关联课程'}`,
    task ? `本地任务：${task.title}` : undefined,
    item
      ? `来源事项：${item.title}（${kindLabel(item.kind)}，数据源 ${item.source.sourceId}）`
      : undefined,
    due ? `本地记录的截止：${formatDue(due, timeZone, now).label}` : '本地没有截止时间',
    '先用只读工具核对相关记录（如 academic_get_item、academic_get_study_plan）。解释建议的依据，用“记录中显示”或“建议先”等自然表述区分记录和建议。',
    '如果需要题目或课件，请先检索已导入的资料；没有找到就说明缺少什么，不要仅凭标题猜题。只提供讲解和建议，不修改数据。',
  ].filter((line): line is string => Boolean(line))
  return lines.join('\n')
}

function toLocalDateTimeInput(iso: string | undefined): string {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16)
}

function fromLocalDateTimeInput(value: string): string | null {
  if (!value.trim()) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

function TaskRow({
  card,
  timeZone,
  now,
  pending,
  highlight,
  onComplete,
  onReopen,
  onUpdate,
  onArchive,
  onRestore,
  onAsk,
}: {
  card: TaskCard
  timeZone: string
  now: string
  pending: boolean
  highlight?: boolean
  onComplete: () => void
  onReopen: () => void
  onUpdate: (input: {
    title?: string
    dueAt?: string | null
    priority?: number
    estimateMinutes?: number
  }) => Promise<boolean>
  onArchive: () => void
  onRestore: () => void
  onAsk: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(card.task.title)
  const [estimate, setEstimate] = useState(String(card.task.estimateMinutes))
  const [priority, setPriority] = useState(String(card.task.priority))
  const [dueInput, setDueInput] = useState(toLocalDateTimeInput(card.task.dueAt))
  const due = formatDue(card.effectiveDue, timeZone, now)
  const completed = card.task.status === 'completed'
  const archived = card.task.archived

  const save = async () => {
    const minutes = Number(estimate)
    if (!title.trim() || !Number.isFinite(minutes) || minutes < 5) return
    const ok = await onUpdate({
      title: title.trim(),
      estimateMinutes: Math.round(minutes),
      priority: Number(priority) || 0,
      dueAt: fromLocalDateTimeInput(dueInput),
    })
    if (ok) setEditing(false)
  }

  if (archived) {
    return (
      <li
        id={`ac-task-${card.task.taskId}`}
        tabIndex={-1}
        className={`ac-task-row ac-task-completed${highlight ? ' ac-task-highlight' : ''}`}
      >
        <div className="ac-task-main">
          <div className="ac-task-title">
            <strong>{card.task.title}</strong>
            <Badge tone="bad">已删除</Badge>
          </div>
          <div className="ac-task-meta">
            <span>{card.course?.code ?? '本地任务'}</span>
            <span>预计 {formatMinutes(card.task.estimateMinutes)}</span>
            <span>删除后不再参与计划；恢复后继续参与</span>
          </div>
        </div>
        <div className="ac-task-actions">
          <button
            type="button"
            className="ac-button"
            disabled={pending}
            onClick={onRestore}
          >
            恢复任务
          </button>
        </div>
      </li>
    )
  }

  return (
    <li
      id={`ac-task-${card.task.taskId}`}
      tabIndex={-1}
      className={`ac-task-row${completed ? ' ac-task-completed' : ''}${highlight ? ' ac-task-highlight' : ''}`}
    >
      <button
        type="button"
        className={completed ? 'ac-check ac-check-done' : 'ac-check'}
        aria-label={completed ? `重开任务：${card.task.title}` : `完成任务：${card.task.title}`}
        aria-pressed={completed}
        disabled={pending}
        onClick={completed ? onReopen : onComplete}
      >
        <span aria-hidden="true">{completed ? '✓' : ''}</span>
      </button>
      <div className="ac-task-main">
        <div className="ac-task-title">
          <strong>{card.task.title}</strong>
          {completed && <Badge tone="ok">本地已完成</Badge>}
          {!completed && !card.planned && <Badge tone="warn">未被计划安排</Badge>}
        </div>
        {editing ? (
          <div className="ac-form-grid">
            <Field label="标题">
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                maxLength={500}
              />
            </Field>
            <Field label="预计时长（分钟）">
              <input
                type="number"
                min={5}
                max={1440}
                value={estimate}
                onChange={(event) => setEstimate(event.target.value)}
              />
            </Field>
            <Field label="优先级（0–3）">
              <input
                type="number"
                min={0}
                max={3}
                value={priority}
                onChange={(event) => setPriority(event.target.value)}
              />
            </Field>
            <Field label="本地截止（可留空）">
              <input
                type="datetime-local"
                value={dueInput}
                onChange={(event) => setDueInput(event.target.value)}
              />
            </Field>
          </div>
        ) : (
          <div className="ac-task-meta">
            <span>{card.course?.code ?? '本地任务'}</span>
            {card.item && <span>{kindLabel(card.item.kind)}</span>}
            <span>
              {card.dueSource === 'item' ? '来源截止' : card.dueSource === 'task' ? '本地截止' : '无截止'}：
              {due.label}
            </span>
            {due.note && <span className="ac-muted">{due.note}</span>}
            <span>预计 {formatMinutes(card.task.estimateMinutes)}</span>
            {card.item?.sourceUrl && (
              <a
                className="ac-link"
                href={card.item.sourceUrl}
                target="_blank"
                rel="noreferrer noopener"
              >
                来源链接
              </a>
            )}
          </div>
        )}
        <p className="ac-muted ac-task-note">
          本地任务状态与学校提交状态分开保存；标记完成不会提交学校作业。
        </p>
      </div>
      <div className="ac-task-actions">
        <Badge tone={toneForDue(due.tone)}>{due.label}</Badge>
        {editing ? (
          <>
            <button
              type="button"
              className="ac-button ac-button-primary"
              disabled={pending}
              onClick={() => void save()}
            >
              保存
            </button>
            <button type="button" className="ac-button" onClick={() => setEditing(false)}>
              取消
            </button>
          </>
        ) : (
          <>
            <button type="button" className="ac-button" onClick={() => setEditing(true)}>
              编辑任务
            </button>
            <ConfirmAction
              label="删除任务"
              confirmLabel="确认删除任务"
              disabled={pending}
              onConfirm={onArchive}
            />
          </>
        )}
        <button type="button" className="ac-button" onClick={onAsk}>
          请教 Agent
        </button>
      </div>
    </li>
  )
}

function ItemRow({
  card,
  timeZone,
  now,
  pending,
  onArchive,
  onRestore,
  onAsk,
}: {
  card: ItemCard
  timeZone: string
  now: string
  pending: boolean
  onArchive: () => void
  onRestore: () => void
  onAsk: () => void
}) {
  const due = formatDue(card.item.due, timeZone, now)
  return (
    <li id={`ac-item-${card.item.itemId}`} tabIndex={-1} className="ac-item-row">
      <div>
        <div className="ac-task-title">
          <strong>{card.item.title}</strong>
          <Badge tone="info">{kindLabel(card.item.kind)}</Badge>
          {card.item.archived && <Badge tone="bad">已归档</Badge>}
          {card.item.progress.status !== 'not-started' && (
            <Badge tone="neutral">进度 {card.item.progress.percent}%</Badge>
          )}
        </div>
        <div className="ac-task-meta">
          <span>{card.course?.code ?? card.item.courseId}</span>
          <span>来源：{card.item.source.sourceId}</span>
          <span>源更新：{formatDateTimeOrDash(card.item.source.sourceUpdatedAt, timeZone)}</span>
          {card.item.sourceUrl && (
            <a
              className="ac-link"
              href={card.item.sourceUrl}
              target="_blank"
              rel="noreferrer noopener"
            >
              打开来源
            </a>
          )}
        </div>
        <p className="ac-muted ac-task-note">
          {card.item.archived
            ? '已归档：同步会跳过该事项；恢复后继续接收来源更新。'
            : '来自平台同步。这里尚未接入学校的提交状态，本地完成标记只用于记录学习进度。'}
        </p>
      </div>
      <div className="ac-item-due">
        <Badge tone={toneForDue(due.tone)}>{due.label}</Badge>
        {due.note && <span className="ac-muted">{due.note}</span>}
        {card.item.archived ? (
          <button
            type="button"
            className="ac-button"
            disabled={pending}
            onClick={onRestore}
          >
            恢复事项
          </button>
        ) : (
          <ConfirmAction
            label="归档事项"
            confirmLabel="确认归档"
            disabled={pending}
            onConfirm={onArchive}
          />
        )}
        <button type="button" className="ac-button" onClick={onAsk}>
          请教 Agent
        </button>
      </div>
    </li>
  )
}

const TASK_PAGE_SIZE = 200

export function TasksPage({ ctx, active, nav }: PageProps) {
  const [filters, setFilters] = useState<TaskFilters>(DEFAULT_TASK_FILTERS)
  const [pane, setPane] = useState<'tasks' | 'items' | 'review'>('tasks')
  const [showArchived, setShowArchived] = useState(false)
  const [offset, setOffset] = useState(0)
  const [searchDraft, setSearchDraft] = useState('')
  const [creating, setCreating] = useState(false)
  const [title, setTitle] = useState('')
  const [estimate, setEstimate] = useState('60')
  const [itemId, setItemId] = useState('')
  const [priority, setPriority] = useState('1')

  useEffect(() => {
    if (!nav?.nonce) return
    if (nav.pane) setPane(nav.pane)
    if (nav.create) setCreating(true)
    setFilters((current) => ({
      ...current,
      ...(nav.courseId ? { courseId: nav.courseId } : {}),
      ...(nav.due ? { due: nav.due } : {}),
      ...(nav.status ? { status: nav.status } : {}),
    }))
    setOffset(0)
  }, [nav?.nonce])

  const request = useMemo(
    () => ({
      status: filters.status,
      includeArchived: showArchived,
      ...(filters.courseId !== 'all' ? { courseId: filters.courseId } : {}),
      ...(filters.kind !== 'all' ? { kind: filters.kind } : {}),
      ...(filters.due !== 'all' ? { due: filters.due } : {}),
      ...(filters.search?.trim() ? { search: filters.search.trim() } : {}),
      limit: TASK_PAGE_SIZE,
      offset,
    }),
    [filters, offset, showArchived],
  )
  const requestKey = JSON.stringify(request)
  const load = useCallback(
    (signal: AbortSignal) => callApi<TasksView>(ctx, 'tasks', request, signal),
    [ctx, request],
  )
  const { state, refresh } = useLoad(load, active, 0, requestKey)
  const action = useAction(refresh)
  const view = viewState(state)
  const data = state.data
  const timeZone = data?.timeZone ?? 'UTC'
  const now = new Date().toISOString()

  useEffect(() => {
    setOffset(0)
  }, [filters, showArchived])

  useEffect(() => {
    if (!data) return
    const id = nav?.taskId
      ? `ac-task-${nav.taskId}`
      : nav?.itemId
        ? `ac-item-${nav.itemId}`
        : undefined
    if (!id) return
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        document
          .getElementById(id)
          ?.scrollIntoView({ block: 'center', behavior: 'smooth' })
      })
    })
  }, [data, nav?.itemId, nav?.nonce, nav?.taskId])

  const visibleTasks = data?.cards ?? []
  const visibleItems = useMemo(() => {
    if (!data) return []
    const rank: Record<DueTone, number> = {
      overdue: 0,
      today: 1,
      soon: 2,
      later: 3,
      unknown: 4,
    }
    return data.items
      .filter((card) => showArchived || !card.item.archived)
      .filter((card) => filters.courseId === 'all' || card.item.courseId === filters.courseId)
      .filter((card) => filters.kind === 'all' || card.item.kind === filters.kind)
      .filter((card) => {
        const needle = filters.search?.trim().toLocaleLowerCase('zh-CN')
        return !needle || card.item.title.toLocaleLowerCase('zh-CN').includes(needle)
      })
      .filter((card) => {
        if (filters.due === 'all') return true
        const tone = formatDue(card.item.due, timeZone, now).tone
        if (filters.due === 'unknown') return tone === 'unknown'
        if (filters.due === 'overdue') return tone === 'overdue'
        if (filters.due === 'today') return tone === 'today'
        if (filters.due === 'week') return tone !== 'later' && tone !== 'unknown'
        return true
      })
      .sort((left, right) => {
        const leftTone = formatDue(left.item.due, timeZone, now).tone
        const rightTone = formatDue(right.item.due, timeZone, now).tone
        if (rank[leftTone] !== rank[rightTone]) return rank[leftTone] - rank[rightTone]
        return left.item.title.localeCompare(right.item.title, 'zh-CN')
      })
  }, [data, filters, timeZone, now, showArchived])

  const reviewGroups = useMemo(() => {
    if (!data) return []
    const tasksByItem = new Map<string, TaskCard[]>()
    for (const card of data.cards) {
      if (!card.item || card.task.archived) continue
      const list = tasksByItem.get(card.item.itemId) ?? []
      list.push(card)
      tasksByItem.set(card.item.itemId, list)
    }
    const plannedTaskIds = new Set(data.planBlocks.map((block) => block.taskId))
    const rank: Record<DueTone, number> = {
      overdue: 0,
      today: 1,
      soon: 2,
      later: 3,
      unknown: 4,
    }
    const groups = new Map<
      string,
      {
        key: string
        label: string
        entries: Array<{
          card: ItemCard
          tasks: TaskCard[]
          planned: boolean
        }>
      }
    >()
    for (const card of data.items) {
      if (card.item.archived) continue
      if (card.item.kind !== 'exam' && card.item.kind !== 'quiz') continue
      const key = card.item.courseId
      const group = groups.get(key) ?? {
        key,
        label: card.course
          ? `${card.course.code} ${card.course.title}`
          : card.item.courseId,
        entries: [],
      }
      const tasks = tasksByItem.get(card.item.itemId) ?? []
      group.entries.push({
        card,
        tasks,
        planned: tasks.some((task) => plannedTaskIds.has(task.task.taskId)),
      })
      groups.set(key, group)
    }
    return [...groups.values()]
      .sort((left, right) => left.label.localeCompare(right.label, 'zh-CN'))
      .map((group) => ({
        ...group,
        entries: group.entries.sort((left, right) => {
          const leftTone = formatDue(left.card.item.due, timeZone, now).tone
          const rightTone = formatDue(right.card.item.due, timeZone, now).tone
          if (rank[leftTone] !== rank[rightTone]) return rank[leftTone] - rank[rightTone]
          return left.card.item.title.localeCompare(right.card.item.title, 'zh-CN')
        }),
      }))
  }, [data, timeZone, now])

  const taskCommand = (
    label: string,
    method: 'completeTask' | 'reopenTask',
    taskId: string,
  ) =>
    action.run(
      label,
      () => callApi<CommandReceipt>(ctx, method, { id: taskId }),
      '任务状态已更新',
    )

  const submitTask = async () => {
    const minutes = Number(estimate)
    if (!title.trim() || !Number.isFinite(minutes) || minutes < 5) {
      action.setNotice({ tone: 'error', text: '请填写任务标题和有效的预计时长' })
      return
    }
    const success = await action.run(
      'create',
      () =>
        callApi<CommandReceipt>(ctx, 'createTask', {
          title: title.trim(),
          estimateMinutes: Math.round(minutes),
          priority: Number(priority) || 0,
          ...(itemId ? { itemId } : {}),
        }),
      '学习任务已创建',
    )
    if (success) {
      setCreating(false)
      setTitle('')
      setEstimate('60')
      setItemId('')
    }
  }

  const selectedItemOptions = data
    ? data.items.filter((card) => !card.item.archived)
    : []

  return (
    <div>
      <StateBanner
        state={view}
        failure={state.failure}
        updatedAt={state.updatedAt}
        onRetry={() => void refresh()}
      />
      {action.notice && (
        <NoticeBar notice={action.notice} onDismiss={() => action.setNotice(undefined)} />
      )}
      {!data && state.loading && <LoadingLine>正在读取任务…</LoadingLine>}

      {data && (
        <>
          <div className="ac-toolbar">
            <div className="ac-toggle" role="tablist" aria-label="任务视图">
              <button
                type="button"
                role="tab"
                aria-selected={pane === 'tasks'}
                className={pane === 'tasks' ? 'ac-toggle-active' : ''}
                onClick={() => setPane('tasks')}
              >
                学习任务
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={pane === 'items'}
                className={pane === 'items' ? 'ac-toggle-active' : ''}
                onClick={() => setPane('items')}
              >
                来源事项
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={pane === 'review'}
                className={pane === 'review' ? 'ac-toggle-active' : ''}
                onClick={() => setPane('review')}
              >
                复习清单
              </button>
            </div>
            <button
              type="button"
              className="ac-button"
              onClick={() => setShowArchived((value) => !value)}
            >
              {showArchived ? '隐藏已归档/已删除' : '显示已归档/已删除'}
            </button>
            <button
              type="button"
              className="ac-button"
              onClick={() => setCreating((value) => !value)}
            >
              {creating ? '取消新建' : '新建学习任务'}
            </button>
          </div>

          <div className="ac-filter-bar">
            <Field label="搜索" hint="按标题筛选；由 Host 执行">
              <input
                value={searchDraft}
                onChange={(event) => setSearchDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    setFilters((current) => ({
                      ...current,
                      search: searchDraft,
                    }))
                  }
                }}
                placeholder="任务或来源标题"
              />
            </Field>
            <Field label="课程">
              <select
                value={filters.courseId}
                onChange={(event) =>
                  setFilters((current) => ({ ...current, courseId: event.target.value }))
                }
              >
                <option value="all">全部课程</option>
                {data.courses.map((course) => (
                  <option key={course.courseId} value={course.courseId}>
                    {course.code} {course.title}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="类型">
              <select
                value={filters.kind}
                onChange={(event) =>
                  setFilters((current) => ({
                    ...current,
                    kind: event.target.value as TaskFilters['kind'],
                  }))
                }
              >
                <option value="all">全部类型</option>
                <option value="assignment">作业</option>
                <option value="exam">考试</option>
                <option value="quiz">测验</option>
              </select>
            </Field>
            <Field label="截止">
              <select
                value={filters.due}
                onChange={(event) =>
                  setFilters((current) => ({
                    ...current,
                    due: event.target.value as TaskFilters['due'],
                  }))
                }
              >
                <option value="all">全部截止</option>
                <option value="overdue">已逾期</option>
                <option value="today">今天</option>
                <option value="week">未来 7 天</option>
                <option value="unknown">截止未知</option>
                <option value="unscheduled">未安排</option>
              </select>
            </Field>
            {pane === 'tasks' && (
              <Field label="状态">
                <select
                  value={filters.status}
                  onChange={(event) =>
                    setFilters((current) => ({
                      ...current,
                      status: event.target.value as TaskFilters['status'],
                    }))
                  }
                >
                  <option value="active">进行中</option>
                  <option value="completed">已完成</option>
                  <option value="all">全部状态</option>
                </select>
              </Field>
            )}
            <button
              type="button"
              className="ac-button"
              onClick={() => {
                setFilters(DEFAULT_TASK_FILTERS)
                setSearchDraft('')
              }}
            >
              重置筛选
            </button>
          </div>

          {creating && (
            <form
              className="ac-form-card"
              onSubmit={(event) => {
                event.preventDefault()
                void submitTask()
              }}
            >
              <h3>新建本地学习任务</h3>
              <div className="ac-form-grid">
                <Field label="标题">
                  <input
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    maxLength={500}
                    required
                  />
                </Field>
                <Field label="预计时长（分钟）">
                  <input
                    type="number"
                    min={5}
                    max={1440}
                    value={estimate}
                    onChange={(event) => setEstimate(event.target.value)}
                  />
                </Field>
                <Field label="关联来源事项（可选）">
                  <select value={itemId} onChange={(event) => setItemId(event.target.value)}>
                    <option value="">不关联</option>
                    {selectedItemOptions.map((card) => (
                      <option key={card.item.itemId} value={card.item.itemId}>
                        {card.item.title}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="优先级">
                  <input
                    type="number"
                    min={0}
                    max={9}
                    value={priority}
                    onChange={(event) => setPriority(event.target.value)}
                  />
                </Field>
              </div>
              <div className="ac-form-actions">
                <button type="submit" className="ac-button ac-button-primary" disabled={action.pending !== undefined}>
                  {action.pending === 'create' ? '创建中…' : '创建任务'}
                </button>
              </div>
            </form>
          )}

          {!data.itemsComplete && (
            <p className="ac-text-warn">
              来源事项过多，仅扫描了前 {TASK_PAGE_SIZE * 25} 条；统计可能不完整。
            </p>
          )}

          {pane === 'tasks' && (
            <Section
              title="学习任务"
              subtitle={`共 ${data.total} 条，当前显示 ${visibleTasks.length === 0 ? 0 : offset + 1}–${offset + visibleTasks.length} 条；勾选完成仅记录学习进度，不代表已在学校平台提交`}
            >
              {visibleTasks.length === 0 ? (
                <EmptyState title="没有符合条件的任务">
                  {filters.search || filters.courseId !== 'all' || filters.due !== 'all'
                    ? '检查筛选条件；筛选由 Host 在全量任务上执行。'
                    : '新建一个本地学习任务，或先同步来源事项。'}
                </EmptyState>
              ) : (
                <ul className="ac-task-list">
                  {visibleTasks.map((card) => (
                    <TaskRow
                      key={card.task.taskId}
                      card={card}
                      timeZone={timeZone}
                      now={now}
                      pending={action.pending !== undefined}
                      highlight={nav?.taskId === card.task.taskId}
                      onComplete={() =>
                        void taskCommand('complete', 'completeTask', card.task.taskId)
                      }
                      onReopen={() =>
                        void taskCommand('reopen', 'reopenTask', card.task.taskId)
                      }
                      onUpdate={(input) =>
                        action.run(
                          'task-update',
                          () =>
                            callApi<CommandReceipt>(ctx, 'updateTask', {
                              taskId: card.task.taskId,
                              ...input,
                            }),
                          '任务已更新',
                        )
                      }
                      onArchive={() =>
                        void action.run(
                          'task-archive',
                          () =>
                            callApi<CommandReceipt>(ctx, 'archiveTask', {
                              id: card.task.taskId,
                            }),
                          '任务已删除；可在“显示已归档/已删除”中恢复',
                        )
                      }
                      onRestore={() =>
                        void action.run(
                          'task-restore',
                          () =>
                            callApi<CommandReceipt>(ctx, 'restoreTask', {
                              id: card.task.taskId,
                            }),
                          '任务已恢复',
                        )
                      }
                      onAsk={() => {
                        const prompt = tutorPrompt(card, timeZone, now)
                        if (!askAgent(ctx, prompt)) {
                          action.setNotice({
                            tone: 'info',
                            text: 'DSH 聊天入口当前不可用；请从会话页发起提问。',
                          })
                        }
                      }}
                    />
                  ))}
                </ul>
              )}
              {data.total > TASK_PAGE_SIZE && (
                <div className="ac-pagination" role="group" aria-label="任务分页">
                  <button
                    type="button"
                    className="ac-button"
                    disabled={offset === 0 || state.loading}
                    onClick={() =>
                      setOffset((current) => Math.max(0, current - TASK_PAGE_SIZE))
                    }
                  >
                    上一页
                  </button>
                  <span className="ac-muted">
                    第 {Math.floor(offset / TASK_PAGE_SIZE) + 1} 页 · 共 {data.total} 条
                  </span>
                  <button
                    type="button"
                    className="ac-button"
                    disabled={!data.hasMore || state.loading}
                    onClick={() => setOffset((current) => current + TASK_PAGE_SIZE)}
                  >
                    下一页
                  </button>
                </div>
              )}
            </Section>
          )}

          {pane === 'items' && (
            <Section
              title="来源事项"
              subtitle="由数据源同步得到；未知截止日期和仅日期截止会明确标记"
            >
              {visibleItems.length === 0 ? (
                <EmptyState title="没有符合条件的来源事项">
                  没有事项不代表没有作业；请检查数据源同步状态。
                </EmptyState>
              ) : (
                <ul className="ac-item-list">
                  {visibleItems.map((card) => (
                    <ItemRow
                      key={card.item.itemId}
                      card={card}
                      timeZone={timeZone}
                      now={now}
                      pending={action.pending !== undefined}
                      onArchive={() =>
                        void action.run(
                          'item-archive',
                          () =>
                            callApi<CommandReceipt>(ctx, 'archiveItem', {
                              id: card.item.itemId,
                            }),
                          '来源事项已归档；同步会跳过它',
                        )
                      }
                      onRestore={() =>
                        void action.run(
                          'item-restore',
                          () =>
                            callApi<CommandReceipt>(ctx, 'restoreItem', {
                              id: card.item.itemId,
                            }),
                          '来源事项已恢复；后续同步会继续更新',
                        )
                      }
                      onAsk={() => {
                        const prompt = tutorPrompt(card, timeZone, now)
                        if (!askAgent(ctx, prompt)) {
                          action.setNotice({
                            tone: 'info',
                            text: 'DSH 聊天入口当前不可用；请从会话页发起提问。',
                          })
                        }
                      }}
                    />
                  ))}
                </ul>
              )}
            </Section>
          )}
          {pane === 'review' && (
            <Section
              title="复习清单"
              subtitle="按课程查看考试、测验和学习任务，结合当前计划准备复习"
            >
              <p className="ac-muted">
                依据：来源事项、本地任务与当前计划。没有成绩、掌握度或课程材料数据，
                因此不生成能力评分或复习效果预测。
              </p>
              {reviewGroups.length === 0 ? (
                <EmptyState title="没有考试或测验数据">
                  没有数据不代表没有考试；请检查数据源是否覆盖考试/测验。
                </EmptyState>
              ) : (
                reviewGroups.map((group) => (
                  <div key={group.key} className="ac-card">
                    <h3>{group.label}</h3>
                    <ul className="ac-item-list">
                      {group.entries.map(({ card, tasks, planned }) => {
                        const due = formatDue(card.item.due, timeZone, now)
                        return (
                          <li key={card.item.itemId} className="ac-item-row">
                            <div>
                              <div className="ac-task-title">
                                <strong>{card.item.title}</strong>
                                <Badge tone="info">{kindLabel(card.item.kind)}</Badge>
                              </div>
                              <div className="ac-task-meta">
                                <span>
                                  {tasks.length > 0
                                    ? `本地任务：${tasks
                                        .map(
                                          (task) =>
                                            `${task.task.title}（${formatMinutes(task.task.estimateMinutes)}）`,
                                        )
                                        .join('、')}`
                                    : '尚未创建本地任务'}
                                </span>
                                <span>
                                  {planned ? '已进入当前计划' : '尚未进入当前计划'}
                                </span>
                              </div>
                            </div>
                            <div className="ac-item-due">
                              <Badge tone={toneForDue(due.tone)}>{due.label}</Badge>
                              {due.note && <span className="ac-muted">{due.note}</span>}
                              <button
                                type="button"
                                className="ac-button"
                                onClick={() => {
                                  if (!askAgent(ctx, tutorPrompt(card, timeZone, now))) {
                                    action.setNotice({
                                      tone: 'info',
                                      text: 'DSH 聊天入口当前不可用；请从会话页发起提问。',
                                    })
                                  }
                                }}
                              >
                                请教复习建议
                              </button>
                            </div>
                          </li>
                        )
                      })}
                    </ul>
                  </div>
                ))
              )}
            </Section>
          )}
        </>
      )}
    </div>
  )
}
