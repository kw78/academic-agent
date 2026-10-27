import { cpSync, mkdirSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const packageRoot = dirname(fileURLToPath(import.meta.url))
const repoRoot = join(packageRoot, '..', '..')

rmSync(join(packageRoot, 'lib'), { recursive: true, force: true })
rmSync(join(packageRoot, 'migrations'), { recursive: true, force: true })
mkdirSync(join(packageRoot, 'lib'), { recursive: true })

await build({
  entryPoints: [join(packageRoot, 'src', 'index.ts')],
  outfile: join(packageRoot, 'lib', 'index.js'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  external: ['@deepseek-ai/cordis', '@deepseek-ai/dsh-tools'],
  legalComments: 'none',
  logLevel: 'info',
})

cpSync(join(repoRoot, 'migrations'), join(packageRoot, 'migrations'), {
  recursive: true,
})
console.log('[academic-dsh-plugin] built lib/index.js and migrations/')
