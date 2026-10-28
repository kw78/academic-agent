import { createInterface } from 'node:readline/promises'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  newId,
  type AdapterSample,
  type CommandResult,
  type ConnectionAuthKind,
  type ConnectionView,
  type Range,
  type SourceConfig,
  type StudyPlanView,
} from '@academic/contracts'
import type { WeeklySlot } from '@academic/planner-basic'
import { loginWebSession, safeUrlForDisplay } from '@academic/web-sessions'
import { createAcademicApp, type AcademicApp } from './composition.js'
import { restoreApplication, restoreDatabase } from './backup.js'

const DATABASE_PATH = process.env.ACADEMIC_DB ?? '.data/academic.db'

const UNSCHEDULED_REASON_LABELS: Record<string, string> = {
  'deadline-passed': '截止时间已过',
  'insufficient-time': '可用时间不足',
  'no-available-time': '没有可用时段',
  'invalid-duration': '预计时长无效',
}

function unscheduledReasonLabel(reason: string): string {
  return UNSCHEDULED_REASON_LABELS[reason] ?? reason
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString('zh-CN', { hour12: false })
}

function nextDays(days: number, from = new Date()): Range {
  return {
    start: from.toISOString(),
    end: new Date(from.getTime() + days * 86_400_000).toISOString(),
  }
}

interface ParsedArgs {
  positional: string[]
  flags: Map<string, string | true>
}

function parseArgs(args: string[]): ParsedArgs {
  const positional: string[] = []
  const flags = new Map<string, string | true>()
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]!
    if (!arg.startsWith('--')) {
      positional.push(arg)
      continue
    }
    const key = arg.slice(2)
    const next = args[index + 1]
    if (next !== undefined && !next.startsWith('--')) {
      flags.set(key, next)
      index += 1
    } else {
      flags.set(key, true)
    }
  }
  return { positional, flags }
}

function stringFlag(flags: Map<string, string | true>, name: string): string | undefined {
  const value = flags.get(name)
  if (value === undefined) return undefined
  if (value === true) throw new Error(`--${name} 需要一个值`)
  return value
}

function numberFlag(
  flags: Map<string, string | true>,
  name: string,
  fallback?: number,
): number {
  const value = stringFlag(flags, name)
  if (value === undefined) {
    if (fallback === undefined) throw new Error(`缺少 --${name}`)
    return fallback
  }
  const parsed = Number(value)
  if (!Number.isInteger(parsed)) throw new Error(`--${name} 必须是整数`)
  return parsed
}

function ensureOk(result: CommandResult, successText: string): void {
  if (!result.ok) throw new Error(`${result.code}: ${result.message}`)
  console.log(`${successText}（版本 ${result.version}）`)
}

async function printOverview(app: AcademicApp): Promise<void> {
  const items = await app.store.queries.listAcademicItems({ limit: 10 })
  console.log(`\n待办事项（${items.items.length}）：`)
  for (const item of items.items) {
    const due =
      item.due.kind === 'instant'
        ? formatTime(item.due.utc)
        : item.due.kind === 'local-date'
          ? item.due.date
          : '未知'
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
  const reminders = await app.scanDeadlineReminders()
  if (reminders.sent > 0) console.log(`截止提醒：新增 ${reminders.sent} 条`)
}

async function printPlan(app: AcademicApp, plan: StudyPlanView): Promise<void> {
  const tasks = await app.store.queries.listStudyTasks({ status: 'all' })
  const titles = new Map(tasks.items.map((task) => [task.taskId, task.title]))
  console.log(
    `\n计划 ${plan.planId} · ${plan.status} · v${plan.version} · ${plan.planner.id}@${plan.planner.version}`,
  )
  console.log(`范围：${formatTime(plan.range.start)} → ${formatTime(plan.range.end)}`)
  console.log(`学习块（${plan.blocks.length}）：`)
  for (const block of plan.blocks) {
    console.log(
      `  ${formatTime(block.start)} - ${formatTime(block.end)}  ${titles.get(block.taskId) ?? block.taskId}`,
    )
  }
  console.log(`锁定时段（${plan.lockedBlocks.length}）：`)
  for (const lock of plan.lockedBlocks) {
    console.log(
      `  [${lock.id}] ${formatTime(lock.start)} - ${formatTime(lock.end)}  ${lock.title ?? ''}`,
    )
  }
}

async function runPlanPreview(app: AcademicApp, accept: boolean): Promise<void> {
  await app.dispatcher.processOnce()
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
    console.log(`  未安排：${task.title} · 剩余 ${task.remainingMinutes} 分钟 · ${unscheduledReasonLabel(task.reason)}`)
  }
  for (const warning of suggestion.warnings) console.log(`  提示：${warning}`)

  if (accept && suggestion.blocks.length > 0) {
    ensureOk(await app.acceptPlan(suggestion), '计划已确认并保存')
  }
}

async function runPlanShow(app: AcademicApp): Promise<void> {
  const plan = await app.getLatestPlan()
  if (!plan) {
    console.log('当前没有生效计划。运行 `plan` 生成建议，或 `plan --accept` 确认。')
    return
  }
  await printPlan(app, plan)
}

async function runPlanLock(app: AcademicApp, args: string[]): Promise<void> {
  const { positional } = parseArgs(args)
  const [start, end, ...titleParts] = positional
  if (!start || !end) {
    throw new Error('用法：plan lock <start ISO> <end ISO> [标题]')
  }
  const result = await app.lockPlanBlock({
    start,
    end,
    ...(titleParts.length > 0 ? { title: titleParts.join(' ') } : {}),
  })
  if (!result.command.ok) throw new Error(result.command.message)
  console.log(
    `已锁定 ${formatTime(start)} - ${formatTime(end)}，id=${result.lock?.id ?? '?'}，移除 ${result.removedBlocks.length} 个重叠学习块`,
  )
  if (result.plan) await printPlan(app, result.plan)
  console.log('已排队重规划请求；运行 `plan` 查看避开锁定后的建议。')
}

async function runPlanUnlock(app: AcademicApp, lockId: string | undefined): Promise<void> {
  if (!lockId) throw new Error('用法：plan unlock <lockId>')
  const result = await app.unlockPlanBlock(lockId)
  if (!result.command.ok) throw new Error(result.command.message)
  console.log(`已解除锁定 ${lockId}`)
  if (result.plan) await printPlan(app, result.plan)
}

async function runPlanArchive(app: AcademicApp): Promise<void> {
  const result = await app.archivePlan()
  ensureOk(result, '计划已归档')
}

async function runCourseList(app: AcademicApp): Promise<void> {
  const courses = await app.store.queries.listCourses()
  console.log(`课程（${courses.items.length}）：`)
  for (const course of courses.items) {
    console.log(
      `  [${course.courseId}] ${course.termId} ${course.code} ${course.title}${
        course.archived ? '（已归档）' : ''
      }`,
    )
  }
}

