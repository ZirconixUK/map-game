# Status and roadmap snapshot

## Implemented
- Mode-based target radius, starter photo flow
- Radar, thermometer, landmark clues, extra photo tools, horizon photo, N/S and E/W split
- Heat meter, curse system (5 tier curses + 4 special curses)
- Lock-in guess, scoring v2, result modal with persistence and reopen
- Reveal beat: toasts dismissed → player→target line → fitBounds → 1.8s → result modal
- Tool confirmation panels; used/locked/curse-locked feedback with live `.lockCountdown` badges
- Difficulty selector with live scoring impact; timer expiry auto-lock (wall-clock enforced)
- Street View guardrails and failure handling
- Debug curse picker with heat tier badges; debug timer advance ticks curse expiry
- Photo gallery FAB (`#btnPhotoGallery`, permanent, badge-only visibility) → `#panelPhotoGallery` (3-column grid, swipe-dismiss); restores on boot; clears on new round
- User accounts via Google OAuth (Supabase); round result sync; 6 achievements; profile page
- Guest play mode: full game playable without an account
- `prefers-reduced-motion` suppresses timerPulse animation
- GPS fail badge on recenter FAB; clears on any GPS success
- FAB consolidation (March 2026): reduced from 8 to 5 FABs. Left: System + Gameplay. Right: Recenter + Photos + Heat. Debug entry moved to System panel "Dev Tools" button. Curses panel merged into Heat panel (`#panelHeat`). Heat FAB gets purple miasma when curse active.

## Not yet implemented
- Chain mode
- Remote mode

## Current priority
Phase C is complete. Phase D (Chain mode) is next.

## Key constants
### Mode radii / timers
- short: 500m / 30 min
- medium: 750m / 45 min
- long: 1500m / 60 min

### Target distance bands
- 60% chance: 0–1km, 30%: 1–2km, 10%: over 2km

### Street View settings
- glimpse FOV: 90, snapshot FOV: 70, metadata radius: 200m, target max attempts: 25

## Scoring (v2)
Grade-based with bonuses. Grades: Diamond 800, Emerald 650, Platinum 500, Gold 375, Silver 250, Bronze 125, Copper 50.
Bonuses: time (up to 300), length (short 0 / medium 50 / long 100), difficulty (easy 0 / normal 50 / hard 100), tool efficiency.

## Roadmap phases
- **Phase A — Stabilise the loop**: Complete.
- **Phase B — Strengthen mid-run**: Complete. N/S/E/W gated behind 50% timer; curses in good shape; dead air reduced.
- **Phase C — Define mastery**: Complete enough. Difficulty selector, grade-based scoring, v3 timer (wall-clock expiry, curse-gated time costs).
- **Phase D — Chain mode**: Current focus. Multi-run commitment with its own pacing and fatigue logic.
- **Phase E — Remote mode**: Not started. Preserves deduction without physical walking.
- **Phase F — Optional expansion**: Not started. Daily challenges, async score comparison, social features.
- **Phase G — Names/flavour text pass**: Not started. Polish all user-facing strings for consistency and tone.

## Risk watchlist
- Grade thresholds too strict for real GPS variance
- N/S/E/W overpowered — collapses too much search space
- Solved-meta opener sequences
- Dead air in the middle of runs
- Timer pressure tuning (v3 curse costs live; monitor short/hard timeout rates)
- Street View API cost/availability
- Leaflet stacking: new layers must declare `pane` explicitly or land below fog (450)
- Photo gallery dedup: `photo.ts` is primary key; `context || kind` fallback can collide on repeat purchases
