# Gauntlet Mode Design

**Date:** 2026-03-28
**Status:** Approved
**Phase:** D

---

## Overview

Gauntlet is a new game mode where the player finds 5 targets back-to-back under a single shared 90-minute clock. No score is shown between targets — only individual distances. A final summary reveals per-target grades and an overall score derived from the average.

In code and data, this mode is referred to as `gauntlet`. The player-facing name is **Gauntlet**.

---

## State & Data Model

### `gameSetup` (in `js/04_state.js`)

A third field is added:

```js
let gameSetup = {
  length: 'short',
  difficulty: 'normal',
  mode: 'normal', // 'normal' | 'gauntlet'
};
```

The normalizer defaults unknown values to `'normal'`. Saved state from before this change loads cleanly.

### `gauntletState` (owned by `js/21_gauntlet.js`)

```js
{
  active: false,
  totalTargets: 5,
  currentIndex: 0,       // 0-based index of the current target
  results: [             // one entry pushed after each lock-in
    {
      distanceM,         // null if timed out before guessing
      grade,             // 'Diamond'|'Emerald'|...|'Copper'
      score,             // individual target score (grade base + difficulty bonus + tool efficiency)
      guessLatLng,       // {lat, lon} or null
      targetLatLng,      // {lat, lon}
    }
  ],
  chainTimerStartMs: null, // set once at Gauntlet start, never reset between targets
}
```

### Persistence

`gauntletState` is persisted to localStorage as part of the existing round state blob. The gauntlet module exposes:
- `window.getGauntletStateForPersistence()` — returns serialisable state
- `window.restoreGauntletState(saved)` — called by the boot/restore cycle

On page load, if a Gauntlet is in progress and the overall timer has expired while the phone was locked, the current position is auto-locked as the guess, the reveal plays, and the flow proceeds to the Next Target modal (or Results if it was the last target). Remaining unplayed targets score as Copper with `distanceM: null`.

---

## Constants (in `js/00_config.js`)

```js
const GAUNTLET_TARGET_COUNT   = 5;
const GAUNTLET_TIME_LIMIT_MS  = 90 * 60 * 1000; // 90 minutes
```

---

## Setup Panel (`panelNewGame`)

A new **Mode** row is added to `panelNewGame` between Length and Difficulty, with two buttons:

- `Normal` (`data-game-mode="normal"`)
- `Gauntlet` (`data-game-mode="gauntlet"`)

When **Gauntlet** is selected:
- Medium and Long length buttons become visually disabled (`opacity-40 pointer-events-none`, `aria-disabled="true"`)
- Short auto-selects if Medium or Long was active
- A small info block appears below the Mode row: *"Find 5 targets back-to-back. One 90-minute clock. No scores between targets — only your final average counts."*
- Difficulty remains fully selectable

When **Normal** is selected, length buttons return to normal and the info block disappears.

The Start button works identically. On start, `21_gauntlet.js` detects `mode === 'gauntlet'` and initialises chain state before the first target is picked.

---

## Per-Target Flow

Each target in a Gauntlet plays as a normal short round with these differences:

### Timer
The HUD shows the shared 90-minute timer counting down continuously. There is no per-target timer reset. The timer counts down from `chainTimerStartMs` (set once when the Gauntlet starts), **not** from `roundStartMs` (which resets per target). The timer widget and `getRoundTimeLimitMs()` must use `chainTimerStartMs` + `GAUNTLET_TIME_LIMIT_MS` when a Gauntlet is active.

### Progress Indicator
A persistent badge sits **below the timer widget** in the HUD showing e.g. `2 / 5`. Visible throughout the Gauntlet.

### Heat & Curses
Resets to zero at the start of each new target. Curses clear with the heat reset.

### Tools & Overlays
Full reset between targets — the **cleanup portion** of what `startNewRound` does today (clear overlays, reset `usedToolOptions`, clear photo gallery, reset heat). Does **not** open `panelNewGame` or reset `gameSetup`.

