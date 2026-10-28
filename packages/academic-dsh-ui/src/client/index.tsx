import { useCallback, useEffect, useRef, useState } from 'react'
import type { Context } from '@deepseek-ai/cordis'
import { callApi } from './api.js'
import { Badge } from './components.js'
import { injectStyles } from './styles.js'
import {
  askAgent,
  type NavigationContext,
  type TabId,
} from './pages/types.js'
import { DashboardPage } from './pages/DashboardPage.js'
import { TasksPage } from './pages/TasksPage.js'
import { PlanPage } from './pages/PlanPage.js'
import { CoursesPage } from './pages/CoursesPage.js'
import { ConnectionsPage } from './pages/ConnectionsPage.js'
import { MaterialsPage } from './pages/MaterialsPage.js'
import { AutomationPage } from './pages/AutomationPage.js'
import { SettingsPage } from './pages/SettingsPage.js'
import type { HostStatus } from '../protocol.js'

export const name = 'academic-ui'
export const inject = ['slots', 'connection']

const PANEL_ID = 'academic'
const TAB_KEY = 'academic.ui.tab.v1'

interface TabEntry {
  id: TabId
  label: string
}

const NAV_GROUPS: Array<{ id: string; label: string; tabs: TabEntry[] }> = [
  {
    id: 'daily',
    label: '日常学习',
    tabs: [
      { id: 'today', label: '今天' },
      { id: 'tasks', label: '任务' },
      { id: 'plan', label: '计划' },
      { id: 'courses', label: '课程' },
      { id: 'materials', label: '资料' },
    ],
  },
  {
    id: 'manage',
    label: '管理',
    tabs: [
      { id: 'connections', label: '连接' },
      { id: 'automation', label: '自动化' },
      { id: 'settings', label: '设置' },
    ],
  },
]

const TABS = NAV_GROUPS.flatMap((group) => group.tabs)

const LEGACY_TABS: Record<string, TabId> = {
  dashboard: 'today',
}

function readTab(): TabId {
  try {
    const value = window.localStorage.getItem(TAB_KEY)
    const mapped = value ? (LEGACY_TABS[value] ?? value) : undefined
    if (mapped && TABS.some((tab) => tab.id === mapped)) return mapped as TabId
  } catch {
    // Local storage is only an optional UI preference.
  }
  return 'today'
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

function BackIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M15 18l-6-6 6-6" />
    </svg>
  )
}

function BellIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 8-3 8h18s-3-1-3-8" />
      <path d="M13.7 21a2 2 0 0 1-3.4 0" />
    </svg>
  )
}

interface HistoryEntry {
  tab: TabId
  nav?: NavigationContext
}

