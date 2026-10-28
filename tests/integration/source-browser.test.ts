import { describe, expect, it } from 'vitest'
import { createBrowserSessionEngine } from '@academic/source-browser'

const config = {
  loginUrl: 'https://www.example.com/login',
  authenticatedUrlPatterns: ['^https://www\\.example\\.com/'],
  cookieDomains: ['www.example.com'],
  verifyUrl: 'https://www.example.com/home',
  loggedOutPatterns: ['/login'],
  timeoutMs: 5_000,
}

const publicResolver = async () => [{ address: '93.184.216.34', family: 4 }]

const secret = JSON.stringify({
  cookies: [
    { name: 'sid', value: 'session-secret', domain: 'www.example.com', path: '/' },
    {
      name: 'app',
      value: 'app-only',
      domain: 'www.example.com',
      path: '/app',
    },
  ],
})

describe('browser-session engine verification', () => {
  it('uses scoped cookies and reports a valid session', async () => {
    let sentCookie: string | null = null
    const engine = createBrowserSessionEngine({
      fetchImpl: async (_input, init) => {
        sentCookie = new Headers(init?.headers).get('cookie')
        return new Response('<html>Dashboard</html>', {
          status: 200,
          headers: { 'content-type': 'text/html' },
        })
      },
      resolveHost: publicResolver,
    })

    const result = await engine.verify!({ sourceId: 'source-1', config }, secret)
    expect(result).toEqual({ ok: true })
    expect(sentCookie).toContain('sid=session-secret')
    expect(sentCookie).not.toContain('app-only')
  })

  it('detects a redirect to the login page', async () => {
    const engine = createBrowserSessionEngine({
      fetchImpl: async (input) => {
        if (String(input).endsWith('/home')) {
          return new Response(null, {
            status: 302,
            headers: { location: '/login' },
          })
        }
        return new Response('<html>Sign in</html>')
      },
      resolveHost: publicResolver,
    })

    const result = await engine.verify!({ sourceId: 'source-1', config }, secret)
    expect(result.ok).toBe(false)
    expect(result.message).toMatch(/登录页/)
  })

  it('fails closed for legacy unscoped secrets and private DNS', async () => {
    const privateEngine = createBrowserSessionEngine({
      fetchImpl: async () => {
        throw new Error('should not fetch')
      },
      resolveHost: async () => [{ address: '10.0.0.5', family: 4 }],
    })
    const privateResult = await privateEngine.verify!(
      { sourceId: 'source-1', config },
      secret,
    )
    expect(privateResult.ok).toBe(false)
    expect(privateResult.message).toMatch(/受限地址/)

    const engine = createBrowserSessionEngine({
      fetchImpl: async () => new Response('ok'),
      resolveHost: publicResolver,
    })
    const legacy = await engine.verify!(
      { sourceId: 'source-1', config },
      'sid=raw-cookie',
    )
    expect(legacy.ok).toBe(false)
    expect(legacy.message).toMatch(/重新登录/)
  })
})