async function runCourseMergeDuplicates(app: AcademicApp): Promise<void> {
  const result = await app.mergeDuplicateCourses()
  console.log(
    `同名课程合并完成：分组 ${result.groups} · 合并课程 ${result.mergedCourses} · 移动事项 ${result.movedItems} · 移动资料 ${result.movedMaterials} · 去重资料 ${result.removedMaterials}`,
  )
  for (const entry of result.mergedInto) {
    console.log(`  ${entry.fromCourseId} → ${entry.toCourseId}`)
  }
}

async function runCourseAdd(app: AcademicApp, args: string[]): Promise<void> {
  const { positional } = parseArgs(args)
  const [termId, code, ...titleParts] = positional
  if (!termId || !code || titleParts.length === 0) {
    throw new Error('用法：course add <termId> <code> <title>')
  }
  const result = await app.addCourse({
    termId,
    code,
    title: titleParts.join(' '),
  })
  if (!result.ok) throw new Error(result.message)
  if (result.eventIds.length === 0) {
    console.log(`已存在同学期同名课程，复用：${result.aggregateId}（版本 ${result.version}）`)
  } else {
    console.log(`课程已创建：${result.aggregateId}（版本 ${result.version}）`)
  }
}

async function runCourseArchive(app: AcademicApp, courseId: string | undefined): Promise<void> {
  if (!courseId) throw new Error('用法：course archive <courseId>')
  ensureOk(await app.archiveCourse(courseId), '课程已归档')
}

async function runTaskList(app: AcademicApp): Promise<void> {
  const tasks = await app.store.queries.listStudyTasks({ status: 'all' })
  console.log(`学习任务（${tasks.items.length}）：`)
  for (const task of tasks.items) {
    console.log(
      `  [${task.status}] [${task.taskId}] ${task.title} · ${task.estimateMinutes} 分钟${
        task.dueAt ? ` · 截止 ${formatTime(task.dueAt)}` : ''
      }`,
    )
  }
}

async function runTaskAdd(app: AcademicApp, args: string[]): Promise<void> {
  const { positional, flags } = parseArgs(args)
  const title = positional.join(' ').trim()
  if (!title) throw new Error('用法：task add <标题> [--minutes 60] [--due ISO] [--priority 1] [--item ID]')
  const estimateMinutes = numberFlag(flags, 'minutes', 60)
  const dueAt = stringFlag(flags, 'due')
  const itemId = stringFlag(flags, 'item')
  const priority = stringFlag(flags, 'priority') !== undefined ? numberFlag(flags, 'priority') : undefined
  const result = await app.createTask({
    title,
    estimateMinutes,
    ...(dueAt ? { dueAt } : {}),
    ...(itemId ? { itemId } : {}),
    ...(priority !== undefined ? { priority } : {}),
  })
  if (!result.ok) throw new Error(result.message)
  console.log(`任务已创建：${result.aggregateId}（版本 ${result.version}）`)
}

async function runTaskTransition(
  app: AcademicApp,
  action: 'complete' | 'reopen' | 'estimate',
  args: string[],
): Promise<void> {
  const { positional } = parseArgs(args)
  const [taskId, estimate] = positional
  if (!taskId) throw new Error(`用法：task ${action} <taskId>${action === 'estimate' ? ' <minutes>' : ''}`)
  if (action === 'complete') {
    ensureOk(await app.completeTask(taskId), '任务已完成')
  } else if (action === 'reopen') {
    ensureOk(await app.reopenTask(taskId), '任务已重开')
  } else {
    const minutes = Number(estimate)
    if (!Number.isInteger(minutes)) throw new Error('预计时长必须是整数分钟')
    ensureOk(await app.changeTaskEstimate(taskId, minutes), '任务预计时长已更新')
  }
}

const WEEKDAY_NAMES = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

function parseWeeklySlots(value: string): WeeklySlot[] {
  if (value.trim() === '') return []
  return value.split(',').map((entry) => {
    const match = /^([0-6]):(\d{2}:\d{2})-(\d{2}:\d{2})$/.exec(entry.trim())
    if (!match) {
      throw new Error(
        `无效时段 "${entry}"，格式应为 1:19:00-22:00（0=周日）`,
      )
    }
    return {
      weekday: Number(match[1]),
      start: match[2]!,
      end: match[3]!,
    }
  })
}

async function runAvailabilityShow(app: AcademicApp): Promise<void> {
  const settings = app.availability.get()
  console.log(`时区：${settings.timeZone} · 粒度：${settings.granularityMinutes} 分钟`)
  console.log('每周可用时段：')
  for (const slot of settings.weeklySlots) {
    console.log(
      `  ${WEEKDAY_NAMES[slot.weekday]} ${slot.start}-${slot.end}`,
    )
  }
  if (settings.weeklySlots.length === 0) console.log('  （未设置，Planner 不会安排学习）')
  console.log(`临时不可用（${settings.temporaryBlocks.length}）：`)
  for (const block of settings.temporaryBlocks) {
    console.log(
      `  [${block.id}] ${formatTime(block.start)} - ${formatTime(block.end)} ${block.title ?? ''}`,
    )
  }
}

async function runAvailabilitySet(app: AcademicApp, args: string[]): Promise<void> {
  const { flags } = parseArgs(args)
  const timeZone = stringFlag(flags, 'tz')
  const slotsValue = stringFlag(flags, 'slots')
  const granularityValue = stringFlag(flags, 'granularity')
  if (timeZone === undefined && slotsValue === undefined && granularityValue === undefined) {
    throw new Error(
      '用法：availability set [--tz Asia/Shanghai] [--granularity 15] [--slots "1:19:00-22:00,..."]',
    )
  }
  const settings = app.availability.update({
    ...(timeZone ? { timeZone } : {}),
    ...(slotsValue !== undefined
      ? { weeklySlots: parseWeeklySlots(slotsValue) }
      : {}),
    ...(granularityValue !== undefined
      ? { granularityMinutes: numberFlag(flags, 'granularity') }
      : {}),
  })
  console.log(`可用时间已更新：${settings.timeZone}，粒度 ${settings.granularityMinutes} 分钟`)
  await runAvailabilityShow(app)
}

async function runAvailabilityBlock(app: AcademicApp, args: string[]): Promise<void> {
  const { positional } = parseArgs(args)
  const [start, end, ...titleParts] = positional
  if (!start || !end) {
    throw new Error('用法：availability block <start ISO> <end ISO> [标题]')
  }
  const block = {
    id: `block-${newId()}`,
    start,
    end,
    ...(titleParts.length > 0 ? { title: titleParts.join(' ') } : {}),
  }
  app.availability.addTemporaryBlock(block)
  console.log(`已添加临时不可用时段：${block.id}`)
}

async function runAvailabilityUnblock(app: AcademicApp, blockId: string | undefined): Promise<void> {
  if (!blockId) throw new Error('用法：availability unblock <blockId>')
  app.availability.removeTemporaryBlock(blockId)
  console.log(`已移除临时不可用时段：${blockId}`)
}

