# Medal / Tier Badge Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the generic ribbon+circle tier badge SVG with distinct, tier-specific shapes (triangle/disc/shield/star/hexagon/emerald-cut/faceted-diamond), keeping the flanking context effect and adding a glow pulse animation on the earned badge.

**Architecture:** All changes are in `js/20_guess.js` (SVG shape logic) and `styles.css` (glow keyframes + minor selector fixes). A new `_tierShape(label, color, w, h)` function replaces `_flankMedal`. The glow animation uses a CSS custom property (`--glow-color`) set inline so two shared `@keyframes` cover all tiers.

**Tech Stack:** Vanilla JS, inline SVG, CSS animations (`filter: drop-shadow`, `@keyframes`).

---

## File Map

| File | Change |
|---|---|
| `js/20_guess.js` | Replace `_flankMedal` with `_tierShape`; update flank calls; replace main badge SVG; add glow wrapper div |
| `styles.css` | Add `@keyframes tierGlowLow` and `tierGlowHigh`; add `.resultMedalGlowWrap`; update `.resultMedalSvg` size; fix `.resultMedalScene > svg` selector |

---

## Task 1: Add CSS keyframes and glow wrapper rule

**Files:**
- Modify: `styles.css` (around line 721 — the `.resultMedalScene` block)

- [ ] **Step 1: Open `styles.css` and find the `.resultMedalScene` block (line ~721)**

It currently reads:
```css
.resultMedalScene { position:relative; width:80px; height:92px; }
.resultMedalScene > svg { position:relative; z-index:3; display:block; }
.resultFlankMedal { position:absolute; bottom:0; }
.resultFlankMedal svg { display:block; }
```

- [ ] **Step 2: Replace that block with the following**

```css
.resultMedalScene { position:relative; width:80px; height:92px; }
.resultMedalGlowWrap { display:inline-block; position:relative; z-index:3; }
.resultMedalGlowWrap svg { display:block; }
.resultFlankMedal { position:absolute; bottom:0; }
.resultFlankMedal svg { display:block; width:100%; height:100%; }

@keyframes tierGlowLow {
  0%   { filter: drop-shadow(0 0 3px var(--glow-color)); }
  50%  { filter: drop-shadow(0 0 12px var(--glow-color)); }
  100% { filter: drop-shadow(0 0 5px var(--glow-color)); }
}
@keyframes tierGlowHigh {
  0%   { filter: drop-shadow(0 0 4px var(--glow-color)); }
  50%  { filter: drop-shadow(0 0 22px var(--glow-color)); }
  100% { filter: drop-shadow(0 0 7px var(--glow-color)); }
}
@media (prefers-reduced-motion:reduce) {
  .resultMedalGlowWrap { animation:none !important; }
}
```

Also find and update:
```css
.resultMedalSvg{ width:80px; height:92px; }
```
Change to:
```css
.resultMedalSvg{ width:80px; height:80px; }
```

- [ ] **Step 3: Verify the file saved correctly**

Open `styles.css` and confirm:
- `.resultMedalGlowWrap` is defined
- `@keyframes tierGlowLow` and `@keyframes tierGlowHigh` are present
- `.resultMedalScene > svg` selector is gone (replaced by `.resultMedalGlowWrap svg`)

- [ ] **Step 4: Commit**

```bash
git add styles.css
git commit -m "feat: add tier glow keyframes and medal scene CSS for redesign"
```

---

## Task 2: Add `_tierShape` function to `js/20_guess.js`

**Files:**
- Modify: `js/20_guess.js` (around line 318 — the `_flankMedal` function)

- [ ] **Step 1: Locate the `_flankMedal` function in `js/20_guess.js` (line ~318)**

It currently reads:
```js
function _flankMedal(color, side, rank) {
  return `<div class="resultFlankMedal ${side} rank-${rank}">` +
    `<svg viewBox="0 0 80 92" fill="none" xmlns="http://www.w3.org/2000/svg">` +
    `<rect x="28" y="2" width="24" height="20" rx="4" fill="${color}" opacity="0.85"/>` +
    `<rect x="36" y="18" width="8" height="8" fill="${color}" opacity="0.7"/>` +
    `<circle cx="40" cy="62" r="28" fill="${color}"/>` +
    `<circle cx="40" cy="62" r="21" fill="none" stroke="white" stroke-width="2.5" stroke-opacity="0.2"/>` +
    `</svg></div>`;
}
```

- [ ] **Step 2: Replace `_flankMedal` with `_tierShape` and update it**

Replace the entire `_flankMedal` function with:

