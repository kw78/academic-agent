import type { DatabaseSync } from 'node:sqlite'
import type {
  AdapterCandidateReport,
  AdapterCandidateStatus,
  Clock,
} from '@academic/contracts'
import type { AdapterManifest } from './manifest.js'

export interface StoredCandidate {
  manifest: AdapterManifest
  report: AdapterCandidateReport
  status: AdapterCandidateStatus
  createdAt: string
  updatedAt: string
}

interface CandidateRow {
  adapter_id: string
  version: string
  status: string
  manifest_json: string
  report_json: string
  created_at: string
  updated_at: string
}

export interface ManifestStoreOptions {
  db: DatabaseSync
  clock: Clock
}

export class ManifestStore {
  readonly #db: DatabaseSync
  readonly #clock: Clock

  constructor(options: ManifestStoreOptions) {
    this.#db = options.db
    this.#clock = options.clock
  }

  save(
    manifest: AdapterManifest,
    report: AdapterCandidateReport,
  ): StoredCandidate {
    if (this.get(manifest.adapterId, manifest.version)) {
      throw new Error(
        `Adapter version already exists: ${manifest.adapterId}@${manifest.version}`,
      )
    }
    const now = this.#clock.now()
    this.#db
      .prepare(
        `INSERT INTO adapter_manifests (
           adapter_id, version, status, manifest_json, report_json,
           created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        manifest.adapterId,
        manifest.version,
        report.ok ? 'validated' : 'candidate',
        JSON.stringify(manifest),
        JSON.stringify(report),
        now,
        now,
      )
    return this.get(manifest.adapterId, manifest.version)!
  }

  get(adapterId: string, version: string): StoredCandidate | undefined {
    const row = this.#db
      .prepare(
        'SELECT * FROM adapter_manifests WHERE adapter_id = ? AND version = ?',
      )
      .get(adapterId, version) as unknown as CandidateRow | undefined
    return row ? this.#view(row) : undefined
  }

  list(adapterId?: string): StoredCandidate[] {
    const rows = (
      adapterId
        ? this.#db
            .prepare(
              'SELECT * FROM adapter_manifests WHERE adapter_id = ? ORDER BY created_at DESC, version DESC',
            )
            .all(adapterId)
        : this.#db
            .prepare(
              'SELECT * FROM adapter_manifests ORDER BY created_at DESC, version DESC',
            )
            .all()
    ) as unknown as CandidateRow[]
    return rows.map((row) => this.#view(row))
  }

  active(adapterId: string): StoredCandidate | undefined {
    const row = this.#db
      .prepare(
        `SELECT m.* FROM adapter_active a
         JOIN adapter_manifests m
           ON m.adapter_id = a.adapter_id AND m.version = a.version
         WHERE a.adapter_id = ?`,
      )
      .get(adapterId) as unknown as CandidateRow | undefined
    return row ? this.#view(row) : undefined
  }

  listActive(): StoredCandidate[] {
    const rows = this.#db
      .prepare(
        `SELECT m.* FROM adapter_active a
         JOIN adapter_manifests m
           ON m.adapter_id = a.adapter_id AND m.version = a.version
         ORDER BY a.adapter_id`,
      )
      .all() as unknown as CandidateRow[]
    return rows.map((row) => this.#view(row))
  }

  activate(adapterId: string, version: string): StoredCandidate {
    const stored = this.get(adapterId, version)
    if (!stored) throw new Error(`Unknown adapter version: ${adapterId}@${version}`)
    if (stored.status !== 'validated') {
      throw new Error('Only validated adapter versions can be activated')
    }
    this.#db
      .prepare(
        `INSERT INTO adapter_active (adapter_id, version, activated_at)
         VALUES (?, ?, ?)
         ON CONFLICT(adapter_id) DO UPDATE SET
           version = excluded.version,
           activated_at = excluded.activated_at`,
      )
      .run(adapterId, version, this.#clock.now())
    return this.get(adapterId, version)!
  }

  rollback(adapterId: string, version?: string): StoredCandidate {
    if (version) return this.activate(adapterId, version)
    const current = this.active(adapterId)
    const previous = this.#db
      .prepare(
        `SELECT * FROM adapter_manifests
         WHERE adapter_id = ? AND status = 'validated'
           AND (? IS NULL OR version <> ?)
         ORDER BY created_at DESC, version DESC
         LIMIT 1`,
      )
      .get(adapterId, current?.manifest.version ?? null, current?.manifest.version ?? null) as unknown as CandidateRow | undefined
    if (!previous) throw new Error('No previous validated adapter version')
    return this.activate(adapterId, previous.version)
  }

  #view(row: CandidateRow): StoredCandidate {
    const status = row.status as AdapterCandidateStatus
    return {
      manifest: JSON.parse(row.manifest_json) as AdapterManifest,
      report: JSON.parse(row.report_json) as AdapterCandidateReport,
      status,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }
  }
}
