import { describe, expect, it } from 'vitest'
import { ProbeRateLimiter, ProbeSampleStore } from '@academic/sources'

describe('probe rate limiter and sample store', () => {
  it('spaces requests and refuses to exceed the window budget', async () => {
    let now = 0
    const limiter = new ProbeRateLimiter({
      windowMs: 10_000,
      maxRequests: 2,
      minIntervalMs: 1_000,
      now: () => now,
      sleep: async (milliseconds) => {
        now += milliseconds
      },
    })
    await limiter.acquire('source-1')
    await limiter.acquire('source-1')
    await expect(limiter.acquire('source-1')).rejects.toThrow(/过于频繁/)
    expect(now).toBeGreaterThanOrEqual(1_000)
  })

  it('reuses the same sample for identical URL content and expires it', () => {
    let now = 0
    const store = new ProbeSampleStore({ now: () => now })
    const first = store.put({ url: 'https://example.edu/a', body: 'same' })
    const second = store.put({ url: 'https://example.edu/a', body: 'same' })
    expect(second.sampleId).toBe(first.sampleId)
    expect(store.get(first.sampleId)?.body).toBe('same')

    now = 61 * 60_000
    expect(store.get(first.sampleId)).toBeUndefined()
  })
})
