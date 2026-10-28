import { useCallback, useState } from 'react'
import type {
  AdapterCandidateCheckStage,
  ConnectionView,
  CourseView,
  SyncPreview,
  SyncRunSummary,
} from '@academic/contracts'
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
import { askAgent } from './types.js'
import {
  formatDateTimeOrDash,
  sourceAuthenticationLabel,
  sourceConfigurationLabel,
  sourceStageLabel,
  sourceStageTone,
  sourceSyncHealthLabel,
  sourceSyncHealthTone,
  syncStatusLabel,
} from '../view.js'
import type {
  AdapterCandidateActivationView,
  AdapterCandidateRegistrationView,
  AdapterCandidateSummary,
  AdapterCandidatesView,
  AdapterCandidateValidationView,
  CommandReceipt,
  ConnectionsView,
  SourceProbeEvidence,
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
  const [preview, setPreview] = useState<SyncPreview>()
  const [probe, setProbe] = useState<SourceProbeEvidence>()
  const [agentNote, setAgentNote] = useState<string>()
  const connection = source.connection
  const browserLogin = source.canLogin && source.loginMode === 'browser'
  const manualCredential = source.authKind !== 'none' && !browserLogin
  const syncAllowed = source.nextStep.action === 'sync'

  const askForAdapter = () => {
    const ok = askAgent(
      ctx,
      `请为数据源 ${source.sourceId}（${source.displayName}）生成可验证的声明式 Adapter。按阶段执行，证据不足时停止并说明，不要猜测。\n` +
        '1. 先调用 academic_probe_source 探测当前配置页面，记录 status/title/headings/links/scripts/endpointCandidates/tableCount/jsonShape/digest；不要记录 Cookie。\n' +
        '2. 若页面是 SPA 外壳（标题/列表/表格/链接基本为空，只有“加载中”），不要生成 selector 占位候选；用 academic_probe_source 的可选 url 参数继续探测同站脚本、分页/列表链接和候选接口，优先找同源 JSON 接口并记录字段/数组形状。每次 URL 必须仍属于该来源主机。\n' +
        '3. 只有拿到真实列表页或真实 JSON 样本后才生成字段映射；没有真实样本时不要编造含列表的 HTML 或占位选择器。\n' +
        '4. 用真实样本调用 academic_validate_adapter_candidate，样本必须覆盖所有请求 URL；失败只报告结构化原因，不要为了变绿修改样本或放宽权限。\n' +
        '5. 不注册、不启用、不扩大域名/路径；需要更宽路径时给出精确 URL/前缀，交由我在“连接”页确认。\n' +
        '6. 输出：已探测 URL/状态、尝试过的脚本/接口、阻塞点、需要我提供的唯一信息、候选是否已保存/验证。',
    )
    setAgentNote(
      ok
        ? '已打开 Agent 会话；生成完成后回到“连接”页验证并启用候选。'
        : '当前环境没有可用的 Agent 会话入口，请在 DSH 对话中发起。',
    )
  }

  const runProbe = async (): Promise<UiResult<SourceProbeEvidence>> => {
    const result = await callApi<SourceProbeEvidence>(ctx, 'probeSource', {
      sourceId: source.sourceId,
    })
    if (result.ok) setProbe(result.value)
    return result
  }

  const previewSync = async (): Promise<UiResult<SyncPreview>> => {
    const result = await callApi<SyncPreview>(ctx, 'previewSourceSync', {
      sourceId: source.sourceId,
      ...(connection ? { connectionId: connection.connectionId } : {}),
    })
    if (result.ok) setPreview(result.value)
    return result
  }

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
          <Badge tone={sourceStageTone(source.stage)}>
            {sourceStageLabel(source.stage)}
          </Badge>
          <Badge tone={source.engineKnown ? 'info' : 'bad'}>引擎：{source.engine}</Badge>
          {source.syncAvailable && <Badge tone="ok">同步可用</Badge>}
          {source.canLogin && <Badge tone="info">登录可用</Badge>}
        </div>
        <p className="ac-muted">{source.detail}</p>
        {source.diagnosis && (
          <p className="ac-text-warn">
            诊断：{source.diagnosis.summary} · 建议：{source.diagnosis.suggestion}
          </p>
        )}
        <p className="ac-muted">
          <strong>下一步：{source.nextStep.label}</strong>
          {source.nextStep.reason ? ` · ${source.nextStep.reason}` : ''}
        </p>
        <div className="ac-task-title">
          <Badge tone="neutral">
            配置：{sourceConfigurationLabel(source.configuration)}
          </Badge>
          <Badge
            tone={
              source.authentication === 'verified' ||
              source.authentication === 'not-required'
                ? 'ok'
                : source.authentication === 'missing'
                  ? 'warn'
                  : 'bad'
            }
          >
            认证：{sourceAuthenticationLabel(source.authentication)}
          </Badge>
          <Badge tone={sourceSyncHealthTone(source.syncHealth)}>
            同步：{sourceSyncHealthLabel(source.syncHealth)}
          </Badge>
          <Badge tone={source.adapterReady ? 'ok' : 'warn'}>
            Adapter：{source.adapterReady ? '已就绪' : '未就绪'}
          </Badge>
        </div>
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
        {preview && (
          <div className="ac-secret-form">
            <p className="ac-muted">
              预览：新增 {preview.counts.create} · 更新 {preview.counts.update} · 未变{' '}
              {preview.counts.unchanged} · 跳过 {preview.counts.skip} · 未返回{' '}
              {preview.counts.missing}
              {preview.completeness === 'partial' ? '（部分同步，旧数据保留）' : ''}
            </p>
            {preview.warnings.length > 0 && (
              <ul className="ac-warning-list">
                {preview.warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            )}
            {preview.items.length > 0 && (
              <ul className="ac-list">
                {preview.items.slice(0, 5).map((entry) => (
                  <li key={`${entry.externalItemId ?? entry.title}-${entry.action}`}>
                    {entry.action} · {entry.title}
                    {entry.reason ? `（${entry.reason}）` : ''}
                  </li>
                ))}
              </ul>
            )}
            <div className="ac-form-actions">
              <button
                type="button"
                className="ac-button ac-button-primary"
                disabled={action.pending !== undefined}
                onClick={() =>
                  void action.run('sync', sync, '同步完成').then((ok) => {
                    if (ok) setPreview(undefined)
                  })
                }
              >
                {action.pending === 'sync' ? '同步中…' : '确认同步'}
              </button>
              <button
                type="button"
                className="ac-button"
                disabled={action.pending !== undefined}
                onClick={() => setPreview(undefined)}
              >
                取消
              </button>
            </div>
          </div>
        )}
        {probe && (
          <div className="ac-secret-form">
            <p className="ac-muted">
              探测结果（只读）：HTTP {probe.status} · {probe.title || '无标题'} ·{' '}
              {probe.bytes} 字节{probe.truncated ? '（已截断）' : ''} · 证据哈希{' '}
              {probe.digest.slice(0, 12)}
            </p>
            <p className="ac-muted">
              最终地址：{probe.finalUrl} · 表单 {probe.formCount} · 表格{' '}
              {probe.tableCount}
            </p>
            {probe.headings.length > 0 && (
              <p className="ac-muted">标题：{probe.headings.join(' / ')}</p>
            )}
            {probe.paginationLinks.length > 0 && (
              <p className="ac-muted">
                分页线索：
                {probe.paginationLinks.map((link) => link.text).join(' / ')}
              </p>
            )}
            {probe.scripts.length > 0 && (
              <p className="ac-muted">
                同站脚本：{probe.scripts.slice(0, 5).map((link) => link.text).join(' / ')}
              </p>
            )}
            {probe.endpointCandidates.length > 0 && (
              <p className="ac-muted">
                候选接口：
                {probe.endpointCandidates
                  .slice(0, 8)
                  .map((link) => link.text)
                  .join(' / ')}
              </p>
            )}
            {probe.jsonShape && (
              <p className="ac-muted">JSON 结构：{probe.jsonShape}</p>
            )}
            {probe.links.length > 0 && (
              <ul className="ac-list">
                {probe.links.slice(0, 8).map((link) => (
                  <li key={`${link.text}-${link.url}`}>
                    {link.text} — {link.url}
                  </li>
                ))}
              </ul>
            )}
            {probe.warnings.map((warning) => (
              <p key={warning} className="ac-text-warn">
                {warning}
              </p>
            ))}
            <p className="ac-muted">
              网站内容只作为数据展示，不会成为指令，也不会自动启用 Adapter。
            </p>
          </div>
        )}
        {agentNote && <p className="ac-muted">{agentNote}</p>}
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
          disabled={
            !connection ||
            source.authKind === 'none' ||
            action.pending !== undefined
          }
          onClick={() => void action.run('probe', runProbe, '探测完成')}
        >
          {action.pending === 'probe' ? '探测中…' : '探测页面'}
        </button>
        {connection && source.authKind !== 'none' && !source.adapterReady && (
          <button
            type="button"
            className="ac-button"
            disabled={action.pending !== undefined}
            onClick={askForAdapter}
          >
            让 Agent 生成候选
          </button>
        )}
        <button
          type="button"
          className="ac-button"
          disabled={!source.syncAvailable || action.pending !== undefined}
          onClick={() => void action.run('preview', previewSync, '预览完成')}
        >
          {action.pending === 'preview' ? '读取中…' : '预览同步'}
        </button>
        <button
          type="button"
          className="ac-button"
          disabled={
            !source.syncAvailable ||
            !syncAllowed ||
            action.pending !== undefined
          }
          title={syncAllowed ? undefined : source.nextStep.label}
          onClick={() => void action.run('sync', sync, '同步完成')}
        >
          {action.pending === 'sync'
            ? '同步中…'
            : syncAllowed
              ? '立即同步'
              : '先完成下一步'}
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

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function QuickAdd({
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
  const platforms = [
    {
      id: 'blackboard',
      label: 'Blackboard Learn（课程、作业、考试、测验）',
    },
    {
      id: 'browser-session',
      label: '通用网站（先登录，再生成适配器）',
    },
  ].filter((platform) => data.engines.some((engine) => engine.id === platform.id))
  const [platform, setPlatform] = useState(platforms[0]?.id ?? '')
  const [url, setUrl] = useState('')
  const [displayName, setDisplayName] = useState('')

  const submit = async (): Promise<UiResult<SourceStatus>> => {
    let parsed: URL
    try {
      parsed = new URL(url.trim())
    } catch {
      return {
        ok: false,
        error: { code: 'VALIDATION', message: '请填写有效的平台网址' },
      }
    }
    if (parsed.protocol !== 'https:') {
      return {
        ok: false,
        error: { code: 'VALIDATION', message: '平台网址必须使用 HTTPS' },
      }
    }
    if (!platform) {
      return {
        ok: false,
        error: { code: 'VALIDATION', message: '当前 Host 没有可用的数据源引擎' },
      }
    }
    const origin = parsed.origin
    const host = parsed.hostname
    const baseConfig = {
      loginUrl: parsed.toString(),
      authenticatedUrlPatterns: [`^${escapeRegex(origin)}/`],
      cookieDomains: [host],
      verifyUrl: parsed.toString(),
      loggedOutPatterns: ['/webapps/login', '/login'],
    }
    const config =
      platform === 'blackboard'
        ? {
            ...baseConfig,
            portalUrl: parsed.toString(),
            maxAssignments: 100,
            maxContentPages: 20,
            delayMs: 150,
          }
        : baseConfig
    return callApi<SourceStatus>(ctx, 'createSource', {
      engine: platform,
      displayName: displayName.trim() || host,
      authKind: 'token',
      loginMode: 'browser',
      capabilities: ['academic.sync'],
      config,
    })
  }

  return (
    <form
      className="ac-form-card"
      onSubmit={(event) => {
        event.preventDefault()
        void action.run('quick-add', submit, '数据源已创建；下一步完成登录').then(
          (ok) => {
            if (ok) {
              setUrl('')
              setDisplayName('')
            }
          },
        )
      }}
    >
      <h3>快速添加平台</h3>
      <p className="ac-muted">
        填写平台首页并选择类型，系统会生成非敏感配置；随后完成登录、验证、预览和首次同步。
        凭据和 Cookie 不会写入配置。
      </p>
      <div className="ac-form-grid">
        <Field label="平台网址" hint="必须是 HTTPS；建议填写登录后的首页">
          <input
            type="url"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="https://lms.example.edu/"
            required
          />
        </Field>
        <Field label="显示名称（可选）">
          <input
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            placeholder="我的课程平台"
          />
        </Field>
        <Field label="平台类型">
          <select
            value={platform}
            onChange={(event) => setPlatform(event.target.value)}
            required
          >
            {platforms.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.label}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <div className="ac-form-actions">
        <button
          type="submit"
          className="ac-button ac-button-primary"
          disabled={action.pending !== undefined || platforms.length === 0}
        >
          {action.pending === 'quick-add' ? '创建中…' : '添加平台'}
        </button>
      </div>
      {action.notice && (
        <NoticeBar notice={action.notice} onDismiss={() => action.setNotice(undefined)} />
      )}
    </form>
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
  const initialEngine = data.engines[0]
  const initialAuthKind = initialEngine?.authKinds?.[0] ?? 'token'
  const [sourceId, setSourceId] = useState('')
  const [engine, setEngine] = useState(initialEngine?.id ?? '')
  const [displayName, setDisplayName] = useState('')
  const [authKind, setAuthKind] = useState<string>(initialAuthKind)
  const [loginMode, setLoginMode] = useState<string>(
    initialAuthKind === 'none'
      ? 'none'
      : (initialEngine?.loginModes?.[0] ?? 'browser'),
  )
  const [capabilities, setCapabilities] = useState('')
  const [configJson, setConfigJson] = useState('{}')

  const selectedEngine = data.engines.find((entry) => entry.id === engine)
  const authKinds = selectedEngine?.authKinds ?? [
    'none',
    'password',
    'token',
    'oauth',
  ]
  const loginModes = selectedEngine?.loginModes ?? ['browser', 'manual']
  const loginDisabled =
    authKind === 'none' || selectedEngine?.supportsLogin === false

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
          <select
            value={engine}
            onChange={(event) => {
              const nextId = event.target.value
              const next = data.engines.find((entry) => entry.id === nextId)
              setEngine(nextId)
              const nextAuth = next?.authKinds
                ? (next.authKinds[0] ?? 'none')
                : 'token'
              const nextLogin = next?.loginModes
                ? (next.loginModes[0] ?? 'none')
                : 'browser'
              setAuthKind(nextAuth)
              setLoginMode(nextAuth === 'none' ? 'none' : nextLogin)
            }}
            required
          >
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
          <select
            value={authKind}
            onChange={(event) => {
              const next = event.target.value
              setAuthKind(next)
              if (next === 'none') {
                setLoginMode('none')
              } else if (loginMode === 'none' && loginModes[0]) {
                setLoginMode(loginModes[0])
              }
            }}
          >
            {authKinds.map((kind) => (
              <option key={kind} value={kind}>
                {kind}
              </option>
            ))}
          </select>
        </Field>
        <Field label="登录方式">
          <select
            value={loginDisabled ? 'none' : loginMode}
            onChange={(event) => setLoginMode(event.target.value)}
            disabled={loginDisabled}
          >
            <option value="none">不登录</option>
            {loginModes.map((mode) => (
              <option key={mode} value={mode}>
                {mode}
              </option>
            ))}
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
      <details className="ac-advanced">
        <summary>高级设置</summary>
        <Field
          label="非敏感配置（JSON）"
          hint="URL、选择器、规则等；禁止 password/token/cookie 字段"
        >
          <textarea
            rows={6}
            value={configJson}
            onChange={(event) => setConfigJson(event.target.value)}
            spellCheck={false}
          />
        </Field>
      </details>
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

const CANDIDATE_STAGE_LABELS: Record<AdapterCandidateCheckStage, string> = {
  schema: 'Schema',
  contract: '字段与请求契约',
  permissions: '访问范围',
  'sample-replay': '样本回放',
}

const CANDIDATE_STATUS_LABELS: Record<string, string> = {
  candidate: '待验证',
  validated: '已验证',
  revoked: '已撤销',
}

function CandidatePanel({
  ctx,
  active,
  onChanged,
}: {
  ctx: PageProps['ctx']
  active: boolean
  onChanged: () => Promise<unknown>
}) {
  const load = useCallback(
    (signal: AbortSignal) =>
      callApi<AdapterCandidatesView>(ctx, 'adapterCandidates', {}, signal),
    [ctx],
  )
  const { state, refresh } = useLoad(load, active)
  const action = useAction(async () => {
    await refresh()
    await onChanged()
  })
  const [manifestJson, setManifestJson] = useState('')
  const [samplesJson, setSamplesJson] = useState('[]')
  const [report, setReport] = useState<
    AdapterCandidateValidationView['report']
  >()
  const [message, setMessage] = useState<string>()

  const parseInput = (): {
    manifest: unknown
    samples: Array<{ url: string; body: string; contentType?: string }>
  } | undefined => {
    try {
      const manifest = JSON.parse(manifestJson) as unknown
      const samples = JSON.parse(samplesJson) as unknown
      if (!Array.isArray(samples) || samples.length === 0) {
        throw new Error('样本必须是非空数组')
      }
      return {
        manifest,
        samples: samples as Array<{
          url: string
          body: string
          contentType?: string
        }>,
      }
    } catch (error) {
      setMessage(`JSON 无效：${error instanceof Error ? error.message : String(error)}`)
      return undefined
    }
  }

  const validate = async (): Promise<UiResult<AdapterCandidateValidationView>> => {
    const input = parseInput()
    if (!input) {
      return {
        ok: false,
        error: { code: 'VALIDATION', message: '请检查 Manifest 与样本 JSON' },
      }
    }
    const result = await callApi<AdapterCandidateValidationView>(
      ctx,
      'validateAdapterCandidate',
      input,
    )
    if (result.ok) setReport(result.value.report)
    return result
  }

  const register = async (): Promise<UiResult<AdapterCandidateRegistrationView>> => {
    const input = parseInput()
    if (!input) {
      return {
        ok: false,
        error: { code: 'VALIDATION', message: '请检查 Manifest 与样本 JSON' },
      }
    }
    const result = await callApi<AdapterCandidateRegistrationView>(
      ctx,
      'registerAdapterCandidate',
      input,
    )
    if (result.ok) setReport(result.value.report)
    return result
  }

  const data = state.data
  return (
    <Section
      title="Adapter 候选"
      subtitle="Agent 负责生成；验证、启用与回滚由用户在此确认"
    >
      <p className="ac-muted">
        在 DSH 对话中让 Agent 调用 <code>academic_probe_source</code>{' '}
        读取已登录页面的脱敏证据，再生成 Manifest 与显式样本。候选只有通过离线回放才能启用；
        启用后会自动创建或更新可同步的 declarative 数据源。
      </p>
      {data?.candidates.length ? (
        <ul className="ac-list">
          {data.candidates.map((candidate) => {
            const activeVersion = data.active.find(
              (entry) => entry.adapterId === candidate.adapterId,
            )?.active
            return (
              <li key={`${candidate.adapterId}@${candidate.version}`} className="ac-list-row">
                <div>
                  <strong>
                    {candidate.displayName} · {candidate.adapterId}@{candidate.version}
                  </strong>
                  <span className="ac-muted">
                    {CANDIDATE_STATUS_LABELS[candidate.status] ?? candidate.status}
                    {activeVersion === candidate.version ? ' · 当前启用' : ''} · 更新于{' '}
                    {candidate.updatedAt}
                  </span>
                  {candidate.scope && (
                    <>
                      <span className="ac-muted">
                        允许主机：{candidate.scope.allowedOrigins.join('、')} · 路径：
                        {candidate.scope.allowedPathPrefixes.join('、')}
                      </span>
                      <span className="ac-muted">
                        数据类型：{candidate.scope.dataTypes.join(' / ')}；字段：
                        {Object.entries(candidate.scope.fields)
                          .map(([name, fields]) => `${name}[${fields.join(', ')}]`)
                          .join('；')}
                      </span>
                    </>
                  )}
                </div>
                <div className="ac-source-actions">
                  {candidate.status === 'validated' &&
                    activeVersion !== candidate.version && (
                      <ConfirmAction
                        label="启用"
                        confirmLabel="确认启用"
                        disabled={action.pending !== undefined}
                        onConfirm={() =>
                          void action
                            .run(
                              `activate-${candidate.adapterId}-${candidate.version}`,
                              () =>
                                callApi<AdapterCandidateActivationView>(
                                  ctx,
                                  'activateAdapterCandidate',
                                  {
                                    adapterId: candidate.adapterId,
                                    version: candidate.version,
                                  },
                                ),
                              '候选已启用',
                            )
                            .then(() => refresh())
                        }
                      />
                    )}
                  {activeVersion === candidate.version && (
                    <ConfirmAction
                      label="回滚"
                      confirmLabel="确认回滚"
                      disabled={action.pending !== undefined}
                      onConfirm={() =>
                        void action.run(
                          `rollback-${candidate.adapterId}`,
                          () =>
                            callApi<AdapterCandidateSummary>(
                              ctx,
                              'rollbackAdapterCandidate',
                              { adapterId: candidate.adapterId },
                            ),
                          '已回滚到上一个已验证版本',
                        )
                      }
                    />
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="ac-muted">还没有保存的候选。</p>
      )}

      <details className="ac-advanced">
        <summary>导入候选（Manifest + 离线样本）</summary>
        <Field label="Manifest JSON">
          <textarea
            rows={8}
            value={manifestJson}
            onChange={(event) => setManifestJson(event.target.value)}
            spellCheck={false}
            placeholder='{"schemaVersion":1,...}'
          />
        </Field>
        <Field
          label="样本 JSON"
          hint='[{"url":"https://...","body":"...","contentType":"text/html"}]'
        >
          <textarea
            rows={6}
            value={samplesJson}
            onChange={(event) => setSamplesJson(event.target.value)}
            spellCheck={false}
          />
        </Field>
        <div className="ac-form-actions">
          <button
            type="button"
            className="ac-button"
            disabled={action.pending !== undefined}
            onClick={() => void action.run('validate-candidate', validate, '验证完成')}
          >
            {action.pending === 'validate-candidate' ? '验证中…' : '离线验证'}
          </button>
          <button
            type="button"
            className="ac-button"
            disabled={action.pending !== undefined || !report?.ok}
            onClick={() => void action.run('register-candidate', register, '候选已保存')}
          >
            {action.pending === 'register-candidate' ? '保存中…' : '保存候选'}
          </button>
        </div>
      </details>

      {report && (
        <div className="ac-secret-form">
          <p className={report.ok ? 'ac-muted' : 'ac-text-bad'}>
            验证{report.ok ? '通过' : '失败'}：课程 {report.courses.length} · 事项{' '}
            {report.items.length}
          </p>
          {report.checks?.map((check) => (
            <p key={check.stage} className={check.ok ? 'ac-muted' : 'ac-text-bad'}>
              {CANDIDATE_STAGE_LABELS[check.stage]}：
              {check.ok ? '通过' : '失败'}
              {!check.ok && check.detail ? ` — ${check.detail}` : ''}
            </p>
          ))}
          {report.errors.map((error) => (
            <p key={error} className="ac-text-bad">
              {error}
            </p>
          ))}
          {report.warnings.map((warning) => (
            <p key={warning} className="ac-text-warn">
              {warning}
            </p>
          ))}
        </div>
      )}
      {action.notice && (
        <NoticeBar notice={action.notice} onDismiss={() => action.setNotice(undefined)} />
      )}
      {message && <p className="ac-text-bad">{message}</p>}
    </Section>
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
          <Section
            title="添加平台"
            subtitle="先配置平台链接并完成登录；后续验证、预览和同步都以这里为入口"
          >
            <QuickAdd ctx={ctx} data={data} onCreated={refresh} />
          </Section>

          <Section
            title="数据源"
            subtitle="数据库中的 source 配置 + 通用 engine；凭据与状态分开保存"
          >
            {data.sources.length === 0 ? (
              <EmptyState title="还没有数据源">
                在上方填写平台网址添加数据源。
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
            <details className="ac-advanced">
              <summary>高级：手动配置 Engine 与 JSON</summary>
              <SourceForm ctx={ctx} data={data} onCreated={refresh} />
            </details>
          </Section>

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

          <CandidatePanel ctx={ctx} active={active} onChanged={refresh} />

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
