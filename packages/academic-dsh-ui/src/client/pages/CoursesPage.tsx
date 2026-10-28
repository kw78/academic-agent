import { useCallback, useEffect, useMemo, useState } from 'react'
import type { CourseView } from '@academic/contracts'
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
  formatDateTimeOrDash,
  formatDue,
  formatMinutes,
  sourceStageLabel,
  sourceStageTone,
  syncStatusLabel,
} from '../view.js'
import type {
  CommandReceipt,
  CourseSummary,
  CoursesView,
  MaterialCard,
  MaterialsView,
  PreferencesView,
  SourceStatus,
  TasksView,
  UiResult,
} from '../../protocol.js'
import type { PageProps } from './types.js'

interface CourseWorkspace {
  courses: CoursesView
  preferences: PreferencesView
}

interface CourseDetail {
  courseId: string
  tasks?: TasksView
  materials?: MaterialCard[]
  failure?: string
}

function courseLabel(course: CourseView): string {
  return `${course.code} ${course.title}`
}

function CourseSummaryBadges({ summary }: { summary?: CourseSummary }) {
  if (!summary) return null
  return (
    <span className="ac-course-summary">
      <span>{summary.activeTasks} 个进行中任务</span>
      <span>{summary.activeItems} 个来源事项</span>
      <span>{summary.plannedTasks} 个已安排</span>
      <span>{summary.materialCount} 份资料</span>
    </span>
  )
}

function CourseEditor({
  ctx,
  course,
  onChanged,
  onCancel,
}: {
  ctx: PageProps['ctx']
  course: CourseView
  onChanged: () => Promise<unknown>
  onCancel: () => void
}) {
  const action = useAction(onChanged)
  const [termId, setTermId] = useState(course.termId)
  const [code, setCode] = useState(course.code)
  const [title, setTitle] = useState(course.title)

  const save = async (): Promise<UiResult<CommandReceipt>> => {
    if (!termId.trim() || !code.trim() || !title.trim()) {
      return {
        ok: false,
        error: { code: 'VALIDATION', message: '学期、课程代码和名称不能为空' },
      }
    }
    return callApi<CommandReceipt>(ctx, 'updateCourse', {
      id: course.courseId,
      termId: termId.trim(),
      code: code.trim(),
      title: title.trim(),
    })
  }

  return (
    <div className="ac-course-editor ac-form-grid">
      <Field label="学期">
        <input value={termId} onChange={(event) => setTermId(event.target.value)} />
      </Field>
      <Field label="课程代码">
        <input value={code} onChange={(event) => setCode(event.target.value)} />
      </Field>
      <Field label="课程名称">
        <input value={title} onChange={(event) => setTitle(event.target.value)} />
      </Field>
      <div className="ac-form-actions">
        <button
          type="button"
          className="ac-button ac-button-primary"
          disabled={action.pending !== undefined}
          onClick={() =>
            void action.run('course-update', save, '课程信息已更新').then((ok) => {
              if (ok) onCancel()
            })
          }
        >
          保存
        </button>
        <button type="button" className="ac-button" onClick={onCancel}>
          取消
        </button>
      </div>
      {action.notice && (
        <NoticeBar notice={action.notice} onDismiss={() => action.setNotice(undefined)} />
      )}
    </div>
  )
}

