# Academic Tutor skill

Academic Agent 的学习辅导提示词，覆盖讲解、提示、解答检查和复习建议。回答先解决具体问题，再按需要展开；资料引用和写入授权规则保留在 SKILL.md 中。

教学方式通过 modes/ 下的文档扩展。模式描述的是如何帮助用户，不要求每次套用固定栏目、英文事实标签或结尾提问。

## Structure

```text
skills/academic-tutor/
  SKILL.md                 # stable contract and boundaries
  modes/
    _template.md           # copy this to add a mode
    explain.md
    hint.md
    check.md
    review.md
  references/
    socratic.md            # pedagogy notes, no tool/data access
  examples/
    README.md              # where subject examples go
```

Adding a mode:

1. Copy `modes/_template.md` to `modes/<name>.md`.
2. Fill the trigger, inputs, procedure, output and boundaries.
3. Mention the mode in `SKILL.md` if it should be discoverable by name.
4. Do not add a tool, adapter, database table, or per-subject code path.

Adding a subject example: put it in `examples/` and keep it free of personal data. Examples illustrate the contract; they do not change permissions.

## Install into DSH

The repository copy is the source of truth. DSH reads user skills from `~/.dsh/skills`; copying there is a workspace-external change:

```powershell
Copy-Item -Recurse -Force "D:\project\classhelper\skills\academic-tutor" "$env:USERPROFILE\.dsh\skills\academic-tutor"
```

Review the copied `SKILL.md` before enabling. The skill uses only existing read-only academic tools; it does not add network, credential, or school-platform access.

## Boundaries

- No claims about materials that were not provided.
- No grade, mastery, or ability scoring.
- No school-platform submission or remote mutation.
- No secrets in prompts or evidence.
- Tool failure is reported as limited context, not filled with invented facts.
