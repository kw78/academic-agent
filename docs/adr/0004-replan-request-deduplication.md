# 0004 — 稳定 replanRequestId + pending 合并

- 状态：已接受
- 日期：2026-10-27
- 相关：Architecture Spec §7.3、§13.3；测试 T09

## 背景

作业变化、任务完成或可用时间调整都可能触发重规划。短时间内多次同步或事件回放不能连续生成新的计划版本；Planner 卸载/重启后也不能重复确认同一份计划。

## 决策

- 每次重规划使用稳定的 `replanRequestId`；请求保存在 `replan_requests`（pending / suggested / accepted / failed）。
- 相同 `reason + range` 的仍 pending 请求合并为一条，避免事件风暴。
- 处理请求时先返回已保存的建议；已接受的请求直接返回 `planId`，不重新计算或创建新计划。
- 接受计划时把 `replanRequestId` 写入 `StudyPlanAccepted` 事件，计划与请求可双向追溯。
- Planner 首次启用从最新事件位置开始，避免历史回放触发补算；能力卸载后旧计划仍可查询，重新启用后按 checkpoint/已保存请求续跑。

## 结果

- T09 覆盖：重复处理同一请求、卸载/重启用后均只保留一个计划。
- 计划版本不会因无变化同步或重复投递而增加。
- 存储了建议结果，便于诊断“为什么给出这份计划”。
