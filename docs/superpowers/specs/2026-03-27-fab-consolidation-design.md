# FAB Consolidation Design

**Date:** 2026-03-27
**Status:** Approved

## Summary

Reduce the map screen from 8 FABs to 5 by collapsing the left column to System + Gameplay, removing the standalone Debug and Info FABs, removing the Curses FAB, and merging heat and curse state into a single Heat panel opened via the Heat FAB.

---

## 1. FAB Layout

### Before (8 FABs)
| Side | Position | ID | Icon |
|------|----------|----|------|
| Left | stack1 | `#btnDebug` | ⚙︎ |
| Left | stack2 | `#btnSystem` | ⌂ |
| Left | stack3 | `#btnInfo` | ⓘ |
| Right | stack1 | `#btnRecenter` | ⌖ |
| Right | stack2 | `#btnGameplay` | ☰ |
| Right | stack3 | `#btnPhotoGallery` | 📷 |
| Right | stack4 | `#btnCurses` | ☠ |
| Right | stack5 | `#heatWidget` | 🔥 |

### After (5 FABs)
| Side | Position | ID | Icon |
|------|----------|----|------|
| Left | stack1 | `#btnSystem` | ⌂ |
| Left | stack2 | `#btnGameplay` | ☰ |
| Right | stack1 | `#btnRecenter` | ⌖ |
| Right | stack2 | `#btnPhotoGallery` | 📷 |
| Right | stack3 | `#heatWidget` | 🔥 |

### Changes
- `#btnDebug` removed from HTML. Entry point moves to System panel (see §2).
- `#btnInfo` removed from HTML. Content moves to System panel (see §2).
- `#btnCurses` removed from HTML. Content moves to Heat panel (see §3).
- `#btnGameplay` moves from right stack2 to left stack2.
- `#heatWidget` moves from right stack5 to right stack3.
- All `fab--stackN` classes updated to reflect new positions.

---

## 2. System Panel Changes

`#panelSystem` gains two new items below the existing Sign out button:

### How to Play section
- Full static content from the old `#panelInfo` rendered inline in the System panel body.
- `#panelInfo` is removed from the HTML entirely.
- No JS changes needed for this content — it is static HTML.

### Dev Tools button
- A secondary-styled button labelled "Dev Tools" (consistent with existing System panel button style).
- On tap: closes `#panelSystem`, opens `#panelDebug` — identical behaviour to the old `#btnDebug` FAB.
- `#panelDebug` itself is unchanged. Only the entry point changes.
- The old `#btnDebug` click handler is removed; a delegated or direct handler on the new button replicates it.

---

## 3. New `#panelHeat` Panel

A new panel replaces `#panelCurses`. It is a `panel panel--right` positioned identically to the old curses panel.

### Structure
```
#panelHeat  (.panel .panel--right)
  .panelHandle
  .panelHeader
    .panelTitle       "Heat"
    .panelSubtitle    "Current temperature & active curses"
  .panelBody
    .heat-row         (flame SVG + level number + badge + description)
    <hr>
    .section-label    "Active Curses"
    #cursesEmpty      (moved from #panelCurses)
    #cursesList       (moved from #panelCurses)
```

### Heat row
- Flame SVG: the existing SVG path from `#heatWidget`, sized ~32×32, with `fill="currentColor"`.
- Colour: the `heat-1`…`heat-5` classes (already in `styles.css`) are applied to the `.heat-row` container so both the SVG and the level number inherit the correct colour.
- Level number: `"N / 5"` where N is the current integer heat level.
- Badge: label string from the existing `['COLD','WARM','WARM','HOT','HOT','MAX']` array, styled as a small pill.
- Description: output of the existing `heatConsequencesText(level)` function.
- The heat row updates whenever `updateHUD()` runs (same cadence as the FAB colour update).

### Curse list
- `#cursesEmpty` and `#cursesList` are physically moved (cut from `#panelCurses`, pasted into `#panelHeat`). Their IDs, content, and update logic are unchanged.
- `#panelCurses` is removed from the HTML.

