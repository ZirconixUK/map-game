# Status and roadmap snapshot

## Current implementation status
### Implemented
- Mode-based target radius
- Starter photo flow
- Radar tool
- Thermometer tool
- Landmark clue system
- Extra photo tools and photo caching
- Horizon photo
- N/S and E/W split
- Heat meter
- Curse system with live tier effects (5 tier curses + 4 special curses)
- Lock-in guess and scoring v2
- Result modal with persistence and reopen behavior
- Reveal beat on lock-in: map fits to show player→target line for 1.8s before result modal opens; toasts auto-dismissed before reveal
- Tool confirmation panels
- Used/locked/curse-locked tool feedback
- Difficulty selector with live scoring impact
- Timer expiry auto-lock
- Street View guardrails and failure handling
- Debug curse picker with heat tier badges and toast feedback
- User accounts via Google OAuth (Supabase Auth)
- Server-side round result persistence (Supabase `rounds` table)
- Achievement tracking (6 initial achievements, evaluated after each round)
- Profile page (`profile.html`): run history, aggregate stats, achievements
- Guest play mode with dismissable notice; full game playable without an account
- Sign in / sign out via System panel; profile link shows first name when signed in

- Photo gallery FAB: camera FAB (right stack 5) with count badge; opens a swipe-dismissable gallery panel with a 3-column photo grid; hidden when no photos; clears and closes on new round; restores on boot
- Accessibility: `prefers-reduced-motion` suppresses timerPulse animation
- UX polish pass (March 2026): curse indicator in purple counting all active curses, live lock-countdown badges on time-locked buttons, white-on-amber cost badge contrast, target name in result modal, adjLine inside distance stat card, "Setup New Round" button rename, thermometer start toast, GPS fail badge on recenter FAB, 600ms tap-dismiss guard on toasts
- Heat widget redesign (March 2026): replaced 190px 5-box meter with standard 46×46 flame FAB (right stack 4); icon colour shifts grey→amber→orange→red by heat level via `heat-1`–`heat-5` classes; pulse animations preserved

### Not yet implemented
- Chain mode
- Remote mode

## Current priority
Strengthen the middle of runs.

That means focusing on:
- clue usefulness tuning
- N/S/E/W balance
- landmark clue quality
- heat/curse strategic legibility
- reducing dead air

