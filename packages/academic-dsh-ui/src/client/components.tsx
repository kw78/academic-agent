import { useEffect, useState, type ReactNode } from 'react'
import type { UiFailure } from '../protocol.js'
import type { ViewState } from './state.js'
import type { Notice } from './hooks.js'

export function Badge({
  tone = 'neutral',
  children,
}: {
  tone?: 'ok' | 'warn' | 'bad' | 'neutral' | 'info'
  children: ReactNode
}) {
  return <span className={`ac-badge ac-badge-${tone}`}>{children}</span>
}

export function Section({
  title,
  subtitle,
  actions,
  children,
}: {
  title: string
  subtitle?: string
  actions?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="ac-section">
      <div className="ac-section-title">
        <div>
          <h2>{title}</h2>
          {subtitle && <p className="ac-muted">{subtitle}</p>}
        </div>
        {actions && <div className="ac-section-actions">{actions}</div>}
      </div>
      {children}
    </section>
  )
}

export function StatCard({
  label,
  value,
  hint,
  tone = 'neutral',
}: {
  label: string
  value: string | number
  hint?: string
  tone?: 'neutral' | 'warn' | 'bad' | 'ok'
}) {
  return (
    <div className={`ac-stat ac-stat-${tone}`}>
      <span className="ac-stat-label">{label}</span>
      <strong className="ac-stat-value">{value}</strong>
      {hint && <span className="ac-stat-hint">{hint}</span>}
    </div>
  )
}

export function EmptyState({
  title,
  children,
  action,
}: {
  title: string
  children?: ReactNode
  action?: ReactNode
}) {
  return (
    <div className="ac-empty">
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {action && <div className="ac-empty-action">{action}</div>}
    </div>
  )
}

export function NoticeBar({
  notice,
  onDismiss,
}: {
  notice: Notice
  onDismiss?: () => void
}) {
  return (
    <div className={`ac-banner ac-banner-${notice.tone}`} role="status">
      <div>{notice.text}</div>
      {onDismiss && (
        <button type="button" className="ac-button" onClick={onDismiss}>
          关闭
        </button>
      )}
    </div>
  )
}

export function StateBanner({
  state,
  failure,
  updatedAt,
  onRetry,
  onNavigate,
}: {
  state: ViewState
  failure?: UiFailure
  updatedAt?: string
  onRetry?: () => void
  onNavigate?: () => void
}) {
  if (state === 'ready' || state === 'empty' || state === 'loading') return null
  const stamp = updatedAt
    ? `最近有效数据：${new Date(updatedAt).toLocaleString('zh-CN')}`
    : undefined
  const map: Record<
    Exclude<ViewState, 'ready' | 'empty' | 'loading' | 'stale' | 'degraded'>,
    { title: string; action?: string }
  > = {
    'auth-required': { title: '需要重新认证', action: '前往连接' },
    conflict: { title: '状态已变化', action: '刷新' },
    unavailable: { title: 'Host 服务不可用', action: '重试' },
    error: { title: '请求失败', action: '重试' },
  }
  const stale = state === 'stale' || state === 'degraded'
  const entry = stale
    ? {
        title: state === 'stale' ? '显示的是最后一次有效数据' : '部分能力或数据源不可用',
        action: '刷新',
      }
    : map[state]
  return (
    <div
      className={`ac-banner ${state === 'unavailable' || state === 'error' ? 'ac-banner-error' : 'ac-banner-warn'}`}
      role="alert"
    >
      <div>
        <strong>{entry.title}</strong>
        {failure && <p>{failure.message}</p>}
        {stamp && <p className="ac-muted">{stamp}</p>}
      </div>
      <div className="ac-banner-actions">
        {state === 'auth-required' && onNavigate ? (
          <button type="button" className="ac-button" onClick={onNavigate}>
            {entry.action}
          </button>
        ) : (
          onRetry && (
            <button type="button" className="ac-button" onClick={onRetry}>
              {entry.action ?? '重试'}
            </button>
          )
        )}
      </div>
    </div>
  )
}

export function ConfirmAction({
  label,
  confirmLabel = '确认操作',
  onConfirm,
  disabled = false,
}: {
  label: string
  confirmLabel?: string
  onConfirm: () => void | Promise<void>
  disabled?: boolean
}) {
  const [armed, setArmed] = useState(false)
  useEffect(() => {
    if (!armed) return undefined
    const timer = window.setTimeout(() => setArmed(false), 5000)
    return () => window.clearTimeout(timer)
  }, [armed])
  return (
    <button
      type="button"
      className={armed ? 'ac-button ac-button-danger' : 'ac-button'}
      disabled={disabled}
      onClick={() => {
        if (!armed) {
          setArmed(true)
          return
        }
        setArmed(false)
        void onConfirm()
      }}
    >
      {armed ? confirmLabel : label}
    </button>
  )
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: ReactNode
}) {
  return (
    <label className="ac-field">
      <span className="ac-field-label">{label}</span>
      {children}
      {hint && <span className="ac-field-hint">{hint}</span>}
    </label>
  )
}

export function LoadingLine({ children }: { children?: ReactNode }) {
  return (
    <p className="ac-muted" role="status">
      {children ?? '正在加载…'}
    </p>
  )
}