async function runRemindersShow(app: AcademicApp): Promise<void> {
  const settings = app.notifications.getSettings()
  console.log(
    `截止提醒：${settings.enabled ? '已启用' : '已停用'} · 阈值 ${settings.thresholdsHours.join('h / ')}h`,
  )
}

async function runRemindersSet(app: AcademicApp, args: string[]): Promise<void> {
  const { flags } = parseArgs(args)
  const enabledValue = flags.get('enabled')
  const thresholdsValue = stringFlag(flags, 'thresholds')
  if (enabledValue === undefined && thresholdsValue === undefined) {
    throw new Error('用法：reminders set [--enabled true|false] [--thresholds 72,24]')
  }
  let enabled: boolean | undefined
  if (enabledValue === true) enabled = true
  else if (typeof enabledValue === 'string') {
    if (enabledValue !== 'true' && enabledValue !== 'false') {
      throw new Error('--enabled 只能是 true 或 false')
    }
    enabled = enabledValue === 'true'
  }
  const thresholds =
    thresholdsValue === undefined
      ? undefined
      : thresholdsValue
          .split(',')
          .map((value) => value.trim())
          .filter((value) => value.length > 0)
          .map((value) => Number(value))
  if (thresholds?.some((value) => !Number.isInteger(value))) {
    throw new Error('--thresholds 必须是逗号分隔的整数小时')
  }
  app.notifications.updateSettings({
    ...(enabled !== undefined ? { enabled } : {}),
    ...(thresholds ? { thresholdsHours: thresholds } : {}),
  })
  await runRemindersShow(app)
}

async function promptVisible(question: string): Promise<string> {
  const readline = createInterface({
    input: process.stdin,
    output: process.stdout,
  })
  try {
    return (await readline.question(question)).trim()
  } finally {
    readline.close()
  }
}

async function promptHidden(question: string): Promise<string> {
  if (!process.stdin.isTTY) {
    throw new Error('凭据输入需要交互终端；请在本地终端运行该命令')
  }
  const stdin = process.stdin as typeof process.stdin & {
    setRawMode(enabled: boolean): void
  }
  process.stdout.write(question)
  stdin.setRawMode(true)
  stdin.resume()
  stdin.setEncoding('utf8')
  return new Promise<string>((resolve, reject) => {
    let value = ''
    const cleanup = () => {
      stdin.removeListener('data', onData)
      stdin.setRawMode(false)
      stdin.pause()
    }
    const onData = (chunk: string) => {
      for (const char of chunk) {
        if (char === '\r' || char === '\n') {
          cleanup()
          process.stdout.write('\n')
          resolve(value)
          return
        }
        if (char === '\u0003') {
          cleanup()
          process.stdout.write('\n')
          reject(new Error('已取消凭据输入'))
          return
        }
        if (char === '\u007f') {
          value = value.slice(0, -1)
          continue
        }
        value += char
      }
    }
    stdin.on('data', onData)
  })
}

function printConnection(connection: ConnectionView): void {
  console.log(
    `  [${connection.connectionId}] ${connection.sourceId} · ${connection.displayName} · ${connection.status}${
      connection.accountLabel ? ` · ${connection.accountLabel}` : ''
    } · credential=${connection.hasCredential ? 'stored' : 'none'}${
      connection.lastSyncAt ? ` · lastSync=${formatTime(connection.lastSyncAt)}` : ''
    }${connection.lastError ? ` · ${connection.lastError}` : ''}`,
  )
}

async function runConnectionList(app: AcademicApp): Promise<void> {
  const connections = app.connections.list()
  console.log(`数据源连接（${connections.length}）：`)
  for (const connection of connections) printConnection(connection)
}

async function runConnectionAdd(app: AcademicApp, args: string[]): Promise<void> {
  const { positional, flags } = parseArgs(args)
  const [sourceId, displayName, ...titleParts] = positional
  if (!sourceId || !displayName) {
    throw new Error('用法：connection add <sourceId> <displayName> --auth password|token|none [--account name] [--scopes a,b]')
  }
  const authKind = stringFlag(flags, 'auth') ?? 'password'
  if (!['password', 'token', 'oauth', 'none'].includes(authKind)) {
    throw new Error('--auth 只能是 password、token、oauth 或 none')
  }
  const scopesValue = stringFlag(flags, 'scopes')
  const view = app.connections.create({
    sourceId,
    displayName: [displayName, ...titleParts].join(' '),
    authKind: authKind as ConnectionAuthKind,
    ...(stringFlag(flags, 'account')
      ? { accountLabel: stringFlag(flags, 'account')! }
      : {}),
    ...(scopesValue
      ? {
          scopes: scopesValue
            .split(',')
            .map((scope) => scope.trim())
            .filter(Boolean),
        }
      : {}),
  })
  console.log(`连接已创建：${view.connectionId}`)
  printConnection(view)
}

async function runConnectionConnect(app: AcademicApp, connectionId: string | undefined): Promise<void> {
  if (!connectionId) throw new Error('用法：connection connect <connectionId>')
  const connection = app.connections.get(connectionId)
  if (!connection) throw new Error(`连接不存在：${connectionId}`)
  if (connection.authKind === 'none') {
    console.log('该连接不需要凭据')
    return
  }
  if (connection.authKind === 'oauth') {
    throw new Error('OAuth 登录流程尚未实现；请使用 token 或 password 连接')
  }

  let secret: string
  if (connection.authKind === 'password') {
    const username = await promptVisible(
      `用户名${connection.accountLabel ? ` [${connection.accountLabel}]` : ''}: `,
    )
    const finalUsername = username || connection.accountLabel
    if (!finalUsername) throw new Error('用户名不能为空')
    const password = await promptHidden('密码（输入不回显）: ')
    if (!password) throw new Error('密码不能为空')
    secret = JSON.stringify({ username: finalUsername, password })
  } else {
    const token = await promptHidden('Token（输入不回显）: ')
    if (!token) throw new Error('Token 不能为空')
    secret = JSON.stringify({ token })
  }

  const updated = await app.connections.setSecret(connectionId, secret)
  printConnection(updated)
  console.log('凭据已安全保存；运行同步后由适配器验证。')
}

async function runConnectionDisconnect(app: AcademicApp, args: string[]): Promise<void> {
  const { positional, flags } = parseArgs(args)
  const connectionId = positional[0]
  if (!connectionId) throw new Error('用法：connection disconnect <connectionId> [--delete-credential]')
  const updated = await app.connections.disconnect(connectionId, {
    deleteCredential: flags.has('delete-credential'),
  })
  printConnection(updated)
}

async function runConnectionDeleteCredential(app: AcademicApp, connectionId: string | undefined): Promise<void> {
  if (!connectionId) throw new Error('用法：connection delete-credential <connectionId>')
  printConnection(await app.connections.deleteCredential(connectionId))
}

