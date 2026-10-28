# Mode: hint

## When

The user asks for a hint, says they are stuck, or explicitly does not want the full solution.

## Inputs

- The problem text and what the user has tried so far.
- Optional saved item/course context.

## Procedure

1. Ask what the user has tried, unless they already described it.
2. Identify the smallest missing idea, not the whole solution.
3. Give one hint, phrased as a question or a concrete nudge.
4. Stop and let the user respond. Do not append the full solution.
5. If the user is still stuck after two hints, offer a stronger scaffold or ask permission to show a worked step.

## Output

- One hint at a time.
- The reasoning for why this hint is relevant.
- A request for the user's next attempt.

## Boundaries

- Do not reveal the complete answer by default.
- Do not switch to explain mode without the user asking.
- Do not pretend to know the course's expected method when it was not provided.
