import { useCallback, useMemo, useState } from 'react'
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
  formatDateTime,
  formatMinutes,
  fromLocalInputValue,
  groupBlocksByDate,
  groupBlocksByWeek,
  groupLockedByDate,
  sortPlanBlocks,
  planStatusLabel,
  weekdayLabel,
} from '../view.js'
import type { LockedBlock, PlanBlock } from '@academic/contracts'
import type {
  AvailabilityView,
  PlanCandidate,
  PlanMutationResult,
  PlanView,
  TaskCard,
  UiResult,
} from '../../protocol.js'
import type { PageProps } from './types.js'

function taskTitle(tasks: TaskCard[], taskId: string): string {
  return tasks.find((card) => card.task.taskId === taskId)?.task.title ?? taskId
}

type PlanMode = 'day' | 'week' | 'list'

interface DisplayGroup {
  key: string
  label: string
  blocks: PlanBlock[]
}

function displayGroups(
  blocks: PlanBlock[],
  timeZone: string,
  mode: PlanMode,
): DisplayGroup[] {
  if (mode === 'list') {
    return [{ key: 'all', label: '全部时间块', blocks: sortPlanBlocks(blocks) }]
  }
  if (mode === 'week') {
    return groupBlocksByWeek(blocks, timeZone).map((group) => ({
      key: group.date,
      label: `${group.date} — ${group.endDate}`,
      blocks: group.blocks,
    }))
  }
  return groupBlocksByDate(blocks, timeZone).map((group) => ({
    key: group.date,
    label: `${group.date} ${weekdayLabel(group.date)}`,
    blocks: group.blocks,
  }))
}

function availabilitySummary(availability: AvailabilityView): string {
  const days = new Set(availability.weeklySlots.map((slot) => slot.weekday)).size
  return `${availability.timeZone} · 每周 ${days} 天可用 · 粒度 ${availability.granularityMinutes} 分钟 · 临时不可用 ${availability.temporaryBlocks.length} 段`
}