function printSource(app: AcademicApp, source: SourceConfig): void {
  const engine = app.sourceEngines.get(source.engine)
  const connection = app.connections
    .list()
    .find((entry) => entry.sourceId === source.sourceId)
  console.log(
    `  [${source.sourceId}] ${source.displayName} · engine=${source.engine} · auth=${source.authKind}${
      source.loginMode ? ` · login=${source.loginMode}` : ''
    } · engine=${engine ? 'available' : 'missing'} · connection=${connection?.status ?? 'none'}${
      source.archived ? ' · archived' : source.enabled ? '' : ' · disabled'
    }`,
  )
}

async function runSourceList(app: AcademicApp): Promise<void> {
  const sources = app.sources.list({ includeArchived: true })
  console.log(`数据源（${sources.length}）：`)
  for (const source of sources) printSource(app, source)
  console.log('\n可用引擎：')
  for (const engine of app.sourceEngines.list()) {
    console.log(
      `  ${engine.descriptor.id} · ${engine.descriptor.displayName} · sync=${engine.descriptor.supportsSync} · login=${engine.descriptor.supportsLogin} · verify=${engine.descriptor.supportsVerify}`,
    )
  }
}

async function runSourceAdd(app: AcademicApp, args: string[]): Promise<void> {
  const { positional, flags } = parseArgs(args)
  const [sourceId, displayName] = positional
  if (!sourceId || !displayName) {
    throw new Error(
      '用法：source add <sourceId> <displayName> --engine <id> [--auth token] [--login-mode browser] [--capabilities a,b] [--config JSON]',
    )
  }
  const engineId = stringFlag(flags, 'engine')
  if (!engineId) throw new Error('缺少 --engine')
  if (!app.sourceEngines.get(engineId)) throw new Error(`未知 engine：${engineId}`)
  const configValue = stringFlag(flags, 'config') ?? '{}'
  let config: Record<string, unknown>
  try {
    const parsed = JSON.parse(configValue) as unknown
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('配置必须是 JSON 对象')
    }
    config = parsed as Record<string, unknown>
  } catch (error) {
    throw new Error(
      `--config 不是有效 JSON 对象：${error instanceof Error ? error.message : String(error)}`,
    )
  }
  const authKind = (stringFlag(flags, 'auth') ?? 'token') as
    | 'none'
    | 'password'
    | 'token'
    | 'oauth'
  const loginMode = stringFlag(flags, 'login-mode') as
    | 'browser'
    | 'manual'
    | undefined
  const capabilities = (stringFlag(flags, 'capabilities') ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
  const source = app.sources.create({
    sourceId,
    engine: engineId,
    displayName,
    authKind,
    ...(loginMode ? { loginMode } : {}),
    config,
    capabilities,
  })
  printSource(app, source)
}

async function runSourceLogin(
  app: AcademicApp,
  sourceId: string | undefined,
): Promise<void> {
  if (!sourceId) throw new Error('用法：source login <sourceId>')
  const source = app.sources.get(sourceId)
  if (!source) throw new Error(`数据源不存在：${sourceId}`)
  const engine = app.sourceEngines.get(source.engine)
  if (!engine?.login) throw new Error(`数据源没有登录流程：${sourceId}`)
  const context = { sourceId, config: source.config }
  const login = await engine.login(context)
  const connection =
    app.connections.list().find((entry) => entry.sourceId === sourceId) ??
    app.connections.create({
      sourceId,
      displayName: source.displayName,
      authKind: source.authKind,
      scopes: source.capabilities,
      ...(login.accountLabel ? { accountLabel: login.accountLabel } : {}),
    })
  if (connection.authKind !== 'none') {
    await app.connections.setSecret(connection.connectionId, login.secret)
    const verified = await app.connections.verify(
      connection.connectionId,
      async (secret) =>
        engine.verify
          ? engine.verify(context, secret)
          : { ok: true, ...(login.accountLabel ? { accountLabel: login.accountLabel } : {}) },
    )
    printConnection(verified)
    if (verified.status === 'auth-required') {
      throw new Error(verified.lastError ?? '登录会话验证失败')
    }
    return
  }
  printConnection(connection)
}

async function runSourcePreview(app: AcademicApp, args: string[]): Promise<void> {
  const { positional, flags } = parseArgs(args)
  const sourceId = positional[0]
  if (!sourceId) throw new Error('用法：source preview <sourceId> [--connection <id>]')
  const preview = await app.previewSourceSync(sourceId, stringFlag(flags, 'connection'))
  console.log(
    `同步预览：新增 ${preview.counts.create} · 更新 ${preview.counts.update} · 未变 ${preview.counts.unchanged} · 跳过 ${preview.counts.skip} · ${preview.completeness}`,
  )
  for (const warning of preview.warnings) console.log(`  ! ${warning}`)
  for (const item of preview.items.slice(0, 10)) {
    console.log(`  [${item.action}] ${item.title}${item.reason ? `（${item.reason}）` : ''}`)
  }
  if (preview.items.length > 10) {
    console.log(`  … 其余 ${preview.items.length - 10} 项`)
  }
}

function readJsonFile(path: string): unknown {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as unknown
  } catch (error) {
    throw new Error(`无法读取 JSON ${path}：${error instanceof Error ? error.message : String(error)}`)
  }
}

function readSamples(path: string): AdapterSample[] {
  const parsed = readJsonFile(path)
  if (!Array.isArray(parsed)) throw new Error('样本文件必须是 JSON 数组')
  return parsed as AdapterSample[]
}

async function runAdapterValidate(app: AcademicApp, args: string[]): Promise<void> {
  const [manifestPath, samplesPath] = args
  if (!manifestPath || !samplesPath) {
    throw new Error('用法：adapter validate <manifest.json> <samples.json>')
  }
  const report = await app.adapterCandidates.validate(
    readJsonFile(manifestPath),
    readSamples(samplesPath),
  )
  console.log(
    `候选校验：${report.ok ? '通过' : '失败'} · 课程 ${report.courses.length} · 事项 ${report.items.length}`,
  )
  for (const error of report.errors) console.log(`  ! ${error}`)
  for (const warning of report.warnings) console.log(`  ~ ${warning}`)
}

async function runAdapterRegister(app: AcademicApp, args: string[]): Promise<void> {
  const [manifestPath, samplesPath] = args
  if (!manifestPath || !samplesPath) {
    throw new Error('用法：adapter register <manifest.json> <samples.json>')
  }
  const result = await app.adapterCandidates.register(
    readJsonFile(manifestPath),
    readSamples(samplesPath),
  )
  console.log(
    `候选已保存：${result.summary.adapterId}@${result.summary.version} · ${result.summary.status}`,
  )
  if (!result.report.ok) {
    for (const error of result.report.errors) console.log(`  ! ${error}`)
  }
}

function runAdapterList(app: AcademicApp): void {
  const candidates = app.adapterCandidates.list()
  console.log(`Adapter 候选（${candidates.length}）：`)
  for (const candidate of candidates) {
    const active =
      app.manifestRegistry.get(candidate.adapterId)?.version === candidate.version
    console.log(
      `  [${candidate.adapterId}@${candidate.version}] ${candidate.displayName} · ${candidate.status}${
        active ? ' · active' : ''
      }`,
    )
  }
}

