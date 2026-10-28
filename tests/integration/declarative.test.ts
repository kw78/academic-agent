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

const credentials: CredentialAccess = {
  getSecret: async () =>
    JSON.stringify({
      cookies: [{ name: 'sid', value: 'fixture', domain: 'lms.example.edu', path: '/' }],
    }),
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

describe('declarative adapter runtime', () => {
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

    const preview = await app.previewSourceSync('decl', connection.connectionId)
    expect(preview.counts.create).toBe(3)
    expect((await app.store.queries.listAcademicItems()).items).toHaveLength(0)

    const summary = await app.syncSource('decl', connection.connectionId)
    expect(summary.created).toBe(3)
    expect((await app.store.queries.listAcademicItems()).items).toHaveLength(3)

    const again = await app.previewSourceSync('decl', connection.connectionId)
    expect(again.counts.unchanged).toBe(3)
  })
})
