import { useCallback, useState } from 'react'
import type { ConnectionView, CourseView, SyncRunSummary } from '@academic/contracts'
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
  sourceStateLabel,
  sourceStateTone,
  syncStatusLabel,
} from '../view.js'
import type {
  CommandReceipt,
  ConnectionsView,
  SourceStatus,
  UiResult,
} from '../../protocol.js'
import type { PageProps } from './types.js'

function CredentialForm({
  ctx,
  connection,
  onDone,
}: {
  ctx: PageProps['ctx']
  connection: ConnectionView
  onDone: () => Promise<void>
}) {
  const [secret, setSecret] = useState('')
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState<string>()

  const submit = async () => {
    if (!secret) {
      setMessage('请填写凭据')
      return
    }
    const value = secret
    // Clear the React-held value before the request settles.
    setSecret('')
    setPending(true)
    setMessage(undefined)
    const result = await callApi<ConnectionView>(ctx, 'setConnectionSecret', {
      connectionId: connection.connectionId,
      secret: value,
    })
    setPending(false)
    if (!result.ok) {
      setMessage(result.error.message)
      return
    }
    setMessage('凭据已交给本机 Host 保存；仍需真实验证或成功同步后才会显示已连接。')
    await onDone()
  }

  return (
    <div className="ac-secret-form">
      <Field
        label={connection.authKind === 'token' ? 'Token' : '密码'}
        hint="只提交给本机 Host；不写入浏览器存储、URL 或日志。"
      >
        <input
          type="password"
          value={secret}
          onChange={(event) => setSecret(event.target.value)}
          autoComplete="off"
          spellCheck={false}
          data-lpignore="true"
          data-1p-ignore="true"
          name="academic-credential"
        />
      </Field>
      <button
        type="button"
        className="ac-button"
        disabled={pending}
        onClick={() => void submit()}
      >
        {pending ? '提交中…' : '保存凭据'}
      </button>
      {message && <p className="ac-muted">{message}</p>}
    </div>
  )
}

function SourceCard({
  ctx,
  source,
  timeZone,
  refresh,
}: {
  ctx: PageProps['ctx']
  source: SourceStatus
  timeZone: string
  refresh: () => Promise<unknown>
}) {
  const action = useAction(async () => {
    await refresh()
  })
  const connection = source.connection
  const canAuthenticate =
    source.adapterAvailable &&
    connection !== undefined &&
    connection.authKind !== 'none'
  const canSync = source.adapterAvailable && source.sourceId === 'fixture-lms'

  return (
    <li className="ac-card ac-source-card">
      <div className="ac-source-main">
        <div className="ac-task-title">
          <strong>{source.displayName}</strong>
          <Badge tone={sourceStateTone(source.state)}>{sourceStateLabel(source.state)}</Badge>
          <Badge tone={source.adapterAvailable ? 'info' : 'bad'}>
            {source.adapterAvailable ? 'Adapter 可用' : 'Adapter 不可用'}
          </Badge>
        </div>
        <p className="ac-muted">{source.detail}</p>
        <div className="ac-task-meta">
          <span>来源 ID：{source.sourceId}</span>
          <span>认证方式：{source.authKind}</span>
          {connection?.accountLabel && <span>账号：{connection.accountLabel}</span>}
          {connection?.scopes && connection.scopes.length > 0 && (
            <span>授权范围：{connection.scopes.join('、')}</span>
          )}
          <span>上次验证：{formatDateTimeOrDash(connection?.lastVerifiedAt, timeZone)}</span>
          <span>上次同步：{formatDateTimeOrDash(source.lastSync?.finishedAt, timeZone)}</span>
        </div>
        {connection?.lastError && (
          <p className="ac-text-bad">最近错误：{connection.lastError}</p>
        )}
        {connection?.status === 'configured' && (
          <p className="ac-text-warn">
            已保存凭据，但尚未验证；保存凭据不代表平台可用。
          </p>
        )}
        {action.notice && (
          <NoticeBar notice={action.notice} onDismiss={() => action.setNotice(undefined)} />
        )}
        {canAuthenticate && (
          <CredentialForm ctx={ctx} connection={connection} onDone={async () => {
            await refresh()
          }} />
        )}
      </div>
      <div className="ac-source-actions">
        <button
          type="button"
          className="ac-button"
          disabled={!canSync || action.pending !== undefined}
          onClick={() =>
            void action.run(
              'sync',
              async () => {
                const result = await callApi<SyncRunSummary>(ctx, 'syncNow', {
                  sourceId: source.sourceId,
                })
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
              },
              '同步完成',
            )
          }
        >
          {action.pending === 'sync' ? '同步中…' : '立即同步'}
        </button>
        {connection && (
          <button
            type="button"
            className="ac-button"
            disabled={!canAuthenticate || action.pending !== undefined}
            onClick={() =>
              void action.run(
                'verify',
                () =>
                  callApi<ConnectionView>(ctx, 'verifyConnection', {
                    connectionId: connection.connectionId,
                  }),
                '连接已验证',
              )
            }
          >
            验证连接
          </button>
        )}
        {connection && (
          <ConfirmAction
            label="断开连接"
            confirmLabel="确认断开"
            disabled={action.pending !== undefined}
            onConfirm={() =>
              void action.run(
                'disconnect',
                () =>
                  callApi<ConnectionView>(ctx, 'disconnectConnection', {
                    connectionId: connection.connectionId,
                  }),
                '连接已断开；已同步学业数据保留',
              )
            }
          />
        )}
        {connection?.hasCredential && (
          <ConfirmAction
            label="删除凭据"
            confirmLabel="确认删除凭据"
            disabled={action.pending !== undefined}
            onConfirm={() =>
              void action.run(
                'delete',
                () =>
                  callApi<ConnectionView>(ctx, 'deleteConnectionCredential', {
                    connectionId: connection.connectionId,
                  }),
                '凭据已删除；学业事件未删除',
              )
            }
          />
        )}
      </div>
    </li>
  )
}

