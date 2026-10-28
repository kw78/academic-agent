import type { DatabaseSync } from 'node:sqlite'
import { z } from 'zod'
import {
  SourceConflictError,
  SourceNotFoundError,
  type Clock,
  type IdGenerator,
  type SourceConfig,
  type SourceConfigInput,
  type SourceConfigStoreApi,
  type SourceConfigUpdate,
} from '@academic/contracts'

const AUTH_KINDS = ['none', 'password', 'token', 'oauth'] as const
const MAX_CONFIG_BYTES = 64 * 1024
const SECRET_SUFFIXES = [
  'password',
  'passwd',
  'pwd',
  'token',
  'cookie',
  'secret',
  'apikey',
  'authorization',
  'credential',
  'sessionid',
] as const
const SECRET_PREFIXES = ['secret', 'password', 'authorization', 'credential'] as const
const COOKIE_SECRET_KEYS = new Set([
  'cookie',
  'cookies',
  'cookieheader',
  'cookievalue',
  'cookiejar',
])
const SECRET_PARAMS = new Set([
  'pwd',
  'session',
  'sessionid',
  'sid',
  'auth',
  'code',
])

function normalizedKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, '')
}

function isSensitiveKey(key: string): boolean {
  const normalized = normalizedKey(key)
  if (SECRET_PARAMS.has(normalized)) return true
  if (COOKIE_SECRET_KEYS.has(normalized)) return true
  if (SECRET_SUFFIXES.some((suffix) => normalized === suffix || normalized.endsWith(suffix))) {
    return true
  }
  return SECRET_PREFIXES.some((prefix) => normalized.startsWith(prefix))
}

function assertSafeString(value: string, path: string): void {
  if (/^\s*bearer\s+/i.test(value)) {
    throw new SourceConflictError(
      `Source config must not contain credentials (${path}); use the credential vault`,
    )
  }
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return
  }
  if (url.username || url.password) {
    throw new SourceConflictError(
      `Source config must not contain credentials (${path}); use the credential vault`,
    )
  }
  for (const key of url.searchParams.keys()) {
    if (isSensitiveKey(key)) {
      throw new SourceConflictError(
        `Source config URL must not contain authentication parameters (${path}.${key})`,
      )
    }
  }
}

const sourceInputSchema = z.object({
  sourceId: z.string().min(1).max(200).optional(),
  engine: z.string().min(1).max(100),
  displayName: z.string().min(1).max(200),
  authKind: z.enum(AUTH_KINDS),
  loginMode: z.enum(['browser', 'manual']).optional(),
  config: z.record(z.string(), z.unknown()).optional(),
  capabilities: z.array(z.string().min(1).max(200)).max(50).optional(),
  enabled: z.boolean().optional(),
})

const sourceUpdateSchema = z.object({
  displayName: z.string().min(1).max(200).optional(),
  authKind: z.enum(AUTH_KINDS).optional(),
  loginMode: z.enum(['browser', 'manual']).optional(),
  config: z.record(z.string(), z.unknown()).optional(),
  capabilities: z.array(z.string().min(1).max(200)).max(50).optional(),
  enabled: z.boolean().optional(),
})

interface SourceRow {
  source_id: string
  engine: string
  display_name: string
  auth_kind: string
  login_mode: string | null
  config_json: string
  capabilities_json: string
  enabled: number
  archived: number
  version: number
  created_at: string
  updated_at: string
}

function assertNoSecrets(value: unknown, path = 'config'): void {
  if (typeof value === 'string') {
    assertSafeString(value, path)
    return
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertNoSecrets(entry, `${path}[${index}]`))
    return
  }
  if (value === null || typeof value !== 'object') return
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (isSensitiveKey(key)) {
      throw new SourceConflictError(
        `Source config must not contain credentials (${path}.${key}); use the credential vault`,
      )
    }
    assertNoSecrets(entry, `${path}.${key}`)
  }
}

function parseConfig(value: Record<string, unknown> | undefined): string {
  const config = value ?? {}
  const serialized = JSON.stringify(config)
  if (serialized.length > MAX_CONFIG_BYTES) {
    throw new SourceConflictError('Source config is too large')
  }
  assertNoSecrets(config)
  return serialized
}

export interface SourceValidationInput {
  engine: string
  authKind: string
  loginMode?: string
  config: Record<string, unknown>
}

