# 0005 — DSH bundle 集成（本机 0.2.1-rc.3）

- 状态：已接受（M0 部分验证）
- 日期：2026-10-27
- 相关：Architecture Spec §4、§9、§14、§18；ADR 0002

## 背景

本机已安装 DSH 桌面应用（`dsh` CLI `0.2.1-rc.3`，Node 24.21.0）。需要把 Academic Agent 真正挂到 DSH，而不是只保留宿主无关工具层。DSH 的扩展单元是 **bundle**：npm 包声明 `dsh.bundle.patch`，profile 通过 `dsh plugin add` 安装并叠加 `cordis.patch.yml`。

## 决策

- 新增 `@academic/dsh-plugin` bundle，使用 esbuild 打包为单文件 `lib/index.js`，并将根 `migrations/` 复制进包内。
- `@deepseek-ai/cordis` 与 `@deepseek-ai/dsh-tools` 保持 **external**，由 DSH 运行时提供；不复制 Cordis/ToolRegistry。
- 插件导出 `inject = ['tools']`，在 `ctx.effect()` 中创建 Academic App、启动后台能力、注册 6 个 `defineTool`，并在卸载时关闭 store/定时器。
- 工具只调用 `@academic/agent-tools` 的宿主无关层，间接走 Query/Command API；默认只读，`agentWrites` 默认 false。
- 数据库默认 `$DSH_HOME/academic-agent/academic.db`，可用 `ACADEMIC_AGENT_DB` 覆盖；迁移目录来自 bundle 自带副本。
- 使用独立 `academic` profile（从 `headless` 模板创建）验证，不修改用户现有 `desktop` / `web` profile。

## 结果与证据

本机 DSH `0.2.1-rc.3` 实测：

```text
[academic-agent] loaded ... tools=6 registered=true courses=1 items=1
[academic-agent] selftest readIsError=false readCourses=1 writeIsError=true writeError=FORBIDDEN: Agent write access is not enabled
```

- 证明 bundle 在真实 DSH 进程加载、`ctx.tools` 注册成功、真实 ToolRegistry 执行只读工具成功、写入权限门禁生效。
- 使用 DSH 凭证中的 DeepSeek key 完成真实模型调用：模型选择 `academic_list_courses`，工具返回 SQLite 中的课程，最终回答正确（exit 0）。密钥仅注入进程环境，未写入仓库或日志。
- 若 headless 未配置 key，会报 `MISSING_CREDENTIAL`；这与插件本身无关。

## 代价与后续

- plugin 的 peer 依赖不能通过工作区 `--patch` 直接解析；必须安装到 profile（或从 DSH 源码 checkout 运行）。
- 尚未验证 Cordis HMR、真实 Session 生命周期、审批 UI 与带模型工具调用；这些仍是 M0/M4 的验收项。
- DSH 升级（超出 `<0.3.0-0`）需要重新跑 bundle 加载、工具 schema 与 ToolRegistry 自测。
