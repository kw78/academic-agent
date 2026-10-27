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
