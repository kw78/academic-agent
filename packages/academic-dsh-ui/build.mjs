import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const packageRoot = dirname(fileURLToPath(import.meta.url))
const lib = join(packageRoot, 'lib')

rmSync(lib, { recursive: true, force: true })
mkdirSync(lib, { recursive: true })

await build({
  entryPoints: { host: join(packageRoot, 'src', 'host.ts') },
  outdir: lib,
  entryNames: '[name]',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  external: ['@deepseek-ai/cordis', '@deepseek-ai/dsh-typert-protocol', 'playwright-core'],
  legalComments: 'none',
  logLevel: 'info',
})

const clientBodyPath = join(lib, 'client.body.js')
await build({
  entryPoints: [join(packageRoot, 'src', 'client', 'index.tsx')],
  outfile: clientBodyPath,
  bundle: true,
  platform: 'browser',
  format: 'cjs',
  target: 'es2022',
  jsx: 'automatic',
  jsxImportSource: 'react',
  external: ['react', 'react/jsx-runtime'],
  define: { 'process.env.NODE_ENV': '"production"' },
  legalComments: 'none',
  logLevel: 'info',
})

const body = readFileSync(clientBodyPath, 'utf8')
const wrapped = `window.__ModuleLoader__.load({
  id: "@academic/dsh-ui",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
${body}
    return module.exports;
  }
});
`
writeFileSync(join(lib, 'client.js'), wrapped)
rmSync(clientBodyPath, { force: true })
console.log('[academic-dsh-ui] built host and client bundles')
