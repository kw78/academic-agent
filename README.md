# Academic Agent

GitHub: <https://github.com/kw78/academic-agent>

一个以**可靠自动化为主体、按需使用 Agent**的个人学业助手。课程、作业、考试、学习任务和计划由事件溯源内核持续维护；数据源、调度、规划、通知和 Agent 工具都是可替换、可卸载的能力。

- 方向基线：[doc/Academic_Agent_Intent_v1.0.md](doc/Academic_Agent_Intent_v1.0.md)
- 架构规范：[doc/Academic_Agent_Architecture_Spec_v0.1-1.md](doc/Academic_Agent_Architecture_Spec_v0.1-1.md)
- 工程准则与状态：[AGENTS.md](AGENTS.md)
- 当前执行路线：[doc/ACADEMIC_AGENT_ROADMAP_MVP_FIRST.md](doc/ACADEMIC_AGENT_ROADMAP_MVP_FIRST.md)
- MVP 验收清单：[docs/mvp-verification.md](docs/mvp-verification.md)
- 架构决策：[docs/adr](docs/adr)
- 测试与验收矩阵：[docs/testing.md](docs/testing.md)
- 前端验证记录：[docs/frontend-verification.md](docs/frontend-verification.md)
- 运维、故障排查与升级：[docs/operations.md](docs/operations.md)

## 当前状态

- 单用户、本地、CLI + SQLite 的 MVP 闭环已完成。
- 用户控制已补齐：课程/任务管理、计划锁定/解锁/归档、可用时间设置、自动化状态、提醒已读。
- P0 可靠性修复已完成：调度配置重启不被覆盖、消费者断点续跑、Agent 写入需可信宿主授权、同步自动生成学习任务、Planner 遵守持久化可用时间、72h/24h 截止提醒带去重与重启补偿。
- DSH bundle 已拆成 `host` / `planner` / `tools` 三个独立 Cordis fiber；真实 Cordis 测试验证了 tools 与 planner 的独立卸载/重载，host 状态保持。
- 新增凭据连接 MVP：连接元数据与秘密分离，Windows DPAPI 加密存储，CLI 隐藏输入，Agent 工具无法读取凭据；DPAPI 受保护凭据同步已通过 E2E。
- 常规同步、去重、提醒、基础规划**不调用 LLM**；Agent 只通过受控工具读取事实或提交命令。
- M1（事件溯源内核）与 M2（fixture 数据源 + 调度 + 规划）已完成；M3 的 Agent 工具已完成。
- **DSH 绑定已落地**：`@academic/dsh-plugin` 已在本机 DSH `0.2.1-rc.3` 的独立 `academic` profile 中加载，当前 19 个工具（含 2 个自动接入工具），并通过真实 ToolRegistry 执行了只读查询与写入拒绝自测。
- 前端 UI 已验证（`packages/academic-dsh-ui`）：见 [前端验证记录](docs/frontend-verification.md)。
- 数据源状态已拆分为配置、认证、同步健康与 Adapter 就绪度；表单只允许 engine 声明的 `authKind` / `loginMode`。
- **Blackboard 只读 Adapter 已接入**：`engine=blackboard` 复用浏览器会话读取课程/作业，支持预览后确认同步；真实会话已在临时库验证（2 门课程、7 个作业），不提交作业。
- **声明式 Adapter Runtime 已落地**：`engine=declarative` 通过版本化 Manifest 驱动 HTML/JSON 提取、字段类型转换/默认值、`next`/页码/offset 分页和字段映射，并受请求数、行数、字节与时长限制；作业列表可声明 `scope=source`，静态 URL 只请求一次并按行内课程 ID 归属，避免按课程重复抓取；新网站优先加 Manifest，不新增 engine。
- **教学 skill 包装**：`skills/academic-tutor` 提供稳定的教学契约（事实/材料/推断分离、不提交作业、不编造材料），`modes/` 可增量添加 explain/hint/check/review 等模式，不需要新增工具或代码；安装方式见该目录 README。
- **AI 候选 Adapter 流水线已落地**：AI 可生成 Manifest，并用真实页面样本或 Host 捕获的 `sampleId` 做离线回放；原始响应的 body 只留在宿主内存（60 分钟 TTL，按 URL 复用），不进入模型上下文；验证按 schema、字段契约、访问范围、样本回放分阶段报告，候选列表展示允许主机/路径/数据类型/字段；Agent 可暂存候选但不会激活或建源，启用仍需用户操作/可信授权，并会创建或更新 declarative 同步源；CLI 与 UI 的启用行为一致，不需要重启；支持版本启用/回滚。样本回放不等于真实同步，UI 会明确标注。设置页可开启“Agent 自动接入”（默认关闭）：开启后 Agent 可自行启用已验证候选并预览/同步其 declarative 源，不再逐次审核；仍不能启用未验证候选、读取凭据或提交作业。
- **接入状态可解释**：Host 统一返回“待登录/已登录未验证/待首次同步/已启用/部分同步/失败”等阶段与唯一“下一步”；同步失败按认证、网络、权限、结构、质量分类并给出修复建议。
- **用户控制扩展**：课程优先级持久化并作为计划排序的第二依据；任务页提供按课程分组的复习清单与带上下文的 Agent 入口。
- **个人数据可编辑/可恢复**：课程可编辑学期/代码/名称，并归档、删除、恢复；来源事项可归档/恢复；学习任务可编辑标题、本地截止、优先级和预计时长，并可删除/恢复；数据源可编辑非敏感配置、归档/恢复或彻底删除（删除时清理连接与凭据，保留已同步学业事件）。
- **运维可恢复**：`backup`/`restore` 支持独立目录恢复、完整性检查与投影一致性校验；`npm run benchmark` 记录 1k/10k 事项基线。
- **稳定性收尾**：同源同步并发锁、429/5xx/超时有限重试、同步状态与错误分类、备份/迁移/恢复与故障排查文档已完成。
- 已用 DSH 中保存的 DeepSeek key 跑通真实自然语言工具调用：模型调用 `academic_list_courses` 并正确回答课程。
- **DSH 客户端 UI 已落地**：`/dsh-ui` 在真实 DSH Web profile 中注册“学业”入口，提供总览、任务、计划、连接、自动化与设置；任务完成、候选计划确认、锁定、可用时间、作业启停和提醒已读均经 Host Remote API 生效。
- 已通过 DSH Plugins 页面禁用/启用 UI：入口消失后后台同步/重算继续，重新启用后无重复 Host/作业/课程。文件级 HMR、真实 DSH Session 生命周期与审批 UI 仍待验证。