function AcademicPanel({ ctx }: { ctx: Context }) {
  const [history, setHistory] = useState<HistoryEntry[]>(() => [
    { tab: readTab() },
  ])
  const [visited, setVisited] = useState<Set<TabId>>(
    () => new Set([history[0]?.tab ?? 'today']),
  )
  const [status, setStatus] = useState<HostStatus>()
  const [statusError, setStatusError] = useState<string>()
  const shellRef = useRef<HTMLDivElement>(null)
  const scrollPositions = useRef(new Map<TabId, number>())
  const current = history[history.length - 1] ?? { tab: 'today' as const }
  const tab = current.tab
  const nav = current.nav
  const tabRef = useRef<TabId>(tab)
  tabRef.current = tab

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

  const rememberScroll = useCallback(() => {
    const shell = shellRef.current
    if (shell) scrollPositions.current.set(tabRef.current, shell.scrollTop)
  }, [])

  const restoreScroll = useCallback((next: TabId) => {
    requestAnimationFrame(() => {
      const shell = shellRef.current
      if (shell) shell.scrollTop = scrollPositions.current.get(next) ?? 0
    })
  }, [])

  const navigate = useCallback(
    (next: TabId, context?: NavigationContext) => {
      rememberScroll()
      const entry: HistoryEntry = {
        tab: next,
        ...(context ? { nav: { ...context, nonce: Date.now() } } : {}),
      }
      setHistory((entries) => [...entries, entry])
      setVisited((entries) =>
        entries.has(next) ? entries : new Set(entries).add(next),
      )
      writeTab(next)
      restoreScroll(next)
    },
    [rememberScroll, restoreScroll],
  )

  const goBack = useCallback(() => {
    rememberScroll()
    setHistory((entries) => {
      if (entries.length <= 1) return entries
      const next = entries[entries.length - 2]
      if (next) {
        writeTab(next.tab)
        restoreScroll(next.tab)
      }
      return entries.slice(0, -1)
    })
  }, [rememberScroll, restoreScroll])

  const focusTab = (id: TabId) => {
    requestAnimationFrame(() => {
      document.getElementById(`ac-tab-${id}`)?.focus()
    })
  }

  const onTabKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    const index = TABS.findIndex((entry) => entry.id === tab)
    if (index < 0) return
    let nextIndex: number | undefined
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      nextIndex = (index + 1) % TABS.length
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      nextIndex = (index - 1 + TABS.length) % TABS.length
    } else if (event.key === 'Home') {
      nextIndex = 0
    } else if (event.key === 'End') {
      nextIndex = TABS.length - 1
    }
    if (nextIndex === undefined) return
    event.preventDefault()
    const next = TABS[nextIndex]
    if (!next) return
    navigate(next.id)
    focusTab(next.id)
  }

  const ask = () => {
    askAgent(
      ctx,
      '帮我看看最近要做什么。请先查询已保存的课程、作业、考试、学习任务和计划，告诉我哪些最紧急、今天可以先做哪件事。说明建议的依据；没有查到的信息请直接说，只查询，不修改数据。',
    )
  }

  const pageProps = {
    ctx,
    onNavigate: navigate,
    nav,
  }
  const unread = status?.unreadNotifications ?? 0
  const currentLabel = TABS.find((entry) => entry.id === tab)?.label ?? '学业'

  return (
    <div
      className="ac-shell"
      ref={shellRef}
      onKeyDown={(event) => {
        if (event.key !== 'Escape') return
        const open = shellRef.current?.querySelector('details[open]')
        if (open instanceof HTMLDetailsElement) {
          open.open = false
          const summary = open.querySelector('summary')
          if (summary instanceof HTMLElement) summary.focus()
        }
      }}
    >
      <a className="ac-skip-link" href="#ac-main">
        跳到主要内容
      </a>
      <header className="ac-header">
        <div className="ac-header-title">
          <h1>学业</h1>
          <p>{currentLabel} · 课程、任务、计划与数据源</p>
        </div>
        <div className="ac-header-actions">
          {history.length > 1 && (
            <button
              type="button"
              className="ac-button ac-button-quiet"
              onClick={goBack}
              aria-label="返回上一个页面"
            >
              <BackIcon />
              返回
            </button>
          )}
          {status && (
            <Badge tone={status.plannerAvailable ? 'ok' : 'warn'}>
              {status.plannerAvailable ? '学业服务已连接' : '规划能力未加载'}
            </Badge>
          )}
          {!status && statusError && <Badge tone="bad">学业服务暂时不可用</Badge>}
          <button
            type="button"
            className="ac-reminder-button"
            aria-label={unread > 0 ? `提醒，${unread} 条未读` : '提醒'}
            onClick={() => navigate('automation', { focus: 'notifications' })}
          >
            <BellIcon />
            <span>提醒</span>
            {unread > 0 && (
              <span className="ac-reminder-count" aria-hidden="true">
                {unread > 99 ? '99+' : unread}
              </span>
            )}
          </button>
          <button
            type="button"
            className="ac-button ac-button-quiet"
            onClick={ask}
            title="打开 DSH 会话并带入只读查询提示"
          >
            咨询 Agent
          </button>
        </div>
      </header>

      <nav
        className="ac-tabs"
        role="tablist"
        aria-label="学业页面"
        onKeyDown={onTabKeyDown}
      >
        {NAV_GROUPS.map((group) => (
          <div key={group.id} className="ac-nav-group" role="presentation">
            <span className="ac-nav-group-label">{group.label}</span>
            <div className="ac-nav-group-tabs" role="presentation">
              {group.tabs.map((entry) => (
                <button
                  key={entry.id}
                  id={`ac-tab-${entry.id}`}
                  type="button"
                  role="tab"
                  aria-selected={tab === entry.id}
                  aria-controls={`ac-panel-${entry.id}`}
                  tabIndex={tab === entry.id ? 0 : -1}
                  className={
                    tab === entry.id ? 'ac-tab ac-tab-active' : 'ac-tab'
                  }
                  onClick={() => navigate(entry.id)}
                >
                  {entry.label}
                </button>
              ))}
            </div>
          </div>
        ))}
      </nav>

      <main className="ac-panel" id="ac-main" tabIndex={-1}>
        {visited.has('today') && (
          <div
            id="ac-panel-today"
            role="tabpanel"
            aria-labelledby="ac-tab-today"
            hidden={tab !== 'today'}
          >
            <DashboardPage {...pageProps} active={tab === 'today'} />
          </div>
        )}
        {visited.has('tasks') && (
          <div
            id="ac-panel-tasks"
            role="tabpanel"
            aria-labelledby="ac-tab-tasks"
            hidden={tab !== 'tasks'}
          >
            <TasksPage {...pageProps} active={tab === 'tasks'} />
          </div>
        )}
        {visited.has('plan') && (
          <div
            id="ac-panel-plan"
            role="tabpanel"
            aria-labelledby="ac-tab-plan"
            hidden={tab !== 'plan'}
          >
            <PlanPage {...pageProps} active={tab === 'plan'} />
          </div>
        )}
        {visited.has('courses') && (
          <div
            id="ac-panel-courses"
            role="tabpanel"
            aria-labelledby="ac-tab-courses"
            hidden={tab !== 'courses'}
          >
            <CoursesPage {...pageProps} active={tab === 'courses'} />
          </div>
        )}
        {visited.has('materials') && (
          <div
            id="ac-panel-materials"
            role="tabpanel"
            aria-labelledby="ac-tab-materials"
            hidden={tab !== 'materials'}
          >
            <MaterialsPage {...pageProps} active={tab === 'materials'} />
          </div>
        )}
        {visited.has('connections') && (
          <div
            id="ac-panel-connections"
            role="tabpanel"
            aria-labelledby="ac-tab-connections"
            hidden={tab !== 'connections'}
          >
            <ConnectionsPage {...pageProps} active={tab === 'connections'} />
          </div>
        )}
        {visited.has('automation') && (
          <div
            id="ac-panel-automation"
            role="tabpanel"
            aria-labelledby="ac-tab-automation"
            hidden={tab !== 'automation'}
          >
            <AutomationPage {...pageProps} active={tab === 'automation'} />
          </div>
        )}
        {visited.has('settings') && (
          <div
            id="ac-panel-settings"
            role="tabpanel"
            aria-labelledby="ac-tab-settings"
            hidden={tab !== 'settings'}
          >
            <SettingsPage {...pageProps} active={tab === 'settings'} />
          </div>
        )}
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
