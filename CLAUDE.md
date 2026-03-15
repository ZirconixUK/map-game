# Map Game — CLAUDE.md

## Repository

- **GitHub:** `https://github.com/ZirconixUK/map-game` (private)
- **Local:** `/Users/sierro/Claude`
- **Branch:** `main` tracked to `origin/main`
- **Workflow:** commit with a descriptive message and push after any meaningful change; use `gh` CLI for GitHub operations

**API key safety:**
- Real Google Street View key lives in `js/secrets.js` — gitignored, never committed
- `js/secrets.example.js` is the committed template
- `index.html` loads `secrets.js` optionally (silent skip if missing)
- `00_config.js` reads `window.GOOGLE_STREETVIEW_API_KEY || ""`

**gitignored:** `js/secrets.js`, `.claude/`, `mapGame.zip`, `.DS_Store`, `__pycache__/`

---

## Project overview

A mobile-first, browser-based location game. Players physically walk through their local area,
receive a single Street View-style starter photo, and use a limited set of deduction tools to find
the hidden target. The core loop: pick target → interpret photo → walk and use clues → lock in
GPS guess → get graded.

**Project stance (non-negotiable):**
- Physical play first — walking is the mechanic, not just a wrapper
- Solo first — social/async features are future, not current
- Mobile browser first — desktop is secondary
- No monetisation, no ads, no coin economy, no paywalled fun
- Systems-led — the game must work without lore scaffolding

**Current proving ground:** Liverpool city centre (BBOX approx. 53.39–53.41°N, 2.96–3.00°W). UK-wide POI dataset means the game is now playable anywhere in the UK.

---

## Code structure

```
/Users/sierro/Claude/
├── index.html                      Main entry, sequential script loader
├── styles.css                      All UI styling (dark theme, mobile-first)
├── js/
│   ├── 00_config.js                Master constants (BBOX, API keys, thresholds)
│   ├── 01_pois.js                  POI loading (IDB-cached + Worker-parsed UK dataset); __fetchLandmarkPoisForKind + __landmarkCategoryPoisFilter
│   ├── 02_dom.js                   DOM refs, toast queue, debug panel, logs; landmark live-query flow + cache; __toolConfirmShow() confirmation panels; panelGameplay event delegation for all menu navigation
│   ├── 03_map_image.js             Leaflet map init, fog canvas setup
│   ├── 04_state.js                 MASTER STATE: round state, heat, timers, gameSetup
│   ├── 05_view_transform.js        Canvas coordinate mapping
│   ├── 06_mobile_gestures_pointer_events.js  Touch/pinch/drag handlers
│   ├── 07_geolocation.js           GPS watchPosition, high→low accuracy fallback, last-known fix persistence
│   ├── 08_clues_questions.js       Question engine: all 5 tools + target picking; __randomPointInRadius() for sparse-POI free-roam targets
│   ├── 09_ui_helpers.js            UI state, panel nav, cost badges, modals
│   ├── 10_drawing.js               Canvas drawing (map overlay)
│   ├── 12_geo_helpers.js           Haversine distance, geo utilities
│   ├── 13_boot.js                  Initialisation: POIs, state restore, first target
│   ├── 14_panels_misc.js           Panel width management, misc UI; timer tap handler (info toast or re-opens score panel if round over)
│   ├── 15_tools_config.js          Load tools.json, update UI cost badges
│   ├── 16_leaflet_markers.js       Player/target markers, accuracy circle, POI pins
│   ├── 17_leaflet_fog.js           Fog-of-war (Martinez polygon clipping, EPSG:3857)
│   ├── 18_streetview_glimpse.js    Google Street View API wrapper, photo caching; showStreetViewHorizonPhotoForTarget()
│   ├── 19_curses.js                Curse system: loading, tick, isCurseActive(), all 5 tier effects live
│   ├── 20_guess.js                 Lock-in scoring: grade-based points + bonuses; computeScore(grade, ctx) returns breakdown object; result modal with breakdown card + medal fan; HTML persisted to localStorage; reopenResultModal() for post-dismiss recovery
│   └── poi_worker.js               Web Worker: fetches + parses POI_UK_runtime.json off main thread
├── POI_UK_runtime.json             UK-wide POI dataset (175,672 POIs, ~31MB / ~6MB gzipped)
├── tools.json                      Tool definitions + heat costs
├── curses.json                     Curse tier definitions (effects still placeholder)
└── huyton_*.json                   Alternate regional configs
```

