# UI style reference

## Visual identity
The UI uses a dark, bold, mobile-first look inspired by the feel of Jet Lag: The Game’s app presentation:
- deep navy surfaces
- strong accent fills
- clear hierarchy
- no glassmorphism
- no frosted panels
- low clutter on top of the map

The map remains the star. Panels and FABs should support play without overwhelming the screen.

## Visual principles
- Mobile-first readability
- Strong contrast
- Bold solid accent colors
- Minimal chrome over the map
- Clear touch targets
- Fast-to-scan hierarchy
- Keep panels purposeful rather than decorative

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
Use strong, full-fill accent colors by tool:
- Radar: blue
- Thermometer: orange
- N/S/E/W: cyan
- Landmark: emerald
- Photo: violet

Submenu icon boxes should use tinted wells rather than full fills.
Section labels in submenus should echo the tool accent color.

## FAB guidance
### Right-side FABs (stack order top to bottom)
- Stack 1 — Recenter: dark neutral base with cyan icon
- Stack 2 — Gameplay: strong blue
- Stack 3 — Curses: dark purple base; glow when active
- Stack 4 — Heat: dark neutral base; flame SVG icon; colour shifts grey→amber→orange→red (`heat-1`–`heat-5`) as heat level rises; level 5 adds a red glow
- Stack 5 — Photo gallery: dark neutral base; camera SVG icon; hidden until photos are collected; violet count badge top-right

### Left-side FABs
- Debug uses dark neutral styling and should not visually overpower gameplay controls.

## Action buttons
Use bold, high-clarity action styling:
- New Game: amber
- Lock In Guess: cyan
- Start / confirm progression actions: emerald

Selected state for mode/difficulty choice buttons should be visibly distinct and consistent.

## Panel and modal guidance
- Panels should use dark navy backgrounds with crisp borders.
- Avoid translucent/glassy treatment.
- Modals should feel clean and legible, not ornamental.
- Keep spacing comfortable for thumb use.
- Prefer fewer, clearer sections over dense option walls.

## Toast guidance
- Toasts should be legible at a glance.
- Visual language should communicate status clearly.
- Avoid overloading the player with stacked or overly verbose transient messaging.

## Curse styling
- Active curse UI should be visibly distinct and a bit threatening, but still readable.
- Purple miasma/glow treatment is appropriate.
- The curse FAB should clearly indicate inactive vs active states.

### Curse-blocked tool options
When a curse prevents use of a specific tool option (e.g. Signal Clamp blocking radar > 250m), that button should use the `.menuBtn.curse-locked` class:
- Purple border: `rgba(168,85,247,.50)`
- Purple-tinted background: `rgba(88,28,135,.28)`
- Purple-tinted icon box
- 🔒 badge (top-right, same position as the standard `.locked` badge)
- `cursor: not-allowed`

This is distinct from the standard `.locked` class (time-gated, blue tint) and `.used` class (already consumed, grey). The curse-locked state should be toggled reactively in `updateUI()` so it clears automatically when the curse expires.

## Result modal guidance
The result modal should feel rewarding and easy to parse:
- earned medal is the hero element
- flanking medals add flair without clutter
- score breakdown should be easy to scan
- distance, time, and tools-used stats should be immediately readable

## Interaction guidance
- Outside-tap to close should work predictably.
- Closing a panel should never leave invisible blockers over the map.
- Map panning must remain comfortable when overlays are present.
- Avoid requiring precision taps on mobile.

## Things to avoid
- Glassmorphism or blurred acrylic styling
- Tiny tap targets
- Overly dense nested menus
- Decorative animation that harms readability or responsiveness
- Inconsistent tool color semantics
- Panels that visually compete with the map instead of supporting it
