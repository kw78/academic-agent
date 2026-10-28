import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import type { AdapterSample } from '@academic/contracts'
import {
  AdapterCandidateService,
  ManifestRegistry,
  ManifestStore,
  replayManifest,
} from '../src/index.js'
import { createTestStore, fixedClock } from '../../../tests/helpers/store.js'

const cleanup: Array<() => void> = []

afterEach(() => {
  for (const dispose of cleanup.splice(0).reverse()) dispose()
})

function fixture(name: string): string {
  return readFileSync(
    fileURLToPath(new URL(`../../../fixtures/declarative/${name}`, import.meta.url)),
    'utf8',
  )
}

const manifest = {
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

function samples(): AdapterSample[] {
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

describe('adapter candidate replay and registry', () => {
  it('replays a manifest against explicit samples without network access', async () => {
    const report = await replayManifest(manifest, samples(), {
      now: () => '2026-10-28T00:00:00.000Z',
    })
    expect(report.ok).toBe(true)
    expect(report.courses).toHaveLength(1)
    expect(report.items.map((item) => item.title)).toEqual([
      'Problem Set 1',
      'Problem Set 2',
      'Problem Set 3',
    ])
    expect(report.testedAt).toBe('2026-10-28T00:00:00.000Z')

    const incomplete = await replayManifest(
      manifest,
      samples().filter((sample) => !sample.url.endsWith('/A3')),
    )
    expect(incomplete.ok).toBe(false)
    expect(incomplete.errors.join(' ')).toMatch(/未完整|失败/)
  })

  it('stores candidates, activates validated versions and rolls back', async () => {
    const clock = fixedClock()
    const store = createTestStore({ clock })
    cleanup.push(() => store.close())
    const manifestStore = new ManifestStore({ db: store.database, clock })
    const registry = new ManifestRegistry()
    const service = new AdapterCandidateService(manifestStore, registry, {
      now: () => clock.now(),
    })

    const registered = await service.register(manifest, samples())
    expect(registered.summary.status).toBe('validated')
    expect(registry.get('demo-json')).toBeUndefined()
    expect(service.list('demo-json')).toHaveLength(1)

    const activated = service.activate('demo-json', '1.0.0')
    expect(activated.status).toBe('validated')
    expect(registry.get('demo-json')?.version).toBe('1.0.0')
    expect(manifestStore.active('demo-json')?.manifest.version).toBe('1.0.0')

    const v2 = { ...manifest, version: '1.1.0' }
    await service.register(v2, samples())
    service.activate('demo-json', '1.1.0')
    expect(manifestStore.active('demo-json')?.manifest.version).toBe('1.1.0')
    const rolledBack = service.rollback('demo-json')
    expect(rolledBack.version).toBe('1.0.0')

    const freshRegistry = new ManifestRegistry()
    const fresh = new AdapterCandidateService(manifestStore, freshRegistry, {
      now: () => clock.now(),
    })
    fresh.loadActive()
    expect(freshRegistry.get('demo-json')?.version).toBe('1.0.0')
  })

  it('keeps failed candidates inactive', async () => {
    const clock = fixedClock()
    const store = createTestStore({ clock })
    cleanup.push(() => store.close())
    const service = new AdapterCandidateService(
      new ManifestStore({ db: store.database, clock }),
      new ManifestRegistry(),
      { now: () => clock.now() },
    )
    const result = await service.register(
      { ...manifest, version: '1.0.1' },
      samples().filter((sample) => !sample.url.endsWith('/A3')),
    )
    expect(result.report.ok).toBe(false)
    expect(result.summary.status).toBe('candidate')
    expect(() => service.activate('demo-json', '1.0.1')).toThrow(/validated/)
  })
})