Scripts load sequentially via Promise chain in `index.html` with `?cb=Date.now()` cache-busting.
All game state lives in module globals in `04_state.js`, exposed on `window.*`.

---

## Architecture patterns

- **Global state with getters/setters** in `04_state.js` — all round/game state lives here, not scattered
- **Sequential script loading** — load order in `index.html` is intentional; don't change it without checking cross-module dependencies
- **Geometry pipeline** — fog stored in EPSG:3857 via Martinez polygon clipping (`17_leaflet_fog.js`), rendered to Leaflet layer; canvas sits on top for interactive elements
- **Async tool system** — `tools.json` → JS objects → `updateCostBadgesFromConfig()` → UI badges
- **Street View caching** — photos stored as `data:` URLs in localStorage under `mg_sv_img_{context}_{key}`; contexts: `glimpse`, `snapshot`, `near100`, `near200`, `horizon`
- **Round persistence** — `saveRoundState()` / `loadRoundState()` via `localStorage["mapgame_round_v1"]`
- **UK POI dataset** — `POI_UK_runtime.json` (175,672 POIs) loaded at boot into `window.__allPois` via a Web Worker (`poi_worker.js`) to avoid main-thread freeze. Result cached in IndexedDB (`uk_pois_cache_v1`); repeat loads are instant. `window.__clearPoiCache()` busts the cache from the browser console.
- **Two POI sets** — `window.__allPois` holds the full UK dataset (never rendered to map); `window.POIS` holds the mode-radius-filtered slice (~50–300 items, set at game start by `__refreshLivePoisForCurrentLocation()`). Map pins, target picking, and heat scoring all use `POIS`. Landmark Voronoi and `__fetchLandmarkPoisForKind` use `__allPois`.
- **Landmark query** — `__fetchLandmarkPoisForKind(kind)` filters `__allPois` directly (no network request, no radius cap). Shows a preview before charging heat. `__landmarkCategoryPoisFilter(kind, poisArray)` is the shared filter used by both `01_pois.js` and `17_leaflet_fog.js`.
- **Tool confirmation panels** — `__toolConfirmShow({ menu, title, accentClass, descHtml, cost, onConfirm })` in `02_dom.js` replaces a menu's innerHTML with a confirm/cancel view, then restores on cancel. All 5 tools use this pattern.
- **panelGameplay event delegation** — ALL menu navigation (qRadar/qThermo/qDir/qLandmark/qPhoto, all Back/Close buttons, Lock In confirm) is handled via a single delegated listener on `#panelGameplay`. Never use direct `on()` binds for buttons inside `gameMenu` or sub-menus — they are destroyed and recreated by `__toolConfirmShow` restores and the lock-in confirm flow.
- **Sparse-POI free-roam** — `LOW_POI_THRESHOLD = 50` in `08_clues_questions.js`. If `POIS.length < 50`, `__pickStreetViewPanoTarget()` samples random points within the mode radius (uniform-area distribution via `__randomPointInRadius()`) instead of POI seeds. Falls back to bbox random if no player location.
- **Result modal persistence** — `lockInGuess` saves the result modal HTML to `localStorage['mapgame_result_html_v1']`. `reopenResultModal()` restores from storage if the body is empty (e.g. after page refresh). `startNewRound()` clears the key. Modal includes: medal fan (`.resultMedalScene` with absolutely positioned `.resultFlankMedal left/right rank-1/2`), score breakdown card (`.resultBreakdown`), 3-stat grid (distance / time / tools used).
- **Scoring v2** — `computeScore(grade, ctx)` in `20_guess.js` returns `{ base, timeBonus, lengthBonus, diffBonus, toolBonus, total }`. `scoreBreakdown` is persisted in round state alongside `scorePoints`. Constants in `00_config.js`: `GRADE_BASE_SCORES`, `SCORE_TIME_BONUS_MAX`, `SCORE_LENGTH_BONUS`, `SCORE_DIFFICULTY_BONUS`, `SCORE_TOOL_EFFICIENCY`.

---

## Key constants (00_config.js)

