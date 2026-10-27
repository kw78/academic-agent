import '@deepseek-ai/cordis'
import type { ReactNode } from 'react'

export interface RpcEnvelope {
  ok: boolean
  value?: unknown
  error?: {
    code?: string
    message?: string
  }
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    slots: {
      register(
        options: Record<string, unknown>,
        component: (props: Record<string, unknown>) => ReactNode,
      ): () => void
      inject(name: string, callback: () => unknown): () => void
    }
    connection: {
      rpc: {
        call(
          route: string,
          endpoint: string,
          payload: { args: Record<string, unknown> },
          signal?: AbortSignal,
        ): Promise<RpcEnvelope>
      }
    }
  }
}
