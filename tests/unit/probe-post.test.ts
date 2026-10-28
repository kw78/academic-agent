import { describe, expect, it } from 'vitest'
import { ProbeSampleStore, probeSourcePage } from '@academic/sources'

const config = {
  loginUrl: 'https://lms.example.edu/login',
  authenticatedUrlPatterns: ['^https://lms\\.example\\.edu/'],
  cookieDomains: ['lms.example.edu'],
}

const secret = JSON.stringify({
  cookies: [
    { name: 'sid', value: 'fixture', domain: 'lms.example.edu', path: '/' },
  ],
})

const resolveHost = async () => [{ address: '93.184.216.34', family: 4 }]

describe('POST probe capture', () => {
  it('sends a JSON body and stores method plus requestBody with the sample', async () => {
    const calls: Array<{
      method: string
      body?: string
      contentType?: string
    }> = []
    const fetchImpl: typeof fetch = async (_input, init) => {
      const contentType = new Headers(init?.headers).get('content-type')
      calls.push({
        method: init?.method ?? 'GET',
        ...(init?.body ? { body: String(init.body) } : {}),
        ...(contentType ? { contentType } : {}),
      })
      return new Response(JSON.stringify({ data: [{ id: 'A1' }] }), {
        headers: { 'content-type': 'application/json' },
      })
    }
    const store = new ProbeSampleStore({ now: () => 1 })
    const evidence = await probeSourcePage({
      sourceId: 'source-1',
      config,
      secret,
      probedAt: '2026-10-28T10:00:00.000Z',
      url: 'https://lms.example.edu/api/feed',
      method: 'POST',
      body: { action: 'list', page: 1 },
      captureSample: true,
      sampleStore: store,
      fetchImpl,
      resolveHost,
    })

    expect(calls).toEqual([
      {
        method: 'POST',
        body: '{"action":"list","page":1}',
        contentType: 'application/json; charset=utf-8',
      },
    ])
    expect(evidence.sampleId).toBeTruthy()
    expect(store.get(evidence.sampleId!)).toMatchObject({
      method: 'POST',
      requestBody: '{"action":"list","page":1}',
    })
    expect(store.findByRequest('https://lms.example.edu/api/feed', 'GET')).toBeUndefined()
  })

  it('rejects a body on GET and a non-object POST body', async () => {
    await expect(
      probeSourcePage({
        sourceId: 'source-1',
        config,
        secret,
        probedAt: '2026-10-28T10:00:00.000Z',
        url: 'https://lms.example.edu/api/feed',
        body: { action: 'list' },
      }),
    ).rejects.toThrow(/GET 探测不能携带 body/)

    await expect(
      probeSourcePage({
        sourceId: 'source-1',
        config,
        secret,
        probedAt: '2026-10-28T10:00:00.000Z',
        url: 'https://lms.example.edu/api/feed',
        method: 'POST',
      }),
    ).rejects.toThrow(/POST 探测需要 JSON 对象 body/)
  })
})
