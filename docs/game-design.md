# Game design reference

## Core identity
Map Game is a real-world walking deduction game. The player physically moves through a real place, starts each run from a strong visual clue, and uses a constrained clue toolkit to infer where the hidden target is.

The game should feel like:
- a smart urban hunt
- spatial reasoning under pressure
- a real walk that matters

The game should not feel like:
- a generic Geoguessr variant
- a passive sightseeing companion
- a collectible grind
- a lore delivery vehicle that needs narrative to stay interesting

## Design pillars
1. **Physical movement is the point**
   Walking is the core mechanic, not flavor.

2. **Deduction before collection**
   The player should feel clever, not merely busy.

3. **One strong image starts the run**
   The starter photo should create a hypothesis without giving away the answer.

4. **Strategy over repetition**
   Tools should have situational value rather than a solved universal opener.

5. **Fair but tough**
   Wrong turns and tension are fine. Outcomes that feel GPS-unfair or system-broken are not.

6. **Systems first, lore second**
   The game must work without narrative scaffolding.

## Primary skill expression
The main skill is deciding **where to move next**.
Tools should support that decision, not replace it.

## Core loop
1. Pick a hidden target.
2. Present a single strong starter photo.
3. Player forms a hypothesis and begins moving.
4. Player uses a limited set of clues strategically.
5. Heat/curses add tension and alter decision-making.
6. Player locks in a GPS guess.
7. Result and score should feel deserved.

## Tool ecosystem principles
- Each tool should open a distinct line of reasoning.
- Avoid multiple tools that mostly differ by numbers.
- Tools should create meaningful timing decisions.
- Avoid making any one clue type a mandatory opener every run.
- Clues should reward map reading and spatial reasoning.

## Current clue/tool landscape
### Working pillars
- Starter photo is a core identity feature.
- Radar gives spatial deletion pressure.
- Landmark clues add strategic map knowledge when tuned well.
- Extra photo tools add visual confirmation and pacing variety.

### Ongoing balance questions
- Thermometer usefulness still needs tuning. Tight radius currently costs *less* heat than wide — inversion bug, tracked in v3 plan.
- N/S and E/W split may be too strong if available too early or too often.
- Landmark clue quality depends on POI richness and category usefulness.
- Mid-run dead air remains a major design risk.
- Timer is currently irrelevant — no tool has a time cost, and the time bonus is too small to change strategy. V3 plan addresses this (see `docs/plan-v3-timer-rebalance.md`).

## Timer principles
- The timer should create genuine pressure, not be a formality.
- Tool use should cost time, making tool selection a real trade-off between information gain and time remaining.
- The time bonus should be large enough that a fast, confident run is meaningfully rewarded over a slow, tool-heavy one.
- Wall-clock expiry is enforced: closing the page does not pause the timer. A player cannot bank time by reopening the page in a better position.

## Heat and curses principles
- Heat should create tension the player can feel and plan around.
- Curses should be readable and strategically legible.
- Curses are strongest when they change behavior, not when they simply tax time.
- Effects should feel tough but not arbitrary or cruel.

## Current status snapshot
- Single-run loop is coherent.
- Starter photo, clue toolkit, heat/curses, lock-in, and scoring are implemented.
- Difficulty selector and auto-lock on timer expiry are implemented.
- Chain mode and remote mode are not yet built.

## Current priority
The current focus is strengthening the middle of the run:
- improve clue usefulness tuning
- keep N/S/E/W from trivializing deduction
- improve landmark clue quality
- make heat/curses feel more strategically meaningful
- reduce dead air and increase recognition moments

## Open design questions
- Should every clue be one-use only, or should some be reusable?
- Should N/S and E/W stay in default play or move to late-game or hard-mode roles?
- What curse effects best change play without feeling arbitrary?
- What are the right thresholds for low-POI or weak-Street-View areas?
- How should chain mode create its own rhythm rather than feeling like repeated normal rounds?
- How should remote mode stay true to the game’s identity without becoming a standard map-click game?

## Known design risks
### Solved meta
If players always use the same opener sequence, the game loses strategic texture.

### Mid-run dead air
This is currently the biggest experiential risk. The middle of runs can flatten out.

### Overpowered directional clues
N/S and E/W can collapse too much search space if not gated or limited.

### GPS fairness
Scoring and grading must feel fair in the presence of real-world GPS jitter.

### Curse arbitrariness
If curses feel random or unreadable, they undermine trust in the system.

## Future-mode guidance
### Chain mode
Should be a meaningfully different commitment mode with its own pacing and fatigue logic, not just a repeated normal loop.

### Remote mode
Should be structurally distinct and preserve deduction and tension, rather than simply substituting clicks for walking.

## Design litmus test
A run is working if the player:
- finishes instead of drifting away
- remembers a clear recognition moment
- feels clever rather than compliant
- feels the result was deserved, even when the score is poor
- wants to run another game immediately
