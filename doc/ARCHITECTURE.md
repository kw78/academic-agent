# Academic Agent Architecture

> 文档状态：建议架构基线（Draft for implementation）\
> 规划日期：2026-10-28\
> 审查基准：本次审查读取的 `kw78/academic-agent` `main` 分支，提交
> `a5cb688`。若代码已变化，请在合并前对照当前实现校准。\
> 配套路线图：[`ROADMAP.md`](./ROADMAP.md)

## 1. 概述

Academic Agent 是一个以本地学业数据为中心的 Agent
应用。它通过受控的数据源接入流程读取课程平台信息，将外部数据标准化，再经由既有
Connector/Kernel 路径进入应用的事件与查询模型，并由 DSH UI 展示和管理。

架构的核心原则是：

-   **Kernel 控制写入：** 外部 Adapter、AI 和 UI
    均不得绕过业务命令入口直接写入业务表。
-   **数据源与会话分离：**
    网站登录会话只是访问凭据，不等于一个可同步的数据源。
-   **能力显式声明：** 每个 Engine/Adapter
    必须明确声明支持的登录、验证、同步和权限能力。
-   **AI 产出候选而不是权限：**
    模型可以提出配置或代码，但不能自行扩大权限、直接安装插件或绕过验证。
-   **先可验证再启用：** 数据提取结果需经过 Schema 校验、预览和授权。
-   **可追溯与可恢复：**
    同步运行、适配器版本、数据来源和错误应能追踪；失败不应破坏最后一次有效数据。

## 2. 当前状态与目标状态

### 当前已存在的基础

基于本次源码审查，仓库已经具备以下基础模块：

-   DSH UI 与 Host API 分离。
-   Kernel / 命令与事件写入路径。
-   Connector 和标准化学业数据接口。
-   Source Engine Registry、数据源配置和连接记录。
-   浏览器登录、Cookie 会话保存和受控抓取能力。
-   会话抓取已按 Cookie 属性筛选、逐跳校验重定向、阻断私网/元数据地址，并设置超时与流式响应字节上限。
-   `blackboard` 引擎提供课程/作业只读 Adapter，输出经预览后进入 Connector/Kernel。
-   声明式 Adapter Runtime 已提供版本化 Manifest：HTML/JSON 提取、分页、允许域名、样本回放和版本激活/回滚。
-   Agent 工具用于查询数据源、获取会话页面和维护数据源配置。
-   Fixture 数据源可作为测试基础。

### 当前尚未形成的闭环

-   通用 `web_sessions` 会话不会自动转化为可同步的 Academic 数据源。
-   `browser-session` 引擎当前主要提供登录/验证能力，尚无完整的
    `createAdapter` 同步实现。
-   AI
    生成候选、沙箱测试、版本注册、审批、启用和回滚的流水线尚未完整实现。
-   会话抓取的 DNS 解析已在请求前校验，但尚未固定解析结果，DNS rebinding 仍是残余风险。

本文件中的目标架构是渐进式演进方案，不代表以上目标已经在当前分支实现。

## 3. 逻辑架构

``` mermaid
flowchart TB
    User[用户]
    UI[DSH UI]
    HostAPI[Host Remote API]
    AppSvc[应用服务 / 生命周期服务]
    Agent[Agent Orchestrator]
    Tools[受控 Agent Tools]
    SourceReg[Source Engine Registry]
    SourceStore[Source Config Store]
    SessionSvc[Web Session Service]
    Vault[加密凭据库]
    AdapterRuntime[Adapter Runtime]
    Sandbox[隔离候选执行环境]
    Connector[Connector Service]
    Kernel[Kernel Commands / Domain Services]
    EventStore[(Event Store / SQLite)]
    Projections[查询投影与读取模型]
    Scheduler[Scheduler / Sync Jobs]
    Preview[同步预览与审批]

    User --> UI
    UI --> HostAPI
    HostAPI --> AppSvc
    AppSvc --> SourceStore
    AppSvc --> SourceReg
    AppSvc --> SessionSvc
    SessionSvc --> Vault
    Agent --> Tools
    Tools --> HostAPI
    Tools --> SessionSvc
    Tools --> Preview
    SourceReg --> AdapterRuntime
    AdapterRuntime --> SessionSvc
    AdapterRuntime -.候选版本.-> Sandbox
    Sandbox --> Preview
    Preview --> AppSvc
    Scheduler --> AppSvc
    AppSvc --> Connector
    Connector --> Kernel
    Kernel --> EventStore
    EventStore --> Projections
    Projections --> HostAPI
    UI --> Projections
```

