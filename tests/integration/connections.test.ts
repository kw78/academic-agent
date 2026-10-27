import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  AdapterAuthError,
  type AcademicSourceAdapter,
  type AdapterResult,
} from '@academic/contracts'
import {
  ConnectionManager,
  CredentialVaultUnavailableError,
  DpapiCredentialVault,
  InMemoryCredentialVault,
  UnavailableCredentialVault,
  type CredentialVault,
} from '@academic/connections'
import { ConnectorService } from '@academic/connectors'
import {
  createTestStore,
  fixedClock,
  sequentialIds,
} from '../helpers/store.js'

const SECRET = JSON.stringify({ token: 'super-secret-token' })

const cleanup: Array<() => void> = []

afterEach(() => {
  for (const dispose of cleanup.splice(0).reverse()) dispose()
})

class SecureAdapter implements AcademicSourceAdapter {
  readonly id = 'secure-lms'
  readonly sourceId = 'secure-lms'
  calls = 0

  constructor(private readonly expectedToken: string) {}

  async fetch(context?: { credentials?: { getSecret(): Promise<string> } }): Promise<AdapterResult> {
    this.calls += 1
    const raw = await context?.credentials?.getSecret()
    if (!raw) throw new AdapterAuthError('Credential is missing')
    const parsed = JSON.parse(raw) as { token?: string }
    if (parsed.token !== this.expectedToken) {
      throw new AdapterAuthError('Credential is invalid')
    }
    return {
      items: [
        {
          sourceId: this.sourceId,
          externalItemId: 'secure-1',
          courseExternalId: 'SEC101',
          kind: 'assignment',
          title: 'Secure assignment',
          due: {
            kind: 'instant',
            utc: '2026-11-01T10:00:00.000Z',
            zone: 'UTC',
          },
          contentHash: 'secure-hash',
        },
      ],
      completeness: 'full',
      fetchedAt: '2026-10-27T10:00:00.000Z',
      warnings: [],
    }
  }
}

function setup(vault: CredentialVault = new InMemoryCredentialVault()) {
  const clock = fixedClock()
  const store = createTestStore({ clock })
  const manager = new ConnectionManager({
    db: store.database,
    vault,
    clock,
    ids: sequentialIds('connection'),
  })
  const connector = new ConnectorService({
    db: store.database,
    commands: store.commands,
    queries: store.queries,
    clock,
    ids: sequentialIds('connector'),
  })
  cleanup.push(() => store.close())
  return { clock, store, manager, connector, vault }
}

async function createVerifiedConnection(
  manager: ConnectionManager,
  token = 'super-secret-token',
) {
  const connection = manager.create({
    sourceId: 'secure-lms',
    displayName: 'Secure LMS',
    authKind: 'token',
  })
  await manager.setSecret(connection.connectionId, JSON.stringify({ token }))
  return manager.verify(connection.connectionId, (secret) => ({
    ok: (JSON.parse(secret) as { token?: string }).token === token,
    accountLabel: 'student-1',
  }))
}

