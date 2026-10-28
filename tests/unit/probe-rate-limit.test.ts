import { describe, expect, it } from 'vitest'
import { ProbeRateLimiter, ProbeSampleStore } from '@academic/sources'

describe('probe rate limiter and sample store', () => {
  it('allows at most three probes per minute without waiting inside the tool', async () => {
    let now = 0
    const limiter = new ProbeRateLimiter({
      minIntervalMs: 20_000,
      now: () => now,
    })
    await limiter.acquire('source-1')
    await expect(limiter.acquire('source-1')).rejects.toThrow(/约 20 秒/)
    now = 20_000
    await expect(limiter.acquire('source-1')).resolves.toBeUndefined()
    await expect(limiter.acquire('source-1')).rejects.toThrow(/约 20 秒/)
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
