export interface ProbeRateLimiterOptions {
  windowMs?: number
  maxRequests?: number
  minIntervalMs?: number
  now?: () => number
  sleep?: (milliseconds: number) => Promise<void>
}

/**
 * Per-source guard for read-only exploration. It spaces requests and refuses
 * to exceed a small window budget so an agent cannot turn probing into a crawl.
 */
export class ProbeRateLimiter {
  readonly #windowMs: number
  readonly #maxRequests: number
  readonly #minIntervalMs: number
  readonly #now: () => number
  readonly #sleep: (milliseconds: number) => Promise<void>
  readonly #events = new Map<string, number[]>()
  readonly #last = new Map<string, number>()

  constructor(options: ProbeRateLimiterOptions = {}) {
    this.#windowMs = options.windowMs ?? 10 * 60_000
    this.#maxRequests = options.maxRequests ?? 10
    this.#minIntervalMs = options.minIntervalMs ?? 1_200
    this.#now = options.now ?? (() => Date.now())
    this.#sleep =
      options.sleep ??
      ((milliseconds) =>
        new Promise((resolve) => setTimeout(resolve, milliseconds)))
  }

  async acquire(sourceId: string): Promise<void> {
    const last = this.#last.get(sourceId)
    if (last !== undefined) {
      const wait = this.#minIntervalMs - (this.#now() - last)
      if (wait > 0) await this.#sleep(wait)
    }
    const at = this.#now()
    const recent = (this.#events.get(sourceId) ?? []).filter(
      (timestamp) => at - timestamp < this.#windowMs,
    )
    if (recent.length >= this.#maxRequests) {
      const retryAfterSeconds = Math.max(
        1,
        Math.ceil((this.#windowMs - (at - recent[0]!)) / 1000),
      )
      throw new Error(
        `探测请求过于频繁：请约 ${retryAfterSeconds} 秒后再试，避免触发平台风控`,
      )
    }
    recent.push(at)
    this.#events.set(sourceId, recent)
    this.#last.set(sourceId, at)
  }
}
