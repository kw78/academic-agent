import type { DisposableRegistration } from '@academic/contracts'
import type { AcademicTool, AcademicToolDependencies, ToolResult } from './tools.js'
import { createAcademicTools } from './tools.js'

export interface AcademicToolHost {
  register(tool: AcademicTool): DisposableRegistration
}

export class InMemoryToolHost implements AcademicToolHost {
  readonly #tools = new Map<string, AcademicTool>()

  register(tool: AcademicTool): DisposableRegistration {
    if (this.#tools.has(tool.name)) {
      throw new Error(`Tool already registered: ${tool.name}`)
    }
    this.#tools.set(tool.name, tool)
    let disposed = false
    return {
      dispose: () => {
        if (disposed) return
        disposed = true
        this.#tools.delete(tool.name)
      },
    }
  }

  list(): AcademicTool[] {
    return [...this.#tools.values()]
  }

  async call(name: string, input: unknown): Promise<ToolResult> {
    const tool = this.#tools.get(name)
    if (!tool) {
      return { ok: false, code: 'NOT_FOUND', message: `Unknown tool: ${name}` }
    }
    return tool.execute(input)
  }
}

export interface AcademicToolRegistration {
  tools: AcademicTool[]
  dispose(): void
}

export function registerAcademicTools(
  host: AcademicToolHost,
  dependencies: AcademicToolDependencies,
): AcademicToolRegistration {
  const tools = createAcademicTools(dependencies)
  const registrations = tools.map((tool) => host.register(tool))
  return {
    tools,
    dispose: () => {
      for (const registration of registrations) registration.dispose()
    },
  }
}