### 组件边界

  -------------------------------------------------------------------------------------------------------------------------
  组件                    责任                                                 不应负责
  ----------------------- ---------------------------------------------------- --------------------------------------------
  DSH UI                  展示状态、收集输入、呈现预览和确认操作               直接访问数据库、保存明文凭据、执行抓取脚本

  Host Remote API         验证请求、调用应用服务、统一返回结果                 解析任意网站、执行模型生成的代码

  应用服务 / 生命周期服务 协调创建数据源、登录、验证、预览、授权、同步和归档   把所有平台逻辑写死在一个巨型 API 方法中

  Source Config Store     持久化非秘密的数据源配置、版本和状态                 存储明文密码或 Cookie

  Web Session Service     受控浏览器登录、会话保存、域名授权、抓取和删除       自动推断任意页面都可以用于正式同步

  Vault                   加密保存 Cookie、Token 等秘密；提供受控读取          将秘密返回给普通 UI 或日志

  Source Engine Registry  注册并查询可信 Engine 能力                           无验证地加载 AI 生成的代码

  Adapter Runtime         请求允许的页面、提取数据、映射为标准结构             直接写入 Event Store

  Candidate Sandbox       隔离执行待验证的候选适配器                           访问主进程内存、凭据库或任意网络

  Connector Service       标准化、校验、协调同步和重复数据处理                 直接绕过 Kernel 进行业务写入

  Kernel / Domain         执行业务命令、维护领域规则和事件                     依赖具体网站 HTML 结构
  Services                                                                     

  Event Store / Read      保存事件、提供查询投影                               负责登录或网页抓取
  Models                                                                       

  Agent Orchestrator      规划步骤、使用受控工具、生成候选                     自行批准和部署候选代码
  -------------------------------------------------------------------------------------------------------------------------

## 4. 主要数据流

### 4.1 添加平台、登录和验证

``` mermaid
sequenceDiagram
    actor U as 用户
    participant UI as DSH UI
    participant API as Host API
    participant S as Source Lifecycle Service
    participant W as Web Session Service
    participant V as Vault
    participant E as Source Engine / Verifier

    U->>UI: 添加平台 URL
    UI->>API: 创建待配置数据源
    API->>S: createSource
    S-->>UI: sourceId + draft 状态
    U->>UI: 开始登录
    UI->>API: startLogin(sourceId)
    API->>W: 打开隔离登录上下文
    W-->>U: 展示登录浏览器
    U->>W: 完成登录并确认
    W->>V: 加密保存会话凭据
    W-->>API: session saved
    API-->>UI: 会话已保存（尚未验证）
    UI->>API: verifySession(sourceId)
    API->>E: 使用受限请求访问受保护资源
    E-->>API: 验证结果与可访问能力
    API-->>UI: 已验证 / 需要重新登录 / 失败
```

关键约束：

-   登录页中的"完成"操作只表示用户完成了交互，不证明登录有效。
-   会话验证必须访问实际受保护资源或运行平台专用的验证逻辑。
-   用户输入的密码只存在于登录页面上下文中，不进入 Agent
    prompt、普通日志或业务配置。
-   如果平台使用额外的本地存储、CSRF Token
    或其他机制，必须明确支持范围；不能假设 Cookie 足以完成所有认证流程。

### 4.2 候选适配器与首次同步

``` mermaid
flowchart TD
    Evidence[授权页面样本与结构证据]
    Generate[Agent 生成候选 Manifest / Adapter]
    Static[静态策略与 Schema 校验]
    Sandbox[隔离环境运行]
    Fixtures[固定样本与边界用例]
    Preview[差异预览：新增 / 更新 / 跳过]
    Approve{用户授权启用?}
    Registry[版本化 Adapter Registry]
    Sync[正式同步任务]
    Normalize[标准化与去重]
    Kernel[Kernel 命令入口]
    Store[(Event Store)]
    Reject[拒绝候选 / 继续修复]

    Evidence --> Generate --> Static
    Static -->|通过| Sandbox
    Static -->|失败| Reject
    Sandbox --> Fixtures
    Fixtures -->|通过| Preview
    Fixtures -->|失败| Reject
    Preview --> Approve
    Approve -->|是| Registry --> Sync --> Normalize --> Kernel --> Store
    Approve -->|否| Reject
```

