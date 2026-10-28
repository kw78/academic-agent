import { afterEach, describe, expect, it } from 'vitest'
import { createAcademicApp } from '@academic/cli'
import { InMemoryCredentialVault } from '@academic/connections'
import {
  AdapterTransientError,
  type SourceEngine,
} from '@academic/contracts'

const cleanup: Array<() => void> = []

afterEach(() => {
  for (const dispose of cleanup.splice(0).reverse()) dispose()
})

function emptyAdapter(sourceId: string, wait?: Promise<void>): SourceEngine['createAdapter'] {
  return (context) => ({
    id: 'test.readonly',
    sourceId: context.sourceId,
    async fetch() {
      if (wait) await wait
      return {
        items: [],
        completeness: 'full' as const,
        fetchedAt: '2026-10-28T00:00:00.000Z',
        warnings: [],
      }
    },
  })
}

async function appWith(engine: SourceEngine) {
  const app = await createAcademicApp({
    databasePath: ':memory:',
    credentialVault: new InMemoryCredentialVault(),
    sourceEngines: [engine],
  })
  cleanup.push(() => app.close())
  app.sources.create({
    sourceId: 'slow',
    engine: engine.descriptor.id,
    displayName: 'Slow source',
    authKind: 'none',
  })
  return app
}

describe('sync stability controls', () => {
  it('rejects a second concurrent sync for the same source', async () => {
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const engine: SourceEngine = {
      descriptor: {
        id: 'slow',
        displayName: 'Slow',
        supportsSync: true,
        supportsLogin: false,
        supportsVerify: false,
        authKinds: ['none'],
      },
      async listCourses() {
        return []
      },
      createAdapter: emptyAdapter('x', gate),
    }
    const app = await appWith(engine)
    const first = app.syncSource('slow')
    await new Promise((resolve) => setTimeout(resolve, 10))
    await expect(app.syncSource('slow')).rejects.toThrow(/already running/)
    release()
    const summary = await first
    expect(summary.status).toBe('success')
  })

  it('retries transient failures during course discovery', async () => {
    let attempts = 0
    const engine: SourceEngine = {
      descriptor: {
        id: 'slow',
        displayName: 'Slow',
        supportsSync: true,
        supportsLogin: false,
        supportsVerify: false,
        authKinds: ['none'],
      },
      async listCourses() {
        attempts += 1
        if (attempts === 1) throw new AdapterTransientError('temporary')
        return []
      },
      createAdapter: emptyAdapter('x'),
    }
    const app = await appWith(engine)
    const summary = await app.syncSource('slow')
    expect(summary.status).toBe('success')
    expect(attempts).toBe(2)
  })
})