## 快速开始

要求 Node.js ≥ 22.12（当前开发机为 v24.18.0）。

```bash
npm install
npm run typecheck
npm test
npm run build:ui

# 端到端演示（写入 .data/academic.db）
ACADEMIC_DB=.data/academic.db npm run demo
```

CLI 命令：

```bash
npm run demo                    # 同步 fixture、创建任务、生成并确认计划
npm run demo -- sync            # 同步 + 处理提醒/重规划请求
npm run demo -- list            # 查看待办、任务、未读提醒
npm run demo -- status          # 投影一致性、同步、定时任务、作业运行
npm run demo -- course list     # 课程管理
npm run demo -- course add 2026-fall CS101 "Computer Science"
npm run demo -- task list       # 任务管理
npm run demo -- task complete <taskId>
npm run demo -- plan show       # 查看当前计划与锁定时段
npm run demo -- plan --accept   # 生成未来 7 天计划并确认
npm run demo -- plan lock 2026-10-27T16:30:00 2026-10-27T18:00:00 "锁定"
npm run demo -- plan unlock <lockId>
npm run demo -- availability show
npm run demo -- availability set --tz Asia/Shanghai --granularity 15 --slots "1:19:00-22:00,2:19:00-22:00"
npm run demo -- availability block 2026-10-28T18:00:00 2026-10-28T19:00:00 "开会"
npm run demo -- reminders show
npm run demo -- reminders set --enabled true --thresholds 72,24
npm run demo -- notifications --read-all
npm run demo -- connection list
npm run demo -- connection add secure-lms "Secure LMS" --auth token --scopes courses,assignments
npm run demo -- connection connect <connectionId>   # 本机隐藏输入，写入系统凭据库
npm run demo -- connection disconnect <connectionId>
npm run demo -- source list
npm run demo -- source add my-lms "My LMS" --engine browser-session --auth token --login-mode browser --config "{\"loginUrl\":\"https://lms.example.edu/\",\"authenticatedUrlPatterns\":[\"^https://lms.example.edu/\"],\"cookieDomains\":[\"lms.example.edu\"]}"
npm run demo -- source login my-lms
npm run demo -- source sync my-lms   # 未实现真实 Adapter 时返回 CAPABILITY_UNAVAILABLE
npm run demo -- web login https://example.com/ --label "课程网站"
npm run demo -- web list
npm run demo -- web fetch <sessionId> https://example.com/page --out .data/page.html
npm run demo -- web delete <sessionId>
npm run demo -- backup          # 一致性备份到 .data/backups/
npm run demo -- restore <backup.db> <target.db>   # 独立目录恢复并校验完整性/投影
npm run benchmark               # 1k/10k 事项同步、查询与投影重建基线
npm run demo -- help
```

