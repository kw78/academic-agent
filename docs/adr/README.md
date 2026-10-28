# Architecture Decision Records

| ADR | 决策 | 状态 |
|---|---|---|
| [0001](0001-event-sourced-sqlite-kernel.md) | SQLite Event Store + 同事务核心投影 | 已接受 |
| [0002](0002-host-agnostic-core-dsh-deferred.md) | 先构建宿主无关内核，DSH/Cordis 绑定延后到 M0 | 已接受 |
| [0003](0003-deterministic-automation-and-planner.md) | 同步、去重、提醒、基础规划零 LLM | 已接受 |
| [0004](0004-replan-request-deduplication.md) | 稳定 replanRequestId + pending 合并，避免重复计划 | 已接受 |
| [0005](0005-dsh-bundle-integration.md) | DSH bundle 集成；本机 0.2.1-rc.3 已验证工具注册与执行 | 已接受（M0 部分） |
| [0006](0006-mvp-reliability-fixes.md) | P0 可靠性修复：调度、checkpoint、可信写入、默认任务、可用时间 | 已接受 |
| [0007](0007-periodic-deadline-reminders.md) | 72h/24h 截止提醒、去重与重启补偿 | 已接受 |
| [0008](0008-dsh-plugin-split.md) | DSH host/planner/tools 独立 Cordis 插件与生命周期验证 | 已接受 |
| [0009](0009-connection-manager-and-credential-vault.md) | Connection Manager、DPAPI Credential Vault 与受控凭据同步 | 已接受 |
| [0010](0010-dsh-client-ui-and-remote-api.md) | DSH 客户端 UI 插件与 Typert Remote API 适配 | 已接受 |
| [0011](0011-candidate-staging-and-unified-activation.md) | 候选暂存、统一激活与 source 级作业请求 | 已接受 |
| [0012](0012-editable-personal-data.md) | 个人数据编辑、事件软删除/恢复与数据源彻底删除 | 已接受 |
| [0013](0013-agent-adapter-automation.md) | 用户一次性授权的 Agent 自动接入 | 已接受 |
| [0014](0014-course-material-library.md) | 课程资料库：文件/索引分离、FTS5 检索与受控附件导入 | 已接受 |
| [0015](0015-course-identity-merge.md) | 同学期同名课程合并：来源别名、事项迁移与重复课程关闭 | 已接受 |
| [0016](0016-declarative-readonly-post.md) | 声明式 Adapter 的显式只读 POST：JSON body、body 内分页与按请求匹配样本 | 已接受 |
| [0017](0017-per-source-sync-jobs.md) | 每个真实来源的持久同步作业与生命周期联动 | 已接受 |
| [0018](0018-application-backup.md) | 数据库 + 资料 + SHA-256 清单的完整应用备份包 | 已接受 |
| [0019](0019-multi-step-failure-semantics.md) | 课程删除重读重试、候选启用失败回滚 | 已接受 |
| [0020](0020-application-service-layer.md) | 宿主无关应用服务层与来源写入规则收口 | 已接受 |
| [0021](0021-readonly-form-post-and-requested-with.md) | 只读表单 POST 与唯一允许的 X-Requested-With 头 | 已接受 |

新增决策时按 `NNNN-kebab-title.md` 命名，并更新本索引。已接受决策的契约不得静默修改；需要变更时新增 ADR 并说明迁移方案。
