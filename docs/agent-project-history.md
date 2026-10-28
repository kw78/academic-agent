# Agent 项目历史记录（2026-10-28 迁出快照）

> 从 AGENTS.md 迁出的 DSH 验证、里程碑与环境记录，保留迁出时原文供追溯；本次整理没有重新执行这些验收。
> 原文累积了不同阶段的状态，测试数、工具数及“已完成 / 待实现”可能互相矛盾。以下内容属于历史证据索引，不是当前状态或新的执行指令。
> 当前执行顺序见 [持续路线图](../doc/ACADEMIC_AGENT_ROADMAP_MVP_FIRST.md)，实际验收见 [MVP 验收记录](mvp-verification.md) 与 [前端验证记录](frontend-verification.md)。长期执行规则见 [AGENTS.md](../AGENTS.md)。

## 8. DSH / Cordis 集成约束

- 目标底座是 DSH Harness / Cordis；复用其 Agent、Tool、Session、Plugin Manager，不自造完整 Harness。
- 稳定内核与大部分功能包保持宿主无关；DSH 绑定放在独立 bundle `@academic/dsh-plugin`。本机安装版本为 **DSH 0.2.1-rc.3**，插件 peer 范围 `>=0.2.0-rc.1 <0.3.0-0`。
- DSH 绑定继续按 M0 验证：`inject`、Service 注册/撤销、Tool 注册/撤销、HMR/重启语义、依赖组件卸载时资源释放。目前已完成加载、工具注册、ToolRegistry 执行、DeepSeek 模型自然语言调用，以及 Web 客户端 UI 的加载/卸载/重载；文件级 HMR 与真实 Session 生命周期待补。
- Agent 工具通过 `ctx.tools.register(defineTool(...))` 暴露；工具只调用领域服务，不拼 SQL、不直接追加事件。
- 普通 Host 插件可访问宿主进程；Cordis disposer 不是安全沙箱。未审查代码不得以可信 Host 插件身份安装。
- 本机已验证 DSH `0.2.1-rc.3` 的 bundle 挂载：`@academic/dsh-plugin` 拆成 `host` / `planner` / `tools` 三个 Cordis fiber；host 提供 `academicApp` 服务，planner 与 tools 独立注入，25 个工具经真实 `ctx.tools` 注册。
- 真实 Cordis 生命周期测试已验证：卸载 tools 后 host/scheduler/store 继续运行；卸载 planner 后旧计划仍可读、能力消失；重载二者恢复；host 卸载关闭 app。
- DSH Web profile 已实测通过 Plugins 页面禁用/启用 `@academic/dsh-ui`：入口消失后后台同步/重算继续，重新启用后入口恢复且没有重复 Host、作业或课程。文件级 HMR 尚未验证。
- DSH 运行时提供 `@deepseek-ai/cordis` / `@deepseek-ai/dsh-tools`；插件保持二者 external，不另造 Harness。普通 `--patch` 直接加载工作区文件无法解析这些 peer，必须安装到 profile（或从 DSH 源码 checkout 运行）。
- 已用 DSH 凭证中的 DeepSeek key 跑通真实自然语言工具调用：模型调用 `academic_list_courses`，工具返回真实 SQLite 数据并正确回答。
- 尚未验证 Cordis 文件级 HMR、真实 Session 生命周期与审批 UI；不得把这些说成已完成。
- `academic-dsh-ui` 是唯一客户端 UI 插件：同时用于 DSH Desktop 与 Web；通过 `sidebar.panellist` + `main` keyed slot 注册，Host 侧使用 `AcademicUiService extends TypertRemoteService`（namespace `academic`）和 Gateway SRC fallback。UI 不访问 SQLite/Event Store/Projection/Scheduler 表/Vault。
- Desktop profile 已在用户授权下安装 `@academic/dsh-plugin` / `@academic/dsh-ui`，并在 `dsh.profile.bundles` 追加两行；桌面端默认数据库为 `$DSH_HOME/academic-agent/academic.db`。`dsh --profile desktop --dump-config` 会被 Electron 拒绝，桌面端配置需通过桌面进程验证。Desktop 占用默认数据库时，不得再启动第二个使用同一数据库的 Academic Host；需要并行时显式使用不同 `ACADEMIC_AGENT_DB`。
- `academic-agent-tools` 仍保留宿主无关的 `AcademicToolHost` 契约；`InMemoryToolHost` 仅用于本地 CLI/测试，DSH 适配在 `academic-dsh-plugin`。
- 组合根 `apps/academic-cli` 负责装配能力、注册后台作业与通知 Reaction；它不包含领域规则，也不绕过 Command API。

