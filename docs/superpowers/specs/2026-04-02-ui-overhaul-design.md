# UI Overhaul Design Spec
_Date: 2026-04-02/03 — Design complete_

## Status
- [x] HUD — adaptive command band
- [x] Gameplay panel — tool deck + sub-options
- [x] Heat panel
- [x] Briefing modal
- [x] Setup screen
- [x] Debrief modal
- [x] Photo viewer

Mockups — session 1 (`.superpowers/brainstorm/86037-1775164359/content/`):
- `hud-v3.html` — HUD, all three modes
- `tool-deck-v3.html` — tool deck (main panel)
- `tool-deck-v5.html` — sub-options with heat chip + state
- `threat-panel.html` — heat panel
- `briefing-modal.html` — briefing + mode select
- `setup-v2.html` — setup screen
- `debrief.html` — debrief (superseded)

Mockups — session 2 (`.superpowers/brainstorm/42342-1775207816/content/`):
- `photo-viewer.html` — photo modal + gallery
- `debrief-v3.html` — debrief with 7-tier medal strip (final)

---

## Visual Direction

- **Palette:** near-black navy (`#080c14`), graphite blue (`#0f172a`), cyan (`#22d3ee`) as primary system accent
- **Mode accents:** cyan = Normal, amber = Gauntlet, violet = Remote
- **Role accents:** amber = commitment, red = danger, violet = corruption/curse, emerald = success
- **Surfaces:** machined feel — sharp inner borders, subtle panel seams, restrained glow
- **Typography:** monospace (`SF Mono`) for all numbers, timers, chips, labels; display weight for headlines
- **Motion:** minimal — panel slides, no decorative bounce

---

## 1. HUD — Adaptive Command Band

All modules share one border radius, shadow, and inset-highlight. They read as a family even when physically separated.

### Layout
- **Top left:** system FAB (⌂) + field tools FAB (≡)
- **Top centre:** command band (two-row module)
- **Top right:** recenter FAB + photo FAB only — heat FAB removed entirely
- **Bottom:** full-width "Lock In Guess" CTA, no flanking buttons

### Command Band — Row 1 (clock row)
- Left: "Mission Clock" label + large mono timer
- Right: "Field Op Active" label + mode chip

### Mode chip format
- Normal: `NORMAL` (cyan)
- Gauntlet: `GAUNTLET · ●●○○○ 3/5` — pips + fraction embedded in chip (amber)
- Remote: `REMOTE · 7 MOV` — move counter embedded in chip, turns red at ≤3 (violet)

### Command Band — Row 2 (secondary row)
**Identical across all modes:**
- Heat gauge: 5 segmented bars (blue → cyan → amber → orange → red) with flame glyph
- Separator
- Curse slot: `◈ [count] [timer]` — no label. Dims to `◈ 0 —` when clear. Timer shows **longest** active curse remaining.

### Tapping
- Tapping heat gauge or curse slot opens the Heat panel

### Undo capsule (Remote only)
- Transient capsule appearing after each move: `↩ Undo Move` + decay progress bar
- Violet border, fades out over a few seconds
- When Shaky Hands curse is active, capsule does not appear

---

## 2. Gameplay Panel — Field Tools

### Panel header
- Title: `FIELD TOOLS`
- Summary chips: heat level, curse count+timer, tools spent, guess state
- Remote adds: moves chip

### Tool deck (main list)
Cards show **state only** — no metadata on the deck itself.

| State | Visual |
|-------|--------|
| Ready | Cyan left-edge inset + `Ready ›` chip |
| Locked | Desaturated, unlock time shown below card |
| Used | Faded to ~38% opacity, non-tappable |
| Cursed | Violet left-edge + scanline noise + curse name tag below card. Still tappable (`Cursed ›`). |
| Disabled | Flat desaturated, `Unavailable` chip, `REMOTE: N/A` tag. Not tappable. |

Locked cards show unlock time tag (e.g. `UNLOCKS 15:00`) — the only metadata on the deck.

### Sub-options screen
Tapping a Ready or Cursed card navigates to a sub-options screen within the panel.

- Back nav: `‹ Field Tools`
- Tool icon + name + one-line description in sub-header
- Each option is a full-width tappable card (whole card = tap target, no button)
- Right column per option (stacked, same mono font size):
  - Heat chip: amber box, e.g. `+1.0 Heat`. On cursed options: purplified orange (burnt orange text, `#d4824a`, amber-base bg, orange-violet blended border + faint violet inner glow)
  - State chip below: only shown when notable (`Used`, `Cursed`). Not shown when ready.
- Option states: Ready (cyan left edge), Used (faded, inert), Cursed (violet edge + scanline noise + inline curse note)

---

## 3. Heat Panel

- Title: **Heat** (not "Threat Level")
- Accessible by tapping the secondary row (heat gauge or curse slot)

### Hero block
- `HEAT` label + rank chip (`COLD` / `WARM` / `HOT` / `CRITICAL`)
- Full segmented gauge (same language as HUD)
- One-sentence consequence explaining gameplay impact at this heat level
- At HOT: orange border. At CRITICAL: red border + faint red glow.

### Curse cards
- Section label: `ACTIVE CURSES — N`
- Each curse: violet left-edge + scanline noise card
  - Icon glyph, curse name, effect description, timer chip (`◈ 1:23 remaining`), affected systems
  - Remote mode: descriptions use movement language (e.g. "Each tap costs 2 moves", "Undo unavailable")
- When no curses: `— No active curses —` placeholder
- Panel top border shifts violet when curses are active

---

## 4. Briefing Modal

