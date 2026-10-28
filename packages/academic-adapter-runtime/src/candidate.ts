import type {
  AdapterCandidatePort,
  AdapterCandidateReport,
  AdapterCandidateSummary,
  AdapterSample,
} from '@academic/contracts'
import { parseManifest, ManifestRegistry } from './manifest.js'
import { replayManifest } from './runtime.js'
import { ManifestStore, type StoredCandidate } from './store.js'

export interface AdapterCandidateServiceOptions {
  now?: () => string
}

function summary(stored: StoredCandidate): AdapterCandidateSummary {
  const manifest = stored.manifest
  const dataTypes: Array<'courses' | 'assignments' | 'detail'> = [
    'courses',
    'assignments',
  ]
  if (manifest.detail) dataTypes.push('detail')
  return {
    adapterId: manifest.adapterId,
    version: manifest.version,
    displayName: manifest.displayName,
    status: stored.status,
    createdAt: stored.createdAt,
    updatedAt: stored.updatedAt,
    scope: {
      allowedOrigins: [...manifest.allowedOrigins],
      allowedPathPrefixes: [...manifest.allowedPathPrefixes],
      dataTypes,
      fields: {
        courses: Object.keys(manifest.courses.fields),
        assignments: Object.keys(manifest.assignments.fields),
        ...(manifest.detail
          ? { detail: Object.keys(manifest.detail.fields) }
          : {}),
      },
    },
  }
}

export class AdapterCandidateService implements AdapterCandidatePort {
  readonly #store: ManifestStore
  readonly #registry: ManifestRegistry
  readonly #now: (() => string) | undefined

  constructor(
    store: ManifestStore,
    registry: ManifestRegistry,
    options: AdapterCandidateServiceOptions = {},
  ) {
    this.#store = store
    this.#registry = registry
    this.#now = options.now
  }

  async validate(
    manifest: unknown,
    samples: AdapterSample[],
  ): Promise<AdapterCandidateReport> {
    return replayManifest(manifest, samples, {
      ...(this.#now ? { now: this.#now } : {}),
    })
  }

  async register(
    manifest: unknown,
    samples: AdapterSample[],
  ): Promise<{ summary: AdapterCandidateSummary; report: AdapterCandidateReport }> {
    const report = await this.validate(manifest, samples)
    const parsed = parseManifest(manifest)
    const stored = this.#store.save(parsed, report)
    return { summary: summary(stored), report }
  }

  list(adapterId?: string): AdapterCandidateSummary[] {
    return this.#store.list(adapterId).map(summary)
  }

  activate(adapterId: string, version: string): AdapterCandidateSummary {
    const stored = this.#store.activate(adapterId, version)
    this.#ensureRegistered(stored)
    this.#registry.activate(adapterId, version)
    return summary(stored)
  }

  rollback(adapterId: string, version?: string): AdapterCandidateSummary {
    const stored = this.#store.rollback(adapterId, version)
    this.#ensureRegistered(stored)
    this.#registry.activate(adapterId, stored.manifest.version)
    return summary(stored)
  }

  /** Load active manifests into the runtime registry after startup. */
  loadActive(): void {
    for (const stored of this.#store.listActive()) {
      this.#ensureRegistered(stored)
      this.#registry.activate(
        stored.manifest.adapterId,
        stored.manifest.version,
      )
    }
  }

  #ensureRegistered(stored: StoredCandidate): void {
    const existing = this.#registry.get(
      stored.manifest.adapterId,
      stored.manifest.version,
    )
    if (!existing) this.#registry.register(stored.manifest)
  }
}
