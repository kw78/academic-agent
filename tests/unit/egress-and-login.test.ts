import { describe, expect, it } from 'vitest'
import { loginPageSignals, safeFetch } from '@academic/web-sessions'

const fakeIpResolver = async () => [{ address: '198.18.0.193', family: 4 }]
const publicResolver = async () => [{ address: '93.184.216.34', family: 4 }]

describe('proxy fake-IP egress', () => {
  it('accepts a host whose answers are all in the fake-IP range', async () => {
    let called = 0
    const fetchImpl = (async () => {
      called += 1
      return new Response('{"ok":true}', {
        headers: { 'content-type': 'application/json' },
      })
    }) as typeof fetch

    const result = await safeFetch('https://mooc1.chaoxing.com/api/list', {
      allowedHosts: ['mooc1.chaoxing.com'],
      fetchImpl,
      resolveHost: fakeIpResolver,
    })

    expect(result.status).toBe(200)
    expect(called).toBe(1)
  })

  it('still rejects real private addresses and mixed answers', async () => {
    const fetchImpl = (async () => {
      throw new Error('should not be called')
    }) as typeof fetch

    await expect(
      safeFetch('https://internal.example.com/', {
        allowedHosts: ['internal.example.com'],
        fetchImpl,
        resolveHost: async () => [{ address: '10.0.0.5', family: 4 }],
      }),
    ).rejects.toMatchObject({ code: 'UNSAFE_HOST' })

    await expect(
      safeFetch('https://mixed.example.com/', {
        allowedHosts: ['mixed.example.com'],
        fetchImpl,
        resolveHost: async () => [
          { address: '198.18.0.9', family: 4 },
          { address: '10.0.0.5', family: 4 },
        ],
      }),
    ).rejects.toMatchObject({ code: 'UNSAFE_HOST' })
  })

  it('keeps the public path working', async () => {
    const fetchImpl = (async () => new Response('ok')) as typeof fetch
    const result = await safeFetch('https://public.example.com/', {
      allowedHosts: ['example.com'],
      fetchImpl,
      resolveHost: publicResolver,
    })
    expect(result.status).toBe(200)
  })
})

describe('POST transport limits', () => {
  it('sends form-encoded bodies only with the declared content type', async () => {
    let sent: Headers | undefined
    const fetchImpl = (async (_input: unknown, init?: RequestInit) => {
      sent = new Headers(init?.headers)
      return new Response('{"ok":true}', {
        headers: { 'content-type': 'application/json' },
      })
    }) as typeof fetch

    const result = await safeFetch('https://lms.example.edu/api/list', {
      allowedHosts: ['lms.example.edu'],
      resolveHost: publicResolver,
      fetchImpl,
      method: 'POST',
      body: 'courseId=C1&page=1',
      contentType: 'application/x-www-form-urlencoded; charset=utf-8',
      extraHeaders: { 'x-requested-with': 'XMLHttpRequest' },
    })

    expect(result.status).toBe(200)
    expect(sent?.get('content-type')).toBe(
      'application/x-www-form-urlencoded; charset=utf-8',
    )
    expect(sent?.get('x-requested-with')).toBe('XMLHttpRequest')
  })

  it('rejects unlisted headers and unknown POST encodings', async () => {
    const fetchImpl = (async () => new Response('ok')) as typeof fetch
    const base = {
      allowedHosts: ['lms.example.edu'],
      resolveHost: publicResolver,
      fetchImpl,
      method: 'POST' as const,
      body: 'a=1',
    }

    await expect(
      safeFetch('https://lms.example.edu/api/list', {
        ...base,
        extraHeaders: { authorization: 'Bearer x' },
      }),
    ).rejects.toMatchObject({ code: 'INVALID_REQUEST' })

    await expect(
      safeFetch('https://lms.example.edu/api/list', {
        ...base,
        contentType: 'multipart/form-data',
      } as never),
    ).rejects.toMatchObject({ code: 'INVALID_REQUEST' })
  })
})

describe('login page detection', () => {
  it('does not treat a JSON login-named API as an expired session', () => {
    expect(
      loginPageSignals({
        finalUrl:
          'https://onlineweb.zhihuishu.com/gateway/f/v1/login/getLoginUserInfo',
        body: '{"code":0,"data":{"name":"student"}}',
        contentType: 'application/json; charset=utf-8',
      }),
    ).toBe(false)
  })

  it('does not treat a script asset containing /login as a login page', () => {
    expect(
      loginPageSignals({
        finalUrl: 'https://lms.example.edu/static/app.js',
        body: 'const route="/login";export default route;',
        contentType: 'application/javascript',
      }),
    ).toBe(false)
  })

  it('flags an HTML document redirected to a login path', () => {
    expect(
      loginPageSignals({
        finalUrl: 'https://lms.example.edu/webapps/login?action=relogin',
        body: '<html><head><title>Campus</title></head><body><form id="loginForm"></form></body></html>',
        contentType: 'text/html; charset=utf-8',
      }),
    ).toBe(true)
  })

  it('flags a page titled 登录 and honours user patterns on HTML only', () => {
    expect(
      loginPageSignals({
        finalUrl: 'https://lms.example.edu/portal',
        body: '<html><head><title>统一身份认证 - 登录</title></head><body></body></html>',
        contentType: 'text/html',
      }),
    ).toBe(true)

    expect(
      loginPageSignals({
        finalUrl: 'https://lms.example.edu/portal',
        body: '<html><head><title>Portal</title></head><body></body></html>',
        contentType: 'text/html',
        patterns: ['/sso/'],
      }),
    ).toBe(false)
  })
})
