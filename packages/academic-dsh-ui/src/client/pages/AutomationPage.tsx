import { useCallback, useEffect, useState } from 'react'
import type { SyncRunSummary } from '@academic/contracts'
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
  formatDateTimeOrDash,
  jobLabel,
  runStatusLabel,
  syncStatusLabel,
} from '../view.js'
import type {
  AutomationJob,
  AutomationView,
  UiResult,
} from '../../protocol.js'
import type { PageProps } from './types.js'

export function AutomationPage({ ctx, active, nav }: PageProps) {
  const load = useCallback(
    (signal: AbortSignal) => callApi<AutomationView>(ctx, 'automation', {}, signal),
    [ctx],
  )
  const { state, refresh } = useLoad(load, active, 30_000)
  const action = useAction(refresh)
  const data = state.data
  const view = viewState(state)
  const timeZone = data?.timeZone ?? 'UTC'
  const [thresholds, setThresholds] = useState('')

  useEffect(() => {
    if (!data || nav?.focus !== 'notifications') return
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        document.getElementById('ac-notifications')?.scrollIntoView({
          block: 'start',
          behavior: 'smooth',
        })
      })
    })
  }, [data, nav?.focus, nav?.nonce])

  const toggleJob = async (job: AutomationJob): Promise<UiResult<AutomationJob>> =>
    callApi<AutomationJob>(ctx, 'setJobEnabled', {
      jobId: job.jobId,
      enabled: !job.enabled,
    })

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
          `同步未成功：${syncStatusLabel(result.value.status)}；旧数据已保留`,
      },
    }
  }

  const saveThresholds = async () => {
    const input = thresholds.trim() || data?.reminderSettings.thresholdsHours.join(',') || ''
    const values = input
      .split(',')
      .map((value) => Number(value.trim()))
      .filter((value) => Number.isFinite(value))
    if (values.length === 0 || values.some((value) => value < 1 || value > 720)) {
      action.setNotice({ tone: 'error', text: '提醒阈值需要是 1–720 小时的整数' })
      return
    }
    if (new Set(values).size !== values.length) {
      action.setNotice({ tone: 'error', text: '提醒阈值不能重复' })
      return
    }
    await action.run(
      'thresholds',
      () =>
        callApi(ctx, 'updateReminderSettings', {
          thresholdsHours: values.map((value) => Math.round(value)),
        }),
      '提醒阈值已保存',
    )
  }

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
      {!data && state.loading && <LoadingLine>正在读取自动化状态…</LoadingLine>}

      {data && (
        <>
          <div className="ac-inline-bar">
            <div>
              <Badge tone={data.projection.consistent ? 'ok' : 'warn'}>
                {data.projection.consistent ? '数据已更新' : '数据更新有延迟'}
              </Badge>
              <span className="ac-muted">
                事件位置 {data.projection.eventPosition} · 投影位置{' '}
                {data.projection.projectionPosition} · 待处理{' '}
                {data.projection.pendingEvents}
              </span>
            </div>
            <div className="ac-inline-actions">
              <button
                type="button"
                className="ac-button"
                disabled={action.pending !== undefined}
                onClick={() => void action.run('sync', syncNow, '同步完成')}
              >
                {action.pending === 'sync' ? '同步中…' : '立即同步'}
              </button>
              <button type="button" className="ac-button" onClick={() => void refresh()}>
                刷新
              </button>
            </div>
          </div>

          <Section title="自动化任务" subtitle="暂停后既有学业数据仍可查询">
            <ul className="ac-source-grid">
              {data.jobs.map((job) => (
                <li key={job.jobId} className="ac-card ac-job-card">
                  <div>
                    <div className="ac-task-title">
                      <strong>{jobLabel(job.jobId)}</strong>
                      <Badge tone={job.enabled ? 'ok' : 'warn'}>
                        {job.enabled ? '运行中' : '已暂停'}
                      </Badge>
                      {job.consecutiveFailures > 0 && (
                        <Badge tone="bad">连续失败 {job.consecutiveFailures} 次</Badge>
                      )}
                    </div>
                    <div className="ac-task-meta">
                      <span>任务 ID：{job.jobId}</span>
                      <span>周期：{job.intervalMinutes} 分钟</span>
                      <span>下次执行：{formatDateTimeOrDash(job.nextRunAt, timeZone)}</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="ac-button"
                    disabled={action.pending !== undefined}
                    onClick={() => void action.run(job.jobId, () => toggleJob(job), job.enabled ? '已暂停' : '已恢复')}
                  >
                    {job.enabled ? '暂停' : '恢复'}
                  </button>
                </li>
              ))}
            </ul>
          </Section>

          <Section title="提醒设置" subtitle="同一事项只提醒当前最紧急的一档；重启时会补查临近截止的事项">
            <div className="ac-form-card">
              <div className="ac-inline-bar">
                <div>
                  <Badge tone={data.reminderSettings.enabled ? 'ok' : 'warn'}>
                    {data.reminderSettings.enabled ? '提醒已启用' : '提醒已关闭'}
                  </Badge>
                  <span className="ac-muted">
                    当前阈值：
                    {data.reminderSettings.thresholdsHours
                      .slice()
                      .sort((a, b) => b - a)
                      .map((hours) => `${hours}h`)
                      .join(' / ')}
                  </span>
                </div>
                <button
                  type="button"
                  className="ac-button"
                  disabled={action.pending !== undefined}
                  onClick={() =>
                    void action.run(
                      'reminder-toggle',
                      () =>
                        callApi(ctx, 'updateReminderSettings', {
                          enabled: !data.reminderSettings.enabled,
                        }),
                      data.reminderSettings.enabled ? '提醒已关闭' : '提醒已启用',
                    )
                  }
                >
                  {data.reminderSettings.enabled ? '关闭提醒' : '启用提醒'}
                </button>
              </div>
              <div className="ac-form-grid">
                <Field label="阈值（小时，逗号分隔）" hint="默认 72,24；每个事项最多发送当前最紧急的一档。">
                  <input
                    value={thresholds}
                    onChange={(event) => setThresholds(event.target.value)}
                    placeholder={data.reminderSettings.thresholdsHours.join(',')}
                  />
                </Field>
              </div>
              <div className="ac-form-actions">
                <button
                  type="button"
                  className="ac-button"
                  disabled={action.pending !== undefined}
                  onClick={() => void saveThresholds()}
                >
                  保存阈值
                </button>
              </div>
            </div>
          </Section>

          <Section id="ac-notifications" title="通知" subtitle={`未读 ${data.unread} 条`}
            actions={
              <button
                type="button"
                className="ac-button"
                disabled={data.unread === 0 || action.pending !== undefined}
                onClick={() =>
                  void action.run(
                    'read-all',
                    () => callApi(ctx, 'markAllNotificationsRead', {}),
                    '全部提醒已标记为已读',
                  )
                }
              >
                全部已读
              </button>
            }
          >
            {data.notifications.length === 0 ? (
              <EmptyState title="还没有提醒">系统会定期检查截止时间，有需要提醒的事项时会显示在这里。</EmptyState>
            ) : (
              <ul className="ac-list">
                {data.notifications.map((notification) => (
                  <li
                    key={notification.notificationId}
                    className={`ac-list-row${notification.readAt ? '' : ' ac-unread'}`}
                  >
                    <div>
                      <strong>{notification.title}</strong>
                      <span className="ac-muted">{notification.body}</span>
                      <span className="ac-muted">
                        {formatDateTimeOrDash(notification.createdAt, timeZone)}
                      </span>
                    </div>
                    {!notification.readAt && (
                      <button
                        type="button"
                        className="ac-button"
                        disabled={action.pending !== undefined}
                        onClick={() =>
                          void action.run(
                            notification.notificationId,
                            () =>
                              callApi(ctx, 'markNotificationRead', {
                                notificationId: notification.notificationId,
                              }),
                            '提醒已标记为已读',
                          )
                        }
                      >
                        标记已读
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title="自动化运行记录" subtitle="最近 5 次后台任务的执行结果">
            {data.jobRuns.length === 0 ? (
              <EmptyState title="还没有运行记录" />
            ) : (
              <div className="ac-table-wrap">
                <table className="ac-table">
                  <thead>
                    <tr>
                      <th>开始</th>
                      <th>任务</th>
                      <th>状态</th>
                      <th>尝试</th>
                      <th>错误</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.jobRuns.map((run) => (
                      <tr key={run.runId}>
                        <td>{formatDateTimeOrDash(run.startedAt, timeZone)}</td>
                        <td>{jobLabel(run.jobId)}</td>
                        <td>
                          <Badge
                            tone={
                              run.status === 'succeeded'
                                ? 'ok'
                                : run.status === 'failed' || run.status === 'interrupted'
                                  ? 'bad'
                                  : 'warn'
                            }
                          >
                            {runStatusLabel(run.status)}
                          </Badge>
                        </td>
                        <td>{run.attempt}</td>
                        <td>{run.errorMessage ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>

          <Section title="数据源同步记录" subtitle="失败时保留最后一次有效数据">
            {data.syncRuns.length === 0 ? (
              <EmptyState title="还没有同步记录" />
            ) : (
              <div className="ac-table-wrap">
                <table className="ac-table">
                  <thead>
                    <tr>
                      <th>时间</th>
                      <th>来源</th>
                      <th>状态</th>
                      <th>抓取 / 新增 / 更新</th>
                      <th>错误</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.syncRuns.map((run) => (
                      <tr key={run.runId}>
                        <td>{formatDateTimeOrDash(run.finishedAt ?? run.startedAt, timeZone)}</td>
                        <td>{run.sourceId}</td>
                        <td>
                          <Badge
                            tone={
                              run.status === 'success'
                                ? 'ok'
                                : run.status === 'failed' || run.status === 'auth-required'
                                  ? 'bad'
                                  : 'warn'
                            }
                          >
                            {syncStatusLabel(run.status)}
                          </Badge>
                        </td>
                        <td>
                          {run.itemsSeen} / {run.created} / {run.updated}
                        </td>
                        <td>{run.errorMessage ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>
        </>
      )}
    </div>
  )
}
