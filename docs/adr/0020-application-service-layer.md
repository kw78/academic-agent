# 0020 — 宿主无关应用服务层

- 状态：已接受
- 日期：2026-10-28

## 背景

组合根 `apps/academic-cli` 同时承担能力装配与大量用例编排（来源同步、探测、候选激活、课程删除等），DSH Host 通过 `@academic/cli` 获取应用。UI 的 `api.ts` 又各自实现了一份来源写入规则：

- 快速添加去重、认证方式/登录方式校验、配置校验；
- 删除来源时先删凭据再删配置；
- 登录后创建/更新连接、保存秘密并验证；
- “同步全部”时自行挑选来源与连接。

同一规则多份实现，CLI、UI 与 Agent 已经出现差异（例如 CLI 不去重，UI 直接调用 store）。

## 决定

1. 新增宿主无关包 `@academic/application`：
   - `createAcademicApp` 与备份恢复从 `apps/academic-cli` 迁入；
   - 应用服务拥有来源写入规则：`createSource`、`updateSource`、`archiveSource`、`restoreSource`、`deleteSource`、`loginSource`、`syncAllSources`；
   - 同步、探测/录制、课程管理、候选启用继续由应用层持有。
2. CLI、UI API、Agent 工具只做参数校验、授权、DTO 映射与展示；写入不再直接调用 `sources.*` / `connections.*`。
3. Agent 工具依赖新增可选 `createSource` / `updateSource` 回调；宿主提供时优先使用，缺失时保留旧的窄接口作为兼容路径。
4. DSH Host、UI 与服务端代码导入 `@academic/application`；`@academic/cli` 保留 re-export 兼容旧测试与脚本，CLI 自身只负责命令解析与输出。
5. 错误码保持既有语义：未知 engine 为 `CAPABILITY_UNAVAILABLE`；能力/配置校验为 `VALIDATION`，配置错误消息保留“配置无效：”前缀。

## 后果

- 三个入口共用同一套来源规则；UI 不再持有去重与删除顺序。
- `syncAllSources` 跳过未验证会话的来源，而不是让整次“同步全部”失败。
- 包边界更清晰：`application → 功能包 → contracts`，Host/UI/CLI 只依赖 application 与 contracts。
- 尚未拆分为多个细粒度服务类；`app.ts` 仍较大，但业务规则已集中在一个宿主无关包内，可按真实需求再拆分。
