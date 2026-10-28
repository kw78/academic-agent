import { afterEach, describe, expect, it } from 'vitest'
import { createAcademicApp } from '@academic/cli'
import { InMemoryCredentialVault } from '@academic/connections'
import type { SourceEngine } from '@academic/contracts'
import { createAcademicUiApi } from '../../packages/academic-dsh-ui/src/api.js'
import { fixedClock } from '../helpers/store.js'

const cleanup: Array<() => void> = []

afterEach(() => {
  for (const dispose of cleanup.splice(0).reverse()) dispose()
})

async function setup(
  options: {
    probeFetch?: typeof fetch
    probeResolveHost?: (hostname: string) => Promise<Array<{ address: string; family: number }>>
  } = {},
) {
  const clock = fixedClock()
  const app = await createAcademicApp({
    databasePath: ':memory:',
    clock,
    ...options,
  })
  cleanup.push(() => app.close())
  await app.syncFixture()
  return { app, api: createAcademicUiApi(app), clock }
}

describe('academic UI host API', () => {
  it('reads courses, dashboard and tasks only through Query API', async () => {
    const { api } = await setup()
    const status = await api.status({})
    expect(status.ok).toBe(true)
    if (!status.ok) return
    expect(status.value.host).toBe('connected')
    expect(status.value.plannerAvailable).toBe(true)

    const courses = await api.courses({})
    expect(courses.ok).toBe(true)
    if (!courses.ok) return
    expect(courses.value.courses).toHaveLength(1)
    expect(courses.value.courses[0]?.code).toBe('CS101')

    const dashboard = await api.dashboard({})
    expect(dashboard.ok).toBe(true)
    if (!dashboard.ok) return
    expect(dashboard.value.counts.activeTasks).toBe(2)
    expect(dashboard.value.sources.some((source) => source.sourceId === 'fixture-lms')).toBe(true)
    expect(dashboard.value.syncHealth).toBe('ok')

    const tasks = await api.tasks({ status: 'all' })
    expect(tasks.ok).toBe(true)
    if (!tasks.ok) return
    expect(tasks.value.cards).toHaveLength(2)
    expect(tasks.value.items).toHaveLength(2)
    expect(tasks.value.timeZone).toBeTruthy()
  })

  it('routes task transitions through Command API and refreshes state', async () => {
    const { api } = await setup()
    const tasks = await api.tasks({ status: 'active' })
    expect(tasks.ok).toBe(true)
    if (!tasks.ok) return
    const target = tasks.value.cards[0]
    expect(target).toBeDefined()
    if (!target) return

    const completed = await api.completeTask({ id: target.task.taskId })
    expect(completed.ok).toBe(true)

    const after = await api.tasks({ status: 'completed' })
    expect(after.ok).toBe(true)
    if (!after.ok) return
    expect(after.value.cards.some((card) => card.task.taskId === target.task.taskId)).toBe(true)

    const reopened = await api.reopenTask({ id: target.task.taskId })
    expect(reopened.ok).toBe(true)
    const active = await api.tasks({ status: 'active' })
    expect(active.ok).toBe(true)
    if (!active.ok) return
    expect(active.value.cards.some((card) => card.task.taskId === target.task.taskId)).toBe(true)
  })

  it('keeps candidates unconfirmed until an explicit accept', async () => {
    const { api, clock } = await setup()
    const start = clock.now()
    const end = new Date(Date.parse(start) + 7 * 86_400_000).toISOString()
    const preview = await api.previewPlan({ start, end })
    expect(preview.ok).toBe(true)
    if (!preview.ok) return
    expect(preview.value.previewId).toBeTruthy()

    const before = await api.plan({})
    expect(before.ok).toBe(true)
    if (!before.ok) return
    expect(before.value.plan).toBeUndefined()

    const accepted = await api.acceptPlan({ previewId: preview.value.previewId })
    expect(accepted.ok).toBe(true)
    if (!accepted.ok) return
    expect(accepted.value.plan?.status).toBe('active')

    const replay = await api.acceptPlan({ previewId: preview.value.previewId })
    expect(replay.ok).toBe(false)
    if (!replay.ok) expect(replay.error.code).toBe('CONFLICT')
  })

  it('rejects tampered or expired candidates instead of trusting client blocks', async () => {
    const { api } = await setup()
    const result = await api.acceptPlan({ previewId: 'not-a-preview' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('CONFLICT')
  })

  it('does not treat archived plan blocks as scheduled work', async () => {
    const { api, clock } = await setup()
    const start = clock.now()
    const end = new Date(Date.parse(start) + 7 * 86_400_000).toISOString()
    const preview = await api.previewPlan({ start, end })
    expect(preview.ok).toBe(true)
    if (!preview.ok) return
    const accepted = await api.acceptPlan({ previewId: preview.value.previewId })
    expect(accepted.ok).toBe(true)
    const planned = await api.dashboard({})
    expect(planned.ok).toBe(true)
    if (!planned.ok) return
    expect(planned.value.counts.unscheduledTasks).toBe(0)

    const archived = await api.archivePlan({})
    expect(archived.ok).toBe(true)
    const after = await api.dashboard({})
    expect(after.ok).toBe(true)
    if (!after.ok) return
    expect(after.value.counts.unscheduledTasks).toBeGreaterThan(0)
  })

  it('invalidates candidates when availability changes', async () => {
    const { api, clock } = await setup()
    const start = clock.now()
    const end = new Date(Date.parse(start) + 7 * 86_400_000).toISOString()
    const preview = await api.previewPlan({ start, end })
    expect(preview.ok).toBe(true)
    if (!preview.ok) return

    await api.updateAvailability({
      timeZone: 'UTC',
      granularityMinutes: 30,
      weeklySlots: [{ weekday: 1, start: '09:00', end: '10:00' }],
      temporaryBlocks: [],
    })
    const accepted = await api.acceptPlan({ previewId: preview.value.previewId })
    expect(accepted.ok).toBe(false)
    if (!accepted.ok) expect(accepted.error.code).toBe('CONFLICT')
  })

  it('never exposes credential references and refuses unknown engines', async () => {
    const { app, api } = await setup()
    expect(() =>
      app.sources.create({
        sourceId: 'secure-lms',
        engine: 'missing-engine',
        displayName: 'Secure LMS',
        authKind: 'password',
      }),
    ).toThrow(/未知 engine/)

    const missing = await api.createSource({
      engine: 'missing-engine',
      displayName: 'Secure LMS',
      authKind: 'none',
    })
    expect(missing.ok).toBe(false)
    if (!missing.ok) expect(missing.error.code).toBe('CAPABILITY_UNAVAILABLE')

    app.sources.create({
      sourceId: 'secure-lms',
      engine: 'browser-session',
      displayName: 'Secure LMS',
      authKind: 'token',
      loginMode: 'manual',
      config: {
        loginUrl: 'https://www.example.com/login',
        authenticatedUrlPatterns: ['^https://www\\.example\\.com/'],
        cookieDomains: ['www.example.com'],
      },
    })
    const connection = app.connections.create({
      sourceId: 'secure-lms',
      displayName: 'Secure LMS',
      authKind: 'token',
    })
    const secretResult = await api.setConnectionSecret({
      connectionId: connection.connectionId,
      secret: 'super-secret-value',
    })
    expect(secretResult.ok).toBe(true)

    const listed = await api.connections({})
    expect(listed.ok).toBe(true)
    if (!listed.ok) return
    const serialized = JSON.stringify(listed.value)
    expect(serialized).not.toContain('credentialRef')
    expect(serialized).not.toContain('credential_ref')
    expect(serialized).not.toContain('super-secret-value')
    const source = listed.value.sources.find((entry) => entry.sourceId === 'secure-lms')
    expect(source?.adapterReady).toBe(false)
    expect(source?.syncAvailable).toBe(false)
    expect(source?.canLogin).toBe(true)
  })

  it('probes a saved session without writing and rejects expired sessions', async () => {
    let mode: 'ok' | 'login' = 'ok'
    let sentCookie: string | null = null
    const { app, clock, api } = await setup({
      probeResolveHost: async () => [
        { address: '93.184.216.34', family: 4 },
      ],
      probeFetch: async (_input, init) => {
        sentCookie = new Headers(init?.headers).get('cookie')
        if (mode === 'login') {
          return new Response(
            '<html><head><title>登录</title></head><body></body></html>',
            { status: 200, headers: { 'content-type': 'text/html' } },
          )
        }
        return new Response(
          '<html><head><title>Home</title></head><body>' +
            '<h1>Courses</h1>' +
            '<a href="https://lms.example.edu/course/1?token=should-not-leak">Course 1</a>' +
            '</body></html>',
          { status: 200, headers: { 'content-type': 'text/html' } },
        )
      },
    })
    const config = {
      loginUrl: 'https://lms.example.edu/login',
      verifyUrl: 'https://lms.example.edu/home',
      authenticatedUrlPatterns: ['^https://lms\\.example\\.edu/'],
      cookieDomains: ['lms.example.edu'],
    }
    app.sources.create({
      sourceId: 'probe-source',
      engine: 'browser-session',
      displayName: 'Probe Source',
      authKind: 'token',
      loginMode: 'manual',
      config,
    })
    const connection = app.connections.create({
      sourceId: 'probe-source',
      displayName: 'Probe Source',
      authKind: 'token',
    })
    await app.connections.setSecret(
      connection.connectionId,
      JSON.stringify({
        cookies: [
          {
            name: 'sid',
            value: 'top-secret',
            domain: 'lms.example.edu',
            path: '/',
          },
        ],
      }),
    )
    const itemCountBefore = (await app.store.queries.listAcademicItems()).items.length
    const probed = await api.probeSource({ sourceId: 'probe-source' })
    expect(probed.ok).toBe(true)
    if (!probed.ok) return
    expect(sentCookie).toContain('sid=top-secret')
    expect(probed.value).toMatchObject({
      status: 200,
      title: 'Home',
      headings: ['Courses'],
      loginLike: false,
      probedAt: clock.now(),
    })
    expect(probed.value.links[0]).toEqual({
      text: 'Course 1',
      url: 'https://lms.example.edu/course/1',
    })
    expect(JSON.stringify(probed.value)).not.toContain('top-secret')
    expect(JSON.stringify(probed.value)).not.toContain('should-not-leak')
    const toolProbe = await app.agentBridge.host.call('academic_probe_source', {
      sourceId: 'probe-source',
    })
    expect(toolProbe.ok).toBe(true)
    if (toolProbe.ok) {
      expect(JSON.stringify(toolProbe.data)).not.toContain('top-secret')
      expect(JSON.stringify(toolProbe.data)).not.toContain('should-not-leak')
    }
    expect((await app.store.queries.listAcademicItems()).items).toHaveLength(
      itemCountBefore,
    )

    mode = 'login'
    expect(await api.probeSource({ sourceId: 'probe-source' })).toMatchObject({
      ok: false,
      error: { code: 'AUTH_REQUIRED' },
    })
  })

  it('activates a validated candidate and creates a syncable declarative source', async () => {
    const { app, api } = await setup()
    app.sources.create({
      sourceId: 'session-source',
      engine: 'browser-session',
      displayName: 'LMS session',
      authKind: 'token',
      loginMode: 'manual',
      config: {
        loginUrl: 'https://lms.example.edu/login',
        authenticatedUrlPatterns: ['^https://lms\\.example\\.edu/'],
        cookieDomains: ['lms.example.edu'],
      },
    })
    const sessionConnection = app.connections.create({
      sourceId: 'session-source',
      displayName: 'LMS session',
      authKind: 'token',
    })
    await app.connections.setSecret(
      sessionConnection.connectionId,
      JSON.stringify({
        cookies: [
          {
            name: 'sid',
            value: 'copied-session',
            domain: 'lms.example.edu',
            path: '/',
          },
        ],
      }),
    )

    const manifest = {
      schemaVersion: 1,
      adapterId: 'auto-demo',
      version: '1.0.0',
      displayName: 'Auto Demo',
      baseUrl: 'https://lms.example.edu/',
      allowedOrigins: ['lms.example.edu'],
      courses: {
        url: '/data',
        responseType: 'json',
        items: 'courses',
        fields: {
          externalCourseId: { path: 'id' },
          code: { path: 'code' },
          title: { path: 'title' },
          termId: { path: 'term' },
        },
      },
      assignments: {
        url: '/data',
        responseType: 'json',
        items: 'assignments',
        fields: {
          externalItemId: { path: 'id' },
          title: { path: 'title' },
        },
      },
    }
    const samples = [
      {
        url: 'https://lms.example.edu/data',
        body: JSON.stringify({
          courses: [
            { id: 'C1', code: 'CS101', title: 'Data Structures', term: '2026FA' },
          ],
          assignments: [{ id: 'A1', title: 'HW1' }],
        }),
      },
    ]

    const validated = await api.validateAdapterCandidate({ manifest, samples })
    expect(validated.ok).toBe(true)
    const registered = await api.registerAdapterCandidate({ manifest, samples })
    expect(registered.ok).toBe(true)
    if (!registered.ok) return
    expect(registered.value.candidate.status).toBe('validated')

    const activated = await api.activateAdapterCandidate({
      adapterId: 'auto-demo',
      version: '1.0.0',
    })
    expect(activated.ok).toBe(true)
    if (!activated.ok) return
    expect(activated.value.source).toMatchObject({
      sourceId: 'adapter-auto-demo',
      engine: 'declarative',
      adapterReady: true,
    })
    const target = app.sources.get('adapter-auto-demo')
    expect(target?.config).toMatchObject({
      manifestId: 'auto-demo',
      manifestVersion: '1.0.0',
    })
    const copied = app.connections
      .list()
      .find((connection) => connection.sourceId === 'adapter-auto-demo')
    expect(copied?.hasCredential).toBe(true)
    expect(JSON.stringify(activated.value)).not.toContain('copied-session')

    const listed = await api.adapterCandidates({})
    expect(listed.ok).toBe(true)
    if (listed.ok) {
      expect(listed.value.active).toContainEqual({
        adapterId: 'auto-demo',
        active: '1.0.0',
      })
    }
  })

  it('rejects malformed requests with a validation error, not a fake success', async () => {
    const { api } = await setup()
    const result = await api.createTask({})
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('VALIDATION')

    const badSchedule = await api.updateSyncSchedule({ intervalMinutes: 0 })
    expect(badSchedule.ok).toBe(false)
    if (!badSchedule.ok) expect(badSchedule.error.code).toBe('VALIDATION')
  })

  it('pauses and resumes automation without stopping existing data access', async () => {
    const { api } = await setup()
    const automation = await api.automation({})
    expect(automation.ok).toBe(true)
    if (!automation.ok) return
    const job = automation.value.jobs.find((entry) => entry.jobId === 'fixture-lms-sync')
    expect(job).toBeDefined()
    if (!job) return

    const paused = await api.setJobEnabled({ jobId: job.jobId, enabled: false })
    expect(paused.ok).toBe(true)
    if (!paused.ok) return
    expect(paused.value.enabled).toBe(false)

    const courses = await api.courses({})
    expect(courses.ok).toBe(true)
    if (courses.ok) expect(courses.value.courses).toHaveLength(1)

    const resumed = await api.setJobEnabled({ jobId: job.jobId, enabled: true })
    expect(resumed.ok).toBe(true)
    if (resumed.ok) expect(resumed.value.enabled).toBe(true)
  })

  it('persists availability and reminder settings through the Host API', async () => {
    const { api } = await setup()
    const updated = await api.updateAvailability({
      timeZone: 'UTC',
      granularityMinutes: 30,
      weeklySlots: [{ weekday: 1, start: '09:00', end: '10:00' }],
      temporaryBlocks: [],
    })
    expect(updated.ok).toBe(true)
    if (!updated.ok) return
    expect(updated.value.granularityMinutes).toBe(30)

    const settings = await api.settings({})
    expect(settings.ok).toBe(true)
    if (!settings.ok) return
    expect(settings.value.availability.timeZone).toBe('UTC')
    expect(settings.value.availability.granularityMinutes).toBe(30)

    const reminders = await api.updateReminderSettings({ thresholdsHours: [48, 12] })
    expect(reminders.ok).toBe(true)
    if (!reminders.ok) return
    expect(reminders.value.thresholdsHours).toEqual([48, 12])
  })

  it('marks notifications read and reports sync results without hiding failures', async () => {
    const { api } = await setup()
    const automation = await api.automation({})
    expect(automation.ok).toBe(true)
    if (!automation.ok) return
    expect(automation.value.unread).toBeGreaterThan(0)

    const marked = await api.markAllNotificationsRead({})
    expect(marked.ok).toBe(true)
    if (!marked.ok) return
    expect(marked.value.changed).toBeGreaterThan(0)

    const after = await api.automation({})
    expect(after.ok).toBe(true)
    if (after.ok) expect(after.value.unread).toBe(0)

    const sync = await api.syncNow({})
    expect(sync.ok).toBe(true)
    if (!sync.ok) return
    expect(['success', 'partial']).toContain(sync.value.status)
  })
})

describe('generic DB-backed source login', () => {
  it('uses a registered engine, stores only the session secret and reports connected', async () => {
    const clock = fixedClock()
    const app = await createAcademicApp({
      databasePath: ':memory:',
      clock,
      credentialVault: new InMemoryCredentialVault(),
      sourceEngines: [
        {
          descriptor: {
            id: 'fake-browser',
            displayName: 'Fake Browser',
            supportsSync: false,
            supportsLogin: true,
            supportsVerify: true,
          },
          async login() {
            return { secret: JSON.stringify({ cookie: 'test-session-secret' }) }
          },
          async verify() {
            return { ok: true }
          },
        },
      ],
    })
    cleanup.push(() => app.close())
    app.sources.create({
      sourceId: 'fake-source',
      engine: 'fake-browser',
      displayName: 'Fake Source',
      authKind: 'token',
      loginMode: 'browser',
      capabilities: ['academic.auth.browser'],
    })
    const api = createAcademicUiApi(app)

    const result = await api.sourceLogin({ sourceId: 'fake-source' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.sourceId).toBe('fake-source')
    expect(result.value.status).toBe('connected')
    expect(JSON.stringify(result.value)).not.toContain('test-session-secret')

    const listed = await api.connections({})
    expect(listed.ok).toBe(true)
    if (!listed.ok) return
    const source = listed.value.sources.find((entry) => entry.sourceId === 'fake-source')
    expect(source?.adapterAvailable).toBe(true)
    expect(source?.engineKnown).toBe(true)
    expect(source?.canLogin).toBe(true)
    expect(source?.authKind).toBe('token')
    expect(JSON.stringify(listed.value)).not.toContain('test-session-secret')
  })

  it('returns the generated sourceId when the caller omits one', async () => {
    const { api } = await setup()
    const created = await api.createSource({
      engine: 'fixture',
      displayName: 'Second fixture',
      authKind: 'none',
    })
    expect(created.ok).toBe(true)
    if (!created.ok) return
    expect(created.value.sourceId).toBeTruthy()
    expect(created.value.sourceId).not.toBe('')

    const listed = await api.connections({})
    expect(listed.ok).toBe(true)
    if (!listed.ok) return
    expect(
      listed.value.sources.some((entry) => entry.sourceId === created.value.sourceId),
    ).toBe(true)
  })

  it('separates configuration, authentication, adapter and sync health', async () => {
    const { api } = await setup()
    const listed = await api.connections({})
    expect(listed.ok).toBe(true)
    if (!listed.ok) return

    const fixture = listed.value.sources.find(
      (source) => source.sourceId === 'fixture-lms',
    )
    expect(fixture?.configuration).toBe('configured')
    expect(fixture?.authentication).toBe('not-required')
    expect(fixture?.adapterReady).toBe(true)
    expect(fixture?.syncHealth).toBe('healthy')
    expect(fixture?.state).toBe('connected')

    const created = await api.createSource({
      engine: 'browser-session',
      displayName: 'Browser source',
      authKind: 'token',
      loginMode: 'browser',
      config: {
        loginUrl: 'https://www.example.com/login',
        authenticatedUrlPatterns: ['^https://www\\.example\\.com/'],
        cookieDomains: ['www.example.com'],
      },
    })
    expect(created.ok).toBe(true)
    if (!created.ok) return
    expect(created.value.configuration).toBe('configured')
    expect(created.value.authentication).toBe('missing')
    expect(created.value.adapterReady).toBe(false)
    expect(created.value.syncHealth).toBe('never-synced')
    expect(created.value.state).toBe('unconfigured')
  })

  it('previews source items without writing and then syncs them', async () => {
    const fakeSyncEngine: SourceEngine = {
      descriptor: {
        id: 'fake-sync',
        displayName: 'Fake Sync',
        supportsSync: true,
        supportsLogin: false,
        supportsVerify: false,
        authKinds: ['none'],
      },
      async listCourses(context) {
        return [
          {
            sourceId: context.sourceId,
            externalCourseId: 'C1',
            termId: '2026FA',
            code: 'C1',
            title: 'Course',
          },
        ]
      },
      createAdapter(context) {
        return {
          id: 'fake-sync.readonly',
          sourceId: context.sourceId,
          async fetch() {
            return {
              items: [
                {
                  sourceId: context.sourceId,
                  externalItemId: 'i1',
                  courseExternalId: 'C1',
                  kind: 'assignment' as const,
                  title: 'Item',
                  due: { kind: 'unknown' as const },
                  contentHash: 'hash-1',
                },
              ],
              completeness: 'full' as const,
              fetchedAt: '2026-10-28T00:00:00.000Z',
              warnings: [],
            }
          },
        }
      },
    }
    const clock = fixedClock()
    const app = await createAcademicApp({
      databasePath: ':memory:',
      clock,
      sourceEngines: [fakeSyncEngine],
    })
    cleanup.push(() => app.close())
    app.sources.create({
      sourceId: 'fake-source',
      engine: 'fake-sync',
      displayName: 'Fake Source',
      authKind: 'none',
    })
    const api = createAcademicUiApi(app)

    const preview = await api.previewSourceSync({ sourceId: 'fake-source' })
    expect(preview.ok).toBe(true)
    if (!preview.ok) return
    expect(preview.value.counts).toEqual({
      create: 1,
      update: 0,
      unchanged: 0,
      skip: 0,
      missing: 0,
    })
    expect((await app.store.queries.listAcademicItems()).items).toHaveLength(0)

    const sync = await api.syncNow({ sourceId: 'fake-source' })
    expect(sync.ok).toBe(true)
    if (!sync.ok) return
    expect(sync.value.created).toBe(1)

    const again = await api.previewSourceSync({ sourceId: 'fake-source' })
    expect(again.ok).toBe(true)
    if (!again.ok) return
    expect(again.value.counts.unchanged).toBe(1)
  })

  it('rejects engine, auth and login combinations the engine does not support', async () => {
    const { api } = await setup()

    const fixtureToken = await api.createSource({
      engine: 'fixture',
      displayName: 'Bad fixture',
      authKind: 'token',
    })
    expect(fixtureToken.ok).toBe(false)
    if (!fixtureToken.ok) expect(fixtureToken.error.code).toBe('VALIDATION')

    const fixtureLogin = await api.createSource({
      engine: 'fixture',
      displayName: 'Bad fixture login',
      authKind: 'none',
      loginMode: 'browser',
    })
    expect(fixtureLogin.ok).toBe(false)
    if (!fixtureLogin.ok) expect(fixtureLogin.error.code).toBe('VALIDATION')

    const browserNoAuth = await api.createSource({
      engine: 'browser-session',
      displayName: 'Bad browser source',
      authKind: 'none',
    })
    expect(browserNoAuth.ok).toBe(false)
    if (!browserNoAuth.ok) expect(browserNoAuth.error.code).toBe('VALIDATION')

    const browserOk = await api.createSource({
      engine: 'browser-session',
      displayName: 'Good browser source',
      authKind: 'token',
      loginMode: 'browser',
      config: {
        loginUrl: 'https://www.example.com/login',
        authenticatedUrlPatterns: ['^https://www\\.example\\.com/'],
        cookieDomains: ['www.example.com'],
      },
    })
    expect(browserOk.ok).toBe(true)

    const invalidConfig = await api.createSource({
      engine: 'browser-session',
      displayName: 'Bad browser config',
      authKind: 'token',
      loginMode: 'browser',
      config: {},
    })
    expect(invalidConfig.ok).toBe(false)
    if (!invalidConfig.ok) {
      expect(invalidConfig.error.code).toBe('VALIDATION')
      expect(invalidConfig.error.message).toContain('配置无效')
    }

    const badUpdate = await api.updateSource({
      sourceId: 'fixture-lms',
      authKind: 'token',
    })
    expect(badUpdate.ok).toBe(false)
    if (!badUpdate.ok) expect(badUpdate.error.code).toBe('VALIDATION')
  })
})
