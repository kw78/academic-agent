# Academic Agent --- 前端与 DSH 宿主集成设计规范

> 版本：v0.1（设计草案）\
> 日期：2026-10-27\
> 状态：UI-0 至 UI-4 的 MVP 已实现，并在本机 DSH 0.2.1-rc.3 Web profile 上完成面板、查询、
> 任务/计划/自动化交互与 UI 卸载/重载验证。真实 LMS Adapter 认证、系统通知与移动端专项验收
> 仍未完成；不得把 Fixture E2E 当作真实平台验收。验证记录见
> [docs/frontend-verification.md](../docs/frontend-verification.md)。\
> 上位文档：[Intent](Academic_Agent_Intent_v1.0.md)、[Architecture
> Spec](Academic_Agent_Architecture_Spec_v0.1-1.md)\
> DSH 基线：项目已验证 DSH 0.2.1-rc.3。客户端 API
> 必须以锁定版本源码、类型和集成测试为准。

## 1. 目的与范围

在现有 Event-Sourced Academic Kernel 与 DSH/Cordis
之上，提供日常可用的学业管理界面，不另造应用框架。

原则： - 长期理念是可个性化、可扩展的个人助手；当前范围是单用户学业管理
MVP。 - DSH 提供 Agent、插件宿主和客户端容器；Academic Agent
提供学业业务能力。 - DSH Desktop 与 DSH Web 复用同一套 Academic
UI，不维护两套业务界面。 - UI
是可替换的交互层，不是领域内核或业务事实来源。 -
普通操作通过确定性查询、命令和规则完成；只有真正需要推理时才进入
Agent。 - 不因增加前端而重写 Kernel、Event Store、Scheduler、Planner 或
Credential Vault。

本轮不做：独立 Electron/Tauri 桌面壳、脱离 DSH 的独立 Web 产品、多用户
SaaS、跨设备同步、插件市场、复杂日历拖拽、重写 DSH Chat/Session/审批
UI。

## 2. 关键架构决策

### FE-DEC-01：复用 DSH Desktop 与 Web

DSH Desktop 是 Electron 外壳，承载 DSH Web 客户端；两者不应分别实现业务
UI。采用一套 DSH Client UI
插件，优先使用锁定版本支持的客户端插件、导航和 UI Slot 扩展机制。

React 组件不得直接调用 Electron API、Node 文件系统或原生
IPC。桌面特有能力只能经由 DSH Host 提供的受控接口访问。

### FE-DEC-02：UI 与 Host 分离

Host 负责权威状态、持久化、权限、业务命令和后台任务；Client
负责呈现、输入和交互反馈。UI 不直接访问 SQLite、Event Store、核心
Projection、Scheduler 表或 Credential Vault。所有读取经 Query
API，所有业务变更经 Command API。

### FE-DEC-03：UI 与后台能力独立生命周期

-   卸载 UI 不得停止同步、提醒、Planner 或后台任务。
-   关闭聊天 Session 不得影响 Academic 状态。
-   卸载 Agent Bridge 不得影响 UI 的普通查询和后台自动化。
-   Host 停止时，UI 显示服务不可用并允许重试；不得在客户端创建第二份
    Academic Runtime。

### FE-DEC-04：同一数据库只允许一个权威 Host 写入者

Desktop 与独立 Web Profile 可能使用不同
Profile、数据目录和运行时，不能假设天然共享数据库。若使用不同
Profile，应明确视为不同数据实例；若要共享，必须明确配置同一受支持的
Host/Profile，并验证并发访问与生命周期。

不得为了 UI 再执行 CLI 组合根，创建第二份 Scheduler、Dispatcher 或
Connector Runtime。检测到数据库已被其他 Host
占用时，应明确报错或只读退出。

### FE-DEC-05：先验证锁定版本

当前项目验证版本为 DSH 0.2.1-rc.3。当前主分支的 UI Slot、Client Module
或 Remote API 不能自动视为锁定版本已提供。UI-0
必须验证实际版本的插件加载、导航扩展、Host/Client
通信和构建流程。若必须升级，记录 ADR 并重跑兼容测试；不得默认 fork DSH
或另建插件 Loader。

## 3. 总体架构

