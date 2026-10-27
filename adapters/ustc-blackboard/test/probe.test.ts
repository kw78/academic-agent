import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  extractCourseLinks,
  probeBlackboard,
  USTC_BLACKBOARD_PORTAL_URL,
} from '../src/index.js'

const cleanup: Array<() => void> = []

afterEach(() => {
  for (const dispose of cleanup.splice(0).reverse()) dispose()
})

function tempDir(): string {
  const directory = mkdtempSync(join('.data', 'bb-probe-test-'))
  cleanup.push(() => rmSync(directory, { recursive: true, force: true }))
  return directory
}

const PORTAL_HTML = `<!doctype html>
<html><head><title>我的课程</title></head><body>
<a href="/webapps/portal/execute/tabs/tabAction?tab_tab_group_id=_1_1">首页</a>
<a href="/webapps/blackboard/execute/launcher?type=Course&amp;id=_123_1" title="CS101">
  <span>计算机科学</span>
</a>
<a href="/webapps/blackboard/execute/launcher?type=Course&id=_123_1">重复课程</a>
<a href="/webapps/blackboard/content/listContent.jsp?course_id=_456_1">高等数学</a>
</body></html>`

const COURSE_HTML = `<!doctype html><html><head><title>CS101</title></head><body>Course</body></html>`

function response(html: string, url: string): Response {
  return {
    status: 200,
    url,
    text: async () => html,
  } as Response
}

describe('Blackboard session probe', () => {
  it('extracts course links and saves HTML without leaking the cookie', async () => {
    const outputDir = tempDir()
    const cookie = 'BbRouter=secret-session; JSESSIONID=abc'
    const calls: string[] = []
    const fetchImpl: typeof fetch = async (input) => {
      const url = String(input)
      calls.push(url)
      if (url === USTC_BLACKBOARD_PORTAL_URL) {
        return response(PORTAL_HTML, USTC_BLACKBOARD_PORTAL_URL)
      }
      return response(COURSE_HTML, url)
    }

    const result = await probeBlackboard({
      cookie,
      outputDir,
      fetchImpl,
      maxCourses: 1,
    })

    expect(result.requiresLogin).toBe(false)
    expect(result.title).toBe('我的课程')
    expect(result.courseLinks).toHaveLength(2)
    expect(result.courseLinks[0]?.title).toContain('计算机科学')
    expect(result.courseLinks[0]?.url).toContain('launcher?type=Course')
    expect(result.saved.some((path) => path.endsWith('portal.html'))).toBe(true)
    expect(result.saved.some((path) => path.endsWith('course-1.html'))).toBe(true)
    expect(calls).toHaveLength(2)

    const summary = readFileSync(join(outputDir, 'summary.json'), 'utf8')
    expect(summary).not.toContain('BbRouter')
    expect(summary).not.toContain('JSESSIONID')
    expect(summary).not.toContain('secret-session')
  })

  it('detects a redirect to the login page', async () => {
    const outputDir = tempDir()
    const fetchImpl: typeof fetch = async () =>
      response(
        '<html><head><title>登录</title></head><body><form name="login"></form></body></html>',
        'https://www.bb.ustc.edu.cn/webapps/login/',
      )
    const result = await probeBlackboard({
      cookie: 'BbRouter=expired',
      outputDir,
      fetchImpl,
    })
    expect(result.requiresLogin).toBe(true)
    expect(result.courseLinks).toHaveLength(0)
    expect(result.warnings[0]).toContain('login page')
  })

  it('does not return unrelated anchors', () => {
    const links = extractCourseLinks(
      '<a href="/webapps/portal/execute/tabs/tabAction">首页</a>',
      USTC_BLACKBOARD_PORTAL_URL,
    )
    expect(links).toEqual([])
  })
})
