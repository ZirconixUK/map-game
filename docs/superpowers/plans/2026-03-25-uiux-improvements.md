# UI/UX Improvements — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the player-facing UX issues identified in the March 2026 review — accessibility gaps, confusing feedback, missing information in the result modal, and a dedicated photo gallery so collected photos are easily accessible during a run.

**Architecture:** All changes are local. No new JS files needed. The photo gallery is the most substantial addition — it inserts a horizontal thumbnail strip into `panelGameplay` driven by `roundStateV1.photos`. All other tasks are CSS, small HTML additions, or targeted JS tweaks.

**Tech Stack:** Vanilla JS, Tailwind CSS (CDN), inline SVG. No build step. Verify in browser on a real mobile device or responsive DevTools mode after each task.

---

## Task 1: Add `prefers-reduced-motion` rule for timer pulse animation

**Files:**
- Modify: `styles.css:683`

The `timerPulse` animation (scale bounce on timer phase transitions) is missing from the existing `prefers-reduced-motion` block. This is a one-line CSS fix.

- [ ] **Step 1: Find the existing reduced-motion block**

Search `styles.css` for `prefers-reduced-motion`. There will be a block around line 569 that already suppresses heat widget and heat box animations.

- [ ] **Step 2: Add `.timerPulse` to the block**

Find this block:
```css
@media (prefers-reduced-motion: reduce) {
  #heatWidget.heatPulseUp, #heatWidget.heatPulseDown, .heatBox.heatBoxPop{ animation:none !important; }
```
Add `.timerPulse` to the selector:
```css
@media (prefers-reduced-motion: reduce) {
  #heatWidget.heatPulseUp, #heatWidget.heatPulseDown, .heatBox.heatBoxPop, .timerPulse { animation:none !important; }
```

- [ ] **Step 3: Verify**

In Chrome DevTools → Rendering → enable "Emulate CSS media feature prefers-reduced-motion". Start a round and wait for the timer to cross the yellow threshold. Confirm the timer text does NOT bounce. Disable the emulation and confirm it DOES bounce normally.

- [ ] **Step 4: Commit**

```bash
cd /Users/sierro/Claude
git add styles.css
git commit -m "a11y: add timerPulse to prefers-reduced-motion suppression block"
git push
```

---

## Task 2: Add a 600ms minimum display window before toast tap-dismiss activates

**Files:**
- Modify: `js/02_dom.js:58–75` (the `dismiss` function inside `__showNextToast`)

A player who uses a tool and immediately pans the map will dismiss the result toast via the `pointerdown` handler before reading it. Adding a 600ms guard prevents accidental dismissal.

- [ ] **Step 1: Read the current `__showNextToast` and `dismiss` logic**

Find `function __showNextToast()` in `js/02_dom.js` (around line 43). The `dismiss` function is defined inside it. It should look like:
```js
  const dismiss = () => {
    if (autoDismissTimer) { clearTimeout(autoDismissTimer); autoDismissTimer = null; }
    // ... removes event listeners, hides toast, calls resolve(), calls __showNextToast()
  };
```

- [ ] **Step 2: Add an `isEarlyDismissGuarded` flag**

In `__showNextToast`, after the `dismiss` function definition, add:
```js
  // Prevent accidental tap-dismiss during map pan gestures immediately after a toast appears
  let _dismissGuarded = true;
  const _guardTimer = setTimeout(() => { _dismissGuarded = false; }, 600);
```
Update `dismiss` to cancel `_guardTimer`:
```js
  const dismiss = () => {
    clearTimeout(_guardTimer);
    if (autoDismissTimer) { clearTimeout(autoDismissTimer); autoDismissTimer = null; }
    // ... rest of existing body unchanged
  };
```

- [ ] **Step 3: Apply the guard to the tap-dismiss listener**

Find the `pointerdown` listener that calls `dismiss()` for manual tap. It will look something like:
```js
  toast.addEventListener('pointerdown', dismiss, { once: true });
```
Or it may be via a stored reference like `window.__dismissCurrentToast = dismiss`. Find wherever `dismiss` is wired to a `pointerdown` on the toast, and wrap its call with the guard:

If it's directly `toast.addEventListener('pointerdown', dismiss, ...)`:
```js
  toast.addEventListener('pointerdown', () => {
    if (_dismissGuarded) return;
    dismiss();
  }, { once: true });
```

If it sets `window.__dismissCurrentToast = dismiss` (which is used by `dismissAllToasts`), keep that assignment unchanged (programmatic dismissal should not be guarded). Only the player's manual tap should respect the guard.

