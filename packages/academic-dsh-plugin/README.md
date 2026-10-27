# @academic/dsh-plugin

DSH（DeepSeek Harness）bundle，把 Academic Agent 的 6 个最小工具暴露给模型。默认只读；任务写入需要 profile 配置 `agentWrites: true`，并且工具调用必须显式 `confirmed: true`。

## 工具

| 工具 | 类型 | 说明 |
|---|---|---|
| `academic_list_courses` | 只读 | 列出课程 |
| `academic_list_due_items` | 只读 | 按截止时间列出学业事项 |
| `academic_get_item` | 只读 | 按内部 ID 取事项 |
| `academic_get_study_plan` | 只读 | 取与时间范围重叠的生效计划 |
| `academic_update_task` | 写入 | 完成/重开/修改预计时长；需授权 + 确认 |
| `academic_request_replan` | 运行控制 | 排队重规划请求；需 planner 能力 |

工具只调用 `@academic/agent-tools` 的宿主无关工具层，最终仍走 Kernel Command API；不拼 SQL、不直接追加事件。

## 构建

```bash
npm run build:dsh
```

产物：`lib/index.js`（esbuild 打包，`@deepseek-ai/*` 保持 external）和 `migrations/`。DSH 运行时提供 `@deepseek-ai/cordis`、`@deepseek-ai/dsh-tools`。

## 安装到独立 profile

```bash
dsh academic --from-default-profile headless --dump-config
dsh plugin --profile academic add D:/project/classhelper/packages/academic-dsh-plugin
dsh academic --dump-config   # 应出现 # == @academic/dsh-plugin
```

默认数据库：`$DSH_HOME/academic-agent/academic.db`（默认 `~/.dsh/academic-agent/academic.db`）。可用环境变量 `ACADEMIC_AGENT_DB` 覆盖：

```bash
ACADEMIC_AGENT_DB=D:/project/classhelper/.data/dsh-academic.db dsh academic "列出我的课程"
```

## DSH 内部自测

不依赖模型即可验证真实 ToolRegistry 流水线：

```bash
ACADEMIC_AGENT_SELFTEST=1 \
ACADEMIC_AGENT_DB=D:/project/classhelper/.data/dsh-academic.db \
dsh academic --json "hello"
```

预期（模型调用之前）：

```text
[academic-agent] loaded ... tools=6 registered=true courses=1 items=1
[academic-agent] selftest readIsError=false readCourses=1 writeIsError=true writeError=FORBIDDEN: Agent write access is not enabled
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

- `agentWrites`：默认 false；为 true 时仍要求工具参数 `confirmed: true`。
- `startBackground`：启动通知/调度/重规划后台能力；headless 退出时定时器不会阻止进程结束。
- `selfTest`：加载时通过 DSH ToolRegistry 执行一次只读查询和一次被拒绝的写入。

## 边界

- 仅面向本地单用户；不包含 URL 自动发现、抓取脚本生成或自动安装插件。
- 未审查的插件代码与内核在同一 Node 进程，Cordis disposer 不是安全沙箱。
- 当前在 DSH `0.2.1-rc.3` 上验证；peer 范围 `>=0.2.0-rc.1 <0.3.0-0`。
