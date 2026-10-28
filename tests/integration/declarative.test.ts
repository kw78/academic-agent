import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { createAcademicApp } from '@academic/cli'
import { InMemoryCredentialVault } from '@academic/connections'
import {
  AdapterAuthError,
  type CredentialAccess,
} from '@academic/contracts'
import {
  ManifestRegistry,
  createDeclarativeEngine,
  type AdapterManifest,
} from '@academic/adapter-runtime'

const cleanup: Array<() => void> = []

afterEach(() => {
  for (const dispose of cleanup.splice(0).reverse()) dispose()
})

function fixture(name: string): string {
  return readFileSync(
    fileURLToPath(new URL(`../../fixtures/declarative/${name}`, import.meta.url)),
    'utf8',
  )
}

const jsonManifest = {
  schemaVersion: 1,
  adapterId: 'demo-json',
  version: '1.0.0',
  displayName: 'Demo JSON',
  baseUrl: 'https://lms.example.edu/',
  allowedOrigins: ['lms.example.edu'],
  allowedPathPrefixes: ['/api/'],
  timeZone: 'Asia/Shanghai',
  utcOffsetMinutes: 480,
  courses: {
    url: '/api/courses',
    responseType: 'json',
    items: 'data',
    fields: {
      externalCourseId: { path: 'id' },
      code: { path: 'code' },
      title: { path: 'title' },
      termId: { path: 'term' },
    },
  },
  assignments: {
    url: '/api/courses/{{course.externalCourseId}}/assignments',
    responseType: 'json',
    items: 'data',
    fields: {
      externalItemId: { path: 'id' },
      title: { path: 'title' },
      sourceUrl: { path: 'url' },
    },
    next: 'next',
    maxPages: 2,
  },
  detail: {
    url: '/api/assignments/{{assignment.externalItemId}}',
    responseType: 'json',
    items: '$',
    fields: {
      title: { path: 'title' },
      due: { path: 'due' },
      description: { path: 'description' },
      kind: { path: 'kind' },
    },
  },
} as const

const htmlManifest = {
  schemaVersion: 1,
  adapterId: 'demo-html',
  version: '1.0.0',
  displayName: 'Demo HTML',
  baseUrl: 'https://lms.example.edu/',
  allowedOrigins: ['lms.example.edu'],
  allowedPathPrefixes: ['/portal.html', '/course/', '/assignment/'],
  timeZone: 'Asia/Shanghai',
  utcOffsetMinutes: 480,
  courses: {
    url: '/portal.html',
    responseType: 'html',
    items: 'article.course',
    fields: {
      externalCourseId: { selector: 'a', attribute: 'data-id' },
      code: { selector: '.code' },
      title: { selector: '.title' },
      termId: { selector: '.term' },
    },
  },
  assignments: {
    url: '/course/{{course.externalCourseId}}.html',
    responseType: 'html',
    items: 'li.assignment',
    fields: {
      externalItemId: { selector: 'a', attribute: 'data-id' },
      title: { selector: '.title' },
      sourceUrl: { selector: 'a', attribute: 'href' },
    },
  },
  detail: {
    url: '/assignment/{{assignment.externalItemId}}.html',
    responseType: 'html',
    items: 'body',
    fields: {
      title: { selector: '#title' },
      due: { selector: '#due' },
      description: { selector: '#description' },
    },
  },
} as const

const jwManifest = {
  schemaVersion: 1,
  adapterId: 'ustc-jw-exam',
  version: '1.0.0',
  displayName: 'USTC 综合教务系统 · 考试',
  baseUrl: 'https://jw.example.edu/',
  allowedOrigins: ['jw.example.edu'],
  allowedPathPrefixes: ['/for-std/'],
  timeZone: 'Asia/Shanghai',
  utcOffsetMinutes: 480,
  courses: {
    url: '/for-std/exam-arrange',
    responseType: 'html',
    items: 'table.table tbody tr',
    fields: {
      externalCourseId: { selector: 'td:nth-child(1)' },
      code: { selector: 'td:nth-child(1)' },
      title: { selector: 'td:nth-child(3)' },
      termId: { constant: '2026FA' },
    },
  },
  assignments: {
    url: '/for-std/exam-arrange',
    responseType: 'html',
    items: 'table.table tbody tr',
    fields: {
      courseExternalId: { selector: 'td:nth-child(1)' },
      courseName: { selector: 'td:nth-child(3)' },
      examType: { selector: 'td:nth-child(2)' },
      dateTime: { selector: 'td:nth-child(4)' },
      room: { selector: 'td:nth-child(5)' },
      externalItemId: { template: '{{courseExternalId}}:{{dateTime}}' },
      title: { template: '{{courseName}} · {{examType}}' },
      description: { template: '考场：{{room}}' },
      kind: { constant: 'exam' },
      due: {
        selector: 'td:nth-child(4)',
        regex: '(\\d{4}-\\d{2}-\\d{2} \\d{2}:\\d{2})',
      },
      sourceUrl: { constant: 'https://jw.example.edu/for-std/exam-arrange' },
    },
  },
} as const

