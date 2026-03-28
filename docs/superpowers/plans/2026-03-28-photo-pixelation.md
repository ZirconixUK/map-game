# Photo Pixelation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the CSS-only blur obscuring on Street View photos with a canvas mosaic (pixelation) step so that identifying detail (text, signs, facade features) is illegible while broad shapes and colour survive.

**Architecture:** An async `pixelateImage(dataUrl, cellSize)` function is added to `js/18_streetview_glimpse.js`. It draws the fetched image onto an offscreen canvas, scales down to a coarse grid, scales back up with smoothing disabled, and returns a new dataURL. This pixelated URL replaces the original in the `setPhoto()` call. The original URL is still kept in `__cachedImgUrl` so the uncorrupt tool can reveal the clean photo. CSS blur is reduced since the canvas step now handles primary obscuring.

**Tech Stack:** Vanilla JS (canvas 2D API), CSS custom properties. No build step. No external libraries.

---

## Files

- Modify: `js/00_config.js` — add `STREETVIEW_CORRUPTION_CELL_SIZE` constant
- Modify: `styles.css` — reduce `--blur` on `.photo-glimpse-frame`
- Modify: `js/18_streetview_glimpse.js` — add `pixelateImage()`, wire into fresh-load and cache-hit-fallback paths

---

### Task 1: Add config constant

**Files:**
- Modify: `js/00_config.js` (lines 99–103)

- [ ] **Step 1: Open `js/00_config.js` and locate the corruption config block (around line 99)**

It currently reads:
```js
// Visual "corruption" overlay for the snapshot (CSS-only, no pixel access).
// 0..1 (higher = more glitch blocks)
const STREETVIEW_CORRUPTION_ENABLED = true;
const STREETVIEW_CORRUPTION_INTENSITY_SNAPSHOT = 0.85;
const STREETVIEW_CORRUPTION_INTENSITY_GLIMPSE = 0.60;
```

- [ ] **Step 2: Replace that block with:**

```js
// Visual "corruption" — canvas mosaic + CSS glitch overlay.
// CELL_SIZE: mosaic grid size in px (higher = chunkier, more obscuring). 16 is the baseline.
// 0..1 intensity controls CSS glitch blocks (higher = more glitch blocks).
const STREETVIEW_CORRUPTION_ENABLED = true;
const STREETVIEW_CORRUPTION_CELL_SIZE = 16;
const STREETVIEW_CORRUPTION_INTENSITY_SNAPSHOT = 0.85;
const STREETVIEW_CORRUPTION_INTENSITY_GLIMPSE = 0.60;
```

- [ ] **Step 3: Verify file saves without syntax errors**

Open `js/00_config.js` in the browser (or just check the diff). No JS needed — it's a constant declaration.

- [ ] **Step 4: Commit**

```bash
git add js/00_config.js
git commit -m "config: add STREETVIEW_CORRUPTION_CELL_SIZE for canvas mosaic"
```

---

### Task 2: Reduce CSS blur

The canvas mosaic now does the heavy lifting. Reduce blur so it doesn't double-stack on top of an already-degraded image (which just looks muddy rather than glitchy).

**Files:**
- Modify: `styles.css` (lines 410–412)

- [ ] **Step 1: Open `styles.css` and locate the `.photo-glimpse-frame` rules (around line 407)**

They currently read:
```css
.photo-glimpse-frame{
  width:100%; aspect-ratio:1/1; overflow:hidden; border-radius:12px;
  background:rgba(0,0,0,.08); position:relative;
  --blur:3.6px; --zoom:1.28; --sat:1.12; --con:1.06;
}
.photo-glimpse-frame.is-snapshot{ --blur:3.8px; --zoom:1.36; }
```

- [ ] **Step 2: Change both `--blur` values to `2.0px`:**

```css
.photo-glimpse-frame{
  width:100%; aspect-ratio:1/1; overflow:hidden; border-radius:12px;
  background:rgba(0,0,0,.08); position:relative;
  --blur:2.0px; --zoom:1.28; --sat:1.12; --con:1.06;
}
.photo-glimpse-frame.is-snapshot{ --blur:2.0px; --zoom:1.36; }
```

- [ ] **Step 3: Commit**

```bash
git add styles.css
git commit -m "style: reduce photo blur now that canvas mosaic handles primary obscuring"
```

---

### Task 3: Add `pixelateImage()` function

This function takes a dataURL, draws it to an offscreen canvas at tiny size (mosaic grid), then scales back up with `imageSmoothingEnabled = false` to get hard block edges.

