# 真实数据源接入状态

## 当前结论

**首个真实平台只读切片已完成**：`adapters/ustc-blackboard` 提供 Blackboard Learn 的课程、作业、考试与测验读取 Adapter，可在已登录会话下预览并同步到 Kernel。通用“任意平台自动适配”仍未完成。

凭据连接 MVP 已具备：可创建连接、隐藏输入凭据、DPAPI 加密保存、验证/断开/删除凭据，并由 Connector 在认证失败时停止同步、保留旧数据。通用 `browser-session` engine 负责登录/验证；Blackboard Adapter 复用同一会话契约读取数据。

前端按 Adapter 可用性展示：Fixture 与 Blackboard 显示同步能力；只有登录能力的 `browser-session` 不显示同步入口。没有同步 Adapter 的 engine 不会把“已保存凭据”显示为“可同步”。

## 数据源模型（已实现）

数据源不是应用层 vendor 插件，而是数据库中的一条配置。登录/会话由通用 engine 提供，平台读取由该 engine 的 Adapter 实现：

```text
source_id = my-lms
engine = browser-session | blackboard | fixture
auth_kind = token
login_mode = browser
config_json = { loginUrl, authenticatedUrlPatterns, cookieDomains, verifyUrl?, ... }
```

通用 `browser-session` engine 拉起 Edge/Chrome，用户自己完成登录和验证码；成功后只读取配置域名范围内的会话 Cookie 并写入 DPAPI。应用不读取登录密码，也不绕过验证码。`blackboard` engine 复用同一登录/验证流程，并额外提供只读课程/作业 Adapter。

UI、CLI 与 Agent 都通过同一套 DB source + engine 接口访问；UI 只渲染 source 元数据，不认识具体网站。`source sync` 在 engine 没有 `createAdapter` 时返回 `CAPABILITY_UNAVAILABLE`，不会伪造同步结果。

```bash
cd D:/project/classhelper
ACADEMIC_DB=.data/source.db npm run demo -- source add my-lms "My LMS" --engine browser-session --auth token --login-mode browser --config "{\"loginUrl\":\"https://lms.example.edu/\",\"authenticatedUrlPatterns\":[\"^https://lms.example.edu/\"],\"cookieDomains\":[\"lms.example.edu\"]}"
ACADEMIC_DB=.data/source.db npm run demo -- source login my-lms
ACADEMIC_DB=.data/source.db npm run demo -- source sync my-lms
```

凭据只进入 DPAPI；source `config_json` 拒绝 password/token/cookie 等凭据字段。调试 HTML/诊断文件应放在 `.data` 并定期删除；不要把 Cookie 粘贴到聊天、Issue、日志或任何远端工具。

## 首个真实平台：Blackboard Learn（只读）

`engine=blackboard` 复用浏览器登录/验证，读取课程、作业、考试与测验，不提交作业、不修改平台数据。推荐配置：

```text
source_id = ustc-blackboard
engine = blackboard
auth_kind = token
login_mode = browser
config_json = {
  loginUrl, authenticatedUrlPatterns, cookieDomains, verifyUrl, loggedOutPatterns,
  portalUrl, termFilter, maxCourses, maxAssignments, maxContentPages, delayMs,
  timeZone, utcOffsetMinutes, allowHttp?
}
```

```bash
cd D:/project/classhelper
ACADEMIC_DB=.data/academic.db npm run demo -- source add ustc-blackboard "USTC Blackboard" --engine blackboard --auth token --login-mode browser --config "{\"loginUrl\":\"https://www.bb.ustc.edu.cn/\",\"authenticatedUrlPatterns\":[\"^https://www\\\\.bb\\\\.ustc\\\\.edu\\\\.cn/\"],\"cookieDomains\":[\"www.bb.ustc.edu.cn\"],\"verifyUrl\":\"https://www.bb.ustc.edu.cn/webapps/portal/execute/tabs/tabAction?tab_tab_group_id=_1_1\",\"loggedOutPatterns\":[\"/webapps/login\",\"id.ustc.edu.cn/cas\"],\"portalUrl\":\"https://www.bb.ustc.edu.cn/\",\"termFilter\":[\"2026FA\"],\"maxCourses\":20,\"maxAssignments\":100,\"delayMs\":150}"
ACADEMIC_DB=.data/academic.db npm run demo -- source login ustc-blackboard
ACADEMIC_DB=.data/academic.db npm run demo -- source preview ustc-blackboard
ACADEMIC_DB=.data/academic.db npm run demo -- source sync ustc-blackboard
```

已用真实会话在临时库验证（2026-10-28）：

- `termFilter=2026FA` 共 13 门课程，其中 5 门有作业/内容区；图论 7 个作业，模拟与数字电路A 含 2 个文件夹、共 9 个作业，文件夹遍历后为 `full` 且未重复。
- 作业截止时间从详情页解析：中文日期（含“上午/下午”）、英文日期、ISO 均可；标题里出现“截止日期9月10日”时不会误用无年份文本，继续读取正文中的完整日期。
- 重复同步为 no-op；`maxCourses` / `maxAssignments` / `maxContentPages` 触顶时标记 `partial`，不清理旧数据。
- 考试/测验解析已用脱敏 fixture 覆盖（内容区、文件夹、下一页、中英文截止时间、未知截止时间）；当前账号的 2026FA 课程没有暴露测试项，因此“真实考试同步”尚未取得真实样本，不能声称已完整验收 Blackboard 测试模块。
- 附件、成绩、提交历史不读取；不提交作业、不修改平台数据。页面改版、会话过期、网络失败分别落到解析警告/`auth-required`/同步失败，不伪造成功。

授权与数据边界：只使用用户本人已完成登录的会话，只读访问课程页与作业/测试详情；不保存页面原始 HTML 到数据库，不下载附件；会话 Cookie 只存 DPAPI，删除会话不会删除已同步的学业事件。测试与真实验证均使用临时数据库，不写入桌面端默认库。

## 第二个平台：USTC 综合教务系统（考试切片）

`fixtures/declarative/ustc-jw-exam.manifest.json` 用声明式 Manifest 读取 `https://jw.ustc.edu.cn/for-std/exam-arrange` 的考试表，没有新增平台专属 Engine：

- 会话：应用管理 Edge 登录 `https://jw.ustc.edu.cn/login`，CAS 完成后保存 4 个 Cookie；Cookie 只在 DPAPI。
- 字段：课堂号 → 课程外部 ID/代码，课程名称 → 课程标题，考试类型 → 标题后缀，日期时间 → 截止时间，考场 → 描述；`termId` 使用 `constant`，稳定事项 ID 使用 `template`。
- 真实验证（2026-10-28）：预览 `create:1`，同步写入 1 门课程、1 个考试（模拟与数字电路A 期中考试，2026-11-08 14:30，3C102）；重复预览 `unchanged:1`，重复同步不新增。
- 新增通用能力：`constant` / `template` 字段；同一页面的课程行按外部 ID 去重。没有修改 Kernel/Connector。

限制：只覆盖“考试信息”页，因此只能发现本学期有考试的课程；课表/选课接口返回内嵌 XML 或需要额外参数，当前 Manifest 未支持 XML，未扩大能力；成绩和作业未接入。平台未提供 ICS 订阅。

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