### Opening the panel
- `#heatWidget` click handler opens `#panelHeat` (previously the widget had no panel).
- `#heatWidget` is registered with `setOpen` / `syncBackdrop` like every other panel FAB.
- `#panelHeat` is added to the mutual-exclusion list in `js/14_panels_misc.js` so opening it closes all sibling panels.
- `startNewRound` and any debug reset paths call `setOpen(panelHeat, false)` to ensure the panel is closed on round reset.

### Miasma effect
- The `.curse-active` CSS class and its miasma styles (currently on `.panel--curses.curse-active`) are moved to `#panelHeat.curse-active`. The `.panel--curses` class is retired.
- `updateCursesPanel()` (in `js/09_ui_helpers.js`) targets `#panelHeat` for the `curse-active` toggle instead of `#panelCurses`.

---

## 4. Heat FAB Miasma (Curse Active State)

When curses are active, `#heatWidget` receives the class `curse-active`.

### CSS
New rule in `styles.css` (`#heatWidget` also needs `overflow: hidden` added to its inline classes in `index.html` so the `::after` pseudo-element is clipped to the FAB bounds):
```css
#heatWidget.curse-active {
  border-color: rgba(168,85,247,0.55);
  box-shadow: 0 0 12px rgba(168,85,247,0.45), 0 2px 8px rgba(0,0,0,0.4);
}
#heatWidget.curse-active::after {
  content: '';
  position: absolute;
  bottom: 0; left: 0; right: 0;
  height: 55%;
  background: linear-gradient(to top, rgba(88,28,135,0.75) 0%, rgba(168,85,247,0.45) 60%, transparent 100%);
  border-radius: 0 0 inherit inherit;
  animation: heatMiasmaPulse 2s ease-in-out infinite alternate;
  pointer-events: none;
  z-index: 0;
}
#heatWidget.curse-active > * { position: relative; z-index: 1; }
@keyframes heatMiasmaPulse {
  from { opacity: 0.65; height: 52%; }
  to   { opacity: 1.0;  height: 66%; }
}
```

### JS
`updateCursesButton()` in `js/09_ui_helpers.js` is renamed `updateHeatCurseButton()` and retargeted to `#heatWidget`:
- Adds `curse-active` when curses are active (replaces the old `isActive`/`isInactive` toggle on `#btnCurses`).
- Removes `curse-active` when no curses are active.
- The old `#btnCurses` `isActive`/`isInactive` CSS rules are removed from `styles.css`.

---

## 5. Files Changed

| File | Changes |
|------|---------|
| `index.html` | Remove `#btnDebug`, `#btnInfo`, `#btnCurses`. Update stack classes on remaining FABs. Add Dev Tools button + How to Play content to `#panelSystem`. Add `#panelHeat`. Remove `#panelCurses` (move `#cursesEmpty`/`#cursesList` into `#panelHeat`). |
| `styles.css` | Update `fab--stackN` offsets. Add `#heatWidget.curse-active` + `::after` miasma. Move miasma styles from `.panel--curses.curse-active` to `#panelHeat.curse-active`. Remove `#btnCurses` active/inactive rules. Remove `.panel--curses` class. |
| `js/09_ui_helpers.js` | Rename `updateCursesButton()` → `updateHeatCurseButton()`, retarget to `#heatWidget`. Update `updateCursesPanel()` to target `#panelHeat`. Add heat row update logic (level number, badge, description) to `updateHUD()`. |
| `js/14_panels_misc.js` | Add `#panelHeat` to panel open/close mutual-exclusion logic. Wire `#heatWidget` click to open `#panelHeat`. Remove `#btnCurses` and `#panelCurses` references. Add `setOpen(panelHeat, false)` to `startNewRound` and debug reset paths. |

---

## 6. Out of Scope

- No changes to gameplay logic, curse behaviour, heat accumulation, or scoring.
- No changes to `#panelDebug` content.
- No changes to how curses are rendered in `#cursesList` (existing JS unchanged).
- No new animations beyond the FAB miasma pulse defined above.
