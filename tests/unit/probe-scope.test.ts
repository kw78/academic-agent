import { describe, expect, it } from 'vitest'
import { probeSourcePage } from '@academic/sources'

const publicAddress = async () => [{ address: '93.184.216.34', family: 4 }]

function secret(): string {
  return JSON.stringify({
    cookies: [
      {
        name: 'session',
        value: 'test',
        domain: 'i.chaoxing.com',
        path: '/',
      },
    ],
  })
}

function config(extraHosts?: string[]): Record<string, unknown> {
  return {
    loginUrl: 'https://i.chaoxing.com/',
    authenticatedUrlPatterns: ['^https://i\\.chaoxing\\.com/'],
    cookieDomains: ['i.chaoxing.com'],
    ...(extraHosts ? { probeAllowedHosts: extraHosts } : {}),
  }
}

const target = 'https://i.mooc.chaoxing.com/space/index?ws=1&t=1793189239237'

describe('source probe host scope', () => {
  it('rejects a cross-host URL unless the host is explicitly allowed', async () => {
    let calls = 0
    const fetchImpl = (async () => {
      calls += 1
      return new Response('<html></html>', { status: 200 })
    }) as typeof fetch

    await expect(
      probeSourcePage({
        sourceId: 'source-1',
        config: config(),
        secret: secret(),
        probedAt: '2026-10-28T10:00:00.000Z',
        url: target,
        fetchImpl,
        resolveHost: publicAddress,
      }),
    ).rejects.toThrow(/probeAllowedHosts/)
    expect(calls).toBe(0)
  })

  it('probes an explicitly allowed cross-host page and keeps evidence on that host', async () => {
    const urls: string[] = []
    const fetchImpl = (async (input: string | URL | Request) => {
      urls.push(String(input))
      return new Response(
        '<html><body><a href="/space/course">课程</a><a href="https://evil.example/x">外部</a></body></html>',
        { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } },
      )
    }) as typeof fetch

    const evidence = await probeSourcePage({
      sourceId: 'source-1',
      config: config(['i.mooc.chaoxing.com']),
      secret: secret(),
      probedAt: '2026-10-28T10:00:00.000Z',
      url: target,
      fetchImpl,
      resolveHost: publicAddress,
    })

    expect(urls).toHaveLength(1)
    expect(urls[0]).toContain('i.mooc.chaoxing.com')
    expect(evidence.status).toBe(200)
    expect(evidence.links.some((link) => link.url.includes('i.mooc.chaoxing.com'))).toBe(true)
    expect(evidence.links.some((link) => link.url.includes('evil.example'))).toBe(false)
    expect(evidence.url).not.toContain('t=')
  })
})
