import { afterEach, describe, expect, it } from 'vitest'
import { createAcademicApp } from '@academic/cli'
import { InMemoryCredentialVault } from '@academic/connections'
import { createAcademicUiApi } from '../../packages/academic-dsh-ui/src/api.js'
import { fixedClock } from '../helpers/store.js'

const cleanup: Array<() => void> = []

afterEach(() => {
  for (const dispose of cleanup.splice(0).reverse()) dispose()
})

async function setup() {
  const clock = fixedClock()
  const app = await createAcademicApp({ databasePath: ':memory:', clock })
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

  it('never exposes credential references and refuses auth for unsupported adapters', async () => {
    const { app, api } = await setup()
    const connection = app.connections.create({
      sourceId: 'secure-lms',
      displayName: 'Secure LMS',
      authKind: 'password',
    })
    const secretResult = await api.setConnectionSecret({
      connectionId: connection.connectionId,
      secret: 'super-secret-value',
    })
    expect(secretResult.ok).toBe(false)
    if (!secretResult.ok) expect(secretResult.error.code).toBe('CAPABILITY_UNAVAILABLE')

    const verify = await api.verifyConnection({ connectionId: connection.connectionId })
    expect(verify.ok).toBe(false)
    if (!verify.ok) expect(verify.error.code).toBe('CAPABILITY_UNAVAILABLE')

    const listed = await api.connections({})
    expect(listed.ok).toBe(true)
    if (!listed.ok) return
    const serialized = JSON.stringify(listed.value)
    expect(serialized).not.toContain('credentialRef')
    expect(serialized).not.toContain('credential_ref')
    expect(serialized).not.toContain('super-secret-value')
    const source = listed.value.sources.find((entry) => entry.sourceId === 'secure-lms')
    expect(source?.adapterAvailable).toBe(false)
    expect(source?.state).toBe('unavailable')
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

describe('Blackboard login through the UI host API', () => {
  it('opens the login flow, stores only the session cookie and reports connected', async () => {
    const clock = fixedClock()
    const app = await createAcademicApp({
      databasePath: ':memory:',
      clock,
      credentialVault: new InMemoryCredentialVault(),
    })
    cleanup.push(() => app.close())
    const api = createAcademicUiApi(app, {
      loginBlackboard: async () => ({
        cookieHeader: 'BbRouter=test-session-secret; JSESSIONID=abc',
        cookieCount: 2,
        finalOrigin: 'https://www.bb.ustc.edu.cn',
        finalPath: '/webapps/portal/frameset.jsp',
      }),
    })

    const result = await api.blackboardLogin({})
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.sourceId).toBe('ustc-blackboard')
    expect(result.value.status).toBe('connected')
    expect(JSON.stringify(result.value)).not.toContain('test-session-secret')

    const listed = await api.connections({})
    expect(listed.ok).toBe(true)
    if (!listed.ok) return
    const source = listed.value.sources.find((entry) => entry.sourceId === 'ustc-blackboard')
    expect(source?.adapterAvailable).toBe(true)
    expect(source?.authKind).toBe('token')
    expect(JSON.stringify(listed.value)).not.toContain('test-session-secret')
  })
})
