import { homedir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Service, type Context } from '@deepseek-ai/cordis'
import { createAcademicApp, type AcademicApp } from '@academic/application'

export interface AcademicHostConfig {
  databasePath?: string
  migrationsDir?: string
  agentWrites?: boolean
  startBackground?: boolean
  logLoad?: boolean
  notificationWindowDays?: number
  replanHorizonDays?: number
  defaultTaskEstimates?: Partial<Record<'assignment' | 'exam' | 'quiz', number>>
}

const DEFAULT_MIGRATIONS_DIR = fileURLToPath(new URL('../migrations/', import.meta.url))

function defaultDatabasePath(): string {
  const home = process.env.DSH_HOME ?? join(homedir(), '.dsh')
  return join(home, 'academic-agent', 'academic.db')
}

/**
 * Owns the Academic App process resources. Feature plugins (planner, tools)
 * inject this service; unloading them never closes the store or scheduler.
 */
export class AcademicAppService extends Service {
  readonly appReady: Promise<AcademicApp>

  constructor(ctx: Context, config: AcademicHostConfig = {}) {
    super(ctx, 'academicApp')
    const databasePath =
      config.databasePath ??
      process.env.ACADEMIC_AGENT_DB ??
      defaultDatabasePath()

    this.appReady = createAcademicApp({
      databasePath,
      migrationsDir: config.migrationsDir ?? DEFAULT_MIGRATIONS_DIR,
      agentWrites: config.agentWrites ?? false,
      registerPlannerCapability: false,
      ...(config.notificationWindowDays
        ? { notificationWindowDays: config.notificationWindowDays }
        : {}),
      ...(config.replanHorizonDays
        ? { replanHorizonDays: config.replanHorizonDays }
        : {}),
      ...(config.defaultTaskEstimates
        ? { defaultTaskEstimates: config.defaultTaskEstimates }
        : {}),
    })

    ctx.effect(async () => {
      const app = await this.appReady
      if (config.startBackground !== false) app.start()
      if (config.logLoad !== false) {
        console.log(`[academic-host] loaded db=${databasePath}`)
      }
      return () => app.close()
    }, 'academic-host')
  }

  getApp = (): Promise<AcademicApp> => this.appReady
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    academicApp: AcademicAppService
  }
}

export default AcademicAppService
