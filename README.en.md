# Academic Agent

[English](README.en.md) | [中文](README.md)

A personal academic assistant that runs on your own computer. Courses, assignments, exams, tasks, plans and reminders stay local; when you want explanations or material lookup, connect it to a DSH Agent.

Business data stays on your machine by default. Credentials only go into the system credential vault. It never submits homework or changes your school account.

## What it can do

- **Keep courses and assignments together**: tested with Blackboard and USTC academic systems, with manual entry as a fallback. Re-syncing does not duplicate courses; courses with the same name in the same term are merged.
- **Tell you what to do today**: build a study plan from deadlines, priority and your available time; lock time blocks or adjust them manually, and get a clear reason when work cannot fit.
- **Remind you before deadlines**: local 72-hour / 24-hour scans, with no model calls.
- **Search course materials**: import PDF, PPTX, DOCX, web pages or pasted text, then search by keyword. Agent answers cite the material title and page number. Scanned PDFs without a text layer are reported honestly.
- **Ask an Agent about your studies**: use the DSH “Academic” panel or chat to query courses, tasks, plans and materials. If no material is available, it says so instead of making one up.
- **Add sites without waiting for a release**: log in and connect through site rules; new sites prefer configuration over hard-coded school-specific code.
- **Your data stays yours**: local SQLite; original material files live beside the database; deleting material does not delete academic records; backup and restore have dedicated commands.

## Self-adapting, self-iterating (direction)

The goal is not one adapter per school, but software that grows with your usage:

- **Find its own way**: give it a logged-in URL; it probes pages, scripts, pagination and endpoints, same-host or cross-host, as long as they are public HTTPS. POST-only lists are supported for read-only probes.
- **Prove itself with real data**: inferred rules must replay real captured pages/JSON; synthetic fixtures never count, and failures name the stage that broke.
- **Repair itself when sites change**: when a redesign breaks sync, it traces the failing field/request, re-probes and produces a new rule version; old versions stay available for rollback.
- **Improve with use**: new sites become Manifests instead of code; validation, activation and failure reasons stay local and feed the next generation; with trusted automation enabled, the Agent can connect without per-step approval.
- **Always bounded**: no homework submission, no credential access, no out-of-scope hosts; every automatic change can be stopped, rolled back and explained.

Today this covers “probe → candidate → real-sample validation → enable/rollback”; generation and repair still happen through an Agent conversation. The next step is closing the loop from “sync failure → diagnose → re-probe → new version” so the software can genuinely iterate on its own.

## Quick start

Requires Node.js ≥ 22.12. The credential vault currently uses Windows DPAPI.

```bash
npm ci
npm run build:dsh
npm run build:ui

# Run the built-in demo: sync → tasks → plan
ACADEMIC_DB=.data/academic.db npm run demo
```

Typical first run: **add a course → connect/sync → `list` your tasks → `plan --accept` → import materials**. The demo walks through this flow with fixture data.

Common commands:

```bash
npm run demo -- list                         # what is due today / soon
npm run demo -- course add 2026-fall CS101 "Computer Science"
npm run demo -- task add "Review chapter 3" --minutes 60
npm run demo -- plan --accept                # generate and confirm a 7-day plan
npm run demo -- material add notes.pdf --course <courseId>
npm run demo -- material search "implicit function"
npm run demo -- help
```

See the [CLI reference](docs/cli.md) (Chinese) for every command. The default database is `.data/academic.db`; override it with `ACADEMIC_DB`.

## Use inside DSH (optional)

Requires DSH `0.2.1-rc.3`. Install the host/tools bundle:

```bash
dsh plugin --profile academic add <path-to-repo>/packages/academic-dsh-plugin
```

Install the “Academic” UI for DSH Web or Desktop:

```bash
dsh plugin --profile academic-web add \
  <path-to-repo>/packages/academic-dsh-plugin \
  <path-to-repo>/packages/academic-dsh-ui
```

The UI includes: Overview, Tasks, Plan, Connections, Materials, Automation and Settings.

The Agent is read-only by default. Writes such as changing tasks or importing/deleting materials require per-call approval from the trusted host. Without a DSH approval UI, Agent writes are rejected; CLI and direct UI actions still work.

DSH has no official central market; its Discover page reads index URLs configured by the user. The Academic Agent index is:

```text
https://kw78.github.io/academic-agent/market/index.json
```

See [market/README.md](market/README.md) for setup.

Install details: [plugin README](packages/academic-dsh-plugin/README.md), [UI README](packages/academic-dsh-ui/README.md).

## Where data lives

- Database: `.data/academic.db` for CLI; `$DSH_HOME/academic-agent/academic.db` for DSH.
- Materials: a `materials/` directory beside the database, content-addressed; SQLite stores only metadata and search chunks.
- Credentials: Windows DPAPI; no plaintext cookies or tokens in the database, logs or Agent results.
- Backup: SQLite only; copy `materials/` as well when moving the whole library.
- Deletion, recovery and troubleshooting: [operations guide](docs/operations.md) (Chinese).

## Known limitations

- The credential vault currently supports Windows DPAPI only.
- No OCR for scanned PDFs; only the original file is kept.
- Automatic attachment import scans only the single course page you provide, never the whole site.
- Blackboard covers courses, assignments and folders; real exam/quiz samples are still validated with sanitized fixtures.
- DSH file-level HMR, real Session lifecycle and the full approval UI are not yet specifically verified.
- npm packages are not officially published yet; install from source or local tarballs.

Full acceptance boundaries: [MVP verification](docs/mvp-verification.md); architecture and engineering status: [AGENTS.md](AGENTS.md). These detailed documents are currently in Chinese.

## Documentation

- [CLI reference](docs/cli.md)
- [Operations, backup and troubleshooting](docs/operations.md)
- [Testing and architecture matrix](docs/testing.md)
- [Frontend verification](docs/frontend-verification.md)
- [Architecture decisions](docs/adr)
- [Roadmap](doc/ACADEMIC_AGENT_ROADMAP_MVP_FIRST.md)
- [v0.1.1 release notes](docs/releases/v0.1.1.md)
- Architecture baseline: [Intent](doc/Academic_Agent_Intent_v1.0.md), [Architecture Spec](doc/Academic_Agent_Architecture_Spec_v0.1-1.md)

## License

Apache License 2.0. See [LICENSE](LICENSE). Third-party dependencies keep their own licenses.
