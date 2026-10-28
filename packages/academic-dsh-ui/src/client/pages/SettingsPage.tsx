import { useCallback, useEffect, useRef, useState } from 'react'
import type { LockedBlock } from '@academic/contracts'
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
import { formatDateTimeOrDash, fromLocalInputValue } from '../view.js'
import type {
  AvailabilityView,
  PreferencesView,
  SettingsView,
  UiResult,
} from '../../protocol.js'
import type { PageProps } from './types.js'

interface SlotDraft {
  weekday: number
  start: string
  end: string
}

const WEEKDAYS = [
  { value: 1, label: '周一' },
  { value: 2, label: '周二' },
  { value: 3, label: '周三' },
  { value: 4, label: '周四' },
  { value: 5, label: '周五' },
  { value: 6, label: '周六' },
  { value: 0, label: '周日' },
]

let temporarySequence = 0

function newTemporaryBlock(start: string, end: string, title?: string): LockedBlock {
  temporarySequence += 1
  return {
    id: `temp-${Date.now()}-${temporarySequence}`,
    start,
    end,
    ...(title ? { title } : {}),
  }
}

export function SettingsPage({ ctx, active, onNavigate }: PageProps) {
  const load = useCallback(
    (signal: AbortSignal) => callApi<SettingsView>(ctx, 'settings', {}, signal),
    [ctx],
  )
  const { state, refresh } = useLoad(load, active)
  const action = useAction(refresh)
  const data = state.data
  const view = viewState(state)
  const initialized = useRef(false)
  const [timeZone, setTimeZone] = useState('')
  const [granularity, setGranularity] = useState('15')
  const [slots, setSlots] = useState<SlotDraft[]>([])
  const [blocks, setBlocks] = useState<LockedBlock[]>([])
  const [blockStart, setBlockStart] = useState('')
  const [blockEnd, setBlockEnd] = useState('')
  const [blockTitle, setBlockTitle] = useState('')
  const [interval, setIntervalMinutes] = useState('60')
  const [coursePriorities, setCoursePriorities] = useState<
    Record<string, number>
  >({})
  const [agentAdapterAutomation, setAgentAdapterAutomation] = useState(false)
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    if (!data || initialized.current) return
    initialized.current = true
    setTimeZone(data.availability.timeZone)
    setGranularity(String(data.availability.granularityMinutes))
    setSlots(data.availability.weeklySlots.map((slot) => ({ ...slot })))
    setBlocks(data.availability.temporaryBlocks.map((block) => ({ ...block })))
    setIntervalMinutes(String(data.sync.intervalMinutes))
    setCoursePriorities({ ...data.preferences.coursePriorities })
    setAgentAdapterAutomation(data.preferences.agentAdapterAutomation)
  }, [data])

  const saveAvailability = async (): Promise<UiResult<AvailabilityView>> => {
    const minutes = Number(granularity)
    if (!timeZone.trim()) {
      return { ok: false, error: { code: 'VALIDATION', message: '请填写 IANA 时区' } }
    }
    if (!Number.isFinite(minutes) || minutes < 5 || minutes > 60) {
      return { ok: false, error: { code: 'VALIDATION', message: '计划粒度需要是 5–60 分钟' } }
    }
    const result = await callApi<AvailabilityView>(ctx, 'updateAvailability', {
      timeZone: timeZone.trim(),
      granularityMinutes: Math.round(minutes),
      weeklySlots: slots,
      temporaryBlocks: blocks,
    })
    if (result.ok) setDirty(false)
    return result
  }

  const saveInterval = async (): Promise<UiResult<unknown>> => {
    const minutes = Number(interval)
    if (!Number.isFinite(minutes) || minutes < 1 || minutes > 10080) {
      return { ok: false, error: { code: 'VALIDATION', message: '同步周期需要是 1–10080 分钟' } }
    }
    return callApi(ctx, 'updateSyncSchedule', {
      intervalMinutes: Math.round(minutes),
    })
  }

  const savePreferences = async (): Promise<UiResult<PreferencesView>> =>
    callApi<PreferencesView>(ctx, 'updatePreferences', {
      coursePriorities,
      agentAdapterAutomation,
    })

  const addTemporary = () => {
    const start = fromLocalInputValue(blockStart)
    const end = fromLocalInputValue(blockEnd)
    if (!start || !end || Date.parse(end) <= Date.parse(start)) {
      action.setNotice({ tone: 'error', text: '请填写有效的临时不可用开始和结束时间' })
      return
    }
    setBlocks((current) => [...current, newTemporaryBlock(start, end, blockTitle || undefined)])
    setBlockStart('')
    setBlockEnd('')
    setBlockTitle('')
    setDirty(true)
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
      {!data && state.loading && <LoadingLine>正在读取设置…</LoadingLine>}

      {data && (
        <>
          {!data.plannerAvailable && (
            <div className="ac-banner ac-banner-warn" role="status">
              <div>
                <strong>Planner 当前不可用</strong>
                <p>可以保存可用时间；生成计划和候选需要重新加载 Planner 插件。</p>
              </div>
            </div>
          )}

          <Section
            title="学习时间"
            subtitle="Planner 不会默认全天可用；以下设置会持久化到 Host"
          >
            <form
              className="ac-form-card"
              onSubmit={(event) => {
                event.preventDefault()
                void action.run('availability', saveAvailability, '可用时间已保存')
              }}
            >
              <div className="ac-form-grid">
                <Field label="IANA 时区" hint="例如 Asia/Shanghai">
                  <input
                    value={timeZone}
                    onChange={(event) => {
                      setTimeZone(event.target.value)
                      setDirty(true)
                    }}
                    required
                  />
                </Field>
                <Field label="计划粒度（分钟）" hint="5–60 分钟">
                  <input
                    type="number"
                    min={5}
                    max={60}
                    value={granularity}
                    onChange={(event) => {
                      setGranularity(event.target.value)
                      setDirty(true)
                    }}
                  />
                </Field>
              </div>

              <div className="ac-subsection">
                <h3>每周可用时段</h3>
                {slots.length === 0 ? (
                  <EmptyState title="还没有可用时段">
                    没有可用时段时 Planner 不会自行把全天视为可用。
                  </EmptyState>
                ) : (
                  <ul className="ac-slot-list">
                    {slots.map((slot, index) => (
                      <li key={`${slot.weekday}:${slot.start}:${slot.end}:${index}`} className="ac-slot-row">
                        <select
                          aria-label="星期"
                          value={slot.weekday}
                          onChange={(event) => {
                            const weekday = Number(event.target.value)
                            setSlots((current) =>
                              current.map((entry, entryIndex) =>
                                entryIndex === index ? { ...entry, weekday } : entry,
                              ),
                            )
                            setDirty(true)
                          }}
                        >
                          {WEEKDAYS.map((day) => (
                            <option key={day.value} value={day.value}>
                              {day.label}
                            </option>
                          ))}
                        </select>
                        <input
                          aria-label="开始时间"
                          type="time"
                          value={slot.start}
                          onChange={(event) => {
                            const start = event.target.value
                            setSlots((current) =>
                              current.map((entry, entryIndex) =>
                                entryIndex === index ? { ...entry, start } : entry,
                              ),
                            )
                            setDirty(true)
                          }}
                        />
                        <span className="ac-muted">至</span>
                        <input
                          aria-label="结束时间"
                          type="time"
                          value={slot.end}
                          onChange={(event) => {
                            const end = event.target.value
                            setSlots((current) =>
                              current.map((entry, entryIndex) =>
                                entryIndex === index ? { ...entry, end } : entry,
                              ),
                            )
                            setDirty(true)
                          }}
                        />
                        <button
                          type="button"
                          className="ac-button"
                          onClick={() => {
                            setSlots((current) => current.filter((_, entryIndex) => entryIndex !== index))
                            setDirty(true)
                          }}
                        >
                          删除
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <button
                  type="button"
                  className="ac-button"
                  onClick={() => {
                    setSlots((current) => [...current, { weekday: 1, start: '19:00', end: '22:00' }])
                    setDirty(true)
                  }}
                >
                  添加时段
                </button>
              </div>

              <div className="ac-subsection">
                <h3>临时不可用时间</h3>
                {blocks.length === 0 ? (
                  <p className="ac-muted">没有临时不可用时间。</p>
                ) : (
                  <ul className="ac-list">
                    {blocks.map((block) => (
                      <li key={block.id} className="ac-list-row">
                        <div>
                          <strong>{block.title ?? '临时不可用'}</strong>
                          <span className="ac-muted">
                            {formatDateTimeOrDash(block.start, timeZone)} —{' '}
                            {formatDateTimeOrDash(block.end, timeZone)}
                          </span>
                        </div>
                        <button
                          type="button"
                          className="ac-button"
                          onClick={() => {
                            setBlocks((current) => current.filter((entry) => entry.id !== block.id))
                            setDirty(true)
                          }}
                        >
                          删除
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="ac-form-grid">
                  <Field label="开始（浏览器本地时间）">
                    <input
                      type="datetime-local"
                      value={blockStart}
                      onChange={(event) => setBlockStart(event.target.value)}
                    />
                  </Field>
                  <Field label="结束（浏览器本地时间）">
                    <input
                      type="datetime-local"
                      value={blockEnd}
                      onChange={(event) => setBlockEnd(event.target.value)}
                    />
                  </Field>
                  <Field label="说明（可选）">
                    <input
                      value={blockTitle}
                      onChange={(event) => setBlockTitle(event.target.value)}
                      maxLength={200}
                    />
                  </Field>
                </div>
                <button type="button" className="ac-button" onClick={addTemporary}>
                  添加临时不可用
                </button>
              </div>

              <div className="ac-form-actions">
                <button type="submit" className="ac-button ac-button-primary" disabled={action.pending !== undefined}>
                  {action.pending === 'availability' ? '保存中…' : '保存可用时间'}
                </button>
                {dirty && <span className="ac-muted">有未保存的修改</span>}
              </div>
            </form>
          </Section>

          <Section title="同步周期" subtitle="只修改内置同步任务的周期；不会启动第二份 Runtime">
            <form
              className="ac-form-card"
              onSubmit={(event) => {
                event.preventDefault()
                void action.run('interval', saveInterval, '同步周期已保存')
              }}
            >
              <div className="ac-form-grid">
                <Field label="周期（分钟）" hint={`当前任务：${data.sync.jobId}`}>
                  <input
                    type="number"
                    min={1}
                    max={10080}
                    value={interval}
                    onChange={(event) => setIntervalMinutes(event.target.value)}
                  />
                </Field>
              </div>
              <div className="ac-form-actions">
                <button type="submit" className="ac-button" disabled={action.pending !== undefined}>
                  保存周期
                </button>
                <span className="ac-muted">
                  下次执行：{formatDateTimeOrDash(data.sync.nextRunAt, data.availability.timeZone)}
                </span>
              </div>
            </form>
          </Section>

          <Section
            title="课程优先级"
            subtitle="用户明确设定；仅在任务自身优先级相同时影响计划排序"
          >
            {data.preferences.courses.length === 0 ? (
              <EmptyState title="还没有课程">添加课程后可设置优先级。</EmptyState>
            ) : (
              <form
                className="ac-form-card"
                onSubmit={(event) => {
                  event.preventDefault()
                  void action.run(
                    'preferences',
                    savePreferences,
                    '课程优先级已保存',
                  )
                }}
              >
                {data.preferences.courses.map((course) => (
                  <div key={course.courseId} className="ac-inline-bar">
                    <div>
                      <strong>
                        {course.code} {course.title}
                      </strong>
                      <span className="ac-muted">{course.courseId}</span>
                    </div>
                    <select
                      value={coursePriorities[course.courseId] ?? 0}
                      onChange={(event) =>
                        setCoursePriorities((current) => ({
                          ...current,
                          [course.courseId]: Number(event.target.value),
                        }))
                      }
                    >
                      <option value={0}>0 · 普通</option>
                      <option value={1}>1 · 较高</option>
                      <option value={2}>2 · 高</option>
                      <option value={3}>3 · 最高</option>
                    </select>
                  </div>
                ))}
                <div className="ac-form-actions">
                  <button
                    type="submit"
                    className="ac-button"
                    disabled={action.pending !== undefined}
                  >
                    {action.pending === 'preferences' ? '保存中…' : '保存课程优先级'}
                  </button>
                  <span className="ac-muted">
                    更新于 {formatDateTimeOrDash(data.preferences.updatedAt, data.availability.timeZone)}
                  </span>
                </div>
              </form>
            )}
          </Section>

          <Section
            title="Agent 自动接入"
            subtitle="一次性开启；不需要逐个候选点击审核"
          >
            <form
              className="ac-form-card"
              onSubmit={(event) => {
                event.preventDefault()
                void action.run(
                  'preferences',
                  savePreferences,
                  'Agent 自动接入设置已保存',
                )
              }}
            >
              <label className="ac-inline-bar">
                <input
                  type="checkbox"
                  checked={agentAdapterAutomation}
                  onChange={(event) =>
                    setAgentAdapterAutomation(event.target.checked)
                  }
                />
                <div>
                  <strong>
                    允许 Agent 自动启用已验证 Adapter 并同步其声明式数据源
                  </strong>
                  <span className="ac-muted">
                    仍不能启用未验证候选、读取凭据、提交作业或修改学校平台；
                    关闭后恢复逐次审核。
                  </span>
                </div>
              </label>
              <div className="ac-form-actions">
                <button
                  type="submit"
                  className="ac-button"
                  disabled={action.pending !== undefined}
                >
                  {action.pending === 'preferences' ? '保存中…' : '保存自动接入设置'}
                </button>
              </div>
            </form>
          </Section>

          <Section title="提醒" subtitle="阈值与未读提醒在自动化页管理">
            <div className="ac-inline-bar">
              <div>
                <Badge tone={data.reminders.enabled ? 'ok' : 'warn'}>
                  {data.reminders.enabled ? '提醒已启用' : '提醒已关闭'}
                </Badge>
                <span className="ac-muted">
                  阈值：
                  {data.reminders.thresholdsHours
                    .slice()
                    .sort((a, b) => b - a)
                    .map((hours) => `${hours}h`)
                    .join(' / ')}
                </span>
              </div>
              <button type="button" className="ac-button" onClick={() => onNavigate('automation')}>
                打开自动化
              </button>
            </div>
          </Section>

          <Section
            title="已加载能力"
            subtitle="只读；启停由插件生命周期控制，停用后相关操作返回 CAPABILITY_UNAVAILABLE"
          >
            {data.capabilities.length === 0 ? (
              <EmptyState title="没有已注册能力">检查 Host 插件是否加载。</EmptyState>
            ) : (
              <ul className="ac-list">
                {data.capabilities.map((entry) => (
                  <li key={entry.id} className="ac-list-row">
                    <div>
                      <strong>
                        {entry.id} · {entry.version}
                      </strong>
                      <span className="ac-muted">
                        {entry.kind} · 提供方 {entry.providerPlugin}
                      </span>
                      <span className="ac-muted">
                        能力：{entry.capabilities.join('、') || '—'} · 权限：
                        {entry.requiredPermissions.join('、') || '无'}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title="界面偏好" subtitle="只保存非敏感 UI 偏好">
            <p className="ac-muted">
              当前页面和筛选等纯界面偏好保存在本机浏览器；课程、任务、计划、可用时间与凭据不会保存在浏览器存储。
            </p>
            <button
              type="button"
              className="ac-button"
              onClick={() => {
                try {
                  window.localStorage.removeItem('academic.ui.tab.v1')
                } catch {
                  // Storage may be disabled; nothing sensitive is stored here.
                }
                action.setNotice({ tone: 'ok', text: '已清除本机界面偏好；业务数据不受影响' })
              }}
            >
              清除界面偏好
            </button>
          </Section>
        </>
      )}
    </div>
  )
}
