import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  ManifestRegistry,
  MAX_ROWS_PER_PAGE,
  extractPage,
  parseManifest,
  readJsonPath,
  regexSafetyError,
  renderManifestUrl,
  type AdapterManifest,
} from '../src/index.js'

function fixture(name: string): string {
  return readFileSync(
    fileURLToPath(new URL(`../../../fixtures/declarative/${name}`, import.meta.url)),
    'utf8',
  )
}

const htmlManifest = {
  schemaVersion: 1,
  adapterId: 'demo-html',
  version: '1.0.0',
  displayName: 'Demo HTML',
  baseUrl: 'https://lms.example.edu/',
  allowedOrigins: ['lms.example.edu'],
  allowedPathPrefixes: ['/portal.html', '/course/', '/assignment/'],
  courses: {
    url: '/portal.html',
    responseType: 'html',
    items: 'article.course',
    fields: {
      externalCourseId: { selector: 'a', attribute: 'data-id' },
      code: { selector: '.code' },
      title: { selector: '.title' },
      termId: { selector: '.term' },
    },
  },
  assignments: {
    url: '/course/{{course.externalCourseId}}.html',
    responseType: 'html',
    items: 'li.assignment',
    fields: {
      externalItemId: { selector: 'a', attribute: 'data-id' },
      title: { selector: '.title' },
      sourceUrl: { selector: 'a', attribute: 'href' },
    },
  },
  detail: {
    url: '/assignment/{{assignment.externalItemId}}.html',
    responseType: 'html',
    items: 'body',
    fields: {
      title: { selector: '#title' },
      due: { selector: '#due' },
      description: { selector: '#description' },
    },
  },
} as const

