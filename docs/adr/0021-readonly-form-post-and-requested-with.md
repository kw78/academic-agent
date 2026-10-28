# 0021 — 只读表单 POST 与受限 X-Requested-With

日期：2026-10-28
状态：已接受
修订：[0016](0016-declarative-readonly-post.md) 的“不发送表单编码、自定义请求头”限制

## 背景

0016 只允许 JSON body、禁止表单编码与自定义请求头。两次真实录制（超星、智慧树）显示：课程/作业列表的真实请求是 `application/x-www-form-urlencoded` POST，且多数站点要求 `X-Requested-With: XMLHttpRequest`。JSON POST 被服务端当成空参数，`visit/courselistdata` 返回 `null-data`，导致这两个平台无法用 Manifest 适配。继续用专用 Adapter 会把每所学校写进代码，违背“平台差异停留在声明式契约”的目标。

## 决策

Manifest 的 POST 请求增加两个显式字段：

- `bodyFormat: "json" | "form"`，默认 `json`。
  - `form` 只发送 `application/x-www-form-urlencoded; charset=utf-8`。
  - body 仍是扁平键值对象（string/number/boolean/null），≤16 KB；不支持嵌套对象、数组、文件或 multipart。
  - 分页仍用 `pageParam`/`offsetParam`，可用 `pageIn`/`offsetIn: "body"`；POST 仍不支持 `next`。
- `headers`：唯一允许的键值对是 `x-requested-with: XMLHttpRequest`。其它头（Authorization、Cookie、Referer、自定义令牌）一律拒绝。

传输层（`safeFetch`）只接受上述两种 Content-Type 与这一组静态头；其余在发出请求前报 `INVALID_REQUEST`。认证仍只来自已保存会话 Cookie。

## 样本匹配

请求体按语义规范化后再匹配：JSON 按稳定键序，表单按字段名排序。键序差异不再导致“样本不匹配”，但这只是序列化等价，不做模糊匹配；URL、方法、字段值仍必须一致。

## 后果

- 超星/智慧树的表单列表接口可以用 Manifest 表达；`transport=form` 的录制结果由宿主给出 `bodyFormat: "form"` 的下一步提示。
- 仍不支持 multipart、文件上传、任意请求头、动态签名（如 `secretStr`）、浏览器内执行；这些归于 `unsupported-transport`，由宿主停止生成候选。
- 风险与控制：表单 POST 与 JSON POST 一样是只读列表/详情请求；仍受 Manifest `allowedOrigins`/`allowedPathPrefixes`、请求/字节/时长上限、人工启用与样本回放约束。切换不改变认证与事件写入路径。
- 状态：传输层、Manifest、回放与录制提示已实现并有自动化测试；真实超星/智慧树表单接口仍需用户登录后录制验证。
