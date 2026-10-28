import { afterEach, describe, expect, it } from 'vitest'
import {
  COMMAND,
  EVENT,
  type AcademicItemView,
} from '@academic/contracts'
import {
  createFixtureAdapter,
  FixtureLmsAdapter,
  type FixtureSnapshotInput,
} from '@academic/adapter-fixture-lms'
import { ConnectorService } from '@academic/connectors'
import {
  countRows,
  createTestStore,
  execute,
  fixedClock,
  makeCommand,
  sequentialIds,
} from '../helpers/store.js'

const cleanup: Array<() => void> = []

afterEach(() => {
  for (const dispose of cleanup.splice(0)) dispose()
})

function setup() {
  const clock = fixedClock()
  const store = createTestStore({ clock })
  const connector = new ConnectorService({
    db: store.database,
    commands: store.commands,
    queries: store.queries,
    clock,
    ids: sequentialIds('connector'),
  })
  cleanup.push(() => store.close())
  return { clock, store, connector }
}

async function registerCourse(connector: ConnectorService) {
  return connector.registerCourse({
    sourceId: 'fixture-lms',
    externalCourseId: 'CS101',
    termId: '2026-fall',
    code: 'CS101',
    title: 'Introduction to Computer Science',
  })
}

function snapshot(overrides: Partial<FixtureSnapshotInput> = {}): FixtureSnapshotInput {
  return {
    sourceId: 'fixture-lms',
    fetchedAt: '2026-10-27T10:00:00.000Z',
    completeness: 'full',
    items: [],
    ...overrides,
  }
}

async function findItem(
  store: ReturnType<typeof createTestStore>,
  externalItemId: string,
): Promise<AcademicItemView> {
  const item = await store.queries.getAcademicItemBySource('fixture-lms', externalItemId)
  if (!item) throw new Error(`Missing item ${externalItemId}`)
  return item
}

describe('T05 duplicate sync is a no-op', () => {
  it('does not create new items or domain events for identical snapshots', async () => {
    const { store, connector } = setup()
    await registerCourse(connector)
    const adapter = new FixtureLmsAdapter()

    const first = await connector.sync(adapter)
    expect(first).toMatchObject({
      status: 'success',
      itemsSeen: 2,
      created: 2,
      updated: 0,
    })
    const eventCount = countRows(store, 'domain_events')
    const assignment = await findItem(store, 'assignment-1')
    const exam = await findItem(store, 'exam-1')

    const second = await connector.sync(new FixtureLmsAdapter())
    expect(second).toMatchObject({
      status: 'success',
      itemsSeen: 2,
      created: 0,
      updated: 0,
    })
    expect(countRows(store, 'domain_events')).toBe(eventCount)
    expect(await findItem(store, 'assignment-1')).toMatchObject({
      version: assignment.version,
      updatedAt: assignment.updatedAt,
    })
    expect(await findItem(store, 'exam-1')).toMatchObject({
      version: exam.version,
      updatedAt: exam.updatedAt,
    })
  })
})

describe('T06 partial and empty snapshots preserve data', () => {
  it('never clears existing items for partial or default full empty snapshots', async () => {
    const { clock, store, connector } = setup()
    await registerCourse(connector)
    await connector.sync(new FixtureLmsAdapter())
    const eventCount = countRows(store, 'domain_events')

    const partialEmpty = await connector.sync(
      createFixtureAdapter(
        snapshot({
          fetchedAt: clock.now(),
          completeness: 'partial',
        }),
      ),
    )
    expect(partialEmpty).toMatchObject({ status: 'partial', itemsSeen: 0 })
    expect((await store.queries.listAcademicItems()).items).toHaveLength(2)
    expect(countRows(store, 'domain_events')).toBe(eventCount)

    const fullEmpty = await connector.sync(
      createFixtureAdapter(
        snapshot({
          fetchedAt: clock.now(),
          completeness: 'full',
        }),
      ),
    )
    expect(fullEmpty).toMatchObject({ status: 'partial', itemsSeen: 0 })
    expect(fullEmpty.warnings.join(' ')).toContain('未出现在本次完整结果中')
    expect((await store.queries.listAcademicItems()).items).toHaveLength(2)
    expect(countRows(store, 'domain_events')).toBe(eventCount)

    const preview = await connector.preview(
      createFixtureAdapter(
        snapshot({ fetchedAt: clock.now(), completeness: 'full' }),
      ),
    )
    expect(preview.counts.missing).toBe(2)
    expect(preview.items.filter((item) => item.action === 'missing')).toHaveLength(2)
    expect((await store.queries.listAcademicItems()).items).toHaveLength(2)
  })

  it('archives missing items only when explicitly opted in for a full snapshot', async () => {
    const { clock, store, connector } = setup()
    await registerCourse(connector)
    await connector.sync(new FixtureLmsAdapter())

    const result = await connector.sync(
      createFixtureAdapter(
        snapshot({
          fetchedAt: clock.now(),
          completeness: 'full',
        }),
      ),
      { archiveMissing: true },
    )
    expect(result).toMatchObject({ status: 'success', updated: 2 })
    expect((await store.queries.listAcademicItems()).items).toHaveLength(0)
    expect((await store.queries.listAcademicItems({ status: 'all' })).items).toHaveLength(2)
  })
})

