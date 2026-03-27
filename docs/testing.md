# Testing and regression guide

## Regression priorities
After any non-trivial change, check: new round flow, target generation, menu open/close, tool lock/used states, cost badges, heat/curse UI, result modal, refresh persistence, debug controls.

## Manual regression checklist

### New round / reset
- Starting a new round clears overlays, stale UI, and old result modal content.
- Target, timer, and tool state reset correctly.

### Target generation
- Respects current mode radius.
- Final snapped Street View pano inside intended constraints.
- Sparse-POI logic finds a playable target when nearby POIs are thin.

### Menus and overlays
- Gameplay menu opens/closes correctly; dynamic submenu buttons work after navigation and restores.
- Outside-tap close works without blocking the map.
- Map panning/zooming feels normal.

### Tools
- Used options show correct feedback; locked options show live `.lockCountdown` badge (updates every 250ms, disappears when unlocked).
- Cost badges: white text on solid amber-600 pill.
- Thermometer start produces toast "Thermometer started — walk Xm from here." (auto-dismisses ~3.5s).
- Purchased/reopened photos obey caching and free-reopen rules.

### Heat and curses
- Heat changes visible and match actual usage.
- `#heatWidget` gets `curse-active` class (purple miasma) when curses are active; clears when none.
- `#panelHeat` shows current heat level (flame icon, level number, badge, description) and active curses.
- Curse effects actually apply and are readable.
- **Veil of Ignorance**: fog disappears; map tiles and player dot remain; canvas overlay hidden.
- **The Blackout**: map goes fully black; player dot remains; HUD/FABs accessible.
- **Signal Clamp**: radar buttons >250m show purple bg, purple border, 🔒 badge; 50/100/250m unaffected.
- **Ghost Walk**: player dot disappears from map.
- **Debug curse picker**: all curses shown with correct heat tier badges; applying a curse triggers standard curse toast.
- **Debug timer advance**: advancing timer with active curses also advances curse expiry.

### Timer and wall-clock expiry
- Timer cannot go negative (no overtime display).
- Refreshing with time expired: auto-locks immediately.
- Refreshing with >30 min past expiry: discards game, opens new-game panel with toast.
- `penaltyMs` preserved across refreshes.

### Scoring and results
- Lock-in produces correct grade and score breakdown.
- Reveal beat: line appears → map fits both endpoints → ~1.8s later result modal opens.
- Result modal shows target name (📍), adjusted distance in Distance stat card (when applied).
- Result modal can be reopened after dismiss.
- Refresh during reveal beat still restores the modal.

### Photo gallery
- After viewing starter photo, camera FAB badge shows count.
- After purchasing extra photos, count increments.
- Tapping the FAB opens `#panelPhotoGallery` (3-column grid).
- Tapping a thumbnail opens `showPhotoInModal` with the correct photo.
- Non-starter thumbnails show greyscale/contrast filter until "Uncorrupt" is used; updates immediately after.
- New round clears the gallery (no stale photos).
- Reloading mid-round restores gallery correctly.
- If SV cache is cold, thumbnail shows spinner then loads via `__fetchStreetViewDataUrl`.

### Toast behavior
- Cannot be dismissed by tap within first 600ms.
- Tapping after 600ms dismisses.
- Programmatic dismiss (`dismissAllToasts`) fires instantly.

### Geolocation
- GPS fail badge appears on recenter FAB when location unavailable/denied.
- Badge clears on any GPS fix (one-shot or watch).
- Badge appears if GPS watch loses signal mid-round.

### Debug mode
- Debug controls open and function.
- Debug-only affordances do not leak into normal mode.

## Architecture-sensitive edit checklist
Extra pass needed if you touched: `index.html` script order, `js/04_state.js`, delegated gameplay menu handling, POI loading/filtering, landmark queries, Street View target snapping, localStorage/IndexedDB persistence.

## Qualitative playtest checks
A run is healthy if the player: finishes instead of drifting away, had at least one clear recognition moment, felt clever not just compliant, felt the result was deserved, wants to start another run.

## Signs a build is getting worse
- Same opener every game.
- Middle of run feels mechanical or empty.
- Directional clues trivialize search.
- Curses feel arbitrary or annoying.
- Mobile interactions become fiddly.
- Feels like map-click cleanup instead of a real-world hunt.
