# Academic Agent

GitHub: <https://github.com/kw78/academic-agent>

一个以**可靠自动化为主体、按需使用 Agent**的个人学业助手。课程、作业、考试、学习任务和计划由事件溯源内核持续维护；数据源、调度、规划、通知和 Agent 工具都是可替换、可卸载的能力。

- 方向基线：[doc/Academic_Agent_Intent_v1.0.md](doc/Academic_Agent_Intent_v1.0.md)
- 架构规范：[doc/Academic_Agent_Architecture_Spec_v0.1-1.md](doc/Academic_Agent_Architecture_Spec_v0.1-1.md)
- 工程准则与状态：[AGENTS.md](AGENTS.md)
- 架构决策：[docs/adr](docs/adr)
- 测试与验收矩阵：[docs/testing.md](docs/testing.md)
- 前端验证记录：[docs/frontend-verification.md](docs/frontend-verification.md)

## 当前状态

- 单用户、本地、CLI + SQLite 的 MVP 闭环已完成。
- 用户控制已补齐：课程/任务管理、计划锁定/解锁/归档、可用时间设置、自动化状态、提醒已读。
- P0 可靠性修复已完成：调度配置重启不被覆盖、消费者断点续跑、Agent 写入需可信宿主授权、同步自动生成学习任务、Planner 遵守持久化可用时间、72h/24h 截止提醒带去重与重启补偿。
- DSH bundle 已拆成 `host` / `planner` / `tools` 三个独立 Cordis fiber；真实 Cordis 测试验证了 tools 与 planner 的独立卸载/重载，host 状态保持。
- 新增凭据连接 MVP：连接元数据与秘密分离，Windows DPAPI 加密存储，CLI 隐藏输入，Agent 工具无法读取凭据；DPAPI 受保护凭据同步已通过 E2E。
- 常规同步、去重、提醒、基础规划**不调用 LLM**；Agent 只通过受控工具读取事实或提交命令。
- M1（事件溯源内核）与 M2（fixture 数据源 + 调度 + 规划）已完成；M3 的 Agent 工具已完成。
- **DSH 绑定已落地**：`@academic/dsh-plugin` 已在本机 DSH `0.2.1-rc.3` 的独立 `academic` profile 中加载，6 个工具注册成功，并通过真实 ToolRegistry 执行了只读查询与写入拒绝自测。
- 已用 DSH 中保存的 DeepSeek key 跑通真实自然语言工具调用：模型调用 `academic_list_courses` 并正确回答课程。
- **DSH 客户端 UI 已落地**：`/dsh-ui` 在真实 DSH Web profile 中注册“学业”入口，提供总览、任务、计划、连接、自动化与设置；任务完成、候选计划确认、锁定、可用时间、作业启停和提醒已读均经 Host Remote API 生效。
- 已通过 DSH Plugins 页面禁用/启用 UI：入口消失后后台同步/重算继续，重新启用后无重复 Host/作业/课程。文件级 HMR、真实 DSH Session 生命周期与审批 UI 仍待验证。

## 快速开始

要求 Node.js ≥ 22.12（当前开发机为 v22.23.2）。

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
npm run demo -- backup          # 一致性备份到 .data/backups/
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
[academic-tools] tools=6 registered=true
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

打开 DSH 打印的 URL，侧边栏会出现“学业”。UI 只通过受认证的 Host Remote API 读写，不接触 SQLite、Event Store、Scheduler 表或 Credential Vault；禁用 UI 不会停止后台同步和提醒。详见 [UI README](packages/academic-dsh-ui/README.md) 与 [验证记录](docs/frontend-verification.md)。

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
- 默认不自动提交作业、不删除平台数据、不修改第三方账户。

## 已知限制与后续

- **M0 剩余**：profile 级 HMR、真实 Session 生命周期、DSH 用户审批适配器（当前 Agent 写入保持拒绝）。
- **R4 未完成**：USTC Blackboard 入口需要登录；安全凭据连接已具备，但 Blackboard Adapter 尚未实现。提供 ICS/API 或授权会话后可继续，详见 [docs/real-sources.md](docs/real-sources.md)。
- 系统凭据库当前为 Windows DPAPI；Credential Manager/其他 OS vault 是后续可替换实现。
- **P1 未做**：给定 URL 自动探索、生成/安装 Adapter 插件（Intent 明确不属于 MVP）。
- **M4**：性能基准（Spec §20）、迁移演练、故障注入扩展。
- 真实 LMS 尚未接入；当前使用 `fixture-lms`。
- Desktop profile 已安装 `@academic/dsh-plugin` 与 `@academic/dsh-ui`；DSH `web` profile 未改动。
- `node:sqlite` 为实验性 API，升级 Node/DSH 时需重新验证。

## 测试

```bash
npm run typecheck
npm test
npm run build:dsh
```

共 100 项自动化测试，覆盖 T01–T20 的宿主无关部分、用户控制闭环、P0 可靠性修复、真实 Cordis 插件生命周期、凭据连接与前端 UI/Host API；另有本机 DSH `0.2.1-rc.3` 的真实 ToolRegistry、Web 客户端加载/卸载与页面交互验证。详见 [docs/testing.md](docs/testing.md)。