**Files:**
- Modify: `js/18_streetview_glimpse.js` — insert after the `clearCache()` function (around line 27)

- [ ] **Step 1: Open `js/18_streetview_glimpse.js` and find the end of `clearCache()` (around line 27)**

It ends with:
```js
    try { if (__cachedTargetKey) { localStorage.removeItem(...) ... } } catch(e) {}
    try { if (typeof window.updateCostBadgesFromConfig === 'function') window.updateCostBadgesFromConfig(); } catch(e) {}
  }
```

There are two blank lines after it (lines 28–29).

- [ ] **Step 2: Insert `pixelateImage` after those blank lines, before the next function:**

```js
  // Canvas mosaic: scales image down to a coarse grid then back up with no smoothing.
  // Returns a Promise<dataURL>. Falls back to the original dataUrl on any error.
  function pixelateImage(dataUrl, cellSize) {
    return new Promise(function(resolve) {
      var cs = (typeof cellSize === 'number' && cellSize > 0) ? Math.round(cellSize) : 16;
      var img = new Image();
      img.onload = function() {
        try {
          var w = img.naturalWidth  || img.width  || 640;
          var h = img.naturalHeight || img.height || 640;
          cs = Math.max(2, Math.min(w, Math.min(h, cs)));
          var sw = Math.max(1, Math.floor(w / cs));
          var sh = Math.max(1, Math.floor(h / cs));
          var canvas = document.createElement('canvas');
          canvas.width  = w;
          canvas.height = h;
          var ctx = canvas.getContext('2d');
          // Draw tiny
          ctx.drawImage(img, 0, 0, sw, sh);
          // Scale back up with nearest-neighbour (no smoothing → hard mosaic blocks)
          ctx.imageSmoothingEnabled = false;
          ctx.drawImage(canvas, 0, 0, sw, sh, 0, 0, w, h);
          resolve(canvas.toDataURL('image/jpeg', 0.88));
        } catch(e) {
          resolve(dataUrl); // fallback: show original on canvas error
        }
      };
      img.onerror = function() { resolve(dataUrl); }; // fallback: cross-origin or load failure
      img.src = dataUrl;
    });
  }
```

- [ ] **Step 3: Verify the function is inside the IIFE**

The file is wrapped in `(function(){ ... })();`. The new function must be inside that wrapper. Double-check that the insertion is after `clearCache()` and before `function setError(` or similar — not outside the `})();`.

- [ ] **Step 4: Commit**

```bash
git add js/18_streetview_glimpse.js
git commit -m "feat: add pixelateImage() canvas mosaic helper"
```

---

### Task 4: Wire pixelation into the fresh-load pipeline

After `dataUrl` is resolved (either from localStorage cache or fresh fetch), pixelate it before passing to `setPhoto`. Keep the original `dataUrl` in `__cachedImgUrl` so the uncorrupt tool can still reveal the clean photo.

**Files:**
- Modify: `js/18_streetview_glimpse.js` (around lines 388–420)

- [ ] **Step 1: Locate the block that resolves `dataUrl` and calls `setPhoto` (around line 388)**

It currently reads:
```js
    let dataUrl = persisted;
    if (!dataUrl) {
      try {
        dataUrl = await __fetchAsDataUrl(built.url);
        __saveCachedDataUrl(k, context, dataUrl);
      } catch (e) {
        // Fallback to direct URL if fetch fails
        dataUrl = built.url;
      }
    }

    setPhoto(dataUrl, tip, context);
```

- [ ] **Step 2: Replace with (adds pixelation between fetch and display):**

```js
    let dataUrl = persisted;
    if (!dataUrl) {
      try {
        dataUrl = await __fetchAsDataUrl(built.url);
        __saveCachedDataUrl(k, context, dataUrl);
      } catch (e) {
        // Fallback to direct URL if fetch fails
        dataUrl = built.url;
      }
    }

    // Pixelate before display (unless uncorrupted). Keep original dataUrl in __cachedImgUrl
    // so the uncorrupt tool can still reveal the clean image.
    let displayUrl = dataUrl;
    try {
      const __uncPx = (typeof window.__arePhotosUncorrupted === 'function') ? !!window.__arePhotosUncorrupted() : false;
      if (!__uncPx) {
        const cellSize = (typeof STREETVIEW_CORRUPTION_CELL_SIZE !== 'undefined') ? STREETVIEW_CORRUPTION_CELL_SIZE : 16;
        displayUrl = await pixelateImage(dataUrl, cellSize);
      }
    } catch(e) {}

    setPhoto(displayUrl, tip, context);
```

