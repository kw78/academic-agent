import type { DatabaseSync } from 'node:sqlite'
import { z } from 'zod'
import {
  CONNECTION_AUTH_KINDS,
  CONNECTION_STATUSES,
  type Clock,
  type ConnectionAuthKind,
  type ConnectionCredentialProvider,
  type ConnectionStatus,
  type ConnectionView,
  type CredentialAccess,
  type IdGenerator,
} from '@academic/contracts'
import type { SqlRow } from './database.js'
import type { CredentialVault } from './vault.js'

export class ConnectionAccessError extends Error {
  readonly code = 'CONNECTION_UNAVAILABLE'

  constructor(message: string) {
    super(message)
    this.name = 'ConnectionAccessError'
  }
}

const createConnectionSchema = z.object({
  sourceId: z.string().min(1),
  displayName: z.string().min(1),
  authKind: z.enum(CONNECTION_AUTH_KINDS),
  accountLabel: z.string().min(1).optional(),
  scopes: z.array(z.string().min(1)).optional(),
})

export interface CreateConnectionInput {
  sourceId: string
  displayName: string
  authKind: ConnectionAuthKind
  accountLabel?: string
  scopes?: string[]
}

export interface ConnectionVerification {
  ok: boolean
  accountLabel?: string
  message?: string
}

export type ConnectionVerifier = (
  secret: string,
  connection: ConnectionView,
) => ConnectionVerification | Promise<ConnectionVerification>

interface ConnectionRecord extends ConnectionView {
  credentialRef?: string
}

export interface ConnectionManagerOptions {
  db: DatabaseSync
  vault: CredentialVault
  clock: Clock
  ids: IdGenerator
}

/**
 * Owns connection metadata and lifecycle. The vault and credential references
 * stay private; callers can only request a scoped, source-checked lease.
 */
export class ConnectionManager implements ConnectionCredentialProvider {
  readonly #db: DatabaseSync
  readonly #vault: CredentialVault
  readonly #clock: Clock
  readonly #ids: IdGenerator

  constructor(options: ConnectionManagerOptions) {
    this.#db = options.db
    this.#vault = options.vault
    this.#clock = options.clock
    this.#ids = options.ids
  }

