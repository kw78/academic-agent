# 0012 — 个人数据可编辑、软删除与恢复

- 状态：已接受
- 日期：2026-10-28
- 相关：Architecture Spec §4、§5、§6、§10；Intent I-03、I-05；ADR 0003、0006

## 背景

UI 此前只提供“新增”和少量归档操作：课程只能归档，来源事项不能从界面归档/恢复，学习任务只能完成/重开/改时长，数据源只能新建或归档。错误配置和误建数据会持续累积，用户无法自行修正；归档后的数据源还会从连接页消失，既不能恢复也不能彻底删除。

## 决策

1. **领域事实只追加事件，不物理删除**
   - 课程：`CourseUpdated`、`CourseRestored`、`CourseDeleted`；`deleted` 与 `archived` 分开保存。
   - 来源事项：`AcademicItemArchived`、`AcademicItemRestored`；同步遇到归档事项会跳过，恢复后继续接收来源更新。
   - 学习任务：`StudyTaskDetailsChanged`、`StudyTaskArchived`、`StudyTaskRestored`；查询与 Planner 默认排除归档任务。
   - 所有删除都是软删除；投影重建、重启和历史回放可以还原状态。
2. **课程删除显式级联**
   - 删除课程时，先经 `AcademicItemArchive` 和 `StudyTaskArchive` 归档该课程的来源事项与关联任务，再追加 `CourseDeleted`。
   - 恢复课程只恢复课程本身，不批量恢复事项与任务，避免把用户此前主动归档的内容一起翻出。
3. **来源事项保持来源事实**
   - 允许归档/恢复，不允许直接改标题、截止或类型；这些字段属于平台事实，手工修改会被下一次同步覆盖。
4. **数据源与连接属于运营配置**
   - 支持编辑显示名、认证方式、登录方式、非敏感配置和能力。
   - 归档可恢复；彻底删除会清理 `academic_sources`、连接元数据与 DPAPI 凭据，但保留已同步的领域事件。
   - 凭据不应为了“可恢复”长期保留；学业事实的恢复不依赖凭据。
5. **查询默认值与 UI**
   - `listStudyTasks` 默认排除归档任务；需要历史时显式传 `includeArchived`。
   - 课程视图包含 `deleted`，设置页的课程优先级忽略已删除课程。
   - UI 提供“显示已归档/已删除”开关，恢复操作与删除操作分开，删除需要使用二次确认。

## 后果

- 误建课程、任务和数据源可以由用户自行修正，不需要直接改数据库。
- 删除不会破坏事件历史；核心投影重建后仍能重现删除/恢复状态。
- 数据源删除是运营层操作，不会删除课程、事项、任务或计划。
- 课程删除是跨聚合的多条命令，不是单事务；命令失败时停止后续步骤并保留已完成的部分，用户可以在 UI 中继续恢复或删除。

## 验证

- `tests/integration/ui-api.test.ts`：课程编辑/删除/恢复、事项与任务软删除/恢复、投影重建等价；数据源编辑/归档/恢复/彻底删除；删除连接与凭据；学业事件保留。
- `tests/integration/migrations.test.ts`：0013 迁移保留旧数据并为 `courses_current.deleted`、`study_tasks_current.archived` 提供安全默认值。
- `tests/unit/ui-view.test.ts`：新增 `deleted` / `archived` 字段后的视图类型。