## Known mismatches or cleanup notes
- Coin economy has been removed and should stay removed unless intentionally revisited.
- Some roadmap-era comments and historical design directions may still exist in the codebase.
- `addPenaltyMs()` in `js/04_state.js` is called by tool delivery points when the "overcharged" curse is active (curse-gated time costs).
- `QUESTION_TIME_COST_MS` in `js/00_config.js` is defined but unused — left as dead code (Q&A mechanic removed).
- Timer exploit fix landed 2026-03-18: wall-clock expiry enforced on page restore, overtime display removed.
- V3 timer rebalance landed 2026-03-19: curse-gated time costs ("Overcharged" curse), thermometer inversion fixed in tools.json, time bonus doubled to 300, heat costs rebalanced. Tools are free (time-wise) when uncursed. See `docs/plan-v3-timer-rebalance.md` for details.
- Curses v2 landed 2026-03-21: added Veil of Ignorance, The Blackout, Ghost Walk, Signal Clamp visual lock. Fog moved to a dedicated Leaflet pane (`fogPane`, z-index 450). Player marker uses `playerPane` (z-index 700) so it remains visible during blackout. Blackout cover is `position:absolute` inside `#leafletMap` at z-index 650.
- Curse names overhauled 2026-03-21: tier curses renamed from "Heat I–V" + generic subtitles to Accelerant, Fever Surge, Compass Rot, Signal Clamp, Burned Lens.
- Debug timer advance now also ticks curse expiry timestamps via `debugAdvanceCurseTimersBy()` in `js/19_curses.js`.
- Reveal beat added 2026-03-21: `lockInGuess()` now dismisses all toasts, shows the player→target line on the map, fits the map to both endpoints, then waits 1.8s before opening the result modal. Result HTML is persisted to localStorage before the delay to protect against mid-reveal refreshes. `window.dismissAllToasts()` added to `js/02_dom.js`.
- Server-side auth and DB landed 2026-03-24: Supabase Google OAuth, round result sync, achievement tracking. `js/auth.js` and `js/db.js` added; loaded after `secrets.js` in the sequential loader. `login.html` and `profile.html` added as standalone pages. `js/20_guess.js` calls `window.saveRoundResult()` after scoring (silent no-op for guests). OAuth token hash cleanup happens inside `onAuthStateChange` (after Supabase processes the token, not before).
- UX/accessibility pass landed 2026-03-26: `prefers-reduced-motion` now suppresses `timerPulse`; 600ms tap-dismiss guard on toasts (programmatic dismissal unguarded); HEAT label on heat widget; curse indicator is purple and counts all active curses via `getActiveCurses()`; live `.lockCountdown` badges on time-locked tool buttons (created in `updateUI`, refreshed every 250ms in `updateHUD`); cost badges changed to `text-white bg-amber-600`; target name (📍) in result modal; `adjLine` moved inside distance stat card; "Setup New Round" button; thermometer start toast (3.5s auto-dismiss); GPS fail badge on recenter FAB (`__setGpsFailBadge` in `js/07_geolocation.js`); photo gallery strip in `#panelGameplay` (`__refreshPhotoGalleryStrip` in `js/02_dom.js`, `window.showPhotoInModal` in `js/18_streetview_glimpse.js`).
- Heat widget + photo gallery UI redesign landed 2026-03-26: heat widget replaced from 190px 5-box meter to standard 46×46 flame FAB at stack 4; colour driven by `heat-1`–`heat-5` CSS classes applied in `updateHUD()`. Photo gallery strip removed from `#panelGameplay`; replaced by camera FAB at stack 5 (`#btnPhotoGallery` + `#photoGalleryBadge`) opening `#panelPhotoGallery` (3-column grid, swipe-dismiss). `__refreshPhotoGalleryStrip()` now updates the FAB badge count; `__buildPhotoGalleryGrid()` builds the grid lazily on panel open. Gallery panel correctly closed by all sibling panel-open handlers, `startNewRound`, and debug `pickNewTarget`. Uncorrupt tool rebuilds grid immediately if panel is open.
- Photo gallery persistence fixes landed 2026-03-27: `saveRoundState()` now strips all `data:` URLs from `photos[]` and `starterPhotoUrl` before writing to localStorage (prevents silent `QuotaExceededError` that was losing the entire save). `window.__fetchStreetViewDataUrl(context)` exposed from `js/18_streetview_glimpse.js` IIFE — fetches and caches a photo data URL for the current target without opening the modal (uses `snapshot_params` for deterministic reproduction). `__buildPhotoGalleryGrid()` calls this for any photo with no cached URL, showing a spinner then the real thumbnail once it resolves. SV cache write retried after `saveRoundState()` frees quota (was silently failing before). Extra photos (near100/near200) now also written to SV cache after fetch. Gallery snapshot taps always route through `showStreetViewGlimpseForTarget` (same as gameplay menu). `#btnPhotoGallery` FAB is now a permanent button (no `hidden` class); badge-only logic handles count display.

## Key constants and rules snapshot
### Mode radii
- short: 500m
- medium: 750m
- long: 1500m

### Mode timers
- short: 30 minutes
- medium: 45 minutes
- long: 60 minutes

### Target distance bands from player
- 10% chance: over 2km
- 60% chance: 0–1km
- 30% chance: 1–2km

### Street View settings snapshot
- glimpse FOV: 90
- snapshot FOV: 70
- metadata radius: 200m
- target max attempts: 25

## Scoring snapshot
Scoring v2 is grade-based with bonuses.

