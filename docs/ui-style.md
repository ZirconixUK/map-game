# UI style reference

## Visual identity
Dark, bold, mobile-first. Deep navy surfaces, strong accent fills, clear hierarchy. No glassmorphism. No frosted panels. Map is the star — panels and FABs support play without overwhelming the screen.

## Visual principles
- Mobile-first readability, strong contrast, bold solid accents
- Minimal chrome over the map, clear touch targets
- Fast-to-scan hierarchy
- Panels purposeful, not decorative

## Core color tokens
- Ambient background: `#080c14`
- Main panel background: `#0f1729`
- Surface/card: `#1e2d44`
- Surface hover: `#253550`
- Outer border: `#1e3a5f`
- Inner card border: `#2a3f60`
- Primary text: near-white / `text-gray-100`
- Muted text: slate-muted / `text-slate-400`

## Tool color mapping
- Radar: blue
- Thermometer: orange
- N/S/E/W: cyan
- Landmark: emerald
- Photo: violet

Submenu icon boxes use tinted wells, not full fills. Section labels echo the tool accent color.

## FAB layout (5 FABs)
### Left column
- Stack 1 — System (`#btnSystem`): dark neutral base, ⌂ icon
- Stack 2 — Gameplay (`#btnGameplay`): strong blue, ☰ icon

### Right column
- Stack 1 — Recenter (`#btnRecenter`): dark neutral base, cyan icon
- Stack 2 — Photo gallery (`#btnPhotoGallery`): dark neutral base, camera SVG; violet count badge top-right; permanent button (badge-only visibility logic)
- Stack 3 — Heat (`#heatWidget`): dark neutral base; flame SVG; colour shifts grey→amber→orange→red (`heat-1`–`heat-5`); level 5 adds red glow; purple miasma rising from bottom when a curse is active (`curse-active` class)

## Action buttons
- New Game: amber
- Lock In Guess: cyan
- Start / confirm actions: emerald

## Panel and modal guidance
- Dark navy backgrounds with crisp borders.
- No translucent/glassy treatment.
- Comfortable thumb spacing.
- Fewer, clearer sections over dense option walls.

## Toast guidance
- Legible at a glance.
- Cannot be dismissed within first 600ms (tap-guard against accidental pan dismissal).
- Programmatic dismiss fires instantly.

## Curse styling
- Active curse UI is visibly distinct and slightly threatening, but still readable.
- Purple miasma/glow treatment on `#heatWidget` and `#panelHeat` when `curse-active`.
- Curse-blocked tool options use `.menuBtn.curse-locked`: purple border `rgba(168,85,247,.50)`, purple-tinted bg `rgba(88,28,135,.28)`, 🔒 badge top-right, `cursor: not-allowed`.
- Distinct from `.locked` (time-gated, blue tint) and `.used` (consumed, grey).

## Result modal guidance
- Earned medal is the hero element; flanking medals add flair.
- Score breakdown easy to scan.
- Distance, time, tools-used stats immediately readable.

## Things to avoid
- Glassmorphism or blurred acrylic styling
- Tiny tap targets
- Overly dense nested menus
- Decorative animation that harms readability
- Inconsistent tool color semantics
- Panels that compete with the map