async function runAdapterActivate(
  app: AcademicApp,
  args: string[],
): Promise<void> {
  const [adapterId, version] = args
  if (!adapterId || !version) throw new Error('用法：adapter activate <adapterId> <version>')
  const activation = await app.activateAdapterCandidate(adapterId, version)
  console.log(
    `已启用：${activation.candidate.adapterId}@${activation.candidate.version}${
      activation.sourceId ? ` · 同步源 ${activation.sourceId}` : ''
    }`,
  )
  if (activation.warning) console.log(`  ! ${activation.warning}`)
}

async function runAdapterRollback(
  app: AcademicApp,
  args: string[],
): Promise<void> {
  const [adapterId, version] = args
  if (!adapterId) throw new Error('用法：adapter rollback <adapterId> [version]')
  const activation = await app.rollbackAdapterCandidate(adapterId, version)
  console.log(
    `已回滚到：${activation.candidate.adapterId}@${activation.candidate.version}${
      activation.sourceId ? ` · 同步源 ${activation.sourceId}` : ''
    }`,
  )
  if (activation.warning) console.log(`  ! ${activation.warning}`)
}

async function runSourceSync(app: AcademicApp, args: string[]): Promise<void> {
  const { positional, flags } = parseArgs(args)
  const sourceId = positional[0]
  if (!sourceId) throw new Error('用法：source sync <sourceId> [--connection <id>]')
  const connectionId = stringFlag(flags, 'connection')
  const summary = await app.syncSource(sourceId, connectionId)
  console.log(
    `同步完成：${summary.status} · 抓取 ${summary.itemsSeen} · 新增 ${summary.created} · 更新 ${summary.updated}${
      summary.errorMessage ? ` · ${summary.errorMessage}` : ''
    }`,
  )
}

async function runSourceArchive(
  app: AcademicApp,
  sourceId: string | undefined,
): Promise<void> {
  if (!sourceId) throw new Error('用法：source archive <sourceId>')
  printSource(app, app.sources.archive(sourceId))
}

async function runWebLogin(app: AcademicApp, args: string[]): Promise<void> {
  const { positional, flags } = parseArgs(args)
  const url = positional[0]
  if (!url) throw new Error('用法：web login <url> [--label name]')
  console.log('正在打开登录窗口；完成登录后点击页面右上角“完成登录”。')
  const login = await loginWebSession(url)
  const session = await app.webSessions.create({
    loginUrl: login.loginUrl,
    cookies: login.cookies,
    ...(stringFlag(flags, 'label') ? { label: stringFlag(flags, 'label')! } : {}),
  })
  console.log(
    `网站会话已保存：${session.sessionId} · ${session.domain} · Cookie ${login.cookies.length} 个`,
  )
}

function runWebList(app: AcademicApp): void {
  const sessions = app.webSessions.list()
  console.log(`网站会话（${sessions.length}）：`)
  for (const session of sessions) {
    console.log(
      `  [${session.sessionId}] ${session.label ?? session.domain} · ${session.domain} · ${session.loginUrl}${
        session.lastUsedAt ? ` · lastUsed=${formatTime(session.lastUsedAt)}` : ''
      }`,
    )
  }
}

async function runWebFetch(app: AcademicApp, args: string[]): Promise<void> {
  const { positional, flags } = parseArgs(args)
  const [sessionId, url] = positional
  if (!sessionId || !url) throw new Error('用法：web fetch <sessionId> <url> [--out file]')
  const result = await app.webSessions.fetch(sessionId, url)
  const out = stringFlag(flags, 'out')
  if (out) {
    writeFileSync(out, result.body)
    console.log(
      `HTTP ${result.status} · ${safeUrlForDisplay(result.finalUrl)} · ${result.body.length} bytes${
        result.truncated ? ' (truncated)' : ''
      } · 已写入 ${out}`,
    )
  } else {
    console.log(
      `HTTP ${result.status} · ${safeUrlForDisplay(result.finalUrl)}${
        result.truncated ? ' (truncated)' : ''
      }`,
    )
    console.log(result.body.slice(0, 4000))
  }
}

async function runWebDelete(app: AcademicApp, sessionId: string | undefined): Promise<void> {
  if (!sessionId) throw new Error('用法：web delete <sessionId>')
  await app.webSessions.delete(sessionId)
  console.log(`网站会话已删除：${sessionId}`)
}

async function runConnectionShow(app: AcademicApp, connectionId: string | undefined): Promise<void> {
  if (!connectionId) throw new Error('用法：connection show <connectionId>')
  const connection = app.connections.get(connectionId)
  if (!connection) throw new Error(`连接不存在：${connectionId}`)
  printConnection(connection)
  console.log(`授权范围：${connection.scopes.join(', ') || '（未声明）'}`)
  if (connection.lastVerifiedAt) console.log(`上次验证：${formatTime(connection.lastVerifiedAt)}`)
  if (connection.lastSyncAt) console.log(`上次同步：${formatTime(connection.lastSyncAt)}`)
}

async function runStatus(app: AcademicApp): Promise<void> {
  const status = await app.getAutomationStatus()
  console.log('\n运行状态：')
  console.log(
    `  事件位置 ${status.health.eventPosition} · 投影位置 ${status.health.projectionPosition} · 待追赶 ${status.health.pendingEvents} · 一致=${status.health.consistent}`,
  )
  if (status.lastSync) {
    console.log(
      `  最近同步：${status.lastSync.status} · ${formatTime(status.lastSync.startedAt)} · 抓取 ${status.lastSync.itemsSeen} · 新增 ${status.lastSync.created} · 更新 ${status.lastSync.updated}${
        status.lastSync.errorCode ? ` · ${status.lastSync.errorCode}` : ''
      }`,
    )
  } else {
    console.log('  最近同步：无')
  }
  console.log(`  未读提醒：${status.unreadNotifications}`)
  console.log(`  数据源连接：${app.connections.list().length}`)
  const reminderSettings = app.notifications.getSettings()
  console.log(
    `  截止提醒：${reminderSettings.enabled ? '启用' : '停用'} · 阈值 ${reminderSettings.thresholdsHours.join('h / ')}h`,
  )
  console.log(`  定时任务（${status.jobs.length}）：`)
  for (const job of status.jobs) {
    console.log(
      `    - ${job.jobId} (${job.kind}) enabled=${job.enabled} next=${formatTime(job.nextRunAt)} failures=${job.consecutiveFailures}`,
    )
  }
  console.log(`  最近作业运行（${status.jobRuns.length}）：`)
  for (const run of status.jobRuns) {
    console.log(
      `    - ${run.jobId} ${run.status} attempt=${run.attempt} started=${formatTime(run.startedAt)}${
        run.errorMessage ? ` error=${run.errorMessage}` : ''
      }`,
    )
  }
}

