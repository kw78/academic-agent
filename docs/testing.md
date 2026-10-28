# 测试与验收

## 命令

```bash
npm run typecheck       # TypeScript strict 检查
npm test                # vitest 全量测试
npm test -- tests/integration/connectors.test.ts   # 单文件
ACADEMIC_DB=.data/academic.db npm run demo         # 端到端演示
```

当前基线：**145 项测试通过**（31 个测试文件）。

## 分层

| 目录 | 内容 |
|---|---|
| `packages/*/test` | 契约、内核、Planner 的单元测试 |
| `tests/integration` | 存储、Dispatcher、Connector、Scheduler、Planner 生命周期、通知、Agent 工具 |
| `tests/replay` | Upcaster 与历史事件重放 |
| `tests/e2e` | 组合根、Agent Bridge 卸载、零模型调用、备份恢复、应用重启、用户管理/计划锁定 |

## 架构测试矩阵（Spec §19）

| 编号 | 验收点 | 测试位置 | 状态 |
|---|---|---|---|
| T01 | 相同命令重复提交；同 ID 不同内容拒绝 | `kernel-storage.test.ts` | 通过 |
| T02 | 并发更新同聚合；陈旧版本显式冲突 | `kernel-storage.test.ts` | 通过 |
| T03 | 核心投影写入失败时事件与收据一起回滚 | `kernel-storage.test.ts` | 通过 |
| T04 | 删除/重建核心读模型后状态等价、事件不变 | `kernel-storage.test.ts` | 通过 |
| T05 | 重复同步相同快照不新增事件/事项 | `connectors.test.ts` | 通过 |
| T06 | partial / 默认 full 空结果不清空旧事项 | `connectors.test.ts` | 通过 |
| T07 | 截止日期变化写入新事件，旧值可追溯，进度保留 | `connectors.test.ts`、`kernel.test.ts` | 通过 |
| T08 | Planner 卸载后旧计划可查、无法产生新计划 | `planner.test.ts`、`cordis-lifecycle.test.ts` | 通过（含真实 Cordis fiber） |
| T09 | 重规划去重；重启用后不重复计划 | `planner.test.ts` | 通过 |
| T10 | 扩展投影从历史重建；核心状态不变 | `dispatcher.test.ts` | 通过 |
| T11 | 通知历史回放不重发旧提醒 | `notifications.test.ts` | 通过 |
| T12 | 调度执行中崩溃后可恢复且不重复事项 | `scheduler.test.ts` | 通过 |
| T13 | 网络/凭据失败保留旧数据并记录运行状态 | `connectors.test.ts` | 通过 |
| T14 | Agent Bridge 卸载后后台同步/调度照常 | `tests/e2e/app.test.ts`、`cordis-lifecycle.test.ts` | 通过（宿主无关 + 真实 Cordis tools fiber） |
| T15 | 常规同步与 Planner 模型调用为 0 | `tests/e2e/app.test.ts` | 通过（`ModelUsageMeter`） |
| T16 | 未授权/未确认的 Agent 写入被拒 | `agent-tools.test.ts` | 通过（可信宿主授权；模型参数不能自证） |
| T17 | 停用后无残留监听器/定时器/处理器 | Dispatcher、Scheduler、Cordis 生命周期测试；DSH Web Plugins 实测 | 通过（profile 级 UI 禁用/启用；文件级 HMR 未验证） |
| T18 | 数据库备份恢复；事件完整、投影可校验/重建 | `tests/e2e/app.test.ts` | 通过 |
| T19 | 旧 Schema 事件经 Upcaster 正确投影 | `tests/replay/upcaster.test.ts` | 通过 |
| T20 | 会话/应用结束不影响持久化状态与后台任务 | `tests/e2e/app.test.ts` | 通过（应用重启；DSH Session 待 M0） |

## P0 修复覆盖

| 修复 | 测试 |
|---|---|
| FIX-01 重启不覆盖调度配置 | `scheduler.test.ts`：暂停/周期在 `ensureJob` 后保持不变；应用重启后同步任务仍暂停 |
| FIX-02 消费者断点续跑 | `dispatcher.test.ts`：停机期间事件在重启后处理；投影版本变化才重置 checkpoint |
| FIX-03 Agent 可信写入授权 | `agent-tools.test.ts`：模型 `confirmed` 不能绕过；无授权器/拒绝授权不产生事件；可信授权才写入 |
| FIX-04 同步→默认学习任务 | `management.test.ts`：每个事项一个默认任务；重复同步不重复；用户改时长/完成后不被重置；截止变化进入 Planner |
| FIX-05 持久化可用时间 | `availability.test.ts`：每周时段、时区换算、临时不可用、粒度；Planner 只在允许时间排程 |
| FIX-06 周期截止提醒 | `reminders.test.ts`：72h/24h 选择、去重、设置开关/阈值、重启与调度补偿、date-only 时区 |

