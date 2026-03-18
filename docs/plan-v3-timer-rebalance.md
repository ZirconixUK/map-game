# Plan: V3 Timer Rebalance

## Problem statement

The timer is currently irrelevant. In simulation, ~0% of short/normal runs finish with less than 5 minutes remaining. Players can trivially beat the clock on any difficulty. Five root causes were identified:

1. **Dead time cost code** — `addPenaltyMs()` exists in `js/04_state.js` but is never called from any tool handler. `QUESTION_TIME_COST_MS = 5 * 60 * 1000` is defined in `js/00_config.js` but never used.
2. **Stale heat costs** — Previous rebalance of tool costs in `tools.json` was never applied to the actual heat logic. Tools still charge the old default rates.
3. **Thermometer inversion bug** — Tighter radius (more precise, more valuable) currently costs *less* heat than wide. It should cost more.
4. **Score time bonus too small** — Current max is 150 points (~11% of max total). Players have no scoring incentive to move fast.
5. **Curses don't create time pressure** — Current curse effects block tools or add heat surcharges; none meaningfully advance the timer or create urgency.

## Timer exploit fix (already implemented — 2026-03-18)

**Files changed:** `js/13_boot.js`, `js/09_ui_helpers.js`, `js/20_guess.js`

Wall-clock timer is now enforced on page restore:
- If `elapsed > limit + 30 min` (and no guess made): game discarded, toast "Previous game timed out".
- If `elapsed > limit` (and no guess made): `__roundExpiredOnLoad = true` → immediate auto-lock with no 1.2s repositioning window.
- Overtime display removed — timer cannot go past 0.
- `guessRemainingMs` clamped to 0 in result modal.

## V3 balance changes (proposed — not yet implemented)

### 1. Activate time costs on tools

**File:** All tool call sites (primarily `js/09_ui_helpers.js`, `js/08_clues_questions.js`, any tool handler that currently calls `addPenaltyMs` nowhere)

Replace the dead `addPenaltyMs` approach — instead, deduct directly from `penaltyMs` (or the equivalent mechanism) when a tool is used. The simulation used these per-use costs:

| Tool | Current time cost | Proposed time cost |
|------|------------------|-------------------|
| Radar (widest) | 0 | 90s |
| Radar (wide) | 0 | 120s |
| Radar (medium 1) | 0 | 150s |
| Radar (medium 2) | 0 | 150s |
| Radar (narrow) | 0 | 180s |
| Radar (tightest) | 0 | 180s |
| Thermo (wide) | 0 | 150s |
| Thermo (medium) | 0 | 120s |
| Thermo (tight) | 0 | 120s |
| N/S or E/W | 0 | 180s |
| Landmark | 0 | 120s |
| Extra photo near200 | 0 | 120s |
| Extra photo near100 | 0 | 120s |
| Horizon photo | 0 | 90s |
| Uncorrupt photo | 0 | 90s |

Note: the starter photo is free (no time cost), as it's the hook for the run.

**Implementation note:** Call `addPenaltyMs(N * 1000)` (or equivalent) at the point where each tool result is confirmed/delivered. The `addPenaltyMs` function already exists in `js/04_state.js`; it just needs to be called.

### 2. Fix thermometer inversion

**File:** `js/00_config.js` (or wherever thermo heat costs are defined)

Current behavior: tight radius = lower heat cost. Desired behavior: tighter = higher cost.

Proposed heat costs (heat units, not time):
- Wide: lower cost (easy clue, less info)
- Tight: higher cost (strong clue, more info)

The exact values should be confirmed by looking at `THERMO_OPTIONS_BY_MODE` in `js/00_config.js` and inverting the cost gradient.

### 3. Increase score time bonus

**File:** `js/00_config.js`

Change: `SCORE_TIME_BONUS_MAX = 150` → `300`

This doubles the time bonus weight from ~11% to ~22% of max total, making speed a meaningful scoring axis.

### 4. Heat cost rebalance

**File:** `tools.json` (heat costs) and cross-check with `js/00_config.js`

The simulation assumed these heat costs (which differ from current live values):

| Tool | Current heat | Proposed heat |
|------|-------------|--------------|
| N/S or E/W | 0.4 | 0.5 |
| Landmark | 0.5 | 0.4 |
| Extra photo near200 | 1.2 | 1.0 |
| Extra photo near100 | 1.5 | 1.2 |
| Horizon | 1.0 | 0.8 |
| Uncorrupt | 0.8 | 0.6 |

These are minor adjustments; the bigger effect is from the time costs.

## Simulation results (v3 model)

Monte Carlo across 10,000 runs per mode/difficulty, using proposed changes.

Key finding: **timer is felt** — 48% of short/normal runs end with <5 min remaining vs ~0% today.

### Short mode (30 min)
| Difficulty | Median remaining | <5 min fraction | >0 curse | time_out_frac |
|-----------|-----------------|----------------|---------|---------------|
| Easy | ~8 min | ~25% | ~60% | ~5% |
| Normal | ~6 min | ~40% | ~70% | ~8% |
| Hard | ~4 min | ~55% | ~80% | ~12% |

### Normal mode (45 min)
| Difficulty | Median remaining | <5 min fraction | >0 curse | time_out_frac |
|-----------|-----------------|----------------|---------|---------------|
| Easy | ~12 min | ~15% | ~55% | ~3% |
| Normal | ~9 min | ~25% | ~65% | ~5% |
| Hard | ~7 min | ~35% | ~75% | ~8% |

### Long mode (60 min)
| Difficulty | Median remaining | <5 min fraction | >0 curse | time_out_frac |
|-----------|-----------------|----------------|---------|---------------|
| Easy | ~16 min | ~10% | ~45% | ~2% |
| Normal | ~13 min | ~18% | ~55% | ~3% |
| Hard | ~10 min | ~28% | ~65% | ~5% |

*(Exact figures in `docs/run_simulation_v3_report.pdf`)*

### V2 (current live) comparison
In the current live build, median remaining time across all modes/difficulties is 15–25 minutes. Less than 1% of runs see <5 min remaining.

## Implementation order (if/when actioned)

1. Fix thermo inversion (`js/00_config.js`) — isolated, low risk.
2. Increase time bonus (`js/00_config.js`) — single constant, no logic change.
3. Activate time costs — find all tool delivery points and call `addPenaltyMs`. This is the highest-impact change and requires careful per-tool verification.
4. Heat cost rebalance (`tools.json`) — after time costs, tune heat separately.
5. Full regression check: timer display, lock-in, result scoring, HUD.

## Files to touch

| File | Change |
|------|--------|
| `js/00_config.js` | Fix thermo costs (inversion), increase `SCORE_TIME_BONUS_MAX` |
| `js/08_clues_questions.js` | Call `addPenaltyMs` on landmark/NSEW/radar delivery |
| `js/09_ui_helpers.js` | Call `addPenaltyMs` on photo tool delivery |
| `js/18_streetview_glimpse.js` | Possibly: call `addPenaltyMs` on extra photo delivery |
| `tools.json` | Heat cost adjustments |

## What NOT to change

- Timer durations (30/45/60 min) — these are calibrated to real walking.
- Grade thresholds — scoring v2 grades are already calibrated.
- Curse trigger probabilities or effects — separate design question.
- `QUESTION_TIME_COST_MS` — leave as dead code; it was for a Q&A mechanic that was removed.
