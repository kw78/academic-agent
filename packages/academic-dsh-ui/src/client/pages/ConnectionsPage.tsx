import { useCallback, useEffect, useState } from 'react'
import type {
  AdapterCandidateCheckStage,
  ConnectionView,
  SourceCaptureSummary,
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
  ConnectionsView,
  SourceCaptureView,
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
    setMessage('登录信息已保存在本机。请再验证连接，确认能否访问平台。')
    await onDone()
  }

  return (
    <div className="ac-secret-form">
      <Field
        label={source.authKind === 'token' ? 'Token' : '密码'}
        hint="登录信息只交给本机学业服务，不会写入浏览器存储、网址或日志。"
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

function SourceEditForm({
  ctx,
  source,
  engine,
  onDone,
  onCancel,
}: {
  ctx: PageProps['ctx']
  source: SourceStatus
  engine: ConnectionsView['engines'][number] | undefined
  onDone: () => Promise<unknown>
  onCancel: () => void
}) {
  const [displayName, setDisplayName] = useState(source.displayName)
  const [authKind, setAuthKind] = useState<string>(
    source.authKind === 'unknown' ? 'token' : source.authKind,
  )
  const [loginMode, setLoginMode] = useState<string>(source.loginMode ?? 'browser')
  const [capabilities, setCapabilities] = useState(source.capabilities.join(', '))
  const [configJson, setConfigJson] = useState(JSON.stringify(source.config, null, 2))
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState<string>()

  const authKinds = engine?.authKinds ?? ['none', 'password', 'token', 'oauth']
  const loginModes = engine?.loginModes ?? ['browser', 'manual']

  const submit = async () => {
    let config: Record<string, unknown>
    try {
      const parsed = JSON.parse(configJson || '{}') as unknown
      if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('配置必须是 JSON 对象')
      }
      config = parsed as Record<string, unknown>
    } catch (error) {
      setMessage(`配置 JSON 无效：${error instanceof Error ? error.message : String(error)}`)
      return
    }
    setPending(true)
    setMessage(undefined)
    const result = await callApi<SourceStatus>(ctx, 'updateSource', {
      sourceId: source.sourceId,
      displayName: displayName.trim(),
      authKind,
      ...(authKind === 'none' ? {} : { loginMode }),
      capabilities: capabilities
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean),
      config,
      expectedVersion: source.version,
    })
    setPending(false)
    if (!result.ok) {
      setMessage(result.error.message)
      return
    }
    await onDone()
    onCancel()
  }

  return (
    <div className="ac-secret-form">
      <div className="ac-form-grid">
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
              if (next === 'none') setLoginMode('none')
              else if (loginMode === 'none') setLoginMode(loginModes[0] ?? 'browser')
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
            value={authKind === 'none' ? 'none' : loginMode}
            onChange={(event) => setLoginMode(event.target.value)}
            disabled={authKind === 'none' || engine?.supportsLogin === false}
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
          />
        </Field>
      </div>
      <Field
        label="非敏感配置（JSON）"
        hint="URL、选择器、规则等；禁止 password/token/cookie 字段"
      >
        <textarea
          rows={8}
          value={configJson}
          onChange={(event) => setConfigJson(event.target.value)}
          spellCheck={false}
        />
      </Field>
      <div className="ac-form-actions">
        <button
          type="button"
          className="ac-button ac-button-primary"
          disabled={pending}
          onClick={() => void submit()}
        >
          {pending ? '保存中…' : '保存配置'}
        </button>
        <button type="button" className="ac-button" disabled={pending} onClick={onCancel}>
          取消
        </button>
      </div>
      {message && <p className="ac-text-bad">{message}</p>}
    </div>
  )
}

type PrimaryKind =
  | 'restore'
  | 'login'
  | 'verify'
  | 'capture'
  | 'adapter'
  | 'preview'
  | 'sync'
  | 'fix'
  | 'none'

interface PrimaryAction {
  kind: PrimaryKind
  label: string
  hint?: string
}

