# 0013 — 用户一次性授权的 Agent 自动接入

- 状态：已接受
- 日期：2026-10-28
- 相关：Architecture §9、§15；Intent I-05；ADR 0011

## 背景

候选暂存已经不需要写权限，但启用仍要求逐次可信授权。用户在真实接入时遇到两个问题：

- MCP/Host 通道没有审批适配器，Agent 只能注册、不能启用；
- CLI 可以激活，但运行中的 GUI 进程没有重新加载 Manifest，仍要用户再点一次“启用”。

结果是接入流程仍需要人工介入，且容易在两条同名数据源之间选错。

## 决策

1. 新增持久化偏好 `agent_adapter_automation`，默认关闭，只能由用户在“设置”页开启。
2. 开启后，Agent 可以：
   - 启用**已验证（validated）**的候选；
   - 预览与同步由该候选创建的 **declarative** 数据源；
   - 这些操作不需要逐次弹窗，因为开关本身是用户的持久授权。
3. 仍然禁止：
   - 启用未验证/回滚候选之外的任意版本；
   - 操作非 declarative 数据源；
   - 读取 Cookie、Token、凭据或连接秘密；
   - 修改任务、删除数据源、提交作业或修改学校平台；
   - 通过模型参数打开该开关。
4. 关闭开关后恢复原有逐次授权：写入仍需 `agentWrites` + 可信宿主审批。
5. 新增只读 `academic_preview_source_sync` 与确定性写入 `academic_sync_source`，二者都要求开关开启，并在 Host 内解析该源已连接的会话；模型不接触会话秘密。
6. 激活与同步都在当前 Host 进程内完成，Manifest 从候选表重新注册，因此不需要重启 DSH。

## 后果

- 用户只需一次性开启开关，之后 Agent 可以完成“生成 → 验证 → 暂存 → 启用 → 预览 → 同步”的闭环。
- 权限仍受候选验证、来源 engine 与凭据隔离限制；关闭开关即可回到人工审核。
- 偏好属于运营设置，不进入领域事件，不影响学业事实。

## 验证

- `tests/integration/preferences.test.ts`：默认关闭、更新后持久化。
- `tests/integration/adapter-candidate-tools.test.ts`：开关开启时可无逐次审批启用/预览/同步；关闭时拒绝；注入页面文本不能打开开关。
- `tests/integration/ui-api.test.ts`：设置页读取/保存开关。
- `tests/unit/dsh-tool-specs.test.ts`、`tests/integration/cordis-lifecycle.test.ts`：19 个工具注册。