Flow: **Briefing → Begin Setup → Setup Screen → Begin Operation → round starts**

### First visit / new player
- Hero: map-grid background, "Mission Briefing" eyebrow, game title lockup
- Three step blocks (numbered, cyan circles):
  1. **Acquire Visual** — study the photo
  2. **Investigate** — walk/tap, use tools
  3. **Lock Position** — pin guess, score by distance
- Step 2 copy changes by mode:
  - Normal: "Walk the area"
  - Remote: "Tap the map to move"
- Remote shows a violet note block: GPS anchors region only, no physical movement needed
- Mode selector: three stacked mission profile cards (icon, name, one-line rule, selection dot). Selected card gets coloured left edge matching mode accent.
- CTA: **Begin Setup** — colour tracks mode

### Returning player
- Condensed redeploy screen: last run score + medal instead of briefing copy
- Mode selector + Begin Setup CTA unchanged

---

## 5. Setup Screen

### Header
- `‹ Briefing` back link
- Title: "Configure Operation"
- Mode chip (read-only reminder, mode was chosen in briefing)

### Sections (in order)
1. **Difficulty** — pill row: `Recruit` / `Operative` / `Ghost`. Selected pill uses mode accent colour.
2. **Search Radius** — three cards: `500m` / `1km` / `1.5km`. No names. Remote cards show move budget below radius in violet (e.g. `15 moves`).
3. **Starting Location** (Normal/Gauntlet) / **Search Region** (Remote)
   - GPS detected: green dot, location name, `Change` link
   - Custom pin: cyan dot, resolved area name, distance from GPS (e.g. `3.2km from GPS`), `Change` link
   - Remote adds: violet note block clarifying GPS is anchor only
4. No summary block.

### CTA
- **Begin Operation** — colour tracks mode

---

## 6. Debrief Modal

### Hero
- Centred outcome text block: "Operation Debrief" eyebrow + mode chip, outcome headline, distance off target (colour: green/amber/red)
- Below that: full 7-tier medal strip, left→right: **Copper → Bronze → Silver → Gold → Platinum → Emerald → Diamond**
- Earned medal: 48px, full opacity, colour glow, tier label below
- Flanking medals: 22px, 20% opacity, no label
- Strip always centred as a whole — copper sits at left edge, diamond at right edge
- Placeholder letter circles for now (C/B/S/G/P/E/D); swap real icons when ready
- Outcome headlines by result state: *Target Located*, *Moves Exhausted*, *Time Expired*, *All Targets Clear*

### Medal tier colours (placeholder)
| Tier | Colour |
|------|--------|
| Copper | `#b87333` warm brown |
| Bronze | `#cd7f32` bronze |
| Silver | `#94a3b8` grey |
| Gold | `#f59e0b` amber |
| Platinum | `#b0c4d8` ice blue |
| Emerald | `#10b981` green |
| Diamond | `#67e8f9` cyan |

### Field Stats (mode-aware trio)
| Mode | Stat 1 | Stat 2 | Stat 3 |
|------|--------|--------|--------|
| Normal | Distance | Time Remaining | Tools Used |
| Remote | Distance | Moves Left | Tools Used |
| Gauntlet | Avg Distance | Targets (5/5) | Tools Used |

### Score Breakdown
Clean audit table: mono values, restrained separators. Rows: base score, distance penalty, time/moves bonus, tool cost, total.

### CTAs
- Primary: **Redeploy** — colour tracks mode
- Secondary row (equal weight, quiet styling): **Review Target** · **Close Debrief**

---

## 7. Photo Viewer

### Single photo modal
- Full-screen dark background (`#04070f`)
- Top bar (over photo): close button + photo counter (`Photo 2 of 4`)
- Thin cyan corner brackets framing the photo (targeting reticle aesthetic)
- Scanline treatment: horizontal lines at **edges only** via mask gradient — centre stays clean
- Corruption overlay: violet vertical scanlines at low opacity across full image (only on corrupted photos)
- Metadata chips overlaid at bottom edge of photo (dark frosted bg):
  - Source type: `Starter Photo` / `Intel Photo`
  - Corruption state: `Clean` (emerald) / `◈ Corrupted` (violet)
  - Unlock method: `Mission Start` / `Unlocked via Tool`
- Caption panel below photo: title + 1–2 lines of context text

### Gallery grid
- 2×2 grid of thumbnails
- Header: "Photo Intel" + `N acquired · N corrupted` summary
- Thumbnail badges (top-left): `Starter` (cyan) / `Intel` (emerald) / `◈ Corrupted` (violet) / `Locked` (slate)
- Corrupted thumbnails: violet border + scanline noise overlay
- Locked thumbnails: dark overlay + lock glyph, non-tappable
- Photo number badge (bottom-right)

### Remote mode note
Language in captions must not imply physical movement to a vantage point.

---

## Standardisation Rules (applies everywhere)

- One border radius family — tighter than current
- One depth model — low ambient shadow + precise inner stroke
- State chips share one language: `Ready`, `Locked`, `Used`, `Cursed`, `Unavailable`
- Numeric system: monospace font throughout for all timers, distances, counts
- Mode accent colour is consistent: cyan = Normal, amber = Gauntlet, violet = Remote

## What's Removed
- Heat FAB (heat now in HUD secondary row)
- "CURSE" label (replaced by icon+count+timer)
- Submenu navigation (replaced by inline sub-options)
- Summary block on setup screen
- Size names on radius cards (500m/1km/1.5km only)
- "Threat Level" rename (stays as "Heat")
- USE button on sub-options (whole card is tap target)
