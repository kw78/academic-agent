import type { DatabaseSync } from 'node:sqlite'
import { z } from 'zod'
import type { Clock } from '@academic/contracts'
import { inTransaction, type SqlRow } from './database.js'

const PREFERENCES_ID = 'default'

export const userPreferencesSchema = z.object({
  coursePriorities: z
    .record(
      z.string().min(1).max(200),
      z.number().int().min(0).max(3),
    )
    .default({}),
  /** Trusted, persistent opt-in for agent-driven adapter onboarding. */
  agentAdapterAutomation: z.boolean().default(false),
})

export type UserPreferences = z.infer<typeof userPreferencesSchema> & {
  updatedAt: string
}

export interface PreferencesUpdate {
  coursePriorities?: Record<string, number>
  agentAdapterAutomation?: boolean
}

function defaults(clock: Clock): UserPreferences {
  return {
    coursePriorities: {},
    agentAdapterAutomation: false,
    updatedAt: clock.now(),
  }
}

export class PreferenceStore {
  readonly #db: DatabaseSync
  readonly #clock: Clock

  constructor(db: DatabaseSync, clock: Clock) {
    this.#db = db
    this.#clock = clock
  }

  get(): UserPreferences {
    const row = this.#db
      .prepare('SELECT * FROM user_preferences WHERE preference_id = ?')
      .get(PREFERENCES_ID) as SqlRow | undefined
    if (row) {
      return {
        coursePriorities: JSON.parse(
          String(row.course_priorities_json),
        ) as Record<string, number>,
        agentAdapterAutomation:
          row.agent_adapter_automation === undefined
            ? false
            : Number(row.agent_adapter_automation) === 1,
        updatedAt: String(row.updated_at),
      }
    }
    const initial = defaults(this.#clock)
    this.#write(initial)
    return initial
  }

  update(update: PreferencesUpdate): UserPreferences {
    const current = this.get()
    const next = userPreferencesSchema.parse({
      coursePriorities:
        update.coursePriorities ?? current.coursePriorities,
      agentAdapterAutomation:
        update.agentAdapterAutomation ?? current.agentAdapterAutomation,
    })
    const settings: UserPreferences = {
      ...next,
      updatedAt: this.#clock.now(),
    }
    this.#write(settings)
    return settings
  }

  #write(settings: UserPreferences): void {
    inTransaction(this.#db, () => {
      this.#db
        .prepare(
          `INSERT INTO user_preferences (
             preference_id, course_priorities_json,
             agent_adapter_automation, updated_at
           ) VALUES (?, ?, ?, ?)
           ON CONFLICT(preference_id) DO UPDATE SET
             course_priorities_json = excluded.course_priorities_json,
             agent_adapter_automation = excluded.agent_adapter_automation,
             updated_at = excluded.updated_at`,
        )
        .run(
          PREFERENCES_ID,
          JSON.stringify(settings.coursePriorities),
          settings.agentAdapterAutomation ? 1 : 0,
          settings.updatedAt,
        )
    })
  }
}