function CourseListItem({
  course,
  summary,
  selected,
  onSelect,
  ctx,
  onChanged,
}: {
  course: CourseView
  summary?: CourseSummary
  selected: boolean
  onSelect: () => void
  ctx: PageProps['ctx']
  onChanged: () => Promise<unknown>
}) {
  const [editing, setEditing] = useState(false)
  return (
    <li
      className={`ac-course-item${selected ? ' ac-course-item-selected' : ''}`}
      aria-current={selected ? 'true' : undefined}
    >
      <button
        type="button"
        className="ac-course-select"
        onClick={onSelect}
        disabled={course.deleted}
      >
        <span className="ac-course-title">
          <strong>{courseLabel(course)}</strong>
          {course.archived && <Badge tone="neutral">已归档</Badge>}
          {course.deleted && <Badge tone="bad">已删除</Badge>}
        </span>
        <span className="ac-muted">{course.termId}</span>
        <CourseSummaryBadges summary={summary} />
      </button>
      <div className="ac-course-item-actions">
        {!course.deleted && !course.archived && (
          <button
            type="button"
            className="ac-button ac-button-quiet"
            onClick={() => setEditing((value) => !value)}
          >
            {editing ? '收起' : '编辑'}
          </button>
        )}
        {(course.archived || course.deleted) && (
          <button
            type="button"
            className="ac-button ac-button-quiet"
            onClick={() =>
              void callApi<CommandReceipt>(ctx, 'restoreCourse', {
                id: course.courseId,
              }).then(() => onChanged())
            }
          >
            恢复
          </button>
        )}
      </div>
      {editing && (
        <CourseEditor
          ctx={ctx}
          course={course}
          onChanged={onChanged}
          onCancel={() => setEditing(false)}
        />
      )}
    </li>
  )
}