这条流水线必须是显式的。模型输出不是已启用
Adapter，预览不是正式写入，用户授权也不能替代自动化测试。

## 5. 数据模型与状态

### 5.1 核心实体

#### SourceDefinition

表示"从哪里读取什么数据，以及使用什么可信引擎"。

建议字段：

-   `sourceId`
-   `displayName`
-   `engineId`
-   `configVersion`
-   `nonSecretConfig`
-   `capabilities`
-   `enabled`
-   `archived`
-   `createdAt` / `updatedAt`

禁止将 Cookie、密码或 Token 放进 `nonSecretConfig`。

#### WebSession

表示用于访问一个站点的会话凭据和访问边界。

建议字段：

-   `sessionId`
-   `originHost` 或受限的域名授权集合
-   `label`
-   `secretRef`（指向 Vault，不包含秘密本身）
-   `createdAt` / `expiresAt`（如可确定）
-   `lastVerifiedAt`
-   `status`

`loginUrl`
如需保留，应脱敏并避免保存不必要的查询参数。会话应能被独立撤销和删除。

#### AdapterManifest / AdapterVersion

表示经过验证、具有明确权限范围的提取逻辑。

建议字段：

-   `adapterId`
-   `version`
-   `manifest` 或受控代码包的内容摘要
-   `allowedOrigins`
-   `allowedPaths`
-   `allowedMethods`
-   `requiredCapabilities`
-   `schemaVersion`
-   `testReportRef`
-   `approvalRecord`
-   `status`（candidate / validated / active / disabled / revoked）
-   `createdAt`

#### SyncRun

每次同步均应留下可追踪的记录：

-   `runId`
-   `sourceId`
-   `adapterVersion`
-   `startedAt` / `finishedAt`
-   `status`
-   `recordsRead` / `recordsCreated` / `recordsUpdated` /
    `recordsSkipped`
-   `errorCode` / `safeErrorSummary`
-   `traceId`

#### Normalized Academic Item

标准化数据至少需要能够表达：

-   稳定的内部 ID 与来源 ID
-   所属课程
-   标题、类型和描述（如适用）
-   开始/截止时间及明确的时区语义
-   来源平台和首次/最近观测时间
-   字段完整度或解析警告

具体字段应沿用仓库已有的 contracts，避免另起一套不兼容的平行模型。

### 5.2 将状态拆成三个维度

不要用单个 `connected` 字段表达所有状态。

  ------------------------------------------------------------------------------
  维度                    示例状态                含义
  ----------------------- ----------------------- ------------------------------
  配置状态                draft / configured /    数据源定义是否存在、是否可用
                          archived                

  认证状态                not-required / missing  会话是否存在且是否验证通过
                          / saved / verified /    
                          expired / rejected      

  同步健康                never-synced / running  最近同步的执行情况与新鲜度
                          / healthy / partial /   
                          auth-required / failed  
                          / stale                 
  ------------------------------------------------------------------------------

UI
可根据三个维度合成面向用户的摘要，但底层必须保留各自语义。例如：会话已验证，但
Adapter 尚未就绪；或者 Adapter 可用，但最近一次同步因平台超时而失败。

## 6. Adapter 与 Connector 契约

### 6.1 Adapter 的职责

Adapter 应负责：

1.  在授权范围内读取外部数据。
2.  解析响应并转换成标准化候选记录。
3.  报告来源 ID、分页情况、缺失字段和解析警告。
4.  将平台特定错误映射为明确的错误类型。

Adapter 不负责：

-   直接写业务数据库或 Event Store。
-   自行创建高权限 Host 工具。
-   自行修改调度策略或凭据权限。
-   隐藏部分失败或用虚构字段填充缺失数据。

### 6.2 推荐的运行接口

以下是概念接口，不是对当前 TypeScript 类型的逐字描述：

``` ts
interface AcademicSourceAdapter {
  describe(): AdapterDescriptor;

  verify(context: AdapterContext): Promise<VerificationResult>;

  fetch(
    context: AdapterContext,
    cursor?: SyncCursor,
  ): Promise<AdapterFetchResult>;
}

interface AdapterFetchResult {
  records: NormalizedAcademicRecord[];
  nextCursor?: SyncCursor;
  warnings: AdapterWarning[];
  complete: boolean;
}
```

运行时应对 Adapter 的输入输出做 Schema
校验，并给请求、执行时间、响应大小和输出记录数设置上限。若仓库现有接口与此不同，应通过兼容性评估决定是否扩展，而不是为了命名统一而破坏已有调用方。

