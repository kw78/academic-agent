import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createAcademicApp, type AcademicApp } from '@academic/cli'
import { ACADEMIC_TOOL_NAMES } from '@academic/agent-tools'
import type { MaterialFetchedResource } from '@academic/materials'
import { createAcademicUiApi } from '../../packages/academic-dsh-ui/src/api.js'
import { fixedClock, sequentialIds } from '../helpers/store.js'

const cleanup: Array<() => void> = []

afterEach(() => {
  for (const dispose of cleanup.splice(0).reverse()) dispose()
})

function resource(
  body: string,
  overrides: Partial<MaterialFetchedResource> = {},
): MaterialFetchedResource {
  return {
    status: 200,
    finalUrl: 'https://example.edu/course/notes',
    contentType: 'text/html; charset=utf-8',
    body: Buffer.from(body, 'utf8'),
    truncated: false,
    ...overrides,
  }
}

async function setup(options: {
  agentWrites?: boolean
  authorize?: () => boolean
  materialFetch?: (url: string) => Promise<MaterialFetchedResource>
} = {}) {
  const root = mkdtempSync(join(tmpdir(), 'academic-app-materials-'))
  cleanup.push(() => rmSync(root, { recursive: true, force: true }))
  const app = await createAcademicApp({
    databasePath: ':memory:',
    clock: fixedClock(),
    ids: sequentialIds('app'),
    materialsDir: join(root, 'materials'),
    ...(options.agentWrites !== undefined ? { agentWrites: options.agentWrites } : {}),
    ...(options.authorize ? { authorizeAgentWrite: options.authorize } : {}),
    ...(options.materialFetch
      ? {
          materialFetch: async (url) => options.materialFetch!(url),
        }
      : {}),
  })
  cleanup.push(() => app.close())
  return app
}

async function addCourse(app: AcademicApp): Promise<string> {
  const result = await app.addCourse({
    termId: '2026FA',
    code: 'EE201',
    title: '模拟与数字电路',
  })
  if (!result.ok) throw new Error(result.message)
  return result.aggregateId
}

