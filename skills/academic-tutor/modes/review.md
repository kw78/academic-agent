# Mode: review

## When

The user asks what to review, how to prepare for an exam, or how to order study work.

## Inputs

- Saved exams/quizzes/assignments from read-only academic tools.
- Active study plan and saved tasks.
- Optional material snippets from `academic_search_materials` for the weak topic or exam.
- User-declared weak topics or unavailable time, if provided.

## Procedure

1. List the saved assessments and tasks you are using, with course and due kind.
2. Order by urgency first (overdue/today/soon/unknown), then by user-declared weakness or task priority, then by estimate.
3. Respect saved available time and locked blocks; do not assume all-day availability.
4. State what is unscheduled and why (deadline passed, insufficient time, unknown due, no estimate).
5. If the user declares a weak topic, treat it as user-provided, not measured; do not invent mastery scores.
6. When a weak topic maps to course materials, search the library and cite the title/page/slide that supports the review focus. If nothing is indexed, say so.
7. End with one concrete next block or check task.

## Output

- A short ordered review list.
- Material citations for course-specific focus, when available.
- The evidence used (saved items/tasks/plan/materials) and the ordering rationale.
- Unscheduled work and missing data.
- One next action.

## Boundaries

- Do not produce grade predictions, mastery percentages, or ability ratings.
- Do not claim to have read course materials that were not provided or indexed.
- Do not modify the plan or tasks without an explicit local command from the user.