function primaryActionFor(
  source: SourceStatus,
  capture: SourceCaptureSummary | undefined,
): PrimaryAction {
  if (source.configuration === 'archived') {
    return { kind: 'restore', label: '恢复数据源' }
  }
  if (!source.engineKnown || !source.adapterAvailable) {
    return {
      kind: 'fix',
      label: '检查引擎与配置',
      hint: source.nextStep.reason ?? '当前引擎不可用',
    }
  }
  if (source.authKind !== 'none') {
    if (source.authentication === 'missing') {
      return source.canLogin
        ? { kind: 'login', label: '登录平台' }
        : { kind: 'fix', label: '配置认证会话' }
    }
    if (source.authentication === 'expired' || source.authentication === 'rejected') {
      return source.canLogin
        ? { kind: 'login', label: '重新登录' }
        : { kind: 'fix', label: '重新配置认证会话' }
    }
    if (source.authentication === 'saved') {
      return source.canVerify
        ? { kind: 'verify', label: '验证连接' }
        : { kind: 'fix', label: '当前引擎不支持验证' }
    }
  }
  if (capture && capture.endpoints.length > 0) {
    return {
      kind: 'adapter',
      label: '把录制结果交给 Agent',
      hint: '样本回放通过不等于真实同步',
    }
  }
  if (!source.adapterReady) {
    return source.canCapture
      ? { kind: 'capture', label: '登录并录制课程页面' }
      : { kind: 'adapter', label: '让 Agent 生成候选' }
  }
  if (
    source.stage === 'ready' ||
    source.stage === 'failed' ||
    source.stage === 'degraded'
  ) {
    return {
      kind: 'preview',
      label: '预览同步',
      hint: '确认新增/更新/未变后才写入数据',
    }
  }
  if (source.stage === 'syncing') {
    return { kind: 'none', label: '同步进行中' }
  }
  return { kind: 'none', label: '运行正常' }
}

