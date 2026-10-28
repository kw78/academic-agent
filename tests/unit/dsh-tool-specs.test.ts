import { describe, expect, it } from 'vitest'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { TOOL_SPECS } from '../../packages/academic-dsh-plugin/src/tools.js'

describe('DSH academic tool specs', () => {
  it('registers all specs with the real defineTool schema', () => {
    expect(TOOL_SPECS).toHaveLength(23)
    for (const spec of TOOL_SPECS) {
      expect(
        () =>
          defineTool({
            name: spec.name,
            description: spec.description,
            parameters: spec.parameters,
            output: { schema: { type: 'json' }, render: () => [] },
            timeoutMs: 30_000,
            async execute() {
              return null
            },
          }),
        spec.name,
      ).not.toThrow()
    }
  })
})
