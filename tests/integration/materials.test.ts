import { mkdtempSync, readdirSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { MaterialFetchedResource, MaterialFetcher } from '@academic/materials'
import {
  MaterialError,
  MaterialLibrary,
} from '@academic/materials'
import { openDatabase } from '@academic/storage-sqlite'
import { fixedClock, sequentialIds } from '../helpers/store.js'

const cleanup: Array<() => void> = []

afterEach(() => {
  for (const dispose of cleanup.splice(0).reverse()) dispose()
})

function setup(
  fetchResource?: MaterialFetcher,
  options: { maxFileBytes?: number } = {},
) {
  const root = mkdtempSync(join(tmpdir(), 'academic-materials-'))
  cleanup.push(() => rmSync(root, { recursive: true, force: true }))
  const db = openDatabase(':memory:')
  cleanup.push(() => db.close())
  const rootDir = join(root, 'materials')
  const library = new MaterialLibrary({
    db,
    clock: fixedClock(),
    ids: sequentialIds('material'),
    rootDir,
    ...(options.maxFileBytes ? { maxFileBytes: options.maxFileBytes } : {}),
    ...(fetchResource ? { fetchResource } : {}),
    validateCourse: async (courseId) => courseId !== 'missing',
    validateItem: async (itemId, courseId) => itemId !== 'foreign' && courseId !== 'missing',
  })
  return { root, db, library, rootDir }
}

function resource(
  body: string | Uint8Array,
  overrides: Partial<MaterialFetchedResource> = {},
): MaterialFetchedResource {
  return {
    status: 200,
    finalUrl: 'https://example.edu/course/notes',
    contentType: 'text/html; charset=utf-8',
    body: typeof body === 'string' ? Buffer.from(body, 'utf8') : body,
    truncated: false,
    ...overrides,
  }
}

describe('material library', () => {
  it('imports text, indexes it, and finds Chinese fragments', async () => {
    const { library } = setup()
    const result = await library.importText({
      courseId: 'course-1',
      title: '组合逻辑讲义',
      text: '组合逻辑电路由门电路组成。\n\n半加器可以用异或门和与门实现。',
    })
    expect(result.duplicate).toBe(false)
    expect(result.material.extractionStatus).toBe('indexed')
    expect(result.material.chunkCount).toBeGreaterThan(0)

    const fts = library.search({ query: '组合逻辑', courseId: 'course-1' })
    expect(fts.total).toBeGreaterThan(0)
    expect(fts.hits[0]?.title).toBe('组合逻辑讲义')
    expect(fts.hits[0]?.snippet).toContain('组合逻辑')

    const short = library.search({ query: '半加器' })
    expect(short.total).toBeGreaterThan(0)
    expect(short.hits[0]?.snippet).toContain('半加器')

    const twoChars = library.search({ query: '电路' })
    expect(twoChars.total).toBeGreaterThan(0)
    expect(twoChars.hits[0]?.snippet).toContain('电路')
  })

  it('does not store the same bytes twice in one course', async () => {
    const { library } = setup()
    const first = await library.importText({
      courseId: 'course-1',
      title: '讲义',
      text: '高频电路实验要求测量放大器增益。',
    })
    const second = await library.importText({
      courseId: 'course-1',
      title: '讲义副本',
      text: '高频电路实验要求测量放大器增益。',
    })
    expect(first.duplicate).toBe(false)
    expect(second.duplicate).toBe(true)
    expect(second.material.materialId).toBe(first.material.materialId)
    expect(library.list({ courseId: 'course-1' })).toHaveLength(1)
  })

  it('shares one content file across courses but keeps course-scoped rows', async () => {
    const { library, rootDir } = setup()
    const first = await library.importText({
      courseId: 'course-1',
      title: '同一份讲义',
      text: '同一份讲义内容，用于验证内容寻址存储。',
    })
    const second = await library.importText({
      courseId: 'course-2',
      title: '同一份讲义',
      text: '同一份讲义内容，用于验证内容寻址存储。',
    })
    expect(first.material.sha256).toBe(second.material.sha256)
    expect(library.list()).toHaveLength(2)
    const files: string[] = []
    const walk = (directory: string) => {
      for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const absolute = join(directory, entry.name)
        if (entry.isDirectory()) walk(absolute)
        else files.push(absolute)
      }
    }
    walk(rootDir)
    expect(files.filter((file) => statSync(file).isFile())).toHaveLength(1)
  })

  it('deletes metadata, chunks, index entries and the file', async () => {
    const { library, rootDir } = setup()
    const result = await library.importText({
      courseId: 'course-1',
      title: '删除测试',
      text: '这段内容删除后不应再被检索到。',
    })
    expect(library.search({ query: '删除后不应' }).total).toBe(1)
    library.delete(result.material.materialId)
    expect(library.get(result.material.materialId)).toBeUndefined()
    expect(library.search({ query: '删除后不应' }).total).toBe(0)
    const files: string[] = []
    const walk = (directory: string) => {
      for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const absolute = join(directory, entry.name)
        if (entry.isDirectory()) walk(absolute)
        else files.push(absolute)
      }
    }
    walk(rootDir)
    expect(files).toHaveLength(0)
    expect(() => library.delete(result.material.materialId)).toThrow(MaterialError)
  })

  it('rebuilds the FTS index and re-extracts stored files', async () => {
    const { library, db } = setup()
    await library.importText({
      courseId: 'course-1',
      title: '索引重建',
      text: '索引重建后仍应能检索到触发器与锁存器。',
    })
    db.exec('DELETE FROM material_chunks_fts')
    expect(library.search({ query: '触发器' }).total).toBe(0)
    const rebuilt = library.rebuildIndex()
    expect(rebuilt.materials).toBe(1)
    expect(rebuilt.chunks).toBeGreaterThan(0)
    expect(rebuilt.missingFiles).toBe(0)
    expect(library.search({ query: '触发器' }).total).toBe(1)
  })

  it('rejects an oversized file with a clear validation error', async () => {
    const { library } = setup(undefined, { maxFileBytes: 1024 })
    await expect(
      library.importBytes({
        courseId: 'course-1',
        fileName: 'big.txt',
        bytes: new Uint8Array(2048).fill(65),
      }),
    ).rejects.toMatchObject({
      code: 'VALIDATION',
      message: expect.stringContaining('文件超过上限'),
    })
  })

  it('validates course and item before storing', async () => {
    const { library } = setup()
    await expect(
      library.importText({ courseId: 'missing', title: 'x', text: 'x' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    await expect(
      library.importText({
        courseId: 'course-1',
        itemId: 'foreign',
        title: 'x',
        text: 'x',
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('imports a URL with an injected fetcher and strips query strings', async () => {
    const fetchResource: MaterialFetcher = async () =>
      resource(
        '<html><head><title>课程页面</title></head><body><h1>运算放大器</h1><p>共模抑制比。</p></body></html>',
        { finalUrl: 'https://example.edu/course/notes?token=secret' },
      )
    const { library } = setup(fetchResource)
    const result = await library.importUrl({
      courseId: 'course-1',
      url: 'https://example.edu/course/notes?token=secret',
    })
    expect(result.material.kind).toBe('html')
    expect(result.material.title).toBe('课程页面')
    expect(result.material.sourceUrl).toBe('https://example.edu/course/notes')
    expect(result.material.sourceUrl).not.toContain('token')
  })

  it('rejects a URL whose type cannot be identified', async () => {
    const finder: MaterialFetcher = async () =>
      resource(new Uint8Array([1, 2, 3]), {
        contentType: 'application/octet-stream',
        finalUrl: 'https://example.edu/download',
      })
    const { library } = setup(finder)
    await expect(
      library.importUrl({ courseId: 'course-1', url: 'https://example.edu/download' }),
    ).rejects.toMatchObject({ code: 'UNSUPPORTED' })
  })

  it('requires an explicit subscription before importing attachments', async () => {
    const finder: MaterialFetcher = async (url) => {
      if (url === 'https://example.edu/course/page') {
        return resource('<a href="/files/notes.pdf">讲义</a>')
      }
      return resource(new Uint8Array([1, 2, 3]))
    }
    const { library } = setup(finder)
    await expect(
      library.importAttachments({
        courseId: 'course-1',
        sourceId: 'source-1',
        pageUrl: 'https://example.edu/course/page',
      }),
    ).rejects.toMatchObject({ code: 'SUBSCRIPTION_REQUIRED' })
    library.setSubscription('source-1', 'course-1', true)
    const result = await library.importAttachments({
      courseId: 'course-1',
      sourceId: 'source-1',
      pageUrl: 'https://example.edu/course/page',
    })
    expect(result.stopReason).toBeUndefined()
    expect(result.failed + result.imported + result.duplicates + result.skipped).toBeGreaterThan(0)
  })

  it('skips external hosts and stops on 429 while importing attachments', async () => {
    const urls: string[] = []
    const finder: MaterialFetcher = async (url) => {
      urls.push(url)
      if (url.endsWith('/page')) {
        return resource(
          '<a href="https://other.example/evil.pdf">外部</a>' +
            '<a href="/files/a.pdf">A</a>' +
            '<a href="/files/b.pdf">B</a>',
        )
      }
      return resource(new Uint8Array([1]), { status: 429 })
    }
    const { library } = setup(finder)
    library.setSubscription('source-1', 'course-1', true)
    const result = await library.importAttachments({
      courseId: 'course-1',
      sourceId: 'source-1',
      pageUrl: 'https://example.edu/page',
      pathPrefix: '/files',
    })
    expect(result.stopReason).toBe('rate-limited')
    expect(result.skipped).toBe(1)
    expect(urls.some((url) => url.includes('other.example'))).toBe(false)
    expect(result.discovered).toBe(2)
  })

  it('stops attachment import when the fetcher raises a rate-limit error', async () => {
    const finder: MaterialFetcher = async (url) => {
      if (url.endsWith('/page')) {
        return resource('<a href="/files/a.pdf">A</a><a href="/files/b.pdf">B</a>')
      }
      const error = new Error('请求被限流（429）') as Error & { code: string }
      error.code = 'RATE_LIMITED'
      throw error
    }
    const { library } = setup(finder)
    library.setSubscription('source-1', 'course-1', true)
    const result = await library.importAttachments({
      courseId: 'course-1',
      sourceId: 'source-1',
      pageUrl: 'https://example.edu/page',
    })
    expect(result.stopReason).toBe('rate-limited')
    expect(result.imported).toBe(0)
  })
})