```js
function _tierShape(label, color, w, h) {
  const sizeAttrs = w ? `width="${w}" height="${h || w}"` : `width="100%" height="100%"`;
  const shapes = {
    Copper: {
      vb: '0 0 64 64',
      paths: `<polygon points="32,56 6,12 58,12" fill="${color}" opacity="0.9"/>` +
             `<polygon points="32,48 14,18 50,18" fill="none" stroke="white" stroke-width="1.5" stroke-opacity="0.2"/>`,
    },
    Bronze: {
      vb: '0 0 64 64',
      paths: `<circle cx="32" cy="32" r="28" fill="${color}" opacity="0.9"/>` +
             `<circle cx="32" cy="32" r="20" fill="none" stroke="white" stroke-width="1.5" stroke-opacity="0.2"/>` +
             `<circle cx="32" cy="32" r="11" fill="none" stroke="white" stroke-width="1" stroke-opacity="0.15"/>`,
    },
    Silver: {
      vb: '0 0 64 64',
      paths: `<path d="M32 6 L56 14 L56 32 Q56 50 32 60 Q8 50 8 32 L8 14 Z" fill="${color}" opacity="0.9"/>` +
             `<path d="M32 13 L49 19 L49 32 Q49 46 32 54 Q15 46 15 32 L15 19 Z" fill="none" stroke="white" stroke-width="1.5" stroke-opacity="0.2"/>`,
    },
    Gold: {
      vb: '0 0 64 64',
      paths: `<polygon points="32,4 38,24 58,24 42,36 48,56 32,44 16,56 22,36 6,24 26,24" fill="${color}" opacity="0.9"/>` +
             `<polygon points="32,12 36,26 50,26 39,34 43,48 32,40 21,48 25,34 14,26 28,26" fill="none" stroke="white" stroke-width="1.2" stroke-opacity="0.2"/>`,
    },
    Platinum: {
      vb: '0 0 64 64',
      paths: `<polygon points="32,4 54,17 54,47 32,60 10,47 10,17" fill="${color}" opacity="0.9"/>` +
             `<polygon points="32,12 46,20 46,44 32,52 18,44 18,20" fill="none" stroke="white" stroke-width="1.5" stroke-opacity="0.25"/>` +
             `<line x1="32" y1="4" x2="32" y2="60" stroke="white" stroke-width="0.8" stroke-opacity="0.12"/>` +
             `<line x1="10" y1="17" x2="54" y2="47" stroke="white" stroke-width="0.8" stroke-opacity="0.12"/>` +
             `<line x1="54" y1="17" x2="10" y2="47" stroke="white" stroke-width="0.8" stroke-opacity="0.12"/>`,
    },
    Emerald: {
      vb: '0 0 64 72',
      paths: `<polygon points="16,6 48,6 60,18 60,54 48,66 16,66 4,54 4,18" fill="${color}" opacity="0.9"/>` +
             `<polygon points="20,12 44,12 54,22 54,50 44,60 20,60 10,50 10,22" fill="none" stroke="white" stroke-width="1.5" stroke-opacity="0.2"/>` +
             `<polygon points="24,20 40,20 46,26 46,46 40,52 24,52 18,46 18,26" fill="none" stroke="white" stroke-width="1" stroke-opacity="0.15"/>`,
    },
    Diamond: {
      vb: '0 0 64 70',
      paths: `<polygon points="8,26 20,6 44,6 56,26" fill="${color}" opacity="0.95"/>` +
             `<polygon points="8,26 56,26 32,66" fill="#7dd3fc" opacity="0.9"/>` +
             `<line x1="8" y1="26" x2="32" y2="66" stroke="white" stroke-width="1" stroke-opacity="0.3"/>` +
             `<line x1="56" y1="26" x2="32" y2="66" stroke="white" stroke-width="1" stroke-opacity="0.3"/>` +
             `<line x1="8" y1="26" x2="56" y2="26" stroke="white" stroke-width="1" stroke-opacity="0.35"/>` +
             `<line x1="20" y1="6" x2="32" y2="26" stroke="white" stroke-width="0.8" stroke-opacity="0.25"/>` +
             `<line x1="44" y1="6" x2="32" y2="26" stroke="white" stroke-width="0.8" stroke-opacity="0.25"/>` +
             `<line x1="20" y1="6" x2="8" y2="26" stroke="white" stroke-width="0.8" stroke-opacity="0.2"/>` +
             `<line x1="44" y1="6" x2="56" y2="26" stroke="white" stroke-width="0.8" stroke-opacity="0.2"/>` +
             `<line x1="32" y1="26" x2="32" y2="66" stroke="white" stroke-width="0.6" stroke-opacity="0.2"/>`,
    },
  };
  const s = shapes[label] || shapes.Bronze;
  return `<svg ${sizeAttrs} viewBox="${s.vb}" fill="none" xmlns="http://www.w3.org/2000/svg">${s.paths}</svg>`;
}
function _flankMedal(label, color, side, rank) {
  return `<div class="resultFlankMedal ${side} rank-${rank}">` +
    _tierShape(label, color) +
    `</div>`;
}
```

- [ ] **Step 3: Update the two flank-generation lines (line ~328)**

Find:
```js
const _leftHtml = _gradeOrder.slice(Math.max(0, _earnedIdx - 2), _earnedIdx)
  .map((g, i, arr) => _flankMedal(g.color, 'left', arr.length - i)).join('');
const _rightHtml = _gradeOrder.slice(_earnedIdx + 1, Math.min(_gradeOrder.length, _earnedIdx + 3))
  .map((g, i) => _flankMedal(g.color, 'right', i + 1)).join('');
```

