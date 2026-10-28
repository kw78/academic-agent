# 0017 — 每个真实来源的持久同步作业

- 状态：已接受
- 日期：2026-10-28

## 背景

后台只注册了 fixture 同步、重规划与提醒三个作业。真实来源虽然可手动同步，但没有进入周期执行；设置页的“同步周期”修改的也是 `fixture-lms-sync`，因此“连接平台后自动更新”的闭环并不存在。

## 决定

1. 每个可同步来源拥有稳定作业 `source.sync.<sourceId>`，kind 为 `connector.sync.source`，payload 为 `{ sourceId }`。
2. 通过 `SourceConfigStore.onChange` 在创建/启用/恢复时确保并恢复作业，在归档/禁用/删除时暂停；组合根只在这一处协调，不在每个调用点重复规则。
3. 作业运行前按来源 `authKind` 选择已 `connected` 的连接；没有已验证连接时记录 `skipped: auth-required` 并保持作业启用，不计为失败；与手动同步并发时记录 `skipped: busy`。
4. `fixture-lms` 继续使用专属 `fixture-lms-sync`（附带内置课程注册），不生成来源作业。
5. 设置页的同步周期由 `applySyncInterval()` 同时应用到 fixture 与所有来源作业，保留每个作业的 enabled 与用户暂停状态。
6. 启动时只 `ensureJob`，不恢复用户暂停的作业；暂停/恢复只发生在明确的来源状态变化或用户操作。

## 后果

- 真实来源在会话有效时自动同步；会话失效时安静跳过，由连接状态提示重新登录。
- 自动化页会多出按来源的作业条目；删除来源后作业保留为暂停状态，可重命名或重新创建同名来源时复用。
- 作业仍只调用 Connector/Kernel 路径，不引入模型或新的执行能力。