export type SourceConfigChangeType =
  | 'created'
  | 'updated'
  | 'archived'
  | 'restored'
  | 'deleted'

/** Lets the composition root keep operational state (sync jobs) in step. */
export interface SourceConfigChange {
  type: SourceConfigChangeType
  sourceId: string
  enabled: boolean
  /** Previous enabled flag; only meaningful for 'updated'. */
  previouslyEnabled?: boolean
}

export interface SourceConfigStoreOptions {
  db: DatabaseSync
  clock: Clock
  ids: IdGenerator
  /** Engine-specific schema and capability check; must not accept secrets. */
  validateSource?: (input: SourceValidationInput) => string | undefined
  onChange?: (change: SourceConfigChange) => void
}

/** Operational source definitions; secrets never live in this table. */
export class SourceConfigStore implements SourceConfigStoreApi {
  readonly #db: DatabaseSync
  readonly #clock: Clock
  readonly #ids: IdGenerator
  readonly #validateSource: SourceConfigStoreOptions['validateSource']
  readonly #onChange: SourceConfigStoreOptions['onChange']

  constructor(options: SourceConfigStoreOptions) {
    this.#db = options.db
    this.#clock = options.clock
    this.#ids = options.ids
    this.#validateSource = options.validateSource
    this.#onChange = options.onChange
  }

