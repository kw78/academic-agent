# 真实数据源接入状态

## 当前结论

**R4 尚未完成。** 目前只有 `fixture-lms`，不能作为真实平台验收。

## USTC Blackboard 尝试

目标入口：

```text
https://www.bb.ustc.edu.cn/webapps/portal/execute/tabs/tabAction?tab_tab_group_id=_1_1
```

2026-10-27 实测：

- 请求被重定向到 `https://www.bb.ustc.edu.cn/webapps/login/`
- 返回的是 Blackboard 登录页，未登录状态无法读取课程/作业数据
- 未提供授权会话、账号或 API 凭据；没有尝试绕过登录、验证码或访问限制

## 可行接入路径

按 Intent/Architecture 的优先级：

1. **ICS/日历订阅**（优先）：如果课程平台提供合法可访问的 ICS/日历源，先实现 `adapters/ics`，验证 Fetch → Normalize → Reconcile。
2. **标准 API**：Blackboard REST/Integration 需要学校授权与 OAuth/密钥；拿到授权后实现 `adapters/bb-ustc`。
3. **已登录会话**：由用户明确提供已授权的浏览器会话或凭据；凭据只进入凭据存储，不进入事件/日志。
4. **受限浏览器自动化**：仅在前述方式不可用时考虑，必须获得授权、遵守频率限制，并把抓取失败保留为 `sync_runs` 错误。

## Adapter 实现约定（不会变）

- 只实现 Fetch / Parse-Normalize / Reconcile，不直接写 Event Store。
- 输出 `NormalizedAcademicItem`，优先使用外部稳定 ID；无 ID 时进入待确认/待处理，不自动合并。
- `partial`/空结果不清空旧事项；网络/认证失败保留旧状态。
- 用 fixture 快照覆盖新增、延期、重复、失败、分页不完整等场景。
- 首次真实接入前，必须通过 `sync_runs` 与查询核对数据，而不是只看日志。

## 需要用户提供

- 一个合法可访问的 ICS URL；或
- Blackboard 授权 API 的访问方式；或
- 明确授权的登录会话/测试账号，并确认允许自动化读取的范围。

在此之前，真实平台 E2E 保持“未完成”，不把 Fixture 结果当作真实验收。
