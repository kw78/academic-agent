import { CapabilityConflictError, CapabilityUnavailableError } from './errors.js'

export const CAPABILITY_KINDS = ['adapter', 'planner', 'notification', 'tutor'] as const
export type CapabilityKind = (typeof CAPABILITY_KINDS)[number]

export const PLANNER_CAPABILITY_ID = 'academic.planner.basic'

export interface CapabilityDescriptor {
  id: string
  kind: CapabilityKind
  version: string
  providerPlugin: string
  capabilities: string[]
  requiredPermissions: string[]
}

export interface DisposableRegistration {
  dispose(): void
}

export interface CapabilityRegistryApi {
  register(descriptor: CapabilityDescriptor): DisposableRegistration
  get(capabilityId: string): CapabilityDescriptor | undefined
  list(kind?: CapabilityKind): CapabilityDescriptor[]
  require(capabilityId: string): CapabilityDescriptor
}

export class CapabilityRegistry implements CapabilityRegistryApi {
  readonly #entries = new Map<string, CapabilityDescriptor>()

  register(descriptor: CapabilityDescriptor): DisposableRegistration {
    if (this.#entries.has(descriptor.id)) {
      throw new CapabilityConflictError(descriptor.id)
    }
    this.#entries.set(descriptor.id, descriptor)
    let disposed = false
    return {
      dispose: () => {
        if (disposed) return
        disposed = true
        this.#entries.delete(descriptor.id)
      },
    }
  }

  get(capabilityId: string): CapabilityDescriptor | undefined {
    return this.#entries.get(capabilityId)
  }

  list(kind?: CapabilityKind): CapabilityDescriptor[] {
    const entries = [...this.#entries.values()]
    return kind ? entries.filter((entry) => entry.kind === kind) : entries
  }

  require(capabilityId: string): CapabilityDescriptor {
    const descriptor = this.#entries.get(capabilityId)
    if (!descriptor) throw new CapabilityUnavailableError(capabilityId)
    return descriptor
  }
}
