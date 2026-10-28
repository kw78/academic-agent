# 0014 — 课程资料库与检索

- 状态：已接受
- 日期：2026-10-28
- 相关：Roadmap H-05；Architecture Spec §4、§5；Intent 用户控制权与不越权

## 背景

Tutor 只能看到题目文本与数据库事实，无法引用课件、讲义或往年题；课程-specific 讲解因此退化为通用建议。把整份文件塞进事件库或模型上下文既破坏事件源的边界，也不可扩展。

## 决策

1. **文件与事实分离**
   - 原文件按 sha256 内容寻址存放在数据库同目录的 `materials/`；SQLite 只保存课程、标题、类型、来源、sha256、大小、MIME、页码、抽取状态等元数据。
   - 不把文件字节写入 Event Store、核心投影或领域事件；资料不是学业事实，删除不影响课程、事项、任务与计划。
2. **可重建的检索索引**
   - 文本抽取后按段落/页切块，写入 `material_chunks` 与 FTS5 `material_chunks_fts`（trigram，适配中文；短查询回退 LIKE）。
   - 索引可以随时从原文件重建；缺失原文件时保留旧分块并报告缺失数量。
3. **去重按内容**
   - 同一课程内 `(course_id, sha256)` 唯一；相同字节重复导入返回既有资料。
   - 内容文件本身跨课程共享；只有最后一个引用删除时才移除文件。
4. **导入范围受控**
   - 手动导入支持文件、粘贴文本、用户提供的单页 URL；URL 抓取只允许 http(s)，复用同站已保存会话或指定 source 会话，Cookie 不进入模型/UI。
   - 授权附件导入必须先在 `material_source_subscriptions` 开启 source+course；只扫描用户给出的课程页中同主机、扩展名允许的链接，限制文件数/大小/时长，按 sha256 去重；401/403/登录页/429 立即停止。
   - 不做无界全网爬虫；网页与附件文本一律视为不可信数据，不执行其中代码，也不能成为系统指令。
5. **Agent 只拿最小片段**
   - `academic_list_materials` / `academic_search_materials` 只读返回标题、课程、页码/幻灯片号与片段，不返回文件路径或全文。
   - `academic_import_material` / `academic_delete_material` 是写操作，需可信宿主逐次授权；模型参数不能自证同意。
   - Tutor skill 的 explain/review 先查资料；查不到时明确说没有可用材料。

## 后果

- 资料库是运营数据，不是事件源；不产生领域事件，崩溃恢复只需保证文件与 SQLite 元数据一致。
- 真实 PDF 抽取依赖文本层与 ToUnicode；扫描件没有 OCR，状态会标为 `empty` 并给出说明。
- 未引入向量库；先用 FTS5 + 元数据过滤，真实检索质量不足时再评估本地 embeddings。
- 自动附件导入只覆盖用户给出的单个课程页，不做多页发现；这是有意的安全边界。
- 现有数据库备份只包含 SQLite；整库迁移或恢复时需同时复制 `materials/` 目录，否则索引重建会报告缺失文件。

## 验证

- `tests/unit/materials-extract.test.ts`：PDF（普通/Flate/ToUnicode）、HTML、Markdown、DOCX、PPTX 抽取。
- `tests/integration/materials.test.ts`：中文检索、短词回退、去重、跨课程共享文件、删除、索引重建、URL 导入与订阅门槛、跨主机跳过与 429 停止。
- `tests/integration/materials-app.test.ts`：资料导入/删除不改变事件行数；Agent 工具只读与写入授权；登录页拒绝；授权附件导入；UI API 不返回文件路径。
- 真实 PDF：`2025春数分B2期中试题及解答.pdf` 可检索并返回页码；DSH 自测 23 工具注册，写入返回 `FORBIDDEN`。
