import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  findAssignmentsAreaUrl,
  findContentAreaUrls,
  isLoginPage,
  parseAssessmentDetail,
  parseAssignmentDetail,
  parseAssignmentLinks,
  parseContentPage,
  parseCourseLinks,
  parseDue,
} from '../src/parse.js'

function fixture(name: string): string {
  return readFileSync(
    fileURLToPath(new URL(`../../../fixtures/blackboard/${name}`, import.meta.url)),
    'utf8',
  )
}

const BASE = 'https://bb.example.edu/'

describe('Blackboard HTML parsing', () => {
  it('prefers course metadata and filters by term', () => {
    const html = fixture('portal.html')
    const all = parseCourseLinks(html, { baseUrl: BASE })
    expect(all.courses).toHaveLength(2)
    expect(all.courses[0]).toMatchObject({
      externalCourseId: '_1001_1',
      code: 'CS101.01',
      termId: '2026FA',
      title: 'Data Structures',
    })

    const current = parseCourseLinks(html, {
      baseUrl: BASE,
      termFilter: ['2026fa'],
    })
    expect(current.courses).toHaveLength(1)
    expect(current.courses[0]?.title).toBe('Data Structures')

    const limited = parseCourseLinks(html, { baseUrl: BASE, maxCourses: 1 })
    expect(limited.courses).toHaveLength(1)
    expect(limited.truncated).toBe(true)
  })

  it('finds the assignments area and deduplicates assignment links', () => {
    const courseHtml = fixture('course-1001.html')
    const area = findAssignmentsAreaUrl(courseHtml, BASE)
    expect(area).toContain('listContent.jsp')
    expect(area).toContain('course_id=_1001_1')

    const assignments = parseAssignmentLinks(
      fixture('assignments-1001.html'),
      BASE,
      '_1001_1',
    ).assignments
    expect(assignments).toHaveLength(2)
    expect(assignments.map((entry) => entry.title)).toEqual(['HW1', 'HW2'])
    expect(assignments[0]?.externalItemId).toBe('bb:_1001_1:_7001_1')
  })

  it('discovers content areas, folders and assessments', () => {
    const areas = findContentAreaUrls(fixture('course-1001.html'), BASE)
    expect(areas).toHaveLength(2)
    expect(areas.join(' ')).toContain('_5001_1')
    expect(areas.join(' ')).toContain('_5002_1')

    const tests = parseContentPage(fixture('tests-1001.html'), BASE, '_1001_1')
    expect(tests.items).toEqual([
      {
        kind: 'quiz',
        externalItemId: 'bb:_1001_1:assessment:_8001_1',
        courseExternalId: '_1001_1',
        title: 'Quiz 1',
        url: 'https://bb.example.edu/webapps/assessment/do/content/assessment?action=MODIFY&course_id=_1001_1&content_id=_8001_1&assessment_id=_9001_1',
      },
    ])
    expect(tests.folders).toHaveLength(1)
    expect(tests.folders[0]).toContain('_5102_1')
    expect(tests.nextPage).toContain('startIndex=2')

    const folder = parseContentPage(
      fixture('test-folder-1001.html'),
      BASE,
      '_1001_1',
    )
    expect(folder.items[0]).toMatchObject({
      kind: 'exam',
      externalItemId: 'bb:_1001_1:assessment:_8002_1',
      title: 'Final Exam',
    })

    const quiz = parseAssessmentDetail(
      fixture('test-8001.html'),
      'https://bb.example.edu/webapps/assessment/do/content/assessment?content_id=_8001_1&course_id=_1001_1',
      '_1001_1',
      'Quiz 1',
      'quiz',
      { zone: 'Asia/Shanghai', utcOffsetMinutes: 480 },
    )
    expect(quiz).toMatchObject({ kind: 'quiz', title: 'Quiz 1' })
    expect(quiz.due).toEqual({
      kind: 'instant',
      utc: '2026-11-05T06:00:00.000Z',
      zone: 'Asia/Shanghai',
    })
    expect(quiz.externalItemId).toBe('bb:_1001_1:assessment:_8001_1')

    const exam = parseAssessmentDetail(
      fixture('test-8002.html'),
      'https://bb.example.edu/webapps/assessment/do/content/assessment?content_id=_8002_1&course_id=_1001_1',
      '_1001_1',
      'Final Exam',
      'exam',
      { zone: 'Asia/Shanghai', utcOffsetMinutes: 480 },
    )
    expect(exam.kind).toBe('exam')
    expect(exam.due).toEqual({
      kind: 'instant',
      utc: '2026-12-18T01:00:00.000Z',
      zone: 'Asia/Shanghai',
    })

    const unknown = parseAssessmentDetail(
      '<html><head><title>Quiz: No due</title></head><body></body></html>',
      'https://bb.example.edu/webapps/assessment/do/content/assessment?content_id=_8009_1&course_id=_1001_1',
      '_1001_1',
      'Quiz: No due',
      'quiz',
      { zone: 'Asia/Shanghai', utcOffsetMinutes: 480 },
    )
    expect(unknown.due).toEqual({ kind: 'unknown' })
  })

  it('parses assignment detail, due dates and stable hashes', () => {
    const html = fixture('assignment-7002.html')
    const parsed = parseAssignmentDetail(
      html,
      'https://bb.example.edu/webapps/assignment/uploadAssignment?content_id=_7002_1&course_id=_1001_1',
      '_1001_1',
      'HW2',
      { zone: 'Asia/Shanghai', utcOffsetMinutes: 480 },
    )
    expect(parsed.title).toBe('HW2')
    expect(parsed.kind).toBe('assignment')
    expect(parsed.due).toEqual({
      kind: 'instant',
      utc: '2026-11-01T23:49:00.000Z',
      zone: 'Asia/Shanghai',
    })
    expect(parsed.description).toContain('Read chapter 2')
    expect(parsed.contentHash).toMatch(/^[0-9a-f]{64}$/)

    const repeated = parseAssignmentDetail(
      html,
      'https://bb.example.edu/webapps/assignment/uploadAssignment?content_id=_7002_1&course_id=_1001_1',
      '_1001_1',
      'HW2',
      { zone: 'Asia/Shanghai', utcOffsetMinutes: 480 },
    )
    expect(repeated.contentHash).toBe(parsed.contentHash)

    const changed = parseAssignmentDetail(
      html.replace('Read chapter 2', 'Read chapter 3'),
      'https://bb.example.edu/webapps/assignment/uploadAssignment?content_id=_7002_1&course_id=_1001_1',
      '_1001_1',
      'HW2',
      { zone: 'Asia/Shanghai', utcOffsetMinutes: 480 },
    )
    expect(changed.contentHash).not.toBe(parsed.contentHash)

    const dateOnly = parseAssignmentDetail(
      fixture('assignment-7001.html'),
      'https://bb.example.edu/webapps/assignment/uploadAssignment?content_id=_7001_1&course_id=_1001_1',
      '_1001_1',
      'HW1',
      { zone: 'Asia/Shanghai', utcOffsetMinutes: 480 },
    )
    expect(dateOnly.due).toEqual({
      kind: 'local-date',
      date: '2026-11-10',
      zone: 'Asia/Shanghai',
    })

    const history = parseAssignmentDetail(
      fixture('assignment-history-7001.html'),
      'https://bb.example.edu/webapps/assignment/uploadAssignment?content_id=_7001_1&course_id=_1001_1',
      '_1001_1',
      'HW1',
      { zone: 'Asia/Shanghai', utcOffsetMinutes: 480 },
    )
    expect(history.title).toBe('HW1')
    expect(history.due).toEqual({
      kind: 'instant',
      utc: '2026-11-09T23:49:00.000Z',
      zone: 'Asia/Shanghai',
    })
  })

  it('parses Chinese, English and ISO due dates without inventing values', () => {
    expect(
      parseDue('2026年11月2日 星期一 上午7:49', 'Asia/Shanghai', 480),
    ).toEqual({
      kind: 'instant',
      utc: '2026-11-01T23:49:00.000Z',
      zone: 'Asia/Shanghai',
    })
    expect(parseDue('Nov 2, 2026 7:49 AM', 'Asia/Shanghai', 480)).toEqual({
      kind: 'instant',
      utc: '2026-11-01T23:49:00.000Z',
      zone: 'Asia/Shanghai',
    })
    expect(parseDue('2026-11-02T07:49', 'Asia/Shanghai', 480)).toEqual({
      kind: 'instant',
      utc: '2026-11-01T23:49:00.000Z',
      zone: 'Asia/Shanghai',
    })
    expect(parseDue('2026年2月30日', 'Asia/Shanghai', 480)).toEqual({
      kind: 'unknown',
    })
    expect(parseDue('no date here', 'Asia/Shanghai', 480)).toEqual({
      kind: 'unknown',
    })
  })

  it('detects a login page', () => {
    expect(isLoginPage(`${BASE}webapps/login/`, fixture('login.html'))).toBe(true)
    expect(isLoginPage(`${BASE}webapps/portal/execute/tabs/tabAction`, '<html>ok</html>')).toBe(false)
  })
})
