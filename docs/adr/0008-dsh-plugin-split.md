# 0008 — DSH bundle 拆分为 host / planner / tools

- 状态：已接受
- 日期：2026-10-27
- 相关：Architecture §9、§10、§14、§18；ADR 0005；FIX/ R3

## 背景

原 DSH bundle 把整个 Academic App 与 Agent 工具放在一个插件里。卸载 Agent Bridge 会连带关闭后台自动化，Planner 也无法独立装卸，不满足 Cordis 能力生命周期要求。

## 决策

- 使用 Cordis `Service` 提供 `academicApp`：
  - `host` 创建 Event Store、Scheduler、Dispatcher、Notification、Connector，并在 `ctx.effect` 中启动/关闭。
  - host 不注册 Planner 能力；能力生命周期交给独立插件。
- `planner` 插件注入 `academicApp`，在自身 effect 中注册/释放 Planner 能力。卸载后已有计划保持可查询，新规划请求不可用。
- `tools` 插件注入 `academicApp` 与 `tools`，在自身 effect 中注册全部学术工具（当前 17 个）并返回 disposer。卸载即 Agent Bridge 卸载。
- Cordis service 暴露 `appReady: Promise<AcademicApp>` 而不是通过代理调用带私有字段的方法，避免服务代理绑定问题。
- bundle patch 插入三行：
  `academic-host` → `academic-planner` → `academic-tools`。

## 验证

- 真实 Cordis 测试 `tests/integration/cordis-lifecycle.test.ts`：
  - host 提供服务；planner/tools 独立加载；
  - 卸载 tools 后工具清零，host/store/planner 保持；
  - 卸载 planner 后能力消失、旧计划仍可查；
  - 重载 tools/planner 恢复；
  - host 卸载关闭 app。
- 本机 DSH `0.2.1-rc.3` 实测输出：
  `[academic-host] loaded`、`[academic-planner] capability registered`、`[academic-tools] tools=17 registered=true`，退出时 `capability released`。

## 代价与后续

- profile 级禁用/启用已在 DSH Web 与 Desktop 实测（入口消失/恢复，后台作业继续）；文件级 HMR/真实 Session 生命周期仍未验证。
- tools 与 planner 依赖 host 服务；host 卸载会级联卸载它们，这是预期行为。
- 未来 Connector/Notification 也可按相同方式拆为独立 fiber，但普通 Adapter 不必成为 Cordis 插件。