async function runNotifications(app: AcademicApp, args: string[]): Promise<void> {
  const { flags } = parseArgs(args)
  const readId = stringFlag(flags, 'read')
  if (readId) {
    console.log(app.markNotificationRead(readId) ? `已标记已读：${readId}` : `提醒不存在或已读：${readId}`)
    return
  }
  if (flags.has('read-all')) {
    console.log(`已标记 ${app.markAllNotificationsRead()} 条提醒为已读`)
    return
  }
  const unread = app.notifications.list(20, { unreadOnly: true })
  console.log(`未读提醒：${unread.length}`)
  for (const notification of unread) {
    console.log(`  [${notification.notificationId}] ${notification.title} — ${notification.body}`)
  }
}

function printMaterial(app: AcademicApp, material: ReturnType<AcademicApp['materials']['get']>): void {
  if (!material) return
  const pages = material.pageCount ? ` · ${material.pageCount} 页` : ''
  console.log(
    `  [${material.materialId}] ${material.title} · 课程 ${material.courseId} · ${material.kind}${pages} · ${material.chunkCount} 块 · ${material.extractionStatus}`,
  )
  console.log(
    `      ${material.sourceKind}${material.sourceUrl ? ` · ${material.sourceUrl}` : ''} · ${material.bytes} bytes${
      material.extractionNote ? ` · ${material.extractionNote}` : ''
    }`,
  )
}

async function runMaterialList(app: AcademicApp, args: string[]): Promise<void> {
  const { flags } = parseArgs(args)
  const courseId = stringFlag(flags, 'course')
  const itemId = stringFlag(flags, 'item')
  const materials = app.materials.list({
    ...(courseId ? { courseId } : {}),
    ...(itemId ? { itemId } : {}),
  })
  console.log(`课程资料（${materials.length}）：`)
  for (const material of materials) printMaterial(app, material)
}

async function runMaterialAdd(app: AcademicApp, args: string[]): Promise<void> {
  const { positional, flags } = parseArgs(args)
  const [filePath] = positional
  const courseId = stringFlag(flags, 'course')
  if (!filePath || !courseId) {
    throw new Error('用法：material add <file> --course <courseId> [--title 标题] [--item itemId]')
  }
  const result = await app.materials.importFile({
    courseId,
    filePath,
    ...(stringFlag(flags, 'title') ? { title: stringFlag(flags, 'title')! } : {}),
    ...(stringFlag(flags, 'item') ? { itemId: stringFlag(flags, 'item')! } : {}),
  })
  console.log(
    `${result.duplicate ? '已存在相同资料' : '资料已导入'}：${result.material.materialId} · ${result.material.title} · ${result.chunks} 块 · ${result.material.extractionStatus}`,
  )
  if (result.material.extractionNote) console.log(`  ${result.material.extractionNote}`)
}

async function runMaterialText(app: AcademicApp, args: string[]): Promise<void> {
  const { flags } = parseArgs(args)
  const courseId = stringFlag(flags, 'course')
  const title = stringFlag(flags, 'title')
  const filePath = stringFlag(flags, 'file')
  const inline = stringFlag(flags, 'text')
  if (!courseId || !title || (!filePath && !inline)) {
    throw new Error(
      '用法：material text --course <courseId> --title 标题 (--file notes.txt | --text "正文") [--item itemId]',
    )
  }
  const text = filePath ? readFileSync(filePath, 'utf8') : inline!
  const result = await app.materials.importText({
    courseId,
    title,
    text,
    ...(stringFlag(flags, 'item') ? { itemId: stringFlag(flags, 'item')! } : {}),
    originLabel: 'cli',
  })
  console.log(
    `${result.duplicate ? '已存在相同资料' : '文本已导入'}：${result.material.materialId} · ${result.chunks} 块`,
  )
}

async function runMaterialUrl(app: AcademicApp, args: string[]): Promise<void> {
  const { positional, flags } = parseArgs(args)
  const [url] = positional
  const courseId = stringFlag(flags, 'course')
  if (!url || !courseId) {
    throw new Error(
      '用法：material url <url> --course <courseId> [--title 标题] [--source sourceId] [--item itemId]',
    )
  }
  const result = await app.materials.importUrl({
    courseId,
    url,
    ...(stringFlag(flags, 'title') ? { title: stringFlag(flags, 'title')! } : {}),
    ...(stringFlag(flags, 'source') ? { sourceId: stringFlag(flags, 'source')! } : {}),
    ...(stringFlag(flags, 'item') ? { itemId: stringFlag(flags, 'item')! } : {}),
  })
  console.log(
    `${result.duplicate ? '已存在相同资料' : '网页已导入'}：${result.material.materialId} · ${result.material.title} · ${result.chunks} 块`,
  )
  if (result.material.extractionNote) console.log(`  ${result.material.extractionNote}`)
}

async function runMaterialSearch(app: AcademicApp, args: string[]): Promise<void> {
  const { positional, flags } = parseArgs(args)
  const query = positional.join(' ').trim()
  if (!query) throw new Error('用法：material search <关键词> [--course courseId] [--limit 8]')
  const result = app.materials.search({
    query,
    ...(stringFlag(flags, 'course') ? { courseId: stringFlag(flags, 'course')! } : {}),
    ...(stringFlag(flags, 'item') ? { itemId: stringFlag(flags, 'item')! } : {}),
    ...(stringFlag(flags, 'limit') ? { limit: numberFlag(flags, 'limit') } : {}),
  })
  console.log(`命中 ${result.total} 段，显示 ${result.hits.length} 段：`)
  for (const hit of result.hits) {
    const place = hit.page ? `第 ${hit.page} 页` : hit.heading ?? ''
    console.log(`  · ${hit.title}（课程 ${hit.courseId}）${place ? ` · ${place}` : ''}`)
    console.log(`    ${hit.snippet}`)
  }
}

async function runMaterialDelete(app: AcademicApp, materialId: string | undefined): Promise<void> {
  if (!materialId) throw new Error('用法：material delete <materialId>')
  app.materials.delete(materialId)
  console.log(`资料已删除：${materialId}（不影响学业事件）`)
}

async function runMaterialRebuild(app: AcademicApp): Promise<void> {
  const result = app.materials.rebuildIndex()
  console.log(
    `索引重建完成：资料 ${result.materials} · 分块 ${result.chunks} · 缺失文件 ${result.missingFiles}`,
  )
}

async function runMaterialAttachments(app: AcademicApp, args: string[]): Promise<void> {
  const { positional, flags } = parseArgs(args)
  const [sourceId, pageUrl] = positional
  const courseId = stringFlag(flags, 'course')
  if (!sourceId || !pageUrl || !courseId) {
    throw new Error(
      '用法：material attachments <sourceId> <pageUrl> --course <courseId> [--prefix /path] [--max 12]',
    )
  }
  const result = await app.materials.importAttachments({
    courseId,
    sourceId,
    pageUrl,
    ...(stringFlag(flags, 'prefix') ? { pathPrefix: stringFlag(flags, 'prefix')! } : {}),
    ...(stringFlag(flags, 'max') ? { maxFiles: numberFlag(flags, 'max') } : {}),
  })
  console.log(
    `附件导入：发现 ${result.discovered} · 新增 ${result.imported} · 重复 ${result.duplicates} · 跳过 ${result.skipped} · 失败 ${result.failed}${
      result.stopReason ? ` · 停止原因 ${result.stopReason}` : ''
    }`,
  )
  for (const item of result.items) {
    console.log(`  + ${item.material.title} · ${item.chunks} 块 · ${item.material.extractionStatus}`)
  }
  for (const failure of result.failures) {
    console.log(`  ! ${failure.url} · ${failure.message}`)
  }
}