数据库路径由 `ACADEMIC_DB` 控制，默认 `.data/academic.db`，已被 git 忽略。

## 挂到本机 DSH

已在本机 **DSH 0.2.1-rc.3** 验证。`headless` 使用独立 `academic` profile；Web 使用 `academic-web`；Desktop 已在 `desktop` profile 安装 host / planner / tools / ui 四行。bundle patch 写入 `academic-host`、`academic-planner`、`academic-tools` 三行；禁用 tools 行即可卸载 Agent Bridge，禁用 planner 行则保留已有计划但停止新规划。桌面端默认数据库为 `$DSH_HOME/academic-agent/academic.db`。

```bash
npm run build:dsh
dsh academic --from-default-profile headless --dump-config
dsh plugin --profile academic add D:/project/classhelper/packages/academic-dsh-plugin
dsh academic --dump-config   # 应出现 # == @academic/dsh-plugin
```

真实 ToolRegistry 自测（不需要模型）：

```bash
ACADEMIC_AGENT_SELFTEST=1 \
ACADEMIC_AGENT_DB=D:/project/classhelper/.data/dsh-academic.db \
dsh academic --json "hello"
```

本机实测输出：

```text
[academic-host] loaded db=D:/project/classhelper/.data/dsh-academic.db
[academic-planner] capability registered
[academic-tools] tools=17 registered=true
[academic-tools] selftest readIsError=false readCourses=1 writeIsError=true writeError=FORBIDDEN: Agent write access is not enabled
```

DeepSeek 模型实测（使用 DSH 已保存的 `DEEPSEEK_API_KEY`，不打印密钥）：

```bash
printf '%s' 'Call the tool academic_list_courses with empty arguments {}. Then reply with the course titles and internal ids.' \
  | ACADEMIC_AGENT_DB=D:/project/classhelper/.data/dsh-academic.db \
    DEEPSEEK_API_KEY="$(...从 DSH 凭证读取...)" \
    dsh academic --json -
```

实测模型调用了 `academic_list_courses`，工具返回真实 SQLite 数据，最终回答包含课程 `Introduction to Computer Science` 与内部 id。若 DSH 未配置 key，headless 会报 `MISSING_CREDENTIAL`。

**Agent 写入默认关闭，且模型参数不能自证授权。** 当前 bundle 没有接入可信的 DSH 用户审批适配器，因此 `academic_update_task` 与 `academic_request_replan` 会被拒绝（`FORBIDDEN` / `CONFIRM_REQUIRED`）；CLI 用户直接操作仍走正常 Command API。详见 [插件 README](packages/academic-dsh-plugin/README.md)。

### 挂载 Academic UI（Web / Desktop）

```bash
npm run build:dsh
npm run build:ui
dsh plugin --profile academic-web add \
  D:/project/classhelper/packages/academic-dsh-plugin \
  D:/project/classhelper/packages/academic-dsh-ui
# profile 的 dsh.profile.bundles 需包含 @deepseek-ai/dsh-web-app（与 DSH web profile 一致）
ACADEMIC_AGENT_DB=D:/project/classhelper/.data/dsh-ui-test.db \
  dsh --profile academic-web --no-open --port 0
```