``` mermaid
flowchart TB
    Desktop["DSH Desktop / Electron"] --> UI["Academic UI Plugin"]
    Web["DSH Web / Browser"] --> UI
    UI --> API["Academic Host API Adapter"]
    Chat["DSH 原生 Agent Chat"] --> Tools["Academic Agent Tools"]
    API --> Query["Academic Query API"]
    API --> Command["Academic Command API"]
    API --> Connections["Connection Manager"]
    Tools --> Query
    Tools --> Command
    Command --> Kernel["Academic Kernel"]
    Kernel --> Store[("SQLite Event Store")]
    Kernel --> Projection[("Core Projections")]
    Query --> Projection
    Runtime["Scheduler / Connector / Planner / Notifications"] --> Command
    Runtime --> Query
    Connections --> Vault["Credential Vault"]
```

Desktop/Web 是 UI 入口，不代表两个独立 Host 可以同时写同一数据库。

### 查询流程

UI 通过 DSH 当前版本支持的 Host/Client 通信调用 Query API；Query API
从核心 Projection 读取；Client 展示来源、更新时间和同步健康信息。

### 变更流程

用户操作 → Command API → Host 校验参数、权限、版本和业务不变量 → Kernel
事务写入事件与核心 Projection → 返回成功或结构化失败 → UI 刷新相关查询。

UI 可以显示 Pending，但不得先伪造持久化成功。最终状态以 Host 结果为准。

### 与 DSH Chat 的关系

继续复用 DSH 原生聊天承担自然语言问答、课程解释、复杂问题和按需 Agent
工作。Academic UI
承担结构化状态、列表筛选、计划管理、连接和自动化控制。不重复实现聊天、模型选择、Session
或工具审批 UI。从作业跳转聊天时只传非敏感业务 ID 和问题，不传凭据。

## 4. 模块边界

  -----------------------------------------------------------------------------------------------
  模块                    职责                                   禁止职责
  ----------------------- -------------------------------------- --------------------------------
  Academic Kernel         领域规则、命令校验、事件和核心事实     React、DOM、UI

  Query API               课程、事项、任务、计划和连接状态查询   返回秘密、任意 SQL

  Command API             接受并校验业务命令                     任意数据库更新

  Host Adapter            适配锁定版本支持的 DSH Host/Remote     复制领域规则
                          接口                                   

  Academic UI Plugin      导航、页面、交互、错误/空状态          领域决策、数据库写入、凭据解密

  Agent Tools             暴露最小业务工具                       访问 Vault

  Connection              连接元数据、认证状态、秘密保管         UI 呈现、Agent 读取秘密
  Manager/Vault                                                  

  CLI                     本地维护和命令行操作                   为 UI 重复启动 Runtime
  -----------------------------------------------------------------------------------------------

如确有独立 Client Bundle 需求，可新增
`packages/academic-dsh-ui/`。优先复用现有包，不为每个页面建立独立 npm
包。

禁止依赖：UI → `academic-storage-sqlite`、原始 Event Store、Credential
Vault 或 Kernel 私有实现；Kernel → React/DSH UI；Agent Tools → 原始 SQL
或凭据读取接口。

## 5. 页面与 MVP 功能

### 5.1 总览 Dashboard

显示今日待办、近期截止事项、今日学习计划、近期作业/考试变化、未读提醒、数据源状态、最近成功同步时间、认证失效和未安排任务。

只显示 Query API 的事实。未知截止日期不得伪装成确定日期；Agent
建议不得显示为已确认计划。同步失败时保留最后有效数据并显示其时间。

### 5.2 作业与任务 Tasks

支持按课程、事项类型、截止范围和状态筛选；查看标题、课程、来源、截止时间、源更新时间、本地任务状态和来源链接；标记完成/重开、调整预计时长、查看未安排原因。

学校原始作业事实与用户学习任务分开展示。本地任务完成不等于学校已提交。同步不得覆盖用户修改的耗时、备注或完成状态。所有变更调用
Command API。

### 5.3 学习计划 Plan

首版提供日视图、周视图和列表，不要求复杂拖拽日历。支持查看已确认/候选计划、计划块、固定课程和锁定时段；预览重规划、确认/放弃候选计划、锁定/解锁时间段、查看未安排原因、修改可用时间。

