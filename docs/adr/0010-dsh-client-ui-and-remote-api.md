# ADR 0010：DSH 客户端 UI 与 Host Remote API

- 日期：2026-10-27
- 状态：已采用
- 关联：[前端 Spec](../../doc/Academic_Agent_Frontend_Spec_v0.1.md)

## 背景

需要在不重写 DSH Harness 的前提下，为 Academic Agent 提供日常可用的界面。DSH Desktop 与 Web 共用同一套 Web 客户端；UI 必须与内核、后台自动化、凭据库解耦，并能在真实 DSH 版本上加载、卸载和重载。

项目锁定的本机 DSH 版本为 `0.2.1-rc.3`，其客户端插件、Slot 和 Remote API 与旧源码不同，必须先按实际安装版本验证。

## 决策

1. 新建 `packages/academic-dsh-ui`，一个客户端 UI 插件同时服务 Desktop 与 Web。
2. 客户端通过 `sidebar.panellist` 注册“学业”入口，通过 `main` keyed slot 注册主面板；不复制 DSH 侧边栏或聊天 UI。
3. Host 侧新增 `AcademicUiService extends TypertRemoteService`，命名空间 `academic`，通过 `@Remote` 方法暴露查询和命令。
4. DSH `0.2.1-rc.3` 没有为第三方包生成 Typert 描述时，使用 Gateway 的 SRC fallback：方法参数保持简单 JSON，Host 端用 zod 做最终输入校验。
5. UI 只调用 `ctx.connection.rpc.call('/api', 'academic/<method>', { args })`；响应为 `{ ok, value }` 或 `{ ok, error }`。
6. 浏览器 bundle 使用 `window.__ModuleLoader__.load({ id, factory })` 包装；`react`、`react/jsx-runtime` 作为 DSH 平台模块 external。
7. Host Remote 服务独立于 `academic-host`/`academic-planner`/`academic-tools` fiber；禁用 UI 只移除界面和 Remote 服务，不停止 Scheduler、Dispatcher、Connector 或提醒扫描。
8. 候选计划使用 Host 内存中的 `previewId` 缓存（10 分钟、最多 20 条）；确认时只接受缓存中的候选，不信任客户端提交的计划块。

## 后果

- 不引入第二套 Electron/Tauri 壳，也不复制 Desktop/Web 两套业务 UI。
- UI 与后台生命周期独立；真实 DSH Web 中已通过 Plugins 页面禁用/启用 UI 验证。
- SRC fallback 不是长期类型安全契约；未来 DSH 提供生成式 Remote 描述时，应迁移到严格描述并保留 Host 端 zod 校验。
- 凭据仍只经 Host Remote 输入并写入系统凭据库；客户端不保存秘密，UI 不接收 `credentialRef`。
- 真实平台 Adapter 未实现时 UI 不展示认证表单，避免“保存凭据即平台可用”的误报。

## 验证记录

- DSH `0.2.1-rc.3` Web profile：侧边栏入口、主面板、真实 SQLite 课程查询均通过。
- DSH Desktop `desktop` profile：安装 host/planner/tools/ui 四行后，桌面进程创建默认数据库与调度作业；UIAutomation 可见“学业”“Host 已连接”，桌面面板“立即同步”写入真实课程与事项。
- 任务完成、计划候选确认、锁定时段、可用时间保存、作业暂停/恢复、提醒已读均通过真实 Remote 调用。
- 禁用 `@academic/dsh-ui` 后入口消失，后台 `planner.process-replans` 等作业继续运行；重新启用后入口恢复且无重复 Host/作业/课程。
- 自动化测试：`tests/unit/ui-view.test.ts`、`tests/unit/ui-security.test.ts`、`tests/integration/ui-api.test.ts`。
