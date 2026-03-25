# Performance Optimizations — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate the highest-impact performance issues identified in the March 2026 review: DOM query repetition on every tick, expensive saves on every fog update, unbounded canvas resizes, hot POI array scans on menu open, and CSS animations that force continuous paint.

**Architecture:** Each task is isolated. No structural changes — only targeted optimisations within existing files. Tasks 1–4 are low-risk one-or-two-line changes. Tasks 5–6 (POI caching) are medium-risk but additive. Tasks 7–8 (CSS animation) are visual-only changes.

Note: Street View localStorage → Blob URL migration is a larger, riskier change requiring its own dedicated plan. It is deferred.

**Tech Stack:** Vanilla JS, Leaflet, Tailwind CSS (via CDN). Verify in browser. Use Chrome DevTools Performance panel for before/after where noted.

---

## Task 1: Cache static DOM elements missing from the existing element cache

**Files:**
- Modify: `js/02_dom.js:30–34` (the HUD cache block)

`updateHUD` calls `document.getElementById` for `timerCurseIndicator`, `heatWidget`, `thermoProgress`, `thermoProgressFill`, `thermoProgressText`, and `dbgHeatCurrent` on every 250ms tick. These elements are static. The existing cache at the top of `02_dom.js` already holds `elTimerMain`, `elTimerPenalty`, `elHeatWidget` — add the missing ones.

- [ ] **Step 1: Add missing cached elements in `js/02_dom.js`**

Find the HUD element cache block (around line 31–34):
```js
// HUD
const elTimerMain = document.getElementById("timerMain");
const elTimerPenalty = document.getElementById("timerPenalty");
const elHeatWidget = document.getElementById("heatWidget");
```
Replace with:
```js
// HUD
const elTimerMain            = document.getElementById("timerMain");
const elTimerPenalty         = document.getElementById("timerPenalty");
const elHeatWidget           = document.getElementById("heatWidget");
const elTimerCurseIndicator  = document.getElementById("timerCurseIndicator");
const elThermoProgress       = document.getElementById("thermoProgress");
const elThermoProgressFill   = document.getElementById("thermoProgressFill");
const elThermoProgressText   = document.getElementById("thermoProgressText");
const elDbgHeatCurrentHUD    = document.getElementById("dbgHeatCurrent");
```

Note: `elDbgHeatCurrentHUD` uses a distinct name because `elDbgHeatCurrent` is already defined on line 27 from the debug panel block — they reference the same element, so just use the existing `elDbgHeatCurrent` instead of adding a duplicate. Skip adding `elDbgHeatCurrentHUD`.

- [ ] **Step 2: Update `updateHUD` in `js/09_ui_helpers.js` to use the cached references**

Find and replace the four `document.getElementById` calls in `updateHUD`:

Replace (line ~277):
```js
  const elTimerCurse = document.getElementById('timerCurseIndicator');
```
With:
```js
  const elTimerCurse = elTimerCurseIndicator;
```

Replace (line ~285):
```js
  const heatEl = document.getElementById("heatWidget");
```
With:
```js
  const heatEl = elHeatWidget;
```

Replace (lines ~312–314):
```js
  const tp = document.getElementById("thermoProgress");
  const tpFill = document.getElementById("thermoProgressFill");
  const tpText = document.getElementById("thermoProgressText");
```
With:
```js
  const tp     = elThermoProgress;
  const tpFill = elThermoProgressFill;
  const tpText = elThermoProgressText;
```

Replace (line ~335):
```js
  const dbgHeatCurrent = document.getElementById("dbgHeatCurrent");
```
With:
```js
  const dbgHeatCurrent = elDbgHeatCurrent;
```

- [ ] **Step 3: Verify in browser**

Open game, start a round. Confirm: timer counts down, heat widget shows, thermometer progress appears when a thermometer tool is active, debug heat display updates. No console errors.

- [ ] **Step 4: Commit**

