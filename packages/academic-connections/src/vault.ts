import { spawn, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

export interface CredentialVault {
  set(reference: string, secret: string): Promise<void>
  get(reference: string): Promise<string | undefined>
  delete(reference: string): Promise<boolean>
}

export class CredentialVaultUnavailableError extends Error {
  readonly code = 'CREDENTIAL_VAULT_UNAVAILABLE'

  constructor(message = 'The operating-system credential vault is unavailable') {
    super(message)
    this.name = 'CredentialVaultUnavailableError'
  }
}

export class InMemoryCredentialVault implements CredentialVault {
  readonly #secrets = new Map<string, string>()

  async set(reference: string, secret: string): Promise<void> {
    this.#secrets.set(reference, secret)
  }

  async get(reference: string): Promise<string | undefined> {
    return this.#secrets.get(reference)
  }

  async delete(reference: string): Promise<boolean> {
    return this.#secrets.delete(reference)
  }
}

export class UnavailableCredentialVault implements CredentialVault {
  async set(_reference: string, _secret: string): Promise<void> {
    throw new CredentialVaultUnavailableError()
  }

  async get(_reference: string): Promise<string | undefined> {
    throw new CredentialVaultUnavailableError()
  }

  async delete(_reference: string): Promise<boolean> {
    throw new CredentialVaultUnavailableError()
  }
}

const DPAPI_ENTROPY = 'academic-agent-v1'

const ENCRYPT_SCRIPT = `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Security
$plain = [Console]::In.ReadToEnd()
$entropy = [Text.Encoding]::UTF8.GetBytes('${DPAPI_ENTROPY}')
$bytes = [Text.Encoding]::UTF8.GetBytes($plain)
$protected = [Security.Cryptography.ProtectedData]::Protect(
  $bytes,
  $entropy,
  [Security.Cryptography.DataProtectionScope]::CurrentUser
)
[Console]::Out.Write([Convert]::ToBase64String($protected))
`

const DECRYPT_SCRIPT = `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Security
$encoded = [Console]::In.ReadToEnd()
$entropy = [Text.Encoding]::UTF8.GetBytes('${DPAPI_ENTROPY}')
$protected = [Convert]::FromBase64String($encoded)
$bytes = [Security.Cryptography.ProtectedData]::Unprotect(
  $protected,
  $entropy,
  [Security.Cryptography.DataProtectionScope]::CurrentUser
)
[Console]::Out.Write([Text.Encoding]::UTF8.GetString($bytes))
`

function defaultVaultDirectory(): string {
  const base =
    process.env.LOCALAPPDATA ??
    join(homedir(), 'AppData', 'Local')
  return join(base, 'AcademicAgent', 'vault')
}

function referenceFileName(reference: string): string {
  return `${createHash('sha256').update(reference).digest('hex')}.bin`
}

function runPowerShell(
  script: string,
  input: string,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', script],
      { windowsHide: true },
    )
    let stdout = ''
    let stderr = ''
    let settled = false
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      child.kill()
      reject(new Error('PowerShell DPAPI operation timed out'))
    }, 15_000)

    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8')
    })
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8')
    })
    child.on('error', (error) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      reject(error)
    })
    child.on('close', (code) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (code === 0) resolve(stdout)
      else {
        reject(
          new Error(
            `PowerShell DPAPI operation failed with exit code ${code}: ${stderr.trim().slice(0, 200)}`,
          ),
        )
      }
    })
    child.stdin.end(input)
  })
}

/**
 * MVP OS-backed vault: secrets are encrypted with Windows DPAPI (CurrentUser)
 * and only the ciphertext is stored on disk. If DPAPI/PowerShell is unavailable
 * every operation fails closed; there is no plaintext fallback.
 */
export class DpapiCredentialVault implements CredentialVault {
  readonly #directory: string

  constructor(directory = defaultVaultDirectory()) {
    this.#directory = directory
  }

  static isAvailable(): boolean {
    if (process.platform !== 'win32') return false
    const result = spawnSync(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', 'exit 0'],
      { windowsHide: true, timeout: 5_000 },
    )
    return result.status === 0
  }

  async set(reference: string, secret: string): Promise<void> {
    if (process.platform !== 'win32') throw new CredentialVaultUnavailableError()
    const encrypted = (await runPowerShell(ENCRYPT_SCRIPT, secret)).trim()
    if (!encrypted) throw new Error('DPAPI returned an empty ciphertext')
    mkdirSync(this.#directory, { recursive: true })
    writeFileSync(this.#path(reference), encrypted, {
      encoding: 'utf8',
      mode: 0o600,
    })
  }

  async get(reference: string): Promise<string | undefined> {
    if (process.platform !== 'win32') throw new CredentialVaultUnavailableError()
    const path = this.#path(reference)
    if (!existsSync(path)) return undefined
    const ciphertext = readFileSync(path, 'utf8').trim()
    if (!ciphertext) return undefined
    return runPowerShell(DECRYPT_SCRIPT, ciphertext)
  }

  async delete(reference: string): Promise<boolean> {
    if (process.platform !== 'win32') throw new CredentialVaultUnavailableError()
    const path = this.#path(reference)
    if (!existsSync(path)) return false
    rmSync(path, { force: true })
    return true
  }

  #path(reference: string): string {
    return join(this.#directory, referenceFileName(reference))
  }
}

export function createDefaultCredentialVault(
  directory?: string,
): CredentialVault {
  if (process.platform !== 'win32') return new UnavailableCredentialVault()
  return new DpapiCredentialVault(directory)
}
