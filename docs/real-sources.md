# 真实数据源接入状态

## 当前结论

**R4 尚未完成。** 目前只有 `fixture-lms`，不能作为真实平台验收。

凭据连接 MVP 已具备：可创建连接、隐藏输入凭据、DPAPI 加密保存、验证/断开/删除凭据，并由 Connector 在认证失败时停止同步、保留旧数据。通用 `browser-session` engine 也已具备；真实 Adapter（抓取、解析、归一化、对账）尚未实现。

前端按 Adapter 可用性展示：当前只有内置 Fixture 数据源显示为可用；没有已实现且可验证的认证 Adapter 时，连接页不会展示认证表单，也不会把“已保存凭据”显示为“已连接”。

## 数据源模型（已实现）

数据源不是应用层 vendor 插件，而是数据库中的一条配置：

```text
source_id = my-lms
engine = browser-session
auth_kind = token
login_mode = browser
config_json = { loginUrl, authenticatedUrlPatterns, cookieDomains, verifyUrl?, loggedOutPatterns? }
```

通用 `browser-session` engine 拉起 Edge/Chrome，用户自己完成登录和验证码；成功后只读取配置域名范围内的会话 Cookie 并写入 DPAPI。应用不读取登录密码，也不绕过验证码。

UI、CLI 与 Agent 都通过同一套 DB source + engine 接口访问；UI 只渲染 source 元数据，不认识具体网站。`source sync` 在 engine 没有 `createAdapter` 时返回 `CAPABILITY_UNAVAILABLE`，不会伪造同步结果。

```bash
cd D:/project/classhelper
ACADEMIC_DB=.data/source.db npm run demo -- source add my-lms "My LMS" --engine browser-session --auth token --login-mode browser --config "{\"loginUrl\":\"https://lms.example.edu/\",\"authenticatedUrlPatterns\":[\"^https://lms.example.edu/\"],\"cookieDomains\":[\"lms.example.edu\"]}"
ACADEMIC_DB=.data/source.db npm run demo -- source login my-lms
ACADEMIC_DB=.data/source.db npm run demo -- source sync my-lms
```

凭据只进入 DPAPI；source `config_json` 拒绝 password/token/cookie 等凭据字段。调试 HTML/诊断文件应放在 `.data` 并定期删除；不要把 Cookie 粘贴到聊天、Issue、日志或任何远端工具。

## 可行接入路径

按 Intent/Architecture 的优先级：

1. **ICS/日历订阅**（优先）：如果课程平台提供合法可访问的 ICS/日历源，先实现 `adapters/ics`，验证 Fetch → Normalize → Reconcile。
2. **标准 API**：需要平台授权与 OAuth/密钥；拿到授权后实现对应 Adapter。
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
- 平台授权 API 的访问方式；或
- 明确授权的登录会话/测试账号，并确认允许自动化读取的范围。

在此之前，真实平台 E2E 保持“未完成”，不把 Fixture 结果当作真实验收。
