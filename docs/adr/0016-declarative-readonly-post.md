# 0016 — 声明式 Adapter 的显式只读 POST

日期：2026-10-28
状态：已接受

## 背景

声明式 Runtime 最初只发 GET。部分平台（例如超星的课程/作业列表）把数据放在只接受 POST 的 JSON 接口上，GET 只能拿到 SPA 外壳，导致这些栏目无法用 Manifest 适配；改用专用 Adapter 又会把每个平台写进代码。

## 决策

Manifest 的每个请求可选择 `method: "POST"`，并提供 JSON 对象 `body`：

- body 只允许 JSON（≤16 KB），值可含 `{{course.*}}` / `{{assignment.*}}` 模板；整值模板保留原始类型。
- 不发送表单编码、multipart 或调用方自定义请求头；认证仍只来自已保存会话 Cookie。
- POST 只能用 `pageParam` / `offsetParam` 翻页；需要把页码放进 body 时使用 `pageIn: "body"` / `offsetIn: "body"`。POST 不支持 `next`，避免“下一页 URL + 旧 body”的歧义。
- 301/302/303 按浏览器语义降级为 GET 并丢弃 body；307/308 才重发 body。每一跳都重新执行主机/协议/端口/路径与 SSRF 校验。
- 样本（`AdapterSample`）增加可选 `method` 与 `requestBody`，按 URL+方法+body 哈希精确匹配；`academic_probe_source` 可用 `method`/`body` 只读探测并捕获 POST 样本。
- 静态校验拒绝“GET 带 body”、POST+`next`、`pageIn`/`offsetIn` 缺少参数或不安全模板变量。

## 后果

- 只接受 POST 的只读列表接口可以用 Manifest 适配，不必新增平台专用 engine。
- POST 语义上可能产生副作用，因此仍要求用户显式启用已验证的 Manifest；候选验证与保存/启用分离不变。
- 仍不支持表单 POST、multipart、自定义头、XPath/XML 与任意脚本；需要这些能力时应新增 ADR，而不是在 Manifest 里扩展脚本执行。
- 状态：传输层、Manifest、样本回放与探测已实现并有自动化测试；真实超星/智慧树接口尚未验证。
