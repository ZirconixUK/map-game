# Agent prompt cheatsheet

## Frontend / UI change

Use the frontend-map-implementer to [task]. Keep the change as local as possible. Do not alter gameplay rules, scoring, or debug behavior unless absolutely necessary. Flag any likely side effects first.

## Regression review

Use the regression-reviewer to review the latest changes only for regressions. Focus on [systems]. Summarize intended behavior, likely breakage risks, and give a concrete manual test checklist.

## Performance diagnosis

Use the performance-reviewer to investigate [problem]. Separate likely render, event, state, and network causes. Recommend low-risk fixes first and note which suggestions are hypotheses rather than confirmed causes.

## Gameplay design

Use the game-systems-designer to evaluate [idea]. Compare it against the current clue and tool ecosystem and judge whether it adds a genuinely new strategic decision or overlaps too much with existing mechanics.
