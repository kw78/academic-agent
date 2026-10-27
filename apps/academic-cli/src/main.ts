import { COMMAND, newId, parseCommand, type Range } from '@academic/contracts'
import { createAcademicApp, type AcademicApp } from './composition.js'

const DATABASE_PATH = process.env.ACADEMIC_DB ?? '.data/academic.db'

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString('zh-CN', { hour12: false })
}

function nextDays(days: number, from = new Date()): Range {
  return {
    start: from.toISOString(),
    end: new Date(from.getTime() + days * 86_400_000).toISOString(),
  }
}

async function ensureStudyTasks(app: AcademicApp): Promise<void> {
  const existing = await app.store.queries.listStudyTasks({ status: 'active' })
  if (existing.items.length > 0) return

  const items = await app.store.queries.listAcademicItems({ limit: 5, status: 'active' })
  const now = Date.parse(app.clock.now())
  const seeds: Array<{
    title: string
    itemId?: string
    estimateMinutes: number
    dueAt: string
    priority: number
  }> = items.items.slice(0, 2).map((item, index) => ({
    title: `复习：${item.title}`,
    itemId: item.itemId,
    estimateMinutes: index === 0 ? 90 : 60,
    dueAt: new Date(now + (index + 2) * 86_400_000).toISOString(),
    priority: index === 0 ? 2 : 1,
  }))
  if (seeds.length === 0) {
    seeds.push({
      title: '整理本周课程笔记',
      estimateMinutes: 60,
      dueAt: new Date(now + 3 * 86_400_000).toISOString(),
      priority: 1,
    })
  }

  for (const seed of seeds) {
    const command = parseCommand({
      commandId: newId(),
      type: COMMAND.StudyTaskCreate,
      aggregateId: newId(),
      expectedVersion: 0,
      actor: { kind: 'user', id: 'cli-user' },
      correlationId: newId(),
      payload: seed,
    })
    const result = await app.store.commands.execute(command)
    if (!result.ok) throw new Error(result.message)
  }
}

async function printOverview(app: AcademicApp): Promise<void> {
  const items = await app.store.queries.listAcademicItems({ limit: 10 })
  console.log(`\n待办事项（${items.items.length}）：`)
  for (const item of items.items) {
    const due = item.due.kind === 'instant' ? formatTime(item.due.utc) : item.due.kind === 'local-date' ? item.due.date : '未知'
    console.log(`  [${due}] ${item.title} · ${item.kind} · 进度 ${item.progress.percent}%`)
  }

  const tasks = await app.store.queries.listStudyTasks({ status: 'active' })
  console.log(`\n学习任务（${tasks.items.length}）：`)
  for (const task of tasks.items) {
    console.log(
      `  - ${task.title} · ${task.estimateMinutes} 分钟${task.dueAt ? ` · 截止 ${formatTime(task.dueAt)}` : ''}`,
    )
  }

  const unread = app.notifications.unreadCount()
  console.log(`\n未读提醒：${unread}`)
  for (const notification of app.notifications.list(5, { unreadOnly: true })) {
    console.log(`  ! ${notification.title} — ${notification.body}`)
  }
}

async function runSync(app: AcademicApp): Promise<void> {
  const summary = await app.syncFixture()
  console.log(
    `同步完成：${summary.status} · 抓取 ${summary.itemsSeen} · 新增 ${summary.created} · 更新 ${summary.updated}`,
  )
  if (summary.warnings.length > 0) {
    for (const warning of summary.warnings) console.log(`  警告：${warning}`)
  }
  const pending = app.replans.listPending(5)
  if (pending.length > 0) {
    const processed = await app.processPendingReplans(5)
    console.log(`重规划请求：处理 ${processed} 条`)
  }
}

async function runPlan(app: AcademicApp, accept: boolean): Promise<void> {
  await ensureStudyTasks(app)
  const range = nextDays(7)
  const suggestion = await app.previewPlan(range)
  const activeTasks = await app.store.queries.listStudyTasks({ status: 'active' })
  const taskTitles = new Map(activeTasks.items.map((task) => [task.taskId, task.title]))
  console.log(`\n学习计划建议（${suggestion.planner.id}@${suggestion.planner.version}）：`)
  if (suggestion.blocks.length === 0) console.log('  （没有可安排的时段）')
  for (const block of suggestion.blocks) {
    console.log(
      `  ${formatTime(block.start)} - ${formatTime(block.end)}  ${
        taskTitles.get(block.taskId) ?? block.taskId
      }`,
    )
  }
  for (const task of suggestion.unscheduled) {
    console.log(`  未安排：${task.title} · 剩余 ${task.remainingMinutes} 分钟 · ${task.reason}`)
  }
  for (const warning of suggestion.warnings) console.log(`  提示：${warning}`)

  if (accept && suggestion.blocks.length > 0) {
    const result = await app.acceptPlan(suggestion)
    if (!result.ok) throw new Error(result.message)
    console.log(`计划已确认并保存（版本 ${result.version}）`)
  }
}

function printHelp(): void {
  console.log(`Academic Agent CLI

用法：
  npm run demo -- [命令]

命令：
  demo            同步 fixture 数据源、生成任务、给出并确认学习计划
  sync            同步 fixture 数据源并处理提醒/重规划请求
  list            查看待办、任务与未读提醒
  plan [--accept] 生成未来 7 天学习计划，可选择确认
  notifications   查看未读提醒
  backup          生成一致性数据库备份
  help            显示帮助

环境变量：
  ACADEMIC_DB     数据库路径（默认 .data/academic.db）
`)
}

async function main(): Promise<void> {
  const command = process.argv[2] ?? 'demo'
  if (command === 'help') {
    printHelp()
    return
  }

  const app = await createAcademicApp({
    databasePath: DATABASE_PATH,
    agentWrites: true,
  })
  try {
    switch (command) {
      case 'sync':
        await runSync(app)
        await printOverview(app)
        break

      case 'list':
        await printOverview(app)
        break

      case 'plan':
        await runPlan(app, process.argv.includes('--accept'))
        break

      case 'notifications': {
        const unread = app.notifications.list(20, { unreadOnly: true })
        console.log(`未读提醒：${unread.length}`)
        for (const notification of unread) {
          console.log(`  ! ${notification.title} — ${notification.body}`)
        }
        break
      }

      case 'backup': {
        const stamp = new Date().toISOString().replace(/[:.]/g, '-')
        const target = `.data/backups/academic-${stamp}.db`
        app.backup(target)
        console.log(`备份完成：${target}`)
        break
      }

      case 'demo': {
        await runSync(app)
        await ensureStudyTasks(app)
        await app.processPendingReplans(10)
        const range = nextDays(7)
        const existing = await app.store.queries.getActiveStudyPlan(range)
        if (existing) {
          console.log(`已有生效计划 ${existing.planId}，跳过自动确认`)
        } else {
          await runPlan(app, true)
        }
        await printOverview(app)
        break
      }

      default:
        printHelp()
        process.exitCode = 1
    }
  } finally {
    app.close()
  }
}

main().catch((error: unknown) => {
  console.error('运行失败：', error instanceof Error ? error.message : error)
  process.exitCode = 1
})