Replace with:
```js
const _leftHtml = _gradeOrder.slice(Math.max(0, _earnedIdx - 2), _earnedIdx)
  .map((g, i, arr) => _flankMedal(g.label, g.color, 'left', arr.length - i)).join('');
const _rightHtml = _gradeOrder.slice(_earnedIdx + 1, Math.min(_gradeOrder.length, _earnedIdx + 3))
  .map((g, i) => _flankMedal(g.label, g.color, 'right', i + 1)).join('');
```

- [ ] **Step 4: Commit**

```bash
git add js/20_guess.js
git commit -m "feat: add _tierShape function with per-tier SVG shapes"
```

---

## Task 3: Replace the main earned badge SVG with `_tierShape` + glow wrapper

**Files:**
- Modify: `js/20_guess.js` (around line 345 — the `html` template literal)

- [ ] **Step 1: Find the main badge SVG in the `html` template literal (line ~344)**

It currently reads:
```js
const html = `
  <div class="resultHero">
    <div class="resultGradeBadge">
      <div class="resultMedalScene">
        ${_leftHtml}
        <svg class="resultMedalSvg" viewBox="0 0 80 92" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="28" y="2" width="24" height="20" rx="4" fill="${gc}" opacity="0.85"/>
          <rect x="36" y="18" width="8" height="8" fill="${gc}" opacity="0.7"/>
          <circle cx="40" cy="62" r="28" fill="${gc}"/>
          <circle cx="40" cy="62" r="21" fill="none" stroke="white" stroke-width="2.5" stroke-opacity="0.2"/>
        </svg>
        ${_rightHtml}
      </div>
```

- [ ] **Step 2: Add the glow animation variable just before the `html` template (between the `_rightHtml` line and the `const _bd` line)**

Insert after line 331 (the `_rightHtml` line):
```js
const _glowAnim = ['Platinum','Emerald','Diamond'].includes(grade) ? 'tierGlowHigh' : 'tierGlowLow';
```

- [ ] **Step 3: Replace the hardcoded main badge SVG with the glow wrapper**

Replace:
```js
        <svg class="resultMedalSvg" viewBox="0 0 80 92" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="28" y="2" width="24" height="20" rx="4" fill="${gc}" opacity="0.85"/>
          <rect x="36" y="18" width="8" height="8" fill="${gc}" opacity="0.7"/>
          <circle cx="40" cy="62" r="28" fill="${gc}"/>
          <circle cx="40" cy="62" r="21" fill="none" stroke="white" stroke-width="2.5" stroke-opacity="0.2"/>
        </svg>
```

With:
```js
        <div class="resultMedalGlowWrap" style="--glow-color:${gc};animation:${_glowAnim} 1.8s ease-in-out 0.2s 2 forwards;">
          ${_tierShape(grade, gc, 80, 80)}
        </div>
```

- [ ] **Step 4: Verify the full `html` block around the scene now looks like this**

```js
const html = `
  <div class="resultHero">
    <div class="resultGradeBadge">
      <div class="resultMedalScene">
        ${_leftHtml}
        <div class="resultMedalGlowWrap" style="--glow-color:${gc};animation:${_glowAnim} 1.8s ease-in-out 0.2s 2 forwards;">
          ${_tierShape(grade, gc, 80, 80)}
        </div>
        ${_rightHtml}
      </div>
      <div class="resultGradeLabel" style="color:${gc}">${grade}</div>
    </div>
    <div class="resultFlavor" style="color:${gc}">${flavor}</div>
    ...
```

- [ ] **Step 5: Commit**

```bash
git add js/20_guess.js
git commit -m "feat: replace earned badge SVG with tier-specific shape and glow animation"
```

---

## Task 4: Smoke-test in the browser

**No code changes — verification only.**

- [ ] **Step 1: Open the game in a browser**

Open `index.html` locally (any static file server or `open index.html` on macOS). Start a round. Submit a guess to trigger the result modal.

- [ ] **Step 2: Verify the earned badge**

- The badge is a recognisable shape (not the old circle+ribbon)
- The correct shape appears for the grade earned (e.g. if you get Gold, you see a star)
- A glow pulse plays once or twice on reveal
- The label and flavour text appear below as before

- [ ] **Step 3: Verify the flanking context**

- The two ghosted neighbours each side show their own shape (not the old circle)
- They fade out correctly (inner neighbour brighter, outer dimmer)
- On mobile (or DevTools mobile emulation): touch the modal, confirm it scrolls / dismisses normally

- [ ] **Step 4: Verify `prefers-reduced-motion`**

In DevTools → Rendering → "Emulate CSS media feature `prefers-reduced-motion: reduce`". Confirm the glow animation does not play (badge is static).

- [ ] **Step 5: Check localStorage restore**

After a round result appears, hard-refresh the page. Confirm the result modal re-opens from localStorage and still shows the correct shape + label.

- [ ] **Step 6: Commit if no issues found**

```bash
git add -p   # confirm no unintended changes
git commit -m "chore: smoke-test medal redesign — all tiers verified"
```

If issues found: fix them, re-run steps 1–5, then commit.

---

## Task 5: Push

- [ ] **Step 1: Push to remote**

```bash
git push
```