```bash
cd /Users/sierro/Claude
git add js/02_dom.js js/09_ui_helpers.js
git commit -m "perf: cache static HUD DOM elements to eliminate getElementById on every tick"
git push
```

---

## Task 2: Cache `querySelectorAll` NodeList in `updateUI`

**Files:**
- Modify: `js/09_ui_helpers.js:96–100` and at the end of `bindUI` in `js/02_dom.js`

`updateUI` fires every 250ms and calls `document.querySelectorAll` with a 10-selector comma-joined string every time. The resulting nodes are static (created once at load). Cache them after `bindUI` finishes.

- [ ] **Step 1: Add a module-level cache variable at the top of `js/09_ui_helpers.js`**

Add after line 1 (`// ---- UI helpers ----`):
```js
// Cached tool button NodeList — populated after bindUI() runs.
let __toolButtonNodes = null;
let __radarMenuNodes = null;
```

- [ ] **Step 2: Expose a cache-population function**

Add this function near the top of `js/09_ui_helpers.js`, before `updateUI`:
```js
function __cacheToolButtonNodes() {
  const lockSelectors = [
    '#qRadar','#qThermo','#qDir','#qLandmark','#qPhoto',
    '#radarMenu .menuBtn','#thermoMenu .menuBtn','#dirMenu .menuBtn','#landmarkMenu .menuBtn','#photoMenu .menuBtn'
  ];
  __toolButtonNodes = Array.from(document.querySelectorAll(lockSelectors.join(',')));
  __radarMenuNodes  = Array.from(document.querySelectorAll('#radarMenu .menuBtn[data-radar]'));
}
window.__cacheToolButtonNodes = __cacheToolButtonNodes;
```

- [ ] **Step 3: Replace `querySelectorAll` in `updateUI` with the cached arrays**

In `updateUI`, replace (line ~100):
```js
    const nodes = document.querySelectorAll(lockSelectors.join(','));
```
With:
```js
    const nodes = __toolButtonNodes || document.querySelectorAll(lockSelectors.join(','));
```

And replace (line ~158):
```js
    document.querySelectorAll('#radarMenu .menuBtn[data-radar]').forEach(btn => {
```
With:
```js
    (__radarMenuNodes || document.querySelectorAll('#radarMenu .menuBtn[data-radar]')).forEach(btn => {
```

