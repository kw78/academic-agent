# 0009 — Connection Manager 与 Credential Vault

- 状态：已接受
- 日期：2026-10-27
- 相关：Architecture §4、§11、§15；Intent I-05、I-06；CRED-01/02

## 背景

接入需要登录的真实课程平台时，密码、Token、Cookie 不能进入 Event Store、核心投影、普通配置或日志，也不能暴露给 Agent。连接生命周期与学业事实必须分离。

## 决策

- 新增 `academic-connections`：
  - `ConnectionManager` 管理连接元数据、状态、授权范围、验证/同步时间；元数据存于运行时表 `source_connections`，不进入领域事件。
  - `CredentialVault` 只负责秘密的 set/get/delete；当前实现为 Windows DPAPI（CurrentUser），密文文件存放在用户本地目录；系统能力不可用时失败关闭，无明文回退。
  - SQLite 只保存 `credential_ref` 与 `has_credential`，不保存秘密；`ConnectionView` 不暴露引用或秘密。
- Connector 只通过 `ConnectionCredentialProvider.openCredential(connectionId, sourceId)` 获取租约；source 不匹配、状态不可用或秘密缺失一律拒绝。Adapter 的 `fetch(context)` 只能拿到该租约。
- 连接状态：`unconfigured → configured → connected`；认证失败转 `auth-required`，断开为 `disconnected`。只有配置/连接状态可同步。
- Adapter 认证失败由 Connector 标记 `auth-required` 并保留旧数据；同步成功标记 `lastSyncAt`。
- CLI 凭据输入使用隐藏输入，不进入命令参数或日志；Agent Tool 依赖中不包含 ConnectionManager/Vault。
- 断开默认保留已同步数据；删除凭据只删除秘密，不删除领域事件。

## 结果

- 77 项测试通过，包含 DPAPI 加密同步 E2E、认证失败、断开、source mismatch、重启恢复、fail-closed。
- Agent 工具无法获得凭据；领域事件/核心投影/同步记录中无明文。
- 真实 LMS Adapter 尚未实现，R4 仍未完成。

## 代价与后续

- DPAPI 是 MVP OS-backed 实现；Windows Credential Manager 或其他 OS vault 可替换 `CredentialVault`。
- OAuth 流程未实现；当前支持 password/token/none 元数据与隐藏输入。
- 密码登录的验证码/MFA、账号锁定策略与平台条款仍需在 Adapter 层单独评估。
