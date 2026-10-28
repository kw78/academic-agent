import { useCallback, useState } from 'react'
import { callApi } from '../api.js'
import {
  Badge,
  EmptyState,
  LoadingLine,
  NoticeBar,
  Section,
  StateBanner,
} from '../components.js'
import { useAction, useLoad } from '../hooks.js'
import { viewState } from '../state.js'
import {
  formatDateTimeOrDash,
  formatDue,
  formatMinutes,
  localDate,
  sourceStageLabel,
  sourceStageTone,
  weekdayLabel,
} from '../view.js'
import type {
  CommandReceipt,
  DashboardView,
  TaskCard,
} from '../../protocol.js'
import type { PageProps } from './types.js'

const GUIDE_KEY = 'academic.ui.guide.v1'

function readGuideDismissed(): boolean {
  try {
    return window.localStorage.getItem(GUIDE_KEY) === 'dismissed'
  } catch {
    return false
  }
}

function rememberGuideDismissed(): void {
  try {
    window.localStorage.setItem(GUIDE_KEY, 'dismissed')
  } catch {
    // The guide is optional; storage may be blocked.
  }
}

function syncLabel(health: DashboardView['syncHealth']): string {
  switch (health) {
    case 'ok':
      return '同步正常'
    case 'stale':
      return '数据可能过期'
    case 'degraded':
      return '部分同步成功'
    case 'failed':
      return '同步失败'
    case 'auth-required':
      return '需要重新认证'
    default:
      return '尚未同步'
  }
}

function countLabel(value: number, complete: boolean): string {
  return complete ? String(value) : `≥${value}`
}

function TodayTaskRow({
  card,
  timeZone,
  now,
  pending,
  onComplete,
  onReopen,
  onOpen,
}: {
  card: TaskCard
  timeZone: string
  now: string
  pending: boolean
  onComplete: () => void
  onReopen: () => void
  onOpen: () => void
}) {
  const due = formatDue(card.effectiveDue, timeZone, now)
  const completed = card.task.status === 'completed'
  return (
    <li className="ac-today-row">
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
      <button type="button" className="ac-today-main" onClick={onOpen}>
        <span className="ac-today-title">{card.task.title}</span>
        <span className="ac-muted">
          {card.course ? `${card.course.code} ${card.course.title}` : '本地任务'}
          {card.item ? ` · ${card.item.title}` : ''}
        </span>
      </button>
      <span className="ac-today-meta">
        <Badge
          tone={
            completed
              ? 'ok'
              : due.tone === 'overdue'
                ? 'bad'
                : due.tone === 'today'
                  ? 'warn'
                  : 'neutral'
          }
        >
          {completed && !card.effectiveDue ? '已完成' : due.label}
        </Badge>
        <span className="ac-muted">预计 {formatMinutes(card.task.estimateMinutes)}</span>
      </span>
    </li>
  )
}