### 6.3 优先声明式，必要时才使用代码

建议 Adapter 优先级：

1.  已审核的静态 Adapter。
2.  声明式 Manifest（页面规则、JSON 路径、字段映射、分页）。
3.  仅在声明式规则无法表达时，才考虑受控脚本。
4.  任意代码只能在独立沙箱中运行，且必须通过统一契约和测试。

沙箱应具有独立进程或容器边界、受限网络、只读输入、资源配额和明确的超时策略。单纯使用
`vm` 或在同一进程中包装函数，不应被视为完整的安全隔离。

## 7. 会话与网页抓取安全

会话抓取是整个架构中最敏感的边界之一。

### 7.1 Cookie 处理

-   按目标 URL 的 host/domain、path、secure 和有效期规则筛选 Cookie。
-   不将整份 Cookie 库无条件拼成请求头。
-   HTTPS 会话默认不允许重定向到 HTTP。
-   会话只用于明确授权的站点范围；跨域 SSO
    必须作为显式、可审计的授权扩展处理。
-   删除会话时同步撤销可访问引用；不得把 Cookie 复制到普通数据源配置。

### 7.2 SSRF 与重定向

-   仅允许 HTTP(S)。
-   每次请求和每一跳重定向都校验目标。
-   默认阻止 loopback、私有网络、链路本地、云元数据和其他非预期目标。
-   对 DNS 解析结果、重绑定、IPv4/IPv6 表示和重定向链进行防护。
-   设置请求超时、重定向上限、响应字节上限和并发限制。
-   不能仅凭初始 URL 的域名判断最终请求安全。

### 7.3 外部内容与 Prompt Injection

网页正文、HTML 属性、页面脚本、课程描述和附件元数据都是不可信输入。

-   只把完成当前任务所需的有限页面证据提供给 Agent。
-   将网页内容作为数据而非指令处理。
-   Agent 工具使用结构化参数、域名/路径授权和明确的读写权限。
-   网页内容不得自行授权新的域名、安装依赖、调用 shell 或扩大工具权限。
-   在日志和诊断页面中清理敏感字段与可能误导操作人员的外部文本。

### 7.4 凭据与日志

-   Vault 负责秘密的加密存储和受控读取。
-   UI 只拿到会话状态和脱敏标签，不拿到 Cookie 值。
-   日志采用字段级脱敏；异常消息不得直接回显带认证参数的 URL。
-   定义会话过期、手动撤销、数据源归档和删除时的清理语义。
-   任何需要向模型提供的诊断上下文都必须经过最小化和脱敏。

## 8. 同步正确性、去重与恢复

### 8.1 幂等性

每个外部记录优先使用平台提供的稳定 ID。没有稳定 ID
时，使用定义清晰、可版本化的确定性指纹，例如由
`sourceId`、课程标识、记录类型、规范化标题和平台时间字段组成。

不能把抓取时间或随机数放入主去重键，否则每次同步都会创建重复事项。指纹算法变更需要迁移和兼容策略。

### 8.2 写入路径

建议保持：

`Adapter → Schema Validation → Connector → Domain Command → Event Store → Read Model`

Connector
应负责批次协调、重复检测、部分失败处理和写入结果汇总。所有业务写入都经过
Kernel/Domain Commands。

### 8.3 失败处理

-   认证失败：标记
    `auth-required`，停止无意义的自动重试，提示用户重新登录。
-   网络瞬时错误：有限次数退避重试。
-   429：遵循服务端的重试提示和合理退避。
-   平台 5xx：保留最后有效数据并记录失败。
-   解析错误：停止有风险的批量写入，保留样本摘要并进入候选修复流程。
-   部分成功：明确记录成功、跳过和失败数量。
-   重复触发：对同一数据源使用互斥或幂等运行机制。

任何"失败"都不能被映射为"同步成功"；部分结果不能静默冒充完整结果。

## 9. API 与权限设计

所有会改变状态的操作都应通过 Host API
和应用服务执行，并有统一的输入校验、错误类型和审计记录。

建议按能力划分工具权限：

  能力                       默认权限
  -------------------------- ------------------------------------------
  列出数据源、读取同步状态   只读
  读取已授权会话的页面       只读，但受域名、路径、响应大小和速率限制
  创建/修改数据源配置        写操作，需要应用层授权
  生成候选适配器             仅创建候选，不启用
  启用候选版本               明确审批
  执行正式同步               仅调用已启用、已验证的版本
  删除会话、撤销授权         明确用户操作，并返回可确认的结果

