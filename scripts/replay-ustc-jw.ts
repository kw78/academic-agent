import { readFileSync, writeFileSync } from 'node:fs'
import { replayManifest } from '../packages/academic-adapter-runtime/src/runtime.ts'

/**
 * 离线回放 ustc-jw 的声明式候选：只读本地样本，不联网。
 * 用法（仓库根目录）：node node_modules/tsx/dist/cli.mjs scripts/replay-ustc-jw.ts
 */
const manifestPath = 'D:/project/dsh/ustc-jw-academic.adapter.json'
const sampleDir = 'D:/project/dsh/samples/ustc-jw'

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))

const samples = [
  {
    url: 'https://jw.ustc.edu.cn/for-std/course-table/get-data?bizTypeId=2&semesterId=461&dataId=503569',
    body: readFileSync(`${sampleDir}/course-table.semester-461.dataId-503569.xml`, 'utf8'),
    contentType: 'application/xhtml+xml;charset=UTF-8',
  },
  {
    url: 'https://jw.ustc.edu.cn/for-std/exam-arrange/info/503569',
    body: readFileSync(`${sampleDir}/exam-arrange.503569.html`, 'utf8'),
    contentType: 'text/html;charset=UTF-8',
  },
]

const report = await replayManifest(manifest, samples, {
  now: () => '2026-10-28T07:45:00.000Z',
})
writeFileSync(`${sampleDir}/replay-report.json`, JSON.stringify(report, null, 2))

console.log(
  JSON.stringify(
    {
      ok: report.ok,
      checks: report.checks,
      errors: report.errors,
      warnings: report.warnings,
      courses: report.courses.map((course) => `${course.code} ${course.title}`),
      items: [...new Set(report.items.map((item) => item.externalItemId))],
    },
    null,
    2,
  ),
)
