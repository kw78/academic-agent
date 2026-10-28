# MVP First 验收清单

基线日期：2026-10-28。执行基线：`doc/ACADEMIC_AGENT_ROADMAP_MVP_FIRST.md`。
本清单只记录实际执行结果；“未运行”和“需要真实账号”不会写成通过。

## Gate 0 — 真实基线

| 检查 | 命令 | 结果 |
|---|---|---|
| 类型检查 | `npm run typecheck` | 通过 |
| 全量测试 | `npm test` | 通过：35 个文件、183 项 |
| DSH 构建 | `npm run build:dsh` | 通过 |
| UI 构建 | `npm run build:ui` | 通过 |
| DSH 自测 | `ACADEMIC_AGENT_SELFTEST=1 ACADEMIC_AGENT_DB=.data/dsh-academic.db dsh academic --json "hello"` | 通过：host/planner/tools 加载，`tools=17 registered=true`，只读查询成功，未授权写入 `FORBIDDEN` |

## 安全 P0（SEC-001–004）

- **SEC-001 探测 JSON 原文**：`SourceProbeEvidence` 不再包含 `jsonPreview`；只返回字段名/类型/数组形状。含姓名、学号、邮箱、token 和课程名的 JSON 测试确认返回值中无这些值。
- **SEC-002 Manifest 授权范围**：Manifest 必须声明 `allowedPathPrefixes`；主机按精确匹配（不做隐式子域）；协议/端口来自 baseUrl；`safeFetch` 对初始、模板、分页、详情和重定向统一执行路径/主机策略。越权路径与子域在候选验证阶段被拒绝。
- **SEC-003 正则执行**：静态拒绝嵌套量词、含分支组的量词、环视、过大重复与连续无限通配；实际执行放入受限 `vm` 上下文，单次 100ms 超时、每页 500ms 预算；超时返回受控错误。
- **SEC-004 会话/Cookie 范围**：Web Session、browser-session、Blackboard 与 Manifest 均按精确主机校验；不再隐式把父域 Cookie 用于子域；Cookie 的 Domain/Path/Secure/Expiry 规则保留。
- 验证：`npm run typecheck`、183 项测试通过；新增越权路径/子域、敏感 JSON、恶意正则、子域 Cookie 回归样本。

## Gate 1 — 桌面端可启动、可操作

本轮实际执行：

- 用独立数据库 `.data/mvp-web.db` 启动 `academic-web` profile，确认 Academic Host、planner、tools（17 个）加载。
- 在真实 DSH Web UI 打开“学业”，显示“Host 已连接”；连接页显示快速添加平台、数据源状态、Adapter 候选、网站登录和同步记录。
- 在 UI 对 Fixture LMS 点击“立即同步”，Host 执行成功，课程 CS101 出现、同步记录成功（2 抓取/2 新增/0 更新）。
- 用真实 Blackboard 临时库 `.data/bb-m2-sync.db`（2 门课程/7 个作业）启动同一 Web profile：总览显示 9 个进行中任务、2 个近期截止、9 条未读提醒；任务页显示真实 HW1–HW7、来源链接、date-only 考试与 `unknown` 截止（HW4），并明确“本地完成状态不会冒充学校提交状态”。
- 此前已实测 Desktop profile 加载 UI/Host、创建默认数据库与 3 个后台作业、禁用/启用 UI 后入口恢复且不重复创建资源。

用户已在当前 Desktop 构建上手工检查基本启动、页面与数据展示，反馈“没什么问题”；同时要求把平台链接配置放到“连接”页最前面，已修复。
仍保留未验证项：Desktop 文件级 HMR、真实 Session 生命周期、禁用/启用插件后的资源计数专项复核。DSH Web 的 UI/Host 实测不能替代这些 Desktop 专项。

## Gate 2 — 登录与会话

已真实执行：

- Blackboard：应用管理浏览器登录，真实会话同步课程/作业/文件夹。
- USTC 综合教务：应用管理浏览器登录 `https://jw.ustc.edu.cn/login`，保存 4 个 Cookie；验证请求访问 `/home` 成功。
- 正式同步新增闸门：`authKind != none` 的连接必须处于 `connected` 状态；未验证会话调用同步会被拒绝（测试覆盖）。
- UI 在未验证时把同步按钮显示为“先验证连接”。
- 删除凭据/断开连接不会删除已同步学业数据（现有测试覆盖）。

## Gate 3 — 一个平台的数据同步闭环

Blackboard（真实账号）：

- 2026FA 13 门课程，5 门有内容区。
- 图论 7 个作业；模拟与数字电路A 2 个文件夹、9 个作业；文件夹遍历后 `full`。
- 截止时间从详情页正文解析；无截止日期保留 `unknown`。
- 重复同步 no-op；部分/失败保留旧数据。
- 考试/测验仅有 fixture 样本，UI 引擎说明与文档已标注“真实账号暂无测试项样本”。
- 真实 BB 数据已在 DSH Web UI 核对：课程/作业标题、来源链接、date-only 与 unknown 截止、同步降级状态、任务与提醒均正确显示。

