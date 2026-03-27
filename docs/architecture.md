# Architecture reference

## Repository shape
```
index.html          Main entry, sequential script loader
login.html          Google OAuth sign-in page
profile.html        Player profile: run history, stats, achievements
styles.css          All UI styling (dark theme, mobile-first)
js/
  00_config.js      Master constants, thresholds, API key reads
  01_pois.js        POI loading, filtering, landmark category helpers
  02_dom.js         DOM refs, toasts, debug panel, delegated gameplay menu events,
                    photo gallery FAB badge (__refreshPhotoGalleryStrip) and grid (__buildPhotoGalleryGrid)
  03_map_image.js   Leaflet map init, fog canvas setup
  04_state.js       Master game state and globals
  05_view_transform.js  Canvas coordinate mapping
  06_mobile_gestures_pointer_events.js  Touch/pinch/drag handlers
  07_geolocation.js GPS watchPosition and fallback chain
  08_clues_questions.js  Question engine and target picking
  09_ui_helpers.js  UI state, panel nav, cost badges, HUD updates
  10_drawing.js     Canvas drawing
  12_geo_helpers.js Geo distance helpers
  13_boot.js        Boot flow, restore state, first target
  14_panels_misc.js Panel sizing, panel open/close mutual exclusion, debug curse picker
  15_tools_config.js  tools.json loading and badge updates
  16_leaflet_markers.js  Player/target markers (playerPane z-700), reveal overlay, POI pins
  17_leaflet_fog.js Fog-of-war geometry in fogPane (z-450); setFogLayerVisible()
  18_streetview_glimpse.js  Google Street View wrapper and photo caching;
                    exposes __getStreetViewCachedDataUrl, __fetchStreetViewDataUrl, showPhotoInModal
  19_curses.js      Curse system; debugAdvanceCurseTimersBy() for debug timer sync
  20_guess.js       Lock-in flow, grading, scoring, reveal beat, result modal persistence, saveRoundResult()
  auth.js           Supabase client init, Google OAuth, session management, system panel auth UI
  db.js             saveRoundResult(), achievement checking, getRoundHistory(), getAchievements()
  poi_worker.js     Worker for UK POI dataset parsing
  secrets.js        Local-only API keys (gitignored)
POI_UK_runtime.json UK-wide POI dataset
tools.json          Tool definitions
curses.json         Curse definitions
```

## Core architecture patterns
- Global state with getters/setters in `js/04_state.js`.
- Sequential script loading via Promise chain in `index.html`.
- Street View photos cached as `data:` URLs in localStorage.
- Round state persisted to localStorage, restored at boot.
- UK POI dataset loaded once, cached in IndexedDB, sliced per play area.
- Auth and DB are progressive enhancements — fully playable as guest.

## POI system
- `window.__allPois`: full UK dataset. Used for landmark/Voronoi queries.
- `window.POIS`: active filtered slice. Used for map pins, target picking, nearby logic.
- `__refreshLivePoisForCurrentLocation()` filters `__allPois` by mode radius → `window.POIS`.
- `__fetchLandmarkPoisForKind(kind)` searches the full dataset (not radius-capped).
- Boot: IndexedDB cache `uk_pois_cache_v1` → parse via `poi_worker.js` → main-thread fallback.
- `window.__clearPoiCache()` clears IndexedDB for cold-boot testing.

## Target generation and Street View
- Target may start from POI logic or sparse-POI random sampling (`__randomPointInRadius()`).
- Final playable target is the snapped Street View pano, not always the seed point.
- Verify the snapped pano still respects mode radius when editing this flow.

## Persistence

### LocalStorage keys
- `mapgame_round_v1`: round state JSON (strips `data:` URLs from photos before write)
- `mapgame_last_real_geo_fix_v1`: last GPS fix
- `mg_sv_img_{context}_{key}`: cached Street View image data URLs
- `mapgame_result_html_v1`: persisted result modal HTML

### IndexedDB
- `uk_pois_cache_v1`: parsed UK POI dataset

### Persistence gotchas
- `saveRoundState()` strips all `data:` URLs from `photos[]` and `starterPhotoUrl` before writing — image bytes live only in the `mg_sv_img_*` keys. Prevents `QuotaExceededError`.
- SV cache write in `showStreetViewGlimpseForTarget` runs before `saveRoundState`. If quota is tight, SV write may fail silently; a retry write happens after `saveRoundState` frees space.
- Wall-clock expiry enforced on restore: `roundStartMs + getRoundTimeLimitMs()` vs `Date.now()`. Games expired >30 min are discarded; already-expired games fire immediate auto-lock via `window.__roundExpiredOnLoad`.
- Result HTML written to localStorage before the 1.8s reveal delay — refresh during reveal still restores the modal.
- `startNewRound()` must clear persisted result modal HTML.

## Reveal beat
`lockInGuess()` → dismiss all toasts → show player→target line → fitBounds → 1.8s delay → open result modal.

## Photo gallery
- `#btnPhotoGallery` is a permanent FAB (no `hidden` class); badge-only logic shows/hides the count.
- `__buildPhotoGalleryGrid()` auto-fetches missing thumbnails via `__fetchStreetViewDataUrl(context)` when SV cache is cold (fire-and-forget; spinner replaced with real image).
- `photo.ts` is the primary dedup key; fallback is `context || kind` (can collide for repeat purchases of same kind).

## Result modal and scoring
`20_guess.js` owns lock-in, grade calculation, score breakdown, and result modal persistence. Scoring v2 breakdown: base, timeBonus, lengthBonus, diffBonus, toolBonus, total.

## Geolocation fallback chain
`__setPlayerFromCurrentLocation()`: high-accuracy GPS → lower-accuracy fallback → last known fix → hard failure only if no fix at all.

## Leaflet pane stack
| Pane | z-index | Contents |
|---|---|---|
| tilePane (default) | 200 | Map tiles |
| overlayPane (default) | 400 | Unmarked vector layers |
| fogPane | 450 | Fog-of-war (`js/17_leaflet_fog.js`) |
| blackout cover | 650 | `position:absolute` inside `#leafletMap` |
| markerPane (default) | 600 | Icon markers (none currently) |
| playerPane | 700 | Player dot, reveal overlay |

New `L.polygon`/`L.polyline`/`L.circleMarker` without a `pane` option lands in overlayPane (400) — below fog (450). Always declare `pane: 'playerPane'` for player-visible game elements.

## Auth and database layer
- Supabase project: `rxnljetuukqtlmauuruz.supabase.co`
- Auth: Google OAuth. Tables: `rounds`, `user_profiles`, `user_achievements`, `user_settings`. All RLS-enabled.
- `auth.js` and `db.js` load after `secrets.js` in the sequential loader. Supabase CDN is a synchronous `<script>` in `<head>`.
- OAuth hash cleanup must happen inside `onAuthStateChange` — not synchronously after `createClient()`.
- `saveRoundResult()` is fire-and-forget (not awaited) in `20_guess.js`; silent no-op for guests.
- Anon key is hardcoded in `auth.js` (publishable key, safe; RLS protects data).