- [ ] **Step 4: Verify in browser**

Use the radar tool. Immediately try to tap the map to pan — confirm the toast stays visible for at least 600ms. After ~1 second, tap the toast — confirm it dismisses. Confirm `dismissAllToasts()` (called before the reveal beat) still works instantly.

- [ ] **Step 5: Commit**

```bash
git add js/02_dom.js
git commit -m "ux: add 600ms tap-dismiss guard on toasts to prevent accidental loss of clue results during map pan"
git push
```

---

## Task 3: Add a visible label to the heat widget

**Files:**
- Modify: `index.html` — the `#heatWidget` button

The heat widget (5 fill-boxes) has no visible label. A player unfamiliar with the game won't know what the bars mean. Add a small "HEAT" label.

- [ ] **Step 1: Find the heat widget in `index.html`**

Search for `id="heatWidget"`. It will look like:
```html
<button id="heatWidget" class="heatWidget heatWidget--vertical fab--right fab--stack4 ..." aria-label="Heat" title="Heat">
```
Inside it there will be a `.heatBoxes` wrapper.

- [ ] **Step 2: Add a label element below the heat boxes**

After the `.heatBoxes` div (but still inside the `#heatWidget` button), add:
```html
<span class="heatWidgetLabel" style="display:block;font-size:8px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:#4a627a;margin-top:3px;line-height:1;">HEAT</span>
```

- [ ] **Step 3: Verify on mobile viewport**

In Chrome DevTools responsive mode (375×812, iPhone SE). Confirm the label is visible below the heat boxes, does not overflow the widget, and doesn't overlap the FAB stack below.

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "ux: add visible HEAT label to heat widget"
git push
```

---

## Task 4: Fix curse indicator in timer — change colour to purple, count all curses

**Files:**
- Modify: `index.html:177` — `#timerCurseIndicator`
- Modify: `js/09_ui_helpers.js:277–282` — `updateHUD` curse indicator logic