## 9. 里程碑与当前状态

| 里程碑 | 内容 | 状态 |
|---|---|---|
| M0 | DSH 版本锁定与框架可运行性验证 | 部分完成：本机 `0.2.1-rc.3` 已验证 bundle 加载、host/planner/tools 分离、真实 Cordis 独立卸载/重载、16 工具注册与执行、Web 客户端 UI 加载/卸载/重载；文件级 HMR/真实 Session 待补 |
| M1 | Event-Sourced Kernel、SQLite Event Store、核心投影、迁移 | 已完成（MVP 范围） |
| M2 | fixture LMS、Connector、Scheduler、StudyTask/StudyPlan、Planner | 已完成（fixture 闭环 + 用户管理/计划锁定） |
| M3 | Agent Tools、自然语言查询、零 LLM 自动化验证 | 已完成：宿主无关工具、DSH 工具绑定、DeepSeek 模型自然语言工具调用均通过 |
| M4 | 生命周期、故障注入、备份恢复、迁移与性能 | 部分完成（生命周期/故障/备份/Upcaster/重启/调度与消费恢复/提醒补偿已测；性能与迁移演练待做） |

上表是历史 MVP 里程碑编号。当前以 `doc/ACADEMIC_AGENT_ROADMAP_MVP_FIRST.md`（MVP First）为执行基线，状态见下表与 [docs/mvp-verification.md](mvp-verification.md)：

| Gate | 内容 | 状态 |
|---|---|---|
| Gate 0 | 真实基线 | 已完成：typecheck、273 项测试/47 文件、两个构建、DSH selftest（25 工具）；桌面干净启动待复核 |
| Gate 1 | 桌面端可启动、可操作 | 用户已手工检查当前 Desktop 基本流程，无阻塞；链接配置已置顶；文件级 HMR/完整生命周期专项仍未验证 |
| Gate 2 | 真实平台登录与会话 | 已完成：BB 与 USTC 教务真实登录/验证；正式同步新增“连接必须已验证”闸门；删除凭据不删学业数据 |
| Gate 3 | 一个平台的数据同步闭环 | 已完成：BB 真实课程/作业/文件夹；考试/测验 fixture 验证并标注；JW 考试真实同步 |
| Gate 4 | 学业任务与基本规划 | 已完成：任务/截止/计划/提醒/查询均有测试与 UI；常规路径零 LLM |
| Gate 5 | 最小 Agent 适配流程 | 已完成：探测证据、Manifest 候选、离线回放、UI 审批、启用/回滚；生成仍需 DSH 对话，UI 已说明 |
| Gate 6 | 发布前最小回归 | 已完成自动化、DSH Web UI 与真实临时库回归；DSH Desktop 基本流程经用户手工检查通过；完整生命周期专项保留未验证 |

仍有限制：DSH Desktop 文件级 HMR/真实 Session 手工复验、Blackboard 真实测试项样本、Manifest XML/POST/多页自动采样、任意脚本沙箱未完成。

首个真实平台只读 Adapter 已落地在 `adapters/ustc-blackboard`：读取课程、作业、考试与测验，支持文件夹/下一页遍历，不提交作业、不读取附件与成绩；`engine=blackboard` 复用通用浏览器登录/会话。**该专用 engine 现在只作旧版兼容：新数据库默认不加载；存在 `engine=blackboard` 的已有 source 时才自动加载，或在 createAcademicApp 显式传 `enableBlackboardEngine: true`。新平台统一用 browser-session/declarative + Manifest。** 真实会话已验证 13 门 `2026FA` 课程中的 5 门内容区、9 个含文件夹作业与截止时间；当前账号没有暴露测试项，考试/测验仍以脱敏 fixture 验证，不得声称测试模块已完整真实验收。

