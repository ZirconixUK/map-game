# Remote Mode — Design Spec

**Date:** 2026-03-30
**Status:** Approved

---

## Overview

Remote mode is a standalone game mode (alongside Normal and Gauntlet) that lets players play without physically walking. GPS drives the initial region anchor only; all movement is via map taps. A limited tap budget replaces walking as the core spatial constraint.

---

## Mode Entry

A third button (`data-game-mode="remote"`) is added to the existing 3-column mode selector row in the new-game setup panel. When selected, a `remoteModeInfo` blurb appears below (mirrors `gauntletModeInfo` pattern), summarising the tap budget and timer for the chosen round length.

`gameSetup.mode` is set to `'remote'`. The existing normaliser in `04_state.js` already supports this value.

---

## Core Mechanics

### GPS anchor
Real GPS is read once at session start to seed the region centre (target selection radius, POI pool). If GPS is unavailable, fall back to the last known position in localStorage, then to a default (Liverpool centre). GPS is not used again after this initial read — the geolocation watch is not started for remote rounds.

### Tap movement
Tapping the map teleports the player marker to that point. Each tap costs one move from the budget. Tapping outside the map (e.g. on a panel) does not cost a move.

### Move budgets
| Length | Moves |
|--------|-------|
| Short  | 15    |
| Medium | 20    |
| Long   | 25    |

### Timers
| Length | Timer |
|--------|-------|
| Short  | 5 min |
| Medium | 8 min |
| Long   | 12 min |

### Out-of-taps flow
At 3 moves remaining, a persistent toast warns the player. At 0 moves, lock-in is triggered automatically at the current position.

### Undo
One undo per round. A small "Undo" button appears near the timer HUD for ~3 seconds after each tap (then fades). Using it restores the previous position and refunds the move. Once used, the undo button no longer appears for the rest of the round.

---

## HUD

The move counter (moves remaining) is displayed beside the timer widget at the top of the map. At 3 moves remaining it turns amber; at 0 it triggers auto lock-in.

---

## Curse System

### Disabled in remote mode
The following curses are suppressed entirely when `isRemoteActive()`:
- `overcharged` (tool use costs time)
- `timepen_minor` / `timepen_moderate` / `timepen_major` (instant time penalties)

### Duration override
All remaining timed curses have their duration overridden to **1 minute** (`REMOTE_CURSE_DURATION_MS = 60_000`) in remote mode. This applies to: heat1 (Accelerant), heat2 (Fever Surge), heat3 (Compass Rot), heat4 (Signal Clamp), heat5 (Burned Lens), veil, blackout, ghost.

### Remote-specific curses
Four new curses replace the disabled ones. They are added to the heat pool when `isRemoteActive()`.

| Curse | ID | Trigger tier | Effect | Duration |
|---|---|---|---|---|
| **Double Step** | `remote_doublestep` | Heat 2+ | Each tap costs 2 moves instead of 1 | 1 min |
| **Shaky Hands** | `remote_shakyhands` | Heat 3+ | Undo is disabled for the rest of the round | Permanent (one-shot on apply) |
| **Anchored** | `remote_anchored` | Heat 4+ | Immediately deduct 3 moves from budget | Instant (no duration) |
| **Tunnel Vision** | `remote_tunnelvision` | Heat 5 | Each tap can only move within 300m of current position | 1 min |

All four are implemented inside `js/22_remote.js`. Double Step and Tunnel Vision are checked on each tap. Shaky Hands sets a flag that hides the undo button. Anchored fires once on apply and subtracts from the budget immediately.

---

## Scoring & Persistence

**Scoring:** Standard grade-based scoring (same as normal mode). No move-efficiency bonus in v1 — revisit after playtesting.

**Persistence:** `22_remote.js` saves to localStorage on each tap: current position, moves remaining, undo availability, active remote curse state. `13_boot.js` restores remote state on page load if a remote round was in progress (mirrors gauntlet persistence pattern).

---

## Architecture

| Action | File | Purpose |
|--------|------|---------|
| Create | `js/22_remote.js` | All remote logic: tap handler, move budget, undo, remote curse effects. Exposes `window.isRemoteActive()`, `window.getMovesRemaining()`, `window.remoteHandleTap(latlng)`, `window.undoLastMove()` |
| Modify | `js/00_config.js` | Add `REMOTE_MOVE_BUDGETS`, `REMOTE_TIME_LIMITS_MS`, `REMOTE_CURSE_DURATION_MS` |
| Modify | `index.html` | Mode selector button, `remoteModeInfo` blurb, undo button element near timer HUD, load `22_remote.js` |
| Modify | `js/02_dom.js` | Wire mode selector button; suppress GPS watch when `mode === 'remote'`; route map taps to `remoteHandleTap()` when active |
| Modify | `js/09_ui_helpers.js` | Render move counter beside timer when remote is active |
| Modify | `js/19_curses.js` | In `applyCurse()`: skip disabled curses, override duration to `REMOTE_CURSE_DURATION_MS`, route remote curses to `22_remote.js` handlers |
| Modify | `js/20_guess.js` | `lockInGuess()` callable by `22_remote.js` on taps-exhausted auto lock-in |
| Modify | `js/13_boot.js` | Restore remote state on page load |

---

## Open questions (post-v1)

- Move efficiency bonus in scoring?
- Should remote mode be available in Gauntlet (remote gauntlet)?
- Tunnel Vision radius tuning (300m is a first guess).
