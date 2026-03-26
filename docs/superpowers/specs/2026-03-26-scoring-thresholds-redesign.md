# Scoring Thresholds Redesign

**Date:** 2026-03-26
**Status:** Approved — ready for implementation

## Problem

The current threshold system scales every tier as a fraction of the game radius (`GRADE_THRESHOLDS_FRAC`). This has two failure modes:

1. **Diamond is too accessible on short games** — ≤20m is achievable without genuine precision; the tier should require standing on the spot.
2. **Upper tiers are unfairly generous on long games** — finding the exact building isn't harder on a long game than a short one, so scaling Diamond/Emerald/Platinum/Gold with radius gives unearned credit.

## Design

### Hybrid absolute/fractional approach

Upper tiers (Diamond → Gold) use **absolute distance thresholds** — the same value regardless of game length. These tiers test navigation precision, which doesn't change with search radius.

Lower tiers (Silver → Copper) use **per-mode absolute values** that grow with game length. These tiers measure how lost the player was overall, and being 400m off on a short game is a worse failure than 400m off on a long game.

### New thresholds

| Tier | Short | Medium | Long |
|------|-------|--------|------|
| Diamond | ≤ 10m | ≤ 10m | ≤ 10m |
| Emerald | ≤ 30m | ≤ 30m | ≤ 30m |
| Platinum | ≤ 70m | ≤ 70m | ≤ 70m |
| Gold | ≤ 140m | ≤ 140m | ≤ 140m |
| Silver | ≤ 250m | ≤ 400m | ≤ 550m |
| Bronze | ≤ 400m | ≤ 700m | ≤ 1000m |
| Copper | > 400m | > 700m | > 1000m |

**Non-linear spacing in the absolute tiers:** jumps go 10 → 30 → 70 → 140m, roughly doubling each time. This creates a steep precision cliff — small GPS wobble separates Copper from Bronze, but the difference between Emerald and Diamond is genuinely hard.

**Comparison with old system on short games:**
- Diamond: 20m → 10m (twice as hard)
- Gold: 220m → 140m (tighter)
- Silver: 340m → 250m (tighter)
- Bronze: 460m → 400m (slightly tighter)

### Data structure change

Replace `GRADE_THRESHOLDS_FRAC` (single `frac` field per tier) with `GRADE_THRESHOLDS` (explicit `short`/`medium`/`long` fields per tier, all in metres):

```js
const GRADE_THRESHOLDS = [
  { label: 'Diamond',  short: 10,       medium: 10,       long: 10       },
  { label: 'Emerald',  short: 30,       medium: 30,       long: 30       },
  { label: 'Platinum', short: 70,       medium: 70,       long: 70       },
  { label: 'Gold',     short: 140,      medium: 140,      long: 140      },
  { label: 'Silver',   short: 250,      medium: 400,      long: 550      },
  { label: 'Bronze',   short: 400,      medium: 700,      long: 1000     },
  { label: 'Copper',   short: Infinity, medium: Infinity, long: Infinity },
];
```

This is explicit and readable — no runtime `frac × radius` arithmetic.

## Implementation Scope

Changes are confined to two files:

### `js/00_config.js`
- Replace `GRADE_THRESHOLDS_FRAC` with `GRADE_THRESHOLDS` as above.
- No changes to `GRADE_BASE_SCORES`, bonuses, or any other config.

### `js/20_guess.js`
- Update the grading function (wherever it iterates `GRADE_THRESHOLDS_FRAC` and computes `frac * getModeTargetRadiusM()`) to instead read the appropriate mode key (`short`/`medium`/`long`) directly from `GRADE_THRESHOLDS`.
- No other changes.

## Out of Scope

- Base scores (`GRADE_BASE_SCORES`) — unchanged
- Time / length / difficulty / tool-efficiency bonuses — unchanged
- Visual medal design (covered in `2026-03-25-medal-redesign-design.md`)
- Any other gameplay system