  #assertValid(input: SourceValidationInput): void {
    const error = this.#validateSource?.(input)
    if (error) {
      throw new SourceConflictError(`Source config invalid: ${error}`)
    }
  }

  ensure(input: SourceConfigInput & { sourceId: string }): SourceConfig {
    const existing = this.get(input.sourceId)
    return existing ?? this.create(input)
  }

  create(input: SourceConfigInput): SourceConfig {
    const parsed = sourceInputSchema.parse(input)
    const configJson = parseConfig(parsed.config)
    this.#assertValid({
      engine: parsed.engine,
      authKind: parsed.authKind,
      ...(parsed.loginMode ? { loginMode: parsed.loginMode } : {}),
      config: parsed.config ?? {},
    })
    const sourceId = parsed.sourceId ?? this.#ids.next()
    if (this.get(sourceId)) {
      throw new SourceConflictError(`Source already exists: ${sourceId}`)
    }
    const now = this.#clock.now()
    try {
      this.#db
        .prepare(
          `INSERT INTO academic_sources (
             source_id, engine, display_name, auth_kind, login_mode,
             config_json, capabilities_json, enabled, archived, version,
             created_at, updated_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 1, ?, ?)`,
        )
        .run(
          sourceId,
          parsed.engine,
          parsed.displayName,
          parsed.authKind,
          parsed.loginMode ?? null,
          configJson,
          JSON.stringify(parsed.capabilities ?? []),
          parsed.enabled === false ? 0 : 1,
          now,
          now,
        )
    } catch (error) {
      if (String(error).includes('UNIQUE')) {
        throw new SourceConflictError(`Source already exists: ${sourceId}`)
      }
      throw error
    }
    const created = this.get(sourceId)!
    this.#onChange?.({
      type: 'created',
      sourceId,
      enabled: created.enabled,
    })
    return created
  }

  get(sourceId: string): SourceConfig | undefined {
    const row = this.#db
      .prepare('SELECT * FROM academic_sources WHERE source_id = ?')
      .get(sourceId) as unknown as SourceRow | undefined
    return row ? this.#toConfig(row) : undefined
  }

  list(options: { includeArchived?: boolean } = {}): SourceConfig[] {
    const rows = (
      options.includeArchived
        ? this.#db
            .prepare('SELECT * FROM academic_sources ORDER BY created_at ASC, rowid ASC')
            .all()
        : this.#db
            .prepare(
              'SELECT * FROM academic_sources WHERE archived = 0 ORDER BY created_at ASC, rowid ASC',
            )
            .all()
    ) as unknown as SourceRow[]
    return rows.map((row) => this.#toConfig(row))
  }

  update(
    sourceId: string,
    update: SourceConfigUpdate,
    expectedVersion?: number,
  ): SourceConfig {
    const current = this.get(sourceId)
    if (!current) throw new SourceNotFoundError(sourceId)
    if (current.archived) {
      throw new SourceConflictError('Archived source cannot be updated')
    }
    if (expectedVersion !== undefined && expectedVersion !== current.version) {
      throw new SourceConflictError(
        `Source version changed: expected ${expectedVersion}, got ${current.version}`,
      )
    }
    const parsed = sourceUpdateSchema.parse(update)
    const next = {
      displayName: parsed.displayName ?? current.displayName,
      authKind: parsed.authKind ?? current.authKind,
      loginMode: parsed.loginMode ?? current.loginMode,
      config: parsed.config ?? current.config,
      capabilities: parsed.capabilities ?? current.capabilities,
      enabled: parsed.enabled ?? current.enabled,
    }
    const configJson = parseConfig(next.config)
    this.#assertValid({
      engine: current.engine,
      authKind: next.authKind,
      ...(next.loginMode ? { loginMode: next.loginMode } : {}),
      config: next.config,
    })
    const now = this.#clock.now()
    this.#db
      .prepare(
        `UPDATE academic_sources SET
           display_name = ?, auth_kind = ?, login_mode = ?,
           config_json = ?, capabilities_json = ?, enabled = ?,
           version = version + 1, updated_at = ?
         WHERE source_id = ?`,
      )
      .run(
        next.displayName,
        next.authKind,
        next.loginMode ?? null,
        configJson,
        JSON.stringify(next.capabilities),
        next.enabled ? 1 : 0,
        now,
        sourceId,
      )
    const updatedConfig = this.get(sourceId)!
    this.#onChange?.({
      type: 'updated',
      sourceId,
      enabled: updatedConfig.enabled,
      previouslyEnabled: current.enabled,
    })
    return updatedConfig
  }

  archive(sourceId: string): SourceConfig {
    const current = this.get(sourceId)
    if (!current) throw new SourceNotFoundError(sourceId)
    const now = this.#clock.now()
    this.#db
      .prepare(
        `UPDATE academic_sources SET
           archived = 1, enabled = 0, version = version + 1, updated_at = ?
         WHERE source_id = ?`,
      )
      .run(now, sourceId)
    const archived = this.get(sourceId)!
    this.#onChange?.({ type: 'archived', sourceId, enabled: false })
    return archived
  }

  restore(sourceId: string): SourceConfig {
    const current = this.get(sourceId)
    if (!current) throw new SourceNotFoundError(sourceId)
    if (!current.archived) return current
    const now = this.#clock.now()
    this.#db
      .prepare(
        `UPDATE academic_sources SET
           archived = 0, enabled = 1, version = version + 1, updated_at = ?
         WHERE source_id = ?`,
      )
      .run(now, sourceId)
    const restored = this.get(sourceId)!
    this.#onChange?.({
      type: 'restored',
      sourceId,
      enabled: restored.enabled,
    })
    return restored
  }

  delete(sourceId: string): void {
    const current = this.get(sourceId)
    if (!current) throw new SourceNotFoundError(sourceId)
    this.#db
      .prepare('DELETE FROM academic_sources WHERE source_id = ?')
      .run(sourceId)
    this.#onChange?.({ type: 'deleted', sourceId, enabled: false })
  }

  #toConfig(row: SourceRow): SourceConfig {
    return {
      sourceId: row.source_id,
      engine: row.engine,
      displayName: row.display_name,
      authKind: row.auth_kind as SourceConfig['authKind'],
      ...(row.login_mode
        ? { loginMode: row.login_mode as 'browser' | 'manual' }
        : {}),
      config: JSON.parse(row.config_json) as Record<string, unknown>,
      capabilities: JSON.parse(row.capabilities_json) as string[],
      enabled: Boolean(row.enabled),
      archived: Boolean(row.archived),
      version: Number(row.version),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }
  }
}

export {
  probeSourcePage,
  probeUrlFor,
  type ProbeSourcePageInput,
} from './probe.js'
export {
  ProbeSampleStore,
  type CapturedProbeSample,
  type ProbeSampleSummary,
  type ProbeSampleStoreOptions,
} from './sample-store.js'
export {
  ProbeRateLimiter,
  type ProbeRateLimiterOptions,
} from './probe-rate-limit.js'
export {
  crawlSourcePages,
  type CrawlSourcePagesInput,
} from './crawl.js'
export {
  buildCaptureSummary,
  maskedUrl,
  type BuildCaptureSummaryInput,
  type CapturedSampleInput,
} from './capture.js'
