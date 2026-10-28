# 运维与故障排查

## 1. 数据源接入流程

1. 在“连接”页“快速添加平台”填写 HTTPS 首页；新平台优先选择“通用网站”，Blackboard 专用引擎只作为旧版兼容选项；engine 与 JSON 收在“高级”中。
2. 需要登录的 engine 选择 `browser` 登录方式；用户在 Edge/Chrome 中完成 SSO/验证码后，宿主把会话写入 DPAPI。若打开的是门户首页且该 URL 本身已匹配“已认证”规则（如 `i.ustc.edu.cn`），登录窗口不会自动关闭：完成登录后点击右上角“已完成登录，保存会话”，宿主校验通过后才保存。
3. 点击“验证连接”，再点击“探测页面”查看脱敏证据与下一步提示。探测默认读取配置的 portal/verify URL；Agent 可用 `academic_probe_source` 的可选 `url` 继续探测同一主机内的脚本、分页链接或候选接口，并查看表格表头/class 与容器 class，每次仍重新校验主机、协议与安全抓取限制。
4. 对 Blackboard 直接“预览同步”；对通用网站先在 DSH 对话中让 Agent 用 `academic_probe_source` 生成 Manifest 候选，再到“Adapter 候选”面板验证、启用。
5. 点击“预览同步”，确认新增/更新/未变/未返回/跳过数量和警告。
6. 确认后点击“立即同步”；同步经 Adapter → Schema/标准化 → Connector → Kernel → Event Store。

Blackboard 的配置示例、限制和真实页面结构见 [real-sources.md](real-sources.md)。声明式 Manifest 的示例见 `fixtures/declarative/`，候选流程见下文。

## 2. 同步状态与错误

| 状态/错误 | 含义 | 处理 |
|---|---|---|
| `success` | 全部读取并写入/无变化 | 无需操作 |
| `partial` | 部分页面失败、分页/数量达到上限 | 查看 warnings；旧数据保留；缩小范围或补样本 |
| `auth-required` | 会话过期或被平台拒绝 | 重新登录；不要无限重试 |
| `failed` + `TRANSIENT` | 超时、网络、429/5xx 重试后仍失败 | 检查网络/平台状态后重新同步 |
| `CONFLICT` | 同一 source 已有同步在运行 | 等待当前同步结束 |
| `CAPABILITY_UNAVAILABLE` | engine/Adapter/planner 未加载 | 检查插件与 source 配置 |

同步运行记录写入 `sync_runs`；失败不会清空已有学业数据。Adapter 对 5xx/429/超时会做一次有限重试，认证失败不重试。手动快速重复点击由 Host 的同源并发锁拒绝（`Sync already running`）。

## 3. 备份、恢复与迁移

- 备份：`ACADEMIC_DB=.data/academic.db npm run demo -- backup [target.db]`，使用 SQLite `VACUUM INTO` 生成一致性快照。
- 恢复：`npm run demo -- restore <backup.db> <target.db>`。目标文件必须不存在；命令复制快照后打开新数据库，执行 `PRAGMA integrity_check`，校验事件位置与投影位置一致，任一失败即报错退出。
- 恢复演练（2026-10-28，本机）：fixture 数据源生成 2 个事项/2 个任务/2 条提醒后备份，恢复到独立文件 `.data/drill-restored-20261028.db`，结果 `integrity=ok · events=6 · projection=6 · consistent=true`；用 `list` 重新读取到相同事项、任务与提醒。
- 恢复后先确认没有第二个 Host 使用目标数据库，再用目标路径启动；桌面端同时只能有一个 Host 使用默认数据库。
- 迁移：`migrations/*.sql` 按编号执行；`0010_adapter_candidates.sql` 增加 Adapter 候选/激活表。升级前先备份，迁移后运行 `npm run typecheck` 与 `npm test`。
- 不要在活跃写入时直接复制 SQLite 文件；不要同时启动两个使用同一 DB 的 Academic Host。

## 4. 会话与凭据

- Cookie/Token 只在 DPAPI；SQLite/事件/日志/Agent 结果中不出现明文。
- 删除网站会话或连接凭据不会删除已同步的学业事件。
- 会话过期：重新登录即可；旧会话不会自动续期。
- 诊断 HTML 放在 `.data/`，查看后删除；不要把 Cookie 粘贴到聊天、Issue 或远端工具。

