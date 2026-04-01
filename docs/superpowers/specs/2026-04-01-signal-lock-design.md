# Signal Lock — Design Spec
**Date:** 2026-04-01  
**Status:** Approved

## Overview

Signal Lock is a new once-per-round gameplay tool that reveals several candidate circular zones on the map. Exactly one zone is guaranteed to contain the hidden target. The others are false leads. It is a powerful early-game informational tool with a high heat cost.

---

## Mode settings

| Mode | Game area radius | Circles | Circle radius |
|------|-----------------|---------|---------------|
| Short | 500m | 4 | 175m |
| Medium | 1000m | 4 | 250m |
| Long | 1500m | 5 | 425m |

Heat cost: **2.0** (the highest single-use tool cost; matches the top of the radar scale).

---

## Config

Added to `js/00_config.js`:

```js
const SIGNAL_LOCK_CONFIG_BY_MODE = {
  short:  { count: 4, radius: 175, heat: 2.0 },
  medium: { count: 4, radius: 250, heat: 2.0 },
  long:   { count: 5, radius: 425, heat: 2.0 },
};
```

The authoritative game area radius comes from `getModeTargetRadiusM()` (500 / 1000 / 1500).

---

## New file: `js/22_signal_lock.js`

IIFE module. Exposes a `window.*` API.

### Public API

| Function | Description |
|---|---|
| `window.useSignalLock()` | Main action: generate circles, render, persist, add heat |
| `window.clearSignalLockOverlays()` | Remove Leaflet layer; clear in-memory circles |
| `window.getSignalLockCircles()` | Return current `[{ lat, lon, radiusM, isTrue }]` array |
| `window.__restoreSignalLockCircles(circles)` | Restore from persisted data (called on boot) |
| `window.renderSignalLockCircles(circles)` | Render (or re-render) a given array of circles |

### Circle generation algorithm

1. **Inputs**
   - `mode` from `getSelectedGameLength()`
   - `cfg` = `SIGNAL_LOCK_CONFIG_BY_MODE[mode]`
   - `R` = `getModeTargetRadiusM()`
   - `y` = `cfg.radius`
   - `count` = `cfg.count`
   - `roundCenter` = `roundStateV1.startLatLng` → fallback `player` → fallback `target`
   - `tgt` = `{ lat: target.lat, lon: target.lon }`

2. **Constants**
   - Edge margin: `margin = Math.max(50, R * 0.10)` (m)
   - Max center distance from round center: `R - y - margin`
   - Min separation between circle centres: starts at `2.4y`, reduced on retries

3. **True circle**
   - Pick a random bearing (0–360°) and a random offset distance `d = random() * y * 0.65`
   - Centre = `destinationLatLon(tgt.lat, tgt.lon, bearing, d)`
   - Verify: `haversineMeters(centre, tgt) <= y` (should always pass)
   - Verify: `haversineMeters(centre, roundCenter) <= R - y - margin`
   - If placement constraint fails, try up to 20 bearings; final fallback = centre directly on target

4. **False circles**
   - Target must be **outside** the circle: `haversineMeters(candidate, tgt) > y`
   - Centre must be inside playable area: `haversineMeters(candidate, roundCenter) <= R - y - margin`
   - Minimum separation from every other placed circle centre: `minSep` (see retry schedule)
   - Angular spread preference: softly prefer candidates in the least-occupied angular sector (360/count degrees wide)

5. **Retry / fallback schedule**
   - Attempt to place all circles with `minSep = 2.4y`
   - After 200 failed candidates: relax to `2.2y`
   - After 400: relax to `2.0y`
   - After 600: relax to `1.8y`
   - After 800: relax to `1.5y`
   - Absolute minimum: `1.5y` — never go below
   - `count` is always met; only spacing is relaxed

6. **Containment validation** (after generation, before returning)
   - Assert `circles.filter(c => haversineMeters(c, tgt) <= c.radiusM).length === 1`
   - Log pass/fail

### Debug logging

On each `useSignalLock()` call, log:
- Mode, circle count, circle radius, heat cost
- Which circle is the true circle (index)
- Each centre coordinate (lat/lon, distance from target, distance from round centre)
- Any relaxation steps triggered
- Final containment assertion result

