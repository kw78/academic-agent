import { describe, expect, it } from 'vitest'
import {
  COMMAND,
  EVENT,
  type EventUpcaster,
} from '@academic/contracts'
import { createAcademicStore } from '@academic/storage-sqlite'
import {
  fixedClock,
  makeCommand,
  sequentialIds,
} from '../helpers/store.js'

describe('T19 event schema upcasting', () => {
  it('projects an old event sample through a pure upcaster without rewriting history', async () => {
    const upcasters: EventUpcaster[] = [
      {
        eventType: EVENT.CourseRenamed,
        fromVersion: 1,
        toVersion: 2,
        upcast(payload) {
          return { ...(payload as Record<string, unknown>), previousTitle: '<unknown>' }
        },
      },
    ]
    const store = createAcademicStore({
      databasePath: ':memory:',
      clock: fixedClock(),
      ids: sequentialIds(),
      upcasters,
    })

    try {
      expect(
        await store.commands.execute(
          makeCommand(COMMAND.CourseCreate, 'course-1', {
            termId: '2026-fall',
            code: 'CS101',
            title: 'Computer Science',
          }),
        ),
      ).toMatchObject({ ok: true })

      store.database
        .prepare(
          `INSERT INTO domain_events (
             event_id, stream_id, stream_version, event_type, schema_version,
             occurred_at, correlation_id, causation_id, actor_json, payload_json
           ) VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?, ?)`,
        )
        .run(
          'legacy-event',
          'course/course-1',
          2,
          EVENT.CourseRenamed,
          '2026-10-27T11:00:00.000Z',
          'legacy-correlation',
          'legacy-command',
          JSON.stringify({ kind: 'system', id: 'legacy' }),
          JSON.stringify({ title: 'Renamed by legacy event' }),
        )
      store.database
        .prepare('UPDATE event_streams SET version = 2 WHERE stream_id = ?')
        .run('course/course-1')

      const events = await store.events.readStream('course/course-1')
      expect(events).toHaveLength(2)
      expect(events[1]).toMatchObject({
        schemaVersion: 2,
        payload: {
          title: 'Renamed by legacy event',
          previousTitle: '<unknown>',
        },
      })

      store.rebuildProjection()
      expect(await store.queries.getCourse('course-1')).toMatchObject({
        title: 'Renamed by legacy event',
        version: 2,
      })
      expect(store.health()).toMatchObject({ consistent: true })

      const raw = store.database
        .prepare("SELECT payload_json FROM domain_events WHERE event_id = 'legacy-event'")
        .get() as { payload_json: string }
      expect(raw.payload_json).not.toContain('previousTitle')
    } finally {
      store.close()
    }
  })
})
