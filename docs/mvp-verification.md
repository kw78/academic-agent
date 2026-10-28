# MVP First 验收清单

基线日期：2026-10-28。执行基线：`doc/ACADEMIC_AGENT_ROADMAP_MVP_FIRST.md`。
本清单只记录实际执行结果；“未运行”和“需要真实账号”不会写成通过。

## Gate 0 — 真实基线

| 检查 | 命令 | 结果 |
|---|---|---|
| 类型检查 | `npm run typecheck` | 通过 |
| 全量测试 | `npm test` | 通过：31 个文件、156 项 |
| DSH 构建 | `npm run build:dsh` | 通过 |
| UI 构建 | `npm run build:ui` | 通过 |
| DSH 自测 | `ACADEMIC_AGENT_SELFTEST=1 ACADEMIC_AGENT_DB=.data/dsh-academic.db dsh academic --json "hello"` | 通过：host/planner/tools 加载，`tools=17 registered=true`，只读查询成功，未授权写入 `FORBIDDEN` |

## Gate 1 — 桌面端可启动、可操作

本轮实际执行：

- 用独立数据库 `.data/mvp-web.db` 启动 `academic-web` profile，确认 Academic Host、planner、tools（17 个）加载。
- 在真实 DSH Web UI 打开“学业”，显示“Host 已连接”；连接页显示快速添加平台、数据源状态、Adapter 候选、网站登录和同步记录。
- 在 UI 对 Fixture LMS 点击“立即同步”，Host 执行成功，课程 CS101 出现、同步记录成功（2 抓取/2 新增/0 更新）。
- 此前已实测 Desktop profile 加载 UI/Host、创建默认数据库与 3 个后台作业、禁用/启用 UI 后入口恢复且不重复创建资源。

未完成：**本轮未重复启动 DSH Desktop 手工验收**。CLI 无法启动 desktop profile（Electron 独占管理），且默认库可能被桌面占用；需要用户在桌面端执行一次“打开学业面板 → 刷新 → 禁用/启用插件”。DSH Web 的 UI/Host 实测不能替代 Desktop 验收。

用户已明确选择跳过本轮 Desktop 手工复核，因此该项按“未验证”保留，不标记为通过；此前 Desktop 实测记录仍可作为历史证据。

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

USTC 教务（第二平台，Manifest）：

- 真实会话验证 `connected`。
- 注册/启用 Manifest 候选后自动创建 declarative 数据源。
- 预览 `create:1`，同步写入 1 门课程、1 个考试（2026-11-08 14:30，3C102）。
- 重复预览 `unchanged:1`，重复同步 `created:0 updated:0`。
- 只覆盖考试页；课表/成绩/作业未接入。

## Gate 4 — 任务与基本规划

- 同步后自动生成默认学习任务；用户修改预计时长/完成后不被同步覆盖（测试覆盖）。
- 任务完成/重开、计划候选确认/锁定、可用时间、提醒开关与去重均有测试与 UI。
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

## 仍未完成/未验证

- DSH Desktop 本轮手工复验（Gate 1/6）。
- Blackboard 真实考试/测验样本。
- Manifest XML、完整课表/成绩/作业、附件与提交历史。
- 通用 Agent 写审批弹窗、文件级 HMR 手工验收。