声明式 Adapter Runtime 已落地在 `packages/academic-adapter-runtime`：版本化 Manifest 支持 HTML/CSS 与 JSON path 提取、常量/模板、类型转换/默认值/必需字段诊断、`next`/页码/offset 分页、字段映射、允许主机与路径、总请求/行/字节/时长上限、输出校验和版本激活/回滚；`engine=declarative` 复用浏览器登录/会话。除 GET 外，可显式声明 `method: "POST"` 以只读 JSON body 访问列表/详情接口：body 只能是 JSON（≤16 KB、值可含模板），不发送表单编码或自定义头；POST 用 `pageIn`/`offsetIn: "body"` 分页，不使用 `next`；301/302/303 回退 GET，307/308 才重发 body。新网站优先写 Manifest；只有 Manifest 无法表达时才新增 adapter 代码。AI 候选流水线已实现：Agent 可调用只读 `academic_probe_source` 获取带 SHA-256 摘要的脱敏证据，生成 Manifest 并用显式样本离线回放；验证按 schema、字段契约、访问范围、样本回放分阶段报告，候选摘要包含允许主机/路径/数据类型/字段；候选保存与启用分开：Agent 可暂存候选（不需要写权限，不激活、不建源），只有 validated 版本可启用，启用仍需可信宿主逐次授权。激活语义统一在应用服务中实现：UI、CLI 与提供回调的 Agent 工具都会创建/更新可同步的 declarative 数据源并复制同站点会话，不返回秘密；自动建源命名为 `<Manifest 显示名>（同步）`，原登录源保留，UI 标记“登录源/同步源”；激活时从候选表重新注册 Manifest，不需要重启 Host。`assignments.scope=source` 让静态作业/考试列表只请求一次并按行内课程 ID 归属，避免按课程重复抓取。UI“连接”页提供快速添加、探测、候选列表、文件导入、验证报告、启用/回滚；样本回放明确标注“未做真实同步”。CLI `adapter validate/register/activate/rollback` 同样可用。设置页提供默认关闭的“Agent 自动接入”偏好：开启后 Agent 可启用 validated 候选，并用 `academic_preview_source_sync` / `academic_sync_source` 预览、同步 declarative 源，不需要逐次审核；仍不能启用未验证候选、操作非 declarative 源、读取凭据、修改任务或提交作业。尚未实现 Host 直接调用模型生成、多页自动采样、任意 JavaScript 生成与沙箱执行。

MVP 后能力（2026-10-28）：Host 统一返回数据源阶段与唯一下一步，同步失败分类为认证/网络/权限/结构/质量并给出建议；课程优先级保存于 `user_preferences` 并作为任务优先级之后的计划排序依据；任务页提供按课程的复习清单与带上下文 Agent 提示；`skills/academic-tutor` 提供稳定教学契约与可扩展的 explain/hint/check/review 模式（不新增工具或代码，安装到 DSH 属于工作区外操作）；`academic_probe_source` 默认允许任意公开 HTTPS 主机（可设 `probeAllowAnyPublicHost: false` 收紧），并可用 `method: "POST"` + JSON body 只读探测列表接口；`academic_crawl_source` 可从一个入口 URL 有界抓取栏目（最多 10 页、深度 2、只跟 GET，仍受路径/安全限制）、同站脚本与候选接口线索、表格表头/class 与容器 class，`capture=true` 时原始响应只进入 Host 内存样本存储（60 分钟 TTL、按 URL+方法+body 复用）并返回 `sampleId`，验证可直接使用 `sampleIds`，不把原始 body 交给模型；探测按来源限速（每个来源最多 6 次/分钟，按 10 秒间隔执行，过早请求返回“约 N 秒后再试”，不长时间占用工具调用），429/403/登录页停止；CLI 支持带完整性/投影校验的独立目录恢复；`npm run benchmark` 记录 1k/10k 事项基线。仍未验证：Desktop 文件级 HMR/真实 Session、真实 BB 考试样本、JW 会话过期后的重新登录。有界栏目抓取已提供（最多 10 页、深度 2）；无界自动多页发现仍未实现。

