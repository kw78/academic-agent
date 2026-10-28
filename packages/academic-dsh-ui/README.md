# @academic/dsh-ui

Academic Agent 的 DSH 客户端界面与 Host Remote API 适配层。

- 一个客户端 UI 插件，同时用于 DSH Desktop 与 DSH Web；
- 侧边栏注册“学业”入口，主面板提供总览、任务、计划、连接、资料、自动化与设置；
- UI 只通过 Query API 读取事实、通过 Command API 提交业务变更；
- 不访问 SQLite、Event Store、核心投影、Scheduler 表或 Credential Vault；
- 不保存密码、Token、Cookie 或凭据引用到浏览器存储。

## 页面

| 页面 | 内容 |
|---|---|
| 总览 | 今日任务、近期截止、今日计划、未读提醒、来源变化、同步健康与数据源状态 |
| 任务 | 学习任务与来源事项分开显示；筛选、完成/重开、预计时长、来源链接、Agent 入口 |
| 计划 | 候选/确认计划区分、日/周/列表分组、锁定/解锁、未安排原因、归档 |
| 连接 | 课程管理、连接状态、Adapter 可用性、同步记录；仅对已实现 Adapter 展示认证表单 |
| 资料 | 资料统计、导入（文件/文本/URL）、检索、删除、索引重建、授权附件导入与自动导入许可 |
| 自动化 | 同步/重算/提醒作业启停、运行记录、同步记录、通知已读、提醒阈值 |
| 设置 | 时区、每周可用时间、临时不可用、计划粒度、同步周期、课程维护（合并同名课程）、界面偏好 |

## 状态与安全

- 明确区分 Loading、Empty、Ready、Stale、Degraded、Auth Required、Conflict、Unavailable、Error；
- 查询失败保留最后一次有效数据并显示时间，不把失败伪装成空数据；
- “已保存凭据”只显示为“已保存凭据，未验证”，不会显示“已连接”；
- 数据源从数据库 source 表读取；通用 engine 提供登录/验证/同步，UI 不认识具体学校。browser-session engine 拉起 Edge/Chrome，用户完成登录后由宿主读取会话 Cookie 写入 DPAPI，不读取密码。
- 只有真实 Adapter 可用时才展示认证表单；没有实现真实平台 Adapter 时明确标记不可用；
- 凭据输入框提交前清空 React 状态，使用 `type="password"`，不写入 URL、浏览器存储、日志或 Agent Prompt；
- 浏览器本地仅保存非敏感 UI 偏好（当前页面）。

## DSH 集成

包内 `dsh.client` 声明 `platform: "web"`、`exports["./client"]` 和服务端入口 `lib/host.js`。Host 入口：

- 注入 `academicApp` 服务；
- 注册 `AcademicUiService extends TypertRemoteService`，命名空间 `academic`；
- 通过标准 `@Remote` 标记暴露 40+ 个方法，由 DSH 0.2.1-rc.3 的 SRC fallback 调用；
- 不创建第二份 Academic Runtime；卸载 UI 只移除界面和该 Remote 服务。

构建：

```bash
npm run build:ui
```

产物：

- `lib/host.js`：Host Remote 服务（`@deepseek-ai/cordis`、`@deepseek-ai/dsh-typert-protocol` external）；
- `lib/client.js`：以 `window.__ModuleLoader__.load({ id, factory })` 包装的浏览器 bundle，`react` / `react/jsx-runtime` external。

安装到 DSH Web profile（示例）：

```bash
dsh plugin --profile academic-web add \
  <path-to-repo>/packages/academic-dsh-plugin \
  <path-to-repo>/packages/academic-dsh-ui
```

profile 需要包含 `@deepseek-ai/dsh-web-app` bundle（与 DSH `web` profile 一致），然后：

```bash
ACADEMIC_AGENT_DB=<path-to-repo>/.data/dsh-ui-test.db \
  dsh --profile academic-web --no-open --port 0
```

安装到 DSH Desktop：

```bash
dsh plugin --profile desktop add \
  <path-to-repo>/packages/academic-dsh-plugin \
  <path-to-repo>/packages/academic-dsh-ui
```

并在 `~/.dsh/profiles/desktop/package.json` 的 `dsh.profile.bundles` 中加入
`@academic/dsh-plugin` 与 `@academic/dsh-ui`，然后重启桌面端。桌面端默认使用
`$DSH_HOME/academic-agent/academic.db`；`dsh --profile desktop --dump-config` 会被
Electron 拒绝，需通过桌面进程验证。

## 已验证

在 DSH `0.2.1-rc.3` Web profile 中实测：

- 侧边栏出现“学业”，主面板加载真实 SQLite 课程数据；
- 任务完成、计划候选确认、锁定时段、可用时间保存、作业暂停/恢复、提醒已读均经 Host API 生效；
- 通过 Plugins 页面禁用 `@academic/dsh-ui` 后入口消失，Host/Planner/Tools 与后台作业继续运行；
- 重新启用后入口恢复，`scheduled_jobs`、课程与事件数量不重复。

未验证：真实 LMS Adapter 的认证表单与验证（当前无真实 Adapter）、系统通知、移动端专用布局。