Currently the indicator is `text-red-400` (hard to distinguish from the timer's red phase) and only shows Overcharged stacks. It should be purple and count all active curses.

- [ ] **Step 1: Change the colour in `index.html`**

Find:
```html
<span id="timerCurseIndicator" class="text-[10px] font-bold text-red-400 tracking-tight hidden">⚠ CURSED</span>
```
Replace with:
```html
<span id="timerCurseIndicator" class="text-[10px] font-bold text-purple-400 tracking-tight hidden">⚠ CURSED</span>
```

- [ ] **Step 2: Update `updateHUD` to show total active curse count, not just Overcharged stacks**

Find this block in `js/09_ui_helpers.js` (around line 277):
```js
  const elTimerCurse = elTimerCurseIndicator;  // (after Task 1 of perf plan)
  if (elTimerCurse) {
    const _stacks = (typeof window.getOverchargedStacks === 'function') ? window.getOverchargedStacks() : 0;
    elTimerCurse.classList.toggle('hidden', _stacks <= 0);
    elTimerCurse.textContent = _stacks > 1 ? `⚠ CURSED ×${_stacks}` : '⚠ CURSED';
  }
```
Replace with:
```js
  const elTimerCurse = (typeof elTimerCurseIndicator !== 'undefined') ? elTimerCurseIndicator : document.getElementById('timerCurseIndicator');
  if (elTimerCurse) {
    const _curses = (typeof window.getActiveCurses === 'function') ? window.getActiveCurses() : [];
    const _count = Array.isArray(_curses) ? _curses.length : 0;
    elTimerCurse.classList.toggle('hidden', _count <= 0);
    elTimerCurse.textContent = _count > 1 ? `⚠ CURSED ×${_count}` : '⚠ CURSED';
  }
```

Note: If the perf plan Task 1 was already applied, `elTimerCurseIndicator` is a cached module-level variable from `02_dom.js`. Use it directly without the fallback. If not yet applied, use the `document.getElementById` fallback.

- [ ] **Step 3: Verify in browser**

Use the debug curse picker to apply 2 different curses. Confirm the timer indicator shows "⚠ CURSED ×2" in purple. With only Overcharged active (no tier curses), confirm it shows "⚠ CURSED" (count = 1). With no curses, confirm the indicator is hidden.

- [ ] **Step 4: Commit**

```bash
git add index.html js/09_ui_helpers.js
git commit -m "ux: change curse indicator to purple and count all active curses instead of only Overcharged stacks"
git push
```

---

## Task 5: Show remaining unlock time directly on time-locked tool buttons

**Files:**
- Modify: `js/09_ui_helpers.js:148–152` — the time-locked button title logic in `updateUI`

Currently time-locked buttons show a 🔒 badge with a `title` tooltip showing unlock time. On mobile, `title` tooltips are unreachable. Show the remaining time as visible button text instead.

- [ ] **Step 1: Update the time-locked button rendering in `updateUI`**

Find this block (around line 148):
```js
      if (!over && !usedThisRound && timeLocked && lockInfo && typeof lockInfo.remainingMs === 'number') {
        n.title = `Unlocks in ${formatMMSS(lockInfo.remainingMs)}`;
      } else {
        n.removeAttribute('title');
      }
```
Replace with:
```js
      if (!over && !usedThisRound && timeLocked && lockInfo && typeof lockInfo.remainingMs === 'number') {
        n.title = `Unlocks in ${formatMMSS(lockInfo.remainingMs)}`;
        // Also display countdown directly in the button's cost badge area (mobile-visible)
        let _badge = n.querySelector('.lockCountdown');
        if (!_badge) {
          _badge = document.createElement('span');
          _badge.className = 'lockCountdown';
          _badge.style.cssText = 'display:block;font-size:9px;font-weight:700;letter-spacing:.05em;color:#a78bfa;margin-top:2px;line-height:1;';
          n.appendChild(_badge);
        }
        _badge.textContent = formatMMSS(lockInfo.remainingMs);
      } else {
        n.removeAttribute('title');
        const _badge = n.querySelector('.lockCountdown');
        if (_badge) _badge.remove();
      }
```

- [ ] **Step 2: Verify in browser**

Start a round. Wait until N/S/E/W is close to unlocking (use the debug "+5 min" to advance to the ~13-minute mark on a short game). Open the gameplay panel → N/S/E/W submenu. Confirm locked buttons show a small countdown (e.g. "02:14") that updates every 250ms. Confirm the countdown disappears when the button unlocks.

- [ ] **Step 3: Commit**

```bash
git add js/09_ui_helpers.js
git commit -m "ux: show remaining unlock countdown directly on time-locked tool buttons instead of title-only tooltip"
git push
```

---

## Task 6: Improve cost badge contrast

**Files:**
- Modify: `styles.css` — the `.heatCost` or heat cost badge selector

The amber heat cost badges currently use amber text on amber-900/30 background. In daylight this washes out. Use white text on a solid amber pill for legibility.

- [ ] **Step 1: Find the cost badge CSS**

Search `styles.css` for `heatCost` or `.cost` or look for `amber` near the tool cost badge rules. Also check `index.html` for inline styles on the cost badge `span` elements (search for `🔥` to find them).

- [ ] **Step 2: Identify whether styles are in CSS or inline in HTML**

If the cost badges use Tailwind classes like `text-amber-400 bg-amber-900/30`:
- Find all occurrences in `index.html` of cost badge elements (search for `data-cost-badge` or `🔥`)
- Replace `text-amber-400 bg-amber-900/30` with `text-white bg-amber-600` for stronger contrast

If they're in `styles.css`:
- Find the relevant class and change the text color to white and background to a solid amber.

- [ ] **Step 3: Verify on mobile viewport in bright conditions**

Use Chrome DevTools responsive mode. Confirm `🔥 0.5` style badges are clearly readable. Confirm the new colours still fit the dark-navy design system.

- [ ] **Step 4: Commit**

```bash
git add styles.css index.html
git commit -m "ux: improve cost badge contrast to white-on-solid-amber for daylight legibility"
git push
```

---

## Task 7: Add target location name to result modal + fix adjusted-distance placement

**Files:**
- Modify: `js/20_guess.js:396–436` — the `html` template literal in `lockInGuess`

The result modal shows distance and score but never names the target. The adjusted-distance note also renders in a hard-to-find position below the score breakdown.

- [ ] **Step 1: Read the result modal HTML template**

Find the `const html = \`` block in `js/20_guess.js` (around line 396). It builds the result hero, medal, grade label, breakdown, score, stats, and actions.

- [ ] **Step 2: Compute target name at the top of the scoring logic**

Find where `grade`, `score`, `rawD` etc. are computed (around line 180–250). Add a target name lookup:
```js
    const _targetName = (() => {
      try {
        const r = (typeof window.getRoundStateV1 === 'function') ? window.getRoundStateV1() : null;
        const tgt = (typeof getTarget === 'function') ? getTarget() : (window.target || null);
        // Prefer debug label (nearest POI name for pano targets)
        const label = (r && r.targetName) || (tgt && (tgt.debug_label || (tgt.debug_poi && tgt.debug_poi.name) || tgt.name)) || null;
        return label && String(label).trim() ? String(label).trim() : null;
      } catch(e) { return null; }
    })();
```

- [ ] **Step 3: Add target name to the result hero section**

In the `html` template literal, find the `resultFlavor` div:
```js
        <div class="resultFlavor" style="color:${gc}">${flavor}</div>
```
Add below it:
```js
        ${_targetName ? `<div class="muted" style="font-size:0.75rem;text-align:center;margin-top:2px;letter-spacing:.02em;">📍 ${_targetName}</div>` : ''}
```

- [ ] **Step 4: Move `adjLine` inside the distance stat card**

Find the `resultStats` section:
```js
        <div class="resultStats">
          <div class="resultStat">
            <div class="resultStatVal">${fmtMeters(rawD)}</div>
            <div class="resultStatLabel">Distance</div>
          </div>
```
Add `adjLine` inside the distance stat (as a secondary line under the value):
```js
        <div class="resultStats">
          <div class="resultStat">
            <div class="resultStatVal">${fmtMeters(rawD)}</div>
            ${adjLine}
            <div class="resultStatLabel">Distance</div>
          </div>
```
And remove `${adjLine}` from its current position (after `resultStats`, before `resultActions`).

- [ ] **Step 5: Update `adjLine` style to fit inside the stat card**

Find the `adjLine` definition (around line 305):
```js
    const adjLine = (useAdj && rawD != null && adjD != null && rawD !== adjD)
      ? `<div class="muted" style="font-size:0.7rem;text-align:center;margin-bottom:4px;">Adjusted ${fmtMeters(adjD)} · GPS ±${acc != null ? fmtMeters(acc) : '—'}</div>`
      : '';
```
Change `margin-bottom:4px` to `margin-top:2px;font-size:0.65rem;`:
```js
    const adjLine = (useAdj && rawD != null && adjD != null && rawD !== adjD)
      ? `<div class="muted" style="font-size:0.65rem;text-align:center;margin-top:2px;">adj. ${fmtMeters(adjD)} · ±${acc != null ? fmtMeters(acc) : '—'}</div>`
      : '';
```

Note: The result HTML is persisted to localStorage before the reveal delay. After making these changes, clear the existing `mapgame_result_html_v1` key in localStorage via DevTools to test the new layout on the next lock-in.

- [ ] **Step 6: Verify in browser**

Complete a round. Confirm the result modal shows "📍 [Target Name]" below the grade flavor text. Confirm the adjusted distance (when present) appears under the raw distance value in the Distance stat card. Confirm the layout looks good on 375px wide viewport.

- [ ] **Step 7: Commit**

```bash
git add js/20_guess.js
git commit -m "ux: add target name to result modal; move adjusted-distance note inside distance stat card"
git push
```

---

## Task 8: Rename "New Round" → "Setup New Round" and add thermometer start toast

**Files:**
- Modify: `js/20_guess.js:433` — result actions HTML
- Modify: `js/02_dom.js` — the thermometer tool handler

**Part A: Rename button**

- [ ] **Step 1: Find the result actions button**

In `js/20_guess.js`, find:
```js
          <button id="btnResultNewRound" class="primary" style="flex:1;">New Round</button>
```
Replace with:
```js
          <button id="btnResultNewRound" class="primary" style="flex:1;">Setup New Round</button>
```

**Part B: Thermometer start toast**

- [ ] **Step 2: Find the thermometer activation handler in `js/02_dom.js`**

Search for where `thermoRun` is set and the thermometer is activated (a `data-thermo` button handler, around line 700–800). After the thermometer run is initialised (when `thermoRun` is set), add a toast:
```js
          if (typeof showToast === 'function') {
            showToast(`Thermometer started — walk ${distM}m from here.`, true, { autoDismissMs: 3500 });
          }
```
Where `distM` is the radius chosen (already in scope in the handler). The toast should be auto-dismissing (3.5s) so it doesn't block the player from panning the map.

- [ ] **Step 3: Verify in browser**

Lock in a guess, see "Setup New Round" in the result. Tap it — confirm it opens the new game setup panel. Start a round, use the thermometer tool — confirm a toast appears saying "Thermometer started — walk Xm from here." and auto-dismisses after ~3.5s.

- [ ] **Step 4: Commit**

```bash
git add js/20_guess.js js/02_dom.js
git commit -m "ux: rename result modal 'New Round' button to 'Setup New Round'; add thermometer start toast"
git push
```

---

## Task 9: Add GPS failure badge on the recenter FAB

**Files:**
- Modify: `index.html` — the recenter FAB button
- Modify: `js/07_geolocation.js` — the GPS failure path
- Modify: `styles.css` — add badge style

When GPS position is absent or fails, nothing persists to indicate the problem after the toast is dismissed. A badge on the recenter button keeps it visible.

- [ ] **Step 1: Add a badge element to the recenter FAB in `index.html`**

Find the recenter button (search for `centerOnPlayer` or `btnRecenter`). Add a badge inside it:
```html
<button id="btnRecenter" ...>
  ⌖
  <span id="gpsFailBadge" class="hidden" style="position:absolute;top:-3px;right:-3px;width:10px;height:10px;border-radius:50%;background:#f87171;border:1.5px solid #040810;"></span>
</button>
```
Ensure the button has `position:relative` (add `relative` class if not already set).

- [ ] **Step 2: Expose a GPS state setter in `js/07_geolocation.js`**

Add at the bottom of `07_geolocation.js`:
```js
window.__setGpsFailBadge = function(visible) {
  try {
    const badge = document.getElementById('gpsFailBadge');
    if (badge) badge.classList.toggle('hidden', !visible);
  } catch(e) {}
};
```

- [ ] **Step 3: Call `__setGpsFailBadge(true)` on GPS failure**

In `07_geolocation.js`, find the GPS failure paths (where the "Couldn't get your location" toast is shown or the error is logged). After showing the error toast, call:
```js
  try { if (typeof window.__setGpsFailBadge === 'function') window.__setGpsFailBadge(true); } catch(e) {}
```

- [ ] **Step 4: Call `__setGpsFailBadge(false)` on GPS success**

In the success path (where `player` position is set from GPS), add:
```js
  try { if (typeof window.__setGpsFailBadge === 'function') window.__setGpsFailBadge(false); } catch(e) {}
```

- [ ] **Step 5: Verify in browser**

Test in a non-HTTPS environment (where `navigator.geolocation` is unavailable) or deny geolocation permission. Confirm a red dot appears on the recenter button. Once a manual position is set via debug mode, confirm the badge disappears.

- [ ] **Step 6: Commit**

```bash
git add index.html js/07_geolocation.js styles.css
git commit -m "ux: add GPS failure badge on recenter FAB to persist location-unavailable state after toast dismissal"
git push
```

---

## Task 10: Photo gallery strip in the gameplay panel

**Files:**
- Modify: `index.html` — add gallery strip inside `#panelGameplay`
- Modify: `js/02_dom.js` — populate the gallery strip when photos are added
- Modify: `styles.css` — gallery strip styles

The photo tool menu handles tool _actions_ (request glimpse, uncorrupt, horizon). This gallery is a separate read-only section showing all photos already collected this round. It appears at the top of the gameplay panel, below the drag handle and above the menu navigation. It's hidden when no photos exist.

- [ ] **Step 1: Add the gallery strip to `index.html`**

Find `#panelGameplay` in `index.html`. Inside the panel content, after the drag handle and panel header but before `#gameMenu`, add:
```html
<!-- Photo gallery strip: shows collected photos, hidden when empty -->
<div id="photoGalleryStrip" class="hidden px-3 pb-2 pt-1">
  <div class="flex items-center gap-1.5 mb-1.5">
    <span style="font-size:9px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:#4a627a;">Photos</span>
  </div>
  <div id="photoGalleryList" class="flex gap-2 overflow-x-auto pb-1" style="scrollbar-width:none;-webkit-overflow-scrolling:touch;"></div>
</div>
```

- [ ] **Step 2: Add gallery strip styles to `styles.css`**

Add:
```css
#photoGalleryStrip { border-bottom: 1px solid #172840; }
#photoGalleryList::-webkit-scrollbar { display: none; }
.photoGalleryThumb {
  flex-shrink: 0;
  width: 52px;
  height: 52px;
  border-radius: 8px;
  border: 1.5px solid #1e3a5f;
  object-fit: cover;
  cursor: pointer;
  transition: border-color 0.15s;
}
.photoGalleryThumb:active { border-color: #3b82f6; }
.photoGalleryThumb.is-corrupted { filter: saturate(0.4) contrast(1.2); }
```

- [ ] **Step 3: Add `window.__refreshPhotoGalleryStrip` in `js/02_dom.js`**

Add this function before `bindUI`:
```js
function __refreshPhotoGalleryStrip() {
  const strip = document.getElementById('photoGalleryStrip');
  const list  = document.getElementById('photoGalleryList');
  if (!strip || !list) return;

  const photos = (() => {
    try {
      const r = (typeof window.getRoundStateV1 === 'function') ? window.getRoundStateV1() : null;
      return (r && Array.isArray(r.photos)) ? r.photos : [];
    } catch(e) { return []; }
  })();

  if (!photos.length) {
    strip.classList.add('hidden');
    list.innerHTML = '';
    return;
  }

  strip.classList.remove('hidden');

  // Rebuild thumbnails — only add new ones to avoid flash
  const existingKeys = new Set(Array.from(list.querySelectorAll('[data-photo-key]')).map(el => el.dataset.photoKey));
  for (const photo of photos) {
    const key = photo.context || photo.kind || String(photo.ts || '');
    if (!key || existingKeys.has(key)) continue;

    const thumb = document.createElement('img');
    thumb.className = 'photoGalleryThumb';
    thumb.dataset.photoKey = key;
    thumb.src = photo.url || '';
    thumb.alt = photo.kind || 'Photo';
    thumb.title = photo.kind || 'Photo';

    const isCorrupted = !(typeof window.__arePhotosUncorrupted === 'function' && window.__arePhotosUncorrupted());
    if (isCorrupted && photo.kind !== 'snapshot') {
      thumb.classList.add('is-corrupted');
    }

    thumb.addEventListener('click', () => {
      try {
        if (typeof window.showPhotoInModal === 'function') {
          window.showPhotoInModal(photo.url, photo.kind || 'Photo', photo.sourceUrl || null);
        }
      } catch(e) {}
    });

    list.appendChild(thumb);
  }
}
window.__refreshPhotoGalleryStrip = __refreshPhotoGalleryStrip;
```

- [ ] **Step 4: Call `__refreshPhotoGalleryStrip` after a photo is added**

Search `js/18_streetview_glimpse.js` for where `roundStateV1.photos.push` or `window.__onStreetViewPhotoCaptured` is called. After the photo is pushed/captured, add:
```js
  try { if (typeof window.__refreshPhotoGalleryStrip === 'function') window.__refreshPhotoGalleryStrip(); } catch(e) {}
```

Also call it in the boot restore path — in `js/13_boot.js` after `roundStateV1` is restored:
```js
  try { if (typeof window.__refreshPhotoGalleryStrip === 'function') window.__refreshPhotoGalleryStrip(); } catch(e) {}
```
(Add this after the `roundStateV1 = Object.assign(...)` block around line 60.)

- [ ] **Step 5: Expose `showPhotoInModal` if not already exposed**

In `js/18_streetview_glimpse.js`, search for the function that opens the photo modal with a URL (it may be called `openPhotoModal`, `showPhoto`, or similar). Expose it as `window.showPhotoInModal`:
```js
window.showPhotoInModal = function(url, title, sourceUrl) {
  // reuse existing openPhotoModal / setPhoto logic
  // populate #photoModalTitle, #photoModalBody, open #photoModal
};
```
If a suitable function already exists and is already exposed, skip this step and update the `click` listener in Step 3 to call the correct existing function name.

- [ ] **Step 6: Clear gallery on new round**

In the new game / round reset path (wherever `clearUsedToolOptionsThisRound` or `clearCurses` is called), add:
```js
  try {
    const list = document.getElementById('photoGalleryList');
    if (list) list.innerHTML = '';
    const strip = document.getElementById('photoGalleryStrip');
    if (strip) strip.classList.add('hidden');
  } catch(e) {}
```

- [ ] **Step 7: Verify in browser**

Start a round. View the starter photo (from the tool menu). Confirm it appears in the gallery strip at the top of the gameplay panel. Use a "near100" glimpse — confirm a second thumbnail appears. Tap a thumbnail — confirm the photo modal opens. Start a new round — confirm the gallery strip is empty/hidden.

On a 375px viewport, confirm the strip doesn't collapse the panel too much. Confirm the thumbnails scroll horizontally if more than ~5 photos are collected.

- [ ] **Step 8: Commit**

```bash
git add index.html js/02_dom.js js/18_streetview_glimpse.js js/13_boot.js styles.css
git commit -m "feat: add photo gallery strip to gameplay panel showing all collected photos as tappable thumbnails"
git push
```
