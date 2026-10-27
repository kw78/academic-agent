# ClassHelper · Academic Agent

一个以**可靠自动化为主体、按需使用 Agent**的个人学业助手。核心是事件溯源的学业领域内核，周边能力（数据源、调度、规划、通知、Agent 工具）以可卸载的契约化模块组织。

- 项目方向基线：[doc/Academic_Agent_Intent_v1.0.md](doc/Academic_Agent_Intent_v1.0.md)
- 架构规范：[doc/Academic_Agent_Architecture_Spec_v0.1-1.md](doc/Academic_Agent_Architecture_Spec_v0.1-1.md)
- 工程准则与状态：[AGENTS.md](AGENTS.md)

## 快速开始

```bash
npm install
npm run typecheck
npm test
npm run demo
```

运行时数据默认写入本地 SQLite（`data/` 目录，已被 git 忽略）。

## 包结构

```text
packages/academic-contracts        公共契约、命令/事件/查询 Schema、端口
packages/academic-kernel           Aggregate、命令决策、核心投影规则
packages/academic-storage-sqlite   Event Store、核心投影、查询、迁移
packages/academic-event-dispatcher 持久游标与扩展消费者
packages/academic-connectors       Adapter 协调与同步
packages/academic-scheduler        持久化作业与恢复
packages/academic-planner-basic    确定性规划算法
packages/academic-agent-tools      Agent 最小工具集
packages/academic-notifications    应用内通知 Reaction
adapters/fixture-lms               MVP 可控测试数据源
```

依赖方向严格为 `Feature → Contracts → Kernel API`；功能模块不得直接写 Event Store 或核心投影。