export function DashboardPage({ ctx, active, onNavigate }: PageProps) {
  const load = useCallback(
    (signal: AbortSignal) => callApi<DashboardView>(ctx, 'dashboard', {}, signal),
    [ctx],
  )
  const { state, refresh } = useLoad(load, active, 60_000)
  const action = useAction(refresh)
  const [guideDismissed, setGuideDismissed] = useState(readGuideDismissed)
  const view = viewState(state)
  const data = state.data
  const timeZone = data?.timeZone ?? 'UTC'
  const now = new Date().toISOString()
  const dateLabel = data
    ? `${localDate(data.generatedAt, timeZone)} ${weekdayLabel(localDate(data.generatedAt, timeZone))}`
    : ''

  const taskCommand = (
    taskId: string,
    method: 'completeTask' | 'reopenTask',
  ): Promise<boolean> =>
    action.run(
      `task-${taskId}`,
      () => callApi<CommandReceipt>(ctx, method, { id: taskId }),
      method === 'completeTask'
        ? '已记录本地完成；不会改动学校提交状态'
        : '任务已重新打开',
    )

  const nextBlock = data?.todayBlocks[0]
  const nextCourse = nextBlock
    ? data.todayTasks.find((card) => card.task.taskId === nextBlock.block.taskId)?.course
    : undefined
  const remainingToday = Math.max(
    0,
    (data?.todayTasksTotal ?? 0) - (data?.todayTasks.length ?? 0),
  )
  const syncIssue =
    data && data.syncHealth !== 'ok' && data.syncHealth !== 'unknown'
      ? data
      : undefined
  const hasSources = (data?.sources.length ?? 0) > 0
  const noData =
    data && data.counts.activeTasks === 0 && data.counts.itemsDueSoon === 0
  const guideSteps = data
    ? [
        {
          id: 'source',
          title: '添加平台或手动建课',
          done: data.sources.length > 0 || data.coursesCount > 0,
          detail: '添加平台后需要登录并验证连接；也可以先手动建课。',
        },
        {
          id: 'tasks',
          title: '查看并整理任务',
          done: data.counts.activeTasks > 0,
          detail: '同步事项会自动生成默认任务，也可以手动新建。',
        },
        {
          id: 'availability',
          title: '检查可用时间',
          done: data.availabilityConfigured,
          detail: 'Planner 不会默认全天可用；先设置每周可用时段。',
        },
        {
          id: 'plan',
          title: '预览并确认计划',
          done: data.plan?.status === 'active',
          detail: '生成的是建议；确认后才会成为实际安排。',
        },
      ]
    : []
  const remainingGuideSteps = guideSteps.filter((step) => !step.done).length

  return (
    <div>
      <StateBanner
        state={view}
        failure={state.failure}
        updatedAt={state.updatedAt}
        onRetry={() => void refresh()}
        onNavigate={() => onNavigate('connections')}
      />
      {action.notice && (
        <NoticeBar notice={action.notice} onDismiss={() => action.setNotice(undefined)} />
      )}
      {!data && state.loading && <LoadingLine>正在读取今天…</LoadingLine>}

      {data && (
        <>
          <div className="ac-today-head">
            <div>
              <h2 className="ac-today-date">{dateLabel}</h2>
              <p className="ac-muted">
                业务时区 {timeZone} · 界面刷新于{' '}
                {formatDateTimeOrDash(data.generatedAt, timeZone)}
              </p>
            </div>
            <div className="ac-inline-actions">
              <button
                type="button"
                className="ac-button ac-button-primary"
                onClick={() =>
                  onNavigate('tasks', { pane: 'tasks', status: 'active', create: true })
                }
              >
                新建任务
              </button>
              <button type="button" className="ac-button" onClick={() => void refresh()}>
                刷新
              </button>
            </div>
          </div>

          {syncIssue && (
            <div className="ac-banner ac-banner-warn" role="status">
              <div>
                <strong>{syncLabel(syncIssue.syncHealth)}</strong>
                <p>
                  {syncIssue.lastSync?.errorMessage ??
                    '显示的是最后一次有效数据；后台会在下次成功同步后恢复。'}
                </p>
                <p className="ac-muted">
                  上次成功同步：
                  {formatDateTimeOrDash(syncIssue.lastSuccessfulSync?.finishedAt, timeZone)}
                </p>
              </div>
              <div className="ac-banner-actions">
                <button
                  type="button"
                  className="ac-button"
                  onClick={() => onNavigate('connections', { focus: 'sources' })}
                >
                  去处理
                </button>
              </div>
            </div>
          )}

          {!hasSources && !noData && (
            <div className="ac-banner ac-banner-info" role="status">
              <div>
                <strong>还没有数据源</strong>
                <p>当前显示手动创建的课程与任务；添加平台并登录后才会同步来源事实。</p>
              </div>
              <div className="ac-banner-actions">
                <button
                  type="button"
                  className="ac-button"
                  onClick={() => onNavigate('connections')}
                >
                  添加平台
                </button>
              </div>
            </div>
          )}

          <div className="ac-summary-strip" aria-label="学业摘要">
            <button
              type="button"
              className="ac-summary-chip"
              onClick={() => onNavigate('tasks', { pane: 'tasks', status: 'active' })}
            >
              <strong>{countLabel(data.counts.activeTasks, data.counts.complete)}</strong>
              <span>进行中任务</span>
            </button>
            <button
              type="button"
              className="ac-summary-chip ac-summary-chip-bad"
              onClick={() =>
                onNavigate('tasks', { pane: 'tasks', status: 'active', due: 'overdue' })
              }
            >
              <strong>{countLabel(data.counts.overdueTasks, data.counts.complete)}</strong>
              <span>逾期任务</span>
            </button>
            <button
              type="button"
              className="ac-summary-chip ac-summary-chip-warn"
              onClick={() =>
                onNavigate('tasks', { pane: 'tasks', status: 'active', due: 'unscheduled' })
              }
            >
              <strong>{countLabel(data.counts.unscheduledTasks, data.counts.complete)}</strong>
              <span>未安排任务</span>
            </button>
            <button
              type="button"
              className="ac-summary-chip"
              onClick={() =>
                onNavigate('tasks', { pane: 'items', due: 'week', status: 'all' })
              }
            >
              <strong>{countLabel(data.counts.itemsDueSoon, data.counts.complete)}</strong>
              <span>未来 7 天截止</span>
            </button>
            <button
              type="button"
              className="ac-summary-chip"
              onClick={() => onNavigate('automation', { focus: 'notifications' })}
            >
              <strong>{data.counts.unreadNotifications}</strong>
              <span>未读提醒</span>
            </button>
          </div>

          {!data.counts.complete && (
            <p className="ac-text-warn">
              来源事项数量超过单次扫描上限，摘要与列表为下限（≥）；请用筛选缩小范围。
            </p>
          )}

          {!guideDismissed && remainingGuideSteps > 0 && (
            <Section
              title="开始使用"
              subtitle={`还有 ${remainingGuideSteps} 步；进度来自 Host 数据，不是浏览器标记`}
              actions={
                <button
                  type="button"
                  className="ac-button ac-button-quiet"
                  onClick={() => {
                    rememberGuideDismissed()
                    setGuideDismissed(true)
                  }}
                >
                  跳过引导
                </button>
              }
            >
              <ol className="ac-guide-steps">
                {guideSteps.map((step, index) => (
                  <li
                    key={step.id}
                    className={step.done ? 'ac-guide-step-done' : undefined}
                  >
                    <span className="ac-guide-index" aria-hidden="true">
                      {step.done ? '✓' : index + 1}
                    </span>
                    <div>
                      <strong>{step.title}</strong>
                      <span className="ac-muted">{step.detail}</span>
                    </div>
                    {!step.done && (
                      <div className="ac-inline-actions">
                        {step.id === 'source' && (
                          <>
                            <button
                              type="button"
                              className="ac-button"
                              onClick={() => onNavigate('connections')}
                            >
                              添加平台
                            </button>
                            <button
                              type="button"
                              className="ac-button"
                              onClick={() => onNavigate('courses', {})}
                            >
                              手动建课
                            </button>
                          </>
                        )}
                        {step.id === 'tasks' && (
                          <button
                            type="button"
                            className="ac-button"
                            onClick={() =>
                              onNavigate('tasks', {
                                pane: 'tasks',
                                status: 'active',
                                create: true,
                              })
                            }
                          >
                            新建任务
                          </button>
                        )}
                        {step.id === 'availability' && (
                          <button
                            type="button"
                            className="ac-button"
                            onClick={() => onNavigate('settings')}
                          >
                            设置可用时间
                          </button>
                        )}
                        {step.id === 'plan' && (
                          <button
                            type="button"
                            className="ac-button"
                            disabled={!data.plannerAvailable}
                            onClick={() => onNavigate('plan')}
                          >
                            生成计划
                          </button>
                        )}
                      </div>
                    )}
                  </li>
                ))}
              </ol>
            </Section>
          )}

          <div className="ac-today-grid">
            <div className="ac-today-primary">
              <Section
                title="下一学习时段"
                subtitle="只来自已确认计划；候选与 Agent 建议不算实际安排"
                actions={
                  <button
                    type="button"
                    className="ac-button ac-button-quiet"
                    onClick={() => onNavigate('plan')}
                  >
                    打开计划
                  </button>
                }
              >
                {!nextBlock ? (
                  data.plannerAvailable ? (
                    <EmptyState
                      title="今天还没有已确认安排"
                      action={
                        <div className="ac-inline-actions">
                          <button
                            type="button"
                            className="ac-button"
                            onClick={() =>
                              onNavigate('tasks', { pane: 'tasks', status: 'active' })
                            }
                          >
                            查看任务
                          </button>
                          <button
                            type="button"
                            className="ac-button"
                            onClick={() => onNavigate('plan')}
                          >
                            生成计划建议
                          </button>
                        </div>
                      }
                    >
                      先生成一份计划建议，看看任务如何安排，再确认采用。安排不下的任务会单独说明原因。
                    </EmptyState>
                  ) : (
                    <EmptyState title="规划能力未加载">
                      已有计划仍可查看；重新加载 Planner 后可生成新计划。
                    </EmptyState>
                  )
                ) : (
                  <div className="ac-next-block">
                    <time className="ac-next-block-time">
                      {formatDateTimeOrDash(nextBlock.block.start, timeZone).slice(6)} –{' '}
                      {formatDateTimeOrDash(nextBlock.block.end, timeZone).slice(6)}
                    </time>
                    <div>
                      <strong>{nextBlock.task?.title ?? nextBlock.block.taskId}</strong>
                      <span className="ac-muted">
                        {nextCourse
                          ? `${nextCourse.code} ${nextCourse.title}`
                          : '本地任务'}{' '}
                        ·{' '}
                        {formatMinutes(
                          (Date.parse(nextBlock.block.end) -
                            Date.parse(nextBlock.block.start)) /
                            60_000,
                        )}
                      </span>
                    </div>
                    <button
                      type="button"
                      className="ac-button"
                      onClick={() => onNavigate('plan')}
                    >
                      查看计划
                    </button>
                  </div>
                )}
              </Section>

              <Section
                title="今天要做"
                subtitle={`今天截止或今天有已确认计划块的未完成任务 · 共 ${data.todayTasksTotal} 个`}
                actions={
                  data.todayTasksTotal > 5 ? (
                    <button
                      type="button"
                      className="ac-button ac-button-quiet"
                      onClick={() =>
                        onNavigate('tasks', {
                          pane: 'tasks',
                          status: 'active',
                          due: 'today',
                        })
                      }
                    >
                      查看全部
                    </button>
                  ) : undefined
                }
              >
                {data.todayTasks.length === 0 ? (
                  <EmptyState title="今天没有待办">
                    在这里记录学习进度，完成后手动勾选；今天没有截止任务时可以看看未来 7 天。
                  </EmptyState>
                ) : (
                  <ul className="ac-today-list">
                    {data.todayTasks.slice(0, 5).map((card) => (
                      <TodayTaskRow
                        key={card.task.taskId}
                        card={card}
                        timeZone={timeZone}
                        now={now}
                        pending={action.pending === `task-${card.task.taskId}`}
                        onComplete={() =>
                          void taskCommand(card.task.taskId, 'completeTask')
                        }
                        onReopen={() =>
                          void taskCommand(card.task.taskId, 'reopenTask')
                        }
                        onOpen={() =>
                          onNavigate('tasks', {
                            pane: 'tasks',
                            status: 'active',
                            courseId: card.course?.courseId,
                            taskId: card.task.taskId,
                          })
                        }
                      />
                    ))}
                  </ul>
                )}
                {remainingToday > 0 && (
                  <p className="ac-muted">另有 {remainingToday} 个今日任务未在此处展示。</p>
                )}
              </Section>

              {data.counts.overdueTasks > 0 && (
                <Section
                  title="逾期任务"
                  subtitle="不受今日筛选影响；完成后才会离开此列表"
                  actions={
                    <button
                      type="button"
                      className="ac-button ac-button-quiet"
                      onClick={() =>
                        onNavigate('tasks', {
                          pane: 'tasks',
                          status: 'active',
                          due: 'overdue',
                        })
                      }
                    >
                      查看全部逾期
                    </button>
                  }
                >
                  <ul className="ac-today-list">
                    {data.overdueTasks.slice(0, 5).map((card) => {
                      const due = formatDue(card.effectiveDue, timeZone, now)
                      return (
                        <li key={card.task.taskId} className="ac-today-row">
                          <span className="ac-today-dot ac-today-dot-bad" aria-hidden="true" />
                          <button
                            type="button"
                            className="ac-today-main"
                            onClick={() =>
                              onNavigate('tasks', {
                                pane: 'tasks',
                                status: 'active',
                                due: 'overdue',
                                courseId: card.course?.courseId,
                                taskId: card.task.taskId,
                              })
                            }
                          >
                            <span className="ac-today-title">{card.task.title}</span>
                            <span className="ac-muted">
                              {card.course?.code ?? '本地任务'}
                              {card.item ? ` · ${card.item.title}` : ''}
                            </span>
                          </button>
                          <span className="ac-today-meta">
                            <Badge tone="bad">{due.label}</Badge>
                          </span>
                        </li>
                      )
                    })}
                  </ul>
                </Section>
              )}
            </div>

            <div className="ac-today-side">
              <Section
                title="未来 7 天截止"
                subtitle={`来自已同步的平台，共 ${data.upcomingTotal} 个；列表显示前 ${data.upcoming.length} 个`}
                actions={
                  <button
                    type="button"
                    className="ac-button ac-button-quiet"
                    onClick={() =>
                      onNavigate('tasks', {
                        pane: 'items',
                        due: 'week',
                        status: 'all',
                      })
                    }
                  >
                    查看全部
                  </button>
                }
              >
                {data.upcoming.length === 0 ? (
                  <EmptyState title="未来 7 天没有已知截止事项">
                    没有来源事项时，不代表没有作业；请检查数据源是否同步成功。
                  </EmptyState>
                ) : (
                  <ul className="ac-list">
                    {data.upcoming.slice(0, 6).map((card) => {
                      const due = formatDue(card.item.due, timeZone, now)
                      return (
                        <li key={card.item.itemId} className="ac-compact-row">
                          <button
                            type="button"
                            className="ac-compact-main"
                            onClick={() =>
                              onNavigate('tasks', {
                                pane: 'items',
                                status: 'all',
                                courseId: card.item.courseId,
                                itemId: card.item.itemId,
                              })
                            }
                          >
                            <strong>{card.item.title}</strong>
                            <span className="ac-muted">
                              {card.course?.code ?? card.item.courseId}
                            </span>
                          </button>
                          <Badge tone={due.tone === 'overdue' ? 'bad' : 'warn'}>
                            {due.label}
                          </Badge>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </Section>

              <Section
                title="未读提醒"
                subtitle={`${data.counts.unreadNotifications} 条未读`}
                actions={
                  <button
                    type="button"
                    className="ac-button ac-button-quiet"
                    onClick={() => onNavigate('automation', { focus: 'notifications' })}
                  >
                    全部提醒
                  </button>
                }
              >
                {data.unread.length === 0 ? (
                  <EmptyState title="没有未读提醒">
                    截止提醒会按 72h/24h 阈值生成。
                  </EmptyState>
                ) : (
                  <ul className="ac-list">
                    {data.unread.slice(0, 3).map((notification) => (
                      <li key={notification.notificationId} className="ac-compact-row">
                        <div className="ac-compact-main">
                          <strong>{notification.title}</strong>
                          <span className="ac-muted">{notification.body}</span>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </Section>

              <Section title="数据源状态" subtitle="登录后还需验证连接，才能开始同步">
                {data.sources.length === 0 ? (
                  <EmptyState
                    title="还没有数据源"
                    action={
                      <button
                        type="button"
                        className="ac-button"
                        onClick={() => onNavigate('connections')}
                      >
                        添加平台
                      </button>
                    }
                  >
                    手动添加的课程与任务仍可正常使用。
                  </EmptyState>
                ) : (
                  <ul className="ac-list">
                    {data.sources.map((source) => (
                      <li key={source.sourceId} className="ac-compact-row">
                        <button
                          type="button"
                          className="ac-compact-main"
                          onClick={() =>
                            onNavigate('connections', { sourceId: source.sourceId })
                          }
                        >
                          <strong>{source.displayName}</strong>
                          <span className="ac-muted">
                            最近同步：
                            {formatDateTimeOrDash(source.lastSync?.finishedAt, timeZone)}
                          </span>
                        </button>
                        <Badge tone={sourceStageTone(source.stage)}>
                          {sourceStageLabel(source.stage)}
                        </Badge>
                      </li>
                    ))}
                  </ul>
                )}
              </Section>
            </div>
          </div>

          {data.recentChanges.length > 0 && (
            <Section title="最近变化" subtitle="最近同步更新的作业、考试和测验">
              <ul className="ac-list">
                {data.recentChanges.slice(0, 4).map((card) => (
                  <li key={card.item.itemId} className="ac-compact-row">
                    <button
                      type="button"
                      className="ac-compact-main"
                      onClick={() =>
                        onNavigate('tasks', {
                          pane: 'items',
                          status: 'all',
                          courseId: card.item.courseId,
                          itemId: card.item.itemId,
                        })
                      }
                    >
                      <strong>{card.item.title}</strong>
                      <span className="ac-muted">
                        {card.course?.code ?? card.item.courseId} · 更新于{' '}
                        {formatDateTimeOrDash(card.item.updatedAt, timeZone)}
                      </span>
                    </button>
                    <Badge tone="info">来源事项</Badge>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {noData && (
            <EmptyState
              title="还没有学业数据"
              action={
                <div className="ac-inline-actions">
                  <button
                    type="button"
                    className="ac-button ac-button-primary"
                    onClick={() => onNavigate('connections')}
                  >
                    添加平台
                  </button>
                  <button
                    type="button"
                    className="ac-button"
                    onClick={() => onNavigate('courses', {})}
                  >
                    手动添加课程
                  </button>
                </div>
              }
            >
              添加平台并登录后同步来源事实，或先手动添加课程和任务。
            </EmptyState>
          )}

          <p className="ac-muted ac-footnote">
            今日范围自 {localDate(data.range.start, timeZone)} 起；加载完成于{' '}
            {formatDateTimeOrDash(data.generatedAt, timeZone)}。
          </p>
        </>
      )}
    </div>
  )
}
