declare module '@deepseek-ai/cordis' {
  export interface Context {
    tools: {
      register(definition: unknown): () => void
      get(name: string): unknown
      execute(input: {
        callId: string
        name: string
        arguments: unknown
        signal: AbortSignal
      }): Promise<{
        isError: boolean
        value?: unknown
        error?: { message?: string }
      }>
    }
    effect(
      execute: () => (() => void) | Promise<() => void>,
      label?: string,
    ): unknown
  }
}

declare module '@deepseek-ai/dsh-tools' {
  export function defineTool(options: {
    name: string
    description: string
    parameters: Record<string, unknown>
    output: {
      schema: unknown
      render(args: unknown, value: unknown): Array<{ type: 'text'; text: string }>
    }
    timeoutMs?: number
    execute(
      args: Record<string, unknown>,
      exec: { signal: AbortSignal },
    ): Promise<unknown>
  }): unknown
}
