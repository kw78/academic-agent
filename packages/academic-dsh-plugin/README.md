# @academic/dsh-plugin

DSH（DeepSeek Harness）bundle，把 Academic Agent 的 23 个模型工具暴露给模型。默认只读；写入必须由可信宿主对每次操作授权，模型参数（包括旧版的 `confirmed`）不能作为授权依据。当前 bundle 尚未接入 DSH 审批适配器，因此写入会被拒绝。

## 插件拆分

bundle 现在由三个独立 Cordis fiber 组成：

- `@academic/dsh-plugin/host`：创建 Academic App（Event Store、Scheduler、Dispatcher、Notification），提供 `academicApp` 服务。
- `@academic/dsh-plugin/planner`：注册 Planner 能力；卸载后已有计划仍可读取，新规划请求不可用。
- `@academic/dsh-plugin/tools`：Agent Bridge，注册 23 个模型工具；卸载后后台同步、调度、提醒继续运行。

`cordis.patch.yml` 按 host → planner → tools 插入三行。禁用 `academic-tools` 行即可验证 Agent Bridge 独立卸载。

真实 Cordis 生命周期由 `tests/integration/cordis-lifecycle.test.ts` 覆盖：卸载 tools 后 host/store/planner 保持；卸载 planner 后旧计划仍可查询；重载二者恢复；host 卸载关闭 app。profile 级 HMR 仍待验证。

## 工具

| 工具 | 类型 | 说明 |
|---|---|---|
| `academic_list_courses` | 只读 | 列出课程 |
| `academic_list_due_items` | 只读 | 按截止时间列出学业事项 |
| `academic_get_item` | 只读 | 按内部 ID 取事项 |
| `academic_get_study_plan` | 只读 | 取与时间范围重叠的生效计划 |
| `academic_update_task` | 写入 | 完成/重开/修改预计时长；需可信宿主授权 |
| `academic_request_replan` | 运行控制 | 排队重规划请求；需可信宿主授权 + planner 能力 |
| `academic_list_sources` | 只读 | 列出数据库中的数据源与 engine |
| `academic_list_source_engines` | 只读 | 列出当前 Host 可用的通用 engine |
| `academic_probe_source` | 只读 | 用已保存会话读取授权页面（cookieDomains 或 probeAllowedHosts），返回脱敏结构证据 |
| `academic_create_source` | 写入 | 用已知 engine 与非敏感 config 创建数据源；需可信宿主授权 |
| `academic_update_source` | 写入 | 修改数据源配置；需可信宿主授权 |
| `academic_list_web_sessions` | 只读 | 列出已保存的网站会话元数据，不返回 Cookie |
| `academic_fetch_web_session` | 只读 | 用已保存会话访问同域 URL，返回响应正文但不返回 Cookie |
| `academic_validate_adapter_candidate` | 只读 | 用显式页面样本离线回放 Adapter Manifest |
| `academic_list_adapter_candidates` | 只读 | 列出候选 Adapter 与版本状态 |
| `academic_register_adapter_candidate` | 写入 | 保存已校验的候选 Manifest；需可信宿主授权 |
| `academic_activate_adapter_candidate` | 写入 | 启用 validated 版本；需可信宿主授权，可回滚 |
| `academic_preview_source_sync` | 只读 | 预览 declarative 源同步；需用户开启自动接入 |
| `academic_sync_source` | 写入 | 同步 declarative 源；需用户开启自动接入 |
| `academic_list_materials` | 只读 | 列出课程资料元数据 |
| `academic_search_materials` | 只读 | 检索本地资料片段，返回标题/页码，不返回全文 |
| `academic_import_material` | 写入 | 导入用户提供的文本或单个 URL；需可信宿主授权 |
| `academic_delete_material` | 写入 | 删除资料与索引，不影响学业事件；需可信宿主授权 |

工具只调用 `@academic/agent-tools` 的宿主无关工具层，最终仍走 Kernel Command API；不拼 SQL、不直接追加事件。

## 构建

```bash
npm run build:dsh
```

