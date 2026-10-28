import { afterEach, describe, expect, it } from 'vitest'
import { InMemoryCredentialVault } from '@academic/connections'
import {
  SafeFetchError,
  WebSessionStore,
  safeFetch,
  type ResolveHost,
} from '@academic/web-sessions'
import { createTestStore, fixedClock, sequentialIds } from '../helpers/store.js'

const cleanup: Array<() => void> = []
const PUBLIC_ADDRESS = '93.184.216.34'

const publicResolver: ResolveHost = async () => [
  { address: PUBLIC_ADDRESS, family: 4 },
]

function cookieOf(init: RequestInit | undefined): string | null {
  return new Headers(init?.headers).get('cookie')
}

afterEach(() => {
  for (const dispose of cleanup.splice(0).reverse()) dispose()
})

function setup(
  fetchImpl: typeof fetch,
  options: { maxBytes?: number; timeoutMs?: number } = {},
) {
  const clock = fixedClock()
  const store = createTestStore({ clock })
  cleanup.push(() => store.close())
  const vault = new InMemoryCredentialVault()
  const webSessions = new WebSessionStore({
    db: store.database,
    vault,
    clock,
    ids: sequentialIds('web'),
    fetchImpl,
    resolveHost: publicResolver,
    allowedProtocols: ['http:', 'https:'],
    ...options,
  })
  return { webSessions, vault, store }
}