describe('CRED-01 connection lifecycle', () => {
  it('fails closed when no OS credential vault is available', async () => {
    const vault = new UnavailableCredentialVault()
    await expect(vault.set('ref', 'secret')).rejects.toBeInstanceOf(
      CredentialVaultUnavailableError,
    )
    await expect(vault.get('ref')).rejects.toBeInstanceOf(
      CredentialVaultUnavailableError,
    )
    await expect(vault.delete('ref')).rejects.toBeInstanceOf(
      CredentialVaultUnavailableError,
    )
  })

  it('stores secrets outside the database and survives a manager restart', async () => {
    const { clock, store, manager, vault } = setup()
    const connection = await createVerifiedConnection(manager)
    expect(connection).toMatchObject({
      status: 'connected',
      hasCredential: true,
      accountLabel: 'student-1',
    })

    const dump = JSON.stringify({
      connections: store.database.prepare('SELECT * FROM source_connections').all(),
      events: store.database.prepare('SELECT * FROM domain_events').all(),
    })
    expect(dump).not.toContain('super-secret-token')
    expect(manager.get(connection.connectionId)).not.toHaveProperty('credentialRef')

    const restarted = new ConnectionManager({
      db: store.database,
      vault,
      clock,
      ids: sequentialIds('restart'),
    })
    expect(restarted.get(connection.connectionId)).toMatchObject({
      status: 'connected',
      hasCredential: true,
    })
    const lease = await restarted.openCredential(
      connection.connectionId,
      'secure-lms',
    )
    expect(await lease.getSecret()).toContain('super-secret-token')

    await expect(
      manager.openCredential(connection.connectionId, 'other-source'),
    ).rejects.toThrow(/does not belong/)
  })

  it('marks failed verification as auth-required and re-authenticates', async () => {
    const { manager } = setup()
    const connection = manager.create({
      sourceId: 'secure-lms',
      displayName: 'Secure LMS',
      authKind: 'token',
    })
    await manager.setSecret(connection.connectionId, SECRET)
    expect(
      await manager.verify(connection.connectionId, () => ({
        ok: false,
        message: 'expired',
      })),
    ).toMatchObject({ status: 'auth-required', lastError: 'expired' })
    await expect(
      manager.openCredential(connection.connectionId, 'secure-lms'),
    ).rejects.toThrow(/not usable/)

    await manager.setSecret(connection.connectionId, SECRET)
    expect(
      await manager.verify(connection.connectionId, () => ({ ok: true })),
    ).toMatchObject({ status: 'connected' })
  })

  it('disconnects and deletes credentials without touching academic data', async () => {
    const { store, manager, connector } = setup()
    const connection = await createVerifiedConnection(manager)
    await connector.registerCourse({
      sourceId: 'secure-lms',
      externalCourseId: 'SEC101',
      termId: '2026-fall',
      code: 'SEC101',
      title: 'Secure Course',
    })
    const adapter = new SecureAdapter('super-secret-token')
    expect(
      await connector.sync(adapter, {
        connection: {
          connectionId: connection.connectionId,
          credentials: manager,
        },
      }),
    ).toMatchObject({ status: 'success', created: 1 })
    const eventCount = (
      store.database.prepare('SELECT COUNT(*) AS count FROM domain_events').get() as {
        count: number
      }
    ).count

    await manager.disconnect(connection.connectionId)
    expect(manager.get(connection.connectionId)?.status).toBe('disconnected')
    const calls = adapter.calls
    expect(
      await connector.sync(adapter, {
        connection: {
          connectionId: connection.connectionId,
          credentials: manager,
        },
      }),
    ).toMatchObject({ status: 'failed', errorCode: 'CONNECTION_UNAVAILABLE' })
    expect(adapter.calls).toBe(calls)

    await manager.deleteCredential(connection.connectionId)
    expect(manager.get(connection.connectionId)).toMatchObject({
      status: 'unconfigured',
      hasCredential: false,
    })
    expect(
      store.database.prepare('SELECT COUNT(*) AS count FROM domain_events').get(),
    ).toMatchObject({ count: eventCount })
    expect(await store.queries.listAcademicItems()).toMatchObject({
      items: expect.arrayContaining([
        expect.objectContaining({ title: 'Secure assignment' }),
      ]),
    })
  })

  it('stops on adapter auth failure and preserves old data', async () => {
    const { store, manager, connector } = setup()
    const connection = await createVerifiedConnection(manager)
    await connector.registerCourse({
      sourceId: 'secure-lms',
      externalCourseId: 'SEC101',
      termId: '2026-fall',
      code: 'SEC101',
      title: 'Secure Course',
    })
    const good = new SecureAdapter('super-secret-token')
    await connector.sync(good, {
      connection: { connectionId: connection.connectionId, credentials: manager },
    })
    const eventCount = (
      store.database.prepare('SELECT COUNT(*) AS count FROM domain_events').get() as {
        count: number
      }
    ).count

    await manager.setSecret(connection.connectionId, JSON.stringify({ token: 'wrong' }))
    const bad = new SecureAdapter('super-secret-token')
    expect(
      await connector.sync(bad, {
        connection: {
          connectionId: connection.connectionId,
          credentials: manager,
        },
      }),
    ).toMatchObject({ status: 'auth-required', errorCode: 'AUTH_REQUIRED' })
    expect(manager.get(connection.connectionId)?.status).toBe('auth-required')
    expect(
      store.database.prepare('SELECT COUNT(*) AS count FROM domain_events').get(),
    ).toMatchObject({ count: eventCount })
    expect((await store.queries.listAcademicItems()).items).toHaveLength(1)
  })
})

describe('CRED-02 protected credential sync', () => {
  it.skipIf(!DpapiCredentialVault.isAvailable())(
    'synchronizes with a DPAPI-protected credential and never persists plaintext',
    async () => {
      mkdirSync('.data', { recursive: true })
      const vaultDirectory = mkdtempSync(join('.data', 'dpapi-vault-'))
      cleanup.push(() => rmSync(vaultDirectory, { recursive: true, force: true }))
      const vault = new DpapiCredentialVault(vaultDirectory)
      const { store, manager, connector } = setup(vault)
      const connection = await createVerifiedConnection(manager)
      await connector.registerCourse({
        sourceId: 'secure-lms',
        externalCourseId: 'SEC101',
        termId: '2026-fall',
        code: 'SEC101',
        title: 'Secure Course',
      })

      const summary = await connector.sync(new SecureAdapter('super-secret-token'), {
        connection: {
          connectionId: connection.connectionId,
          credentials: manager,
        },
      })
      expect(summary).toMatchObject({ status: 'success', created: 1 })
      expect((await store.queries.listAcademicItems()).items).toHaveLength(1)

      const files = readdirSync(vaultDirectory)
      expect(files.length).toBe(1)
      const ciphertext = readFileSync(join(vaultDirectory, files[0]!), 'utf8')
      expect(ciphertext).not.toContain('super-secret-token')
      const dump = JSON.stringify({
        connections: store.database.prepare('SELECT * FROM source_connections').all(),
        events: store.database.prepare('SELECT * FROM domain_events').all(),
        runs: store.database.prepare('SELECT * FROM sync_runs').all(),
        notifications: store.database.prepare('SELECT * FROM notifications').all(),
      })
      expect(dump).not.toContain('super-secret-token')
    },
    20_000,
  )
})