规划算法确定性执行，不调用
LLM。候选计划与确认计划是不同状态；不得静默覆盖已确认计划，除非用户明确启用自动确认策略。锁定时段是硬约束。无法安排时解释原因。Planner
卸载后已有计划仍可查询。

### 5.4 课程与数据源连接

显示课程名称、学期、关联来源；数据源名称、Adapter
是否可用、连接状态、脱敏账号标识、授权范围、上次验证/同步时间、最近失败原因、自动同步开关和周期。

状态至少区分：未配置、已配置未验证、已连接、需要重新认证、同步降级/失败、已断开、当前版本不支持。

不能仅因凭据已保存就显示平台可正常同步。只有真实验证或成功同步后才能显示已连接/最近成功。Adapter
未实现时标记暂不可用，不得暗示能接入任意网站。

### 5.5 自动化与通知

显示同步启停状态、下次执行时间、最近运行记录、成功时间、连续失败次数、错误说明、提醒开关/阈值和未读提醒。用户可暂停/恢复支持的自动化；暂停后既有学业数据仍可查询。MVP
不提供任意 Cron 编辑器或任意脚本执行界面。

### 5.6 设置

包括时区、每周可用学习时段、临时不可用时间、计划粒度、提醒开关/阈值、同步周期和基础
UI 偏好。业务偏好通过 Host API 持久化；筛选器、排序和展开状态等纯 UI
偏好可本地保存。不得将密码、Token、Cookie 或凭据引用存入浏览器存储。

### 5.7 Agent 辅助

复用 DSH Chat。可提供"解释这个作业""帮我拆解任务"等入口，传递非敏感业务
ID 和问题。Agent
建议必须与数据库事实区分；涉及计划变更时先预览/确认。点击入口不代表授予
Agent 写权限。

## 6. Host API 约束

本文定义逻辑能力，不冻结 DSH Remote 方法名；真实签名在验证 0.2.1-rc.3
后确定。

### 查询能力

Dashboard
Summary、课程列表/详情、事项列表/详情、任务列表/状态、当前计划/候选计划/锁定时段、可用时间、连接元数据/状态、同步历史/自动化状态、通知列表/未读数。

查询必须分页或限制返回量。响应包含必要来源、更新时间和状态信息，不返回秘密。

### 命令能力

任务完成/重开/改预计时长、设置可用时间、生成候选计划、确认/放弃计划、锁定/解锁时段、手动同步、暂停/恢复自动化、修改提醒、通知已读、创建/验证/重新认证/断开连接、删除凭据。

所有写入经现有 Command API。Actor 与权限由 Host 确定，不信任 Client
自报身份。校验失败、并发冲突、能力缺失、认证失效使用不同错误码。不提供通用任意字段更新接口，不允许
UI 直接发领域事件。重复提交依靠幂等键或等价机制。

### 状态刷新

优先使用锁定版本实际支持的 Remote 查询/订阅能力。若没有可靠状态流，MVP
可在页面激活时查询、操作成功后刷新、提供手动刷新；必要时对运行状态使用有上限的轻量轮询。不得为
UI 单独引入 WebSocket 或消息队列。

## 7. 凭据与连接安全

-   仅对已实现且明确支持的 Adapter 展示认证表单。
-   密码输入使用 password 类型，不回填已保存秘密。
-   密码/Token 只在当前交互内存中短暂存在，提交后清空字段。
-   不写入
    localStorage、sessionStorage、IndexedDB、URL、浏览器历史、分析事件或错误报告。
-   不放进 Agent Prompt、工具输出、Domain Event、普通日志或同步记录。
-   通过 DSH 锁定版本支持且经过认证的 Host 通信入口提交。
-   Host 对认证请求、异常和追踪信息脱敏，不记录原始请求体。
-   UI 不访问 Vault，不接收 `credential_ref`；只获得连接
    ID、状态、脱敏账号标识和可展示的授权范围。
-   Vault 只由受信任 Host 连接服务访问；Agent Tools 不依赖 Connection
    Manager/Vault。
-   Adapter 仅能在指定 source/connection 授权下取得短期凭据租约。
-   断开/删除凭据不删除已同步学业数据；Vault
    不可用时失败关闭，禁止明文回退。

