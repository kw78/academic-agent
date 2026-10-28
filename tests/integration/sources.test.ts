import { afterEach, describe, expect, it } from 'vitest'
import { createAcademicApp } from '@academic/cli'
import { InMemoryCredentialVault } from '@academic/connections'
import type { SourceEngine } from '@academic/contracts'
import { fixedClock } from '../helpers/store.js'

const cleanup: Array<() => void> = []

afterEach(() => {
  for (const dispose of cleanup.splice(0).reverse()) dispose()
})

const fakeEngine: SourceEngine = {
  descriptor: {
    id: 'fake-http',
    displayName: 'Fake HTTP',
    supportsSync: true,
    supportsLogin: false,
    supportsVerify: false,
    authKinds: ['none', 'token'],
    validateConfig(config) {
      return typeof config.baseUrl === 'string' ? undefined : 'baseUrl is required'
    },
  },
  createAdapter(context) {
    return {
      id: context.sourceId,
      sourceId: context.sourceId,
      async fetch() {
        return {
          items: [
            {
              sourceId: context.sourceId,
              externalItemId: 'fake-1',
              courseExternalId: 'FAKE101',
              kind: 'assignment' as const,
              title: 'Fake assignment',
              due: { kind: 'unknown' as const },
              contentHash: 'fake-hash',
            },
          ],
          completeness: 'full' as const,
          fetchedAt: '2026-10-27T10:00:00.000Z',
          warnings: [],
        }
      },
    }
  },
  async listCourses(context) {
    return [
      {
        sourceId: context.sourceId,
        externalCourseId: 'FAKE101',
        termId: '2026-fall',
        code: 'FAKE101',
        title: 'Fake Course',
      },
    ]
  },
}

async function setup() {
  const app = await createAcademicApp({
    databasePath: ':memory:',
    clock: fixedClock(),
    credentialVault: new InMemoryCredentialVault(),
    sourceEngines: [fakeEngine],
  })
  cleanup.push(() => app.close())
  return app
}

describe('database-backed sources', () => {
  it('seeds fixture, stores generic source configuration and rejects secrets in config', async () => {
    const app = await setup()
    const fixture = app.sources.get('fixture-lms')
    expect(fixture?.engine).toBe('fixture')
    expect(fixture?.authKind).toBe('none')

    const source = app.sources.create({
      sourceId: 'fake-source',
      engine: 'fake-http',
      displayName: 'Fake Source',
      authKind: 'none',
      capabilities: ['academic.sync'],
      config: { baseUrl: 'https://example.invalid' },
    })
    expect(source.version).toBe(1)
    expect(app.sources.list().map((entry) => entry.sourceId)).toContain('fake-source')

    expect(() =>
      app.sources.create({
        sourceId: 'bad-source',
        engine: 'fake-http',
        displayName: 'Bad',
        authKind: 'token',
        config: { token: 'must-not-be-stored' },
      }),
    ).toThrow(/must not contain credentials/)

    for (const config of [
      { sessionCookie: 'x' },
      { clientSecret: 'x' },
      { refreshToken: 'x' },
      { auth: { accessToken: 'x' } },
      { baseUrl: 'https://example.invalid/page?access_token=x' },
      { baseUrl: 'https://user:pass@example.invalid/' },
    ]) {
      expect(() =>
        app.sources.create({
          sourceId: 'variant-source',
          engine: 'fake-http',
          displayName: 'Variant',
          authKind: 'none',
          config,
        }),
      ).toThrow(/credentials|authentication parameters/)
    }

    expect(() =>
      app.sources.create({
        sourceId: 'missing-config',
        engine: 'fake-http',
        displayName: 'Missing',
        authKind: 'none',
      }),
    ).toThrow(/Source config invalid: baseUrl is required/)

    expect(() =>
      app.sources.create({
        sourceId: 'wrong-auth',
        engine: 'fake-http',
        displayName: 'Wrong auth',
        authKind: 'password',
        config: { baseUrl: 'https://example.invalid' },
      }),
    ).toThrow(/不支持认证方式/)

    const updated = app.sources.update(
      'fake-source',
      { displayName: 'Fake Source 2', config: { baseUrl: 'https://example.invalid/2' } },
      1,
    )
    expect(updated.version).toBe(2)
    expect(updated.displayName).toBe('Fake Source 2')
    expect(() => app.sources.update('fake-source', { enabled: false }, 1)).toThrow(
      /version changed/,
    )
    expect(app.sources.archive('fake-source').archived).toBe(true)
  })

  it('syncs any registered engine through the generic source path', async () => {
    const app = await setup()
    app.sources.create({
      sourceId: 'fake-source',
      engine: 'fake-http',
      displayName: 'Fake Source',
      authKind: 'none',
      capabilities: ['academic.sync'],
      config: { baseUrl: 'https://example.invalid' },
    })
    const summary = await app.syncSource('fake-source')
    expect(summary.status).toBe('success')
    expect(summary.created).toBe(1)
    const courses = await app.store.queries.listCourses()
    expect(courses.items.some((course) => course.code === 'FAKE101')).toBe(true)
    const items = await app.store.queries.listAcademicItems()
    expect(items.items.some((item) => item.title === 'Fake assignment')).toBe(true)
  })
})
