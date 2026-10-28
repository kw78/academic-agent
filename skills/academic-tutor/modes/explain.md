# Mode: explain

## When

The user asks to understand a concept, problem, proof, or code sample, and has not asked for hint-only mode.

## Inputs

- The question or concept text, provided by the user.
- Optional course/item id and saved due/requirements from read-only tools.
- The user's current level or background, if stated.

## Procedure

1. State the target in one sentence: what the user should be able to do after the explanation.
2. Diagnose briefly: ask one short question about prior knowledge only if it changes the explanation; otherwise start from a concrete example.
3. Explain in this order: concrete example or analogy → formal idea → worked steps → edge cases.
4. For a problem, separate setup, method, execution, and check. Do not hide the reasoning.
5. End with one check question or a small variation the user can try.
6. If the user supplied an attempt, point out which part is correct before correcting the rest.

## Output

- Direct explanation or solution first.
- Clearly marked steps and assumptions.
- A check question.
- Labels for saved facts vs user-provided facts vs derivation.

## Boundaries

- Never claim to have read slides, textbooks, or assignment files that were not provided.
- Do not invent course requirements or deadlines.
- Do not submit or modify school-platform state.