MVP 是单用户本地应用，凭据归属运行 Academic Host
的操作系统用户。远程浏览器、多用户和共享 Host
的多账号凭据不属于默认范围。未来开放远程访问前，必须设计用户身份、会话绑定、传输保护、权限隔离和每用户
Vault 所有权。

## 8. Desktop/Web 运行模型

Desktop 与 Web 复用 UI 代码，但数据是否相同取决于 Profile、Host
和数据库配置。界面可显示 Profile 标识、Host
是否可用、连接是否有效；不要暴露不必要的绝对本地路径。

Host 由 DSH Host 插件生命周期管理。UI 加载、卸载或 HMR 不得创建/关闭
Host。Host 只初始化一次 Event Store、Dispatcher、Scheduler 和 Connector
Runtime。退出时停止新任务、处理在途任务并释放订阅、定时器和文件句柄。

Host 断开时显示服务不可用；恢复后重新查询。不得在浏览器端启动 CLI
子进程来补齐 API。

文件选择、打开本地资料和系统通知只能通过 DSH 已提供且经过授权的 Host
能力实现。首版不得直接暴露 Electron IPC
或任意文件系统权限。锁定版本不支持的能力暂缓或使用受限替代方案。

## 9. 页面状态、交互和可访问性

每个主要页面支持：

-   Loading：首次加载；
-   Empty：没有课程、事项、计划或连接；
-   Ready：数据可用；
-   Stale：有最后有效数据，但最近同步失败或数据可能过期；
-   Degraded：部分来源/能力不可用；
-   Auth Required：需要重新认证；
-   Conflict：命令版本冲突或状态已变化；
-   Unavailable：Host 或可选插件不可用；
-   Error：请求失败并提供重试入口。

必须区分学校事实、用户本地状态、Planner 候选建议、已确认计划和 Agent
建议。未知、缺失、过期或部分抓取数据不得显示为确定事实。查询失败不得伪装成没有作业。错误提示给出可执行的下一步；原始堆栈仅写入脱敏日志。

交互原则：先呈现任务和行动；复用 DSH
主题与组件；破坏性操作明确确认；状态不能只靠颜色表达。桌面宽屏可双栏，窄窗口改单栏，移动浏览器保证任务查询、完成状态和提醒可用，复杂计划可降级为列表。主要操作可键盘完成；表单有标签和错误提示；模态窗口正确管理焦点。

本地只保存非敏感 UI 偏好。课程、任务、计划和可用时间必须由 Host
持久化状态恢复。

## 10. 可观测性

UI
至少展示最近成功同步时间、最近失败原因、认证状态、待处理/未安排任务数、计划确认状态、最近提醒和
Host/插件不可用状态。

诊断可记录 request ID、correlation
ID、错误码、耗时和版本；禁止记录密码、Token、Cookie、Authorization
Header 或完整敏感响应体。必须区分查询失败和数据为空。

## 11. 测试规范

### 单元测试

覆盖页面状态映射、筛选排序、错误码提示、候选/确认计划区别、未知截止时间和过期数据、凭据提交后清空，以及不将秘密写入客户端持久存储。

### Host API 集成测试

覆盖 Query API 只读现有 Projection、UI 命令进入 Command
API、失败不假报成功、并发冲突提示、连接状态不泄露秘密、缺失能力明确报错、Host
断开后可恢复查询。

### DSH 宿主测试

必须在锁定 DSH 0.2.1-rc.3 上验证： - UI
插件加载、学业入口注册、页面挂载； - Host/Client API 通信； -
卸载后入口和订阅清理，重载后无重复； - Desktop 与 Web Profile 正常； -
UI 卸载不停止后台同步和提醒； - Host 停止后 UI 显示不可用； - UI
重载不会创建第二个 Scheduler/Dispatcher。

若锁定版本缺少扩展点，应记录缺口，不能用 Mock 冒充宿主验收。

### 端到端测试

使用 Fixture LMS 验证：打开 UI → 读取课程/作业 → 手动同步 →
新作业进入任务列表 → 预览计划 → 确认计划 → 修改任务状态 →
刷新/重启后状态保留 → 同步失败时保留旧数据并标记 Stale →
凭据失效时提示重新认证 → 卸载 UI 后后台任务继续。