export function ConnectionsPage({ ctx, active }: PageProps) {
  const load = useCallback(
    (signal: AbortSignal) => callApi<ConnectionsView>(ctx, 'connections', {}, signal),
    [ctx],
  )
  const { state, refresh } = useLoad(load, active)
  const action = useAction(refresh)
  const data = state.data
  const view = viewState(state)
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  const [courseTerm, setCourseTerm] = useState('')
  const [courseCode, setCourseCode] = useState('')
  const [courseTitle, setCourseTitle] = useState('')
  const [connectionSource, setConnectionSource] = useState('')
  const [connectionName, setConnectionName] = useState('')
  const [connectionAccount, setConnectionAccount] = useState('')
  const [connectionScopes, setConnectionScopes] = useState('')

  const authSources = (data?.sources ?? []).filter(
    (source) =>
      source.adapterAvailable &&
      source.authKind !== 'none' &&
      source.authKind !== 'unknown',
  )

  const addCourse = async (): Promise<UiResult<CommandReceipt>> => {
    if (!courseTerm.trim() || !courseCode.trim() || !courseTitle.trim()) {
      return {
        ok: false,
        error: { code: 'VALIDATION', message: '请填写学期、课程代码和课程名称' },
      }
    }
    return callApi<CommandReceipt>(ctx, 'addCourse', {
      termId: courseTerm.trim(),
      code: courseCode.trim(),
      title: courseTitle.trim(),
    })
  }

  const createConnection = async (): Promise<UiResult<ConnectionView>> => {
    const source = authSources.find((candidate) => candidate.sourceId === connectionSource)
    if (!source) {
      return {
        ok: false,
        error: { code: 'CAPABILITY_UNAVAILABLE', message: '请选择当前版本支持的数据源' },
      }
    }
    return callApi<ConnectionView>(ctx, 'createConnection', {
      sourceId: source.sourceId,
      displayName: connectionName.trim() || source.displayName,
      authKind: source.authKind as 'password' | 'token' | 'oauth',
      ...(connectionAccount.trim() ? { accountLabel: connectionAccount.trim() } : {}),
      ...(connectionScopes.trim()
        ? {
            scopes: connectionScopes
              .split(',')
              .map((scope) => scope.trim())
              .filter(Boolean),
          }
        : {}),
    })
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
      {!data && state.loading && <LoadingLine>正在读取连接状态…</LoadingLine>}

      {data && (
        <>
          <Section title="课程" subtitle="课程身份与外部来源分开保存">
            <ul className="ac-course-list">
              {data.connections.length === 0 && data.sources.every((source) => !source.connection) && (
                <li className="ac-muted">还没有用户连接；内置 Fixture 数据源可直接同步。</li>
              )}
            </ul>
            <form
              className="ac-form-card"
              onSubmit={(event) => {
                event.preventDefault()
                void action.run(
                  'course',
                  addCourse,
                  '课程已添加；不会自动创建来源事项',
                ).then((ok) => {
                  if (ok) {
                    setCourseTerm('')
                    setCourseCode('')
                    setCourseTitle('')
                  }
                })
              }}
            >
              <h3>添加课程</h3>
              <div className="ac-form-grid">
                <Field label="学期">
                  <input
                    value={courseTerm}
                    onChange={(event) => setCourseTerm(event.target.value)}
                    placeholder="2026-fall"
                    required
                  />
                </Field>
                <Field label="课程代码">
                  <input
                    value={courseCode}
                    onChange={(event) => setCourseCode(event.target.value)}
                    placeholder="CS101"
                    required
                  />
                </Field>
                <Field label="课程名称">
                  <input
                    value={courseTitle}
                    onChange={(event) => setCourseTitle(event.target.value)}
                    required
                  />
                </Field>
              </div>
              <div className="ac-form-actions">
                <button type="submit" className="ac-button" disabled={action.pending !== undefined}>
                  添加课程
                </button>
              </div>
            </form>
            <CourseTable
              ctx={ctx}
              courses={data.courses}
              timeZone={timeZone}
              onChanged={refresh}
            />
          </Section>

          <Section
            title="数据源连接"
            subtitle="状态区分未配置、已保存凭据、已验证、需要认证和 Adapter 不可用"
          >
            <ul className="ac-source-grid">
              {data.sources.map((source) => (
                <SourceCard
                  key={source.sourceId}
                  ctx={ctx}
                  source={source}
                  timeZone={timeZone}
                  refresh={refresh}
                />
              ))}
            </ul>

            {authSources.length === 0 ? (
              <div className="ac-banner ac-banner-warn" role="status">
                <div>
                  <strong>当前版本没有支持认证的真实数据源</strong>
                  <p>
                    内置 Fixture 数据源不需要凭据；Blackboard 等真实平台 Adapter
                    尚未实现，因此不会展示认证表单或暗示可以接入任意网站。
                  </p>
                </div>
              </div>
            ) : (
              <form
                className="ac-form-card"
                onSubmit={(event) => {
                  event.preventDefault()
                  void action.run('connection', createConnection, '连接已创建，请保存凭据').then(
                    (ok) => {
                      if (ok) {
                        setConnectionSource('')
                        setConnectionName('')
                        setConnectionAccount('')
                        setConnectionScopes('')
                      }
                    },
                  )
                }}
              >
                <h3>添加连接</h3>
                <div className="ac-form-grid">
                  <Field label="数据源">
                    <select
                      value={connectionSource}
                      onChange={(event) => setConnectionSource(event.target.value)}
                      required
                    >
                      <option value="">选择数据源</option>
                      {authSources.map((source) => (
                        <option key={source.sourceId} value={source.sourceId}>
                          {source.displayName}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="显示名称">
                    <input
                      value={connectionName}
                      onChange={(event) => setConnectionName(event.target.value)}
                    />
                  </Field>
                  <Field label="账号标识（可选）">
                    <input
                      value={connectionAccount}
                      onChange={(event) => setConnectionAccount(event.target.value)}
                    />
                  </Field>
                  <Field label="授权范围（逗号分隔，可选）">
                    <input
                      value={connectionScopes}
                      onChange={(event) => setConnectionScopes(event.target.value)}
                    />
                  </Field>
                </div>
                <div className="ac-form-actions">
                  <button type="submit" className="ac-button" disabled={action.pending !== undefined}>
                    创建连接
                  </button>
                </div>
              </form>
            )}
          </Section>

          <Section title="同步记录" subtitle="失败不会清空已有学业数据">
            <SyncRunTable runs={data.syncRuns} timeZone={timeZone} />
          </Section>
        </>
      )}
    </div>
  )
}

function CourseTable({
  ctx,
  courses,
  timeZone,
  onChanged,
}: {
  ctx: PageProps['ctx']
  courses: CourseView[]
  timeZone: string
  onChanged: () => Promise<unknown>
}) {
  const action = useAction(async () => {
    await onChanged()
  })
  if (courses.length === 0) return null
  return (
    <ul className="ac-list">
      {courses.map((course) => (
        <li key={course.courseId} className="ac-list-row">
          <div>
            <strong>
              {course.code} {course.title}
            </strong>
            <span className="ac-muted">
              {course.termId} · 更新于 {formatDateTimeOrDash(course.updatedAt, timeZone)}
            </span>
          </div>
          {!course.archived && (
            <ConfirmAction
              label="归档课程"
              confirmLabel="确认归档"
              disabled={action.pending !== undefined}
              onConfirm={() =>
                void action.run(
                  'course-archive',
                  () =>
                    callApi<CommandReceipt>(ctx, 'archiveCourse', {
                      id: course.courseId,
                    }),
                  '课程已归档',
                )
              }
            />
          )}
        </li>
      ))}
    </ul>
  )
}

function SyncRunTable({ runs, timeZone }: { runs: SyncRunSummary[]; timeZone: string }) {
  if (runs.length === 0) {
    return <EmptyState title="还没有同步记录">手动或定时同步后会显示结果。</EmptyState>
  }
  return (
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
          {runs.map((run) => (
            <tr key={run.runId}>
              <td>{formatDateTimeOrDash(run.finishedAt ?? run.startedAt, timeZone)}</td>
              <td>{run.sourceId}</td>
              <td>
                <Badge tone={run.status === 'success' ? 'ok' : run.status === 'failed' || run.status === 'auth-required' ? 'bad' : 'warn'}>
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
  )
}
