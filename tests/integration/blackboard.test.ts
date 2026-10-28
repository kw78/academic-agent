import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { createAcademicApp } from '@academic/cli'
import { createBlackboardEngine } from '@academic/adapter-ustc-blackboard'
import { InMemoryCredentialVault } from '@academic/connections'
import { AdapterAuthError, type CredentialAccess } from '@academic/contracts'

const cleanup: Array<() => void> = []

afterEach(() => {
  for (const dispose of cleanup.splice(0).reverse()) dispose()
})

function fixture(name: string): string {
  return readFileSync(
    fileURLToPath(new URL(`../../fixtures/blackboard/${name}`, import.meta.url)),
    'utf8',
  )
}

const config = {
  loginUrl: 'https://bb.example.edu/',
  authenticatedUrlPatterns: ['^https://bb\\.example\\.edu/'],
  cookieDomains: ['bb.example.edu'],
  portalUrl: 'https://bb.example.edu/',
  verifyUrl: 'https://bb.example.edu/webapps/portal/execute/tabs/tabAction',
  loggedOutPatterns: ['/webapps/login'],
  termFilter: ['2026FA'],
  maxCourses: 10,
  maxAssignments: 10,
  delayMs: 0,
}

const credentials: CredentialAccess = {
  getSecret: async () =>
    JSON.stringify({
      cookies: [{ name: 'sid', value: 'fixture-secret', domain: 'bb.example.edu', path: '/' }],
    }),
}

const publicResolver = async () => [{ address: '93.184.216.34', family: 4 }]

interface Router {
  fetchImpl: typeof fetch
  calls: string[]
  portal: 'ok' | 'login'
  assignments: 'ok' | 'failed' | 'fail-once'
}

function router(): Router {
  const state: Router = {
    calls: [],
    portal: 'ok',
    assignments: 'ok',
    fetchImpl: async (input) => {
      const url = String(input)
      state.calls.push(url)
      if (url === 'https://bb.example.edu/') {
        return new Response(fixture(state.portal === 'ok' ? 'portal.html' : 'login.html'), {
          status: 200,
          headers: { 'content-type': 'text/html' },
        })
      }
      if (url.includes('content_id=_8003_1')) {
        return new Response(fixture('test-8003.html'))
      }
      if (url.includes('content_id=_8002_1')) {
        return new Response(fixture('test-8002.html'))
      }
      if (url.includes('content_id=_8001_1')) {
        return new Response(fixture('test-8001.html'))
      }
      if (url.includes('content_id=_7003_1')) {
        return new Response(fixture('assignment-7003.html'))
      }
      if (url.includes('content_id=_7002_1')) {
        return new Response(fixture('assignment-7002.html'))
      }
      if (url.includes('content_id=_7001_1')) {
        return new Response(fixture('assignment-7001.html'))
      }
      if (url.includes('listContent.jsp')) {
        if (state.assignments === 'failed') {
          return new Response('server error', { status: 500 })
        }
        if (state.assignments === 'fail-once') {
          state.assignments = 'ok'
          return new Response('temporarily unavailable', { status: 503 })
        }
        if (url.includes('content_id=_5002_1') && url.includes('startIndex=2')) {
          return new Response(fixture('tests-1001-page2.html'))
        }
        if (url.includes('content_id=_5002_1')) {
          return new Response(fixture('tests-1001.html'))
        }
        if (url.includes('content_id=_5101_1')) {
          return new Response(fixture('assignment-folder-1001.html'))
        }
        if (url.includes('content_id=_5102_1')) {
          return new Response(fixture('test-folder-1001.html'))
        }
        return new Response(fixture('assignments-1001.html'))
      }
      if (url.includes('launcher?type=Course')) {
        return new Response(fixture('course-1001.html'))
      }
      return new Response('not found', { status: 404 })
    },
  }
  return state
}

function engineWith(state: Router) {
  return createBlackboardEngine({
    fetchImpl: state.fetchImpl,
    resolveHost: publicResolver,
    now: () => '2026-10-28T00:00:00.000Z',
  })
}