```
BBOX: 53.414443°N–53.389881°N, 3.004761°W–2.958069°W (Liverpool)
DEFAULT_START: 53.40744°N, 2.97785°W (Lime Street Station area)

Heat decay:     HEAT_DECAY_BASE_PER_SEC = 0.0015
                HEAT_DECAY_PER_HEAT_PER_SEC = 0.0025

Scoring v2:     Grade-based + bonuses (no flat curve)
                GRADE_BASE_SCORES: Diamond=800, Emerald=650, Platinum=500, Gold=375,
                                   Silver=250, Bronze=125, Copper=50
                SCORE_TIME_BONUS_MAX = 150   (proportional to time remaining / limit)
                SCORE_LENGTH_BONUS: short=0, medium=50, long=100
                SCORE_DIFFICULTY_BONUS: easy=0, normal=50, hard=100
                SCORE_TOOL_EFFICIENCY: [100,90,75,60,45,30,15,0] (index = tools used, capped at 7)
                  — excludes photo.starter (automatic, not a choice)
                Max possible: 1,250 pts (Diamond + all bonuses)
                Typical Gold/normal/short/3 tools/50% time: ~560 pts
                computeScore(grade, ctx) → { base, timeBonus, lengthBonus, diffBonus, toolBonus, total }
                scoreBreakdown persisted in round state alongside scorePoints

Grade bands:    7 medal tiers, scaled to getModeTargetRadiusM() (short=500m, medium=1000m, long=1500m)
                Diamond ≤4% | Emerald ≤12% | Platinum ≤24% | Gold ≤44% | Silver ≤68% | Bronze ≤92% | Copper >92%
                e.g. short: Diamond≤20m, Gold≤220m, Copper>460m
                e.g. long:  Diamond≤60m, Gold≤660m, Copper>1380m
                Constant: GRADE_THRESHOLDS_FRAC in 00_config.js

Street View:    Size 640×640, FOV 90 (glimpse) / 70 (snapshot)
                ECHO_SNAPSHOT_INNER_M = 150, OUTER_M = 300
                STREETVIEW_METADATA_RADIUS_M = 200
                STREETVIEW_TARGET_MAX_ATTEMPTS = 25

Target distance bands (from player):
                10% chance > 2km
                60% chance 0–1km
                30% chance 1–2km

Mode radii:     short=500m | medium=750m | long=1500m
Mode timers:    short=30min | medium=45min | long=60min
```

---

## Current implementation status (from GDD v0.1, March 2026)

| System | Status | Notes |
|--------|--------|-------|
| Mode-based target radius | Done | Short/Medium/Long working |
| Starter photo (Street View) | Done | Core identity pillar |
| Radar | Done | Map/fog interactions |
| Thermometer | Done | Needs ongoing tuning |
| Landmark clues | Done | Searches full UK dataset (`__allPois`); preview before heat charge; Voronoi uses `__allPois` |
| Extra photos (near100/near200) | Done | Caching + echo snapshots |
| Horizon photo | Done | Target-pano skyline view facing player; `showStreetViewHorizonPhotoForTarget()`; free re-open after first purchase |
| N/S and E/W split | Done | Unlock-gated at 50% round time; potentially overpowered |
| Heat meter | Done | Visible accumulation and decay |
| Curses | Done | All 5 tier effects live; heat1/2 cost surcharge, heat3 NSEW lock, heat4 radar cap, heat5 photo block + purple cursed UI |
| Lock-in guess + scoring | Done | Grade-based score + time/length/difficulty/tool-efficiency bonuses (v2); breakdown card in result modal; modal persists across refresh; re-openable via timer tap |
| Result modal | Done | 3-stat grid (Distance / Time / Tools); score breakdown card; medal fan (up to 2 flanking grades each side, same SVG shape, absolutely positioned overlapping behind earned medal) |
| Tool confirmation panels | Done | All 5 tools (radar, thermo, NSEW, landmark, photo) show confirm/cancel before executing |
| Used/locked tool feedback | Done | Tapping a used option shows "already used" toast; tapping time-locked NSEW shows "unlocks in X:XX" |
| Difficulty selector | Done | Wired into score bonus; hard mode photo block + heat cost multiplier + curse probability scaling already live |
| Timer expiry | Done | Auto-locks at current position when round timer runs out |
| Photo guardrails | Done | Street View eligibility / imagery-unavailable handling in place |
| Chain mode | **Not started** | Roadmap item (Phase D) |
| Remote mode | **Not started** | Future optional mode (Phase E) |

**Known mismatches (build vs. intent):**
- `coin_cost` fields removed from `tools.json` and JS — coin economy fully removed
- Roadmap-era comments and historical design directions still visible in the codebase

---

## Design pillars (must be preserved)

