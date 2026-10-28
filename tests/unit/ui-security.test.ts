import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const CLIENT_ROOT = 'packages/academic-dsh-ui/src/client'

function clientSources(): Array<{ path: string; text: string }> {
  return (readdirSync(CLIENT_ROOT, { recursive: true }) as string[])
    .filter((name) => name.endsWith('.ts') || name.endsWith('.tsx'))
    .filter((name) => !name.endsWith('.d.ts'))
    .map((name) => {
      const path = join(CLIENT_ROOT, name)
      return { path, text: readFileSync(path, 'utf8') }
    })
}

describe('academic UI client security constraints', () => {
  it('never names credential references or secret storage APIs', () => {
    for (const source of clientSources()) {
      expect(source.text, source.path).not.toContain('credentialRef')
      expect(source.text, source.path).not.toContain('credential_ref')
      expect(source.text, source.path).not.toContain('sessionStorage')
      expect(source.text, source.path).not.toContain('indexedDB')
      expect(source.text, source.path).not.toMatch(/\bfetch\s*\(/)
      expect(source.text, source.path).not.toMatch(/from ['"]node:/)
    }
  })

  it('stores only the non-sensitive UI tab preference in local storage', () => {
    for (const source of clientSources()) {
      for (const match of source.text.matchAll(/localStorage\.(setItem|removeItem)\(([^)]*)/g)) {
        const argument = match[2] ?? ''
        expect(argument, source.path).toMatch(
          /TAB_KEY|academic\.ui\.tab\.v1|GUIDE_KEY|academic\.ui\.guide\.v1/,
        )
      }
    }
  })

  it('clears the credential state before awaiting the Host submission', () => {
    const page = readFileSync(join(CLIENT_ROOT, 'pages/ConnectionsPage.tsx'), 'utf8')
    const clear = page.indexOf('setSecret(\'\')')
    const submit = page.indexOf('await callApi<ConnectionView>(ctx, \'sourceSetSecret\'')
    expect(clear).toBeGreaterThan(-1)
    expect(submit).toBeGreaterThan(clear)
  })
})
