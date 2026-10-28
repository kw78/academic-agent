# 0011 — 候选暂存与统一激活

- 状态：已接受
- 日期：2026-10-28
- 相关：Architecture §4、§5、§6；Intent I-02、I-05；ADR 0009、0010

## 背景

AI 候选流水线已经能探测、回放和验证 Manifest，但生成者（Agent）与落库者（UI）之间缺少交接物：

- `academic_register_adapter_candidate` 与领域写入共用 `agentWrites` 开关；默认关闭时 Agent 只能验证、不能保存，用户必须手工搬运样本。
- Agent 与 CLI 的 `activate` 只激活 Manifest，不创建声明式同步源；只有 UI 的启用路径会创建源并复制同站点会话。
- 三条路径行为不一致，且“样本回放通过”容易被误读为“真实同步通过”。

## 决策

1. **候选保存是暂存操作**：`academic_register_adapter_candidate` 不再要求 `agentWrites`。它只写入候选表（`validated`/`candidate`），不激活 Manifest、不创建同步源、不触发同步。只有 `validated` 版本可以被启用。
2. **启用仍是受控写入**：`academic_activate_adapter_candidate` 继续要求 `agentWrites` 与可信宿主逐次授权；模型参数不能自证授权。
3. **激活语义统一**：把“激活 Manifest + 创建/更新 declarative 源 + 同站点会话复制”下沉到应用服务；CLI、UI 与提供了激活回调的 Agent 工具共用同一实现。激活会从候选表重新注册 Manifest，因此不需要重启 Host。
4. **证据分层**：样本回放只证明提取规则能读对给定样本；UI 与文档必须标注“未做真实同步”，真实预览、真实同步和重复 no-op 属于更高层证据。
5. **source 级作业请求**：Manifest 的 `assignments.scope` 支持 `course`（默认，逐课程）与 `source`（只请求一次，按行内 `courseExternalId` 归属），避免同一静态列表按课程重复抓取。

## 后果

- Agent 无需写权限即可交付候选；用户仍在“连接”页显式启用，权限边界不变。
- CLI `adapter activate/rollback` 与 UI 行为一致，都会维护同步源；不需要通过重启刷新 Manifest 注册表。
- 候选表属于运营数据，不是学业事实源；保存候选不会改变任何学业状态。
- `scope=source` 只允许出现在 assignments；URL 中引用 `{{course.*}}` 的请求不能被标记为 source 级。

## 验证

- `tests/integration/adapter-candidate-tools.test.ts`：无写权限可暂存、激活仍被拒；提供激活回调时走宿主统一路径。
- `tests/integration/ui-api.test.ts`：启用后创建 declarative 源并复制会话。
- `tests/integration/declarative.test.ts`：source 级作业只请求一次，并保留行内课程归属。
- `packages/academic-adapter-runtime/test/manifest.test.ts`：scope 位置校验与 URL 模板限制。
