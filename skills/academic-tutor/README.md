# Academic Tutor skill

A project-owned teaching wrapper for Academic Agent. It keeps one stable tutoring contract and makes teaching modes extensible through Markdown files, not new tools.

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
