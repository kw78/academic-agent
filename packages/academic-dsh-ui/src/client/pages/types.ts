import type { Context } from '@deepseek-ai/cordis'

export type TabId =
  | 'dashboard'
  | 'tasks'
  | 'plan'
  | 'connections'
  | 'automation'
  | 'settings'

export interface PageProps {
  ctx: Context
  active: boolean
  onNavigate: (tab: TabId) => void
}

export interface WorkspaceNavigation {
  startSession(
    workspaceId?: string,
    options?: { prompt?: string; clearPreviousDraft?: boolean },
  ): void
}

export function askAgent(ctx: Context, prompt: string): boolean {
  try {
    const workspace = (
      ctx as unknown as { get?: (name: string) => unknown }
    ).get?.('uiWorkspace') as WorkspaceNavigation | undefined
    if (!workspace?.startSession) return false
    workspace.startSession(undefined, { prompt })
    return true
  } catch {
    return false
  }
}
