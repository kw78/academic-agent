import '@deepseek-ai/cordis'

declare module '@deepseek-ai/cordis' {
  interface Context {
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
  }
}