### On Lock-in
1. Normal reveal animation plays: toast dismissed → player→target line drawn → map fits to show both points → 1.8s → **Next Target modal** (not result modal)
2. The result modal is suppressed when `isGauntletActive()` returns true

### Timer Expiry Mid-Target
If the wall-clock timer expires during a target, the current player position is auto-locked as the guess. The reveal plays and the Next Target modal (or Results modal if last target) is shown. Any remaining unplayed targets score as Copper with `distanceM: null`.

---

## Next Target Modal

Shown after every target's reveal animation, including the last:

- Distance to that target: *"You were 143m away"*
- Progress: *"Target 2 of 5 complete"*
- Single button: **"Next Target →"** (targets 1–4) or **"See Results"** (target 5)
- **Timer continues ticking while this modal is open** — the player cannot idle here to bank time

Tapping "See Results" opens the Gauntlet Summary modal.

---

## Gauntlet Summary Modal

Shown after all 5 targets are complete (or timer expiry):

### Content
- Header: *"Gauntlet Complete"*
- Table of 5 targets: target number | distance | grade | individual score
- Timed-out / unplayed targets: distance shown as `—`, grade Copper, score = Copper base
- **Overall row**: average distance, overall grade (derived from average distance against standard thresholds), overall score, time bonus

### Scoring
- **Individual score** = grade base score + difficulty bonus + tool efficiency bonus (no time bonus per target, no length bonus since Gauntlet is always short)
- **Overall score** = `(sum of individual scores / 5) + time bonus`
- **Time bonus** = calculated from remaining time when the last guess was locked, using the same formula as normal mode (`SCORE_TIME_BONUS_MAX`)
- **Overall grade** = derived by running the average distance through the standard `short` grade thresholds

### Actions
- **"New Game"** — opens `panelNewGame`
- **"Close"** — dismisses modal, map visible

### Persistence
The summary modal HTML is persisted to localStorage (same mechanism as the normal result modal) so it can be reopened after a page refresh. A "reopen" button in the System panel follows the same pattern as today.

---

## Module Architecture & File Changes

### New file: `js/21_gauntlet.js`

Owns all chain logic:
- Initialises, manages, and persists `gauntletState`
- Listens for a `guesslocked` custom event fired by `lockInGuess` after the reveal animation
- Suppresses the normal result modal when gauntlet is active (checks `isGauntletActive()`)
- Renders and controls the Next Target modal
- Resets heat, tools, overlays between targets and triggers next target selection
- Renders and shows the Gauntlet Summary modal
- Exposes: `window.isGauntletActive()`, `window.getGauntletStateForPersistence()`, `window.restoreGauntletState(saved)`

### Modified files

| File | Change |
|---|---|
| `js/00_config.js` | Add `GAUNTLET_TARGET_COUNT` and `GAUNTLET_TIME_LIMIT_MS` |
| `js/04_state.js` | Add `mode` to `gameSetup`; plug gauntlet save/restore into persistence cycle; `getRoundTimeLimitMs()` returns `GAUNTLET_TIME_LIMIT_MS` when mode is gauntlet |
| `js/20_guess.js` | `lockInGuess` fires `guesslocked` custom event after reveal; checks `isGauntletActive()` before showing result modal |
| `js/02_dom.js` | Wire Mode selector buttons; disable Medium/Long when Gauntlet selected; call `setGameSetupSelection({ mode })` |
| `index.html` | Add Mode row to `panelNewGame`; add `2 / 5` progress badge below timer widget; add Gauntlet Summary modal skeleton |

---

## Design Constraints Preserved

- Physical movement remains the core mechanic — Gauntlet does not change how targets are picked or how distance is measured
- Heat/curse system unchanged — Gauntlet reuses existing heat logic, just resets between targets
- Auth/DB are progressive enhancements — Gauntlet scores follow the same guest-safe persistence pattern
- Script load order: `21_gauntlet.js` loads after `20_guess.js`
