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
  WebSessionView,
} from '../../protocol.js'
import type { PageProps } from './types.js'

function SourceCredentialForm({
  ctx,
  source,
  onDone,
}: {
  ctx: PageProps['ctx']
  source: SourceStatus
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
    const result = await callApi<ConnectionView>(ctx, 'sourceSetSecret', {
      sourceId: source.sourceId,
      secret: value,
    })
    setPending(false)
    if (!result.ok) {
      setMessage(result.error.message)
      return
    }
    setMessage('凭据已交给本机 Host 保存；验证成功前不会显示为已连接。')
    await onDone()
  }

  return (
    <div className="ac-secret-form">
      <Field
        label={source.authKind === 'token' ? 'Token' : '密码'}
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
        {pending ? '提交中…' : source.connection ? '更新凭据' : '保存凭据'}
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
  const browserLogin = source.canLogin && source.loginMode === 'browser'
  const manualCredential = source.authKind !== 'none' && !browserLogin

  const sync = async (): Promise<UiResult<SyncRunSummary>> => {
    const result = await callApi<SyncRunSummary>(ctx, 'syncNow', {
      sourceId: source.sourceId,
      ...(connection ? { connectionId: connection.connectionId } : {}),
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
  }

  return (
    <li className="ac-card ac-source-card">
      <div className="ac-source-main">
        <div className="ac-task-title">
          <strong>{source.displayName}</strong>
          <Badge tone={sourceStateTone(source.state)}>{sourceStateLabel(source.state)}</Badge>
          <Badge tone={source.engineKnown ? 'info' : 'bad'}>引擎：{source.engine}</Badge>
          {source.syncAvailable && <Badge tone="ok">同步可用</Badge>}
          {source.canLogin && <Badge tone="info">登录可用</Badge>}
        </div>
        <p className="ac-muted">{source.detail}</p>
        <div className="ac-task-meta">
          <span>来源 ID：{source.sourceId}</span>
          <span>认证方式：{source.authKind}</span>
          {source.loginMode && <span>登录方式：{source.loginMode}</span>}
          {connection?.accountLabel && <span>账号：{connection.accountLabel}</span>}
          {source.capabilities.length > 0 && (
            <span>能力：{source.capabilities.join('、')}</span>
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
        {browserLogin && (
          <div className="ac-secret-form">
            <p className="ac-muted">
              将打开 Edge/Chrome 登录窗口；请在窗口中完成登录和验证码。应用不会读取或保存密码。
            </p>
            <button
              type="button"
              className="ac-button ac-button-primary"
              disabled={action.pending !== undefined}
              onClick={() =>
                void action.run(
                  'source-login',
                  () =>
                    callApi<ConnectionView>(ctx, 'sourceLogin', {
                      sourceId: source.sourceId,
                    }),
                  '登录成功，会话已保存',
                )
              }
            >
              {action.pending === 'source-login'
                ? '等待登录窗口…'
                : connection
                  ? `重新登录 ${source.displayName}`
                  : `登录 ${source.displayName}`}
            </button>
          </div>
        )}
        {manualCredential && (
          <SourceCredentialForm
            ctx={ctx}
            source={source}
            onDone={async () => {
              await refresh()
            }}
          />
        )}
        {Object.keys(source.config).length > 0 && (
          <details className="ac-config-details">
            <summary>查看非敏感配置</summary>
            <pre>{JSON.stringify(source.config, null, 2)}</pre>
          </details>
        )}
      </div>
      <div className="ac-source-actions">
        <button
          type="button"
          className="ac-button"
          disabled={!source.syncAvailable || action.pending !== undefined}
          onClick={() => void action.run('sync', sync, '同步完成')}
        >
          {action.pending === 'sync' ? '同步中…' : '立即同步'}
        </button>
        {connection && source.canVerify && (
          <button
            type="button"
            className="ac-button"
            disabled={action.pending !== undefined}
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
        <ConfirmAction
          label="归档数据源"
          confirmLabel="确认归档"
          disabled={action.pending !== undefined}
          onConfirm={() =>
            void action.run(
              'archive-source',
              () =>
                callApi<SourceStatus>(ctx, 'archiveSource', {
                  sourceId: source.sourceId,
                }),
              '数据源已归档；历史学业数据保留',
            )
          }
        />
      </div>
    </li>
  )
}

function SourceForm({
  ctx,
  data,
  onCreated,
}: {
  ctx: PageProps['ctx']
  data: ConnectionsView
  onCreated: () => Promise<unknown>
}) {
  const action = useAction(async () => {
    await onCreated()
  })
  const [sourceId, setSourceId] = useState('')
  const [engine, setEngine] = useState(data.engines[0]?.id ?? '')
  const [displayName, setDisplayName] = useState('')
  const [authKind, setAuthKind] = useState('token')
  const [loginMode, setLoginMode] = useState('browser')
  const [capabilities, setCapabilities] = useState('')
  const [configJson, setConfigJson] = useState('{}')

  const submit = async (): Promise<UiResult<SourceStatus>> => {
    let config: Record<string, unknown>
    try {
      const parsed = JSON.parse(configJson || '{}') as unknown
      if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('配置必须是 JSON 对象')
      }
      config = parsed as Record<string, unknown>
    } catch (error) {
      return {
        ok: false,
        error: {
          code: 'VALIDATION',
          message: `配置 JSON 无效：${error instanceof Error ? error.message : String(error)}`,
        },
      }
    }
    return callApi<SourceStatus>(ctx, 'createSource', {
      ...(sourceId.trim() ? { sourceId: sourceId.trim() } : {}),
      engine: engine.trim(),
      displayName: displayName.trim(),
      authKind,
      loginMode: loginMode === 'none' ? undefined : loginMode,
      capabilities: capabilities
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean),
      config,
    })
  }

  return (
    <form
      className="ac-form-card"
      onSubmit={(event) => {
        event.preventDefault()
        void action.run('source', submit, '数据源已创建').then((ok) => {
          if (ok) {
            setSourceId('')
            setDisplayName('')
            setConfigJson('{}')
          }
        })
      }}
    >
      <h3>添加数据源</h3>
      <p className="ac-muted">
        数据源保存在本机数据库，通过 engine + 非敏感配置描述，不需要修改应用代码。
        凭据不要写入配置；登录或凭据会进入系统凭据库。
      </p>
      <div className="ac-form-grid">
        <Field label="来源 ID（可选）">
          <input
            value={sourceId}
            onChange={(event) => setSourceId(event.target.value)}
            placeholder="my-source"
          />
        </Field>
        <Field label="引擎">
          <select value={engine} onChange={(event) => setEngine(event.target.value)} required>
            {data.engines.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.displayName}（{entry.id}）
              </option>
            ))}
          </select>
        </Field>
        <Field label="显示名称">
          <input
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            required
          />
        </Field>
        <Field label="认证方式">
          <select value={authKind} onChange={(event) => setAuthKind(event.target.value)}>
            <option value="none">none</option>
            <option value="password">password</option>
            <option value="token">token</option>
            <option value="oauth">oauth</option>
          </select>
        </Field>
        <Field label="登录方式">
          <select value={loginMode} onChange={(event) => setLoginMode(event.target.value)}>
            <option value="browser">browser</option>
            <option value="manual">manual</option>
            <option value="none">不登录</option>
          </select>
        </Field>
        <Field label="能力（逗号分隔）">
          <input
            value={capabilities}
            onChange={(event) => setCapabilities(event.target.value)}
            placeholder="academic.sync"
          />
        </Field>
      </div>
      <Field label="非敏感配置（JSON）" hint="URL、选择器、规则等；禁止 password/token/cookie 字段">
        <textarea
          rows={6}
          value={configJson}
          onChange={(event) => setConfigJson(event.target.value)}
          spellCheck={false}
        />
      </Field>
      <div className="ac-form-actions">
        <button type="submit" className="ac-button" disabled={action.pending !== undefined}>
          {action.pending === 'source' ? '创建中…' : '创建数据源'}
        </button>
      </div>
      {action.notice && (
        <NoticeBar notice={action.notice} onDismiss={() => action.setNotice(undefined)} />
      )}
    </form>
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
      {!data && state.loading && <LoadingLine>正在读取数据源…</LoadingLine>}

      {data && (
        <>
          <Section title="课程" subtitle="课程身份与外部来源分开保存">
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
            title="数据源"
            subtitle="数据库中的 source 配置 + 通用 engine；凭据与状态分开保存"
          >
            {data.sources.length === 0 ? (
              <EmptyState title="还没有数据源">
                在下方选择 engine 并添加数据源配置。
              </EmptyState>
            ) : (
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
            )}
            <SourceForm ctx={ctx} data={data} onCreated={refresh} />
          </Section>

          <WebSessionPanel ctx={ctx} />

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

function WebSessionPanel({ ctx }: { ctx: PageProps['ctx'] }) {
  const load = useCallback(
    (signal: AbortSignal) =>
      callApi<{ sessions: WebSessionView[] }>(ctx, 'webSessions', {}, signal),
    [ctx],
  )
  const { state, refresh } = useLoad(load, true)
  const action = useAction(refresh)
  const [url, setUrl] = useState('')
  const [label, setLabel] = useState('')

  const login = async (): Promise<UiResult<WebSessionView>> => {
    if (!url.trim()) {
      return {
        ok: false,
        error: { code: 'VALIDATION', message: '请填写网站 URL' },
      }
    }
    return callApi<WebSessionView>(ctx, 'webLogin', {
      url: url.trim(),
      ...(label.trim() ? { label: label.trim() } : {}),
    })
  }

  return (
    <Section
      title="网站登录（通用会话）"
      subtitle="填 URL → 拉起浏览器登录 → Cookie 加密保存；Agent/脚本带会话访问，不暴露 Cookie"
    >
      <form
        className="ac-form-card"
        onSubmit={(event) => {
          event.preventDefault()
          void action.run('web-login', login, '登录成功，会话已保存').then((ok) => {
            if (ok) {
              setUrl('')
              setLabel('')
            }
          })
        }}
      >
        <div className="ac-form-grid">
          <Field label="网站 URL">
            <input
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="https://example.com/"
              required
            />
          </Field>
          <Field label="标签（可选）">
            <input
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              placeholder="例如：课程网站"
            />
          </Field>
        </div>
        <p className="ac-muted">
          登录窗口里会显示“完成登录”按钮；登录完成后点击它，应用只保存该域名下的 Cookie。
        </p>
        <div className="ac-form-actions">
          <button type="submit" className="ac-button ac-button-primary" disabled={action.pending !== undefined}>
            {action.pending === 'web-login' ? '等待登录窗口…' : '登录并保存'}
          </button>
        </div>
        {action.notice && (
          <NoticeBar notice={action.notice} onDismiss={() => action.setNotice(undefined)} />
        )}
      </form>

      {state.loading && !state.data && <LoadingLine>正在读取网站会话…</LoadingLine>}
      {state.failure && !state.data && (
        <p className="ac-text-bad">{state.failure.message}</p>
      )}
      {state.data && state.data.sessions.length === 0 && (
        <EmptyState title="还没有保存的网站会话">
          填写 URL 并完成登录后，会话会出现在这里。
        </EmptyState>
      )}
      {state.data && state.data.sessions.length > 0 && (
        <ul className="ac-list">
          {state.data.sessions.map((session) => (
            <li key={session.sessionId} className="ac-list-row">
              <div>
                <strong>{session.label ?? session.domain}</strong>
                <span className="ac-muted">
                  {session.domain} · {session.loginUrl}
                </span>
                <span className="ac-muted">
                  最近使用：{formatDateTimeOrDash(session.lastUsedAt, 'UTC')}
                </span>
              </div>
              <ConfirmAction
                label="删除会话"
                confirmLabel="确认删除"
                disabled={action.pending !== undefined}
                onConfirm={() =>
                  void action.run(
                    'web-delete',
                    () =>
                      callApi(ctx, 'webDelete', {
                        sessionId: session.sessionId,
                      }),
                    '网站会话已删除',
                  )
                }
              />
            </li>
          ))}
        </ul>
      )}
    </Section>
  )
}