---

## Leaflet rendering

- Custom pane: `signalPane` at z-index **460** (above fog 450, below player 700)
- Layer: `L.layerGroup` stored in module scope
- Each circle: `L.circle([lat, lon], { radius: radiusM, ... })` — real-world metres

Style:
```
color:       '#22d3ee'   (cyan-400)
weight:      2
opacity:     0.85
fillColor:   '#22d3ee'
fillOpacity: 0.10
interactive: false
dashArray:   '6 4'
```

Each circle gets a `.bindTooltip("Signal zone #N")` for debug readability. Tooltips are permanent=false (hover only) so they don't clutter the mobile view.

Circles persist visually until `clearSignalLockOverlays()` is called (new round / new target).

---

## State persistence

### Saving (`js/04_state.js` — `saveRoundState`)

```js
signalLockCircles: (typeof window.getSignalLockCircles === 'function') ? window.getSignalLockCircles() : null,
```

### Restoring (`js/13_boot.js`)

A `__tryRestoreSignalLock(saved)` function, called in the same pattern as `__tryRestoreFog`, restores circles from `saved.signalLockCircles` by calling `window.__restoreSignalLockCircles(circles)` then `window.renderSignalLockCircles(circles)`.

### Clearing

- `resetRound()` in `js/04_state.js`: call `window.clearSignalLockOverlays()` (guarded by typeof check)
- `clearClues()` in `js/08_clues_questions.js`: call `window.clearSignalLockOverlays()`

---

## UI

### Button

Added to `gameMenu` in `index.html`:

```html
<button id="qSignalLock"
  class="menuBtn menuBtn--iconOnly rounded-xl bg-[#060e1c] border border-teal-500/70 transition-all duration-150 active:scale-95"
  aria-label="Signal Lock" title="Signal Lock">
  <span class="iconBox text-2xl">📶</span>
</button>
```

Grid changes from `repeat(5, 1fr)` → `repeat(3, 1fr)` (6 buttons, 2 rows of 3).

### Tool flow

Signal Lock has **no submenu**. Clicking `#qSignalLock` in the `panelGameplay` delegation:
1. Checks `isToolOptionAlreadyUsed('signalLock', 'default')` — shows "already used" toast if so
2. Calls `__toolConfirmShow` with tool name, cost badge, and description: *"Reveals several possible signal zones. The target is inside one of them."*
3. On confirm: calls `window.useSignalLock()` and closes the panel

### Cost badge

`updateCostBadgesFromConfig` in `15_tools_config.js` gains:
```js
{ toolId: "signalLock", selector: "[data-signal-lock]", getOption: (el) => el.getAttribute("data-signal-lock") }
```

The button gets `data-signal-lock="default"` so the badge updates automatically when curses are active.

### Lock state

`__cacheToolButtonNodes` in `09_ui_helpers.js` includes `#qSignalLock`.

`getToolUsageMeta` recognises `data-signal-lock` and maps to `{ toolId: 'signalLock', optionId: 'default' }`.

After use: button shows `used` CSS class (dimmed), consistent with other once-per-round tools.

---

## tools.json

```json
"signalLock": {
  "label": "Signal Lock",
  "default": { "heat_cost": 2.0 }
}
```

---

## Non-interactions

Signal Lock does **not**:
- Modify fog-of-war geometry
- Interact with the radar or thermometer results
- Block or limit any existing tool
- Add lockouts or curses specific to itself
- Change existing heat costs

---

## Script load order

`js/22_signal_lock.js` loads after `js/17_leaflet_fog.js` and `js/12_geo_helpers.js`, and before `js/13_boot.js`.

---

## Acceptance criteria

1. Appears as a usable once-per-round tool in the gameplay panel.
2. Reveals correct circle count for the active mode.
3. Target is inside exactly one circle — validated by assertion + debug log.
4. Circles are visually spread out, not clustered.
5. Persist across refresh; clear on new round/new target.
6. Heat increases by 2.0 (plus active curse surcharges).
7. Debug logs confirm circle generation and containment check.
8. Does not modify fog-of-war or interfere with existing overlay logic.
9. Target is not always at the centre of the true circle.
