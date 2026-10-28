import type { DisposableRegistration } from './capabilities.js'
import type { AcademicSourceAdapter } from './connector.js'
import type { ConnectionAuthKind, CredentialAccess } from './connections.js'

export const SOURCE_LOGIN_MODES = ['browser', 'manual'] as const
export type SourceLoginMode = (typeof SOURCE_LOGIN_MODES)[number]

export interface NormalizedCourse {
  sourceId: string
  externalCourseId: string
  termId: string
  code: string
  title: string
}

export interface SourceConfig {
  sourceId: string
  engine: string
  displayName: string
  authKind: 'none' | 'password' | 'token' | 'oauth'
  loginMode?: 'browser' | 'manual'
  config: Record<string, unknown>
  capabilities: string[]
  enabled: boolean
  archived: boolean
  version: number
  createdAt: string
  updatedAt: string
}

export interface SourceConfigInput {
  sourceId?: string
  engine: string
  displayName: string
  authKind: 'none' | 'password' | 'token' | 'oauth'
  loginMode?: 'browser' | 'manual'
  config?: Record<string, unknown>
  capabilities?: string[]
  enabled?: boolean
}

export interface SourceConfigUpdate {
  displayName?: string
  authKind?: 'none' | 'password' | 'token' | 'oauth'
  loginMode?: 'browser' | 'manual'
  config?: Record<string, unknown>
  capabilities?: string[]
  enabled?: boolean
}

export interface SourceConfigStoreApi {
  ensure(input: SourceConfigInput & { sourceId: string }): SourceConfig
  create(input: SourceConfigInput): SourceConfig
  get(sourceId: string): SourceConfig | undefined
  list(options?: { includeArchived?: boolean }): SourceConfig[]
  update(
    sourceId: string,
    update: SourceConfigUpdate,
    expectedVersion?: number,
  ): SourceConfig
  archive(sourceId: string): SourceConfig
}

export class SourceNotFoundError extends Error {
  readonly code = 'NOT_FOUND'

  constructor(sourceId: string) {
    super(`Source not found: ${sourceId}`)
    this.name = 'SourceNotFoundError'
  }
}

export class SourceConflictError extends Error {
  readonly code = 'CONFLICT'

  constructor(message: string) {
    super(message)
    this.name = 'SourceConflictError'
  }
}

export interface SourceEngineDescriptor {
  id: string
  displayName: string
  description?: string
  supportsSync: boolean
  supportsLogin: boolean
  supportsVerify: boolean
  /** Auth kinds this engine can actually use; omitted means unrestricted. */
  authKinds?: ConnectionAuthKind[]
  /** Login modes this engine can actually use; omitted means unrestricted. */
  loginModes?: SourceLoginMode[]
  /** Returns a user-facing message when the non-secret config is invalid. */
  validateConfig?(config: Record<string, unknown>): string | undefined
}

export interface SourceEngineContext {
  sourceId: string
  config: Record<string, unknown>
}

export interface SourceLoginResult {
  /** Serialized secret; the Host stores it in the system credential vault. */
  secret: string
  accountLabel?: string
}

export interface SourceVerification {
  ok: boolean
  accountLabel?: string
  message?: string
}

/**
 * Stable, vendor-neutral execution engine. A database source record selects an
 * engine and supplies non-secret config; vendor-specific behavior is data, not
 * a hardcoded application import.
 */
export interface SourceEngine {
  descriptor: SourceEngineDescriptor
  login?(context: SourceEngineContext): Promise<SourceLoginResult>
  verify?(
    context: SourceEngineContext,
    secret: string,
  ): Promise<SourceVerification>
  createAdapter?(context: SourceEngineContext): AcademicSourceAdapter
  listCourses?(
    context: SourceEngineContext,
    credentials?: CredentialAccess,
  ): Promise<NormalizedCourse[]>
}

export interface SourceEngineRegistryApi {
  register(engine: SourceEngine): DisposableRegistration
  get(engineId: string): SourceEngine | undefined
  list(): SourceEngine[]
}

export interface SourceProbeLink {
  text: string
  url: string
}

/** Sanitized read-only evidence for onboarding and adapter candidates. */
export interface SourceProbeEvidence {
  sourceId: string
  url: string
  finalUrl: string
  status: number
  title?: string
  contentType?: string
  bytes: number
  truncated: boolean
  headings: string[]
  links: SourceProbeLink[]
  paginationLinks: SourceProbeLink[]
  formCount: number
  tableCount: number
  jsonShape?: string
  loginLike: boolean
  warnings: string[]
  probedAt: string
}

export class SourceEngineRegistry implements SourceEngineRegistryApi {
  readonly #engines = new Map<string, SourceEngine>()

  register(engine: SourceEngine): DisposableRegistration {
    const id = engine.descriptor.id
    if (this.#engines.has(id)) {
      throw new SourceConflictError(`Source engine already registered: ${id}`)
    }
    this.#engines.set(id, engine)
    let disposed = false
    return {
      dispose: () => {
        if (disposed) return
        disposed = true
        if (this.#engines.get(id) === engine) this.#engines.delete(id)
      },
    }
  }

  get(engineId: string): SourceEngine | undefined {
    return this.#engines.get(engineId)
  }

  list(): SourceEngine[] {
    return [...this.#engines.values()]
  }
}
