export const CONNECTION_AUTH_KINDS = ['password', 'token', 'oauth', 'none'] as const
export type ConnectionAuthKind = (typeof CONNECTION_AUTH_KINDS)[number]

export const CONNECTION_STATUSES = [
  'unconfigured',
  'configured',
  'connected',
  'auth-required',
  'error',
  'disconnected',
] as const
export type ConnectionStatus = (typeof CONNECTION_STATUSES)[number]

export interface ConnectionView {
  connectionId: string
  sourceId: string
  displayName: string
  accountLabel?: string
  authKind: ConnectionAuthKind
  scopes: string[]
  status: ConnectionStatus
  hasCredential: boolean
  lastVerifiedAt?: string
  lastSyncAt?: string
  lastError?: string
  createdAt: string
  updatedAt: string
}

export interface CredentialAccess {
  getSecret(): Promise<string>
}

/**
 * Connector-facing port. It deliberately exposes no way to enumerate or read
 * another connection's credential.
 */
export interface ConnectionCredentialProvider {
  openCredential(
    connectionId: string,
    sourceId: string,
  ): Promise<CredentialAccess>
  markAuthRequired(connectionId: string, message: string): void | Promise<void>
  markSynced(connectionId: string, syncedAt: string): void | Promise<void>
}

export interface ConnectionSyncBinding {
  connectionId: string
  credentials: ConnectionCredentialProvider
}

export interface AdapterFetchContext {
  credentials?: CredentialAccess
}