async function runMaterialSubscription(app: AcademicApp, args: string[]): Promise<void> {
  const { positional, flags } = parseArgs(args)
  if (positional.length === 0) {
    const subscriptions = app.materials.subscriptions()
    console.log(`自动导入订阅（${subscriptions.length}）：`)
    for (const subscription of subscriptions) {
      console.log(
        `  ${subscription.enabled ? '开启' : '关闭'} · source=${subscription.sourceId} · course=${subscription.courseId} · ${subscription.updatedAt}`,
      )
    }
    return
  }
  const [sourceId, courseId] = positional
  if (!sourceId || !courseId) {
    throw new Error(
      '用法：material subscribe [sourceId courseId] [--disable]  （不带参数时列出订阅）',
    )
  }
  const enabled = flags.get('disable') !== true
  const subscription = app.materials.setSubscription(sourceId, courseId, enabled)
  console.log(
    `自动导入已${subscription.enabled ? '开启' : '关闭'}：source=${sourceId} · course=${courseId}`,
  )
}

function printHelp(): void {
  console.log(`Academic Agent CLI

用法：
  npm run demo -- [命令]

命令：
  demo                      同步 fixture、生成任务、给出并确认学习计划
  sync                      同步 fixture 数据源并处理提醒/重规划请求
  list                      查看待办、任务与未读提醒
  status                    查看投影一致性、同步、定时任务与作业运行
  course list               列出课程
  course add <term> <code> <title>   添加课程
  course archive <courseId>          归档课程
  course merge-duplicates            合并同学期同名课程（迁移事项/资料后关闭重复课程）
  task list                 列出全部学习任务
  task add <title> [--minutes 60] [--due ISO] [--priority 1] [--item ID]
  task complete|reopen <taskId>
  task estimate <taskId> <minutes>
  plan [--accept]           生成未来 7 天计划，可选择确认
  plan show                 查看当前生效计划与锁定时段
  plan lock <start ISO> <end ISO> [title]   锁定时间段并排队重规划
  plan unlock <lockId>      解除锁定
  plan archive              归档当前计划
  availability show         查看时区、每周可用时段、临时不可用
  availability set [--tz ZONE] [--granularity 15] [--slots "1:19:00-22:00,..."]
  availability block <start ISO> <end ISO> [title]
  availability unblock <blockId>
  reminders show            查看截止提醒开关与阈值
  reminders set [--enabled true|false] [--thresholds 72,24]
  connection list           列出数据源连接与状态
  connection add <sourceId> <displayName> --auth password|token|none [--account name] [--scopes a,b]
  connection connect <id>   在本机隐藏输入凭据并保存到系统凭据存储
  connection disconnect <id> [--delete-credential]
  connection delete-credential <id>
  connection show <id>
  source list               列出数据库数据源与可用 engine
  source add <id> <name> --engine <id> [--auth token] [--login-mode browser] [--config JSON]
  source login <sourceId>    使用 engine 登录流程，会话写入凭据库
  source preview <sourceId> [--connection ID]
  source sync <sourceId> [--connection ID]
  adapter list
  adapter validate <manifest.json> <samples.json>
  adapter register <manifest.json> <samples.json>
  adapter activate <adapterId> <version>
  adapter rollback <adapterId> [version]
  source archive <sourceId>
  web login <url> [--label name]   打开浏览器登录并保存网站会话
  web list                         列出已保存的网站会话
  web fetch <id> <url> [--out file]  带会话请求，不打印 Cookie
  web delete <id>
  material list [--course ID] [--item ID]     列出课程资料
  material add <file> --course ID [--title 标题] [--item ID]
  material text --course ID --title 标题 (--file notes.txt | --text "正文")
  material url <url> --course ID [--title 标题] [--source ID]
  material search <关键词> [--course ID] [--limit 8]
  material delete <materialId>               只删资料/索引，不影响学业事件
  material rebuild                           从原文件重建分块与 FTS 索引
  material subscribe [sourceId courseId] [--disable]   开启/关闭该来源+课程的附件自动导入
  material attachments <sourceId> <pageUrl> --course ID [--prefix /path] [--max 12]
  notifications [--read ID | --read-all]
  backup [target.db]        生成一致性数据库备份
  restore <backup.db> <target.db>  恢复到新数据库并校验完整性、投影
  backup-app [targetDir]    备份数据库 + 资料原文件 + SHA-256 清单
  restore-app <backupDir> <targetDir>  校验清单后恢复到新目录并检查数据库
  help                      显示帮助

环境变量：
  ACADEMIC_DB               数据库路径（默认 .data/academic.db）
`)
}

