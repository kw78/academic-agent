# 真实数据源接入状态

## 当前结论

**R4 尚未完成。** 目前只有 `fixture-lms`，不能作为真实平台验收。

凭据连接 MVP 已具备：可创建连接、隐藏输入凭据、DPAPI 加密保存、验证/断开/删除凭据，并由 Connector 在认证失败时停止同步、保留旧数据。Blackboard Adapter 尚未实现。

前端按 Adapter 可用性展示：当前只有内置 Fixture 数据源显示为可用；没有已实现且可验证的认证 Adapter 时，连接页不会展示认证表单，也不会把“已保存凭据”显示为“已连接”。

## USTC Blackboard 尝试

目标入口：

```text
https://www.bb.ustc.edu.cn/webapps/portal/execute/tabs/tabAction?tab_tab_group_id=_1_1
```

2026-10-27 实测：

- 请求被重定向到 `https://www.bb.ustc.edu.cn/webapps/login/`
- 返回的是 Blackboard 登录页，未登录状态无法读取课程/作业数据
- 未提供授权会话、账号或 API 凭据；没有尝试绕过登录、验证码或访问限制

## 手动会话 Cookie 探针（已实现）

USTC Blackboard 没有用户名/密码表单，登录会跳转到 `id.ustc.edu.cn` CAS，并带验证码。不要自动化或绕过该流程。

已实现只读探针，流程是：

1. 用户在自己的浏览器完成 SSO 和验证码登录；
2. 从浏览器 DevTools → Network → 任一 `www.bb.ustc.edu.cn` 请求 → Request Headers 复制完整 `Cookie` 值；
3. 在本机终端用隐藏输入保存到 DPAPI，探针只下载页面并输出结构摘要。

```bash
cd D:/project/classhelper
ACADEMIC_DB=.data/bb-probe.db \
  npm run demo -- blackboard connect
# 在隐藏提示处粘贴 Cookie，输入不回显
ACADEMIC_DB=.data/bb-probe.db \
  npm run demo -- blackboard probe <connectionId>
```

探针输出 HTTP 状态、页面标题、课程链接数和诊断文件路径；`summary.json` 不包含 Cookie。`.data/bb-probe/` 下是本地诊断 HTML，可能含课程/账号相关文本，查看后应删除。不要把 Cookie 粘贴到聊天、Issue、日志或任何远端工具。

探针只验证会话可访问性和课程链接结构，**还不是正式 Adapter**；正式 Adapter 需要基于真实 HTML 实现作业/考试解析、课程注册、去重与失败保留。

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