describe('generic web sessions', () => {
  it('stores cookies outside the database and fetches only for the matching host', async () => {
    let sentCookie: string | null = null
    const { webSessions } = setup(async (_input, init) => {
      sentCookie = cookieOf(init)
      return new Response('<html>ok</html>', {
        status: 200,
        headers: { 'content-type': 'text/html' },
      })
    })

    const session = await webSessions.create({
      loginUrl: 'https://www.example.com/login',
      label: 'Example',
      cookies: [{ name: 'sid', value: 'top-secret' }],
    })
    expect(session.domain).toBe('www.example.com')
    expect(webSessions.list()).toHaveLength(1)
    expect(JSON.stringify(webSessions.list())).not.toContain('top-secret')

    const page = await webSessions.fetch(
      session.sessionId,
      'https://www.example.com/page',
    )
    expect(sentCookie).toBe('sid=top-secret')
    expect(page.status).toBe(200)
    expect(page.body).toContain('ok')
    expect(JSON.stringify(page)).not.toContain('top-secret')

    await expect(
      webSessions.fetch(session.sessionId, 'https://other.example.net/'),
    ).rejects.toThrow(/授权范围/)

    await webSessions.delete(session.sessionId)
    expect(webSessions.list()).toHaveLength(0)
  })

  it('selects cookies by domain, path, secure and expiry', async () => {
    const sent: string[] = []
    const { webSessions } = setup(async (_input, init) => {
      sent.push(cookieOf(init) ?? '')
      return new Response('ok')
    })

    const session = await webSessions.create({
      loginUrl: 'https://www.example.com/login?token=should-not-be-stored',
      cookies: [
        { name: 'sid', value: '1', domain: 'www.example.com', path: '/' },
        { name: 'parent', value: '2', domain: '.example.com', path: '/' },
        { name: 'path', value: '3', domain: 'www.example.com', path: '/app' },
        {
          name: 'secure',
          value: '4',
          domain: 'www.example.com',
          path: '/',
          secure: true,
        },
        {
          name: 'expired',
          value: '5',
          domain: 'www.example.com',
          path: '/',
          expires: 1,
        },
      ],
    })

    expect(session.loginUrl).toBe('https://www.example.com/login')
    expect(JSON.stringify(webSessions.list())).not.toContain('should-not-be-stored')

    await webSessions.fetch(session.sessionId, 'https://www.example.com/app/page')
    expect(sent[0]).toContain('sid=1')
    expect(sent[0]).toContain('parent=2')
    expect(sent[0]).toContain('path=3')
    expect(sent[0]).toContain('secure=4')
    expect(sent[0]).not.toContain('expired=5')

    await webSessions.fetch(session.sessionId, 'https://www.example.com/other')
    expect(sent[1]).toContain('sid=1')
    expect(sent[1]).toContain('parent=2')
    expect(sent[1]).toContain('secure=4')
    expect(sent[1]).not.toContain('path=3')
    expect(sent[1]).not.toContain('expired=5')

    await webSessions.fetch(session.sessionId, 'http://www.example.com/')
    expect(sent[2]).toContain('sid=1')
    expect(sent[2]).toContain('parent=2')
    expect(sent[2]).not.toContain('secure=4')
    expect(sent[2]).not.toContain('path=3')
    expect(sent[2]).not.toContain('expired=5')
  })

  it('validates redirects on every hop', async () => {
    const crossHost = setup(async () => {
      return new Response(null, {
        status: 302,
        headers: { location: 'https://evil.example.net/' },
      })
    })
    const crossSession = await crossHost.webSessions.create({
      loginUrl: 'https://www.example.com/login',
      cookies: [{ name: 'sid', value: '1' }],
    })
    await expect(
      crossHost.webSessions.fetch(
        crossSession.sessionId,
        'https://www.example.com/start',
      ),
    ).rejects.toThrow(/授权范围/)

    const downgrade = setup(async () => {
      return new Response(null, {
        status: 302,
        headers: { location: 'http://www.example.com/' },
      })
    })
    const downgradeSession = await downgrade.webSessions.create({
      loginUrl: 'https://www.example.com/login',
      cookies: [{ name: 'sid', value: '1' }],
    })
    await expect(
      downgrade.webSessions.fetch(
        downgradeSession.sessionId,
        'https://www.example.com/start',
      ),
    ).rejects.toThrow(/降级/)

    const headers: string[] = []
    let call = 0
    const allowed = setup(async (_input, init) => {
      headers.push(cookieOf(init) ?? '')
      call += 1
      if (call === 1) {
        return new Response(null, { status: 302, headers: { location: '/app/next' } })
      }
      return new Response('ok')
    })
    const allowedSession = await allowed.webSessions.create({
      loginUrl: 'https://www.example.com/login',
      cookies: [
        { name: 'sid', value: '1', domain: 'www.example.com', path: '/' },
        { name: 'path', value: '3', domain: 'www.example.com', path: '/app' },
      ],
    })
    const redirected = await allowed.webSessions.fetch(
      allowedSession.sessionId,
      'https://www.example.com/start',
    )
    expect(redirected.status).toBe(200)
    expect(headers[0]).not.toContain('path=3')
    expect(headers[1]).toContain('path=3')

    const loop = setup(async () => {
      return new Response(null, { status: 302, headers: { location: '/loop' } })
    })
    const loopSession = await loop.webSessions.create({
      loginUrl: 'https://www.example.com/login',
      cookies: [{ name: 'sid', value: '1' }],
    })
    await expect(
      loop.webSessions.fetch(loopSession.sessionId, 'https://www.example.com/start'),
    ).rejects.toThrow(/重定向次数/)
  })

  it('rejects cookies outside the login host and CRLF injection', async () => {
    const { webSessions } = setup(async () => new Response('ok'))
    await expect(
      webSessions.create({
        loginUrl: 'https://www.example.com/login',
        cookies: [{ name: 'sid', value: '1', domain: 'evil.example.net' }],
      }),
    ).rejects.toThrow(/不属于登录站点/)

    await expect(
      webSessions.create({
        loginUrl: 'https://www.example.com/login',
        cookies: [{ name: 'sid', value: '1\r\nInjected: yes' }],
      }),
    ).rejects.toThrow(/非法字符/)
  })
})

