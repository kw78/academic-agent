export interface ProbeRateLimiterOptions {
  minIntervalMs?: number
  now?: () => number
  sleep?: (milliseconds: number) => Promise<void>
}

/**
 * Per-source spacing for read-only exploration. It allows at most one probe
 * every 20 seconds (3 per minute, without bursts) and never holds a tool call
 * for a long wait; a too-early call gets a controlled "try again in N seconds"
 * error instead.
 */
export class ProbeRateLimiter {
  readonly #minIntervalMs: number
  readonly #now: () => number
  readonly #sleep: (milliseconds: number) => Promise<void>
  readonly #last = new Map<string, number>()

  constructor(options: ProbeRateLimiterOptions = {}) {
    this.#minIntervalMs = options.minIntervalMs ?? 20_000
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
      if (wait > 2_000) {
        throw new Error(
          `探测请求过于频繁：请约 ${Math.ceil(wait / 1000)} 秒后再试，避免触发平台风控`,
        )
      }
      if (wait > 0) await this.#sleep(wait)
    }
    this.#last.set(sourceId, this.#now())
  }
}