export function CoursesPage({ ctx, active, onNavigate, nav }: PageProps) {
  const load = useCallback(
    async (signal: AbortSignal): Promise<UiResult<CourseWorkspace>> => {
      const [courses, preferences] = await Promise.all([
        callApi<CoursesView>(ctx, 'courses', {}, signal),
        callApi<PreferencesView>(ctx, 'preferences', {}, signal),
      ])
      if (!courses.ok) return courses
      if (!preferences.ok) return preferences
      return {
        ok: true,
        value: { courses: courses.value, preferences: preferences.value },
      }
    },
    [ctx],
  )
  const { state, refresh } = useLoad(load, active)
  const [showInactive, setShowInactive] = useState(false)
  const [termId, setTermId] = useState('all')
  const [selectedId, setSelectedId] = useState<string | undefined>(nav?.courseId)
  const [detail, setDetail] = useState<CourseDetail>()
  const [detailVersion, setDetailVersion] = useState(0)
  const [adding, setAdding] = useState(false)
  const [newTerm, setNewTerm] = useState('')
  const [newCode, setNewCode] = useState('')
  const [newTitle, setNewTitle] = useState('')

  const refreshAll = useCallback(async () => {
    await refresh()
    setDetailVersion((value) => value + 1)
  }, [refresh])
  const action = useAction(refreshAll)
  const view = viewState(state)
  const data = state.data

  useEffect(() => {
    if (nav?.courseId) setSelectedId(nav.courseId)
  }, [nav?.nonce, nav?.courseId])

  const visibleCourses = useMemo(() => {
    if (!data) return []
    return data.courses.courses
      .filter((course) => showInactive || (!course.archived && !course.deleted))
      .filter((course) => termId === 'all' || course.termId === termId)
      .sort((left, right) => {
        const term = left.termId.localeCompare(right.termId)
        if (term !== 0) return term
        return left.code.localeCompare(right.code, 'zh-CN')
      })
  }, [data, showInactive, termId])

  const terms = useMemo(() => {
    if (!data) return []
    return [...new Set(data.courses.courses.map((course) => course.termId))].sort()
  }, [data])

  // Selecting an ambiguous set of courses stays explicit; only a single
  // unambiguous course opens automatically.
  useEffect(() => {
    if (!data) return
    const selectable = data.courses.courses.filter(
      (course) => !course.deleted && !course.archived,
    )
    if (selectedId && visibleCourses.some((course) => course.courseId === selectedId)) {
      return
    }
    if (!selectedId && selectable.length === 1) {
      setSelectedId(selectable[0]?.courseId)
    }
  }, [data, selectedId, visibleCourses])

  useEffect(() => {
    if (!selectedId || !active) return undefined
    let cancelled = false
    setDetail({ courseId: selectedId })
    void (async () => {
      const [tasks, materials] = await Promise.all([
        callApi<TasksView>(ctx, 'tasks', {
          courseId: selectedId,
          status: 'all',
          includeArchived: true,
          limit: 500,
        }),
        callApi<MaterialsView>(ctx, 'materials', {}),
      ])
      if (cancelled) return
      if (!tasks.ok) {
        setDetail({ courseId: selectedId, failure: tasks.error.message })
        return
      }
      const materialList = materials.ok
        ? materials.value.materials.filter(
            (card) => card.material.courseId === selectedId,
          )
        : []
      setDetail({
        courseId: selectedId,
        tasks: tasks.value,
        materials: materialList,
      })
    })()
    return () => {
      cancelled = true
    }
  }, [active, ctx, detailVersion, selectedId])

  const selectedCourse = data?.courses.courses.find(
    (course) => course.courseId === selectedId,
  )
  const selectedSummary = data?.courses.summaries.find(
    (summary) => summary.courseId === selectedId,
  )
  const selectedSources: SourceStatus[] = selectedSummary
    ? (data?.courses.sources ?? []).filter((source) =>
        selectedSummary.sourceIds.includes(source.sourceId),
      )
    : []
  const priorities = data?.preferences.coursePriorities ?? {}

  const savePriority = async (courseId: string, priority: number) => {
    if (!data) return
    await action.run(
      'priority',
      () =>
        callApi<PreferencesView>(ctx, 'updatePreferences', {
          coursePriorities: { ...priorities, [courseId]: priority },
          agentAdapterAutomation: data.preferences.agentAdapterAutomation,
        }),
      '课程优先级已保存',
    )
  }

  const addCourse = async (): Promise<UiResult<CommandReceipt>> => {
    if (!newTerm.trim() || !newCode.trim() || !newTitle.trim()) {
      return {
        ok: false,
        error: { code: 'VALIDATION', message: '请填写学期、课程代码和课程名称' },
      }
    }
    return callApi<CommandReceipt>(ctx, 'addCourse', {
      termId: newTerm.trim(),
      code: newCode.trim(),
      title: newTitle.trim(),
    })
  }

  const detailTasks = detail?.tasks?.cards ?? []
  const activeTasks = detailTasks.filter(
    (card) => !card.task.archived && card.task.status === 'active',
  )
  const dueNow = new Date().toISOString()
  const detailTimeZone = detail?.tasks?.timeZone ?? 'UTC'
  const plannedBlockIds = new Set(
    (detail?.tasks?.planBlocks ?? []).map((block) => block.taskId),
  )

  return (
    <div>
      <StateBanner
        state={view}
        failure={state.failure}
        updatedAt={state.updatedAt}
        onRetry={() => void refreshAll()}
      />
      {action.notice && (
        <NoticeBar notice={action.notice} onDismiss={() => action.setNotice(undefined)} />
      )}
      {!data && state.loading && <LoadingLine>正在读取课程…</LoadingLine>}

      {data && (
        <>
          <div className="ac-toolbar">
            <div className="ac-inline-actions">
              <Field label="学期">
                <select value={termId} onChange={(event) => setTermId(event.target.value)}>
                  <option value="all">全部学期</option>
                  {terms.map((term) => (
                    <option key={term} value={term}>
                      {term}
                    </option>
                  ))}
                </select>
              </Field>
              <button
                type="button"
                className="ac-button"
                aria-pressed={showInactive}
                onClick={() => setShowInactive((value) => !value)}
              >
                {showInactive ? '隐藏已归档/已删除' : '显示已归档/已删除'}
              </button>
            </div>
            <button
              type="button"
              className="ac-button"
              onClick={() => setAdding((value) => !value)}
            >
              {adding ? '取消添加' : '添加课程'}
            </button>
          </div>

          {adding && (
            <form
              className="ac-form-card"
              onSubmit={(event) => {
                event.preventDefault()
                void action.run('add-course', addCourse, '课程已添加').then((ok) => {
                  if (ok) {
                    setAdding(false)
                    setNewTerm('')
                    setNewCode('')
                    setNewTitle('')
                  }
                })
              }}
            >
              <h3>添加课程</h3>
              <div className="ac-form-grid">
                <Field label="学期">
                  <input
                    value={newTerm}
                    onChange={(event) => setNewTerm(event.target.value)}
                    placeholder="2026-fall"
                    required
                  />
                </Field>
                <Field label="课程代码">
                  <input
                    value={newCode}
                    onChange={(event) => setNewCode(event.target.value)}
                    placeholder="CS101"
                    required
                  />
                </Field>
                <Field label="课程名称">
                  <input
                    value={newTitle}
                    onChange={(event) => setNewTitle(event.target.value)}
                    required
                  />
                </Field>
              </div>
              <div className="ac-form-actions">
                <button
                  type="submit"
                  className="ac-button ac-button-primary"
                  disabled={action.pending !== undefined}
                >
                  添加课程
                </button>
              </div>
            </form>
          )}

          {visibleCourses.length === 0 ? (
            <EmptyState
              title="还没有课程"
              action={
                <button type="button" className="ac-button" onClick={() => setAdding(true)}>
                  添加课程
                </button>
              }
            >
              同步平台或手动添加课程后，这里会汇总任务、资料和来源。
            </EmptyState>
          ) : (
            <div className="ac-course-workspace">
              <ul className="ac-course-list ac-course-list-panel" aria-label="课程列表">
                {visibleCourses.map((course) => (
                  <CourseListItem
                    key={course.courseId}
                    course={course}
                    summary={data.courses.summaries.find(
                      (summary) => summary.courseId === course.courseId,
                    )}
                    selected={course.courseId === selectedId}
                    onSelect={() => setSelectedId(course.courseId)}
                    ctx={ctx}
                    onChanged={refreshAll}
                  />
                ))}
              </ul>

              <div className="ac-course-detail">
                {!selectedCourse ? (
                  <EmptyState title="选择一门课程">
                    课程详情会汇总任务、来源事项、计划和资料；不会默认修改任何数据。
                  </EmptyState>
                ) : (
                  <>
                    <div className="ac-course-detail-head">
                      <div>
                        <h2>{courseLabel(selectedCourse)}</h2>
                        <p className="ac-muted">
                          {selectedCourse.termId} · 更新于{' '}
                          {formatDateTimeOrDash(selectedCourse.updatedAt, detailTimeZone)}
                        </p>
                      </div>
                      <div className="ac-course-detail-actions">
                        <button
                          type="button"
                          className="ac-button ac-button-primary"
                          onClick={() =>
                            onNavigate('tasks', {
                              courseId: selectedCourse.courseId,
                              status: 'active',
                            })
                          }
                        >
                          查看任务
                        </button>
                        <button
                          type="button"
                          className="ac-button"
                          onClick={() =>
                            onNavigate('materials', {
                              courseId: selectedCourse.courseId,
                            })
                          }
                        >
                          查看资料
                        </button>
                        {selectedSources[0] && (
                          <button
                            type="button"
                            className="ac-button"
                            onClick={() =>
                              onNavigate('connections', {
                                sourceId: selectedSources[0]?.sourceId,
                              })
                            }
                          >
                            查看来源
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="ac-stat-grid ac-stat-grid-small">
                      <div className="ac-stat">
                        <span className="ac-stat-label">进行中任务</span>
                        <strong className="ac-stat-value">
                          {selectedSummary?.activeTasks ?? 0}
                        </strong>
                        <span className="ac-stat-hint">
                          已完成 {selectedSummary?.completedTasks ?? 0}
                        </span>
                      </div>
                      <div className="ac-stat">
                        <span className="ac-stat-label">来源事项</span>
                        <strong className="ac-stat-value">
                          {selectedSummary?.activeItems ?? 0}
                        </strong>
                        <span className="ac-stat-hint">不含已归档</span>
                      </div>
                      <div className="ac-stat">
                        <span className="ac-stat-label">已安排任务</span>
                        <strong className="ac-stat-value">
                          {selectedSummary?.plannedTasks ?? 0}
                        </strong>
                        <span className="ac-stat-hint">来自当前确认计划</span>
                      </div>
                      <div className="ac-stat">
                        <span className="ac-stat-label">资料</span>
                        <strong className="ac-stat-value">
                          {selectedSummary?.materialCount ?? 0}
                        </strong>
                        <span className="ac-stat-hint">可检索正文与页码</span>
                      </div>
                    </div>

                    <Section title="课程优先级" subtitle="仅在任务自身优先级相同时影响计划排序">
                      <div className="ac-inline-bar">
                        <span className="ac-muted">
                          用户明确设定，Agent 不会自动修改。
                        </span>
                        <select
                          aria-label="课程优先级"
                          value={priorities[selectedCourse.courseId] ?? 0}
                          disabled={action.pending !== undefined}
                          onChange={(event) =>
                            void savePriority(
                              selectedCourse.courseId,
                              Number(event.target.value),
                            )
                          }
                        >
                          <option value={0}>0 · 普通</option>
                          <option value={1}>1 · 较高</option>
                          <option value={2}>2 · 高</option>
                          <option value={3}>3 · 最高</option>
                        </select>
                      </div>
                    </Section>

                    <Section
                      title="待办与来源事项"
                      subtitle="本地任务与学校来源事实分开保存"
                      actions={
                        <button
                          type="button"
                          className="ac-button"
                          onClick={() =>
                            onNavigate('tasks', {
                              courseId: selectedCourse.courseId,
                              status: 'active',
                            })
                          }
                        >
                          查看全部
                        </button>
                      }
                    >
                      {!detail || detail.courseId !== selectedCourse.courseId ? (
                        <LoadingLine>正在读取课程明细…</LoadingLine>
                      ) : detail.failure ? (
                        <p className="ac-text-bad">{detail.failure}</p>
                      ) : activeTasks.length === 0 ? (
                        <EmptyState title="这门课没有进行中的本地任务">
                          同步事项会自动生成默认任务；也可以从任务页手动创建。
                        </EmptyState>
                      ) : (
                        <ul className="ac-list">
                          {activeTasks.slice(0, 5).map((card) => {
                            const due = formatDue(card.effectiveDue, detailTimeZone, dueNow)
                            return (
                              <li key={card.task.taskId} className="ac-list-row">
                                <div>
                                  <strong>{card.task.title}</strong>
                                  <span className="ac-muted">
                                    {card.item
                                      ? `来源：${card.item.title}`
                                      : '本地任务'}{' '}
                                    · 预计 {formatMinutes(card.task.estimateMinutes)}
                                  </span>
                                </div>
                                <div className="ac-row-meta">
                                  {plannedBlockIds.has(card.task.taskId) ? (
                                    <Badge tone="ok">已安排</Badge>
                                  ) : (
                                    <Badge tone="warn">未安排</Badge>
                                  )}
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
                                </div>
                              </li>
                            )
                          })}
                        </ul>
                      )}
                    </Section>

                    <Section
                      title="课程资料"
                      subtitle="从课程进入资料页会保留当前课程"
                      actions={
                        <button
                          type="button"
                          className="ac-button"
                          onClick={() =>
                            onNavigate('materials', {
                              courseId: selectedCourse.courseId,
                            })
                          }
                        >
                          管理资料
                        </button>
                      }
                    >
                      {!detail || detail.courseId !== selectedCourse.courseId ? (
                        <LoadingLine>正在读取课程资料…</LoadingLine>
                      ) : (detail.materials?.length ?? 0) === 0 ? (
                        <EmptyState title="这门课还没有资料">
                          可以在资料页导入 PDF、网页或粘贴文本。
                        </EmptyState>
                      ) : (
                        <ul className="ac-list">
                          {detail.materials?.slice(0, 5).map((card) => (
                            <li key={card.material.materialId} className="ac-list-row">
                              <div>
                                <strong>{card.material.title}</strong>
                                <span className="ac-muted">
                                  {card.material.kind.toUpperCase()} ·{' '}
                                  {card.material.chunkCount} 段 ·{' '}
                                  {card.material.extractionStatus === 'indexed'
                                    ? '可检索'
                                    : '未提取到文字'}
                                </span>
                              </div>
                            </li>
                          ))}
                        </ul>
                      )}
                    </Section>

                    <Section title="关联来源" subtitle="认证、同步健康与 Adapter 就绪度分开记录">
                      {selectedSources.length === 0 ? (
                        <EmptyState title="这门课还没有关联来源">
                          通过连接页添加平台并完成同步后，来源会出现在这里。
                        </EmptyState>
                      ) : (
                        <ul className="ac-list">
                          {selectedSources.map((source) => (
                            <li key={source.sourceId} className="ac-list-row">
                              <div>
                                <strong>{source.displayName}</strong>
                                <span className="ac-muted">
                                  最近同步：
                                  {formatDateTimeOrDash(
                                    source.lastSync?.finishedAt,
                                    detailTimeZone,
                                  )}
                                  {source.lastSync
                                    ? ` · ${syncStatusLabel(source.lastSync.status)}`
                                    : ''}
                                </span>
                              </div>
                              <Badge tone={sourceStageTone(source.stage)}>
                                {sourceStageLabel(source.stage)}
                              </Badge>
                            </li>
                          ))}
                        </ul>
                      )}
                    </Section>

                    <Section title="课程维护" subtitle="删除会先归档关联事项与任务，可分别恢复">
                      <div className="ac-inline-actions">
                        {!selectedCourse.deleted && !selectedCourse.archived && (
                          <ConfirmAction
                            label="归档课程"
                            confirmLabel="确认归档"
                            disabled={action.pending !== undefined}
                            onConfirm={() =>
                              void action.run(
                                'archive-course',
                                () =>
                                  callApi<CommandReceipt>(ctx, 'archiveCourse', {
                                    id: selectedCourse.courseId,
                                  }),
                                '课程已归档；可随时恢复',
                              )
                            }
                          />
                        )}
                        {!selectedCourse.deleted && (
                          <ConfirmAction
                            label="删除课程"
                            confirmLabel="确认删除课程"
                            disabled={action.pending !== undefined}
                            onConfirm={() =>
                              void action.run(
                                'delete-course',
                                () =>
                                  callApi<CommandReceipt>(ctx, 'deleteCourse', {
                                    id: selectedCourse.courseId,
                                  }),
                                '课程已删除；关联事项与任务已归档，可分别恢复',
                              )
                            }
                          />
                        )}
                        {(selectedCourse.archived || selectedCourse.deleted) && (
                          <button
                            type="button"
                            className="ac-button"
                            disabled={action.pending !== undefined}
                            onClick={() =>
                              void action.run(
                                'restore-course',
                                () =>
                                  callApi<CommandReceipt>(ctx, 'restoreCourse', {
                                    id: selectedCourse.courseId,
                                  }),
                                '课程已恢复；已归档的事项和任务需要单独恢复',
                              )
                            }
                          >
                            恢复课程
                          </button>
                        )}
                      </div>
                    </Section>
                  </>
                )}
              </div>
            </div>
          )}

          <p className="ac-muted ac-footnote">
            课程身份与外部来源分开保存；同一学期同名课程会在同步和添加时复用。
          </p>
        </>
      )}
    </div>
  )
}
