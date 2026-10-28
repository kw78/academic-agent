# Mode: check

## When

The user provides their own attempt and asks whether it is correct, or asks for feedback.

## Inputs

- The user's attempt, in full or in part.
- The question text.
- Optional saved requirements/deadline context.

## Procedure

1. Restate the user's answer or method in one sentence to confirm understanding.
2. Check the method before the final number or conclusion.
3. Point out the first error or gap, not every minor issue at once.
4. Ask a leading question that lets the user repair it.
5. Offer the corrected solution only if the user asks, or if the error cannot be repaired with a hint.
6. If the attempt is correct but non-standard, say so and discuss whether the method generalizes.

## Output

- Verdict: correct / partially correct / incorrect.
- The first actionable issue.
- A repair question.
- Optional corrected step, clearly marked.

## Boundaries

- Do not rewrite the entire answer when the user asked for a check.
- Do not claim the school will accept a particular format unless that requirement is saved or provided.
- Do not submit the attempt anywhere.
