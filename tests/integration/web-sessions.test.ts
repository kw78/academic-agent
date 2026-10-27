import { afterEach, describe, expect, it } from 'vitest'
import { InMemoryCredentialVault } from '@academic/connections'
import { WebSessionStore } from '@academic/web-sessions'
import { createTestStore, fixedClock, sequentialIds } from '../helpers/store.js'

const cleanup: Array<() => void> = []

afterEach(() => {
  for (const dispose of cleanup.splice(0).reverse()) dispose()
})

describe('generic web sessions', () => {
  it('stores cookies outside the database and fetches only for the matching domain', async () => {
    const clock = fixedClock()
    const store = createTestStore({ clock })
    cleanup.push(() => store.close())
    const vault = new InMemoryCredentialVault()
    let sentCookie: string | null = null
    const webSessions = new WebSessionStore({
      db: store.database,
      vault,
      clock,
      ids: sequentialIds('web'),
      async fetchImpl(_input, init) {
        sentCookie = new Headers(init?.headers).get('cookie')
        return new Response('<html>ok</html>', {
          status: 200,
          headers: { 'content-type': 'text/html' },
        })
      },
    })

    const session = await webSessions.create({
      loginUrl: 'https://example.com/login',
      label: 'Example',
      cookies: [{ name: 'sid', value: 'top-secret' }],
    })
    expect(session.domain).toBe('example.com')
    expect(webSessions.list()).toHaveLength(1)
    expect(JSON.stringify(webSessions.list())).not.toContain('top-secret')

    const page = await webSessions.fetch(session.sessionId, 'https://www.example.com/page')
    expect(sentCookie).toBe('sid=top-secret')
    expect(page.status).toBe(200)
    expect(page.body).toContain('ok')
    expect(JSON.stringify(page)).not.toContain('top-secret')

    await expect(
      webSessions.fetch(session.sessionId, 'https://other.example.net/'),
    ).rejects.toThrow(/does not match session domain/)

    await webSessions.delete(session.sessionId)
    expect(webSessions.list()).toHaveLength(0)
  })
})
