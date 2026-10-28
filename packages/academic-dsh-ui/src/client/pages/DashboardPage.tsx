import { useCallback } from 'react'
import type { SyncRunSummary } from '@academic/contracts'
import { callApi } from '../api.js'
import {
  Badge,
  EmptyState,
  LoadingLine,
  NoticeBar,
  Section,
  StatCard,
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
  syncStatusLabel,
} from '../view.js'
import type { DashboardView, UiResult } from '../../protocol.js'
import type { PageProps } from './types.js'

function syncTone(health: DashboardView['syncHealth']): 'ok' | 'warn' | 'bad' | 'neutral' {
  switch (health) {
    case 'ok':
      return 'ok'
    case 'stale':
    case 'degraded':
      return 'warn'
    case 'failed':
    case 'auth-required':
      return 'bad'
    default:
      return 'neutral'
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

export function DashboardPage({ ctx, active, onNavigate }: PageProps) {
  const load = useCallback(
    (signal: AbortSignal) => callApi<DashboardView>(ctx, 'dashboard', {}, signal),
    [ctx],
  )
  const { state, refresh } = useLoad(load, active, 60_000)
  const action = useAction(refresh)
  const view = viewState(state)
  const data = state.data
  const timeZone = data?.timeZone ?? 'UTC'
  const now = new Date().toISOString()

  const syncNow = async (): Promise<UiResult<SyncRunSummary>> => {
    const result = await callApi<SyncRunSummary>(ctx, 'syncNow', {})
    if (!result.ok) return result
    if (result.value.status === 'success' || result.value.status === 'partial') {
      return result
    }
    return {
      ok: false,
      error: {
        code: result.value.status === 'auth-required' ? 'AUTH_REQUIRED' : 'ERROR',
        message:
          result.value.errorMessage ??
          `同步未成功：${syncStatusLabel(result.value.status)}；已保留最后一次有效数据`,
      },
    }
  }

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
      {!data && state.loading && <LoadingLine>正在读取总览…</LoadingLine>}

      {data && (
        <>
          <div className="ac-stat-grid">
            <StatCard
              label="今日任务"
              value={data.todayTasks.length}
              hint={`共 ${data.counts.activeTasks} 个进行中任务`}
            />
            <StatCard
              label="近期截止"
              value={data.counts.itemsDueSoon}
              hint="未来 7 天（含逾期）"
              tone={data.counts.itemsDueSoon > 0 ? 'warn' : 'neutral'}
            />
            <StatCard
              label="逾期任务"
              value={data.counts.overdueTasks}
              hint="按当前截止时间计算"
              tone={data.counts.overdueTasks > 0 ? 'bad' : 'ok'}
            />
            <StatCard
              label="未读提醒"
              value={data.counts.unreadNotifications}
              hint={`未安排任务 ${data.counts.unscheduledTasks} 个`}
              tone={data.counts.overdueTasks > 0 ? 'warn' : 'neutral'}
            />
          </div>

          <div className="ac-inline-bar">
            <div>
              <Badge tone={syncTone(data.syncHealth)}>{syncLabel(data.syncHealth)}</Badge>
              <span className="ac-muted">
                最近成功同步：{formatDateTimeOrDash(data.lastSuccessfulSync?.finishedAt, timeZone)}
              </span>
            </div>
            <div className="ac-inline-actions">
              <button
                type="button"
                className="ac-button"
                disabled={action.pending !== undefined}
                onClick={() =>
                  void action.run('sync', syncNow, '同步完成，已刷新总览')
                }
              >
                {action.pending === 'sync' ? '同步中…' : '立即同步'}
              </button>
              <button type="button" className="ac-button" onClick={() => void refresh()}>
                刷新
              </button>
            </div>
          </div>

          {data.syncHealth !== 'ok' && data.syncHealth !== 'unknown' && (
            <div className="ac-banner ac-banner-warn" role="status">
              <div>
                <strong>{syncLabel(data.syncHealth)}</strong>
                <p>
                  {data.lastSync?.errorMessage ??
                    '显示的是最后一次有效数据；下次成功同步后会恢复。'}
                </p>
              </div>
              <div className="ac-banner-actions">
                <button
                  type="button"
                  className="ac-button"
                  onClick={() => onNavigate('connections')}
                >
                  查看数据源
                </button>
              </div>
            </div>
          )}

          <div className="ac-two-column">
            <Section
              title="今日学习计划"
              subtitle={data.plan ? `计划区间 ${formatDateTimeOrDash(data.plan.range.start, timeZone)} 起` : undefined}
              actions={
                <button
                  type="button"
                  className="ac-button"
                  onClick={() => onNavigate('plan')}
                >
                  打开计划
                </button>
              }
            >
              {data.todayBlocks.length === 0 ? (
                <EmptyState title="今天没有计划块">
                  确认计划后，Planner 会把任务安排到可用时间；未安排任务会给出原因。
                </EmptyState>
              ) : (
                <ul className="ac-timeline">
                  {data.todayBlocks.map(({ block, task }) => (
                    <li key={`${block.taskId}:${block.start}`} className="ac-timeline-row">
                      <time>{formatDateTimeOrDash(block.start, timeZone)}</time>
                      <div>
                        <strong>{task?.title ?? block.taskId}</strong>
                        <span className="ac-muted">
                          {formatMinutes(
                            (Date.parse(block.end) - Date.parse(block.start)) / 60_000,
                          )}
                        </span>
                      </div>
                      <Badge tone="ok">已确认计划</Badge>
                    </li>
                  ))}
                </ul>
              )}
            </Section>

            <Section
              title="近期截止"
              subtitle="学校来源事实，未知截止日期不会猜成确定时间"
              actions={
                <button
                  type="button"
                  className="ac-button"
                  onClick={() => onNavigate('tasks')}
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
                  {data.upcoming.map((card) => {
                    const due = formatDue(card.item.due, timeZone, now)
                    return (
                      <li key={card.item.itemId} className="ac-list-row">
                        <div>
                          <strong>{card.item.title}</strong>
                          <span className="ac-muted">
                            {card.course?.code ?? card.item.courseId} · {card.item.kind}
                          </span>
                        </div>
                        <Badge tone={due.tone === 'overdue' ? 'bad' : 'warn'}>
                          {due.label}
                        </Badge>
                      </li>
                    )
                  })}
                </ul>
              )}
            </Section>
          </div>

          <div className="ac-two-column">
            <Section title="今日待办" subtitle="本地学习任务；完成状态由用户控制">
              {data.todayTasks.length === 0 ? (
                <EmptyState title="今天没有待办任务">可以从任务页创建本地任务。</EmptyState>
              ) : (
                <ul className="ac-list">
                  {data.todayTasks.map((card) => {
                    const due = formatDue(card.effectiveDue, timeZone, now)
                    return (
                      <li key={card.task.taskId} className="ac-list-row">
                        <div>
                          <strong>{card.task.title}</strong>
                          <span className="ac-muted">
                            {card.course?.code ?? '本地任务'} · 预计{' '}
                            {formatMinutes(card.task.estimateMinutes)}
                          </span>
                        </div>
                        <div className="ac-row-meta">
                          <Badge
                            tone={
                              due.tone === 'overdue'
                                ? 'bad'
                                : due.tone === 'today'
                                  ? 'warn'
                                  : 'neutral'
                            }
                          >
                            {due.label}
                          </Badge>
                          {!card.planned && <Badge tone="warn">未安排</Badge>}
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )}
            </Section>

            <Section title="未读提醒" subtitle={`未读 ${data.counts.unreadNotifications} 条`}>
              {data.unread.length === 0 ? (
                <EmptyState title="没有未读提醒">截止提醒会按 72h/24h 阈值生成。</EmptyState>
              ) : (
                <ul className="ac-list">
                  {data.unread.map((notification) => (
                    <li key={notification.notificationId} className="ac-list-row">
                      <div>
                        <strong>{notification.title}</strong>
                        <span className="ac-muted">{notification.body}</span>
                      </div>
                      <span className="ac-muted">
                        {formatDateTimeOrDash(notification.createdAt, timeZone)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Section>
          </div>

          <Section title="近期变化" subtitle="来源事项最近更新时间">
            {data.recentChanges.length === 0 ? (
              <EmptyState title="还没有来源事项" />
            ) : (
              <ul className="ac-list">
                {data.recentChanges.map((card) => (
                  <li key={card.item.itemId} className="ac-list-row">
                    <div>
                      <strong>{card.item.title}</strong>
                      <span className="ac-muted">
                        {card.course?.code ?? card.item.courseId} · 更新于{' '}
                        {formatDateTimeOrDash(card.item.updatedAt, timeZone)}
                      </span>
                    </div>
                    <Badge tone="info">来源事项</Badge>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section
            title="数据源状态"
            subtitle="保存凭据不等于平台已验证可用"
            actions={
              <button
                type="button"
                className="ac-button"
                onClick={() => onNavigate('connections')}
              >
                管理连接
              </button>
            }
          >
            <ul className="ac-source-grid">
              {data.sources.map((source) => (
                <li key={source.sourceId} className="ac-card ac-source-card">
                  <div>
                    <strong>{source.displayName}</strong>
                    <span className="ac-muted">{source.detail}</span>
                    <span className="ac-muted">
                      最近同步：
                      {formatDateTimeOrDash(source.lastSync?.finishedAt, timeZone)}
                    </span>
                  </div>
                  <Badge tone={sourceStageTone(source.stage)}>
                    {sourceStageLabel(source.stage)}
                  </Badge>
                </li>
              ))}
            </ul>
          </Section>

          <p className="ac-muted ac-footnote">
            当前时区 {timeZone}；今日范围自 {localDate(data.range.start, timeZone)} 起。
          </p>
        </>
      )}
    </div>
  )
}
