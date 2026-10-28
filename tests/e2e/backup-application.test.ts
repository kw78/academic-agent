import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createAcademicApp, restoreApplication } from '@academic/cli'

const cleanup: Array<() => void | Promise<void>> = []

afterEach(async () => {
  for (const dispose of cleanup.splice(0).reverse()) await dispose()
})

function tempRoot(prefix: string): string {
  mkdirSync('.data', { recursive: true })
  const directory = mkdtempSync(join('.data', prefix))
  cleanup.push(() => rmSync(directory, { recursive: true, force: true }))
  return directory
}

async function createApp(databasePath: string) {
  const app = await createAcademicApp({ databasePath })
  cleanup.push(() => app.close())
  return app
}

describe('application backup package', () => {
  it('restores the database and material files into a fresh directory', async () => {
    const root = tempRoot('app-backup-package-')
    const app = await createApp(join(root, 'original', 'academic.db'))
    await app.syncFixture()
    const course = (await app.store.queries.listCourses()).items[0]!
    await app.materials.importText({
      courseId: course.courseId,
      title: '期中复习讲义',
      text: '隐函数定理的证明要点，以及半加器的逻辑表达式。',
    })
    const itemsBefore = (
      await app.store.queries.listAcademicItems({ status: 'all' })
    ).items.length

    const backupDir = join(root, 'backup')
    const manifest = app.backupApplication(backupDir)
    expect(manifest.formatVersion).toBe(1)
    expect(manifest.database.path).toBe('academic.db')
    expect(manifest.materials).toHaveLength(1)
    expect(
      existsSync(join(backupDir, manifest.materials[0]!.path)),
    ).toBe(true)
    await app.close()

    const restoredDir = join(root, 'restored')
    const restoredManifest = restoreApplication({
      backupDir,
      targetDir: restoredDir,
    })
    expect(restoredManifest).toEqual(manifest)
    expect(existsSync(join(restoredDir, 'manifest.json'))).toBe(true)

    const restored = await createApp(join(restoredDir, 'academic.db'))
    expect(
      (await restored.store.queries.listCourses()).items.map(
        (entry) => entry.courseId,
      ),
    ).toContain(course.courseId)
    expect(
      (await restored.store.queries.listAcademicItems({ status: 'all' })).items,
    ).toHaveLength(itemsBefore)
    expect(restored.store.health().consistent).toBe(true)
  })

  it('restores material search after opening the restored materials directory', async () => {
    const root = tempRoot('app-backup-search-')
    const app = await createApp(join(root, 'original', 'academic.db'))
    await app.syncFixture()
    const course = (await app.store.queries.listCourses()).items[0]!
    await app.materials.importText({
      courseId: course.courseId,
      title: '期中复习讲义',
      text: '隐函数定理的证明要点，以及半加器的逻辑表达式。',
    })
    const backupDir = join(root, 'backup')
    app.backupApplication(backupDir)
    await app.close()

    const restoredDir = join(root, 'restored')
    restoreApplication({ backupDir, targetDir: restoredDir })
    const restored = await createAcademicApp({
      databasePath: join(restoredDir, 'academic.db'),
      materialsDir: join(restoredDir, 'materials'),
    })
    cleanup.push(() => restored.close())

    const search = restored.materials.search({ query: '隐函数' })
    expect(search.total).toBeGreaterThan(0)
    expect(restored.materials.list()).toHaveLength(1)
  })

  it('refuses to restore an altered material file and leaves no target', async () => {
    const root = tempRoot('app-backup-tamper-')
    const app = await createApp(join(root, 'original', 'academic.db'))
    await app.syncFixture()
    const course = (await app.store.queries.listCourses()).items[0]!
    await app.materials.importText({
      courseId: course.courseId,
      title: '讲义',
      text: '半加器',
    })
    const backupDir = join(root, 'backup')
    const manifest = app.backupApplication(backupDir)
    await app.close()

    const materialPath = join(backupDir, manifest.materials[0]!.path)
    writeFileSync(materialPath, 'tampered')

    const targetDir = join(root, 'restored')
    expect(() => restoreApplication({ backupDir, targetDir })).toThrow(
      /checksum/i,
    )
    expect(existsSync(targetDir)).toBe(false)
  })

  it('rejects an existing target directory', async () => {
    const root = tempRoot('app-backup-existing-')
    const app = await createApp(join(root, 'original', 'academic.db'))
    const backupDir = join(root, 'backup')
    app.backupApplication(backupDir)
    await app.close()

    const targetDir = join(root, 'restored')
    mkdirSync(targetDir)
    expect(() => restoreApplication({ backupDir, targetDir })).toThrow(
      /already exists/i,
    )
  })
})
