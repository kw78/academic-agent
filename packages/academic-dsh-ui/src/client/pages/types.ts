import type { Context } from '@deepseek-ai/cordis'
import type { TaskScope } from '../../protocol.js'

export type TabId =
  | 'today'
  | 'tasks'
  | 'plan'
  | 'courses'
  | 'materials'
  | 'connections'
  | 'automation'
  | 'settings'

/**
 * Client-side navigation context. It only carries non-sensitive identifiers
 * and filter intent; the Host stays the authority for every object's state.
 */
export interface NavigationContext {
  courseId?: string
  taskId?: string
  itemId?: string
  sourceId?: string
  due?: TaskScope
  status?: 'active' | 'completed' | 'all'
  pane?: 'tasks' | 'items' | 'review'
  focus?: 'notifications' | 'sources' | 'guide'
  create?: boolean
  nonce?: number
}

export type Navigate = (tab: TabId, context?: NavigationContext) => void

export interface PageProps {
  ctx: Context
  active: boolean
  onNavigate: Navigate
  nav?: NavigationContext
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
