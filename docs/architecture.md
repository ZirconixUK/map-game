# Architecture reference

## Repository shape
```text
index.html                      Main entry, sequential script loader
styles.css                      All UI styling (dark theme, mobile-first)
js/
  00_config.js                  Master constants, thresholds, API key reads
  01_pois.js                    POI loading, filtering, landmark category helpers
  02_dom.js                     DOM refs, toasts (enqueueToast, dismissAllToasts), debug panel, confirmation panels, delegated gameplay menu events
  03_map_image.js               Leaflet map init, fog canvas setup
  04_state.js                   Master game state and globals
  05_view_transform.js          Canvas coordinate mapping
  06_mobile_gestures_pointer_events.js  Touch/pinch/drag handlers
  07_geolocation.js             GPS watchPosition and fallback chain
  08_clues_questions.js         Question engine and target picking
  09_ui_helpers.js              UI state, panel nav, cost badges, modals
  10_drawing.js                 Canvas drawing
  12_geo_helpers.js             Geo distance and helper functions
  13_boot.js                    Boot flow, restore state, first target
  14_panels_misc.js             Panel sizing, timer tap handler, debug curse picker
  15_tools_config.js            tools.json loading and badge updates
  16_leaflet_markers.js         Player/target markers (playerPane z-700), reveal overlay, POI pins
  17_leaflet_fog.js             Fog-of-war geometry in fogPane (z-450); setFogLayerVisible()
  18_streetview_glimpse.js      Google Street View wrapper and photo caching
  19_curses.js                  Curse system; debugAdvanceCurseTimersBy() for debug timer sync
  20_guess.js                   Lock-in flow, grading, scoring, reveal beat (toast dismiss → reveal line → fitBounds → 1.8s delay → modal), result modal persistence
  poi_worker.js                 Worker for UK POI dataset parsing
POI_UK_runtime.json             UK-wide POI dataset
tools.json                      Tool definitions
curses.json                     Curse definitions
```

## Core architecture patterns
- Global state with getters/setters in `js/04_state.js`.
- Sequential script loading via Promise chain in `index.html`.
- Geometry pipeline uses EPSG:3857 fog geometry and Leaflet layers.
- Tool config flows from `tools.json` into UI badges.
- Street View photos are cached as `data:` URLs in localStorage.
- Round state is persisted to localStorage and restored at boot.
- UK POI dataset is loaded once, cached in IndexedDB, and then sliced per play area.

## Critical invariants
### Script loading
Load order is intentional. Check dependencies before moving or merging modules.

### State ownership
`js/04_state.js` is the source of truth for round/game state. Avoid creating shadow state in unrelated files.

### Gameplay menu event handling
`#panelGameplay` uses delegated events for menu navigation and dynamic submenu actions. Submenus are rebuilt frequently, so direct bindings to internal buttons are fragile and should be avoided.

### Two POI sets
- `window.__allPois`: full UK dataset; never the live render slice.
- `window.POIS`: active filtered slice around the current play area.

Use the right set for the right job:
- Map pins, target picking, and nearby play logic use `window.POIS`.
- Landmark search and landmark Voronoi logic use `window.__allPois`.

## POI system
### Boot loading
`loadPois()`:
1. Check IndexedDB cache `uk_pois_cache_v1`.
2. If absent, parse `POI_UK_runtime.json` via `poi_worker.js` off the main thread.
3. Fall back to main-thread fetch only if needed.
4. Show first-run loading feedback when downloading/parsing.

`window.__clearPoiCache()` should clear the IndexedDB cache for testing a cold boot.

### Live play-area slice
`__refreshLivePoisForCurrentLocation()` filters `window.__allPois` by the chosen mode radius and writes the result to `window.POIS`.

### Landmark queries
`__fetchLandmarkPoisForKind(kind)` searches the full dataset directly. It is not radius-capped and should stay aligned with `__landmarkCategoryPoisFilter(kind, poisArray)`.

## Target generation and Street View
- The selected hidden location may begin from POI logic or sparse-POI random sampling.
- The final playable target is the snapped Street View pano position, not always the original seed point.
- When editing this flow, verify that the final snapped pano still respects the intended mode radius.
- Sparse-POI logic uses `__randomPointInRadius()` to avoid dead areas when nearby POI density is too low.

## Persistence
### LocalStorage keys
- `mapgame_round_v1`: full round state JSON
- `mapgame_last_real_geo_fix_v1`: last GPS fix
- `mg_sv_img_{context}_{key}`: cached Street View image data URLs
- `mapgame_result_html_v1`: persisted result modal HTML

### IndexedDB keys
- `uk_pois_cache_v1`: cached parsed UK POI dataset
- imported POI pack storage for custom datasets

### Persistence gotchas
- `startNewRound()` must clear persisted result modal HTML.
- Refresh recovery should preserve round state and allow result modal restoration when appropriate.
- Result HTML is written to `localStorage` before the 1.8s reveal delay, so a refresh during the reveal beat still restores the modal correctly.
- Cached photo behavior must stay aligned with gameplay rules for free reopen vs first purchase.
- Wall-clock timer is enforced on restore (since 2026-03-18): `roundStartMs` + `getRoundTimeLimitMs()` are compared against `Date.now()` in `js/13_boot.js`. Games expired >30 min are discarded; games already expired on load fire immediate auto-lock via `window.__roundExpiredOnLoad`.

## Result modal and scoring integration
`20_guess.js` owns lock-in, grade calculation, score breakdown, and result modal persistence.

Scoring v2 returns a breakdown object:
- base
- timeBonus
- lengthBonus
- diffBonus
- toolBonus
- total

If scoring or result UI changes, verify both the visible modal and the persisted data used after refresh.

## Geolocation fallback chain
`__setPlayerFromCurrentLocation()` tries:
1. high-accuracy GPS
2. lower-accuracy fallback
3. last known fix
4. hard failure only if no fix exists at all

`startGeolocationWatch()` should remain tolerant of transient device/location errors.

## Leaflet pane stack
The game uses custom Leaflet panes to control layering independently of the default overlay pane:

| Pane | z-index | Contents |
|---|---|---|
| tilePane (default) | 200 | Map tiles |
| overlayPane (default) | 400 | Any unmarked vector layers |
| fogPane | 450 | Fog-of-war geometry (`js/17_leaflet_fog.js`) |
| blackout cover | 650 | `position:absolute` div inside `#leafletMap` |
| markerPane (default) | 600 | Icon markers (none currently) |
| playerPane | 700 | Player dot, reveal overlay (guess→target line) |

**Important:** Any new `L.polygon`, `L.polyline`, or `L.circleMarker` added to the map without a `pane` option will land in the default overlayPane (400) — below the fog (450). Always declare `pane: 'playerPane'` for player-visible game elements that should render above fog.

The blackout cover is `position:absolute; inset:0; z-index:650` appended inside `#leafletMap`. Because `#leafletMap` has `z-index:0` in the root stacking context, the cover cannot escape that context — FABs and HUD (z-index 30+) remain above it automatically. The player dot at playerPane (700) is above the cover (650) within the leaflet context.

## Editing checklist for architecture-sensitive changes
Before changing target generation, persistence, landmark logic, or menus, check:
- correct POI set usage
- delegated events still intact
- round reset cleanup
- target radius guarantee after Street View snap
- refresh persistence still consistent
- new Leaflet layers declare a pane explicitly (see pane stack above)