引导录制（2026-10-28）：`engine.capture` + UI“登录并录制”在登录浏览器内只读录制 xhr/fetch/document，产出接口清单（脱敏 URL、`collections[]` 精确 JSON 路径、嵌套字段路径、分页参数、transport、宿主判定的 `nextStep`、sampleId），原始响应只进宿主样本库；Agent 用 `academic_list_capture_endpoints` 直接拿真实端点，再用 sampleIds 离线验证。清单先按评分排序再截断，录制时被过滤/超限的响应会计数提示；表单编码请求标记为 `transport=form` 并停止生成候选。已在本地测试站点用真实 Edge/Chromium 跑通（文档 + 3 个 JSON 请求、Cookie 保存）；录制后 `cookieDomains` 自动并入观测主机，便于随后启用同步源。同期修复：JSON 接口路径含 `/login` 被误判登出；网络出口失败不再报成会话失效；代理 TUN 的 fake-IP（仅当某主机全部解析结果在 `198.18.0.0/15`）可放行。真实超星/智慧树仍需用户登录后录制；表单编码 POST 与自定义请求头白名单未做。

架构测试矩阵进度：

| 编号 | 状态 | 覆盖位置 |
|---|---|---|
| T01 命令幂等 | 已覆盖 | `tests/integration/kernel-storage.test.ts` |
| T02 聚合并发冲突 | 已覆盖 | `tests/integration/kernel-storage.test.ts` |
| T03 投影失败回滚 | 已覆盖 | `tests/integration/kernel-storage.test.ts` |
| T04 投影重建等价 | 已覆盖 | `tests/integration/kernel-storage.test.ts` |
| T05 重复同步 no-op | 已覆盖 | `tests/integration/connectors.test.ts` |
| T06 partial 空结果不清空 | 已覆盖 | `tests/integration/connectors.test.ts` |
| T07 截止日期变更保留进度 | 已覆盖 | `tests/integration/connectors.test.ts`、`kernel.test.ts` |
| T08 Planner 卸载 | 已覆盖（能力卸载 + 真实 Cordis fiber） | `tests/integration/planner.test.ts`、`cordis-lifecycle.test.ts` |
| T09 Planner 重启不重复 | 已覆盖 | `tests/integration/planner.test.ts` |
| T10 Analytics 全量重放 | 已覆盖 | `tests/integration/dispatcher.test.ts` |
| T11 通知不重发旧提醒 | 已覆盖 | `tests/integration/notifications.test.ts` |
| T12 调度崩溃恢复 | 已覆盖 | `tests/integration/scheduler.test.ts` |
| T13 网络/凭据失败保留旧数据 | 已覆盖 | `tests/integration/connectors.test.ts` |
| T14 Agent Bridge 卸载不影响后台 | 已覆盖（宿主无关 + 真实 Cordis tools fiber） | `tests/e2e/app.test.ts`、`cordis-lifecycle.test.ts` |
| T15 零模型调用 | 已覆盖（ModelUsageMeter = 0；DSH 自测不调用模型） | `tests/e2e/app.test.ts`、DSH selftest |
| T16 未授权写入被拒 | 已覆盖（可信宿主授权；模型参数不能自证；DSH 中 FORBIDDEN 实测） | `tests/integration/agent-tools.test.ts`、DSH selftest |
| T17 插件停用资源释放 | 已覆盖（消费者/定时器/处理器 + 真实 Cordis tools/planner fiber + DSH Web + Desktop UI 禁用/启用）；文件级 HMR 待补 | dispatcher、scheduler、cordis-lifecycle 测试；frontend-verification |
| T18 备份恢复 | 已覆盖 | `tests/e2e/app.test.ts` |
| T19 Upcaster 兼容 | 已覆盖 | `tests/replay/upcaster.test.ts` |
| T20 Session 结束不影响状态 | 已覆盖（应用重启） | `tests/e2e/app.test.ts`；DSH Session 待 M0 |

