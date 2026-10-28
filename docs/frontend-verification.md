# 前端实现与 DSH 验证记录

- 日期：2026-10-27
- DSH 版本：`0.2.1-rc.3`（本机安装）
- 包：`packages/academic-dsh-ui`
- 关联 ADR：[0010](adr/0010-dsh-client-ui-and-remote-api.md)
- 设计基线：[前端 Spec](../doc/Academic_Agent_Frontend_Spec_v0.1.md)

## UI-0：宿主验证与最小入口

已从本机安装的 `app.asar` 与运行时包确认：

- 客户端插件通过 `package.json` 的 `dsh.client`（`platform: "web"`）与 `exports["./client"]` 声明；
- 浏览器 bundle 需要 `window.__ModuleLoader__.load({ id, factory: (require) => ... })` 包装；
- 导航入口使用 `sidebar.panellist` 列表 Slot，主面板使用 `main` keyed Slot；
- Host/Client 使用 `ctx.connection.rpc.call('/api', endpoint, { args })`；
- Host 服务通过 `TypertRemoteService` + `@Remote` 暴露；本版本对第三方包使用 Gateway SRC fallback；
- SRC fallback 从方法源码读取简单参数名，因此所有方法使用单个 `request` 参数，并在 Host 端用 zod 校验。

最小入口实测：

- 在独立 `academic-web` profile 中安装 `@academic/dsh-plugin` 与 `@academic/dsh-ui`；
- 侧边栏出现“学业”；
- 主面板显示 Host 已连接并读取真实 SQLite 课程；
- 首次验证发现 Cordis 服务代理访问私有字段失败，改为公开 `apiReady` 后通过。

## UI-1 至 UI-4：页面与交互

已实现：

- 总览：今日任务、近期截止、今日计划、未读提醒、最近变化、同步健康、数据源状态；
- 任务：课程/类型/截止/状态筛选、任务完成/重开、预计时长、来源事项与本地任务分离、Agent 入口；
- 计划：候选/确认计划区分、7/14/30 天预览、按日/按周/列表视图、确认/放弃、锁定/解锁、未安排原因、归档；
- 连接：课程添加/归档、数据库 source 列表、engine 元数据、配置/认证/同步健康/Adapter 分维度状态、登录/同步/验证、断开/删除凭据；数据源来自 DB 中的 engine + config，UI 不认识具体网站；
- 自动化：同步/重算/提醒作业启停、运行记录、同步记录、通知已读、提醒阈值；
- 设置：时区、每周可用时间、临时不可用、计划粒度、同步周期、界面偏好。

状态处理：

- Loading、Empty、Ready、Stale、Degraded、Auth Required、Conflict、Unavailable、Error；
- 查询失败保留上一次数据并标记时间；
- 未知截止日期、仅日期截止在界面明确标记，不当作午夜；
- “已保存凭据”显示为未验证；没有支持认证的 Adapter 时不显示认证表单。

真实 Web 操作实测：

| 操作 | 结果 |
|---|---|
| 打开“学业” | 面板加载，Host 状态为已连接 |
| 读取课程/来源事项 | 显示 Fixture LMS 的 2 个事项与 1 门课程 |
| 完成任务 | 任务从进行中消失，出现“任务状态已更新”提示 |
| 生成候选计划 | 显示“候选 · 未确认”，不写入确认计划 |
| 确认候选计划 | 当前计划状态变为“已确认” |
| 锁定计划块 | 重叠计划块被移除，锁定时段出现 |
| 保存可用时间 | 返回“可用时间已保存”，设置持久化 |
| 暂停/恢复数据源同步 | 作业状态在“已暂停/运行中”之间切换 |
| 通知全部已读 | 未读数归零 |
| “咨询 Agent” | 打开 DSH 原生聊天并填入非敏感问题，不自动授予写入 |
| 通用 source 表单 | 在“连接”页选择 browser-session engine 并创建 DB source；认证方式/登录方式随 engine 能力收敛，高级 JSON 配置由 engine 校验；卡片显示 source 名称与登录入口，说明来自 engine + config，不是 vendor UI |
| 同步预览/确认 | Blackboard source 可先“预览同步”，显示新增/更新/未变/跳过与警告，确认后才写库；重复同步显示未变 |
| 网站登录面板 | 填写 URL + 标签，登录并保存；列表显示 domain/label，无 Cookie 泄露；登录窗口真实网站手工验收待做 |

## 真实平台数据 UI 复核（2026-10-28）

使用真实 Blackboard 临时库 `.data/bb-m2-sync.db`（2 门课程、7 个作业）在独立 `academic-web` profile 启动：

- 总览显示 9 个进行中任务（BB 7 + Fixture 2）、2 个近期截止、9 条未读提醒；
- 任务页显示真实 HW1–HW7、课程号、来源链接、date-only 考试（标明仅日期）与 HW4 未知截止；
- 本地任务状态与学校提交状态分开显示；
- 数据源状态显示 USTC Blackboard“同步降级/部分抓取成功”，未伪报为成功。

该验证只证明真实数据能在 DSH Web UI 正确呈现；Desktop 手工复核本轮未执行。