describe('declarative manifest', () => {
  it('validates manifests and keeps version history', () => {
    const registry = new ManifestRegistry()
    const v1 = registry.register(htmlManifest)
    expect(v1.adapterId).toBe('demo-html')
    expect(registry.get('demo-html')?.version).toBe('1.0.0')

    const v2 = registry.register({ ...htmlManifest, version: '1.1.0' })
    expect(registry.get('demo-html')?.version).toBe('1.0.0')
    expect(registry.activate('demo-html', v2.version).version).toBe('1.1.0')
    expect(registry.get('demo-html')?.version).toBe('1.1.0')
    expect(registry.list()[0]?.versions).toHaveLength(2)

    expect(() =>
      parseManifest({
        ...htmlManifest,
        courses: {
          ...htmlManifest.courses,
          fields: { bad: { selector: 'a', path: 'id' } },
        },
      }),
    ).toThrow()
  })

  it('extracts HTML rows and relative next links', () => {
    const manifest = parseManifest(htmlManifest) as AdapterManifest
    const page = extractPage(fixture('portal.html'), manifest.courses)
    expect(page.rows).toHaveLength(2)
    expect(page.rows[0]).toMatchObject({
      externalCourseId: 'C1',
      code: 'CS101.01.2026FA',
      title: 'Data Structures',
      termId: '2026FA',
    })
    expect(page.next).toBeUndefined()
  })

  it('extracts JSON values and reads nested paths', () => {
    const manifest = parseManifest({
      ...htmlManifest,
      adapterId: 'demo-json',
      courses: {
        url: '/api/courses',
        responseType: 'json',
        items: 'data',
        fields: {
          externalCourseId: { path: 'id' },
          code: { path: 'code' },
          title: { path: 'title' },
          termId: { path: 'term' },
        },
      },
    })
    const page = extractPage(fixture('courses.json'), manifest.courses)
    expect(page.rows).toHaveLength(2)
    expect(page.rows[1]).toMatchObject({ externalCourseId: 'C2', title: 'Calculus' })
    expect(readJsonPath({ data: { items: [{ id: 'x' }] } }, 'data.items[0].id')).toBe('x')
  })

  it('supports constant fields and field templates', () => {
    const manifest = parseManifest({
      ...htmlManifest,
      courses: {
        ...htmlManifest.courses,
        fields: {
          ...htmlManifest.courses.fields,
          termId: { constant: '2026FA' },
          itemKey: { template: '{{externalCourseId}}|{{code}}' },
        },
      },
    })
    const page = extractPage(fixture('portal.html'), manifest.courses)
    expect(page.rows[0]).toMatchObject({
      externalCourseId: 'C1',
      termId: '2026FA',
      itemKey: 'C1|CS101.01.2026FA',
    })
  })

  it('coerces types, applies defaults and reports missing fields', () => {
    const manifest = parseManifest({
      ...htmlManifest,
      adapterId: 'conversion',
      courses: {
        url: '/portal.html',
        responseType: 'html',
        items: 'li.row',
        fields: {
          externalCourseId: {
            selector: '.id',
            attribute: 'data-id',
            required: true,
          },
          title: { selector: '.title', required: true },
          credits: { selector: '.credits', type: 'number' },
          active: { selector: '.active', type: 'boolean' },
          termId: { selector: '.term', default: '2026FA' },
          note: { selector: '.note', required: true },
        },
      },
    })
    const payload = [
      '<ul>',
      '<li class="row"><span class="id" data-id="C1"></span><span class="title">Data</span><span class="credits">3</span><span class="active">yes</span></li>',
      '<li class="row"><span class="id" data-id="C2"></span><span class="title">Math</span><span class="credits">n/a</span><span class="active">0</span></li>',
      '</ul>',
    ].join('')
    const page = extractPage(payload, manifest.courses)
    expect(page.rows[0]).toMatchObject({
      externalCourseId: 'C1',
      credits: 3,
      active: true,
      termId: '2026FA',
    })
    expect(page.rows[1]).toMatchObject({
      externalCourseId: 'C2',
      active: false,
      termId: '2026FA',
    })
    expect(page.rows[1]?.credits).toBeUndefined()
    expect(page.diagnostics).toEqual(
      expect.arrayContaining([
        { field: 'credits', missing: 0, invalid: 1 },
        { field: 'note', missing: 2, invalid: 0 },
      ]),
    )
  })

  it('turns invalid selectors into controlled errors', () => {
    const manifest = parseManifest({
      ...htmlManifest,
      adapterId: 'bad-selector',
      courses: { ...htmlManifest.courses, items: 'li[' },
    })
    expect(() => extractPage('<ul></ul>', manifest.courses)).toThrow(/条目选择器/)

    const fieldSelector = parseManifest({
      ...htmlManifest,
      adapterId: 'bad-field-selector',
      courses: {
        ...htmlManifest.courses,
        fields: {
          externalCourseId: { selector: 'a[' },
          code: { selector: '.code' },
          title: { selector: '.title' },
        },
      },
    })
    expect(() => extractPage(fixture('portal.html'), fieldSelector.courses)).toThrow(
      /字段选择器/,
    )
  })

  it('rejects unsafe regex, encodes template values and caps extracted rows', () => {
    expect(regexSafetyError('(a+)+')).toBeTruthy()
    expect(regexSafetyError('(.*)*')).toBeTruthy()
    expect(regexSafetyError('(\\w+){2,}')).toBeTruthy()
    expect(regexSafetyError('\\1')).toBeTruthy()
    expect(regexSafetyError('(a|aa)+$')).toBeTruthy()
    expect(regexSafetyError('(?:x|y)+')).toBeTruthy()
    expect(regexSafetyError('x{2000}')).toBeTruthy()
    expect(regexSafetyError('(?:x|y)')).toBeUndefined()

    const unsafe = parseManifest({
      ...htmlManifest,
      courses: {
        ...htmlManifest.courses,
        fields: {
          title: { selector: '.title', regex: '(a+)+' },
        },
      },
    })
    expect(() => extractPage(fixture('portal.html'), unsafe.courses)).toThrow(
      /Unsafe regex/,
    )

    expect(
      renderManifestUrl(
        '/course/{{course.externalCourseId}}.html',
        { course: { externalCourseId: '../admin?x=1' } },
        'https://lms.example.edu/',
      ),
    ).toBe('https://lms.example.edu/course/..%2Fadmin%3Fx%3D1.html')

    const payload = JSON.stringify({
      data: Array.from({ length: MAX_ROWS_PER_PAGE + 5 }, (_, index) => ({
        id: `C${index}`,
      })),
    })
    const manifest = parseManifest({
      ...htmlManifest,
      adapterId: 'rows-cap',
      courses: {
        url: '/api/courses',
        responseType: 'json',
        items: 'data',
        fields: { externalCourseId: { path: 'id' } },
      },
    })
    const page = extractPage(payload, manifest.courses)
    expect(page.rows).toHaveLength(MAX_ROWS_PER_PAGE)
    expect(page.truncated).toBe(true)
  })
})