const credentials: CredentialAccess = {
  getSecret: async () =>
    JSON.stringify({
      cookies: [{ name: 'sid', value: 'fixture', domain: 'lms.example.edu', path: '/' }],
    }),
}

const jwCredentials: CredentialAccess = {
  getSecret: async () =>
    JSON.stringify({
      cookies: [
        {
          name: 'sid',
          value: 'fixture',
          domain: 'jw.example.edu',
          path: '/',
        },
      ],
    }),
}

const jwConfig = {
  loginUrl: 'https://jw.example.edu/login',
  authenticatedUrlPatterns: ['^https://jw\\.example\\.edu/'],
  cookieDomains: ['jw.example.edu'],
  manifestId: 'ustc-jw-exam',
  termFilter: ['2026FA'],
  maxCourses: 10,
  maxAssignments: 10,
  delayMs: 0,
}

const publicResolver = async () => [{ address: '93.184.216.34', family: 4 }]

interface Router {
  fetchImpl: typeof fetch
  failAuth: boolean
}

function router(): Router {
  const state: Router = {
    failAuth: false,
    fetchImpl: async (input) => {
      if (state.failAuth) return new Response('unauthorized', { status: 401 })
      const url = new URL(String(input))
      const key = `${url.pathname}${url.search}`
      const fixtures: Record<string, string> = {
        '/api/courses': 'courses.json',
        '/api/courses/C1/assignments': 'assignments.json',
        '/api/courses/C1/assignments?page=2': 'assignments-page2.json',
        '/api/assignments/A1': 'detail-A1.json',
        '/api/assignments/A2': 'detail-A2.json',
        '/api/assignments/A3': 'detail-A3.json',
        '/for-std/exam-arrange': 'ustc-jw-exam.html',
        '/portal.html': 'portal.html',
        '/course/C1.html': 'assignments.html',
        '/assignment/A1.html': 'detail-A1.html',
        '/assignment/A2.html': 'detail-A2.html',
      }
      const name = fixtures[key]
      if (!name) return new Response('not found', { status: 404 })
      return new Response(fixture(name))
    },
  }
  return state
}

function configFor(manifestId: string) {
  return {
    loginUrl: 'https://lms.example.edu/login',
    authenticatedUrlPatterns: ['^https://lms\\.example\\.edu/'],
    cookieDomains: ['lms.example.edu'],
    manifestId,
    termFilter: ['2026FA'],
    maxCourses: 10,
    maxAssignments: 10,
    delayMs: 0,
  }
}

function engineFor(manifest: unknown, state: Router) {
  const registry = new ManifestRegistry()
  registry.register(manifest)
  return createDeclarativeEngine(registry, {
    fetchImpl: state.fetchImpl,
    resolveHost: publicResolver,
    now: () => '2026-10-28T00:00:00.000Z',
  })
}

function jsonSamples() {
  return [
    { url: 'https://lms.example.edu/api/courses', body: fixture('courses-one.json') },
    {
      url: 'https://lms.example.edu/api/courses/C1/assignments',
      body: fixture('assignments.json'),
    },
    {
      url: 'https://lms.example.edu/api/courses/C1/assignments?page=2',
      body: fixture('assignments-page2.json'),
    },
    { url: 'https://lms.example.edu/api/assignments/A1', body: fixture('detail-A1.json') },
    { url: 'https://lms.example.edu/api/assignments/A2', body: fixture('detail-A2.json') },
    { url: 'https://lms.example.edu/api/assignments/A3', body: fixture('detail-A3.json') },
  ]
}