### Base grades
- Diamond: 800
- Emerald: 650
- Platinum: 500
- Gold: 375
- Silver: 250
- Bronze: 125
- Copper: 50

### Bonuses
- time bonus up to 300 (doubled in v3)
- length bonus: short 0, medium 50, long 100
- difficulty bonus: easy 0, normal 50, hard 100
- tool efficiency bonus depends on tools used, excluding the starter photo

### Grade thresholds
Thresholds scale with the current mode radius and should remain fair under real GPS conditions.

## Roadmap phases
### Phase A — Stabilise the loop
**Status: Complete.**
Make a single run playable end-to-end without breaking. Covers: target selection, starter photo, clue toolkit, heat/curse system, lock-in, scoring, result modal, round reset, persistence, Street View guardrails, and auth/DB as a progressive enhancement.

### Phase B — Strengthen mid-run
**Status: Current focus.**
The single-run loop is coherent but the middle of runs can flatten out. Goals: reduce dead air, improve clue usefulness and landmark quality, keep directional clues (N/S/E/W) from trivialising deduction, make heat/curse effects feel strategically legible rather than arbitrary, and ensure at least one clear recognition moment per run.

### Phase C — Define mastery
**Status: Complete enough for current build.**
Give skilled play a meaningful ceiling. Covers: difficulty selector with scoring impact, grade-based scoring with time/length/difficulty/efficiency bonuses, hybrid absolute/per-mode grade thresholds, hard-mode mechanics, and timer pressure (v3 wall-clock expiry and curse-gated time costs).

### Phase D — Chain mode
**Status: Not started.**
A multi-run commitment mode with its own pacing and fatigue logic. Should feel like a meaningfully different session — not just a repeated normal loop. Design questions: how cumulative scoring works, how fatigue or degradation builds across the chain, and how the player decides when to stop.

### Phase E — Remote mode
**Status: Not started.**
A mode for players who cannot physically walk the area, or want to play a location remotely. Must preserve deduction and tension rather than becoming a standard map-click game. Needs structural decisions about what replaces physical movement as the core constraint.

### Phase F — Optional expansion
**Status: Not started.**
Later-stage ideas contingent on the core game being well-established: daily challenges, async score comparison, lore layers, social or competitive features. None of these should be built before the core loop is fully proven.

### Phase G — Names and flavour text pass
**Status: Not started.**
A dedicated pass over all user-facing strings: curse names, tier names, tool names, result modal copy, toast messages, difficulty labels, mode names, and any other text visible during play. Goal is consistency of tone, distinctiveness, and avoiding generic or placeholder-feeling language.

## Risk watchlist
- Grade thresholds too strict for real GPS variance
- Curses still need playtesting for readability — naming pass done, mechanical legibility improving
- N/S/E/W overpowered and collapsing too much search space
- Solved-meta opener sequences
- Dead air in the middle of runs
- Timer pressure tuning — v3 time costs active; monitor for too-harsh timeout rates on short/hard
- Street View API cost/availability concerns
- Any regression that breaks adjusted-distance fairness at lock-in
- Leaflet stacking context: fog (450), blackout cover (650), player (700) — any new Leaflet layers must declare a pane explicitly or they land in the default overlay pane (400) below the fog
- Supabase anon key is hardcoded in `js/auth.js` and `login.html`/`profile.html` (publishable key, safe by design); RLS policies protect all tables
- Photo gallery thumbnail recovery relies on the SV cache (`mg_sv_img_*` keys). If localStorage is cleared between a round's photo capture and its next gallery open, `__fetchStreetViewDataUrl` will re-fetch from the network. For snapshots this is deterministic (uses `snapshot_params`); for extra photos (near100/near200) it is also deterministic now that they are cached on fetch.
- Photo gallery dedup: `photo.ts` is the primary key; if missing the fallback is `context || kind` which can collide for repeat purchases of the same kind
- GPS fail badge on recenter FAB: watch-path errors (`startGeolocationWatch`) now set the badge too; badge clears on any GPS success path
