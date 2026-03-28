# Game design reference

## Core identity
Real-world walking deduction game. Player moves through a real place, starts each run from a strong visual clue, and uses a constrained toolkit to infer the hidden target.

Feels like: a smart urban hunt, spatial reasoning under pressure, a real walk that matters.
Does not feel like: Geoguessr, passive sightseeing, a collectible grind, a lore vehicle.

## Design pillars
1. **Physical movement is the point** — walking is the core mechanic, not flavor.
2. **Deduction before collection** — the player should feel clever, not merely busy.
3. **One strong image starts the run** — starter photo creates a hypothesis without giving away the answer.
4. **Strategy over repetition** — tools should have situational value, not a solved universal opener.
5. **Fair but tough** — wrong turns are fine; GPS-unfair or system-broken outcomes are not.
6. **Systems first, lore second** — must work without narrative scaffolding.

## Primary skill expression
Deciding **where to move next**. Tools support that decision, not replace it.

## Core loop
1. Pick a hidden target.
2. Present a single strong starter photo.
3. Player forms a hypothesis and begins moving.
4. Player uses limited clues strategically.
5. Heat/curses add tension and alter decision-making.
6. Player locks in a GPS guess.
7. Result and score should feel deserved.

## Tool ecosystem principles
- Each tool should open a distinct line of reasoning.
- Avoid multiple tools that mostly differ by numbers.
- Tools should create meaningful timing decisions.
- No single clue type should be a mandatory opener every run.

## Current tool landscape
- Starter photo: core identity feature.
- Radar: spatial deletion pressure.
- Landmark clues: strategic map knowledge when tuned well.
- Extra photo tools: visual confirmation and pacing variety.

## Balance questions
- N/S and E/W: gated behind 50% timer elapsed — resolved.
- Landmark clue quality depends on POI richness and category usefulness.
- Mid-run dead air: addressed in Phase B.
- Timer v3 is live: Overcharged curse adds time costs; time bonus is 300. Monitor for too-harsh timeout rates.

## Timer principles
- Should create genuine pressure, not be a formality.
- Tool use costs time when Overcharged is active — real trade-off between information and time.
- Wall-clock expiry: closing the page does not pause the timer.

## Heat and curses principles
- Heat creates tension the player can feel and plan around.
- Curses should be readable and strategically legible.
- Best when they change behavior, not just tax time.
- Effects should feel tough but not arbitrary.

## Current priority
Chain mode (Phase D): multi-run commitment with its own pacing and fatigue logic.

## Open design questions
- Should every clue be one-use, or can some be reusable?
- What curse effects best change play without feeling arbitrary?
- How should chain mode create its own rhythm vs repeated normal rounds?
- How should remote mode preserve the game's identity without becoming a map-click game?

## Known design risks
- **Solved meta**: same opener every game → no strategic texture.
- **GPS fairness**: scoring must feel fair under real-world GPS jitter.
- **Curse arbitrariness**: if curses feel random, they undermine trust.

## Future modes
- **Chain mode**: multi-run commitment with its own pacing and fatigue logic. Not just a repeated loop.
- **Remote mode**: structurally distinct; preserves deduction and tension; substitutes something for walking.

## Design litmus test
A run is working if the player: finishes instead of drifting away, remembers a clear recognition moment, feels clever rather than compliant, feels the result was deserved even when the score is poor, wants to run another game immediately.
