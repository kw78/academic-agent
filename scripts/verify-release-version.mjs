import { readFileSync } from 'node:fs'

const version = process.argv[2]
if (!version) {
  console.error('usage: node scripts/verify-release-version.mjs <version>')
  process.exit(1)
}

const files = [
  'package.json',
  'packages/academic-dsh-plugin/package.json',
  'packages/academic-dsh-ui/package.json',
  'packages/academic-dsh-plugin/dsh.plugin.json',
]

let failed = false
for (const file of files) {
  const json = JSON.parse(readFileSync(file, 'utf8'))
  if (json.version !== version) {
    console.error(`${file}: version ${json.version}, expected ${version}`)
    failed = true
  }
}

const uiApi = readFileSync('packages/academic-dsh-ui/src/api.ts', 'utf8')
if (!uiApi.includes(`version: '${version}'`)) {
  console.error(`packages/academic-dsh-ui/src/api.ts: status version is not ${version}`)
  failed = true
}

if (failed) process.exit(1)
console.log(`release version ${version} is consistent`)