## 5. Adapter 候选生命周期

```bash
# 离线校验：不联网，不执行生成代码
ACADEMIC_DB=.data/academic.db npm run demo -- adapter validate manifest.json samples.json

# 保存候选（报告失败也可保存为 candidate，但不可启用）
ACADEMIC_DB=.data/academic.db npm run demo -- adapter register manifest.json samples.json

# 只允许 validated 版本启用；旧版本保留用于回滚
ACADEMIC_DB=.data/academic.db npm run demo -- adapter activate <adapterId> <version>
ACADEMIC_DB=.data/academic.db npm run demo -- adapter rollback <adapterId> [version]
ACADEMIC_DB=.data/academic.db npm run demo -- adapter list
```

- `samples.json` 是 `[{ "url": "https://...", "body": "..." }]`，必须覆盖 Manifest 会请求的每个 URL。Agent 也可以对真实页面调用 `academic_probe_source` 并传 `capture=true`，宿主把原始响应保存在内存（60 分钟 TTL、按 URL 复用、最多 30 个），只把 `sampleId` 返回给 Agent；随后用 `sampleIds` 调用验证，原始 body 不进入模型上下文。合成 HTML 只能用于开发测试，不能用于验收。
- 探测限速：每个来源最多 3 次/分钟，按 20 秒间隔执行，不做连续突发；过早请求会立即返回“约 N 秒后再试”，不会把工具调用阻塞到 30 秒超时。429/403/登录页/验证码立即停止，不自动重试；相同 URL 的捕获样本在 TTL 内复用，避免重复抓取。测试环境可通过 `probeMinIntervalMs: 0` 关闭间隔。
- 新建数据库的内置同步任务默认 60 分钟；已有数据库保持原周期，需在设置页调整。提醒扫描仍是本地确定性操作，不访问外部站点。
- 候选不会自动进入同步；只有显式启用的 validated 版本会被 `engine=declarative` 使用。UI 或 CLI 启用后会创建/更新 `adapter-<adapterId>` 数据源，名称为 `<Manifest 显示名>（同步）`；原浏览器登录源保留用于重新登录/验证，UI 卡片分别标记“同步源/登录源”。若已有同站点浏览器会话，Host 在内部复制会话到新连接，成功响应不包含秘密。启用不需要重启 Host：候选表里的 Manifest 会在激活时重新注册；旧版本同名同步源会在启动时自动补上“（同步）”后缀。
- Agent 的 `academic_validate_adapter_candidate`、`academic_probe_source` 只读；`academic_register_adapter_candidate` 只暂存候选，不需要写权限，但不会激活或建源；`academic_activate_adapter_candidate` 默认仍需可信宿主逐次授权。CLI 操作用户或 UI 点击即授权者。
- **Agent 自动接入**：设置页可开启默认关闭的 `agent_adapter_automation`。开启后 `academic_activate_adapter_candidate` 不再逐次弹窗，并可用 `academic_preview_source_sync`、`academic_sync_source` 预览/同步 **declarative** 源；同步经 Connector → Kernel，模型不接触会话秘密。关闭后恢复逐次审核。该开关不允许未验证候选、非 declarative 源、任务修改或学校平台操作。
- 同步路径白名单来自 Manifest 的 `allowedPathPrefixes`，不是数据源配置；`probePathPrefixes` 只限制探测。不要把“扩大来源路径”误当成启用候选的前提。
- `assignments.scope=source` 表示作业/考试列表只请求一次，按行内 `courseExternalId` 归属课程；默认 `course` 仍然按课程逐个请求。静态 URL 的平台应使用 `source`，避免按课程重复抓取。
- 记录：候选报告与状态持久化，激活时间在 `adapter_active.activated_at`；旧 validated 版本可回滚。
- 当前只接受声明式 Manifest；不支持任意 JavaScript 生成/执行，因此没有候选代码进入主进程的路径。

## 6. 可观测性与日志

- 关注：最近成功同步、连续失败、`sync_runs` 错误码、Adapter warnings、未读提醒、投影位置。
- 日志/错误消息不得包含 Cookie、Token、Authorization 或带敏感查询参数的 URL；UI 与 Agent 工具已做 URL 脱敏。
- 诊断文件与数据库保留在本地 `.data/` 或 profile 目录；当前没有自动日志轮转，按需清理，保留期限由用户决定。

