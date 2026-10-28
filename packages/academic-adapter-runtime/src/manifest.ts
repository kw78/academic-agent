import { z } from 'zod'

const extractorSchema = z
  .object({
    selector: z.string().min(1).max(500).optional(),
    path: z.string().min(1).max(500).optional(),
    attribute: z.string().min(1).max(100).optional(),
    regex: z.string().min(1).max(500).optional(),
    group: z.number().int().min(0).max(20).optional(),
    trim: z.boolean().optional(),
  })
  .refine((value) => Boolean(value.selector) !== Boolean(value.path), {
    message: 'Each field needs exactly one of selector or path',
  })

const requestSchema = z.object({
  url: z.string().min(1).max(2000),
  responseType: z.enum(['html', 'json']).default('html'),
  items: z.string().min(1).max(500),
  fields: z.record(z.string(), extractorSchema),
  next: z.string().min(1).max(500).optional(),
  maxPages: z.number().int().min(1).max(50).optional(),
})

export const adapterManifestSchema = z.object({
  schemaVersion: z.literal(1),
  adapterId: z.string().min(1).max(200),
  version: z.string().min(1).max(50),
  displayName: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  baseUrl: z.string().url(),
  allowedOrigins: z
    .array(z.string().regex(/^[a-z0-9.-]+$/i, 'Expected a host name'))
    .min(1)
    .max(20),
  timeZone: z.string().min(1).optional(),
  utcOffsetMinutes: z.number().int().min(-840).max(840).optional(),
  courses: requestSchema,
  assignments: requestSchema,
  detail: requestSchema.optional(),
})

export type AdapterManifest = z.infer<typeof adapterManifestSchema>
export type ManifestRequest = z.infer<typeof requestSchema>
export type ManifestExtractor = z.infer<typeof extractorSchema>

export function parseManifest(value: unknown): AdapterManifest {
  return adapterManifestSchema.parse(value)
}

export class ManifestRegistry {
  readonly #versions = new Map<string, Map<string, AdapterManifest>>()
  readonly #active = new Map<string, string>()

  register(value: unknown): AdapterManifest {
    const manifest = parseManifest(value)
    const versions = this.#versions.get(manifest.adapterId) ?? new Map()
    if (versions.has(manifest.version)) {
      throw new Error(
        `Manifest version already exists: ${manifest.adapterId}@${manifest.version}`,
      )
    }
    versions.set(manifest.version, manifest)
    this.#versions.set(manifest.adapterId, versions)
    if (!this.#active.has(manifest.adapterId)) {
      this.#active.set(manifest.adapterId, manifest.version)
    }
    return manifest
  }

  get(adapterId: string, version?: string): AdapterManifest | undefined {
    const versions = this.#versions.get(adapterId)
    if (!versions) return undefined
    const selected = version ?? this.#active.get(adapterId)
    return selected ? versions.get(selected) : undefined
  }

  activate(adapterId: string, version: string): AdapterManifest {
    const manifest = this.#versions.get(adapterId)?.get(version)
    if (!manifest) throw new Error(`Unknown manifest version: ${adapterId}@${version}`)
    this.#active.set(adapterId, version)
    return manifest
  }

  list(): Array<{
    adapterId: string
    active: string | undefined
    versions: Array<{ version: string; displayName: string }>
  }> {
    return [...this.#versions.entries()].map(([adapterId, versions]) => ({
      adapterId,
      active: this.#active.get(adapterId),
      versions: [...versions.values()].map((manifest) => ({
        version: manifest.version,
        displayName: manifest.displayName,
      })),
    }))
  }
}