describe('Blackboard read-only engine', () => {
  it('lists courses and normalizes assignments through the adapter', async () => {
    const state = router()
    const engine = engineWith(state)
    const context = { sourceId: 'bb', config }

    const courses = await engine.listCourses!(context, credentials)
    expect(courses).toHaveLength(1)
    expect(courses[0]).toMatchObject({
      sourceId: 'bb',
      externalCourseId: '_1001_1',
      termId: '2026FA',
      code: 'CS101.01',
      title: 'Data Structures',
    })

    const adapter = engine.createAdapter!(context)
    const result = await adapter.fetch({ credentials })
    expect(result.completeness).toBe('full')
    expect(result.warnings).toEqual([])
    expect(result.items).toHaveLength(6)
    expect(result.fetchedAt).toBe('2026-10-28T00:00:00.000Z')
    expect(result.items[0]).toMatchObject({
      sourceId: 'bb',
      externalItemId: 'bb:_1001_1:_7001_1',
      courseExternalId: '_1001_1',
      kind: 'assignment',
      title: 'HW1',
    })
    expect(result.items[1]?.due).toEqual({
      kind: 'instant',
      utc: '2026-11-01T23:49:00.000Z',
      zone: 'Asia/Shanghai',
    })
    expect(result.items.map((item) => item.title)).toEqual([
      'HW1',
      'HW2',
      'HW3',
      'Quiz 1',
      'Final Exam',
      'Quiz 2',
    ])
    expect(result.items.map((item) => item.kind)).toEqual([
      'assignment',
      'assignment',
      'assignment',
      'quiz',
      'exam',
      'quiz',
    ])
    expect(result.items.find((item) => item.title === 'Quiz 1')?.due).toEqual({
      kind: 'instant',
      utc: '2026-11-05T06:00:00.000Z',
      zone: 'Asia/Shanghai',
    })
    expect(result.items.find((item) => item.title === 'Quiz 2')?.due).toEqual({
      kind: 'instant',
      utc: '2026-11-12T01:00:00.000Z',
      zone: 'Asia/Shanghai',
    })

    const repeated = await adapter.fetch({ credentials })
    expect(repeated.items.map((item) => item.contentHash)).toEqual(
      result.items.map((item) => item.contentHash),
    )
  })

  it('maps an expired session to AdapterAuthError', async () => {
    const state = router()
    state.portal = 'login'
    const engine = engineWith(state)
    const context = { sourceId: 'bb', config }

    await expect(engine.listCourses!(context, credentials)).rejects.toBeInstanceOf(
      AdapterAuthError,
    )
    await expect(
      engine.createAdapter!(context).fetch({ credentials }),
    ).rejects.toBeInstanceOf(AdapterAuthError)
  })

  it('keeps partial results when one page fails', async () => {
    const state = router()
    state.assignments = 'failed'
    const engine = engineWith(state)
    const result = await engine.createAdapter!({ sourceId: 'bb', config }).fetch({
      credentials,
    })
    expect(result.completeness).toBe('partial')
    expect(result.items).toHaveLength(0)
    expect(result.warnings.join(' ')).toContain('内容页读取失败')
  })

  it('syncs through Connector/Kernel and is idempotent', async () => {
    const state = router()
    const app = await createAcademicApp({
      databasePath: ':memory:',
      credentialVault: new InMemoryCredentialVault(),
      sourceEngines: [engineWith(state)],
    })
    cleanup.push(() => app.close())
    app.sources.create({
      sourceId: 'bb',
      engine: 'blackboard',
      displayName: 'Blackboard',
      authKind: 'token',
      loginMode: 'browser',
      capabilities: ['academic.sync'],
      config,
    })
    const connection = app.connections.create({
      sourceId: 'bb',
      displayName: 'Blackboard',
      authKind: 'token',
    })
    await app.connections.setSecret(connection.connectionId, await credentials.getSecret())
    await app.connections.verify(connection.connectionId, async () => ({ ok: true }))

    const preview = await app.previewSourceSync('bb', connection.connectionId)
    expect(preview.counts).toEqual({
      create: 6,
      update: 0,
      unchanged: 0,
      skip: 0,
      missing: 0,
    })
    expect(preview.completeness).toBe('full')
    expect((await app.store.queries.listAcademicItems()).items).toHaveLength(0)

    const first = await app.syncSource('bb', connection.connectionId)
    expect(first.status).toBe('success')
    expect(first.created).toBe(6)

    const repeatedPreview = await app.previewSourceSync('bb', connection.connectionId)
    expect(repeatedPreview.counts).toEqual({
      create: 0,
      update: 0,
      unchanged: 6,
      skip: 0,
      missing: 0,
    })

    const courses = await app.store.queries.listCourses()
    expect(courses.items.map((course) => course.code)).toContain('CS101.01')
    const items = await app.store.queries.listAcademicItems()
    expect(items.items.map((item) => item.title).sort()).toEqual([
      'Final Exam',
      'HW1',
      'HW2',
      'HW3',
      'Quiz 1',
      'Quiz 2',
    ])

    const second = await app.syncSource('bb', connection.connectionId)
    expect(second.status).toBe('success')
    expect(second.created).toBe(0)
    expect(second.updated).toBe(0)

    state.assignments = 'fail-once'
    const retried = await app.syncSource('bb', connection.connectionId)
    expect(retried.status).toBe('success')
    expect(state.assignments).toBe('ok')

    state.portal = 'login'
    await expect(app.syncSource('bb', connection.connectionId)).rejects.toBeInstanceOf(
      AdapterAuthError,
    )
    expect(app.connections.get(connection.connectionId)?.status).toBe('auth-required')
  })
})