## CRED-01/02 凭据连接

`tests/integration/connections.test.ts` 覆盖：

- 连接元数据与秘密分离，DB/事件/同步记录不出现明文
- DPAPI 受保护凭据完成 Adapter 同步；密文文件不含明文
- 连接重启后元数据与状态恢复
- 验证成功/失败、断开、删除凭据；删除不删领域事件
- 认证失败标记 `auth-required` 并保留旧数据
- source mismatch 拒绝凭据访问
- 系统凭据库不可用时 fail-closed

## MVP 用户控制

`tests/e2e/management.test.ts` 覆盖：

- 课程添加/归档、任务创建/完成/重开/改预计时长；
- 自动化状态（投影一致性、最近同步、定时任务）与提醒已读；
- 计划锁定：移除重叠学习块、增加锁定时段、排队重规划；
- 锁定后旧建议失效并重新计算，新建议不占用锁定时间；
- 解锁与计划归档。

## R3 Cordis 独立生命周期

`tests/integration/cordis-lifecycle.test.ts` 使用真实 `@deepseek-ai/cordis`：

- host 创建 Academic App 并提供 `academicApp` 服务；
- planner fiber 注册/卸载 Planner 能力；卸载后已有计划仍可查询；
- tools fiber 注册 16 个工具；卸载后工具清零，host/store/planner 保持；
- 重新加载 tools/planner 后能力恢复；
- host 卸载关闭 app。

DSH `0.2.1-rc.3` 中已确认 host/planner/tools 三行加载并输出对应日志；Web profile 已实测通过 Plugins 页面禁用/启用 `/dsh-ui`，后台作业继续运行，重新启用后无重复 Host；文件级 HMR 尚未验证。

## 前端 UI

`packages/academic-dsh-ui` 的单元、集成与真实 DSH Web 验证见 [frontend-verification.md](frontend-verification.md)。

## 通用数据源与网站会话

- `tests/integration/sources.test.ts` 覆盖 DB source 的 engine 路由、版本冲突与配置中的凭据字段拒绝。
- `tests/integration/ui-api.test.ts` 使用注入的 engine 登录结果验证：宿主 API 只写入会话秘密、标记 connected，响应不包含秘密。
- `tests/integration/web-sessions.test.ts` 覆盖通用网站会话：Cookie 不进入 SQLite、仅同域 fetch、删除会话。
- 真实网站登录需要人工完成登录与验证码，属于桌面手工验收，不在自动化测试中绕过验证码。
- 测试不使用真实账号、密码或会话。

## M0 会话抓取安全

`tests/integration/web-sessions.test.ts` 覆盖：

- Cookie 按 domain/path/secure/expiry 选择，跨站 Cookie 拒绝，CRLF 注入拒绝；
- 每一跳重定向都重新校验主机，跨域跳转、HTTPS→HTTP 降级和超限重定向均失败；
- 回环、私网、链路本地、云元数据地址和解析到私网的域名被阻断；
- 流式响应字节上限、请求超时；登录 URL 查询参数不进入存储/列表，错误中的 URL 被脱敏。

`tests/integration/source-browser.test.ts` 覆盖 browser-session 验证复用同一套安全抓取：按路径发送 Cookie、识别登录页跳转，旧格式未分域会话直接失败并要求重新登录。

已知边界：DNS 在请求前解析并校验，但尚未通过自定义 dispatcher 固定解析结果，DNS rebinding 仍是后续加固项。

## 数据源状态与能力

- `tests/integration/ui-api.test.ts` 覆盖：未传 ID 时返回生成的 `sourceId`；拒绝 engine 不支持的 `authKind` / `loginMode`；engine 配置校验失败返回 `VALIDATION`；配置、认证、同步健康与 Adapter 就绪度分别返回，fixture 同步后为 `connected/healthy`，browser-session 未登录为 `missing/never-synced`。
- `tests/unit/ui-view.test.ts` 覆盖各维度标签与颜色语义。

## 声明式 Adapter

- `packages/academic-adapter-runtime/test/manifest.test.ts`：Manifest Schema、版本注册/激活、HTML/JSON 字段提取、嵌套 JSON path。
- `tests/integration/declarative.test.ts`：JSON 课程/作业/详情、作业分页、HTML CSS 提取、相对 URL、未授权响应、预览不写库、Connector/Kernel 同步与重复预览 no-op。
- 已覆盖：允许域名、GET-only、分页上限、正则/trim、ISO/日期截止时间；XPath、字段级复杂转换和代码沙箱仍未实现。

## 稳定性与运维

- `tests/integration/sync-concurrency.test.ts`：同一 source 并发同步被拒绝；课程发现瞬时失败有限重试。
- `tests/integration/blackboard.test.ts`：作业页 503 一次后重试成功；持续 5xx 保留 partial 或失败状态。
- `tests/integration/web-sessions.test.ts`：429 映射为 `RATE_LIMITED`；超时与响应上限覆盖。
- 备份/恢复、迁移、会话撤销、升级与故障排查见 [operations.md](operations.md)。

