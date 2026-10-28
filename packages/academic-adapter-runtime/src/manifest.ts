import { z } from 'zod'

const extractorSchema = z
  .object({
    selector: z.string().min(1).max(500).optional(),
    path: z.string().min(1).max(500).optional(),
    constant: z.union([z.string(), z.number(), z.boolean()]).optional(),
    template: z.string().min(1).max(1_000).optional(),
    attribute: z.string().min(1).max(100).optional(),
    regex: z.string().min(1).max(500).optional(),
    group: z.number().int().min(0).max(20).optional(),
    trim: z.boolean().optional(),
    type: z.enum(['string', 'number', 'boolean']).optional(),
    default: z.union([z.string(), z.number(), z.boolean()]).optional(),
    required: z.boolean().optional(),
  })
  .refine(
    (value) =>
      [value.selector, value.path, value.constant, value.template].filter(
        (entry) => entry !== undefined,
      ).length === 1,
    {
      message: 'Each field needs exactly one of selector, path, constant or template',
    },
  )
  .refine((value) => !value.attribute || Boolean(value.selector), {
    message: 'attribute can only be used together with selector',
  })

const requestSchema = z
  .object({
    url: z.string().min(1).max(2000),
    responseType: z.enum(['html', 'json']).default('html'),
    items: z.string().min(1).max(500),
    fields: z.record(z.string(), extractorSchema),
    next: z.string().min(1).max(500).optional(),
    maxPages: z.number().int().min(1).max(50).optional(),
    pageParam: z
      .string()
      .regex(/^[A-Za-z0-9_.-]{1,80}$/, 'Expected a query parameter name')
      .optional(),
    pageStart: z.number().int().min(0).max(10_000).optional(),
    pageStep: z.number().int().min(1).max(100).optional(),
    offsetParam: z
      .string()
      .regex(/^[A-Za-z0-9_.-]{1,80}$/, 'Expected a query parameter name')
      .optional(),
    offsetStart: z.number().int().min(0).max(1_000_000).optional(),
    offsetStep: z.number().int().min(1).max(10_000).optional(),
  })
  .refine(
    (value) =>
      [value.next, value.pageParam, value.offsetParam].filter(
        (entry) => entry !== undefined,
      ).length <= 1,
    {
      message:
        'Use at most one pagination strategy: next, pageParam or offsetParam',
    },
  )

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
  allowedPathPrefixes: z
    .array(z.string().regex(/^\//, 'Expected a path beginning with /'))
    .min(1)
    .max(20),
  allowHttp: z.boolean().optional(),
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
  if (value && typeof value === 'object' && 'schemaVersion' in value) {
    const version = (value as { schemaVersion?: unknown }).schemaVersion
    if (version !== 1) {
      throw new Error(
        `不支持的 Manifest schemaVersion：${String(version)}；当前只支持 1`,
      )
    }
  }
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
