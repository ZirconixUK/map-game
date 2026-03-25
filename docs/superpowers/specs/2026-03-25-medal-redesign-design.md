# Medal / Tier Badge Redesign

**Date:** 2026-03-25
**Status:** Approved — ready for implementation

## Overview

Replace the generic ribbon+circle SVG used for all 7 tier badges with distinct, tier-appropriate shapes. Each shape evokes its material. The existing flanking context effect (ghosted neighbour tiers either side) is preserved and enhanced — flanks now render the neighbour's actual shape, making the hierarchy visually self-explanatory.

## Tier Shapes

| Tier | Shape | Color |
|---|---|---|
| Copper | Downward triangle | `#ef4444` |
| Bronze | Circle with concentric inner rings | `#f97316` |
| Silver | Heater shield | `#94a3b8` |
| Gold | 5-pointed star | `#fbbf24` |
| Platinum | Hexagon with internal spoke lines | `#e2e8f0` |
| Emerald | Tall octagon (emerald cut) | `#34d399` |
| Diamond | Faceted diamond (crown + pavilion, two-tone cyan) | `#a5f3fc` / `#7dd3fc` |

Flavour text and base scores are unchanged.

## Flanking Context Effect

The two ghosted neighbours on each side of the earned badge now render each neighbour's own shape (not the generic circle). Sizing and opacity rules are unchanged:

- rank-1 flank: 58×67px, opacity 0.35
- rank-2 flank: 44×51px, opacity 0.18

## Glow Animation

On result modal reveal, the earned badge receives a CSS drop-shadow pulse:

- 2 animation cycles, ~1.8s total, then settles to a faint resting glow
- Higher tiers (Platinum, Emerald, Diamond) use a larger peak glow radius
- Applied to a `<div class="resultMedalGlowWrap">` wrapper around the main SVG, using `filter: drop-shadow(...)` animated via `@keyframes`
- Flanking badges have no animation

```css
@keyframes tierGlowLow {
  0%   { filter: drop-shadow(0 0 3px COLOR); }
  50%  { filter: drop-shadow(0 0 12px COLOR); }
  100% { filter: drop-shadow(0 0 5px COLOR); }
}
@keyframes tierGlowHigh {
  0%   { filter: drop-shadow(0 0 4px COLOR); }
  50%  { filter: drop-shadow(0 0 22px COLOR); }
  100% { filter: drop-shadow(0 0 7px COLOR); }
}
```

`COLOR` is inlined as the tier's hex value (not a CSS variable) since the animation is generated per-round in JS.

Tiers using `tierGlowHigh`: Platinum, Emerald, Diamond.
Tiers using `tierGlowLow`: Copper, Bronze, Silver, Gold.

## Mounting / Ribbon

The old ribbon tab (the `<rect>` + connector at the top of the SVG) is removed entirely. Shapes stand alone with a text label below.

## Implementation Scope

All changes are confined to `js/20_guess.js` and `styles.css`.

### JS changes (`js/20_guess.js`)

1. **Replace `_flankMedal(color, side, rank)`** with **`_tierShape(label, color, w, h)`** — returns a full `<svg width=w height=h viewBox="0 0 64 64">` string (each shape uses a fixed internal viewBox; `w`/`h` control rendered size). Contains a `switch` on `label` returning the appropriate SVG path markup. Shapes that are naturally taller (Diamond, Emerald) use `viewBox="0 0 64 72"` to preserve their aspect ratio.

2. **Update the main earned medal** — replace the hardcoded ribbon+circle SVG with a call to `_tierShape(grade, gc, 80, 80)` (uniform rendered size; internal viewBox handles shape proportions).

3. **Update flank generation** — `_leftHtml` and `_rightHtml` call `_tierShape(g.label, g.color, w, h)` at the flank sizes, wrapped in the existing `.resultFlankMedal` div.

4. **Add glow wrapper** — wrap the main medal SVG in `<div class="resultMedalGlowWrap" style="animation: tierGlowXxx 1.8s ease-in-out 0.2s 2 forwards;">`.

### CSS changes (`styles.css`)

1. Add `@keyframes tierGlowLow` and `@keyframes tierGlowHigh`.
2. Add `.resultMedalGlowWrap { display: inline-block; }` (needed for `filter` to apply correctly to SVG child).
3. Remove or adjust the `.resultMedalSvg` width/height rule if the new shapes have different natural dimensions.

## Scene Container

The `.resultMedalScene` container stays at `position: relative; width: 80px; height: 92px` with `overflow: visible`. Flanks continue to position outside the container bounds using absolute offsets. No layout change needed.

## Out of Scope

- Colour changes to any tier
- Flavour text changes
- Score or threshold changes
- Any changes to the breakdown table, stats row, or action buttons
- Persistence / localStorage format (HTML is stored as a string; the new HTML replaces the old)