- [ ] **Step 3: Verify `__cachedImgUrl` is still assigned the original `dataUrl` (not `displayUrl`)**

Later in the same function (around line 445) you will see:
```js
    __cachedImgUrl = dataUrl;
```
This must stay as `dataUrl`, not `displayUrl`. Confirm it is unchanged. If it reads `displayUrl`, change it back to `dataUrl`.

- [ ] **Step 4: Load the game in a browser and open the snapshot**

Expected: the photo is visibly pixelated/mosaic. CSS glitch animations still run on top. Photo is not a smooth blur — you should see clear square blocks of colour.

- [ ] **Step 5: Commit**

```bash
git add js/18_streetview_glimpse.js
git commit -m "feat: pixelate Street View photos before display"
```

---

### Task 5: Wire pixelation into the cache-hit fallback path

When the photo is re-opened within the same round, the code takes a fast path. If `__cachedHtml` is available it reuses the already-rendered (already pixelated) HTML. But there is a fallback branch that calls `setPhoto(__cachedImgUrl, ...)` directly — this would show the original un-pixelated image. Fix it.

**Files:**
- Modify: `js/18_streetview_glimpse.js` (around lines 307–315)

- [ ] **Step 1: Locate the cache-hit fallback branch (around line 309)**

It currently reads:
```js
      } else {
        // Fallback: no cached HTML, just re-render from cached image URL.
        const tip = (context === 'snapshot')
          ? "This is the Circle's snapshot. Your job is to find the street location where it was taken."
          : 'Tip: treat this like a quick glance — look for obvious anchors, not the exact address.';
        setPhoto(__cachedImgUrl, tip, context);
      }
```

- [ ] **Step 2: Replace with (pixelates before re-rendering from cache):**

```js
      } else {
        // Fallback: no cached HTML, just re-render from cached image URL.
        const tip = (context === 'snapshot')
          ? "This is the Circle's snapshot. Your job is to find the street location where it was taken."
          : 'Tip: treat this like a quick glance — look for obvious anchors, not the exact address.';
        let fallbackDisplayUrl = __cachedImgUrl;
        try {
          const __uncFb = (typeof window.__arePhotosUncorrupted === 'function') ? !!window.__arePhotosUncorrupted() : false;
          if (!__uncFb && __cachedImgUrl) {
            const cellSize = (typeof STREETVIEW_CORRUPTION_CELL_SIZE !== 'undefined') ? STREETVIEW_CORRUPTION_CELL_SIZE : 16;
            fallbackDisplayUrl = await pixelateImage(__cachedImgUrl, cellSize);
          }
        } catch(e) {}
        setPhoto(fallbackDisplayUrl, tip, context);
      }
```

- [ ] **Step 3: Verify the uncorrupt cache-hit path is untouched**

The branch just above (around line 296) reads:
```js
      if (__unc && __cachedImgUrl) {
        ...
        setPhoto(__cachedImgUrl, tip, context);
```
This must stay as `__cachedImgUrl` (original). Confirm it is unchanged.

- [ ] **Step 4: Commit**

```bash
git add js/18_streetview_glimpse.js
git commit -m "fix: pixelate photo in cache-hit fallback re-render path"
```

---

### Task 6: Manual regression check

No automated test framework exists in this codebase. Verify the feature and key invariants manually in a browser.

- [ ] **Step 1: Start a new round. Open the Circle Snapshot.**

Expected:
- Photo is visibly pixelated — clear mosaic blocks, not smooth blur.
- CSS glitch overlays (RGB split, animated slices, flickering blocks) still animate on top.
- Photo is not totally black or broken.

- [ ] **Step 2: Close and reopen the snapshot (same round, no tool cost).**

Expected:
- Same pixelated image reappears. The re-open path serves `__cachedHtml` — the image should look identical to step 1.

- [ ] **Step 3: Use the "Uncorrupt" tool, then reopen the snapshot.**

Expected:
- Clean, full-resolution photo with no pixelation and no CSS glitch overlays.
- This confirms `__cachedImgUrl` was kept as the original (un-pixelated) URL.

- [ ] **Step 4: Start a new round. Verify the new round gets a fresh pixelated image.**

Expected:
- The new round's photo is pixelated. No residual corruption from the previous round.

- [ ] **Step 5: Open the Photo Glimpse tool (if available in your test round).**

Expected:
- Glimpse photo is also pixelated (same pipeline, slightly lower CSS intensity than snapshot).

- [ ] **Step 6: Push**

```bash
git push
```