  create(input: CreateConnectionInput): ConnectionView {
    const parsed = createConnectionSchema.parse(input)
    const connectionId = this.#ids.next()
    const now = this.#clock.now()
    const credentialRef =
      parsed.authKind === 'none'
        ? null
        : `academic-agent/connection/${connectionId}`
    const status: ConnectionStatus =
      parsed.authKind === 'none' ? 'connected' : 'unconfigured'
    this.#db
      .prepare(
        `INSERT INTO source_connections (
           connection_id, source_id, display_name, account_label, auth_kind,
           scopes_json, status, credential_ref, has_credential,
           created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
      )
      .run(
        connectionId,
        parsed.sourceId,
        parsed.displayName,
        parsed.accountLabel ?? null,
        parsed.authKind,
        JSON.stringify(parsed.scopes ?? []),
        status,
        credentialRef,
        now,
        now,
      )
    return this.#view(this.#getRecord(connectionId)!)
  }

  list(): ConnectionView[] {
    const rows = this.#db
      .prepare('SELECT * FROM source_connections ORDER BY created_at ASC, rowid ASC')
      .all() as SqlRow[]
    return rows.map((row) => this.#view(this.#record(row)))
  }

  get(connectionId: string): ConnectionView | undefined {
    const record = this.#getRecord(connectionId)
    return record ? this.#view(record) : undefined
  }

  async setSecret(connectionId: string, secret: string): Promise<ConnectionView> {
    const record = this.#getRecord(connectionId)
    if (!record) throw new ConnectionAccessError('Unknown connection')
    if (record.authKind === 'none') {
      throw new ConnectionAccessError('This connection does not use a credential')
    }
    if (!record.credentialRef) {
      throw new ConnectionAccessError('Connection has no credential reference')
    }
    if (!secret) throw new ConnectionAccessError('Credential must not be empty')
    await this.#vault.set(record.credentialRef, secret)
    const now = this.#clock.now()
    this.#db
      .prepare(
        `UPDATE source_connections SET
           status = 'configured', has_credential = 1, last_error = NULL, updated_at = ?
         WHERE connection_id = ?`,
      )
      .run(now, connectionId)
    return this.#view(this.#getRecord(connectionId)!)
  }

  async verify(
    connectionId: string,
    verifier: ConnectionVerifier,
  ): Promise<ConnectionView> {
    const record = this.#getRecord(connectionId)
    if (!record) throw new ConnectionAccessError('Unknown connection')
    const secret = await this.#readSecret(record)
    if (secret === undefined) {
      await this.markAuthRequired(connectionId, 'Credential is missing')
      return this.#view(this.#getRecord(connectionId)!)
    }
    const result = await verifier(secret, this.#view(record))
    const now = this.#clock.now()
    if (result.ok) {
      this.#db
        .prepare(
          `UPDATE source_connections SET
             status = 'connected', account_label = ?, last_verified_at = ?,
             last_error = NULL, updated_at = ?
           WHERE connection_id = ?`,
        )
        .run(
          result.accountLabel ?? record.accountLabel ?? null,
          now,
          now,
          connectionId,
        )
    } else {
      this.#db
        .prepare(
          `UPDATE source_connections SET
             status = 'auth-required', last_error = ?, updated_at = ?
           WHERE connection_id = ?`,
        )
        .run(result.message ?? 'Credential verification failed', now, connectionId)
    }
    return this.#view(this.#getRecord(connectionId)!)
  }

  async disconnect(
    connectionId: string,
    options: { deleteCredential?: boolean } = {},
  ): Promise<ConnectionView> {
    const record = this.#getRecord(connectionId)
    if (!record) throw new ConnectionAccessError('Unknown connection')
    let hasCredential = record.hasCredential
    if (options.deleteCredential && record.credentialRef) {
      await this.#vault.delete(record.credentialRef)
      hasCredential = false
    }
    const now = this.#clock.now()
    this.#db
      .prepare(
        `UPDATE source_connections SET
           status = 'disconnected', has_credential = ?, last_error = NULL, updated_at = ?
         WHERE connection_id = ?`,
      )
      .run(Number(hasCredential), now, connectionId)
    return this.#view(this.#getRecord(connectionId)!)
  }

  async deleteCredential(connectionId: string): Promise<ConnectionView> {
    const record = this.#getRecord(connectionId)
    if (!record) throw new ConnectionAccessError('Unknown connection')
    if (record.credentialRef) await this.#vault.delete(record.credentialRef)
    const now = this.#clock.now()
    this.#db
      .prepare(
        `UPDATE source_connections SET
           status = 'unconfigured', has_credential = 0,
           last_verified_at = NULL, last_error = NULL, updated_at = ?
         WHERE connection_id = ?`,
      )
      .run(now, connectionId)
    return this.#view(this.#getRecord(connectionId)!)
  }

  async delete(connectionId: string): Promise<void> {
    const record = this.#getRecord(connectionId)
    if (!record) throw new ConnectionAccessError('Unknown connection')
    if (record.credentialRef) await this.#vault.delete(record.credentialRef)
    this.#db
      .prepare('DELETE FROM source_connections WHERE connection_id = ?')
      .run(connectionId)
  }

  async deleteBySource(sourceId: string): Promise<number> {
    const rows = this.#db
      .prepare('SELECT * FROM source_connections WHERE source_id = ?')
      .all(sourceId) as SqlRow[]
    for (const row of rows) {
      await this.delete(String(row.connection_id))
    }
    return rows.length
  }

  async markAuthRequired(connectionId: string, message: string): Promise<void> {
    this.#db
      .prepare(
        `UPDATE source_connections SET
           status = 'auth-required', last_error = ?, updated_at = ?
         WHERE connection_id = ?`,
      )
      .run(message, this.#clock.now(), connectionId)
  }

  async markSynced(connectionId: string, syncedAt: string): Promise<void> {
    this.#db
      .prepare(
        `UPDATE source_connections SET
           status = 'connected', last_sync_at = ?, last_error = NULL, updated_at = ?
         WHERE connection_id = ?`,
      )
      .run(syncedAt, this.#clock.now(), connectionId)
  }

  async openCredential(
    connectionId: string,
    sourceId: string,
  ): Promise<CredentialAccess> {
    const record = this.#getRecord(connectionId)
    if (!record) throw new ConnectionAccessError('Unknown connection')
    if (record.sourceId !== sourceId) {
      throw new ConnectionAccessError('Connection does not belong to this adapter source')
    }
    if (record.status !== 'configured' && record.status !== 'connected') {
      throw new ConnectionAccessError(`Connection is not usable: ${record.status}`)
    }
    if (!record.credentialRef || !record.hasCredential) {
      throw new ConnectionAccessError('Connection has no stored credential')
    }

    return {
      getSecret: async () => {
        const current = this.#getRecord(connectionId)
        if (
          !current ||
          (current.status !== 'configured' && current.status !== 'connected')
        ) {
          throw new ConnectionAccessError('Connection is no longer usable')
        }
        const secret = await this.#readSecret(current)
        if (secret === undefined) {
          await this.markAuthRequired(connectionId, 'Credential is missing')
          throw new ConnectionAccessError('Credential is missing')
        }
        return secret
      },
    }
  }

  async #readSecret(record: ConnectionRecord): Promise<string | undefined> {
    if (!record.credentialRef || !record.hasCredential) return undefined
    return this.#vault.get(record.credentialRef)
  }

  #getRecord(connectionId: string): ConnectionRecord | undefined {
    const row = this.#db
      .prepare('SELECT * FROM source_connections WHERE connection_id = ?')
      .get(connectionId) as SqlRow | undefined
    return row ? this.#record(row) : undefined
  }

  #record(row: SqlRow): ConnectionRecord {
    const status = String(row.status) as ConnectionStatus
    if (!CONNECTION_STATUSES.includes(status)) {
      throw new Error(`Invalid connection status: ${status}`)
    }
    return {
      connectionId: String(row.connection_id),
      sourceId: String(row.source_id),
      displayName: String(row.display_name),
      accountLabel:
        row.account_label == null ? undefined : String(row.account_label),
      authKind: String(row.auth_kind) as ConnectionAuthKind,
      scopes: JSON.parse(String(row.scopes_json)) as string[],
      status,
      hasCredential: Boolean(row.has_credential),
      lastVerifiedAt:
        row.last_verified_at == null ? undefined : String(row.last_verified_at),
      lastSyncAt: row.last_sync_at == null ? undefined : String(row.last_sync_at),
      lastError: row.last_error == null ? undefined : String(row.last_error),
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
      credentialRef:
        row.credential_ref == null ? undefined : String(row.credential_ref),
    }
  }

  #view(record: ConnectionRecord): ConnectionView {
    const { credentialRef: _credentialRef, ...view } = record
    return view
  }
}
