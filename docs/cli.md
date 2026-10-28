# CLI 参考

数据库路径由 `ACADEMIC_DB` 控制，默认 `.data/academic.db`（已 git 忽略）。所有命令通过：

```bash
npm run demo -- <命令>
```

## 演示与查看

```bash
npm run demo                    # 同步 fixture、创建任务、生成并确认计划
npm run demo -- sync            # 同步 + 处理提醒/重规划请求
npm run demo -- list            # 查看待办、任务、未读提醒
npm run demo -- status          # 数据库/同步/定时任务状态
npm run demo -- help
```

## 课程

```bash
npm run demo -- course list
npm run demo -- course add 2026-fall CS101 "Computer Science"
npm run demo -- course archive <courseId>
npm run demo -- course merge-duplicates   # 合并同一学期同名课程
```

## 任务与计划

```bash
npm run demo -- task list
npm run demo -- task add "复习第三章" --minutes 60 --due 2026-11-01T20:00:00+08:00
npm run demo -- task complete <taskId>
npm run demo -- task reopen <taskId>
npm run demo -- task estimate <taskId> <minutes>
npm run demo -- plan                # 生成未来 7 天计划
npm run demo -- plan --accept       # 确认计划
npm run demo -- plan show
npm run demo -- plan lock <start ISO> <end ISO> [标题]
npm run demo -- plan unlock <lockId>
npm run demo -- plan archive
```

## 可用时间与提醒

```bash
npm run demo -- availability show
npm run demo -- availability set --tz Asia/Shanghai --granularity 15 --slots "1:19:00-22:00,2:19:00-22:00"
npm run demo -- availability block <start ISO> <end ISO> "开会"
npm run demo -- availability unblock <blockId>
npm run demo -- reminders show
npm run demo -- reminders set --enabled true --thresholds 72,24
npm run demo -- notifications --read-all
```

## 数据源与会话

```bash
npm run demo -- source list
npm run demo -- source add my-lms "My LMS" --engine browser-session --auth token --login-mode browser --config '{"loginUrl":"https://lms.example.edu/","authenticatedUrlPatterns":["^https://lms.example.edu/"],"cookieDomains":["lms.example.edu"]}'
npm run demo -- source login my-lms
npm run demo -- source preview my-lms
npm run demo -- source sync my-lms

npm run demo -- web login https://example.com/ --label "课程网站"
npm run demo -- web list
npm run demo -- web fetch <sessionId> https://example.com/page --out .data/page.html
npm run demo -- web delete <sessionId>
```

## 课程资料

```bash
npm run demo -- material list [--course <courseId>]
npm run demo -- material add <file> --course <courseId> [--title <标题>]
npm run demo -- material text --course <courseId> --title <标题> --file notes.txt
npm run demo -- material url <url> --course <courseId> [--source <sourceId>]
npm run demo -- material search "隐函数" [--course <courseId>]
npm run demo -- material delete <materialId>
npm run demo -- material rebuild
npm run demo -- material subscribe <sourceId> <courseId> [--disable]
npm run demo -- material attachments <sourceId> <pageUrl> --course <courseId> [--prefix /path]
```

## 备份与恢复

```bash
npm run demo -- backup [target.db]
npm run demo -- restore <backup.db> <target.db>
npm run benchmark               # 1k/10k 事项同步、查询、投影重建基线
```

备份只包含 SQLite；迁移整库时同时复制数据库同目录的 `materials/`。详见 [operations.md](operations.md)。
