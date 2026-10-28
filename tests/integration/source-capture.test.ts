import { afterEach, describe, expect, it } from 'vitest'
import { createAcademicApp } from '@academic/cli'
import { InMemoryCredentialVault } from '@academic/connections'
import type { SourceCaptureSession } from '@academic/contracts'
import { fixedClock } from '../helpers/store.js'

const cleanup: Array<() => void> = []

afterEach(() => {
  for (const dispose of cleanup.splice(0).reverse()) dispose()
})

const config = {
  loginUrl: 'https://lms.example.edu/login',
  authenticatedUrlPatterns: ['^https://lms\\.example\\.edu/'],
  cookieDomains: ['lms.example.edu'],
}

function session(): SourceCaptureSession {
  const courseList = [
    { courseId: 'C1', courseName: '高等数学' },
    { courseId: 'C2', courseName: '大学物理' },
  ]
  return {
    secret: JSON.stringify({
      cookies: [
        { name: 'sid', value: 'lms-session', domain: 'lms.example.edu', path: '/' },
        { name: 'mooc', value: 'api-session', domain: 'mooc1.lms.example.edu', path: '/' },
      ],
    }),
    captures: [
      {
        url: 'https://lms.example.edu/api/courses?token=abc',
        method: 'GET',
        status: 200,
        body: JSON.stringify(courseList),
        contentType: 'application/json',
        headerNames: ['accept', 'x-requested-with', 'cookie'],
      },
      {
        url: 'https://lms.example.edu/api/assignments?page=1',
        method: 'GET',
        status: 200,
        body: JSON.stringify([{ id: 'A1', title: '作业一', courseId: 'C1' }]),
        contentType: 'application/json',
        headerNames: ['accept'],
      },
      {
        url: 'https://lms.example.edu/api/assignments?page=2',
        method: 'GET',
        status: 200,
        body: JSON.stringify([{ id: 'A2', title: '作业二', courseId: 'C2' }]),
        contentType: 'application/json',
        headerNames: ['accept'],
      },
    ],
    hosts: ['lms.example.edu', 'mooc1.lms.example.edu'],
    visited: 12,
    startedAt: '2026-10-28T10:00:00.000Z',
    finishedAt: '2026-10-28T10:03:00.000Z',
    warnings: [],
  }
}

async function setup() {
  const app = await createAcademicApp({
    databasePath: ':memory:',
    clock: fixedClock(),
    credentialVault: new InMemoryCredentialVault(),
    browserCaptureImpl: async () => session(),
  })
  cleanup.push(() => app.close())
  app.sources.create({
    sourceId: 'lms',
    engine: 'browser-session',
    displayName: 'LMS',
    authKind: 'token',
    loginMode: 'browser',
    config,
  })
  return app
}

describe('guided source capture', () => {
  it('records endpoints, refreshes the session and widens cookie domains', async () => {
    const app = await setup()

    const summary = await app.captureSource('lms')

    expect(summary.sourceId).toBe('lms')
    expect(summary.endpoints.length).toBe(3)
    expect(summary.endpoints.every((entry) => entry.kind === 'list')).toBe(true)
    const courses = summary.endpoints.find((entry) =>
      entry.path.includes('/api/courses'),
    )
    expect(courses?.url).toContain('token=***')
    expect(courses?.response.collectionPath).toBe('$')
    expect(summary.suggested.cookieDomains).toContain('mooc1.lms.example.edu')

    const assignments = summary.endpoints.find((entry) =>
      entry.path.includes('/api/assignments'),
    )
    expect(assignments?.pagination).toEqual({ param: 'page', values: ['1', '2'] })

    const source = app.sources.get('lms')!
    expect(source.config.cookieDomains).toEqual([
      'lms.example.edu',
      'mooc1.lms.example.edu',
    ])

    const connection = app.connections
      .list()
      .find((entry) => entry.sourceId === 'lms')
    expect(connection?.hasCredential).toBe(true)
    expect(app.latestCapture('lms')?.captureId).toBe(summary.captureId)
  })

  it('exposes the inventory to the agent as a read-only tool', async () => {
    const app = await setup()

    const missing = await app.agentBridge.host.call(
      'academic_list_capture_endpoints',
      { sourceId: 'lms' },
    )
    expect(missing.ok).toBe(false)

    await app.captureSource('lms')
    const result = await app.agentBridge.host.call(
      'academic_list_capture_endpoints',
      { sourceId: 'lms' },
    )
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error(result.message)
    const data = result.data as {
      capture: { endpoints: Array<{ sampleId: string }> }
    }
    expect(data.capture.endpoints).toHaveLength(3)
    expect(data.capture.endpoints.every((entry) => entry.sampleId)).toBe(true)
  })
})
