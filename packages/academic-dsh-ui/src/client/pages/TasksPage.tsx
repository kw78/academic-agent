import { useCallback, useMemo, useState } from 'react'
import type { AcademicItemView } from '@academic/contracts'
import { callApi } from '../api.js'
import {
  Badge,
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
  filterTaskCards,
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

function TaskRow({
  card,
  timeZone,
  now,
  pending,
  onComplete,
  onReopen,
  onChangeEstimate,
  onAsk,
}: {
  card: TaskCard
  timeZone: string
  now: string
  pending: boolean
  onComplete: () => void
  onReopen: () => void
  onChangeEstimate: (minutes: number) => void
  onAsk: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [estimate, setEstimate] = useState(String(card.task.estimateMinutes))
  const due = formatDue(card.effectiveDue, timeZone, now)
  const completed = card.task.status === 'completed'
  return (
    <li className={`ac-task-row${completed ? ' ac-task-completed' : ''}`}>
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
        <p className="ac-muted ac-task-note">
          本地任务状态与学校提交状态分开保存；标记完成不会提交学校作业。
        </p>
      </div>
      <div className="ac-task-actions">
        <Badge tone={toneForDue(due.tone)}>{due.label}</Badge>
        {editing ? (
          <div className="ac-inline-form">
            <label className="ac-sr-only" htmlFor={`estimate-${card.task.taskId}`}>
              预计时长（分钟）
            </label>
            <input
              id={`estimate-${card.task.taskId}`}
              type="number"
              min={5}
              max={1440}
              value={estimate}
              onChange={(event) => setEstimate(event.target.value)}
            />
            <button
              type="button"
              className="ac-button"
              disabled={pending}
              onClick={() => {
                const minutes = Number(estimate)
                if (!Number.isFinite(minutes) || minutes < 5) return
                onChangeEstimate(Math.round(minutes))
                setEditing(false)
              }}
            >
              保存
            </button>
            <button type="button" className="ac-button" onClick={() => setEditing(false)}>
              取消
            </button>
          </div>
        ) : (
          <button type="button" className="ac-button" onClick={() => setEditing(true)}>
            调整时长
          </button>
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
}: {
  card: ItemCard
  timeZone: string
  now: string
}) {
  const due = formatDue(card.item.due, timeZone, now)
  return (
    <li className="ac-item-row">
      <div>
        <div className="ac-task-title">
          <strong>{card.item.title}</strong>
          <Badge tone="info">{kindLabel(card.item.kind)}</Badge>
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
          来源事实；学校提交状态未接入，不能由本地进度推断。
        </p>
      </div>
      <div className="ac-item-due">
        <Badge tone={toneForDue(due.tone)}>{due.label}</Badge>
        {due.note && <span className="ac-muted">{due.note}</span>}
      </div>
    </li>
  )
}

export function TasksPage({ ctx, active }: PageProps) {
  const load = useCallback(
    (signal: AbortSignal) =>
      callApi<TasksView>(ctx, 'tasks', { status: 'all' }, signal),
    [ctx],
  )
  const { state, refresh } = useLoad(load, active)
  const [filters, setFilters] = useState<TaskFilters>(DEFAULT_TASK_FILTERS)
  const [pane, setPane] = useState<'tasks' | 'items'>('tasks')
  const [creating, setCreating] = useState(false)
  const [title, setTitle] = useState('')
  const [estimate, setEstimate] = useState('60')
  const [itemId, setItemId] = useState('')
  const [priority, setPriority] = useState('1')
  const action = useAction(refresh)
  const view = viewState(state)
  const data = state.data
  const timeZone = data?.timeZone ?? 'UTC'
  const now = new Date().toISOString()

  const visibleTasks = useMemo(
    () => (data ? filterTaskCards(data.cards, filters, timeZone, now) : []),
    [data, filters, timeZone, now],
  )
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
      .filter((card) => !card.item.archived)
      .filter((card) => filters.courseId === 'all' || card.item.courseId === filters.courseId)
      .filter((card) => filters.kind === 'all' || card.item.kind === filters.kind)
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
  }, [data, filters, timeZone, now])

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
            </div>
            <button
              type="button"
              className="ac-button"
              onClick={() => setCreating((value) => !value)}
            >
              {creating ? '取消新建' : '新建学习任务'}
            </button>
          </div>

          <div className="ac-filter-bar">
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
              onClick={() => setFilters(DEFAULT_TASK_FILTERS)}
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

          {data.truncated && (
            <p className="ac-muted">任务较多，仅显示前 500 条；请使用筛选缩小范围。</p>
          )}

          {pane === 'tasks' && (
            <Section
              title="学习任务"
              subtitle={`${visibleTasks.length} 条；本地完成状态不会冒充学校提交状态`}
            >
              {visibleTasks.length === 0 ? (
                <EmptyState title="没有符合条件的任务">
                  检查筛选条件，或新建一个本地学习任务。
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
                      onComplete={() =>
                        void taskCommand('complete', 'completeTask', card.task.taskId)
                      }
                      onReopen={() =>
                        void taskCommand('reopen', 'reopenTask', card.task.taskId)
                      }
                      onChangeEstimate={(minutes) =>
                        void action.run(
                          'estimate',
                          () =>
                            callApi<CommandReceipt>(ctx, 'changeTaskEstimate', {
                              taskId: card.task.taskId,
                              estimateMinutes: minutes,
                            }),
                          '预计时长已更新',
                        )
                      }
                      onAsk={() => {
                        const prompt = `请帮我解释或拆解这个学习任务：${card.task.title}（任务 ID ${card.task.taskId}）。请区分数据库事实与你的建议，不要修改任何数据。`
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
                    />
                  ))}
                </ul>
              )}
            </Section>
          )}
        </>
      )}
    </div>
  )
}
