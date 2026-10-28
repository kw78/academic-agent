# Academic Agent

[中文](README.md) | [English](README.en.md)

一个在你自己电脑上运行的学业助手。课程、作业、考试、学习任务、计划和提醒都保存在本地；需要讲解或查资料时，再接入 DSH Agent。

业务数据默认留在本机，凭据只进系统凭据库；不会替你提交作业或修改学校平台。

## 它能帮你做什么

- **把课程和作业整理到一起**：已实测 Blackboard 与 USTC 教务；也可以手动添加。重复同步不会重复建课，同一学期同名课程会自动合并。
- **告诉你今天该做什么**：按截止时间、优先级和你设置的空闲时间排学习计划；可以锁定时间块、手动调整，计划冲突会说明原因。
- **截止前提醒你**：本地扫描 72 小时 / 24 小时提醒，不调用模型。
- **让你查课件和讲义**：导入 PDF、PPTX、DOCX、网页或粘贴文本后，按关键词检索；Agent 回答时会带资料标题和页码。扫描版 PDF 没有文字层时会明确说明。
- **有问题可以问 Agent**：在 DSH 的“学业”面板或对话里查课程、任务、计划和资料。没有资料时它会说没有，不编造。
- **换网站不用等新版本**：登录后按网站规则接入；新网站优先用配置化规则，不把每所学校写死进代码。
- **数据仍然归你**：本地 SQLite；资料原文件放在数据库同目录；删除资料不会删除学业记录；备份和恢复有独立命令。

## 最短上手

要求 Node.js ≥ 22.12；凭据库目前使用 Windows DPAPI。

```bash
npm ci
npm run build:dsh
npm run build:ui

# 用内置演示数据跑通：同步 → 任务 → 计划
ACADEMIC_DB=.data/academic.db npm run demo
```

第一次完整使用可以按这个顺序：**添加课程 → 连接/同步 → `list` 看任务 → `plan --accept` 确认计划 → 导入资料**。`demo` 会用内置数据把这条链路跑一遍。

常用操作：

```bash
npm run demo -- list                         # 看今天/近期要做什么
npm run demo -- course add 2026-fall CS101 "Computer Science"
npm run demo -- task add "复习第三章" --minutes 60
npm run demo -- plan --accept                # 生成并确认未来 7 天计划
npm run demo -- material add notes.pdf --course <courseId>
npm run demo -- material search "隐函数"
npm run demo -- help
```

完整命令见 [CLI 参考](docs/cli.md)。数据库默认在 `.data/academic.db`，可用 `ACADEMIC_DB` 改路径。

## 在 DSH 里使用（可选）

需要 DSH `0.2.1-rc.3`。只装 Host/工具：

```bash
dsh plugin --profile academic add <path-to-repo>/packages/academic-dsh-plugin
```

同时装“学业”界面（Web 或 Desktop）：

```bash
dsh plugin --profile academic-web add \
  <path-to-repo>/packages/academic-dsh-plugin \
  <path-to-repo>/packages/academic-dsh-ui
```

界面包含：总览、任务、计划、连接、资料、自动化、设置。

Agent 默认只读；修改任务、导入/删除资料等写入必须由可信宿主逐次批准。当前没有接入 DSH 审批弹窗时，Agent 写入会被拒绝，CLI/UI 操作不受影响。

DSH 没有官方中央市场；插件 Discover 读取用户配置的索引。Academic Agent 索引：

```text
https://kw78.github.io/academic-agent/market/index.json
```

添加方式见 [market/README.md](market/README.md)。

安装细节：[插件 README](packages/academic-dsh-plugin/README.md)、[UI README](packages/academic-dsh-ui/README.md)。

## 数据放在哪里

- 数据库：CLI 默认 `.data/academic.db`；DSH 默认 `$DSH_HOME/academic-agent/academic.db`。
- 课程资料：数据库同目录的 `materials/`，按内容哈希保存；SQLite 只存元数据和检索分块。
- 凭据：Windows DPAPI；数据库、日志和 Agent 结果里没有明文 Cookie/Token。
- 备份：只备份 SQLite；迁移整库时请同时复制 `materials/`。
- 删除/恢复与故障处理见 [运维文档](docs/operations.md)。

## 已知限制

- 凭据库目前只支持 Windows DPAPI。
- 扫描版 PDF 没有 OCR，只能保存原件。
- 自动附件导入只扫描你给出的单个课程页，不做全站爬虫。
- Blackboard 已覆盖课程/作业/文件夹；真实考试/测验样本仍以脱敏 fixture 验证。
- DSH 文件级 HMR、真实 Session 生命周期和完整审批 UI 尚未专项验证。
- npm 包尚未正式发布；当前从源码或本地 tarball 安装。

更完整的验收边界见 [MVP 验收](docs/mvp-verification.md)，架构与工程状态见 [AGENTS.md](AGENTS.md)。

## 文档

- [CLI 参考](docs/cli.md)
- [运维、备份与故障处理](docs/operations.md)
- [测试与架构矩阵](docs/testing.md)
- [前端验证记录](docs/frontend-verification.md)
- [架构决策](docs/adr)
- [当前路线图](doc/ACADEMIC_AGENT_ROADMAP_MVP_FIRST.md)
- [v0.1.1 发布说明](docs/releases/v0.1.1.md)
- 架构基线：[Intent](doc/Academic_Agent_Intent_v1.0.md)、[Architecture Spec](doc/Academic_Agent_Architecture_Spec_v0.1-1.md)

## License

Apache License 2.0。见 [LICENSE](LICENSE)；第三方依赖保留各自许可证。