打开 DSH 打印的 URL，侧边栏会出现“学业”。“连接”页可添加使用 `browser-session` engine 的数据源并拉起 Edge/Chrome 登录窗口，用户完成登录后由宿主保存会话；UI 只通过受认证的 Host Remote API 读写，不接触 SQLite、Event Store、Scheduler 表或 Credential Vault；禁用 UI 不会停止后台同步和提醒。详见 [UI README](packages/academic-dsh-ui/README.md) 与 [验证记录](docs/frontend-verification.md)。

#### 安装到 DSH Desktop

```bash
npm run build:dsh
npm run build:ui
dsh plugin --profile desktop add \
  D:/project/classhelper/packages/academic-dsh-plugin \
  D:/project/classhelper/packages/academic-dsh-ui
```

然后在 `~/.dsh/profiles/desktop/package.json` 的 `dsh.profile.bundles` 中加入：

```json
"@academic/dsh-plugin",
"@academic/dsh-ui"
```

重启 DSH Desktop。桌面端使用 `$DSH_HOME/academic-agent/academic.db`，侧边栏出现“学业”，Host Remote API 与后台作业由桌面进程托管。

**不要同时启动另一个使用同一数据库的 Academic Host**（例如未设置 `ACADEMIC_AGENT_DB` 的 headless profile）；Desktop 已占用默认数据库时应使用 CLI 只读查看或另配数据库。

## 架构要点

```text
CLI / Agent Bridge
        │  查询 / 受控命令
        ▼
Academic Kernel（聚合、命令校验、事件决策）
        │  单事务
        ▼
SQLite Event Store ──► 核心投影（同步更新）
        │
        └──► Durable Dispatcher ──► 通知 / 重规划触发器 / 扩展投影
                                      │
Scheduler ──► Connector ──► Adapter   └──► Planner（确定性）
```

- **事件是事实源**：核心写入在单事务内完成事件追加、核心投影与命令收据；投影可重建。
- **命令幂等 + 乐观并发**：`commandId` 收据去重，`expectedVersion` 显式冲突。
- **受控变更**：UI、Agent、自动化都只能经 Command API；插件不直接写事件表或核心读模型。
- **同步去重**：优先外部 ID；无变化为 no-op；partial/空结果不会清空旧事项；失败保留旧数据。
- **通知安全**：Reaction 从启用时的最新事件位置开始，历史回放不会重发旧提醒。
- **可恢复调度**：持久作业、租约、退避重试、崩溃后 `interrupted` 恢复。
- **确定性规划**：过滤完成项 → 按截止/优先级排序 → 扣除固定与锁定时段 → 顺序填充 → 明确报告冲突。
- **Agent 最小权限**：默认只读；写入必须由可信宿主对每次操作授权，模型传入的 `confirmed` 不再作为授权依据；无任意 SQL、无直接事件写入。

## 包结构

| 包 | 职责 |
|---|---|
| `packages/academic-contracts` | 命令/事件/查询 Schema、领域类型、端口、能力目录 |
| `packages/academic-kernel` | Aggregate、命令决策、核心投影规则 |
| `packages/academic-storage-sqlite` | Event Store、原子 Command Bus、核心投影、查询、迁移 |
| `packages/academic-event-dispatcher` | 持久 checkpoint、扩展消费者、退避 |
| `packages/academic-connectors` | Fetch → Normalize → Reconcile、同步运行记录 |
| `packages/academic-scheduler` | 持久作业、租约、重试、崩溃恢复 |
| `packages/academic-planner-basic` | 确定性 Planner、重规划请求去重 |
| `packages/academic-agent-tools` | 最小 Agent 工具集与宿主无关注册契约 |
| `packages/academic-notifications` | 应用内通知 Reaction、72h/24h 截止扫描 |
| `packages/academic-connections` | 连接元数据、Credential Vault、授权状态 |
| `packages/academic-sources` | 数据库 source 配置（engine + 非敏感 config） |
| `packages/academic-source-browser` | 通用浏览器会话登录 engine；不包含 vendor 逻辑 |
| `packages/academic-web-sessions` | 通用网站登录、DPAPI 会话 Cookie、带会话 fetch |
| `packages/academic-dsh-plugin` | DSH bundle：host / planner / tools 独立 Cordis 插件 |
| `packages/academic-dsh-ui` | DSH 客户端 UI 插件与 Host Typert Remote API 适配 |
| `adapters/fixture-lms` | 受控测试数据源 |
| `apps/academic-cli` | 组合根、CLI 演示、备份恢复 |