Fixture E2E 不等于真实 LMS 验收。

## 12. 分阶段实施

### UI-0：宿主验证与最小入口

检查 DSH 0.2.1-rc.3 的 Client Plugin、UI Slot、导航、Host/Client API 和
Bundle 构建；建立最小学业入口，通过真实 Query API 显示课程列表；验证
Desktop/Web、卸载和 Host 生命周期。交付可运行原型、验证记录和必要 ADR。

### UI-1：只读总览

实现 Dashboard、课程列表、作业/考试列表与详情、来源/截止/同步状态，以及
Loading/Empty/Error/Stale 状态。所有数据来自 Query API。

### UI-2：任务与计划交互

实现任务完成/重开/预计时长修改、可用时间设置、候选计划预览/确认/放弃、锁定/解锁和未安排原因。所有变更经
Command API。

### UI-3：数据源连接与凭据安全

实现连接状态、受支持来源的认证表单、重新认证、断开/删除凭据和同步错误信息。验证秘密不进入浏览器存储、事件、普通日志或
Agent 上下文。

### UI-4：自动化、提醒与体验完善

实现自动化启停、同步记录、通知已读、提醒设置、响应式和可访问性。UI
只展示后台状态，不复制后台执行逻辑。

## 13. 完成定义

-   [ ] Academic UI 作为 DSH Client 扩展加载，不是重新构建的 Harness。
-   [ ] 同一 UI 在已验证的 DSH Desktop 和 Web 环境运行。
-   [ ] 锁定版本的插件接口和构建方式有真实验证记录。
-   [ ] UI 不直接访问 SQLite、Event Store 或 Credential Vault。
-   [ ] 所有业务变更经受控 Command API。
-   [ ] 总览、任务、计划、连接和自动化状态有可用页面。
-   [ ] "已保存凭据"不会误报为"平台已验证可用"。
-   [ ] UI 卸载不影响 Host、Scheduler、Dispatcher 和后台同步。
-   [ ] UI 挂载/重载不会重复创建 Host。
-   [ ] 凭据不写入客户端持久存储、事件或普通日志。
-   [ ] Loading、Empty、Stale、Auth Required、Conflict、Unavailable
    状态正确。
-   [ ] 核心 E2E、Host API 和锁定 DSH 版本测试通过。
-   [ ] 文档明确列出未验证能力，不把计划写成已实现。

## 14. 明确禁止

-   不创建第二套 Electron/Tauri 桌面壳作为首版。
-   不为 Desktop 和 Web 复制两套业务 UI。
-   不启动第二份 Academic Runtime 服务 UI。
-   不让 UI 直接操作 Event Store、Projection、Scheduler 表或 Vault。
-   不在 Client 中复制领域规则或 Planner 算法。
-   不把 Agent Chat 当作唯一学业管理界面。
-   不将普通查询、同步、去重、提醒或基础规划改成 LLM 工作流。
-   不在前端存储密码、Token、Cookie 或凭据引用。
-   不让模型参数自证用户授权。
-   不因 DSH 主分支 API 存在，就假设锁定版本已支持。
-   不为首版引入身份平台、多租户、微服务、插件市场或任意脚本执行界面。

## 15. 与现有文档的关系

Intent 决定产品方向；主 Architecture Spec
定义内核、事件、插件、调度、连接和安全边界；本文细化前端交互、DSH Client
集成和 UI 验收；AGENTS.md 记录开发约束与当前状态；ADR 记录 DSH
版本、客户端扩展接口和运行形态的验证结论。

若本 Spec 与 Intent 冲突，以 Intent
为准。若锁定版本不支持某项设计，应记录实际限制并提出最小调整方案，不得默默改变方向。

## 北极星约束

**Academic Agent 的 UI
负责让用户看清事实、调整计划和控制自动化；内核负责保存权威状态；确定性程序负责日常重复工作；Agent
只在真正需要智能时介入。**

DSH Desktop 和 Web 是入口，不是 Academic Agent
的业务核心。前端可以替换，用户的学业事实和后台自动化不应随 UI
加载、卸载或重构而丢失。