describe('T07 changed deadline through the connector', () => {
  it('updates the source fields while preserving local progress', async () => {
    const { clock, store, connector } = setup()
    await registerCourse(connector)
    await connector.sync(new FixtureLmsAdapter())
    const assignment = await findItem(store, 'assignment-1')

    expect(
      await execute(
        store,
        makeCommand(
          COMMAND.AcademicItemSetProgress,
          assignment.itemId,
          { progress: { status: 'in-progress', percent: 40 } },
          { actor: { kind: 'user', id: 'local-user' } },
        ),
      ),
    ).toMatchObject({ ok: true })

    clock.advance(60_000)
    const changed = await connector.sync(
      createFixtureAdapter(
        snapshot({
          fetchedAt: clock.now(),
          items: [
            {
              externalItemId: 'assignment-1',
              courseExternalId: 'CS101',
              kind: 'assignment',
              title: 'Problem Set 1 (extended)',
              description: 'Implement a linked list and write tests.',
              due: {
                kind: 'instant',
                utc: '2026-11-05T15:00:00.000Z',
                zone: 'Asia/Shanghai',
              },
              sourceUrl: 'https://lms.example.edu/courses/CS101/assignments/1',
              sourceUpdatedAt: '2026-10-27T10:30:00.000Z',
            },
          ],
        }),
      ),
    )
    expect(changed).toMatchObject({ status: 'partial', itemsSeen: 1, updated: 1 })
    expect(changed.warnings.join(' ')).toContain('未出现在本次完整结果中')

    expect(await findItem(store, 'assignment-1')).toMatchObject({
      title: 'Problem Set 1 (extended)',
      due: { kind: 'instant', utc: '2026-11-05T15:00:00.000Z' },
      progress: { status: 'in-progress', percent: 40 },
    })

    const events = await store.events.readStream(`academic-item/${assignment.itemId}`)
    const deadlineEvent = events.find(
      (event) => event.type === EVENT.AcademicItemDeadlineChanged,
    )
    expect(deadlineEvent?.payload).toMatchObject({
      from: { kind: 'instant', utc: '2026-11-01T15:00:00.000Z' },
      to: { kind: 'instant', utc: '2026-11-05T15:00:00.000Z' },
    })
    expect(await findItem(store, 'exam-1')).toBeDefined()
  })
})

describe('T13 adapter failures preserve data', () => {
  it('records auth and transient failures without touching existing items', async () => {
    const { clock, store, connector } = setup()
    await registerCourse(connector)
    await connector.sync(new FixtureLmsAdapter())
    const eventCount = countRows(store, 'domain_events')

    const authFailure = await connector.sync(
      createFixtureAdapter(
        snapshot({
          fetchedAt: clock.now(),
          error: { kind: 'auth', message: 'session expired' },
        }),
      ),
    )
    expect(authFailure).toMatchObject({
      status: 'auth-required',
      errorCode: 'AUTH_REQUIRED',
      itemsSeen: 0,
    })

    const transientFailure = await connector.sync(
      createFixtureAdapter(
        snapshot({
          fetchedAt: clock.now(),
          error: { kind: 'transient', message: 'network timeout' },
        }),
      ),
    )
    expect(transientFailure).toMatchObject({
      status: 'failed',
      errorCode: 'TRANSIENT',
    })

    expect((await store.queries.listAcademicItems()).items).toHaveLength(2)
    expect(countRows(store, 'domain_events')).toBe(eventCount)

    const runs = await store.queries.listSyncRuns('fixture-lms')
    expect(runs.items.map((run) => run.status)).toEqual([
      'failed',
      'auth-required',
      'success',
    ])
  })
})
