import { describe, expect, it } from 'vitest'
import type { AdapterSample } from '@academic/contracts'
import { buildCaptureSummary } from '@academic/sources'

function jsonSample(
  sampleId: string,
  url: string,
  body: unknown,
  overrides: Partial<AdapterSample> = {},
): {
  sampleId: string
  sample: AdapterSample
  status: number
  headerNames: string[]
} {
  return {
    sampleId,
    sample: {
      url,
      method: 'GET',
      body: JSON.stringify(body),
      contentType: 'application/json; charset=utf-8',
      ...overrides,
    },
    status: 200,
    headerNames: ['accept', 'x-requested-with', 'cookie', 'referer'],
  }
}

const base = {
  sourceId: 'source-1',
  captureId: 'capture-1',
  startedAt: '2026-10-28T10:00:00.000Z',
  finishedAt: '2026-10-28T10:05:00.000Z',
  hosts: ['mooc1.chaoxing.com'],
  visited: 24,
}

describe('guided capture inventory', () => {
  it('summarises a course list with fields, hosts and masked params', () => {
    const summary = buildCaptureSummary({
      ...base,
      samples: [
        jsonSample(
          's-1',
          'https://mooc1.chaoxing.com/api/course/list?token=abc&page=1',
          {
            data: {
              list: [
                { courseId: 101, courseName: '高等数学', teacher: '张老师' },
                { courseId: 102, courseName: '大学物理', teacher: '李老师' },
              ],
            },
          },
        ),
      ],
    })

    expect(summary.hosts).toEqual(['mooc1.chaoxing.com'])
    expect(summary.endpoints).toHaveLength(1)
    const endpoint = summary.endpoints[0]!
    expect(endpoint.kind).toBe('list')
    expect(endpoint.score).toBeGreaterThanOrEqual(30)
    expect(endpoint.url).toContain('token=***')
    expect(endpoint.response.root).toBe('object')
    expect(endpoint.response.itemCount).toBe(2)
    expect(endpoint.response.collectionPath).toBe('data.list')
    expect(endpoint.response.fields.map((field) => field.key)).toEqual([
      'courseId',
      'courseName',
      'teacher',
    ])
    expect(endpoint.response.fields[0]?.path).toBe('courseId')
    expect(summary.nextStep.action).toBe('needs-confirmation')
    expect(endpoint.request.headerHints).toEqual(['accept', 'x-requested-with', 'referer'])
    expect(summary.warnings.join(' ')).toContain('鉴权参数')
    expect(summary.suggested.pathPrefixes).toContain('/api')
  })

  it('detects the pagination parameter from two observed pages', () => {
    const first = jsonSample(
      's-1',
      'https://lms.example.edu/api/assignments?page=1',
      [{ id: 'a1', title: '作业一', due: '2026-11-01' }],
      { method: 'GET' },
    )
    const second = jsonSample(
      's-2',
      'https://lms.example.edu/api/assignments?page=2',
      [{ id: 'a2', title: '作业二', due: '2026-11-08' }],
      { method: 'GET' },
    )
    const summary = buildCaptureSummary({ ...base, samples: [first, second] })

    const endpoint = summary.endpoints.find((entry) =>
      entry.path.includes('/api/assignments'),
    )
    expect(endpoint?.pagination).toEqual({ param: 'page', values: ['1', '2'] })
    expect(summary.suggested.pathPrefixes).toContain('/api')
    expect(summary.nextStep).toMatchObject({
      action: 'validate',
      reason: '首选接口 items 路径：$',
    })
  })

  it('keeps an HTML document as a low-score page with table headers', () => {
    const summary = buildCaptureSummary({
      ...base,
      samples: [
        {
          sampleId: 's-html',
          sample: {
            url: 'https://lms.example.edu/course/1/assignments',
            method: 'GET',
            contentType: 'text/html; charset=utf-8',
            body: '<table><tr><th>作业</th><th>截止时间</th></tr><tr><td>A</td><td>11-01</td></tr></table>',
          },
          status: 200,
          headerNames: ['accept'],
        },
      ],
    })

    const endpoint = summary.endpoints[0]!
    expect(endpoint.kind).toBe('document')
    expect(endpoint.score).toBeLessThanOrEqual(20)
    expect(endpoint.response.fields.map((field) => field.key)).toEqual([
      '作业',
      '截止时间',
    ])
  })

  it('finds a deeply nested list and reports its exact path', () => {
    const summary = buildCaptureSummary({
      ...base,
      samples: [
        jsonSample('s-deep', 'https://lms.example.edu/api/v2/feed', {
          data: {
            payload: {
              result: {
                records: [
                  { courseId: 'C1', courseName: '高等数学' },
                  { courseId: 'C2', courseName: '大学物理' },
                ],
              },
            },
          },
        }),
      ],
    })

    const endpoint = summary.endpoints[0]!
    expect(endpoint.response.collectionPath).toBe(
      'data.payload.result.records',
    )
    expect(endpoint.response.itemCount).toBe(2)
    expect(endpoint.collections?.map((entry) => entry.path)).toEqual([
      'data.payload.result.records',
    ])
    expect(endpoint.response.fields.map((field) => field.key)).toEqual([
      'courseId',
      'courseName',
    ])
    expect(summary.nextStep).toMatchObject({
      action: 'validate',
      reason: '首选接口 items 路径：data.payload.result.records',
    })
  })

  it('keeps every array node so filters cannot hide the real list', () => {
    const summary = buildCaptureSummary({
      ...base,
      samples: [
        jsonSample('s-multi', 'https://lms.example.edu/api/course/home', {
          filters: [
            { id: 1, label: '全部' },
            { id: 2, label: '进行中' },
          ],
          data: {
            records: [
              { courseId: 'C1', courseName: '高等数学' },
              { courseId: 'C2', courseName: '大学物理' },
            ],
          },
        }),
      ],
    })

    const endpoint = summary.endpoints[0]!
    expect(endpoint.response.collectionPath).toBe('data.records')
    expect(endpoint.collections?.map((entry) => entry.path)).toEqual([
      'data.records',
      'filters',
    ])
    expect(endpoint.response.fields.map((field) => field.key)).toContain(
      'courseName',
    )
  })

  it('reports nested field paths such as details.due', () => {
    const summary = buildCaptureSummary({
      ...base,
      samples: [
        jsonSample('s-nested', 'https://lms.example.edu/api/assignments', [
          {
            id: 'A1',
            title: '作业一',
            details: { due: '2026-11-01', teacher: { name: '张老师' } },
          },
        ]),
      ],
    })

    const fields = summary.endpoints[0]!.response.fields
    expect(fields.find((field) => field.path === 'details.due')).toMatchObject({
      type: 'string',
      example: '2026-11-01',
    })
    expect(fields.some((field) => field.path === 'details.teacher.name')).toBe(
      false,
    )
  })

  it('sorts before applying the endpoint cap', () => {
    const noise = Array.from({ length: 45 }, (_, index) =>
      jsonSample(
        `n-${index}`,
        `https://lms.example.edu/api/ping/${index}`,
        { ok: true },
      ),
    )
    const business = jsonSample(
      'biz',
      'https://lms.example.edu/api/courses',
      [
        { courseId: 'C1', courseName: '高等数学' },
        { courseId: 'C2', courseName: '大学物理' },
      ],
    )
    const summary = buildCaptureSummary({
      ...base,
      samples: [...noise, business],
    })

    expect(summary.endpoints).toHaveLength(40)
    expect(summary.endpoints[0]?.path).toBe('/api/courses')
    expect(summary.warnings.join(' ')).toContain('仅保留评分最高')
  })

  it('reports form-encoded POST as replayable with bodyFormat', () => {
    const summary = buildCaptureSummary({
      ...base,
      samples: [
        {
          sampleId: 's-form',
          status: 200,
          headerNames: ['content-type', 'x-requested-with'],
          requestContentType: 'application/x-www-form-urlencoded; charset=UTF-8',
          sample: {
            url: 'https://lms.example.edu/visit/courselistdata',
            method: 'POST',
            body: JSON.stringify([{ courseId: 'C1', courseName: '高等数学' }]),
            contentType: 'application/json',
            requestBody: 'courseId=1&page=1',
          },
        },
      ],
    })

    expect(summary.endpoints[0]?.transport).toBe('form')
    expect(summary.warnings.join(' ')).toContain('bodyFormat')
    expect(summary.nextStep.action).toBe('validate')
    expect(summary.nextStep.reason).toContain('bodyFormat')
  })

  it('reports filtered responses instead of silently shrinking', () => {
    const summary = buildCaptureSummary({
      ...base,
      samples: [
        jsonSample('s-1', 'https://lms.example.edu/api/courses', [
          { courseId: 'C1', courseName: '高等数学' },
          { courseId: 'C2', courseName: '大学物理' },
        ]),
      ],
      skipped: { noise: 3, nonText: 2, tooLarge: 1, limit: 1, failed: 0 },
    })

    const warnings = summary.warnings.join(' ')
    expect(warnings).toContain('过滤了部分响应')
    expect(warnings).toContain('静态/登出 3')
    expect(warnings).toContain('达到数量上限 1')
  })

  it('stops when a list request carries a dynamic signature', () => {
    const summary = buildCaptureSummary({
      ...base,
      samples: [
        {
          sampleId: 's-sign',
          status: 200,
          headerNames: ['content-type'],
          requestContentType:
            'application/x-www-form-urlencoded; charset=UTF-8',
          sample: {
            url: 'https://lms.example.edu/api/course/list',
            method: 'POST',
            contentType: 'application/json',
            body: JSON.stringify([
              { courseId: 'C1', courseName: '高等数学' },
              { courseId: 'C2', courseName: '大学物理' },
            ]),
            requestBody: 'secretStr=abc&page=1',
          },
        },
      ],
    })

    expect(summary.endpoints[0]?.transport).toBe('form')
    expect(summary.warnings.join(' ')).toContain('动态签名')
    expect(summary.nextStep.action).toBe('needs-confirmation')
  })

  it('keeps an empty list endpoint visible and asks for a re-record', () => {
    const summary = buildCaptureSummary({
      ...base,
      samples: [
        jsonSample('s-empty', 'https://lms.example.edu/api/course/list', {
          data: { list: [] },
        }),
      ],
    })

    const endpoint = summary.endpoints[0]!
    expect(endpoint.collections?.[0]).toMatchObject({
      path: 'data.list',
      itemCount: 0,
      empty: true,
    })
    expect(endpoint.kind).toBe('list')
    expect(summary.nextStep.action).toBe('recapture')
  })

  it('does not treat a school dictionary as the course list', () => {
    const dictionary = jsonSample(
      'dict',
      'https://lms.example.edu/v2/apis/school/findSchoolV2',
      {
        rt: [
          { schoolId: 1, name: '南京邮电大学', loginUrl: 'https://a' },
          { schoolId: 2, name: '中国科学技术大学', loginUrl: 'https://b' },
        ],
      },
    )
    const alone = buildCaptureSummary({ ...base, samples: [dictionary] })
    expect(alone.endpoints[0]?.collections?.[0]?.reference).toBe(true)
    expect(alone.nextStep.action).toBe('recapture')

    const courses = jsonSample('courses', 'https://lms.example.edu/api/courses', {
      data: {
        records: [
          { courseId: 'C1', courseName: '高等数学' },
          { courseId: 'C2', courseName: '大学物理' },
        ],
      },
    })
    const both = buildCaptureSummary({ ...base, samples: [dictionary, courses] })
    expect(both.nextStep.action).toBe('validate')
    expect(both.nextStep.reason).toContain('data.records')
  })

  it('exposes a masked bodyPreview for POST requests', () => {
    const summary = buildCaptureSummary({
      ...base,
      samples: [
        {
          sampleId: 's-json',
          status: 200,
          headerNames: ['content-type'],
          requestContentType: 'application/json',
          sample: {
            url: 'https://lms.example.edu/api/list',
            method: 'POST',
            body: JSON.stringify([{ courseId: 'C1', courseName: '高等数学' }]),
            contentType: 'application/json',
            requestBody: JSON.stringify({
              action: 'list',
              token: 'abc',
              courseId: 'C1',
            }),
          },
        },
      ],
    })

    const preview = summary.endpoints[0]?.request.bodyPreview
    expect(preview).toContain('"token":"***"')
    expect(preview).toContain('"courseId":"C1"')
  })

  it('drops login and other noise endpoints', () => {
    const summary = buildCaptureSummary({
      ...base,
      samples: [
        jsonSample('s-1', 'https://lms.example.edu/api/login/userinfo', {
          name: 'student',
        }),
        jsonSample('s-2', 'https://lms.example.edu/api/notice/unread', {
          count: 2,
        }),
      ],
    })
    expect(summary.endpoints).toHaveLength(0)
    expect(summary.warnings.join(' ')).toContain('没有捕获到')
    expect(summary.nextStep.action).toBe('recapture')
  })
})