describe('safe session fetch', () => {
  it('blocks loopback, private, metadata and private DNS targets', async () => {
    let called = 0
    const fetchImpl = async () => {
      called += 1
      return new Response('ok')
    }

    const blocked = [
      ['http://127.0.0.1/', '127.0.0.1', '127.0.0.1'],
      [
        'http://169.254.169.254/latest/meta-data',
        '169.254.169.254',
        '169.254.169.254',
      ],
      ['http://localhost/', 'localhost', '93.184.216.34'],
      ['https://internal.example.com/', 'example.com', '10.0.0.5'],
      ['https://v6.example.com/', 'example.com', '::1'],
      ['https://mapped.example.com/', 'example.com', '::ffff:10.0.0.1'],
    ] as const

    for (const [url, allowed, address] of blocked) {
      await expect(
        safeFetch(url, {
          allowedHosts: [allowed],
          allowedProtocols: ['http:', 'https:'],
          fetchImpl,
          resolveHost: async () => [
            { address, family: address.includes(':') ? 6 : 4 },
          ],
        }),
      ).rejects.toMatchObject({ code: 'UNSAFE_HOST' })
    }
    expect(called).toBe(0)

    const result = await safeFetch('https://public.example.com/', {
      allowedHosts: ['example.com'],
      fetchImpl,
      resolveHost: publicResolver,
    })
    expect(result.status).toBe(200)
    expect(called).toBe(1)
  })

  it('pins each hop to the validated address and enforces protocol, port and path policy', async () => {
    const targets: Array<{ url: string; address: string }> = []
    let resolutions = 0
    const resolveHost: ResolveHost = async () => {
      resolutions += 1
      return [{ address: PUBLIC_ADDRESS, family: 4 }]
    }
    const requestImpl = async (url: URL, _init: unknown, target: { address: string }) => {
      targets.push({ url: url.toString(), address: target.address })
      if (targets.length === 1) {
        return new Response(null, {
          status: 302,
          headers: { location: '/app/next' },
        })
      }
      return new Response('ok')
    }

    const result = await safeFetch('https://public.example.com/app/page', {
      allowedHosts: ['example.com'],
      allowedPathPrefixes: ['/app'],
      resolveHost,
      requestImpl,
    })
    expect(result.status).toBe(200)
    expect(resolutions).toBe(2)
    expect(targets).toEqual([
      { url: 'https://public.example.com/app/page', address: PUBLIC_ADDRESS },
      { url: 'https://public.example.com/app/next', address: PUBLIC_ADDRESS },
    ])

    const rejected = async (url: string, extra: Record<string, unknown>) => {
      let calls = 0
      const error = await safeFetch(url, {
        allowedHosts: ['example.com'],
        resolveHost,
        requestImpl: async () => {
          calls += 1
          return new Response('ok')
        },
        ...extra,
      }).catch((caught: unknown) => caught)
      expect(calls).toBe(0)
      return error
    }

    expect(await rejected('http://public.example.com/app', {})).toMatchObject({
      code: 'UNSAFE_PROTOCOL',
    })
    expect(
      await rejected('https://public.example.com:8443/app', {}),
    ).toMatchObject({ code: 'UNSAFE_PORT' })
    expect(
      await rejected('https://public.example.com/other', {
        allowedPathPrefixes: ['/app'],
      }),
    ).toMatchObject({ code: 'UNSAFE_PATH' })
  })

  it('caps response bytes and times out slow requests', async () => {
    const limited = await safeFetch('https://public.example.com/', {
      allowedHosts: ['example.com'],
      fetchImpl: async () => new Response('0123456789'),
      resolveHost: publicResolver,
      maxBytes: 4,
    })
    expect(limited.body).toBe('0123')
    expect(limited.truncated).toBe(true)

    await expect(
      safeFetch('https://public.example.com/', {
        allowedHosts: ['example.com'],
        fetchImpl: async () => new Response('', { status: 429 }),
        resolveHost: publicResolver,
      }),
    ).rejects.toMatchObject({ code: 'RATE_LIMITED' })

    const hanging: typeof fetch = (_input, init) =>
      new Promise((_, reject) => {
        if (init?.signal?.aborted) {
          reject(new Error('aborted'))
          return
        }
        init?.signal?.addEventListener('abort', () => reject(new Error('aborted')), {
          once: true,
        })
      })

    let error: unknown
    try {
      await safeFetch('https://public.example.com/', {
        allowedHosts: ['example.com'],
        fetchImpl: hanging,
        resolveHost: publicResolver,
        timeoutMs: 25,
      })
    } catch (caught) {
      error = caught
    }
    expect(error).toBeInstanceOf(SafeFetchError)
    expect((error as SafeFetchError).code).toBe('TIMEOUT')
  })
})
