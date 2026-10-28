import { createHash, randomUUID } from 'node:crypto'
import type { AdapterSample } from '@academic/contracts'

export interface CapturedProbeSample extends AdapterSample {
  sampleId: string
  digest: string
  bytes: number
  capturedAt: number
}

export interface ProbeSampleSummary {
  sampleId: string
  url: string
  contentType?: string
  bytes: number
  digest: string
  capturedAt: number
}

export interface ProbeSampleStoreOptions {
  ttlMs?: number
  maxSamples?: number
  now?: () => number
}

/**
 * Holds raw probe responses for a short time so the agent can validate a
 * manifest by opaque sample id. Raw bodies never leave the host.
 */
export class ProbeSampleStore {
  readonly #samples = new Map<string, CapturedProbeSample>()
  readonly #ttlMs: number
  readonly #maxSamples: number
  readonly #now: () => number

  constructor(options: ProbeSampleStoreOptions = {}) {
    this.#ttlMs = options.ttlMs ?? 15 * 60_000
    this.#maxSamples = options.maxSamples ?? 30
    this.#now = options.now ?? (() => Date.now())
  }

  put(sample: AdapterSample): CapturedProbeSample {
    const now = this.#now()
    this.#evict(now)
    const body = sample.body.slice(0, 512 * 1024)
    const captured: CapturedProbeSample = {
      sampleId: randomUUID(),
      url: sample.url,
      body,
      ...(sample.contentType ? { contentType: sample.contentType } : {}),
      digest: createHash('sha256').update(body).digest('hex'),
      bytes: Buffer.byteLength(body, 'utf8'),
      capturedAt: now,
    }
    this.#samples.set(captured.sampleId, captured)
    while (this.#samples.size > this.#maxSamples) {
      const oldest = this.#samples.keys().next().value
      if (oldest === undefined) break
      this.#samples.delete(oldest)
    }
    return captured
  }

  get(sampleId: string): AdapterSample | undefined {
    this.#evict(this.#now())
    const sample = this.#samples.get(sampleId)
    if (!sample) return undefined
    return {
      url: sample.url,
      body: sample.body,
      ...(sample.contentType ? { contentType: sample.contentType } : {}),
    }
  }

  describe(sampleId: string): ProbeSampleSummary | undefined {
    this.#evict(this.#now())
    const sample = this.#samples.get(sampleId)
    if (!sample) return undefined
    return {
      sampleId: sample.sampleId,
      url: sample.url,
      ...(sample.contentType ? { contentType: sample.contentType } : {}),
      bytes: sample.bytes,
      digest: sample.digest,
      capturedAt: sample.capturedAt,
    }
  }

  delete(sampleId: string): boolean {
    return this.#samples.delete(sampleId)
  }

  clear(): void {
    this.#samples.clear()
  }

  get size(): number {
    this.#evict(this.#now())
    return this.#samples.size
  }

  #evict(now: number): void {
    for (const [id, sample] of this.#samples) {
      if (now - sample.capturedAt > this.#ttlMs) this.#samples.delete(id)
    }
  }
}
