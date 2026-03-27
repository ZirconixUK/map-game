# Map Game — Working instructions for Claude

## What this project is
Real-world walking/deduction game on a city map. Mobile-first. Liverpool proving ground, UK-wide POI dataset. Not a Geoguessr clone.

## Non-negotiables
- Physical movement is the core mechanic. Don't erode it.
- Deduction is the main skill expression.
- Starter photo is the emotional hook.
- No monetisation/ads/coin economy unless explicitly asked.
- Preserve debug tools unless asked to remove or redesign.

## How to approach changes
- Minimal local diffs over broad rewrites.
- Don't redesign gameplay systems while fixing UI.
- Don't change script load order casually.
- Mobile/touch is first-class. Flag side effects before touching shared systems.

## Critical invariants
- Script load order in `index.html` is dependency-sensitive.
- Core state lives in `js/04_state.js`.
- `#panelGameplay` uses delegated events — no direct handlers on dynamically rebuilt submenu buttons.
- `window.__allPois` = full UK dataset. `window.POIS` = active filtered slice. Don't confuse them.
- Landmark/Voronoi logic uses `window.__allPois`.
- Auth/DB are progressive enhancements — game must work without Supabase. All auth/DB calls are silent no-ops for guests.
- OAuth hash cleanup must happen inside `onAuthStateChange`, not synchronously after `createClient()`.
- `QUESTION_TIME_COST_MS` in `js/00_config.js` is intentional dead code from a removed Q&A mechanic. Leave it.

## Common failure modes
- Direct click handlers on gameplay submenu buttons that get destroyed and recreated.
- Round reset leaving overlays, cached UI, or persisted result HTML behind.
- UI cost displays updated in one place but not another.
- Confusing target seed POIs with final snapped Street View pano positions.
- `addPenaltyMs()` is only for curse-gated tool time costs. Don't repurpose it.
- New panel added without `setOpen(newPanel, false)` in every sibling-open handler, `startNewRound`, and debug reset paths.

## After changes — verify
- Panels open/close correctly; tapping outside dismisses them.
- Map panning/zooming works on mobile.
- New round flow is clean; heat/curses/UI feedback matches actual state.
- Tool availability, lock states, and cost badges are correct.
- Score, result modal, and persistence survive refresh.

## Docs
- `docs/architecture.md` — code structure, state, POIs, persistence, auth/DB
- `docs/game-design.md` — design pillars, loop, balance, roadmap
- `docs/ui-style.md` — visual language, colour, component styling
- `docs/status.md` — implementation status, priorities, known risks
- `docs/testing.md` — regression checks, playtest criteria