describe('material library through the app', () => {
  it('imports and searches without changing academic events', async () => {
    const app = await setup()
    const courseId = await addCourse(app)
    const before = app.store.database
      .prepare('SELECT COUNT(*) AS count FROM domain_events')
      .get() as { count: number }

    const imported = await app.materials.importText({
      courseId,
      title: '实验一讲义',
      text: '组合逻辑实验要求使用 74LS00 与非门搭建半加器，并测量传播延迟。',
    })
    expect(imported.material.extractionStatus).toBe('indexed')

    const search = app.materials.search({ query: '半加器', courseId })
    expect(search.total).toBeGreaterThan(0)
    expect(search.hits[0]?.title).toBe('实验一讲义')

    app.materials.delete(imported.material.materialId)
    const after = app.store.database
      .prepare('SELECT COUNT(*) AS count FROM domain_events')
      .get() as { count: number }
    expect(after.count).toBe(before.count)
  })

  it('exposes read-only agent tools and requires approval for material writes', async () => {
    const app = await setup({ agentWrites: false })
    const courseId = await addCourse(app)
    await app.materials.importText({
      courseId,
      title: '复习提纲',
      text: '触发器与锁存器的区别在于时钟边沿控制。',
    })

    const list = await app.agentBridge.host.call(ACADEMIC_TOOL_NAMES.ListMaterials, {
      courseId,
    })
    expect(list.ok).toBe(true)
    if (!list.ok) throw new Error(list.message)
    expect((list.data as { materials: unknown[] }).materials).toHaveLength(1)

    const search = await app.agentBridge.host.call(ACADEMIC_TOOL_NAMES.SearchMaterials, {
      query: '触发器',
      courseId,
    })
    expect(search.ok).toBe(true)
    if (!search.ok) throw new Error(search.message)
    expect((search.data as { total: number }).total).toBeGreaterThan(0)

    const denied = await app.agentBridge.host.call(ACADEMIC_TOOL_NAMES.ImportMaterial, {
      courseId,
      title: '模型导入',
      text: 'should not be stored',
    })
    expect(denied).toMatchObject({ ok: false, code: 'FORBIDDEN' })
  })

  it('allows approved agent imports and deletes', async () => {
    const app = await setup({ agentWrites: true, authorize: () => true })
    const courseId = await addCourse(app)
    const imported = await app.agentBridge.host.call(
      ACADEMIC_TOOL_NAMES.ImportMaterial,
      {
        courseId,
        title: '模型带来的文本',
        text: '这是用户批准后导入的课程内容。',
      },
    )
    expect(imported.ok).toBe(true)
    if (!imported.ok) throw new Error(imported.message)
    const material = (imported.data as { material: { materialId: string } }).material
    const deleted = await app.agentBridge.host.call(ACADEMIC_TOOL_NAMES.DeleteMaterial, {
      materialId: material.materialId,
    })
    expect(deleted.ok).toBe(true)
    expect(app.materials.get(material.materialId)).toBeUndefined()
  })

  it('rejects a material URL that redirects to a login page', async () => {
    const app = await setup({
      materialFetch: async () =>
        resource('<html><head><title>统一身份认证登录</title></head></html>', {
          finalUrl: 'https://example.edu/cas/login',
        }),
    })
    const courseId = await addCourse(app)
    await expect(
      app.materials.importUrl({ courseId, url: 'https://example.edu/course' }),
    ).rejects.toMatchObject({ code: 'AUTH_REQUIRED' })
  })

  it('imports authorized course-page attachments only after subscription', async () => {
    const app = await setup({
      materialFetch: async (url) => {
        if (url.includes('/course/page')) {
          return resource(
            '<a href="/files/notes.txt">课程笔记</a><a href="/files/extra.txt">补充</a>',
            { finalUrl: 'https://example.edu/course/page' },
          )
        }
        return resource(`与非门实验步骤与注意事项。${url}`, {
          finalUrl: url,
          contentType: 'text/plain',
        })
      },
    })
    const courseId = await addCourse(app)
    await expect(
      app.materials.importAttachments({
        courseId,
        sourceId: 'source-1',
        pageUrl: 'https://example.edu/course/page',
      }),
    ).rejects.toMatchObject({ code: 'SUBSCRIPTION_REQUIRED' })

    app.materials.setSubscription('source-1', courseId, true)
    const result = await app.materials.importAttachments({
      courseId,
      sourceId: 'source-1',
      pageUrl: 'https://example.edu/course/page',
      pathPrefix: '/files',
    })
    expect(result.imported).toBe(2)
    expect(result.discovered).toBe(2)
    expect(app.materials.search({ query: '实验步骤', courseId }).total).toBeGreaterThan(0)
  })

  it('serves the material UI API without exposing file paths or secrets', async () => {
    const app = await setup()
    const api = createAcademicUiApi(app)
    const courseId = await addCourse(app)

    const imported = await api.importMaterialText({
      courseId,
      title: 'UI 导入',
      text: '运算放大器的共模抑制比是重要指标。',
    })
    expect(imported.ok).toBe(true)

    const list = await api.materials({})
    expect(list.ok).toBe(true)
    if (!list.ok) return
    expect(list.value.materials).toHaveLength(1)
    expect(list.value.materials[0]?.course?.courseId).toBe(courseId)
    expect(JSON.stringify(list.value)).not.toContain('filePath')

    const search = await api.materialSearch({ query: '共模抑制比', courseId })
    expect(search.ok).toBe(true)
    if (!search.ok) return
    expect(search.value.result.total).toBeGreaterThan(0)

    const rebuilt = await api.rebuildMaterials({})
    expect(rebuilt.ok).toBe(true)
    if (!rebuilt.ok) return
    expect(rebuilt.value.result.materials).toBe(1)

    const materialId = list.value.materials[0]!.material.materialId
    const deleted = await api.deleteMaterial({ materialId })
    expect(deleted.ok).toBe(true)
    expect(app.materials.list()).toHaveLength(0)
  })
})
