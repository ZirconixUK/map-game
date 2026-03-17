# Claude Code subagents setup for Map Game

This pack creates four project-level subagents in `.claude/agents/`:

- `game-systems-designer`
- `frontend-map-implementer`
- `performance-reviewer`
- `regression-reviewer`

## What you need to do

1. Copy the `.claude/agents/` folder from this zip into the root of your repo.
2. Commit the files so they stay with the project.
3. Open Claude Code from the repo root so it can see the project-scoped `.claude/agents/` directory.
4. Run `/agents` to confirm the four agents appear.
5. Start using them explicitly in prompts at first. After that, Claude may delegate automatically when the task matches the agent description.

## Recommended first-use workflow

Start simple. Do not expect Claude to perfectly auto-delegate on day one.

Use prompts like:

- `Use the frontend-map-implementer to fix the clue panel close behavior on mobile. Keep the diff local and do not alter gameplay logic.`
- `Use the regression-reviewer to review the latest changes for regressions in round reset, photo cache behavior, and target radius enforcement after Street View snapping.`
- `Use the game-systems-designer to evaluate three new curse ideas and rank them by how much genuinely new strategy they add.`
- `Use the performance-reviewer to investigate current lag when moving the map and opening overlays. Separate likely render issues from state or event issues.`

## How auto-use works in practice

Claude Code can delegate to subagents when their descriptions match the task. The quality of the `description` field matters a lot.

In practice:
- explicit requests are the most reliable
- strong descriptions improve automatic delegation
- subagents are best for specialist tasks, not tiny edits

## Recommended pattern for your project

For new mechanics:
1. Ask `game-systems-designer`
2. Have Claude implement the chosen direction
3. Ask `regression-reviewer`

For bugs and polish:
1. Ask `frontend-map-implementer` or `performance-reviewer`
2. Have Claude make the change
3. Ask `regression-reviewer`

## Notes on scope

These are project-level agents, not user-level agents. That means they live in `.claude/agents/` and are available only in this repo unless you copy them elsewhere.

That is usually the right choice for a game project with project-specific assumptions and terminology.