export function PlanPage({ ctx, active, onNavigate }: PageProps) {
  const load = useCallback(
    (signal: AbortSignal) => callApi<PlanView>(ctx, 'plan', {}, signal),
    [ctx],
  )
  const { state, refresh } = useLoad(load, active)
  const action = useAction(refresh)
  const [candidate, setCandidate] = useState<PlanCandidate>()
  const [rangeDays, setRangeDays] = useState('7')
  const [mode, setMode] = useState<PlanMode>('day')
  const [lockStart, setLockStart] = useState('')
  const [lockEnd, setLockEnd] = useState('')
  const [lockTitle, setLockTitle] = useState('')
  const view = viewState(state)
  const data = state.data
  const timeZone = data?.availability.timeZone ?? 'UTC'
  const plan = data?.plan
  const tasks = data?.tasks ?? []

  const candidateGroups = useMemo(
    () => (candidate ? displayGroups(candidate.blocks, timeZone, mode) : []),
    [candidate, timeZone, mode],
  )
  const planGroups = useMemo(
    () => (plan ? displayGroups(plan.blocks, timeZone, mode) : []),
    [plan, timeZone, mode],
  )
  const lockedGroups = useMemo(
    () => (plan ? groupLockedByDate(plan.lockedBlocks, timeZone) : []),
    [plan, timeZone],
  )

  const generate = async (): Promise<UiResult<PlanCandidate>> => {
    const start = new Date()
    const end = new Date(start.getTime() + Number(rangeDays) * 86_400_000)
    return callApi<PlanCandidate>(ctx, 'previewPlan', {
      start: start.toISOString(),
      end: end.toISOString(),
    })
  }

  const preview = async () => {
    await action.run(
      'preview',
      async () => {
        const result = await generate()
        if (result.ok) setCandidate(result.value)
        return result
      },
      '候选计划已生成；确认前不会写入确认计划',
    )
  }

  const accept = async (): Promise<UiResult<PlanMutationResult>> => {
    if (!candidate) {
      return { ok: false, error: { code: 'VALIDATION', message: '没有候选计划' } }
    }
    return callApi<PlanMutationResult>(ctx, 'acceptPlan', {
      previewId: candidate.previewId,
    })
  }

  const lock = async (start: string, end: string, title?: string) => {
    const result = await callApi<PlanMutationResult>(ctx, 'lockPlanBlock', {
      start,
      end,
      ...(title ? { title } : {}),
    })
    if (!result.ok) {
      action.setNotice({ tone: 'error', text: result.error.message })
      return
    }
    action.setNotice({ tone: 'ok', text: '时段已锁定；重叠的旧计划块已移除' })
    setCandidate(undefined)
    await refresh()
  }

  const addLock = async () => {
    const start = fromLocalInputValue(lockStart)
    const end = fromLocalInputValue(lockEnd)
    if (!start || !end || Date.parse(end) <= Date.parse(start)) {
      action.setNotice({ tone: 'error', text: '请填写有效的锁定开始和结束时间' })
      return
    }
    await lock(start, end, lockTitle || undefined)
    setLockStart('')
    setLockEnd('')
    setLockTitle('')
  }

  return (
    <div>
      <StateBanner
        state={view}
        failure={state.failure}
        updatedAt={state.updatedAt}
        onRetry={() => void refresh()}
        onNavigate={() => onNavigate('settings')}
      />
      {action.notice && (
        <NoticeBar notice={action.notice} onDismiss={() => action.setNotice(undefined)} />
      )}
      {!data && state.loading && <LoadingLine>正在读取计划…</LoadingLine>}

      {data && (
        <>
          <div className="ac-inline-bar">
            <div>
              <Badge tone={data.plannerAvailable ? 'ok' : 'bad'}>
                {data.plannerAvailable ? 'Planner 已加载' : 'Planner 不可用'}
              </Badge>
              <span className="ac-muted">{availabilitySummary(data.availability)}</span>
            </div>
            <div className="ac-inline-actions">
              <div className="ac-toggle" role="tablist" aria-label="计划视图">
                <button
                  type="button"
                  role="tab"
                  aria-selected={mode === 'day'}
                  className={mode === 'day' ? 'ac-toggle-active' : ''}
                  onClick={() => setMode('day')}
                >
                  按日
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={mode === 'week'}
                  className={mode === 'week' ? 'ac-toggle-active' : ''}
                  onClick={() => setMode('week')}
                >
                  按周
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={mode === 'list'}
                  className={mode === 'list' ? 'ac-toggle-active' : ''}
                  onClick={() => setMode('list')}
                >
                  列表
                </button>
              </div>
              <Field label="规划范围">
                <select value={rangeDays} onChange={(event) => setRangeDays(event.target.value)}>
                  <option value="7">未来 7 天</option>
                  <option value="14">未来 14 天</option>
                  <option value="30">未来 30 天</option>
                </select>
              </Field>
              <button
                type="button"
                className="ac-button ac-button-primary"
                disabled={!data.plannerAvailable || action.pending !== undefined}
                onClick={() => void preview()}
              >
                {action.pending === 'preview' ? '生成中…' : '生成候选计划'}
              </button>
              <button type="button" className="ac-button" onClick={() => onNavigate('settings')}>
                修改可用时间
              </button>
            </div>
          </div>

          {!data.plannerAvailable && (
            <div className="ac-banner ac-banner-warn" role="status">
              <div>
                <strong>规划能力当前不可用</strong>
                <p>已有计划仍可查询和查看；生成新计划需要重新加载 Planner 插件。</p>
              </div>
            </div>
          )}

          {candidate && (
            <Section
              title="候选计划"
              subtitle="候选未确认，不会覆盖已确认计划"
              actions={
                <div className="ac-inline-actions">
                  <span className="ac-chip ac-chip-warn">候选 · 未确认</span>
                  <button
                    type="button"
                    className="ac-button ac-button-primary"
                    disabled={action.pending !== undefined || plan?.status === 'active'}
                    onClick={() =>
                      void action.run('accept', accept, '候选计划已确认').then((ok) => {
                        if (ok) setCandidate(undefined)
                      })
                    }
                  >
                    {action.pending === 'accept' ? '确认中…' : '确认候选计划'}
                  </button>
                  <button type="button" className="ac-button" onClick={() => setCandidate(undefined)}>
                    放弃候选
                  </button>
                </div>
              }
            >
              {plan?.status === 'active' && (
                <p className="ac-muted">
                  已有确认计划；请先归档旧计划，确认候选不会静默覆盖它。
                </p>
              )}
              <div className="ac-stat-grid ac-stat-grid-small">
                <div className="ac-stat">
                  <span className="ac-stat-label">任务</span>
                  <strong className="ac-stat-value">{candidate.stats.taskCount}</strong>
                </div>
                <div className="ac-stat">
                  <span className="ac-stat-label">已安排</span>
                  <strong className="ac-stat-value">
                    {formatMinutes(candidate.stats.scheduledMinutes)}
                  </strong>
                </div>
                <div className="ac-stat">
                  <span className="ac-stat-label">未安排</span>
                  <strong className="ac-stat-value">
                    {formatMinutes(candidate.stats.unscheduledMinutes)}
                  </strong>
                </div>
              </div>
              {candidate.warnings.length > 0 && (
                <ul className="ac-warning-list">
                  {candidate.warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              )}
              {candidateGroups.length === 0 ? (
                <EmptyState title="没有可安排的候选时间块">
                  检查可用时间、锁定时段和任务预计时长。
                </EmptyState>
              ) : (
                <div className="ac-day-groups">
                  {candidateGroups.map((group) => (
                    <div key={group.key} className="ac-day-group">
                      <h3>{group.label}</h3>
                      <ul className="ac-block-list">
                        {group.blocks.map((block) => (
                          <li key={`${block.taskId}:${block.start}`} className="ac-block-row">
                            <time>{formatDateTime(block.start, timeZone)}</time>
                            <span>{taskTitle(tasks, block.taskId)}</span>
                            <span className="ac-muted">
                              {formatMinutes(
                                (Date.parse(block.end) - Date.parse(block.start)) / 60_000,
                              )}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
              {candidate.unscheduled.length > 0 && (
                <div className="ac-subsection">
                  <h3>未能安排的任务</h3>
                  <ul className="ac-list">
                    {candidate.unscheduled.map((entry) => (
                      <li key={entry.taskId} className="ac-list-row">
                        <div>
                          <strong>{entry.title}</strong>
                          <span className="ac-muted">{entry.reason}</span>
                        </div>
                        <Badge tone="warn">{formatMinutes(entry.remainingMinutes)}</Badge>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </Section>
          )}

          <Section
            title="当前计划"
            subtitle={plan ? `状态：${planStatusLabel(plan.status)}` : '尚未确认计划'}
            actions={
              plan?.status === 'active' ? (
                <ConfirmAction
                  label="归档计划"
                  confirmLabel="确认归档"
                  disabled={action.pending !== undefined}
                  onConfirm={() =>
                    void action.run(
                      'archive',
                      () => callApi<PlanMutationResult>(ctx, 'archivePlan', {}),
                      '计划已归档；已确认历史仍可追溯',
                    ).then((ok) => {
                      if (ok) setCandidate(undefined)
                    })
                  }
                />
              ) : undefined
            }
          >
            {!plan ? (
              <EmptyState title="还没有确认计划">
                生成候选计划并确认后，计划块会出现在这里。
              </EmptyState>
            ) : (
              <>
                {plan.status === 'archived' && (
                  <p className="ac-muted">该计划已归档，不能继续修改；可以生成新的候选计划。</p>
                )}
                {planGroups.length === 0 ? (
                  <EmptyState title="当前计划没有时间块" />
                ) : (
                  <div className="ac-day-groups">
                    {planGroups.map((group) => (
                      <div key={group.key} className="ac-day-group">
                        <h3>{group.label}</h3>
                        <ul className="ac-block-list">
                          {group.blocks.map((block) => (
                            <li key={`${block.taskId}:${block.start}`} className="ac-block-row">
                              <time>{formatDateTime(block.start, timeZone)}</time>
                              <span>{taskTitle(tasks, block.taskId)}</span>
                              <span className="ac-muted">
                                {formatMinutes(
                                  (Date.parse(block.end) - Date.parse(block.start)) / 60_000,
                                )}
                              </span>
                              <button
                                type="button"
                                className="ac-button"
                                disabled={plan.status !== 'active' || action.pending !== undefined}
                                onClick={() =>
                                  void lock(
                                    block.start,
                                    block.end,
                                    taskTitle(tasks, block.taskId),
                                  )
                                }
                              >
                                锁定此块
                              </button>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                )}

                <div className="ac-subsection">
                  <h3>锁定时段</h3>
                  {lockedGroups.length === 0 ? (
                    <p className="ac-muted">没有锁定时段；锁定是硬约束，Planner 不会占用。</p>
                  ) : (
                    <ul className="ac-list">
                      {lockedGroups.flatMap((group) =>
                        group.blocks.map((block: LockedBlock) => (
                          <li key={block.id} className="ac-list-row">
                            <div>
                              <strong>{block.title ?? '锁定时段'}</strong>
                              <span className="ac-muted">
                                {formatDateTime(block.start, timeZone)} —{' '}
                                {formatDateTime(block.end, timeZone)}
                              </span>
                            </div>
                            <ConfirmAction
                              label="解锁"
                              confirmLabel="确认解锁"
                              disabled={action.pending !== undefined}
                              onConfirm={() =>
                                void action.run(
                                  'unlock',
                                  () =>
                                    callApi<PlanMutationResult>(ctx, 'unlockPlanBlock', {
                                      lockId: block.id,
                                    }),
                                  '时段已解锁',
                                ).then((ok) => {
                                  if (ok) setCandidate(undefined)
                                })
                              }
                            />
                          </li>
                        )),
                      )}
                    </ul>
                  )}
                </div>
              </>
            )}
          </Section>

          <Section
            title="临时锁定时段"
            subtitle="锁定为硬约束；解锁后重新生成候选计划"
          >
            <form
              className="ac-form-card"
              onSubmit={(event) => {
                event.preventDefault()
                void addLock()
              }}
            >
              <div className="ac-form-grid">
                <Field label="开始时间（浏览器本地时间）">
                  <input
                    type="datetime-local"
                    value={lockStart}
                    onChange={(event) => setLockStart(event.target.value)}
                    required
                  />
                </Field>
                <Field label="结束时间（浏览器本地时间）">
                  <input
                    type="datetime-local"
                    value={lockEnd}
                    onChange={(event) => setLockEnd(event.target.value)}
                    required
                  />
                </Field>
                <Field label="说明（可选）">
                  <input
                    value={lockTitle}
                    onChange={(event) => setLockTitle(event.target.value)}
                    maxLength={200}
                  />
                </Field>
              </div>
              <div className="ac-form-actions">
                <button
                  type="submit"
                  className="ac-button"
                  disabled={!plan || plan.status !== 'active' || action.pending !== undefined}
                >
                  锁定时段
                </button>
              </div>
            </form>
          </Section>
        </>
      )}
    </div>
  )
}