不能因为某个工具由 Agent
调用，就默认它拥有与用户相同的全部权限。工具权限、会话权限和数据源权限应独立校验。

## 10. 可观测性与测试

### 可观测性

每次同步应能回答：

-   使用了哪个 `sourceId` 和 Adapter 版本？
-   使用的会话是否通过验证？（不得记录秘密）
-   请求了哪些经脱敏的页面路径？
-   读取、解析、创建、更新和跳过了多少记录？
-   哪个步骤失败、失败类型是什么？
-   是否有可回滚的上一有效版本？

建议使用关联 ID 将 UI 操作、Host API、同步运行和 Kernel 命令串联起来。

### 测试分层

1.  **单元测试：** Cookie 选择、URL
    策略、Schema、解析、状态转换、指纹和时间转换。
2.  **集成测试：** Vault、Session Service、Source Store、Connector 和
    Kernel 之间的边界。
3.  **安全测试：**
    SSRF、重定向、DNS/地址策略、超大响应、超时、日志脱敏和 Prompt
    Injection。
4.  **契约测试：** 每个 Adapter 的输入输出都满足统一 Schema。
5.  **回放测试：** 对固定页面样本重复执行，检测解析回归。
6.  **端到端测试：**
    至少一个授权测试平台完成登录、验证、预览、用户确认、同步和 UI 展示。
7.  **故障演练：** 会话过期、平台
    429/5xx、网络断开、分页中断、重复运行和候选版本回滚。

## 11. 关键架构决策（建议作为 ADR）

### ADR-A：数据源与 Web Session 分离

**决定：** Web Session 是凭据与访问能力；Source Definition
是数据接入配置；Adapter
是数据提取实现。三者通过明确引用关联，不互相替代。

**原因：**
登录成功不等于数据提取成功；同一会话可能访问多个页面，而一个数据源也可能需要额外的解析规则。

### ADR-B：AI 生成只创建候选版本

**决定：**
模型输出不自动获得生产执行权。候选必须经过静态检查、隔离测试、样本验证和用户授权。

**原因：**
任意生成代码可能访问敏感数据、请求未授权地址或破坏数据正确性。

### ADR-C：正式写入只能经过 Kernel

**决定：** Adapter 和 Connector 不直接写 Event Store；业务变化通过现有
Domain Command/Kernel 写入路径完成。

**原因：** 保持领域规则、事件语义、审计和数据一致性集中管理。

### ADR-D：状态分维度表达

**决定：** 分开记录配置、认证和同步健康状态。

**原因：** 避免 UI 把"保存 Cookie""登录有效""Adapter
可用"和"同步成功"误认为同一件事。

### ADR-E：声明式优先，代码沙箱兜底

**决定：**
常见页面提取使用声明式配置；只有确实无法表达时才允许受限脚本。

**原因：** 声明式配置更容易验证、审计、回放和维护。

## 12. 渐进式落地顺序

1.  修复会话安全边界并建立回归测试。
2.  修复 Source 创建、配置校验和 UI 状态。
3.  打通一个真实平台的只读同步。
4.  抽象可版本化的声明式 Adapter。
5.  增加 AI 候选生成与沙箱验证。
6.  完善版本注册、审批、灰度、回滚和运维工具。

每一步都应优先复用现有模块和
contracts。若新设计与现有类型不一致，先增加兼容层或
ADR，不要未经迁移评估就同时维护两套数据模型。

## 13. 尚待项目维护者确认的问题

-   首个正式支持的平台是哪一个？是否有可长期使用的授权测试账号？
-   课程、作业、考试、成绩中，MVP 首发必须支持哪些实体？
-   用户是否只在本地使用，还是需要跨设备/云端部署？这会改变凭据存储与隔离模型。
-   是否允许平台级跨域 SSO？若允许，需要怎样的显式授权和域名白名单？
-   用户删除会话、删除数据源或退出平台时，已同步的学业数据应保留、归档还是删除？
-   自动同步频率、失败重试上限和通知方式是什么？
-   候选 Adapter 的审批者是否始终是终端用户？是否需要管理员策略？
-   生成脚本的沙箱部署目标是什么（独立进程、容器或其他隔离执行服务）？

在这些问题确认前，应把安全边界、数据源生命周期和一个平台的端到端闭环作为确定性工作；不要提前承诺任意网站自动适配。