依赖方向固定为 `Feature → Contracts → Kernel API`；组合根负责装配，不包含领域规则。

## 数据与安全

- 凭据、Cookie、Token 不进入领域事件、核心投影、普通配置或日志。
- 连接元数据与秘密分离：秘密存入 Windows DPAPI（当前 MVP，可替换为 Credential Manager）；系统凭据库不可用时失败关闭，不降级明文。
- Agent 工具不接收 Connection Manager 或凭据；Adapter 只能通过 source-checked 租约读取本连接秘密。
- 断开连接默认保留已同步数据；删除凭据不删除领域事件；认证失败停止同步并提示重新认证。
- 外部网页/教学资料视为不可信输入；Agent 输出不会未经校验成为权威事实。
- 备份使用 SQLite `VACUUM INTO` 生成一致性快照；恢复后校验事件位置并可按需重建投影。
- 会话抓取按 Cookie 的 domain/path/secure/expiry 筛选，逐跳校验重定向，阻断回环、私网与云元数据地址，并限制超时、重定向次数和响应体字节数。
- 默认不自动提交作业、不删除平台数据、不修改第三方账户。

## 已知限制与后续

- **Gate 0/2–6 已完成**：类型检查、182 项测试、构建、DSH selftest、DSH Web UI 独立库同步、真实 BB/JW 平台闭环均已实测；详见 [docs/mvp-verification.md](docs/mvp-verification.md)。
- **Gate 1**：DSH Web 已验证 UI/Host/同步；用户已在 Desktop 当前构建手工检查基本流程，未报告问题；文件级 HMR/完整生命周期专项仍未验证。
- 系统凭据库当前为 Windows DPAPI；Credential Manager/其他 OS vault 是后续可替换实现。
- **接入流程**：给定 HTTPS 网址后可登录、验证、只读探测；探测支持同一来源主机内的额外 URL、同站脚本、候选接口、表格表头/class 与容器 class，`capture=true` 可把真实响应存入 Host 临时样本并返回 `sampleId`，Agent 用 `sampleIds` 直接验证 Manifest，无需你手工导出 DOM/Network。探测按来源限速（每个来源最多 3 次/分钟，按 20 秒间隔执行），429/403/登录页立即停止；相同 URL 样本复用。用户在“连接”页确认启用/回滚。仍未实现任意站点全自动多页发现或任意 JavaScript。
- **偏好与复习**：课程优先级、可用时间与任务预计时长已持久化；复习清单只基于已保存事项与任务，不生成成绩趋势或能力评分。
- 真实 Blackboard 只读同步已接入并验证课程/作业/文件夹；当前账号无测试项样本，考试/测验仍以 fixture 验证。
- **第二平台**：USTC 综合教务系统用 Manifest 真实同步考试表（1 门课程/1 个考试，重复同步 no-op）；课表、成绩、作业未覆盖，平台无 ICS 订阅，Manifest 暂不支持 XML。
- Desktop profile 已安装 `@academic/dsh-plugin` 与 `@academic/dsh-ui`；`academic-web` profile 已用独立数据库实测。
- `node:sqlite` 为实验性 API，升级 Node/DSH 时需重新验证。

## 测试

```bash
npm run typecheck
npm test
npm run build:dsh
```

共 182 项自动化测试，覆盖 T01–T20 的宿主无关部分、用户控制闭环、P0 可靠性修复、真实 Cordis 插件生命周期、凭据连接、会话抓取安全、数据源状态、Blackboard 只读解析/同步、声明式 Adapter（含 source 级作业请求）、AI 候选暂存/校验/启用、个人数据编辑/软删除/恢复、同步重试/并发与前端 UI/Host API；另有本机 DSH `0.2.1-rc.3` 的真实 ToolRegistry、Web 客户端加载/卸载与页面交互验证。详见 [docs/testing.md](docs/testing.md)。
