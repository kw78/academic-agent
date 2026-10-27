# Academic Agent

一个以**可靠自动化为主体、按需使用 Agent**的个人学业助手。课程、作业、考试、学习任务和计划由事件溯源内核持续维护；数据源、调度、规划、通知和 Agent 工具都是可替换、可卸载的能力。

- 方向基线：[doc/Academic_Agent_Intent_v1.0.md](doc/Academic_Agent_Intent_v1.0.md)
- 架构规范：[doc/Academic_Agent_Architecture_Spec_v0.1-1.md](doc/Academic_Agent_Architecture_Spec_v0.1-1.md)
- 工程准则与状态：[AGENTS.md](AGENTS.md)
- 架构决策：[docs/adr](docs/adr)
- 测试与验收矩阵：[docs/testing.md](docs/testing.md)

## 当前状态

- 单用户、本地、CLI + SQLite 的 MVP 闭环已完成。
- 常规同步、去重、提醒、基础规划**不调用 LLM**；Agent 只通过受控工具读取事实或提交命令。
- M1（事件溯源内核）与 M2（fixture 数据源 + 调度 + 规划）已完成；M3 的宿主无关 Agent 工具已完成。
- **DSH/Cordis 绑定尚未完成**：框架仍为 `0.0.1-rc.*`，M0 spike 待做。内核与工具桥保持宿主无关，详见 [ADR 0002](docs/adr/0002-host-agnostic-core-dsh-deferred.md)。

## 快速开始

要求 Node.js ≥ 22.12（当前开发机为 v22.23.2）。

```bash
npm install
npm run typecheck
npm test

# 端到端演示（写入 .data/academic.db）
ACADEMIC_DB=.data/academic.db npm run demo
```

CLI 命令：

```bash
npm run demo                    # 同步 fixture、创建任务、生成并确认计划
npm run demo -- sync            # 同步 + 处理提醒/重规划请求
npm run demo -- list            # 查看待办、任务、未读提醒
npm run demo -- plan --accept   # 生成未来 7 天计划并确认
npm run demo -- notifications   # 未读提醒
npm run demo -- backup          # 一致性备份到 .data/backups/
npm run demo -- help
```

数据库路径由 `ACADEMIC_DB` 控制，默认 `.data/academic.db`，已被 git 忽略。

## 架构要点

```text
CLI / Agent Bridge
        │  查询 / 受控命令
        ▼
Academic Kernel（聚合、命令校验、事件决策）
        │  单事务
        ▼
SQLite Event Store ──► 核心投影（同步更新）
        │
        └──► Durable Dispatcher ──► 通知 / 重规划触发器 / 扩展投影
                                      │
Scheduler ──► Connector ──► Adapter   └──► Planner（确定性）
```

- **事件是事实源**：核心写入在单事务内完成事件追加、核心投影与命令收据；投影可重建。
- **命令幂等 + 乐观并发**：`commandId` 收据去重，`expectedVersion` 显式冲突。
- **受控变更**：UI、Agent、自动化都只能经 Command API；插件不直接写事件表或核心读模型。
- **同步去重**：优先外部 ID；无变化为 no-op；partial/空结果不会清空旧事项；失败保留旧数据。
- **通知安全**：Reaction 从启用时的最新事件位置开始，历史回放不会重发旧提醒。
- **可恢复调度**：持久作业、租约、退避重试、崩溃后 `interrupted` 恢复。
- **确定性规划**：过滤完成项 → 按截止/优先级排序 → 扣除固定与锁定时段 → 顺序填充 → 明确报告冲突。
- **Agent 最小权限**：默认只读；任务写入需要显式授权 + 用户确认；无任意 SQL、无直接事件写入。

## 包结构

| 包 | 职责 |
|---|---|
| `packages/academic-contracts` | 命令/事件/查询 Schema、领域类型、端口、能力目录 |
| `packages/academic-kernel` | Aggregate、命令决策、核心投影规则 |
| `packages/academic-storage-sqlite` | Event Store、原子 Command Bus、核心投影、查询、迁移 |
| `packages/academic-event-dispatcher` | 持久 checkpoint、扩展消费者、退避 |
| `packages/academic-connectors` | Fetch → Normalize → Reconcile、同步运行记录 |
| `packages/academic-scheduler` | 持久作业、租约、重试、崩溃恢复 |
| `packages/academic-planner-basic` | 确定性 Planner、重规划请求去重 |
| `packages/academic-agent-tools` | 最小 Agent 工具集与宿主无关注册契约 |
| `packages/academic-notifications` | 应用内通知 Reaction |
| `adapters/fixture-lms` | 受控测试数据源 |
| `apps/academic-cli` | 组合根、CLI 演示、备份恢复 |

依赖方向固定为 `Feature → Contracts → Kernel API`；组合根负责装配，不包含领域规则。

## 数据与安全

- 凭据、Cookie、Token 不进入领域事件或日志（当前 fixture 无凭据）。
- 外部网页/教学资料视为不可信输入；Agent 输出不会未经校验成为权威事实。
- 备份使用 SQLite `VACUUM INTO` 生成一致性快照；恢复后校验事件位置并可按需重建投影。
- 默认不自动提交作业、不删除平台数据、不修改第三方账户。

## 已知限制与后续

- **M0**：锁定 DSH 版本，接入 Cordis Service/Tool/HMR，补真实生命周期测试。
- **M4**：性能基准（Spec §20）、迁移演练、故障注入扩展。
- 真实 LMS 尚未接入；当前使用 `fixture-lms`。
- UI 目前为 CLI；Web/Desktop、系统通知待定。
- `node:sqlite` 为实验性 API，升级 Node 时需重新验证。

## 测试

```bash
npm run typecheck
npm test
```

共 57 项测试，覆盖 T01–T20（DSH 专属部分除外）。详见 [docs/testing.md](docs/testing.md)。
