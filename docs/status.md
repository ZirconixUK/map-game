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

- Photo gallery strip in gameplay panel (tappable horizontal thumbnail strip showing all collected photos; hidden when empty; clears on new round; restores on boot)
- Accessibility: `prefers-reduced-motion` suppresses timerPulse animation
- UX polish pass (March 2026): HEAT label on heat widget, curse indicator in purple counting all active curses, live lock-countdown badges on time-locked buttons, white-on-amber cost badge contrast, target name in result modal, adjLine inside distance stat card, "Setup New Round" button rename, thermometer start toast, GPS fail badge on recenter FAB, 600ms tap-dismiss guard on toasts

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
Complete.

### Phase B — Strengthen mid-run
Current focus.

### Phase C — Define mastery
Complete enough for current build: difficulty rules, score bonuses, hard-mode mechanics.

### Phase D — Chain mode
Not started.

### Phase E — Remote mode
Not started.

### Phase F — Optional expansion
Later ideas such as daily challenges, async comparison, lore, and social features.

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
- Photo gallery strip dedup uses `photo.ts` (timestamp) as primary key; if `ts` is missing the fallback is `context || kind` which can collide for repeat purchases of the same kind
- GPS fail badge on recenter FAB: watch-path errors (`startGeolocationWatch`) now set the badge too; badge clears on any GPS success path