USTC 教务（第二平台，Manifest）：

- 真实会话验证 `connected`。
- 注册/启用 Manifest 候选后自动创建 declarative 数据源。
- 预览 `create:1`，同步写入 1 门课程、1 个考试（2026-11-08 14:30，3C102）。
- 重复预览 `unchanged:1`，重复同步 `created:0 updated:0`。
- 只覆盖考试页；课表/成绩/作业未接入。

## Gate 4 — 任务与基本规划

- 同步后自动生成默认学习任务；用户修改预计时长/完成后不被同步覆盖（测试覆盖）。
- 任务完成/重开、计划候选确认/锁定、可用时间、提醒开关与去重均有测试与 UI。
- 真实 BB 临时库在 UI 中显示 9 个进行中任务、2 个近期截止、9 条未读提醒；任务页展示来源链接和本地状态说明，date-only 与未知截止没有被猜成确定时间。
- 常规同步、去重、提醒、基础规划不调用模型；Agent 只读取已保存数据。

## Gate 5 — Agent 候选流程

- 已真实跑通：应用登录 → 探测 → Agent 生成 Manifest → 离线回放 → UI 注册/启用 → 自动建源 → 真实同步。
- 探测工具只返回脱敏证据，不返回 Cookie、查询串或完整页面。
- 候选注册/启用需要用户操作/可信授权；同站点会话复制经过主机范围检查。
- 生成仍在 DSH 对话中触发，UI 已明确说明，不宣传为全自动。

## Gate 6 — 发布前回归

- 真实临时库走完首次同步、重复同步、认证失败、部分结果旧数据保留。
- 备份/恢复、迁移、重启、并发同步锁、重试与错误分类有自动化测试。
- 错误/UI/Agent 结果不包含 Cookie、Token、密码或带认证参数的 URL（测试覆盖）。
- README、运维、测试记录与本清单已更新。

## MVP 后推进（2026-10-28）

- Manifest：未知 `schemaVersion` 明确拒绝；字段类型转换/默认值/必需字段与结构退化诊断；`next`/页码/offset 分页与总字节上限；候选验证分阶段报告；候选访问范围/数据类型/字段在 UI 展示。
- 接入与诊断：Host 返回统一 `stage` 与唯一 `nextStep`；同步失败分类为认证/网络/权限/结构/质量并给出建议；探测证据包含 SHA-256 摘要。
- 偏好与复习：课程优先级持久化并作为计划第二排序依据；任务页按课程展示复习清单与带上下文 Agent 入口。
- 真实计划案例（Blackboard 临时库快照）：9 个任务中 3 个按时段安排、5 个截止已过被明确标为 `deadline-passed`、1 个未知截止无截止安排；date-only 考试按 Asia/Shanghai 日终处理。可用总时长与实际容量不足分开提示，截止已过不再误报为“时间不足”。
- 运维：恢复命令在独立目录执行 `integrity_check` 与投影一致性校验；1k/10k 事项基准已记录；旧库升级测试验证数据保留与新迁移生效；`sync_runs` 记录 Adapter ID/版本。
- 验证：`npm run typecheck`、`npm test`（35 文件/183 项）、`npm run build:dsh`、`npm run build:ui` 通过。新 UI 面板（阶段/诊断、候选范围、课程优先级、复习清单、编辑/删除/恢复入口）只完成类型检查、构建与 Host API 测试，未重新做浏览器点验。
- 个人数据编辑：课程编辑/归档/删除/恢复；来源事项归档/恢复；任务编辑/删除/恢复；数据源编辑/归档/恢复/彻底删除。课程、事项、任务删除均为事件软删除，投影重建可还原；数据源彻底删除只清理配置与凭据，不删除学业事件。详见 ADR 0012。

## 候选交接修复（2026-10-28）

- Agent 可暂存候选但无权激活；启用仍在 UI/CLI 由用户执行，并自动创建/更新 declarative 同步源、复制同站点会话；不需要重启 Host。
- `assignments.scope=source` 支持静态作业/考试列表只抓一次；`scope` 只能用于 assignments。
- UI 候选导入支持 JSON 文件；验证文案明确“样本回放，未做真实同步”。
- 真实功能验收仍需：启用 → 预览 → 同步 → 重复同步 no-op → UI 核对；在此之前只算候选可验证性通过。

## 仍未完成/未验证

- DSH Desktop 本轮手工复验（Gate 1/6）。
- Blackboard 真实考试/测验样本。
- Manifest XML、完整课表/成绩/作业、附件与提交历史。
- 通用 Agent 写审批弹窗、文件级 HMR 手工验收。
- 多页自动采样（G-03）与资料索引（H-05）保持 PARKED；H-03/H-04 仍为 PARTIAL（无持久化反馈与真实模型讲解验收），H-02 已完成真实案例评估。
