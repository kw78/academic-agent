import { useCallback, useEffect, useState } from 'react'
import type { Context } from '@deepseek-ai/cordis'
import { callApi } from './api.js'
import { Badge } from './components.js'
import { injectStyles } from './styles.js'
import { askAgent, type TabId } from './pages/types.js'
import { DashboardPage } from './pages/DashboardPage.js'
import { TasksPage } from './pages/TasksPage.js'
import { PlanPage } from './pages/PlanPage.js'
import { ConnectionsPage } from './pages/ConnectionsPage.js'
import { AutomationPage } from './pages/AutomationPage.js'
import { SettingsPage } from './pages/SettingsPage.js'
import type { HostStatus } from '../protocol.js'

export const name = 'academic-ui'
export const inject = ['slots', 'connection']

const PANEL_ID = 'academic'
const TAB_KEY = 'academic.ui.tab.v1'

const TABS: Array<{ id: TabId; label: string }> = [
  { id: 'dashboard', label: '总览' },
  { id: 'tasks', label: '任务' },
  { id: 'plan', label: '计划' },
  { id: 'connections', label: '连接' },
  { id: 'automation', label: '自动化' },
  { id: 'settings', label: '设置' },
]

function readTab(): TabId {
  try {
    const value = window.localStorage.getItem(TAB_KEY)
    if (value && TABS.some((tab) => tab.id === value)) return value as TabId
  } catch {
    // Local storage is only an optional UI preference.
  }
  return 'dashboard'
}

function writeTab(tab: TabId): void {
  try {
    window.localStorage.setItem(TAB_KEY, tab)
  } catch {
    // Ignore blocked storage; the panel still works without remembering the tab.
  }
}

function AcademicIcon({ size = 18 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 7.5 12 3l9 4.5-9 4.5-9-4.5Z" />
      <path d="M6 9.5V15c0 1.7 2.7 3 6 3s6-1.3 6-3V9.5" />
      <path d="M21 7.5V14" />
    </svg>
  )
}

function AcademicPanel({ ctx }: { ctx: Context }) {
  const [tab, setTab] = useState<TabId>(() => readTab())
  const [status, setStatus] = useState<HostStatus>()
  const [statusError, setStatusError] = useState<string>()

  const loadStatus = useCallback(async () => {
    const result = await callApi<HostStatus>(ctx, 'status')
    if (result.ok) {
      setStatus(result.value)
      setStatusError(undefined)
    } else {
      setStatus(undefined)
      setStatusError(result.error.message)
    }
  }, [ctx])

  useEffect(() => {
    void loadStatus()
  }, [loadStatus])

  useEffect(() => {
    if (!statusError) return undefined
    const timer = window.setTimeout(() => {
      if (document.visibilityState === 'visible') void loadStatus()
    }, 5000)
    return () => window.clearTimeout(timer)
  }, [loadStatus, statusError])

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void loadStatus()
    }, 15_000)
    return () => window.clearInterval(timer)
  }, [loadStatus])

  const navigate = (next: TabId) => {
    setTab(next)
    writeTab(next)
  }

  const pageProps = { ctx, active: true, onNavigate: navigate }

  return (
    <div className="ac-shell">
      <header className="ac-header">
        <div>
          <h1>学业</h1>
          <p>课程、任务、计划与数据源</p>
        </div>
        <div className="ac-header-actions">
          {status && (
            <Badge tone={status.plannerAvailable ? 'ok' : 'warn'}>
              {status.plannerAvailable ? 'Host 已连接' : '规划能力未加载'}
            </Badge>
          )}
          {!status && statusError && <Badge tone="bad">Host 不可用</Badge>}
          <button
            type="button"
            className="ac-button"
            onClick={() => {
              askAgent(
                ctx,
                '我想查看当前的学业事实（课程、截止事项、学习任务和已确认计划），请先调用只读工具查询，再区分数据库事实与你的建议。',
              )
            }}
          >
            咨询 Agent
          </button>
        </div>
      </header>

      <nav className="ac-tabs" role="tablist" aria-label="学业页面">
        {TABS.map((entry) => (
          <button
            key={entry.id}
            type="button"
            role="tab"
            aria-selected={tab === entry.id}
            className={tab === entry.id ? 'ac-tab ac-tab-active' : 'ac-tab'}
            onClick={() => navigate(entry.id)}
          >
            {entry.label}
          </button>
        ))}
      </nav>

      <main className="ac-panel" role="tabpanel" aria-label={TABS.find((entry) => entry.id === tab)?.label}>
        {tab === 'dashboard' && <DashboardPage {...pageProps} />}
        {tab === 'tasks' && <TasksPage {...pageProps} />}
        {tab === 'plan' && <PlanPage {...pageProps} />}
        {tab === 'connections' && <ConnectionsPage {...pageProps} />}
        {tab === 'automation' && <AutomationPage {...pageProps} />}
        {tab === 'settings' && <SettingsPage {...pageProps} />}
      </main>
    </div>
  )
}

export function apply(ctx: Context): void {
  ctx.effect(() => injectStyles(), 'academic-ui: styles')

  ctx.slots.inject('sidebar.panellist', () =>
    ctx.slots.register(
      {
        name: 'sidebar.panellist',
        id: PANEL_ID,
        order: 20,
        label: '学业',
      },
      AcademicIcon,
    ),
  )

  ctx.slots.inject('main', () =>
    ctx.slots.register(
      {
        name: 'main',
        key: PANEL_ID,
      },
      () => <AcademicPanel ctx={ctx} />,
    ),
  )
}

export default { name, inject, apply }