产物：`lib/host.js`、`lib/planner.js`、`lib/tools.js`（esbuild 打包，`@deepseek-ai/*` 与 `playwright-core` 保持 external）和 `migrations/`。DSH 运行时提供 `@deepseek-ai/cordis`、`@deepseek-ai/dsh-tools`。

## 安装到独立 profile

```bash
dsh academic --from-default-profile headless --dump-config
dsh plugin --profile academic add <path-to-repo>/packages/academic-dsh-plugin
dsh academic --dump-config   # 应出现 # == @academic/dsh-plugin
```

默认数据库：`$DSH_HOME/academic-agent/academic.db`（默认 `~/.dsh/academic-agent/academic.db`）。可用环境变量 `ACADEMIC_AGENT_DB` 覆盖：

```bash
ACADEMIC_AGENT_DB=<path-to-repo>/.data/dsh-academic.db dsh academic "列出我的课程"
```

## DSH 内部自测

不依赖模型即可验证真实 ToolRegistry 流水线：

```bash
ACADEMIC_AGENT_SELFTEST=1 \
ACADEMIC_AGENT_DB=<path-to-repo>/.data/dsh-academic.db \
dsh academic --json "hello"
```

预期（模型调用之前）：

```text
[academic-host] loaded db=<path-to-repo>/.data/dsh-academic.db
[academic-planner] capability registered
[academic-tools] tools=23 registered=true
[academic-tools] selftest readIsError=false readCourses=0 writeIsError=true writeError=FORBIDDEN: Agent write access is not enabled
```

模型自然语言调用需要 `DEEPSEEK_API_KEY` 或在 DSH Models 页面配置账号；本机 headless 未配置时会报 `MISSING_CREDENTIAL`，不影响上述工具自测。

## 配置

在 profile 的 `cordis.patch.yml` 覆盖行 config：

```yaml
- id: academic-agent
  config:
    databasePath: 'D:/path/to/academic.db'
    agentWrites: false
    startBackground: true
    logLoad: true
    selfTest: false
```

- `agentWrites`：仅表示部署是否允许 Agent 请求写入；默认 false。即使为 true，没有可信宿主授权适配器时仍会返回 `CONFIRM_REQUIRED`，不会产生领域事件。
- `startBackground`：启动通知/调度/重规划后台能力；headless 退出时定时器不会阻止进程结束。
- `selfTest`：加载时通过 DSH ToolRegistry 执行一次只读查询和一次被拒绝的写入。

## 凭据与连接

Host 创建 Connection Manager 与系统凭据库适配器（当前 Windows DPAPI）。Agent 工具**不接收** Connection Manager 或任何凭据访问能力；连接与 source 配置通过 CLI/UI 管理，Agent 写入必须由可信宿主逐次授权。秘密不进入 Agent Prompt、工具结果、SQLite 事件或日志。连接元数据与凭据存储共用 profile 数据库/用户目录，可用 `ACADEMIC_AGENT_DB` 指向同一数据库。

## 截止提醒

应用启动后会运行 `academic.reminders.scan`（每 15 分钟），默认在截止前 72h/24h 生成应用内提醒。提醒使用持久化 dedupe key，重复扫描或重启不会重发；阈值与开关保存于同一数据库，可通过 CLI 的 `reminders` 命令修改（设置 `ACADEMIC_AGENT_DB` 指向 profile 使用的数据库）。

## 默认学习任务与可用时间

- 新同步的学业事项会通过事件消费者自动创建一个默认 `StudyTask`（assignment 60 分钟、exam 120 分钟、quiz 30 分钟）；重复同步不会重复创建，用户修改的时长与完成状态不会被覆盖。
- Planner 使用持久化的可用时间：时区、每周可用时段、临时不可用、15 分钟默认粒度。首次使用会生成保守默认值（工作日 19:00-22:00，周末 09:00-12:00、14:00-18:00），可通过 CLI `availability` 命令修改。

## 边界

- 仅面向本地单用户；不包含 URL 自动发现、抓取脚本生成或自动安装插件。
- 未审查的插件代码与内核在同一 Node 进程，Cordis disposer 不是安全沙箱。
- 当前在 DSH `0.2.1-rc.3` 上验证；peer 范围 `>=0.2.0-rc.1 <0.3.0-0`。
