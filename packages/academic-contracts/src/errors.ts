export class CapabilityUnavailableError extends Error {
  readonly code = 'CAPABILITY_UNAVAILABLE'
  readonly capabilityId: string

  constructor(capabilityId: string) {
    super(`Capability unavailable: ${capabilityId}`)
    this.name = 'CapabilityUnavailableError'
    this.capabilityId = capabilityId
  }
}

export class CapabilityConflictError extends Error {
  readonly code = 'CAPABILITY_CONFLICT'

  constructor(capabilityId: string) {
    super(`Capability already registered: ${capabilityId}`)
    this.name = 'CapabilityConflictError'
  }
}
