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

## DB source + 通用浏览器 engine（已实现）

Blackboard 是数据库中的一条 source 配置，不是应用层 vendor 插件：

```text
source_id = ustc-blackboard
engine = browser-session
auth_kind = token
login_mode = browser
config_json = { loginUrl, authenticatedUrlPatterns, cookieDomains, verifyUrl, loggedOutPatterns }
```

通用 `browser-session` engine 拉起 Edge/Chrome，用户自己完成 USTC SSO 和验证码；成功后只读取配置域名下的会话 Cookie 并写入 DPAPI。应用不读取统一认证密码，也不绕过验证码。

```bash
cd D:/project/classhelper
ACADEMIC_DB=.data/bb-probe.db npm run demo -- source add ustc-blackboard "USTC Blackboard" --engine browser-session --auth token --login-mode browser --config "{\"loginUrl\":\"https://www.bb.ustc.edu.cn/\",\"authenticatedUrlPatterns\":[\"^https://www.bb.ustc.edu.cn/\"],\"cookieDomains\":[\"bb.ustc.edu.cn\"],\"verifyUrl\":\"https://www.bb.ustc.edu.cn/webapps/portal/execute/tabs/tabAction?tab_tab_group_id=_1_1\",\"loggedOutPatterns\":[\"/webapps/login\",\"id.ustc.edu.cn/cas\"]}"
ACADEMIC_DB=.data/bb-probe.db npm run demo -- source login ustc-blackboard
ACADEMIC_DB=.data/bb-probe.db npm run demo -- source sync ustc-blackboard
```

桌面端“连接”页也通过同一套 DB source + engine 接口添加/登录/同步，UI 不认识学校名称。正式 Blackboard 作业/考试解析规则尚未实现，`source sync` 当前会明确报告能力缺失，不会伪造同步结果。

凭据只进入 DPAPI；source `config_json` 禁止 password/token/cookie 字段。调试 HTML/诊断文件应放在 `.data` 并定期删除；不要把 Cookie 粘贴到聊天、Issue、日志或任何远端工具。

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