## AI 候选 Adapter

- `packages/academic-adapter-runtime/test/candidate.test.ts`：离线样本回放、无效样本失败、候选持久化、validated 才能启用、版本回滚、失败候选保持 inactive。
- `tests/integration/adapter-candidate-tools.test.ts`：Agent 校验只读；注册/启用无授权被拒；可信授权后注册并启用。
- `tests/integration/declarative.test.ts`：候选注册 → 启用 → declarative source 同步 3 条事项。

## Blackboard 只读切片

- `adapters/ustc-blackboard/test/parse.test.ts`：课程链接/学期过滤、作业区定位、作业链接去重、中英文/ISO 截止时间、登录页识别、内容 hash 稳定性。
- `tests/integration/blackboard.test.ts`：课程/作业标准化、会话过期映射为 `AdapterAuthError`、单页失败保留 `partial`、预览不写库、Connector/Kernel 同步与重复同步 no-op。
- 真实会话手工验证：在临时库用 `termFilter=2026FA`、`maxCourses=2` 同步到 2 门课程、7 个作业；HW4 页面无截止日期，保留 `unknown`。

## DSH Desktop

`desktop` profile 已安装 `@academic/dsh-plugin` / `@academic/dsh-ui` 并重启桌面端验证：

- 桌面进程创建 Academic Host 默认数据库与 3 个调度作业；
- UIAutomation 可见“学业”“Host 已连接”；
- 桌面面板执行“立即同步”后数据库出现课程与来源事项；
- 桌面 Plugins 页面禁用 UI 后入口消失、后台作业继续，重新启用后入口恢复且作业数不变。
- `dsh --profile desktop --dump-config` 被 Electron 拒绝，属于预期限制。

## DSH 实测（本机 0.2.1-rc.3）

已在独立 `academic` profile（从 `headless` 模板创建）安装 `@academic/dsh-plugin`：

```bash
npm run build:dsh
dsh plugin --profile academic add D:/project/classhelper/packages/academic-dsh-plugin
ACADEMIC_AGENT_SELFTEST=1 \
ACADEMIC_AGENT_DB=D:/project/classhelper/.data/dsh-academic.db \
dsh academic --json "hello"
```

实测通过：

```text
[academic-host] loaded db=D:/project/classhelper/.data/dsh-academic.db
[academic-planner] capability registered
[academic-tools] tools=16 registered=true
[academic-tools] selftest readIsError=false readCourses=1 writeIsError=true writeError=FORBIDDEN: Agent write access is not enabled
```

- 插件在真实 DSH 进程加载；
- 16 个工具注册到真实 `ctx.tools`；
- 只读工具经真实 ToolRegistry 执行成功；
- 未授权写入被权限门禁拒绝；
- 不调用模型。

随后使用 DSH 凭证中保存的 `DEEPSEEK_API_KEY` 做了真实模型调用（密钥只注入进程环境，不打印）：

```text
{"type":"tool_call","tool":"academic_list_courses","input":{}}
{"type":"tool_result","status":"completed","result":"{\"courses\":[{... \"title\": \"Introduction to Computer Science\" ...}]}"}
{"type":"final","text":"There is one course: Introduction to Computer Science — internal id: b170ab5d-..."}
```

模型正确选择并调用了 Academic 工具，工具读取真实 SQLite 数据，最终回答正确。若 DSH 未配置 key，headless 会报 `MISSING_CREDENTIAL`。

## 手工验收（fixture 闭环）

```bash
ACADEMIC_DB=.data/demo.db npm run demo
```

预期：

- 首次同步新增 2 个事项（assignment + exam）。
- 再次同步新增/更新为 0，不产生重复事项。
- 生成并确认一份学习计划；再次运行 demo 跳过自动确认。
- 应用内提醒只针对启用后的新事件。
- 重启后事项、任务、计划仍在。

## 已知测试边界

- DSH 已完成 bundle 加载、真实 ToolRegistry 工具注册与执行、带 DeepSeek 模型的工具调用；Cordis 文件级 HMR、真实 Session 生命周期与审批 UI 尚未验证。
- 性能基线（Spec §20，例如 1000 事项 P95、10000 事件重建）尚未做正式基准。
- Blackboard 已有真实只读 Adapter 与真实会话同步记录（2 门课程/7 个作业），但考试、测验、文件夹分页、附件、成绩与限流未覆盖；其余平台只有 fixture 与声明式样本。详见 [real-sources.md](real-sources.md)。
- 系统凭据库当前为 Windows DPAPI；Credential Manager 与其他 OS vault 作为后续 CredentialVault 实现。
- `node:sqlite` 为实验性 API；若升级 Node 需要重新验证。
- 备份恢复测试覆盖单文件 SQLite；未做跨版本迁移演练。