## 生命周期验证

通过 DSH Plugins 页面禁用 `@academic/dsh-ui`：

- 侧边栏“学业”入口与主面板消失；
- `@academic/dsh-plugin` 的 Host/Planner/Tools 保持加载；
- SQLite 中 `planner.process-replans` 等后台作业继续产生成功运行记录；
- 课程、事件、作业数量不变。

重新启用：

- “学业”入口恢复；
- `scheduled_jobs` 仍为 3 条，课程仍为 1 条，领域事件仍为 8 条（验证时点），没有创建第二份 Runtime；
- 刷新页面后仍可读取同一 SQLite 数据。

## DSH Desktop 安装验证

已获用户授权，将 `@academic/dsh-plugin` 与 `@academic/dsh-ui` 安装到 `desktop` profile，并在 `dsh.profile.bundles` 中追加两行（保留原有 base / web-app / office-tools）。

验证结果：

- 启动 DSH Desktop 后，桌面进程创建 `$DSH_HOME/academic-agent/academic.db`，包含 `fixture-lms-sync`、`planner.process-replans`、`academic.reminders.scan` 三个持久作业；
- Windows UIAutomation 在桌面窗口中读取到侧边栏“学业”、页面标题“课程、任务、计划与数据源”“Host 已连接”；
- 在桌面面板点击“立即同步”后，Host Remote API 执行成功，数据库出现 1 门课程和 2 个来源事项；
- 在桌面 Plugins 页面禁用 `@academic/dsh-ui` 后，“学业”入口消失，`planner.process-replans` 等后台作业继续成功运行；重新启用后入口恢复，`scheduled_jobs` 仍为 3 条；
- 桌面端默认数据库与 Web 测试 profile 的数据库相互独立；Desktop 占用默认数据库时不应再启动第二个使用同一数据库的 Host。

注意：`dsh --profile desktop --dump-config` 会被 Electron 视为“由桌面应用独占管理”而拒绝；桌面 profile 的验证必须通过桌面进程完成。

## 自动化测试

```bash
npm run typecheck
npm test
```

新增：

- `tests/unit/ui-view.test.ts`：截止时间呈现、筛选、计划分组、状态映射、来源状态文案；
- `tests/unit/ui-security.test.ts`：客户端源码不出现 `credentialRef`/`credential_ref`、`sessionStorage`、`indexedDB`、`fetch(`、`node:`；仅保存 UI tab 偏好；凭据状态在提交前清空；
- `tests/integration/ui-api.test.ts`：Query API 读取、Command API 任务变更、候选/确认分离、防篡改确认、凭据引用不泄露、未支持 Adapter 拒绝认证、输入校验、作业暂停/恢复、可用时间与提醒设置、通知已读、同步结果、统一数据源阶段/下一步、失败诊断、课程优先级、候选访问范围。
- `tests/integration/preferences.test.ts`：课程优先级持久化与计划排序。
- `tests/integration/web-sessions.test.ts`、`source-browser.test.ts`：Cookie 作用域、逐跳重定向、SSRF、超时与流式响应上限。

当前基线：171 项测试通过（33 个测试文件）。

## 未完成/未验证

- Blackboard 只读 Adapter 与真实会话同步已完成课程/作业/文件夹验证；考试与测验已由 fixture 覆盖，真实账号暂无测试项样本；附件与成绩不在首版范围，UI 不做展示承诺。
- 快速添加、只读探测、候选验证报告与启用/回滚已进入 UI；Manifest 生成仍由 DSH Agent 完成。新增流程尚未做真实浏览器手工验收，自动化只覆盖 Host API 与构建。
- 2026-10-28 新增/改动的 UI：连接页阶段徽章与下一步、失败诊断、候选允许范围、设置页课程优先级、任务页复习清单与带上下文 Agent 入口。均已通过类型检查、UI 构建与 Host API 测试，但未重新做真实浏览器点验。
- 2026-10-28 登录窗口修复：当起始页本身匹配“已认证 URL”（例如 `i.ustc.edu.cn` 门户首页）时，旧逻辑会在用户登录前约 7 秒关闭窗口并保存匿名 Cookie。现在该情况必须由用户在浏览器右上角点击“已完成登录，保存会话”，宿主先校验会话再关闭；其他从登录页开始跳转的站点仍保留自动检测。用 20 秒短超时复现：修复前 7 秒返回/无 Cookie，修复后持续等待并提示手动确认。真实登录后的完整保存链路仍需用户手工确认。
- 探测面板新增“同站脚本”和“候选接口”线索；Agent 可用 `academic_probe_source` 的可选 `url` 继续探测同一主机页面，并用 `capture=true` 获取宿主侧 `sampleId` 完成真实样本回放。面板与提示词已通过类型检查、构建与 Host API 测试，尚未做真实浏览器点验。
- 系统通知未实现，当前只有应用内提醒。
- 移动端只做了响应式降级，未做专项浏览器验收。
- DSH 文件级 HMR 代码热替换未验证；已验证的是 profile 级插件启用/禁用与重新加载。
- 未做真实 DSH Session 的持久化与恢复专项测试（应用重启已覆盖）。
