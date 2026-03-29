# Starting Location Picker — Design Spec
_2026-03-29_

## Problem

When starting a new game, the target area is seeded from the player's current GPS position. If the player has wandered to the edge of a city boundary, the next game will be seeded from there rather than somewhere more useful (e.g. their town centre). There is no way to choose a different area without physically moving.

## Goal

Allow the player to optionally pick a starting area on the map when beginning a new game. The picked location seeds the target selection and initial map view — the player's real GPS position still tracks normally during gameplay.

---

## New Game Panel

A new "Starting Location" section is added to `panelNewGame` in `index.html`, placed between the Mode and Difficulty sections.

Two `choiceBtn`-style buttons:
- **Current Location** — default, always pre-selected on page load. Existing GPS flow runs unchanged.
- **Pick on Map** — flag only; no map interaction happens here. Location picking occurs after the player taps Start.

The section uses the same visual language (`choiceBtn`, `sectionLabel`) as the existing Length/Mode/Difficulty rows.

---

## Start Button Flow

**Current Location selected:** Existing `startNewGameFromMenuOrDebug()` flow runs unchanged.

**Pick on Map selected:**
1. New Game panel closes.
2. Pick mode activates (see below).
3. On confirm, game starts with the picked lat/lon as the area seed.
4. On cancel, New Game panel reopens with options preserved.

---

## Pick Mode UX

Managed by a new `__startLocationPickMode()` function in `js/02_dom.js`.

**Entry:**
- A top banner appears: "Tap the map to set start area" with an "✕ Cancel" button on the right.
- Map is fully interactive — player can pan and zoom freely.
- No pin is placed until a deliberate tap.

**Tap detection:**
- On `pointerdown`, record position.
- On `pointerup`, if movement ≤ 10px, treat as a deliberate tap and drop a pin.
- If movement > 10px, treat as a pan — no pin action.

**Pin placed:**
- A Leaflet marker is added at the tapped location.
- The marker is draggable for fine adjustment.
- Top banner changes to: "Drag the pin to adjust".
- A bottom confirmation bar appears: **[Re-pick]** and **[Confirm]** buttons.

**Re-pick:** removes the pin, returns to "Tap to place" state (top banner reverts).

**Confirm:** stores `{ lat, lon }` in a module-level variable (`__pickedAreaSeed`), closes pick mode UI, calls `__runGameStartWithSeed()`.

**Cancel (top banner ✕):** clears pick mode UI, reopens New Game panel with options preserved. Does not affect the "Pick on Map" choice selection — player can change their mind in the panel.

---

## Game Start with Area Seed

A new `__runGameStartWithSeed(seed)` function handles the seeded start sequence in `js/02_dom.js`. The existing `startNewGameFromMenuOrDebug()` calls either the normal path or this function depending on which location mode is selected.

**Sequence:**

1. `stopGeolocationWatch()` — cancels any watch left from a previous game. Sets a `__holdGeoWatch = true` flag to prevent `startGeolocationWatch()` from being re-triggered prematurely inside `positionPlayerForNewGame`.
2. `positionPlayerForNewGame({ centerAfterFix: false })` — gets the real GPS fix and records it (player position is set to real GPS). The internal `startGeolocationWatch()` call is suppressed by the `__holdGeoWatch` flag. Centering is skipped here to avoid a visible map jump before re-centering on the seed.
3. `setPlayerLatLng(seed.lat, seed.lon, { source: 'area-seed', force: true })` — overrides player position to the picked seed. No `manualOverride` set, so GPS watch will update it normally once started.
4. Map is centred on the seed location.
5. `__refreshLivePoisForCurrentLocation()` — loads POIs around the seed.
6. `pickNewTarget()` — picks target seeded from the picked location.
7. `__holdGeoWatch = false`, then `startGeolocationWatch()` — real GPS tracking begins.

**Result:** target and initial radar are seeded from the picked location; the player's live GPS position takes over immediately after setup completes.

---

## State

- `__pickedAreaSeed` — module-level `{ lat, lon } | null` in `js/02_dom.js`. Set on Confirm, cleared at the start of each new game sequence.
- `__newGameLocationMode` — `'current' | 'picked'`, module-level. Defaults to `'current'` on page load. Not persisted.
- `__holdGeoWatch` — boolean flag in `js/07_geolocation.js`. Guards `startGeolocationWatch()` during seeded setup.

---

## Files Changed

| File | Change |
|------|--------|
| `index.html` | Add "Starting Location" section to `panelNewGame` |
| `js/02_dom.js` | Add pick mode logic, `__startLocationPickMode()`, `__runGameStartWithSeed()`, wire choice buttons |
| `js/07_geolocation.js` | Add `__holdGeoWatch` flag; `startGeolocationWatch()` respects it |

No changes to `08_clues_questions.js`, `01_pois.js`, or `21_gauntlet.js`.

---

## Out of Scope

- Persisting the picked location across sessions.
- Named/saved locations.
- Gauntlet mode gets no special handling — area seed applies to the first target; subsequent targets use player position as now.
