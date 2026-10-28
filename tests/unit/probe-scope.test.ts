import { describe, expect, it } from 'vitest'
import { crawlSourcePages, probeSourcePage } from '@academic/sources'

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

  it('does not treat a JS bundle containing /login as a login page', async () => {
    const fetchImpl = (async () =>
      new Response('const route = "/login"; const api = "/api/courses";', {
        status: 200,
        headers: { 'content-type': 'application/javascript' },
      })) as typeof fetch
    const evidence = await probeSourcePage({
      sourceId: 'source-1',
      config: {
        ...config(),
        loggedOutPatterns: ['/login'],
      },
      secret: secret(),
      probedAt: '2026-10-28T10:00:00.000Z',
      url: 'https://i.chaoxing.com/app.js',
      fetchImpl,
      resolveHost: publicAddress,
    })
    expect(evidence.loginLike).toBe(false)
    expect(evidence.endpointCandidates.some((link) => link.url.includes('/api/courses'))).toBe(true)
  })

  it('still detects an HTML login page by title', async () => {
    const fetchImpl = (async () =>
      new Response('<html><head><title>统一身份登录</title></head><body></body></html>', {
        status: 200,
        headers: { 'content-type': 'text/html; charset=utf-8' },
      })) as typeof fetch
    const evidence = await probeSourcePage({
      sourceId: 'source-1',
      config: {
        ...config(),
        loggedOutPatterns: ['/login'],
      },
      secret: secret(),
      probedAt: '2026-10-28T10:00:00.000Z',
      url: 'https://i.chaoxing.com/page',
      fetchImpl,
      resolveHost: publicAddress,
    })
    expect(evidence.loginLike).toBe(true)
  })

  it('crawls a bounded section without leaving the allowed host or path prefix', async () => {
    const urls: string[] = []
    const fetchImpl = (async (input: string | URL | Request) => {
      const url = String(input)
      urls.push(url)
      if (url.includes('/space/index')) {
        return new Response(
          '<a href="/space/course/1?x=1">一</a><a href="/space/course/2">二</a>' +
            '<a href="/space/course/1/detail">详情</a>' +
            '<a href="https://evil.example/x">外部</a>' +
            '<a href="/logout">退出</a><a href="/files/a.pdf">PDF</a>',
          { status: 200, headers: { 'content-type': 'text/html' } },
        )
      }
      return new Response('<html><body>课程页</body></html>', {
        status: 200,
        headers: { 'content-type': 'text/html' },
      })
    }) as typeof fetch

    const result = await crawlSourcePages({
      sourceId: 'source-1',
      config: config(['i.mooc.chaoxing.com']),
      secret: secret(),
      startUrl: target,
      options: { maxPages: 3, maxDepth: 1, pathPrefix: '/space', delayMs: 0 },
      fetchImpl,
      resolveHost: publicAddress,
    })

    expect(result.fetched).toBe(3)
    expect(result.pages).toHaveLength(3)
    expect(urls).toHaveLength(3)
    expect(urls.some((url) => url.includes('/space/course/1?x=1'))).toBe(true)
    expect(urls.some((url) => url.includes('evil.example'))).toBe(false)
    expect(urls.some((url) => url.endsWith('/logout'))).toBe(false)
    expect(urls.some((url) => url.endsWith('/a.pdf'))).toBe(false)
    expect(result.stopReason).toBe('max-pages')
    expect(result.discovered).toBeGreaterThanOrEqual(3)
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
