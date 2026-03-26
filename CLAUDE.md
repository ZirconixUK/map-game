# Map Game — Working instructions for Claude

## What this project is
- Real-world walking and deduction game played on a city map.
- Mobile browser first; desktop is secondary.
- Solo-first, systems-led, and designed to justify a real walk.
- The game should not drift into feeling like a generic Geoguessr clone.
- The current proving ground is Liverpool city centre, but the UK-wide POI dataset means the game can run anywhere in the UK.

## Non-negotiables
- Preserve physical movement as the core mechanic.
- Preserve deduction as the main skill expression.
- Preserve the starter photo as the emotional hook for each run.
- Preserve mobile-first usability and readable touch interactions.
- Do not reintroduce monetisation, ads, or the removed coin economy unless explicitly asked.
- Systems first, lore second.
- Preserve debug tools unless explicitly asked to remove or redesign them.

## How to approach changes
- Prefer minimal, local diffs over broad rewrites.
- Do not redesign gameplay systems while fixing UI unless explicitly asked.
- Do not change script load order casually.
- Treat touch/mobile behavior as first-class, not an afterthought.
- Keep implementation practical and incremental.
- Flag likely side effects before changing shared systems.
- If a system has known gotchas, check them before editing.

## Critical implementation invariants
- Script load order in `index.html` is intentional and dependency-sensitive.
- Core state lives in `js/04_state.js`; do not scatter new source-of-truth state without reason.
- `#panelGameplay` uses delegated events for menu navigation and submenu actions. Do not attach direct handlers to dynamically rebuilt submenu buttons.
- `window.__allPois` is the full UK dataset. `window.POIS` is the active filtered play-area slice. Do not confuse them.
- Landmark queries and landmark Voronoi logic use `window.__allPois`, not the live filtered slice.
- Round persistence and result modal persistence use localStorage and must stay in sync with round reset behavior.
- Sparse-POI mode and Street View snapping can change target generation behavior; verify radius guarantees when touching that flow.
- Auth and DB are progressive enhancements. The game must remain fully playable without a Supabase session. All auth/DB calls must be silent no-ops for guests.
- Do not wipe the OAuth token hash from the URL synchronously after `createClient()`. Supabase reads the hash asynchronously. Hash cleanup must happen inside `onAuthStateChange`.

## Common failure modes to avoid
- Binding direct click handlers to gameplay submenu buttons that are later destroyed and recreated.
- Breaking round reset by leaving overlays, cached UI state, or persisted result HTML behind.
- Updating UI cost displays in one place but not another.
- Confusing target seed POIs with final snapped Street View pano positions.
- Breaking mobile map panning or tap-to-close behavior while editing menus/modals.
- Quietly reintroducing roadmap-era systems that were intentionally removed.
- Calling `addPenaltyMs()` for purposes other than curse-gated tool time costs — it is active when the "overcharged" curse fires. Do not repurpose it for UI or other systems.
- Adding a new panel without wiring `setOpen(newPanel, false)` into every sibling panel-open handler, `startNewRound`, and any debug reset path that reinitialises round state.

## Known intentional dead code
- `QUESTION_TIME_COST_MS` in `js/00_config.js` — defined but unused. Relates to a removed Q&A mechanic. Leave it unless explicitly revisiting.

## What to verify after changes
### After UI changes
- Menus open and close correctly on mobile.
- Tapping outside panels behaves correctly.
- Map panning/zooming still works.
- Debug controls still function.

### After gameplay/system changes
- New round flow works cleanly.
- Target selection still respects mode radius rules.
- Tool availability, lock states, and cost badges update correctly.
- Heat/curses/UI feedback still line up with actual behavior.
- Score, result modal, and persistence still work across refresh.

## Where to look first
- `docs/architecture.md` for code structure, state, POIs, persistence, geolocation, and auth/DB layer.
- `docs/game-design.md` for design pillars, loop, balance stance, roadmap, and open design questions.
- `docs/ui-style.md` for visual language, color usage, and component styling rules.
- `docs/status.md` for implementation status, current priority, and known risks.
- `docs/testing.md` for regression checks and qualitative playtest criteria.
- `/Users/sierro/.claude/plans/server-auth-and-database.md` for the full Supabase schema and auth plan.