function SourceCard({
  ctx,
  source,
  engines,
  timeZone,
  agentAutomation,
  refresh,
}: {
  ctx: PageProps['ctx']
  source: SourceStatus
  engines: ConnectionsView['engines']
  timeZone: string
  agentAutomation: boolean
  refresh: () => Promise<unknown>
}) {
  const action = useAction(async () => {
    await refresh()
  })
  const [preview, setPreview] = useState<SyncPreview>()
  const [probe, setProbe] = useState<SourceProbeEvidence>()
  const [capture, setCapture] = useState<SourceCaptureSummary>()
  const [agentNote, setAgentNote] = useState<string>()
  const [editing, setEditing] = useState(false)
  const connection = source.connection
  const archived = source.configuration === 'archived'
  const engine = engines.find((entry) => entry.id === source.engine)
  const browserLogin = source.canLogin && source.loginMode === 'browser'
  const manualCredential = source.authKind !== 'none' && !browserLogin
  const syncAllowed = source.nextStep.action === 'sync'
  const primary = primaryActionFor(source, capture)

  const askForAdapter = () => {
    const ok = askAgent(
      ctx,
      `请为数据源 ${source.sourceId}（${source.displayName}）生成可验证的声明式 Adapter。按阶段执行，证据不足时停止并说明，不要猜测。\n` +
        '0. 先调用 academic_list_capture_endpoints；若有“登录并录制”的结果，直接用它给出的真实接口、字段、分页参数与 sampleIds 生成 Manifest，不要继续盲探 URL。\n' +
        '1. 没有录制结果时，再调用 academic_probe_source 探测当前配置页面，记录 status/title/headings/links/scripts/endpointCandidates/tables/containers/jsonShape/digest；不要记录 Cookie。\n' +
        '2. 若页面是 SPA 外壳（标题/列表/表格/链接基本为空，只有“加载中”），不要生成 selector 占位候选；用 academic_probe_source 的可选 url 参数继续探测同站脚本、分页/列表链接和候选接口，优先找同源 JSON 接口并记录字段/数组形状。默认允许探测任意公开 HTTPS 主机；只有来源显式设置 probeAllowAnyPublicHost=false 时才限制在 cookieDomains/probeAllowedHosts。跨主机不会自动带该域名 Cookie；Manifest 的 allowedOrigins 要列出所有实际请求主机。需要先摸清一个栏目时，可调用 academic_crawl_source 从入口 URL 有界抓取（最多 10 页、深度 2、只跟 GET 链接，仍受 probePathPrefixes 限制）。若列表只能 POST 取得，可对候选接口用 method=POST + JSON body 探测并 capture；Manifest 用 method/body 表达同样的只读 JSON 请求（POST 不支持 next 翻页，改用 pageParam/pageIn=body 或 offsetParam/offsetIn=body）。\n' +
        '3. 找到真实列表页或 JSON 接口后，先根据 tables[].className/headers、containers[].className 和 links 推断选择器，再用 academic_probe_source 的 capture=true 捕获响应，拿到 sampleId；原始页面只留在宿主，不要把整页内容粘贴到对话里。\n' +
        '4. 只有拿到真实页面/真实 JSON 样本后才生成字段映射；用 sampleIds（或真实 samples）调用 academic_validate_adapter_candidate，样本必须覆盖所有请求 URL；POST 样本需带 method:"POST" 和与 Manifest 完全一致的 requestBody。不要伪造 HTML 样本来通过验证。验证失败时，说明哪项检查未通过、缺少什么证据。\n' +
        '5. 不注册、不启用、不扩大域名/路径；需要更宽路径时给出精确 URL/前缀，交由我在“连接”页确认。\n' +
        '6. 先用几句话说明找到了什么、规则是否已验证，以及下一步该做什么。若受阻，只问当前最需要补充的信息。探测 URL、状态、尝试过的接口和 sampleId 放在后面的简短记录里；不必复述整个流程。',
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

  const runCapture = async (): Promise<UiResult<SourceCaptureSummary>> => {
    const result = await callApi<SourceCaptureView>(ctx, 'sourceCapture', {
      sourceId: source.sourceId,
    })
    if (!result.ok) return result
    setCapture(result.value.capture)
    return { ok: true, value: result.value.capture }
  }

  const askAgentWithCapture = () => {
    const ok = askAgent(
      ctx,
      `请为数据源 ${source.sourceId}（${source.displayName}）生成可验证的声明式 Adapter。` +
        '我在“连接”页完成了“登录并录制”，请先调用 academic_list_capture_endpoints 读取真实接口，不要再盲探 URL。\n' +
        '1. 只使用清单里的真实 URL、方法、查询/请求体参数、分页参数、collections[].path 与字段路径；不要把清单外的主机或路径写进 Manifest。\n' +
        '1.1 先看 nextStep.action：只有 validate 时才生成候选；recapture / unsupported-transport / needs-confirmation 时直接说明并停止。\n' +
        '2. Manifest 的 allowedOrigins 覆盖清单中的全部主机，allowedPathPrefixes 使用建议前缀；先用 sampleIds 调 academic_validate_adapter_candidate 离线回放，样本必须覆盖所有请求。\n' +
        '3. 若接口含已屏蔽的鉴权参数、或需要表单编码/自定义头导致无法精确回放，直接说明并停止，不要用合成样本让验证通过。\n' +
        '4. 保存候选即可，不要启用。先说明规则能读取哪些内容、样本验证是否通过、接下来需要我确认什么；技术细节按需补充。样本验证通过不代表已完成真实同步。',
    )
    setAgentNote(
      ok
        ? '已打开 Agent 会话；生成完成后回到“连接”页验证并启用候选。'
        : '当前环境没有可用的 Agent 会话入口，请在 DSH 对话中发起。',
    )
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

  const runPrimaryAction = async (): Promise<UiResult<unknown>> => {
    switch (primary.kind) {
      case 'restore':
        return callApi<SourceStatus>(ctx, 'restoreSource', {
          sourceId: source.sourceId,
        })
      case 'login':
        return callApi<ConnectionView>(ctx, 'sourceLogin', {
          sourceId: source.sourceId,
        })
      case 'verify':
        return connection
          ? callApi<ConnectionView>(ctx, 'verifyConnection', {
              connectionId: connection.connectionId,
            })
          : {
              ok: false,
              error: { code: 'VALIDATION', message: '还没有可验证的连接' },
            }
      case 'capture':
        return runCapture()
      case 'preview':
        return previewSync()
      case 'sync':
        return sync()
      case 'adapter':
        if (capture) askAgentWithCapture()
        else askForAdapter()
        return { ok: true, value: {} }
      default:
        return { ok: true, value: {} }
    }
  }

  const primarySuccessText =
    primary.kind === 'login'
      ? '登录成功，会话已保存；还需要验证连接'
      : primary.kind === 'verify'
        ? '连接已验证；保存会话不等于已验证'
        : primary.kind === 'capture'
          ? '录制完成；下一步可交给 Agent 生成候选'
          : primary.kind === 'preview'
            ? '预览完成；确认同步后才写入学业数据'
            : primary.kind === 'restore'
              ? '数据源已恢复；请重新登录'
              : primary.kind === 'adapter'
                ? '已打开 Agent 会话'
                : '操作完成'

  return (
    <li id={`ac-source-${source.sourceId}`} className="ac-card ac-source-card">
      <div className="ac-source-main">
        <div className="ac-task-title">
          <strong>{source.displayName}</strong>
          <Badge tone={sourceStageTone(source.stage)}>
            {sourceStageLabel(source.stage)}
          </Badge>
          <Badge tone={source.engineKnown ? 'info' : 'bad'}>引擎：{source.engine}</Badge>
          <Badge tone={source.syncAvailable ? 'ok' : 'neutral'}>
            {source.syncAvailable ? '同步源' : '登录源'}
          </Badge>
          {source.canLogin && <Badge tone="info">登录可用</Badge>}
        </div>
        <p className="ac-muted">{source.detail}</p>
        {source.diagnosis && (
          <p className="ac-text-warn">
            诊断：{source.diagnosis.summary} · 建议：{source.diagnosis.suggestion}
          </p>
        )}
        <div className="ac-current-step">
          <Badge tone={source.stage === 'enabled' ? 'ok' : 'info'}>
            当前：{primary.label}
          </Badge>
          <span className="ac-muted">
            {primary.hint ??
              source.nextStep.reason ??
              (source.stage === 'enabled'
                ? '正常运行；手动同步属于次级操作'
                : source.nextStep.label)}
          </span>
        </div>
        <p className="ac-muted ac-source-flow">
          接入顺序：登录保存 → 验证连接 → 录制/候选 → 样本回放 → 真实预览 → 同步。登录保存不等于验证，样本回放不等于真实同步。
        </p>
        <p className="ac-muted">
          Agent 接入策略：
          {agentAutomation
            ? '已开启一次性授权，Agent 可启用已验证候选并预览/同步声明式源；仍不能启用未验证候选、读取凭据或修改学校平台。'
            : '默认关闭；候选启用与同步仍需你逐次确认。'}
        </p>
        <p className="ac-muted">
          最近有效数据：
          {formatDateTimeOrDash(source.lastSuccessfulSync?.finishedAt, timeZone)}
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
            接入规则：{source.adapterReady ? '已就绪' : '未就绪'}
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
            {probe.tables.length > 0 && (
              <p className="ac-muted">
                表格：
                {probe.tables
                  .map(
                    (table) =>
                      `${table.className ?? table.id ?? 'table'}[${table.headers.join('/')}] ${table.rowCount} 行`,
                  )
                  .join('；')}
              </p>
            )}
            {probe.containers.length > 0 && (
              <p className="ac-muted">
                容器：
                {probe.containers
                  .slice(0, 8)
                  .map(
                    (entry) =>
                      `${entry.tag}${entry.className ? `.${entry.className}` : ''}${entry.id ? `#${entry.id}` : ''}`,
                  )
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
              这里只展示读取到的网站信息。接入规则需要验证通过后才能启用。
            </p>
          </div>
        )}
        {agentNote && <p className="ac-muted">{agentNote}</p>}
        {browserLogin && (
          <p className="ac-muted">
            登录会打开 Edge/Chrome 窗口；请在窗口中完成登录和验证码。应用不会读取或保存密码。
          </p>
        )}
        {source.canCapture && (
          <p className="ac-muted">
            录制会打开 Edge/Chrome 并只读记录你访问的 JSON/HTML 响应。登录后请依次打开课程列表、作业列表，最好翻一页，再点窗口右上角“完成录制并保存会话”。
          </p>
        )}
        {capture && (
          <div className="ac-secret-form">
            <p className="ac-muted">
              录制结果（只读）：{capture.visited} 次请求 · {capture.hosts.length} 个站点 ·{' '}
              {capture.endpoints.length} 个接口 · {capture.endpoints.reduce((sum, endpoint) => sum + (endpoint.response.itemCount ?? 0), 0)} 条记录
            </p>
            <p className="ac-muted">涉及站点：{capture.hosts.join(' / ')}</p>
            {capture.endpoints.length > 0 && (
              <ul className="ac-list">
                {capture.endpoints.slice(0, 12).map((endpoint) => (
                  <li key={endpoint.sampleId}>
                    <Badge tone={endpoint.kind === 'list' ? 'ok' : 'neutral'}>
                      {endpoint.kind === 'list'
                        ? '列表'
                        : endpoint.kind === 'detail'
                          ? '详情'
                          : endpoint.kind === 'document'
                            ? '页面'
                            : '其他'}
                    </Badge>{' '}
                    {endpoint.method} {endpoint.path}
                    {endpoint.response.itemCount !== undefined
                      ? ` · ${endpoint.response.itemCount} 条`
                      : ''}
                    {endpoint.response.collectionPath &&
                    endpoint.response.collectionPath !== '$'
                      ? ` · 集合 ${endpoint.response.collectionPath}`
                      : ''}
                    {endpoint.pagination
                      ? ` · 分页参数 ${endpoint.pagination.param}`
                      : ''}
                    {endpoint.transport === 'form'
                      ? ' · 表单请求（当前不支持）'
                      : ''}
                    {endpoint.response.fields.length > 0
                      ? ` · 字段 ${endpoint.response.fields
                          .slice(0, 6)
                          .map((field) => field.path ?? field.key)
                          .join(', ')}`
                      : ''}
                    <span className="ac-muted">
                      {' '}
                      · 样本 {endpoint.sampleId.slice(0, 8)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {capture.warnings.map((warning) => (
              <p key={warning} className="ac-text-warn">
                {warning}
              </p>
            ))}
            <p
              className={
                capture.nextStep.action === 'validate' ? 'ac-muted' : 'ac-text-warn'
              }
            >
              下一步：{capture.nextStep.label}
              {capture.nextStep.reason ? ` · ${capture.nextStep.reason}` : ''}
            </p>
            <p className="ac-muted">
              原始响应只留在宿主样本库（60 分钟），不发给模型。样本回放通过后，候选仍需你在页面确认后才会启用。
            </p>
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
      {editing && !archived && (
        <SourceEditForm
          ctx={ctx}
          source={source}
          engine={engine}
          onDone={refresh}
          onCancel={() => setEditing(false)}
        />
      )}
      <div className="ac-source-actions">
        {primary.kind !== 'none' && primary.kind !== 'fix' ? (
          <button
            type="button"
            className="ac-button ac-button-primary"
            disabled={action.pending !== undefined}
            onClick={() => {
              if (primary.kind === 'adapter') {
                if (capture) askAgentWithCapture()
                else askForAdapter()
                return
              }
              void action.run(
                `primary-${primary.kind}`,
                runPrimaryAction,
                primarySuccessText,
              )
            }}
          >
            {action.pending === `primary-${primary.kind}`
              ? '处理中…'
              : primary.label}
          </button>
        ) : (
          <span className="ac-source-status-text" role="status">
            {primary.label}
            {primary.hint ? ` · ${primary.hint}` : ''}
          </span>
        )}

        {!archived && (
          <button
            type="button"
            className="ac-button ac-button-quiet"
            disabled={action.pending !== undefined}
            onClick={() => setEditing((value) => !value)}
          >
            {editing ? '收起编辑' : '编辑配置'}
          </button>
        )}

        <details className="ac-advanced ac-source-more">
          <summary>更多操作与诊断</summary>
          <div className="ac-source-more-body">
            {!archived && (
              <>
                {source.canLogin && (
                  <button
                    type="button"
                    className="ac-button"
                    disabled={action.pending !== undefined}
                    onClick={() =>
                      void action.run(
                        'login',
                        () =>
                          callApi<ConnectionView>(ctx, 'sourceLogin', {
                            sourceId: source.sourceId,
                          }),
                        '登录成功，会话已保存；还需要验证连接',
                      )
                    }
                  >
                    {action.pending === 'login'
                      ? '等待登录窗口…'
                      : connection
                        ? '重新登录'
                        : '登录平台'}
                  </button>
                )}
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
                {source.canCapture && (
                  <button
                    type="button"
                    className="ac-button"
                    disabled={action.pending !== undefined}
                    onClick={() =>
                      void action.run(
                        'capture',
                        runCapture,
                        '录制完成；下一步可交给 Agent 生成候选',
                      )
                    }
                  >
                    {action.pending === 'capture' ? '录制中…' : '登录并录制'}
                  </button>
                )}
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
                      '数据源已归档；可在下方恢复或彻底删除',
                    )
                  }
                />
              </>
            )}
            <ConfirmAction
              label="彻底删除"
              confirmLabel="确认彻底删除"
              disabled={action.pending !== undefined}
              onConfirm={() =>
                void action.run(
                  'delete-source',
                  () =>
                    callApi<{ deleted: boolean }>(ctx, 'deleteSource', {
                      sourceId: source.sourceId,
                    }),
                  '数据源与凭据已删除；已同步的学业数据保留',
                )
              }
            />
          </div>
        </details>
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
      id: 'browser-session',
      label: '通用网站（先登录，再生成适配器）',
    },
    {
      id: 'blackboard',
      label: 'Blackboard Learn（旧版兼容，仅建议已有源使用）',
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
        error: { code: 'VALIDATION', message: '当前没有可用的连接方式，请检查学业插件是否已启用' },
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
  contract: '字段和请求检查',
  permissions: '访问范围',
  'sample-replay': '样本回放',
}

const CANDIDATE_STATUS_LABELS: Record<string, string> = {
  candidate: '待验证',
  validated: '已验证',
  revoked: '已撤销',
}

function CandidateFileInput({
  label,
  onLoad,
}: {
  label: string
  onLoad: (text: string) => void
}) {
  return (
    <Field label={label} hint="仅在本机读取，不上传">
      <input
        type="file"
        accept=".json,application/json"
        onChange={(event) => {
          const file = event.target.files?.[0]
          if (!file) return
          void file.text().then(onLoad)
        }}
      />
    </Field>
  )
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
    samples: Array<{
      url: string
      body: string
      contentType?: string
      method?: 'GET' | 'POST'
      requestBody?: string
    }>
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
          method?: 'GET' | 'POST'
          requestBody?: string
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
      title="待确认的接入规则"
      subtitle="查看 Agent 生成的规则，验证后可以启用，也可以切回旧版本"
    >
      <p className="ac-muted">
        在 DSH 对话中让 Agent 调用 <code>academic_probe_source</code>{' '}
        读取已登录页面的信息，生成接入规则（Manifest），再用真实样本检查能否正确解析。只有验证通过的规则才能启用；
        启用后会自动添加或更新对应的同步源。
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
        <p className="ac-muted">
          离线验证只回放本地样本，不代表真实连接、启用或同步已经通过。
        </p>
        <CandidateFileInput label="从文件读取 Manifest" onLoad={setManifestJson} />
        <CandidateFileInput label="从文件读取样本" onLoad={setSamplesJson} />
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
            样本回放{report.ok ? '通过' : '失败'}（未做真实同步）：课程{' '}
            {report.courses.length} · 事项 {report.items.length}
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

export function ConnectionsPage({ ctx, active, onNavigate, nav }: PageProps) {
  const load = useCallback(
    (signal: AbortSignal) => callApi<ConnectionsView>(ctx, 'connections', {}, signal),
    [ctx],
  )
  const { state, refresh } = useLoad(load, active)
  const action = useAction(refresh)
  const data = state.data
  const view = viewState(state)
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'

  useEffect(() => {
    if (!data) return
    const targetId = nav?.sourceId
      ? `ac-source-${nav.sourceId}`
      : nav?.focus === 'sources'
        ? 'ac-sources-section'
        : undefined
    if (!targetId) return
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        document.getElementById(targetId)?.scrollIntoView({
          block: 'start',
          behavior: 'smooth',
        })
      })
    })
  }, [data, nav?.focus, nav?.nonce, nav?.sourceId])

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
            id="ac-sources-section"
            title="数据源"
            subtitle="每个来源只有一个主动作；登录保存、验证、样本回放与真实同步是不同步骤"
          >
            {data.sources.length === 0 ? (
              <EmptyState title="还没有数据源">
                在上方填写平台网址添加数据源。
              </EmptyState>
            ) : (
              <ul className="ac-source-grid">
                {[...data.sources]
                  .sort(
                    (left, right) =>
                      Number(left.configuration === 'archived') -
                      Number(right.configuration === 'archived'),
                  )
                  .map((source) => (
                  <SourceCard
                    key={source.sourceId}
                    ctx={ctx}
                    source={source}
                    engines={data.engines}
                    timeZone={timeZone}
                    agentAutomation={data.agentAdapterAutomation}
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

          <Section title="课程管理" subtitle="课程列表、详情、优先级与删除恢复已移到“课程”页">
            <div className="ac-inline-bar">
              <span className="ac-muted">
                课程页汇总待办、来源事项、计划、资料与关联来源，并保留返回位置。
              </span>
              <button
                type="button"
                className="ac-button"
                onClick={() => onNavigate('courses', {})}
              >
                打开课程页
              </button>
            </div>
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
      subtitle="填写平台网址后，在打开的浏览器中登录。登录状态会加密保存在本机，供后续读取页面使用。"
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