Also remove the now-unused `const lockSelectors = [...]` array from inside `updateUI` (since it's no longer referenced in the live path).

- [ ] **Step 4: Call `__cacheToolButtonNodes` at the end of `bindUI` in `js/02_dom.js`**

Find the end of `bindUI` in `js/02_dom.js` (the closing `}` of the function, around line 1298). Add just before the closing brace:
```js
  // Cache tool button node lists for updateUI performance
  try { if (typeof window.__cacheToolButtonNodes === 'function') window.__cacheToolButtonNodes(); } catch(e) {}
```

- [ ] **Step 5: Verify in browser**

Start a round. Confirm tool buttons still update correctly: used tools grey out, locked tools show lock badge, curse-locked radar shows purple. Verify Signal Clamp curse (simulate via debug picker) still locks radar buttons > 250m. Confirm no console errors.

- [ ] **Step 6: Commit**

```bash
git add js/09_ui_helpers.js js/02_dom.js
git commit -m "perf: cache tool button NodeList after bindUI to eliminate querySelectorAll on every 250ms tick"
git push
```

---

## Task 3: Switch `recordAction` in `17_leaflet_fog.js` to debounced save

**Files:**
- Modify: `js/17_leaflet_fog.js:207`

`recordAction` currently calls `saveRoundState()` directly (immediate, synchronous `JSON.stringify` + `localStorage.setItem`). Every fog update triggers this. Using the debounced variant is a one-line change and is safe because the immediate save is only needed for round reset and lock-in (which call `saveRoundState` directly elsewhere).

- [ ] **Step 1: Change `recordAction` to use the debounced save**

Find (line 207 in `js/17_leaflet_fog.js`):
```js
function recordAction(action) {
  fogActions.push(action);
  try { if (typeof saveRoundState === "function") saveRoundState(); } catch(e) {}
}
```
Replace with:
```js
function recordAction(action) {
  fogActions.push(action);
  try { if (typeof saveRoundStateDebounced === "function") saveRoundStateDebounced(); } catch(e) {}
}
```

- [ ] **Step 2: Verify in browser**

Use a radar tool, thermometer, and N/S/E/W clue. Close the tab immediately after using each tool (to test that the save fires within the 300ms debounce window). Reopen — confirm the fog overlays are restored correctly. Confirm no console errors.

- [ ] **Step 3: Commit**

```bash
git add js/17_leaflet_fog.js
git commit -m "perf: switch recordAction to saveRoundStateDebounced to avoid synchronous localStorage writes on every fog update"
git push
```

---

## Task 4: Add dimension guard to `resizeCanvasToDisplaySize`

**Files:**
- Modify: `js/05_view_transform.js` (or wherever `resizeCanvasToDisplaySize` is defined — search for it)

`draw()` calls `resizeCanvasToDisplaySize()` on every invocation even when nothing has changed. Adding a guard that checks current vs expected dimensions before doing any work makes most draw calls skip the resize entirely.

- [ ] **Step 1: Find `resizeCanvasToDisplaySize`**

```bash
grep -n "resizeCanvasToDisplaySize" /Users/sierro/Claude/js/*.js | head -20
```

- [ ] **Step 2: Add an early-return guard**

The function should look something like this after the change. Find the existing body and add the guard at the top (adjust to match the actual implementation):
```js
function resizeCanvasToDisplaySize() {
  const dpr = window.devicePixelRatio || 1;
  const w = Math.round(canvas.clientWidth  * dpr);
  const h = Math.round(canvas.clientHeight * dpr);
  // Early return if nothing changed — avoids clearing canvas on every draw() call
  if (canvas.width === w && canvas.height === h) return;
  canvas.width  = w;
  canvas.height = h;
  // ... rest of existing body (fogScreen sync, etc.)
}
```

- [ ] **Step 3: Verify in browser**

Start a round, use tools. Confirm the canvas fog overlay still renders correctly. Resize the browser window — confirm the canvas resizes to match. Confirm no visual glitches.

- [ ] **Step 4: Commit**

```bash
git add js/05_view_transform.js
git commit -m "perf: add dimension guard to resizeCanvasToDisplaySize to skip no-op resizes"
git push
```

---

## Task 5: Cache per-category POI filter arrays for the landmark submenu

**Files:**
- Modify: `js/02_dom.js:580–630` (the `refreshLandmarkNearestLabels` function)

Opening the landmark submenu calls `__landmarkCategoryPoisFilter` 5× over the full `__allPois` array. Cache the results the first time and clear on new game.

- [ ] **Step 1: Add a category pool cache variable near the top of `js/02_dom.js`**

Find the existing `let __landmarkLiveCache = {};` (line 2) and add below it:
```js
let __landmarkPoiPoolCache = {}; // { [kind]: POI[] } — populated on first menu open, cleared on new game
```

- [ ] **Step 2: Update `refreshLandmarkNearestLabels` to use the cache**

Find the block that builds `pools` (around line 580–600). It looks like:
```js
  const pois = window.__allPois || [];
  const pools = {
    train_station: window.__landmarkCategoryPoisFilter('train_station', pois),
    cathedral:     window.__landmarkCategoryPoisFilter('cathedral', pois),
    ...
  };
```
Replace the `pools` construction with:
```js
  const pois = window.__allPois || [];
  const _kinds = ['train_station', 'cathedral', 'bus_station', 'library', 'museum'];
  const pools = {};
  for (const kind of _kinds) {
    if (!__landmarkPoiPoolCache[kind]) {
      __landmarkPoiPoolCache[kind] = (typeof window.__landmarkCategoryPoisFilter === 'function')
        ? window.__landmarkCategoryPoisFilter(kind, pois)
        : [];
    }
    pools[kind] = __landmarkPoiPoolCache[kind];
  }
```

- [ ] **Step 3: Clear `__landmarkPoiPoolCache` when a new game starts**

Find `__landmarkLiveCache = {};` in the new-game reset path (search for it in `02_dom.js` — it should be in the `startNewGameFromMenuOrDebug` or similar function). Add on the next line:
```js
  __landmarkPoiPoolCache = {};
```

- [ ] **Step 4: Verify in browser**

Open the landmark submenu, verify "Nearest: X" labels appear correctly for all 5 categories. Close and reopen — confirm labels are consistent. Start a new game and reopen the submenu — confirm labels update to reflect the new game area.

- [ ] **Step 5: Commit**

```bash
git add js/02_dom.js
git commit -m "perf: cache per-category POI filter arrays for landmark submenu to eliminate 5×O(n) scans on every open"
git push
```

---

## Task 6: Cache per-category POI arrays for fog Voronoi clipping

**Files:**
- Modify: `js/17_leaflet_fog.js` — the `addFogNearestStation` and `addFogNearestLandmark` functions

These functions filter `window.__allPois` on every call to extract stations/landmarks. Add a module-level cache cleared by `clearFog`.

- [ ] **Step 1: Add a fog POI cache variable near the top of `js/17_leaflet_fog.js`**

Find the `let fogActions = [];` line and add below it:
```js
let __fogPoiCategoryCache = {}; // { [kind]: POI[] } — cleared with fog
```

- [ ] **Step 2: Add a helper to get-or-populate the cache**

Add just before `addFogNearestStation`:
```js
function __getCachedPoisForKind(kind) {
  if (__fogPoiCategoryCache[kind]) return __fogPoiCategoryCache[kind];
  const pois = window.__allPois || [];
  const result = (typeof window.__landmarkCategoryPoisFilter === 'function')
    ? window.__landmarkCategoryPoisFilter(kind, pois)
    : pois.filter(p => p && p.kind === kind);
  __fogPoiCategoryCache[kind] = result;
  return result;
}
```

- [ ] **Step 3: Update `addFogNearestStation` to use the cache**

Find the filter call in `addFogNearestStation` that scans `__allPois` (it will be something like `window.__allPois.filter(p => p.kind === 'train_station' || ...)`). Replace the filter expression with:
```js
  const stations = __getCachedPoisForKind('train_station');
```

- [ ] **Step 4: Update `addFogNearestLandmark` similarly**

Find the equivalent filter call and replace with:
```js
  const landmarks = __getCachedPoisForKind(kind);
```
Where `kind` is the landmark category variable already in scope in that function.

- [ ] **Step 5: Clear the cache in the `clearFog` function**

Find `function clearFog()` in `17_leaflet_fog.js`. Add at the top:
```js
  __fogPoiCategoryCache = {};
```

- [ ] **Step 6: Verify in browser**

Use the landmark fog tool (nearest train station, nearest cathedral). Confirm fog Voronoi cells still render correctly. Use it twice in a row — confirm the second use is instant (cache hit). Start a new round and use it again — confirm the cache cleared and results still look right.

- [ ] **Step 7: Commit**

```bash
git add js/17_leaflet_fog.js
git commit -m "perf: cache per-category POI arrays for fog Voronoi to avoid O(n) scan on every landmark clue"
git push
```

---

## Task 7: Fix `miasmaDrift2` CSS animation — stop animating `background`

**Files:**
- Modify: `styles.css` — the `miasmaDrift2` keyframes and the `.panelCurses` pseudo-element rule

Animating gradient `background` values forces paint on every frame. Replace with opacity + transform animation on a separate layer.

- [ ] **Step 1: Find the relevant CSS**

Search `styles.css` for `miasmaDrift2`. It will be near a `@keyframes miasmaDrift2` block (around line 639) and used in a selector like `.panelCurses.curse-active::after` or similar.

- [ ] **Step 2: Replace `miasmaDrift2` with a compositor-safe animation**

Replace the `@keyframes miasmaDrift2` block with:
```css
@keyframes miasmaDrift2 {
  0%   { opacity: 0.4; transform: translate(0, 0) scale(1); }
  50%  { opacity: 0.7; transform: translate(-12px, 8px) scale(1.08); }
  100% { opacity: 0.4; transform: translate(4px, -6px) scale(0.96); }
}
```

- [ ] **Step 3: Update the pseudo-element that uses it**

Find the selector that applies `miasmaDrift2` (likely `.panelCurses.curse-active::before` or `::after`). If it currently animates `background`, change the `background` property to a static value and let only `opacity`/`transform` animate:
```css
/* example — adjust colours to match existing style */
background: radial-gradient(circle at 30% 40%, rgba(168,85,247,0.18) 0%, transparent 65%);
animation: miasmaDrift1 5.8s ease-in-out infinite alternate,
           miasmaDrift2 8.3s ease-in-out infinite alternate-reverse;
```
Also verify `will-change: transform, opacity;` is set on that pseudo-element.

- [ ] **Step 4: Also check `miasmaDrift1`**

If `miasmaDrift1` also animates `background-position` on a gradient (not just position), apply the same treatment: keep the gradient static, animate only `transform`/`opacity`.

- [ ] **Step 5: Verify visually in browser**

Open the curses panel. Apply a curse via the debug picker. Confirm the miasma animation still plays and looks good. Open Chrome DevTools → Rendering → enable "Paint flashing" — confirm the curses panel pseudo-element no longer flashes on every frame.

- [ ] **Step 6: Commit**

```bash
git add styles.css
git commit -m "perf: replace background-value animation in miasmaDrift2 with compositor-safe opacity+transform"
git push
```

---

## Task 8: Remove animated `filter` values from photo modal glitch CSS

**Files:**
- Modify: `styles.css` — `@keyframes mgBaseJitter` and related photo glitch keyframes

`filter: blur()/saturate()/contrast()/hue-rotate()` in animated keyframes cannot be GPU-composited and forces repaint at every step. The blur/contrast values can stay as static CSS — only the transform values need to animate.

- [ ] **Step 1: Find the photo glitch keyframes**

Search `styles.css` for `mgBaseJitter`. Also find `mgRgbJitterA`, `mgRgbJitterB`. These are the ones likely animating `filter`.

- [ ] **Step 2: Remove `filter` from `mgBaseJitter` keyframes**

For `@keyframes mgBaseJitter`: keep `transform` (translate, skew, scale) values, remove any `filter:` properties from each keyframe step. Move the desired static filter to the `.photo-glimpse-img.base` selector as non-animated CSS:
```css
.photo-glimpse-img.base {
  /* static filter — not animated */
  filter: saturate(0.7) contrast(1.1);
  /* ... rest of existing styles ... */
}
```

- [ ] **Step 3: Remove `filter` from `mgRgbJitterA` and `mgRgbJitterB`**

Same treatment: keep only `transform` in keyframe steps. The `mix-blend-mode` and static `filter` on the overlay images can remain as non-animated CSS.

- [ ] **Step 4: Verify visually in browser**

Open the photo modal on a corrupted photo. Confirm the glitch effect still looks distinctly corrupted (transform jitter + scan lines + RGB split). Check Chrome DevTools Performance → record 2s with photo modal open → verify frame budget is not dominated by paint. The effect should still feel noisy and glitchy — we're only removing the per-frame filter recalculation, not the visual character.

- [ ] **Step 5: Commit**

```bash
git add styles.css
git commit -m "perf: remove animated filter values from photo glitch keyframes; keep static filter on element"
git push
```