describe('declarative adapter runtime', () => {
  it('fetches source-scoped assignments once for every course', async () => {
    const calls: string[] = []
    const fetchImpl: typeof fetch = async (input) => {
      const url = new URL(String(input))
      calls.push(url.pathname)
      const body =
        url.pathname === '/api/courses'
          ? JSON.stringify({
              data: [
                { id: 'C1', code: 'CS101', title: 'Data Structures', term: '2026FA' },
                { id: 'C2', code: 'MA101', title: 'Calculus', term: '2026FA' },
              ],
            })
          : url.pathname === '/api/all-assignments'
            ? JSON.stringify({
                data: [
                  { id: 'A1', title: 'HW1', courseId: 'C1' },
                  { id: 'A2', title: 'HW2', courseId: 'C2' },
                ],
              })
            : undefined
      return body
        ? new Response(body, { headers: { 'content-type': 'application/json' } })
        : new Response('not found', { status: 404 })
    }
    const manifest = {
      ...jsonManifest,
      adapterId: 'demo-source-scope',
      assignments: {
        url: '/api/all-assignments',
        responseType: 'json',
        scope: 'source',
        items: 'data',
        fields: {
          externalItemId: { path: 'id' },
          title: { path: 'title' },
          courseExternalId: { path: 'courseId' },
        },
      },
      detail: undefined,
    }
    const registry = new ManifestRegistry()
    registry.register(manifest)
    const engine = createDeclarativeEngine(registry, {
      fetchImpl,
      resolveHost: publicResolver,
      now: () => '2026-10-28T00:00:00.000Z',
    })
    const result = await engine
      .createAdapter!({ sourceId: 'decl', config: configFor('demo-source-scope') })
      .fetch({ credentials })

    expect(result.completeness).toBe('full')
    expect(result.items.map((item) => item.courseExternalId)).toEqual(['C1', 'C2'])
    expect(calls.filter((path) => path === '/api/all-assignments')).toHaveLength(1)
  })

  it('reads JSON courses, paginates assignments and normalizes details', async () => {
    const state = router()
    const engine = engineFor(jsonManifest, state)
    const context = { sourceId: 'decl', config: configFor('demo-json') }

    const courses = await engine.listCourses!(context, credentials)
    expect(courses).toEqual([
      {
        sourceId: 'decl',
        externalCourseId: 'C1',
        termId: '2026FA',
        code: 'CS101',
        title: 'Data Structures',
      },
    ])

    const result = await engine.createAdapter!(context).fetch({ credentials })
    expect(result.completeness).toBe('full')
    expect(result.items.map((item) => item.title)).toEqual([
      'Problem Set 1',
      'Problem Set 2',
      'Problem Set 3',
    ])
    expect(result.items[0]?.due).toEqual({
      kind: 'instant',
      utc: '2026-11-01T23:49:00.000Z',
      zone: 'Asia/Shanghai',
    })
    expect(result.items[1]?.due).toEqual({
      kind: 'local-date',
      date: '2026-11-10',
      zone: 'Asia/Shanghai',
    })
    expect(result.items[0]?.sourceUrl).toBe('https://lms.example.edu/assignment/A1.html')
  })

  it('stops when total response size exceeds the configured limit', async () => {
    const registry = new ManifestRegistry()
    registry.register(jsonManifest)
    const engine = createDeclarativeEngine(registry, {
      fetchImpl: async () =>
        new Response(`${fixture('courses-one.json')}${' '.repeat(11_000)}`),
      resolveHost: publicResolver,
    })
    const context = {
      sourceId: 'decl',
      config: { ...configFor('demo-json'), maxBytes: 10_000 },
    }
    await expect(engine.listCourses!(context)).rejects.toThrow(/总大小/)
  })

  it('reads HTML rows through selectors and resolves relative source URLs', async () => {
    const state = router()
    const engine = engineFor(htmlManifest, state)
    const result = await engine.createAdapter!({
      sourceId: 'decl',
      config: configFor('demo-html'),
    }).fetch({ credentials })
    expect(result.completeness).toBe('full')
    expect(result.items).toHaveLength(2)
    expect(result.items[0]).toMatchObject({
      title: 'Problem Set 1',
      sourceUrl: 'https://lms.example.edu/assignment/A1.html',
    })
    expect(result.items[0]?.due.kind).toBe('instant')
    expect(result.items[1]?.due).toEqual({
      kind: 'local-date',
      date: '2026-11-10',
      zone: 'Asia/Shanghai',
    })
  })

  it('maps a second platform exam table through constants and templates', async () => {
    const state = router()
    const engine = engineFor(jwManifest, state)
    const context = { sourceId: 'jw', config: jwConfig }

    const courses = await engine.listCourses!(context, jwCredentials)
    expect(courses).toEqual([
      {
        sourceId: 'jw',
        externalCourseId: 'CS101.01',
        termId: '2026FA',
        code: 'CS101.01',
        title: '数据结构',
      },
    ])

    const result = await engine.createAdapter!(context).fetch({
      credentials: jwCredentials,
    })
    expect(result.completeness).toBe('full')
    expect(result.items).toHaveLength(2)
    expect(result.items[0]).toMatchObject({
      kind: 'exam',
      title: '数据结构 · 期末考试',
      description: '考场：3A101',
      externalItemId: 'CS101.01:2026-12-20 09:00~11:00',
    })
    expect(result.items[0]?.due).toEqual({
      kind: 'instant',
      utc: '2026-12-20T01:00:00.000Z',
      zone: 'Asia/Shanghai',
    })

    const app = await createAcademicApp({
      databasePath: ':memory:',
      credentialVault: new InMemoryCredentialVault(),
      sourceEngines: [engine],
    })
    cleanup.push(() => app.close())
    app.sources.create({
      sourceId: 'jw',
      engine: 'declarative',
      displayName: 'USTC 教务考试',
      authKind: 'token',
      loginMode: 'browser',
      capabilities: ['academic.sync'],
      config: jwConfig,
    })
    const connection = app.connections.create({
      sourceId: 'jw',
      displayName: 'USTC 教务考试',
      authKind: 'token',
    })
    await app.connections.setSecret(
      connection.connectionId,
      await jwCredentials.getSecret(),
    )
    await expect(
      app.syncSource('jw', connection.connectionId),
    ).rejects.toThrow(/验证连接/)
    await app.connections.verify(connection.connectionId, async () => ({ ok: true }))
    const preview = await app.previewSourceSync('jw', connection.connectionId)
    expect(preview.counts.create).toBe(2)
    const first = await app.syncSource('jw', connection.connectionId)
    expect(first).toMatchObject({ status: 'success', created: 2 })
    const again = await app.previewSourceSync('jw', connection.connectionId)
    expect(again.counts.unchanged).toBe(2)
    const second = await app.syncSource('jw', connection.connectionId)
    expect(second).toMatchObject({ status: 'success', created: 0, updated: 0 })
  })

  it('maps an unauthorized response to AdapterAuthError', async () => {
    const state = router()
    state.failAuth = true
    const engine = engineFor(jsonManifest, state)
    await expect(
      engine.createAdapter!({
        sourceId: 'decl',
        config: configFor('demo-json'),
      }).fetch({ credentials }),
    ).rejects.toBeInstanceOf(AdapterAuthError)
  })

  it('syncs declarative items through Connector/Kernel and previews first', async () => {
    const state = router()
    const app = await createAcademicApp({
      databasePath: ':memory:',
      credentialVault: new InMemoryCredentialVault(),
      sourceEngines: [engineFor(jsonManifest, state)],
    })
    cleanup.push(() => app.close())
    const config = configFor('demo-json')
    app.sources.create({
      sourceId: 'decl',
      engine: 'declarative',
      displayName: 'Declarative',
      authKind: 'token',
      loginMode: 'browser',
      capabilities: ['academic.sync'],
      config,
    })
    const connection = app.connections.create({
      sourceId: 'decl',
      displayName: 'Declarative',
      authKind: 'token',
    })
    await app.connections.setSecret(connection.connectionId, await credentials.getSecret())
    await app.connections.verify(connection.connectionId, async () => ({ ok: true }))

    const preview = await app.previewSourceSync('decl', connection.connectionId)
    expect(preview.counts.create).toBe(3)
    expect((await app.store.queries.listAcademicItems()).items).toHaveLength(0)

    const summary = await app.syncSource('decl', connection.connectionId)
    expect(summary.created).toBe(3)
    expect((await app.store.queries.listAcademicItems()).items).toHaveLength(3)

    const again = await app.previewSourceSync('decl', connection.connectionId)
    expect(again.counts.unchanged).toBe(3)
  })

  it('registers and activates an AI-style manifest candidate before syncing', async () => {
    const state = router()
    const registry = new ManifestRegistry()
    const app = await createAcademicApp({
      databasePath: ':memory:',
      credentialVault: new InMemoryCredentialVault(),
      manifestRegistry: registry,
      sourceEngines: [
        createDeclarativeEngine(registry, {
          fetchImpl: state.fetchImpl,
          resolveHost: publicResolver,
          now: () => '2026-10-28T00:00:00.000Z',
        }),
      ],
    })
    cleanup.push(() => app.close())

    const registered = await app.adapterCandidates.register(
      jsonManifest,
      jsonSamples(),
    )
    expect(registered.report.ok).toBe(true)
    expect(registered.summary.status).toBe('validated')
    expect(registry.get('demo-json')).toBeUndefined()

    app.adapterCandidates.activate('demo-json', '1.0.0')
    expect(registry.get('demo-json')?.version).toBe('1.0.0')

    const config = configFor('demo-json')
    app.sources.create({
      sourceId: 'decl',
      engine: 'declarative',
      displayName: 'Declarative',
      authKind: 'token',
      loginMode: 'browser',
      capabilities: ['academic.sync'],
      config,
    })
    const connection = app.connections.create({
      sourceId: 'decl',
      displayName: 'Declarative',
      authKind: 'token',
    })
    await app.connections.setSecret(connection.connectionId, await credentials.getSecret())
    await app.connections.verify(connection.connectionId, async () => ({ ok: true }))
    const summary = await app.syncSource('decl', connection.connectionId)
    expect(summary.created).toBe(3)
  })
})
