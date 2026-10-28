import { afterEach, describe, expect, it } from 'vitest'
import { Context, Service } from '@deepseek-ai/cordis'
import {
  COMMAND,
  newId,
  parseCommand,
  PLANNER_CAPABILITY_ID,
} from '@academic/contracts'
import { AcademicAppService } from '../../packages/academic-dsh-plugin/src/host.js'
import {
  apply as applyPlanner,
  inject as plannerInject,
  name as plannerName,
} from '../../packages/academic-dsh-plugin/src/planner.js'
import {
  apply as applyTools,
  inject as toolsInject,
  name as toolsName,
} from '../../packages/academic-dsh-plugin/src/tools.js'

let fakeToolsInstance: FakeTools

class FakeTools extends Service {
  readonly definitions = new Map<string, unknown>()

  constructor(ctx: Context) {
    super(ctx, 'tools')
    fakeToolsInstance = this
  }

  register(definition: unknown): () => void {
    const name = (definition as { name?: string }).name ?? `tool-${this.definitions.size}`
    this.definitions.set(name, definition)
    return () => {
      this.definitions.delete(name)
    }
  }

  get(name: string): unknown {
    return this.definitions.get(name)
  }

  async execute(): Promise<{ isError: boolean; value?: unknown }> {
    return { isError: false, value: {} }
  }
}

const cleanup: Array<() => Promise<void>> = []

afterEach(async () => {
  for (const dispose of cleanup.splice(0).reverse()) await dispose()
})

describe('R3 Cordis plugin lifecycle', () => {
  it('unloads tools and planner independently while host state survives', async () => {
    const ctx = new Context()
    const fakeToolsFiber = await ctx.plugin(FakeTools)
    const fakeTools = fakeToolsInstance
    const host = await ctx.plugin(AcademicAppService, {
      databasePath: ':memory:',
      startBackground: false,
      logLoad: false,
    })
    cleanup.push(async () => {
      await host.dispose()
      await fakeToolsFiber.dispose()
      await ctx.fiber.dispose()
    })

    const app = await ctx.academicApp.appReady
    const range = {
      start: '2026-11-01T00:00:00.000Z',
      end: '2026-11-02T00:00:00.000Z',
    }
    await app.store.commands.execute(
      parseCommand({
        commandId: newId(),
        type: COMMAND.StudyPlanAccept,
        aggregateId: newId(),
        expectedVersion: 0,
        actor: { kind: 'user', id: 'lifecycle-test' },
        correlationId: newId(),
        payload: {
          range,
          blocks: [],
          planner: { id: PLANNER_CAPABILITY_ID, version: '1.0.0' },
        },
      }),
    )

    const planner = await ctx.plugin(
      { name: plannerName, inject: plannerInject, apply: applyPlanner },
      { log: false },
    )
    const tools = await ctx.plugin(
      { name: toolsName, inject: toolsInject, apply: applyTools },
      { logLoad: false, selfTest: false },
    )
    expect(app.registry.get(PLANNER_CAPABILITY_ID)).toBeDefined()
    expect(fakeTools.definitions.size).toBe(19)

    await tools.dispose()
    expect(fakeTools.definitions.size).toBe(0)
    expect(app.registry.get(PLANNER_CAPABILITY_ID)).toBeDefined()
    expect(await app.store.queries.getActiveStudyPlan(range)).toBeDefined()
    expect(app.store.health()).toMatchObject({ consistent: true })

    await planner.dispose()
    expect(app.registry.get(PLANNER_CAPABILITY_ID)).toBeUndefined()
    expect(await app.store.queries.getActiveStudyPlan(range)).toBeDefined()

    const toolsReloaded = await ctx.plugin(
      { name: toolsName, inject: toolsInject, apply: applyTools },
      { logLoad: false, selfTest: false },
    )
    const plannerReloaded = await ctx.plugin(
      { name: plannerName, inject: plannerInject, apply: applyPlanner },
      { log: false },
    )
    expect(fakeTools.definitions.size).toBe(19)
    expect(app.registry.get(PLANNER_CAPABILITY_ID)).toBeDefined()
    await toolsReloaded.dispose()
    await plannerReloaded.dispose()

    await host.dispose()
    expect(app.registry.get(PLANNER_CAPABILITY_ID)).toBeUndefined()
    expect(fakeTools.definitions.size).toBe(0)
  })
})
