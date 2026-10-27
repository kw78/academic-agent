# Architecture Decision Records

| ADR | 决策 | 状态 |
|---|---|---|
| [0001](0001-event-sourced-sqlite-kernel.md) | SQLite Event Store + 同事务核心投影 | 已接受 |
| [0002](0002-host-agnostic-core-dsh-deferred.md) | 先构建宿主无关内核，DSH/Cordis 绑定延后到 M0 | 已接受 |
| [0003](0003-deterministic-automation-and-planner.md) | 同步、去重、提醒、基础规划零 LLM | 已接受 |
| [0004](0004-replan-request-deduplication.md) | 稳定 replanRequestId + pending 合并，避免重复计划 | 已接受 |

新增决策时按 `NNNN-kebab-title.md` 命名，并更新本索引。已接受决策的契约不得静默修改；需要变更时新增 ADR 并说明迁移方案。
