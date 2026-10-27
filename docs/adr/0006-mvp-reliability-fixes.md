# 0006 — MVP 可靠性、用户控制与 Planner 约束修复

- 状态：已接受
- 日期：2026-10-27
- 相关：Intent I-05、I-06；Architecture §7、§8、§12、§13；修复计划 FIX-01–FIX-05

## 背景

首轮 fixture MVP 与 DSH 工具绑定已跑通，但静态审查发现五类影响可靠性和用户控制的问题：启动覆盖调度配置、消费者重启跳过停机事件、Agent 用模型参数自证写入授权、同步事项未自动进入任务/规划、Planner 缺少持久化可用时间。

## 决策

1. **调度配置归用户所有**：启动装配只调用 `Scheduler.ensureJob()`（不存在才创建）。`schedule()` 保留为显式更新；重启不得修改 `enabled`、`nextRunAt`、`policy`。
2. **checkpoint 恢复优先**：`startPosition` 只用于首次安装或投影版本不兼容时的初始化。已有兼容 checkpoint 时，重启从原位置续跑，不跳过停机期间事件；通知继续用 activation position 防止旧提醒重发。
3. **可信写入授权**：Agent 工具写入只有在“部署允许写入”且“可信宿主对本次操作授权”时才执行。模型传入的 `confirmed` 从 schema 移除，不能自证授权；当前 DSH bundle 未接审批适配器，写入保持拒绝。
4. **同步→默认任务**：新增幂等 Reaction 消费 `AcademicItemDiscovered`，用确定性任务 ID 创建默认学习任务（assignment 60、exam 120、quiz 30 分钟）。任务不写死 `dueAt`，Planner 每次读取关联事项当前截止时间；重复投递/同步不重复创建，用户修改与完成状态不被覆盖。
5. **持久化可用时间**：新增 `user_availability`（时区、每周时段、临时不可用、粒度）。Planner 把非可用时间转为忙碌区间后复用现有确定性算法；未配置时生成保守默认并可通过 CLI 查看/修改。

## 结果

- 67 项测试通过，新增覆盖：调度重启保留、停机事件续跑、模型参数不能授权、默认任务幂等与用户修改保护、时区/临时不可用排程。
- DSH 中 Agent 写入继续返回 `FORBIDDEN`/`CONFIRM_REQUIRED`，CLI 用户操作不受影响。
- 新增 CLI：`status`、课程/任务管理、计划锁定/解锁/归档、`availability show|set|block|unblock`。

## 代价与后续

- DSH 审批 UI/适配器接入后，才能安全开放 Agent 写入。
- 默认任务规则目前是固定策略，后续可配置；未自动拆分用户任务。
- 可用时间仅支持每周循环时段与临时不可用，不支持复杂日历/例外日。
- Cordis HMR、真实 Session 生命周期与性能基准仍未完成。
