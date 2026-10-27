# 0002 — 先构建宿主无关内核，DSH/Cordis 绑定延后到 M0

- 状态：已接受
- 日期：2026-10-27
- 相关：Architecture Spec §2、§8、§9、§18；AGENTS §8

## 背景

架构目标基于 DSH Harness / Cordis。但当前 npm 上的 `@deepseek-ai/*` 仍为 `0.0.1-rc.*`，接口、生命周期与 HMR 语义未锁定；同时学业内核（事件、命令、聚合、查询）本身不依赖 Cordis。

## 决策

- 先把稳定内核、存储、调度、规划、连接器、通知与工具契约实现为纯 TypeScript 包。
- 依赖方向固定为 `Feature → Contracts → Kernel API`；组合根 `apps/academic-cli` 负责装配。
- Agent 工具通过宿主无关的 `AcademicToolHost` 注册；`InMemoryToolHost` 仅供本地 CLI/测试。
- DSH 绑定作为独立 M0 spike：锁定版本，验证 `inject`、Service/Tool 注册与撤销、HMR/重启、卸载时资源释放。
- 在 M0 完成前，不声称已满足 DSH 集成验收，也不把 Cordis 运行时事件当作可靠队列。

## 结果

- 核心逻辑现在可独立测试、可替换宿主；不会因 RC 框架变更而重写领域层。
- Agent Bridge 可以先按最小业务权限工作（只读 + 显式授权的任务写入）。
- DSH Tool 适配器、Plugin Manager 生命周期与 HMR 验收仍待 M0。

## 代价

- 暂时缺少 DSH Session/Tool Call 的真实集成；T20 目前用“应用重启”验证状态独立性。
- M0 落地时需要新增适配层并补充兼容性测试，可能调整包入口但不改变领域契约。
