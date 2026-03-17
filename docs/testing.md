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
- Locked options show correct unlock/availability feedback.
- Cost badges match actual configured behavior.
- Purchased/reopened photos obey the intended caching and free-reopen rules.

### Heat and curses
- Heat changes are visible and correspond to actual usage.
- Curse icon inactive/active states match the real curse state.
- Curse effects actually apply and are understandable.
- Hard mode interactions still make sense.

### Scoring and results
- Lock-in guess produces the correct grade and score breakdown.
- Adjusted distance behavior still feels fair under GPS accuracy.
- Result modal renders fully.
- Result modal can be reopened after dismiss.
- Refresh recovery still works when expected.

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