当前验证命令：`npm run typecheck`、`npm test`（273 项）、`ACADEMIC_DB=.data/academic.db npm run demo`、`npm run build:dsh`、`npm run build:ui`。

多步骤操作语义：课程删除会逐项归档事项与任务，遇到 `CONFLICT` 时重读版本并重试（最多 3 次），仍失败则返回 `CONFLICT` 且不删除课程，已归档部分可重试补齐；候选启用先切换激活版本，若同步源创建/更新失败则回滚到原激活版本并明确报错。

用户控制已验证：课程添加/编辑/归档/删除/恢复、来源事项归档/恢复、任务创建/编辑/完成/重开/删除/恢复/改预计时长、计划锁定/解锁/归档、可用时间设置、提醒开关/阈值、Agent 自动接入开关、自动化状态、提醒已读；锁定变更会使重叠的旧重规划建议失效并按新锁重算。

个人数据编辑策略：课程、来源事项、学习任务通过领域事件软删除/恢复，投影重建可还原；课程删除会先经各自命令归档其来源事项与关联任务。数据源/连接属于运营配置，归档可恢复，彻底删除会清理 source、连接元数据与凭据，但保留已同步学业事件。

P0 修复已验证：启动不覆盖调度配置；消费者重启续跑 checkpoint；Agent 写入需可信宿主授权；同步自动生成默认任务且不重复/不覆盖用户修改；Planner 遵守每周可用时间与临时不可用；72h/24h 截止提醒去重且重启补偿。

数据源不再作为应用层 vendor 插件：每个网站只是 `academic_sources` 中的一条 `engine + config` 配置；通用 browser-session engine 拉起 Edge/Chrome，用户完成登录与验证码后读取会话 Cookie 写入 DPAPI。UI 只渲染 DB source，不认识具体网站。正式平台的作业/考试/课程解析仍待实现，不得声称真实平台同步完成。数据源状态按配置、认证、同步健康和 Adapter 就绪度分开记录；表单只允许 engine 声明的 `authKind` / `loginMode`，服务端同样校验。

凭据连接 MVP 已验证：连接元数据与秘密分离；Windows DPAPI 加密存储；fail-closed；验证/断开/删除凭据；认证失败停止同步并保留旧数据；source mismatch 拒绝；DB/事件/同步记录无明文；DPAPI 受保护凭据完成端到端同步。

通用网站会话已实现：填写 URL 后宿主拉起 Edge/Chrome，用户点击页面右上角“完成登录”，应用只保存配置站点范围内的 Cookie 到 DPAPI；UI 的“网站登录”面板、CLI `web login/list/fetch/delete` 与 Agent 会话 fetch 工具已接入。抓取按 Cookie 属性筛选、逐跳校验重定向、阻断私网/元数据地址，并限制超时、重定向次数和流式响应字节数；存储/域名限制/不泄露 Cookie 有自动化测试；真实网站登录窗口仍需手工验收。