## 7. 性能基线

`npm run benchmark` 在本机 Node `v24.18.0`、内存 SQLite、单课程、完整快照上执行；数字用于发现数量级回归，不是发布 SLA。2026-10-28 实测：

| 事项数 | 首次同步 | 重复同步（no-op） | 查询单页 200 | 分页读取全部 | 重建核心投影 |
|---|---|---|---|---|---|
| 1,000 | 210 ms | 217 ms | 1 ms | 6 ms | 41 ms |
| 10,000 | 1,927 ms | 2,080 ms | 6 ms | 197 ms | 446 ms |

首次同步会为每个事项写入事件与默认任务；重复同步是 no-op。真实平台耗时主要受页面数量和 `delayMs` 限制；长分页由 `maxContentPages` / `maxAssignments` 截断并标记 `partial`。当前查询单页上限为 200，读取全量需要按 `nextCursor` 翻页。

## 8. 诊断文件与保留策略

- 诊断 HTML、探测输出和临时数据库只放在 `.data/` 或 profile 的 `academic-agent/` 下，不进入仓库。
- 建议保留期限：探测/调试输出 7 天；备份 30 天；`sync_runs` 与事件数据长期保留（由用户主动删除）。
- 当前不自动轮转。清理示例（先确认目录内容，再执行；不要删除 `*.db`）：

```bash
find .data -maxdepth 2 -type f \( -name '*.html' -o -name '*.log' -o -name '*.txt' \) -mtime +7 -print
find .data -maxdepth 2 -type f \( -name '*.html' -o -name '*.log' -o -name '*.txt' \) -mtime +7 -delete
```

- 备份文件超过保留期后由用户确认删除；删除前确认至少有一份可恢复快照。

## 9. 数据删除

- 删除网站会话/连接凭据：只删除 DPAPI 中的秘密，不删除已同步的课程、事项、任务与计划。
- 归档数据源：停止调度与同步，保留历史学业数据。
- 删除全部本地数据：退出 Host/桌面端，备份后删除 `$DSH_HOME/academic-agent/academic.db` 与凭据目录 `%LOCALAPPDATA%\\AcademicAgent\\vault`；此操作不可恢复。
- 删除单个事项/课程请通过领域命令或后续 UI 提供；不得直接改 SQLite 业务表。

## 10. 升级检查清单

1. 备份数据库与 profile 配置。
2. 固定/核对 DSH 版本（当前验证 `0.2.1-rc.3`）。
3. `npm install` → `npm run typecheck` → `npm test`。
4. `npm run build:dsh`、`npm run build:ui`；确认 `migrations/` 已复制到插件产物。
5. 用独立测试数据库运行 `ACADEMIC_AGENT_SELFTEST=1 dsh academic --json "hello"`，确认 23 个工具、只读查询与写入拒绝。
6. 桌面端重启后检查“学业”入口、Host 状态、后台作业与最近同步。

## 11. 已知限制

- DNS 解析结果已固定到实际连接；仍不支持显式 HTTP（需 `allowHttp`）与跨域 SSO 的细粒度域名授权。
- Blackboard 覆盖课程、作业、考试/测验与文件夹分页；当前账号没有真实测试项样本，考试/测验仍以 fixture 验证；附件、成绩、提交历史未覆盖。
- 声明式 Runtime 只支持 GET、CSS/JSON path、常量/模板、类型转换与默认值、`next`/页码/offset 分页；XPath、XML、POST/登录交互与任意脚本沙箱未实现。每次分页都会重新校验主机/协议/端口/路径，并受总请求数、总行数、总字节与总时长限制。
- 候选生成由 DSH Agent 完成，Host 不直接调用模型；样本需显式提供，未实现多页自动采样。候选验证按 schema、字段契约、访问范围、样本回放分阶段报告；真实数据预检仍需用户执行预览。
- 第二个平台（USTC 教务）目前只覆盖考试表；课表/选课接口为内嵌 XML 或需额外参数，Manifest 不支持 XML，成绩与作业未接入。
- DSH 候选审批在“连接”页完成；Agent 的注册/启用工具仍需要可信宿主逐次授权，没有通用审批弹窗或文件级 HMR 验收。
- 本机 Desktop 占用默认数据库时，不应再启动使用同一数据库的第二个 Host。
