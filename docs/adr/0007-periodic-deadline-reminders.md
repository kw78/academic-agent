# 0007 — 持久化周期截止提醒

- 状态：已接受
- 日期：2026-10-27
- 相关：Intent I-05、I-06；Architecture §8、§12；修复计划 FIX-06

## 背景

通知最初只响应 `AcademicItemDiscovered` / `DeadlineChanged`，不是真正的定时截止提醒；缺少 72h/24h 阈值、去重、重启补偿与用户配置。

## 决策

- 新增 Scheduler 作业 `academic.reminders.scan`（默认每 15 分钟），调用确定性的截止扫描；不调用 LLM。
- 扫描读取持久化的通知设置（启用/停用、阈值小时数），默认 `[72, 24]`。
- 每个事项只发送当前**最紧急**的一档：剩余时间 ≤ 24h 发 24h，≤72h 且 >24h 发 72h；不会同时补发两档。
- 通知使用稳定 `dedupeKey = deadline:<itemId>:<threshold>:<dueHash>`，并持久化到 `notifications.dedupe_key` 唯一索引；重复扫描/重启不重发。
- 同一事项已经发送过更紧急档位时，后续阈值变更不会补发较不紧急的旧档位。
- 截止时间变化会改变 `dueHash`，允许按新截止时间重新提醒；date-only 截止按来源时区的当天结束时间计算。
- 应用 `start()` 与 CLI 命令执行前做一次补偿扫描；Scheduler 启动后按周期继续扫描。
- 用户通过 CLI `reminders show|set` 修改开关/阈值；设置持久化在 `notification_settings`。

## 结果

- 72h/24h 提醒可重复扫描而不重复发送；重启后仍保持去重。
- 默认 Fixture 场景不会调用模型；提醒是应用内通知。
- 新增 `reminders.test.ts` 覆盖阈值选择、设置、去重、重启补偿和 date-only 时区。

## 后续

- 系统级通知渠道仍是可选能力；当前仅应用内。
- 若需要“同时补发错过的多档”或多渠道分发，应新增独立策略，不修改现有 dedupe 语义。