1. **Physical movement is the point** — the game should justify a walk, not just accompany one
2. **Deduction before collection** — the player should feel smart, not merely busy
3. **One strong image starts the run** — starter photo is the emotional hook; it should create a *hypothesis*, not give the answer away
4. **Strategy over repetition** — tools should matter situationally; avoid a solved fixed-opener sequence
5. **Fair but tough** — tension and wrong turns are fine; outcomes that feel broken or GPS-unfair are not
6. **Systems first, lore second** — game must be playable without heavy narrative scaffolding

**Primary skill expression:** knowing *where to move next*. Tool choice supports that decision, not replaces it.

---

## Roadmap phases (from GDD)

| Phase | Goal | Key work |
|-------|------|----------|
| **A — Stabilise the loop** | Single run coherent photo-to-lock-in | ✅ Complete |
| **B — Strengthen mid-run** | Stop the middle of runs going flat | Tune clue usefulness; revisit N/S/E/W strength; improve landmark usefulness; make heat/curses meaningfully alter play |
| **C — Define mastery** | Separate length from difficulty; make skilled play legible | ✅ Complete — difficulty rules, score bonuses, hard-mode mechanics live |
| **D — Chain mode** | Higher-commitment advanced format | Chain scoring; clue reset logic; fatigue pacing |
| **E — Remote mode** | Expand access without diluting identity | Structurally distinct remote mode (not just map-click substitution) |
| **F — Optional expansion** | Long-tail depth once core is strong | Daily challenges; async comparison; lore; social features |

**Current priority: Phase B** — the single-run loop is coherent; now focus on stopping mid-run dead air. Key areas: clue usefulness tuning, N/S/E/W balance, landmark quality, heat/curse strategic legibility.

---

## Open design decisions (not yet resolved)

- Whether clue tools are fully one-use per run or a mixed model
- Exact curse mechanical effects beyond the current 5 tiers
- Eligibility thresholds for areas with weak POI density or poor Street View coverage
- Whether N/S and E/W remain default or move to late-game / hard-mode only

---

## Key design risks to watch

| Risk | Mitigation |
|------|------------|
| Grade thresholds too strict for GPS variance | Grade bands may need widening or weighting by GPS accuracy; early players should not always get F |
| Curses feeling arbitrary | Keep effects mild, readable, and strategically legible; never make them cruel |
| N/S/E/W overpowered | These tools can collapse the deduction game into clean area deletion; keep them gated or late |
| Solved meta (same opener every run) | Design for situational clue value; avoid universal openers |
| Dead air in mid-run | The weakest part of current runs; clue pacing and recognition moments need design attention |
| ~~Coin cost fields in config~~ | Removed — `tools.json` and JS fully cleaned up |
| Street View API costs | Treat as production risk; rate-limit, cache aggressively, handle imagery-unavailable gracefully |
| GPS jitter | `adjustedDistanceM = max(0, rawDistance - gpsAccuracyM)` — check this is always applied at lock-in |

---

## POI system (01_pois.js + poi_worker.js)

The game uses a pre-built UK-wide dataset (`POI_UK_runtime.json`, 175,672 POIs). No Overpass API calls are made at runtime.

**Boot loading (`loadPois()`):**
1. Check IndexedDB for `uk_pois_cache_v1` — if present and `pois.length > 1000`, use it immediately (instant)
2. If no cache: spawn `poi_worker.js` to fetch + parse the 31MB JSON off the main thread; on success, write result to IDB cache
3. If Worker unavailable: fall back to main-thread fetch (may freeze briefly)
4. On first load (no cache): shows "Downloading map data… (first run only)" toast
5. `window.__clearPoiCache()` — call from browser console to bust the IDB cache and force re-fetch

**At game start (`__refreshLivePoisForCurrentLocation()`):**
- Called in `startNewGameFromMenuOrDebug()` after player location is set
- Filters `window.__allPois` by mode radius → sets `window.POIS` (~50–300 items)
- Skips if user has an active custom POI import (`window.__POI_PACK__.filename && !fromJson`)
- Shows POI count toast; expands `BBOX` to cover the play area

**Landmark queries (`__fetchLandmarkPoisForKind(kind)`):**
- Fires when player taps a Landmark category button
- Searches full `window.__allPois` — no radius cap, no network request
- Kinds: `train_station`, `cathedral`, `bus_station`, `library`, `museum`
- `__landmarkCategoryPoisFilter(kind, poisArray)` — shared filter used by both `01_pois.js` and `17_leaflet_fog.js`

**Voronoi fog (`17_leaflet_fog.js`):**
- `addFogNearestStation` and `addFogNearestLandmark` read from `window.__allPois` (not `POIS`) so Voronoi cells are correct even when no stations/landmarks fall within the mode radius

