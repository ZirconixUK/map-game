# Status and roadmap snapshot

## Current implementation status
### Implemented
- Mode-based target radius
- Starter photo flow
- Radar tool
- Thermometer tool
- Landmark clue system
- Extra photo tools and photo caching
- Horizon photo
- N/S and E/W split
- Heat meter
- Curse system with live tier effects (5 tier curses + 4 special curses)
- Lock-in guess and scoring v2
- Result modal with persistence and reopen behavior
- Tool confirmation panels
- Used/locked/curse-locked tool feedback
- Difficulty selector with live scoring impact
- Timer expiry auto-lock
- Street View guardrails and failure handling
- Debug curse picker with heat tier badges and toast feedback

### Not yet implemented
- Chain mode
- Remote mode

## Current priority
Strengthen the middle of runs.

That means focusing on:
- clue usefulness tuning
- N/S/E/W balance
- landmark clue quality
- heat/curse strategic legibility
- reducing dead air

## Known mismatches or cleanup notes
- Coin economy has been removed and should stay removed unless intentionally revisited.
- Some roadmap-era comments and historical design directions may still exist in the codebase.
- `addPenaltyMs()` in `js/04_state.js` is called by tool delivery points when the "overcharged" curse is active (curse-gated time costs).
- `QUESTION_TIME_COST_MS` in `js/00_config.js` is defined but unused — left as dead code (Q&A mechanic removed).
- Timer exploit fix landed 2026-03-18: wall-clock expiry enforced on page restore, overtime display removed.
- V3 timer rebalance landed 2026-03-19: curse-gated time costs ("Overcharged" curse), thermometer inversion fixed in tools.json, time bonus doubled to 300, heat costs rebalanced. Tools are free (time-wise) when uncursed. See `docs/plan-v3-timer-rebalance.md` for details.
- Curses v2 landed 2026-03-21: added Veil of Ignorance, The Blackout, Ghost Walk, Signal Clamp visual lock. Fog moved to a dedicated Leaflet pane (`fogPane`, z-index 450). Player marker uses `playerPane` (z-index 700) so it remains visible during blackout. Blackout cover is `position:absolute` inside `#leafletMap` at z-index 650.
- Curse names overhauled 2026-03-21: tier curses renamed from "Heat I–V" + generic subtitles to Accelerant, Fever Surge, Compass Rot, Signal Clamp, Burned Lens.
- Debug timer advance now also ticks curse expiry timestamps via `debugAdvanceCurseTimersBy()` in `js/19_curses.js`.

## Key constants and rules snapshot
### Mode radii
- short: 500m
- medium: 750m
- long: 1500m

### Mode timers
- short: 30 minutes
- medium: 45 minutes
- long: 60 minutes

### Target distance bands from player
- 10% chance: over 2km
- 60% chance: 0–1km
- 30% chance: 1–2km

### Street View settings snapshot
- glimpse FOV: 90
- snapshot FOV: 70
- metadata radius: 200m
- target max attempts: 25

## Scoring snapshot
Scoring v2 is grade-based with bonuses.

### Base grades
- Diamond: 800
- Emerald: 650
- Platinum: 500
- Gold: 375
- Silver: 250
- Bronze: 125
- Copper: 50

### Bonuses
- time bonus up to 300 (doubled in v3)
- length bonus: short 0, medium 50, long 100
- difficulty bonus: easy 0, normal 50, hard 100
- tool efficiency bonus depends on tools used, excluding the starter photo

### Grade thresholds
Thresholds scale with the current mode radius and should remain fair under real GPS conditions.

## Roadmap phases
### Phase A — Stabilise the loop
Complete.

### Phase B — Strengthen mid-run
Current focus.

### Phase C — Define mastery
Complete enough for current build: difficulty rules, score bonuses, hard-mode mechanics.

### Phase D — Chain mode
Not started.

### Phase E — Remote mode
Not started.

### Phase F — Optional expansion
Later ideas such as daily challenges, async comparison, lore, and social features.

## Risk watchlist
- Grade thresholds too strict for real GPS variance
- Curses still need playtesting for readability — naming pass done, mechanical legibility improving
- N/S/E/W overpowered and collapsing too much search space
- Solved-meta opener sequences
- Dead air in the middle of runs
- Timer pressure tuning — v3 time costs active; monitor for too-harsh timeout rates on short/hard
- Street View API cost/availability concerns
- Any regression that breaks adjusted-distance fairness at lock-in
- Leaflet stacking context: fog (450), blackout cover (650), player (700) — any new Leaflet layers must declare a pane explicitly or they land in the default overlay pane (400) below the fog
