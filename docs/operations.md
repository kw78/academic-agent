# 运维与故障排查

## 1. 数据源接入流程

1. 在“连接”页“快速添加平台”填写 HTTPS 首页并选择类型（Blackboard 或通用网站）；engine 与 JSON 收在“高级”中。
2. 需要登录的 engine 选择 `browser` 登录方式；用户在 Edge/Chrome 中完成 SSO/验证码后，宿主把会话写入 DPAPI。
3. 点击“验证连接”，再点击“探测页面”查看脱敏证据与下一步提示。
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

- 备份：`ACADEMIC_DB=.data/academic.db npm run demo -- backup`，使用 SQLite `VACUUM INTO` 生成一致性快照。
- 恢复：停止 Host（桌面端退出，或确保没有第二个 Host 使用同一 DB）→ 备份当前 DB → 恢复快照 → 重新启动；启动时会校验事件位置并可重建投影。
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

- `samples.json` 是 `[{ "url": "https://...", "body": "..." }]`，必须覆盖 Manifest 会请求的每个 URL。
- 候选不会自动进入同步；只有显式启用的 validated 版本会被 `engine=declarative` 使用。UI 启用后会创建/更新 `adapter-<adapterId>` 数据源；若已有同站点浏览器会话，Host 在内部复制会话到新连接，成功响应不包含秘密。
- Agent 的 `academic_validate_adapter_candidate` 与 `academic_probe_source` 只读；注册/启用需要可信宿主逐次授权。CLI 操作用户或 UI 点击即授权者。
- 记录：候选报告与状态持久化，激活时间在 `adapter_active.activated_at`；旧 validated 版本可回滚。
- 当前只接受声明式 Manifest；不支持任意 JavaScript 生成/执行，因此没有候选代码进入主进程的路径。

## 6. 可观测性与日志

- 关注：最近成功同步、连续失败、`sync_runs` 错误码、Adapter warnings、未读提醒、投影位置。
- 日志/错误消息不得包含 Cookie、Token、Authorization 或带敏感查询参数的 URL；UI 与 Agent 工具已做 URL 脱敏。
- 诊断文件与数据库保留在本地 `.data/` 或 profile 目录；当前没有自动日志轮转，按需清理，保留期限由用户决定。

## 7. 性能基线

本机 Node `v22.23.2`、内存 SQLite、关闭 WAL 以外的额外调优，1000 个事项、单课程、完整快照：

| 操作 | 结果 |
|---|---|
| 首次同步（创建 1000 项） | 225 ms |
| 相同快照重复同步（no-op） | 220 ms |
| 查询 500 项（实际单页上限 200） | 1 ms |
| 重建核心投影 | 39 ms |

数字用于发现数量级回归，不是发布 SLA；真实平台耗时主要受页面数量和 `delayMs` 限制。长分页由 `maxContentPages` / `maxAssignments` 截断并标记 `partial`。

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
5. 用独立测试数据库运行 `ACADEMIC_AGENT_SELFTEST=1 dsh academic --json "hello"`，确认 17 个工具、只读查询与写入拒绝。
6. 桌面端重启后检查“学业”入口、Host 状态、后台作业与最近同步。

## 11. 已知限制

- DNS 解析结果已固定到实际连接；仍不支持显式 HTTP（需 `allowHttp`）与跨域 SSO 的细粒度域名授权。
- Blackboard 覆盖课程、作业、考试/测验与文件夹分页；当前账号没有真实测试项样本，考试/测验仍以 fixture 验证；附件、成绩、提交历史未覆盖。
- 声明式 Runtime 只支持 GET、CSS/JSON path 与 regex/trim；XPath、复杂字段转换与任意脚本沙箱未实现。
- 候选生成由 DSH Agent 完成，Host 不直接调用模型；样本需显式提供，未实现多页自动采样。
- 第二个平台（USTC 教务）目前只覆盖考试表；课表/选课接口为内嵌 XML 或需额外参数，Manifest 不支持 XML，成绩与作业未接入。
- DSH 候选审批在“连接”页完成；Agent 的注册/启用工具仍需要可信宿主逐次授权，没有通用审批弹窗或文件级 HMR 验收。
- 本机 Desktop 占用默认数据库时，不应再启动使用同一数据库的第二个 Host。
