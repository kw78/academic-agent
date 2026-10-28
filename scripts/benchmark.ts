import { performance } from 'node:perf_hooks'
import { ConnectorService } from '../packages/academic-connectors/src/index.js'
import { createFixtureAdapter } from '../adapters/fixture-lms/src/index.js'
import {
  createTestStore,
  fixedClock,
  sequentialIds,
} from '../tests/helpers/store.js'

interface BenchmarkResult {
  items: number
  firstSyncMs: number
  repeatSyncMs: number
  created: number
  repeatCreated: number
  repeatUpdated: number
  query500Ms: number
  queryAllMs: number
  queryPage: number
  rebuildMs: number
  eventPosition: number
}

async function run(size: number): Promise<BenchmarkResult> {
  const clock = fixedClock()
  const store = createTestStore({ clock })
  try {
    const connector = new ConnectorService({
      db: store.database,
      commands: store.commands,
      queries: store.queries,
      clock,
      ids: sequentialIds(`bench-${size}`),
    })
    await connector.registerCourse({
      sourceId: 'fixture-lms',
      externalCourseId: 'CS101',
      termId: '2026-fall',
      code: 'CS101',
      title: 'Benchmark Course',
    })
    const items = Array.from({ length: size }, (_, index) => ({
      externalItemId: `bench-${index}`,
      courseExternalId: 'CS101',
      kind: index % 10 === 0 ? ('exam' as const) : ('assignment' as const),
      title: `Benchmark item ${index}`,
      due: { kind: 'unknown' as const },
    }))
    const adapter = createFixtureAdapter({
      sourceId: 'fixture-lms',
      fetchedAt: '2026-10-28T00:00:00.000Z',
      completeness: 'full',
      items,
    })

    const firstStart = performance.now()
    const first = await connector.sync(adapter)
    const firstSyncMs = performance.now() - firstStart

    const repeatStart = performance.now()
    const repeat = await connector.sync(adapter)
    const repeatSyncMs = performance.now() - repeatStart

    const queryStart = performance.now()
    await store.queries.listAcademicItems({ limit: 500 })
    const query500Ms = performance.now() - queryStart

    const queryAllStart = performance.now()
    let cursor: string | undefined
    let queryPage = 0
    do {
      const page = await store.queries.listAcademicItems({
        limit: 200,
        ...(cursor ? { cursor } : {}),
      })
      queryPage += page.items.length
      cursor = page.nextCursor
    } while (cursor)
    const queryAllMs = performance.now() - queryAllStart

    const rebuildStart = performance.now()
    store.rebuildProjection()
    const rebuildMs = performance.now() - rebuildStart

    return {
      items: size,
      firstSyncMs: Math.round(firstSyncMs),
      repeatSyncMs: Math.round(repeatSyncMs),
      created: first.created,
      repeatCreated: repeat.created,
      repeatUpdated: repeat.updated,
      query500Ms: Math.round(query500Ms),
      queryAllMs: Math.round(queryAllMs),
      queryPage,
      rebuildMs: Math.round(rebuildMs),
      eventPosition: store.health().eventPosition,
    }
  } finally {
    store.close()
  }
}

async function main(): Promise<void> {
  const requested = process.argv
    .slice(2)
    .map((value) => Number(value))
    .filter((value) => Number.isInteger(value) && value > 0)
  const sizes = requested.length > 0 ? requested : [1_000, 10_000]
  for (const size of sizes) {
    console.log(JSON.stringify(await run(size)))
  }
}

void main()