async function main(): Promise<void> {
  const [command = 'demo', ...rest] = process.argv.slice(2)
  if (command === 'help') {
    printHelp()
    return
  }

  const app = await createAcademicApp({
    databasePath: DATABASE_PATH,
    agentWrites: true,
  })
  try {
    await app.dispatcher.processOnce()
    await app.scanDeadlineReminders()
    switch (command) {
      case 'sync':
        await runSync(app)
        await printOverview(app)
        break

      case 'list':
        await printOverview(app)
        break

      case 'status':
        await runStatus(app)
        break

      case 'course': {
        const [subcommand, ...args] = rest
        if (subcommand === 'list') await runCourseList(app)
        else if (subcommand === 'add') await runCourseAdd(app, args)
        else if (subcommand === 'archive') await runCourseArchive(app, args[0])
        else if (subcommand === 'merge-duplicates') await runCourseMergeDuplicates(app)
        else throw new Error('用法：course list|add|archive|merge-duplicates')
        break
      }

      case 'task': {
        const [subcommand, ...args] = rest
        if (subcommand === 'list') await runTaskList(app)
        else if (subcommand === 'add') await runTaskAdd(app, args)
        else if (subcommand === 'complete' || subcommand === 'reopen' || subcommand === 'estimate') {
          await runTaskTransition(app, subcommand, args)
        } else throw new Error('用法：task list|add|complete|reopen|estimate')
        break
      }

      case 'plan': {
        const [subcommand, ...args] = rest
        if (subcommand === 'show') await runPlanShow(app)
        else if (subcommand === 'lock') await runPlanLock(app, args)
        else if (subcommand === 'unlock') await runPlanUnlock(app, args[0])
        else if (subcommand === 'archive') await runPlanArchive(app)
        else await runPlanPreview(app, rest.includes('--accept'))
        break
      }

      case 'availability': {
        const [subcommand, ...args] = rest
        if (subcommand === 'show') await runAvailabilityShow(app)
        else if (subcommand === 'set') await runAvailabilitySet(app, args)
        else if (subcommand === 'block') await runAvailabilityBlock(app, args)
        else if (subcommand === 'unblock') await runAvailabilityUnblock(app, args[0])
        else throw new Error('用法：availability show|set|block|unblock')
        break
      }

      case 'reminders': {
        const [subcommand, ...args] = rest
        if (subcommand === 'show') await runRemindersShow(app)
        else if (subcommand === 'set') await runRemindersSet(app, args)
        else throw new Error('用法：reminders show|set')
        break
      }

      case 'connection': {
        const [subcommand, ...args] = rest
        if (subcommand === 'list') await runConnectionList(app)
        else if (subcommand === 'add') await runConnectionAdd(app, args)
        else if (subcommand === 'connect') await runConnectionConnect(app, args[0])
        else if (subcommand === 'disconnect') await runConnectionDisconnect(app, args)
        else if (subcommand === 'delete-credential') await runConnectionDeleteCredential(app, args[0])
        else if (subcommand === 'show') await runConnectionShow(app, args[0])
        else throw new Error('用法：connection list|add|connect|disconnect|delete-credential|show')
        break
      }

      case 'adapter': {
        const [subcommand, ...args] = rest
        if (subcommand === 'list') runAdapterList(app)
        else if (subcommand === 'validate') await runAdapterValidate(app, args)
        else if (subcommand === 'register') await runAdapterRegister(app, args)
        else if (subcommand === 'activate') await runAdapterActivate(app, args)
        else if (subcommand === 'rollback') await runAdapterRollback(app, args)
        else throw new Error('用法：adapter list|validate|register|activate|rollback')
        break
      }

      case 'source': {
        const [subcommand, ...args] = rest
        if (subcommand === 'list') await runSourceList(app)
        else if (subcommand === 'add') await runSourceAdd(app, args)
        else if (subcommand === 'login') await runSourceLogin(app, args[0])
        else if (subcommand === 'preview') await runSourcePreview(app, args)
        else if (subcommand === 'sync') await runSourceSync(app, args)
        else if (subcommand === 'archive') await runSourceArchive(app, args[0])
        else throw new Error('用法：source list|add|login|preview|sync|archive')
        break
      }

      case 'web': {
        const [subcommand, ...args] = rest
        if (subcommand === 'login') await runWebLogin(app, args)
        else if (subcommand === 'list') runWebList(app)
        else if (subcommand === 'fetch') await runWebFetch(app, args)
        else if (subcommand === 'delete') await runWebDelete(app, args[0])
        else throw new Error('用法：web login|list|fetch|delete')
        break
      }

      case 'material': {
        const [subcommand, ...args] = rest
        if (subcommand === 'list') await runMaterialList(app, args)
        else if (subcommand === 'add') await runMaterialAdd(app, args)
        else if (subcommand === 'text') await runMaterialText(app, args)
        else if (subcommand === 'url') await runMaterialUrl(app, args)
        else if (subcommand === 'search') await runMaterialSearch(app, args)
        else if (subcommand === 'delete') await runMaterialDelete(app, args[0])
        else if (subcommand === 'rebuild') await runMaterialRebuild(app)
        else if (subcommand === 'attachments') await runMaterialAttachments(app, args)
        else if (subcommand === 'subscribe') await runMaterialSubscription(app, args)
        else throw new Error('用法：material list|add|text|url|search|delete|rebuild|attachments|subscribe')
        break
      }

      case 'notifications':
        await runNotifications(app, rest)
        break

      case 'backup': {
        const stamp = new Date().toISOString().replace(/[:.]/g, '-')
        const target = rest[0] ?? `.data/backups/academic-${stamp}.db`
        app.backup(target)
        console.log(`备份完成：${target}`)
        break
      }

      case 'restore': {
        const [backupPath, targetPath] = rest
        if (!backupPath || !targetPath) {
          throw new Error('用法：restore <backup.db> <target.db>')
        }
        restoreDatabase(backupPath, targetPath)
        const restored = await createAcademicApp({ databasePath: targetPath })
        try {
          const integrity = restored.store.database
            .prepare('PRAGMA integrity_check')
            .get() as { integrity_check?: string } | undefined
          const health = restored.store.health()
          const integrityResult = integrity?.integrity_check ?? 'unknown'
          console.log(
            `恢复完成：${targetPath} · integrity=${integrityResult} · events=${health.eventPosition} · projection=${health.projectionPosition} · consistent=${health.consistent}`,
          )
          if (integrityResult !== 'ok') {
            throw new Error(`恢复数据库完整性检查失败：${integrityResult}`)
          }
          if (!health.consistent) {
            throw new Error('恢复后投影与事件位置不一致')
          }
        } finally {
          await restored.close()
        }
        break
      }

      case 'backup-app': {
        const stamp = new Date().toISOString().replace(/[:.]/g, '-')
        const target = rest[0] ?? `.data/backups/academic-app-${stamp}`
        const manifest = app.backupApplication(target)
        console.log(
          `应用备份完成：${target} · 数据库 ${manifest.database.bytes} B · 资料 ${manifest.materials.length} 个`,
        )
        break
      }

      case 'restore-app': {
        const [backupDir, targetDir] = rest
        if (!backupDir || !targetDir) {
          throw new Error('用法：restore-app <backupDir> <targetDir>')
        }
        const manifest = restoreApplication({ backupDir, targetDir })
        const restored = await createAcademicApp({
          databasePath: join(targetDir, 'academic.db'),
          materialsDir: join(targetDir, 'materials'),
        })
        try {
          const integrity = restored.store.database
            .prepare('PRAGMA integrity_check')
            .get() as { integrity_check?: string } | undefined
          const health = restored.store.health()
          const integrityResult = integrity?.integrity_check ?? 'unknown'
          console.log(
            `应用恢复完成：${targetDir} · integrity=${integrityResult} · events=${health.eventPosition} · projection=${health.projectionPosition} · 资料 ${manifest.materials.length} 个`,
          )
          if (integrityResult !== 'ok') {
            throw new Error(`恢复数据库完整性检查失败：${integrityResult}`)
          }
          if (!health.consistent) {
            throw new Error('恢复后投影与事件位置不一致')
          }
        } finally {
          await restored.close()
        }
        break
      }

      case 'demo': {
        await runSync(app)
        await app.dispatcher.processOnce()
        await app.processPendingReplans(10)
        const range = nextDays(7)
        const existing = await app.store.queries.getActiveStudyPlan(range)
        if (existing) {
          console.log(`已有生效计划 ${existing.planId}，跳过自动确认`)
        } else {
          await runPlanPreview(app, true)
        }
        await printOverview(app)
        break
      }

      default:
        printHelp()
        process.exitCode = 1
    }
  } finally {
    await app.close()
  }
}

main().catch((error: unknown) => {
  console.error('运行失败：', error instanceof Error ? error.message : error)
  process.exitCode = 1
})
