# Testing and regression guide

## Regression priorities
Whenever a non-trivial change lands, manually check the systems most likely to drift:
- new round flow
- target generation and snapping
- menu open/close behavior
- tool lock/used states
- cost badge updates
- heat and curse UI alignment
- result modal and refresh persistence
- debug controls

## Manual regression checklist
### New round / reset
- Starting a new round clears old overlays and stale UI.
- Old result modal content does not persist into the next round.
- Target, timer, and tool state reset correctly.

### Target generation
- Target selection respects the current mode radius.
- Final snapped Street View pano still ends up inside intended constraints.
- Sparse-POI logic still finds a playable target when nearby POIs are thin.

### Menus and overlays
- Gameplay menu opens and closes correctly.
- Dynamic submenu buttons still work after navigation and restores.
- Outside-tap close behavior works without blocking the map.
- Map panning/zooming still feels normal.

### Tools
- Used options show the correct feedback.
- Locked options show correct unlock/availability feedback and a live `.lockCountdown` badge with remaining time (updates every 250ms; disappears when unlocked).
- Cost badges match actual configured behavior (white text on solid amber-600 pill).
- Purchased/reopened photos obey the intended caching and free-reopen rules.
- Thermometer start produces a toast "Thermometer started — walk Xm from here." that auto-dismisses after ~3.5s.

### Heat and curses
- Heat changes are visible and correspond to actual usage.
- Curse icon inactive/active states match the real curse state.
- Curse effects actually apply and are understandable.
- Hard mode interactions still make sense.
- **Veil of Ignorance**: fog overlay disappears; map tiles and player dot remain visible; canvas overlay (bounds box) hidden.
- **The Blackout**: map goes fully black; player dot remains visible; HUD/FABs remain accessible; fog and tiles hidden.
- **Signal Clamp**: radar buttons > 250m show purple background, purple border, and 🔒 badge; 50m/100m/250m buttons are unaffected.
- **Ghost Walk**: player dot disappears from map.
- **Debug curse picker**: opening shows all curses with correct heat tier badges (e.g. "Heat 3" for Compass Rot, "Heat 3+" for Veil). Applying a curse triggers the standard curse toast.
- **Debug timer advance**: advancing the timer with active curses also advances curse expiry. Curses expire in sync with the round timer.

### Timer and wall-clock expiry
- Timer does not show overtime (cannot go negative).
- Refreshing the page with time expired auto-locks immediately without a repositioning window.
- Refreshing the page with >30 min past expiry discards the game and opens new-game panel with toast.
- `penaltyMs` is correctly preserved across refreshes.

### Scoring and results
- Lock-in guess produces the correct grade and score breakdown.
- Adjusted distance behavior still feels fair under GPS accuracy.
- After locking in: reveal line appears on map, map pans/zooms to fit both endpoints, then ~1.8s later the result modal opens.
- Result modal renders fully and shows: target name (📍) below grade flavor text; adjusted distance inside the Distance stat card (when GPS adjustment was applied).
- Result modal can be reopened after dismiss.
- Refresh recovery still works when expected — result HTML is persisted to localStorage before the reveal delay, so a refresh during that window still restores the modal.

### Photo gallery strip
- After viewing starter photo, a thumbnail appears in the gallery strip above the game menu.
- After purchasing extra photos, thumbnails appear in the strip (one per purchase, including repeat near100/near200 buys).
- Tapping a thumbnail opens `showPhotoInModal` with the correct photo.
- Non-starter thumbnails show the greyscale/contrast `is-corrupted` filter until "Uncorrupt" is used; after uncorrupt they update immediately.
- Starting a new round clears the gallery strip (no stale photos from prior round).
- Reloading mid-round with collected photos restores the gallery strip correctly.

### Toast and dismiss behavior
- Toasts cannot be dismissed by tapping within the first 600ms (accidental pan protection).
- Tapping after 600ms dismisses the toast.
- Programmatic dismiss (`dismissAllToasts`, auto-lock expiry chain) still fires instantly.

### Geolocation
- GPS fail badge (red dot) appears on recenter FAB when location is unavailable or denied.
- Badge clears when a GPS fix is obtained (one-shot or continuous watch).
- Badge appears if GPS watch loses signal mid-round (not just on initial failure).

### Debug mode
- Debug controls still open and function.
- Debug-only affordances do not leak into normal mode accidentally.

## Architecture-sensitive edits checklist
If you touched any of these, do an extra pass:
- `index.html` script order
- `js/04_state.js`
- delegated gameplay menu handling
- POI loading/filtering
- landmark queries
- Street View target snapping
- localStorage or IndexedDB persistence

## Qualitative playtest checks
A run is healthy if the player can answer yes to most of these:
- I finished the run instead of drifting away.
- I had at least one clear recognition moment.
- I felt clever, not merely obedient to the UI.
- The result felt deserved, even if the score was poor.
- I wanted to start another run.

## Signs a build may be getting worse
- Players fall into the same opener every game.
- Middle-of-run movement feels mechanical or empty.
- Directional clues trivialize search too often.
- Curses feel arbitrary or annoying instead of tense.
- Mobile interactions become fiddly or visually crowded.
- The game starts feeling like map-click cleanup instead of a real-world hunt.