课程资料库已实现（H-05 / MATERIAL-001~004）：原文件按 sha256 内容寻址保存在数据库同目录 `materials/`，SQLite 只保存元数据与分块；支持 PDF/HTML/Markdown/TXT/PPTX/DOCX 文本抽取（PDF 支持 Flate 流、ToUnicode/bfchar/bfrange 与页码，DOCX/PPTX 使用内置 ZIP+inflate）、中文分块与 FTS5 trigram 检索，短关键词回退 LIKE；同一课程重复导入相同字节返回既有资料，跨课程共享同一内容文件。UI/CLI/Agent 均可导入文件、粘贴文本与单页 URL；URL 抓取只允许 http(s)，优先复用同站已保存会话或指定 source 会话，Cookie 不进入模型/UI。授权附件导入需要 `material_source_subscriptions` 中该 source+course 明确开启，只扫描用户给出的课程页中同主机且扩展名允许的链接，限 12 个文件、80 MB/文件、2 分钟，按 sha256 去重，401/403/登录页/429 立即停止。删除资料只删文件、元数据与索引，不影响事件；索引重建会从原文件重新抽取。Agent 工具 `academic_list_materials` / `academic_search_materials` 只读返回片段与标题/页码，`academic_import_material` / `academic_delete_material` 需可信宿主逐次授权；Tutor skill 的 explain/review 已要求先查资料、标注标题/页码、查不到时明确说明。真实 PDF（`2025春数分B2期中试题及解答.pdf`）已验证导入后可检索“中国科学技术大学”“隐函数”等片段；未实现 OCR、无界自动多页发现与真实模型会话中的引用点验（本机当前缺少 DeepSeek 凭据，DSH 只验证了 25 工具注册与只读/写入拒绝）。

前端 UI 已验证（`packages/academic-dsh-ui`）：侧边栏“学业”入口、总览/任务/计划/连接/资料/自动化/设置页面；任务完成、计划候选确认、锁定、可用时间保存、作业暂停/恢复、提醒已读均经 Host Remote API 生效；候选计划确认使用 Host 端 `previewId`，不信任客户端计划块；UI 不返回/保存 `credentialRef`，未实现真实 Adapter 时不显示认证表单。资料页提供文件/文本/单页 URL 导入、检索、删除、索引重建与课程页附件自动导入开关；单文件上限 80 MB；已在 DSH Web 临时库完成浏览器点验：Fixture 同步后导入文本与真实 PDF、检索返回片段/页码、删除资料生效。详细记录见 `docs/frontend-verification.md`。

Desktop 安装已验证：`desktop` profile 的 bundle 列表包含 `@academic/dsh-plugin` / `@academic/dsh-ui`；DSH Desktop 进程创建 `$DSH_HOME/academic-agent/academic.db` 与 3 个后台作业，UIAutomation 可见“学业”“Host 已连接”，从桌面面板执行“立即同步”后数据库出现 1 门课程与 2 个来源事项。桌面 Plugins 页面禁用 UI 后入口消失、后台作业继续；重新启用后入口恢复且作业数不变。

DSH 实测（本机 0.2.1-rc.3，独立 `academic` profile）：

```bash
dsh plugin --profile academic add D:/project/classhelper/packages/academic-dsh-plugin
ACADEMIC_AGENT_SELFTEST=1 ACADEMIC_AGENT_DB=D:/project/classhelper/.data/dsh-academic.db dsh academic --json "hello"
```

已观测（本轮重跑）：host/planner/tools 三个 fiber 加载，`tools=25 registered=true`，只读 `academic_list_courses` 成功，写入 `academic_update_task` 返回 `FORBIDDEN`；退出时 planner capability 释放。历史上使用 DSH 凭证中的 DeepSeek key 跑通真实自然语言调用：模型调用 `academic_list_courses`，返回真实 SQLite 课程并正确回答。本轮模型调用因缺少 DeepSeek key 未重跑；资料检索与引用只完成工具注册、自动化测试和真实 PDF 检索验证。

## 10. 待确认的环境参数（不阻塞实现）

- 首个真实课程平台：Blackboard 只读 Adapter 已接入并完成真实会话同步验证；真实 Adapter 覆盖课程/作业，考试/测验、文件夹分页、附件与成绩仍未覆盖，不能当作完整平台验收。
- 目标运行形态：本地 CLI + SQLite 已验证；DSH `headless` / `web` profile 可挂载；Desktop profile 已安装并验证 Academic Host 与 UI。
- 通知仅应用内还是系统通知（当前先应用内）。
- 课程规模、同步频率（当前 15 分钟）、计划粒度（15 分钟）、资源预算。
- DSH 版本升级策略（当前固定 0.2.1-rc.3 验证；升级需重跑 bundle/工具自测）。
- 备份保留策略与恢复演练频率。

