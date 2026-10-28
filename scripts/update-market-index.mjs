import { readFileSync, writeFileSync } from 'node:fs'

const [version, commit] = process.argv.slice(2)
if (!version || !commit) {
  console.error('usage: node scripts/update-market-index.mjs <version> <commit>')
  process.exit(1)
}

const file = new URL('../market/index.json', import.meta.url)
const index = JSON.parse(readFileSync(file, 'utf8'))
const publishTimestamp = Math.floor(Date.now() / 1000)

for (const plugin of index.plugins ?? []) {
  plugin['dist-tags'] = { ...(plugin['dist-tags'] ?? {}), latest: version }
  const versions = (plugin.versions ??= [])
  const entry = {
    version,
    publishTimestamp,
    source: {
      type: 'git',
      url: plugin.repository?.url ?? 'https://github.com/kw78/academic-agent',
      commit,
      path: plugin.repository?.directory ?? '',
    },
    engines: { dsh: '>=0.2.0-rc.1 <0.3.0-0' },
  }
  const existing = versions.find((item) => item.version === version)
  if (existing) Object.assign(existing, entry)
  else versions.push(entry)
}

writeFileSync(file, `${JSON.stringify(index, null, 2)}\n`)
console.log(`market index now points ${version} at ${commit}`)