---

## Geolocation fallback chain (07_geolocation.js)

`__setPlayerFromCurrentLocation()` tries in order:

1. **High accuracy GPS** — 12s timeout
2. **Low accuracy (WiFi/cell)** — 10s timeout, only if step 1 times out
3. **Last known fix** — from `lastGeoFix` / localStorage (`mapgame_last_real_geo_fix_v1`), any age, if steps 1 and 2 both time out; shows toast with age
4. **Reject** — only if no fix has ever been recorded

`startGeolocationWatch()` uses 20s timeout to reduce transient watch errors.

---

## Storage keys

| Key | Location | Contents |
|-----|----------|----------|
| `mapgame_round_v1` | localStorage | Full round state JSON |
| `mapgame_last_real_geo_fix_v1` | localStorage | Last GPS fix (lat, lon, accuracy, ts) |
| `mapgame_imported_pois_pack_v1` | IndexedDB / localStorage | POI pack (filename, label, pois) |
| `uk_pois_cache_v1` | IndexedDB (`mapgame` db, `kv` store) | Parsed UK POI array + lastModified + savedAt; cleared by `window.__clearPoiCache()` |
| `mg_sv_img_{snapshot\|glimpse}_{key}` | localStorage | Cached Street View data: URLs |
| `mapgame_result_html_v1` | localStorage | Result modal HTML from last lock-in; cleared by `startNewRound()`; used by `reopenResultModal()` to restore after refresh |

---

## UI design language (current, March 2026)

Inspired by the **Jet Lag the Game** dark app aesthetic — dark navy panels with solid vibrant accent colours. No glassmorphism or frosted glass.

**Colour tokens:**
- Panel background: `#0f1729` (deep navy)
- Surface/card: `#1e2d44` — hover `#253550`
- Border: `#1e3a5f` (outer), `#2a3f60` (inner cards)
- Ambient background: `#080c14`
- Primary text: `text-gray-100` / `text-white`
- Muted text: `text-slate-400`

**Per-tool colours (solid, full-fill, bold):**
| Tool | Colour |
|------|--------|
| 📡 Radar | `bg-blue-600` |
| 🌡️ Thermometer | `bg-orange-500` |
| 🧭 N/S/E/W | `bg-cyan-600` |
| 🏛️ Landmark | `bg-emerald-600` |
| 📷 Photo | `bg-violet-600` |

Tool iconBoxes in submenus use a tinted `bg-{tool-colour}/20 border border-{tool-colour}/30` well.
Section labels in each submenu are `text-{tool-colour}-400 uppercase tracking-widest`.

**FABs (right stack):**
- Recenter: `bg-[#111827] border-[#1e3a5f]` — `text-cyan-400`
- Gameplay: `bg-blue-600`
- Curses: `bg-[#2d1a4a] border-[#4a2d7a]` — purple glow when `isActive`
- Heat widget: `bg-[#111827] border-[#1e3a5f]`
- Debug (left): `bg-[#111827] border-[#1e3a5f] text-slate-400`

**Action buttons:**
- New Game: `bg-amber-500 text-white font-bold`
- Lock In Guess: `bg-cyan-600 text-white font-bold`
- Start (new game): `bg-emerald-600 text-white font-bold`

**Choice buttons** (Short/Medium/Long, difficulty): `bg-[#1e2d44] border-[#2a3f60]`
Selected state: `border-cyan-500 bg-cyan-600/22` (via `.choiceBtn.is-selected` in styles.css)

**Timer:** `bg-[#111827] border-[#1e3a5f]` — timer text `text-cyan-400`

**Toast:** `bg-[#111827] border-cyan-500/30`

**Modals (photo, result):** `bg-[#0f1729] border-[#1e3a5f]`

**Curse miasma:** `.menuBtn.cursed .iconBox` uses `bg-[rgba(88,28,135,.35)]` (dark purple) so the `miasmaRise` radial-gradient animation is visible. The skull FAB inactive state is `rgba(255,255,255,.40)` (light on dark).

**Cost badges:** `text-amber-400 bg-amber-900/30 border border-amber-600/30 rounded-full`

---

## Qualitative success test (from GDD)

When testing, ask:
- Does the player finish the run instead of drifting away?
- Do they describe a distinct recognition moment afterward?
- Do they feel clever rather than merely compliant?
- Do they feel the result was deserved, even when the score was poor?
- Do they want to run it again immediately?

If all five are yes, the loop is working.
