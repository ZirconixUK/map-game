# FAB Consolidation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce the map screen from 8 FABs to 5 by moving Debug/Info into the System panel, moving Gameplay to the left column, merging Curses into a new Heat panel, and adding a purple miasma effect to the Heat FAB when curses are active.

**Architecture:** All changes are confined to `index.html`, `styles.css`, `js/09_ui_helpers.js`, `js/14_panels_misc.js`, and one line in `js/20_guess.js`. No gameplay logic is touched. The existing `#panelCurses` is replaced wholesale by a new `#panelHeat`; the curse list DOM nodes (`#cursesEmpty`, `#cursesList`) are simply moved into it.

**Tech Stack:** Vanilla JS, Tailwind utility classes (inline in HTML), custom CSS in `styles.css`.

---

## File Map

| File | What changes |
|------|-------------|
| `index.html` | FAB HTML, System panel body, remove `#panelInfo`, remove `#panelCurses`, add `#panelHeat` |
| `styles.css` | Remove dead stack4/5 rules, add heat FAB miasma, retarget panel miasma from `.panel--curses` to `#panelHeat` |
| `js/14_panels_misc.js` | Replace all `panelCurses`/`btnCurses`/`panelInfo`/`btnInfo`/`btnDebug` wiring with `panelHeat`/`heatWidget`; add Dev Tools button handler |
| `js/09_ui_helpers.js` | `updateCursesButton` retargeted to `#heatWidget`; `updateCursesPanel` retargeted to `#panelHeat`; heat row DOM update added to `updateHUD` |
| `js/20_guess.js` | `startNewRound` closes `#panelHeat` on reset |

---

## Task 1: Rearrange and remove FABs in `index.html`

**Files:**
- Modify: `index.html:186-205` (right FABs block)
- Modify: `index.html:191-194` (left FABs block)
- Modify: `index.html:575-576` (debug FAB)

- [ ] **Step 1: Update the right FABs block (lines 187–205)**

Replace the entire FABs block with the new 3-FAB right column and 2-FAB left column. Find this block:

```html
    <!-- FABs (top-right) -->
    <button id="btnRecenter"  class="fab fab--right rounded-2xl bg-[#111827] border border-[#1e3a5f] shadow-fab text-cyan-400 text-xl grid place-items-center hover:bg-[#1a2744] transition-colors" aria-label="Center on me" title="Center on me">⌖<span id="gpsFailBadge" class="hidden" style="position:absolute;top:-3px;right:-3px;width:10px;height:10px;border-radius:50%;background:#f87171;border:1.5px solid #040810;"></span></button>
    <button id="btnGameplay"  class="fab fab--right fab--stack2 rounded-2xl bg-blue-600 border border-blue-500 shadow-fab text-white text-lg grid place-items-center hover:bg-blue-500 transition-colors" aria-label="Show/hide gameplay" title="Show/hide gameplay">☰</button>
    <button id="btnCurses"    class="fab fab--right fab--stack4 fab--curse rounded-2xl bg-[#2d1a4a] border border-[#4a2d7a] shadow-fab grid place-items-center hover:bg-[#3d2560] transition-colors" aria-label="Curses" title="Curses">☠</button>

    <!-- System FAB -->
    <button id="btnSystem" class="fab fab--left fab--stack2 rounded-2xl bg-[#111827] border border-[#1e3a5f] shadow-fab text-amber-400 text-xl grid place-items-center hover:bg-[#1a2744] transition-colors" aria-label="System" title="System">⌂</button>
    <!-- Info FAB -->
    <button id="btnInfo" class="fab fab--left fab--stack3 rounded-2xl bg-[#111827] border border-[#1e3a5f] shadow-fab text-slate-300 text-xl grid place-items-center hover:bg-[#1a2744] transition-colors" aria-label="How to play" title="How to play">ⓘ</button>

    <!-- Heat widget -->
    <button id="heatWidget" class="fab fab--right fab--stack5 rounded-2xl bg-[#111827] border border-[#1e3a5f] shadow-fab grid place-items-center transition-colors" aria-label="Heat" title="Heat">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="currentColor" aria-hidden="true"><path d="M13.5 0.67s.74 2.65.74 4.8c0 2.06-1.35 3.73-3.41 3.73-2.07 0-3.63-1.67-3.63-3.73l.03-.36C5.21 7.51 4 10.62 4 14c0 4.42 3.58 8 8 8s8-3.58 8-8C20 8.61 17.41 3.8 13.5 0.67zM11.71 19c-1.78 0-3.22-1.4-3.22-3.14 0-1.62 1.05-2.76 2.81-3.12 1.77-.36 3.6-1.21 4.62-2.58.39 1.29.59 2.65.59 4.04 0 2.65-2.15 4.8-4.8 4.8z"/></svg>
    </button>

    <!-- Photo gallery FAB -->
    <button id="btnPhotoGallery" class="fab fab--right fab--stack3 rounded-2xl bg-[#111827] border border-[#1e3a5f] shadow-fab grid place-items-center hover:bg-[#1a2744] transition-colors" aria-label="Photo gallery" title="Photo gallery">
```

Replace with:

```html
    <!-- FABs (top-right) -->
    <button id="btnRecenter"  class="fab fab--right rounded-2xl bg-[#111827] border border-[#1e3a5f] shadow-fab text-cyan-400 text-xl grid place-items-center hover:bg-[#1a2744] transition-colors" aria-label="Center on me" title="Center on me">⌖<span id="gpsFailBadge" class="hidden" style="position:absolute;top:-3px;right:-3px;width:10px;height:10px;border-radius:50%;background:#f87171;border:1.5px solid #040810;"></span></button>

    <!-- Heat widget — stack3 right, overflow-hidden required for miasma ::after clip -->
    <button id="heatWidget" class="fab fab--right fab--stack3 rounded-2xl bg-[#111827] border border-[#1e3a5f] shadow-fab grid place-items-center transition-colors overflow-hidden" aria-label="Heat" title="Heat">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="currentColor" aria-hidden="true" style="position:relative;z-index:1;"><path d="M13.5 0.67s.74 2.65.74 4.8c0 2.06-1.35 3.73-3.41 3.73-2.07 0-3.63-1.67-3.63-3.73l.03-.36C5.21 7.51 4 10.62 4 14c0 4.42 3.58 8 8 8s8-3.58 8-8C20 8.61 17.41 3.8 13.5 0.67zM11.71 19c-1.78 0-3.22-1.4-3.22-3.14 0-1.62 1.05-2.76 2.81-3.12 1.77-.36 3.6-1.21 4.62-2.58.39 1.29.59 2.65.59 4.04 0 2.65-2.15 4.8-4.8 4.8z"/></svg>
    </button>

    <!-- System FAB — stack1 left -->
    <button id="btnSystem" class="fab fab--left rounded-2xl bg-[#111827] border border-[#1e3a5f] shadow-fab text-amber-400 text-xl grid place-items-center hover:bg-[#1a2744] transition-colors" aria-label="System" title="System">⌂</button>
    <!-- Gameplay FAB — stack2 left -->
    <button id="btnGameplay" class="fab fab--left fab--stack2 rounded-2xl bg-blue-600 border border-blue-500 shadow-fab text-white text-lg grid place-items-center hover:bg-blue-500 transition-colors" aria-label="Show/hide gameplay" title="Show/hide gameplay">☰</button>

    <!-- Photo gallery FAB — stack2 right -->
    <button id="btnPhotoGallery" class="fab fab--right fab--stack2 rounded-2xl bg-[#111827] border border-[#1e3a5f] shadow-fab grid place-items-center hover:bg-[#1a2744] transition-colors" aria-label="Photo gallery" title="Photo gallery">
```

- [ ] **Step 2: Remove the `#btnDebug` FAB (around line 576)**

Find and delete this single line (it appears just before `<div id="panelDebug"`):

```html
    <button id="btnDebug" class="fab fab--left rounded-2xl bg-[#111827] border border-[#1e3a5f] shadow-fab text-slate-400 text-lg grid place-items-center hover:bg-[#1a2744] transition-colors" aria-label="Show/hide debug" title="Show/hide debug">⚙︎</button>
```

- [ ] **Step 3: Verify in browser**

Open `index.html` in a browser. Confirm:
- Left column: ⌂ (top), ☰ (below). Nothing else on the left.
- Right column: ⌖ (top), 📷 (below), 🔥 (below photos).
- No ⚙︎, ⓘ, or ☠ visible anywhere on the map.

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "feat: rearrange FABs — gameplay moves left, curses/debug/info FABs removed"
```

---

## Task 2: Add How to Play and Dev Tools to System panel

**Files:**
- Modify: `index.html:394-407` (System panel body)
- Modify: `index.html:410-458` (remove `#panelInfo`)

- [ ] **Step 1: Extend System panel body**

Find the closing `</div>` of the System panel body (the `panelBody` div):

```html
      <div class="panelBody flex flex-col gap-2">
        <button id="btnSystemNewGame" class="w-full flex items-center gap-3 px-4 py-4 rounded-2xl bg-amber-500 border-0 text-white font-bold cursor-pointer hover:bg-amber-400 active:scale-[.98] transition-all duration-150" type="button">
          <span class="text-2xl">🎮</span>
          <span>New Game</span>
        </button>
        <a id="systemProfileLink" href="./profile.html" class="w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl bg-[#111827] border border-[#1e3a5f] text-slate-300 font-semibold no-underline hover:bg-[#1a2744] active:scale-[.98] transition-all duration-150 text-sm">
          <span class="text-xl">👤</span>
          <span id="systemProfileLabel">Profile / Sign in</span>
        </a>
        <button id="btnSystemSignOut" class="hidden w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl bg-transparent border border-[#1e3a5f] text-slate-500 font-semibold cursor-pointer hover:bg-[#1a2744] hover:text-slate-300 active:scale-[.98] transition-all duration-150 text-sm" type="button">
          <span class="text-xl">⎋</span>
          <span>Sign out</span>
        </button>
      </div>
```

Replace with:

```html
      <div class="panelBody flex flex-col gap-2">
        <button id="btnSystemNewGame" class="w-full flex items-center gap-3 px-4 py-4 rounded-2xl bg-amber-500 border-0 text-white font-bold cursor-pointer hover:bg-amber-400 active:scale-[.98] transition-all duration-150" type="button">
          <span class="text-2xl">🎮</span>
          <span>New Game</span>
        </button>
        <a id="systemProfileLink" href="./profile.html" class="w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl bg-[#111827] border border-[#1e3a5f] text-slate-300 font-semibold no-underline hover:bg-[#1a2744] active:scale-[.98] transition-all duration-150 text-sm">
          <span class="text-xl">👤</span>
          <span id="systemProfileLabel">Profile / Sign in</span>
        </a>
        <button id="btnSystemSignOut" class="hidden w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl bg-transparent border border-[#1e3a5f] text-slate-500 font-semibold cursor-pointer hover:bg-[#1a2744] hover:text-slate-300 active:scale-[.98] transition-all duration-150 text-sm" type="button">
          <span class="text-xl">⎋</span>
          <span>Sign out</span>
        </button>
        <button id="btnSystemDevTools" class="w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl bg-transparent border border-[#1e3a5f] text-slate-500 font-semibold cursor-pointer hover:bg-[#1a2744] hover:text-slate-300 active:scale-[.98] transition-all duration-150 text-sm" type="button">
          <span class="text-xl">⚙︎</span>
          <span>Dev Tools</span>
        </button>

        <div class="mt-1 border-t border-[#1e3a5f] pt-3 flex flex-col gap-4 text-sm text-gray-200 leading-relaxed">
          <div class="text-xs font-semibold text-slate-500 uppercase tracking-widest">How to Play</div>

          <div class="flex gap-3">
            <span class="text-2xl shrink-0">📸</span>
            <div>
              <div class="font-semibold text-white mb-0.5">Find the target</div>
              <div class="text-slate-300">You'll receive a corrupted Street View photo of a hidden location nearby. Your goal is to physically walk to that exact spot.</div>
            </div>
          </div>

          <div class="flex gap-3">
            <span class="text-2xl shrink-0">🛠️</span>
            <div>
              <div class="font-semibold text-white mb-0.5">Use your tools</div>
              <div class="text-slate-300">Tap the gameplay menu for five investigation tools — Radar, Thermometer, Compass, Landmark clues, and extra Photos — to narrow down where the target is. Each individual option can only be used once per run, so choose wisely. Some tools are locked at the start and only become available later in the round.</div>
            </div>
          </div>

          <div class="flex gap-3">
            <span class="text-2xl shrink-0">🌡️</span>
            <div>
              <div class="font-semibold text-white mb-0.5">Watch your heat</div>
              <div class="text-slate-300">Every tool you use generates <span class="text-amber-400 font-semibold">heat</span>. Let it build too high and curses will start to work against you — disrupting tools, distorting clues, and worse.</div>
            </div>
          </div>

          <div class="flex gap-3">
            <span class="text-2xl shrink-0">📍</span>
            <div>
              <div class="font-semibold text-white mb-0.5">Lock in your guess</div>
              <div class="text-slate-300">When you believe you've found the target, tap <span class="text-cyan-400 font-semibold">Lock In Guess</span> in the gameplay menu. Your current GPS position is scored against the true target — the closer you are, the higher your grade.</div>
            </div>
          </div>

          <div class="px-3 py-2.5 rounded-xl bg-[#1e2d44] border border-[#2a3f60] text-xs text-slate-400 leading-snug">
            The timer counts down throughout the round. If it expires before you lock in, your position at that moment is used for scoring.
          </div>
        </div>
      </div>
```

- [ ] **Step 2: Delete the `#panelInfo` panel (lines ~410–458)**

Remove the entire block:

```html
    <!-- ── How to Play panel ─────────────────────────────── -->
    <div id="panelInfo" class="panel panel--left bg-[#0f1729] border border-[#1e3a5f] shadow-panel-up" aria-label="How to play">
      ...
    </div>
```

(Everything from `<!-- ── How to Play panel` through the closing `</div>` before `<!-- ── Curse picker panel`.)

- [ ] **Step 3: Verify in browser**

Open System panel (⌂). Confirm it now shows: New Game · Profile · Sign Out (hidden) · Dev Tools button · How to Play section with all five items. Confirm tapping Dev Tools doesn't crash (the handler is wired in Task 5).

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "feat: move How to Play and Dev Tools into System panel, remove panelInfo"
```

---

## Task 3: Replace `#panelCurses` with `#panelHeat` in `index.html`

**Files:**
- Modify: `index.html:472-485` (remove `#panelCurses`, add `#panelHeat`)

- [ ] **Step 1: Replace the panel block**

Find:

```html
    <!-- ── Curses panel ───────────────────────────────────── -->
    <div id="panelCurses" class="panel panel--right panel--curses bg-[#0f1729] border border-[#1e3a5f] shadow-panel-up" aria-label="Curses">
      <div class="panelHandle" aria-hidden="true"></div>
      <div class="panelHeader flex items-start justify-between gap-3 pt-2.5 mb-3.5">
        <div>
          <div class="panelTitle text-lg font-bold tracking-tight text-white">Curses</div>
          <div class="text-xs text-slate-400 leading-snug">Status effects currently active</div>
        </div>
      </div>
      <div id="cursesBody" class="panelBody pt-3">
        <div id="cursesEmpty" class="text-xs text-slate-400 leading-snug">No curses currently active.</div>
        <ul id="cursesList" class="cursesList hidden"></ul>
      </div>
    </div>
```

Replace with:

```html
    <!-- ── Heat panel ─────────────────────────────────────── -->
    <div id="panelHeat" class="panel panel--right bg-[#0f1729] border border-[#1e3a5f] shadow-panel-up" aria-label="Heat">
      <div class="panelHandle" aria-hidden="true"></div>
      <div class="panelHeader flex items-start justify-between gap-3 pt-2.5 mb-3.5">
        <div>
          <div class="panelTitle text-lg font-bold tracking-tight text-white">Heat</div>
          <div class="text-xs text-slate-400 leading-snug">Current temperature &amp; active curses</div>
        </div>
      </div>
      <div class="panelBody pt-2 flex flex-col gap-3">
        <!-- Heat row -->
        <div id="heatPanelRow" class="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white/[.04] border border-white/[.07]">
          <svg id="heatPanelFlame" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="32" height="32" fill="currentColor" aria-hidden="true" style="flex-shrink:0;"><path d="M13.5 0.67s.74 2.65.74 4.8c0 2.06-1.35 3.73-3.41 3.73-2.07 0-3.63-1.67-3.63-3.73l.03-.36C5.21 7.51 4 10.62 4 14c0 4.42 3.58 8 8 8s8-3.58 8-8C20 8.61 17.41 3.8 13.5 0.67zM11.71 19c-1.78 0-3.22-1.4-3.22-3.14 0-1.62 1.05-2.76 2.81-3.12 1.77-.36 3.6-1.21 4.62-2.58.39 1.29.59 2.65.59 4.04 0 2.65-2.15 4.8-4.8 4.8z"/></svg>
          <div>
            <div style="display:flex;align-items:baseline;gap:7px;margin-bottom:4px;">
              <span id="heatPanelLevel" class="text-lg font-extrabold leading-none tracking-tight text-slate-400">0 / 5</span>
              <span id="heatPanelBadge" class="text-[10px] font-bold uppercase tracking-widest px-1.5 py-px rounded text-slate-400 bg-slate-400/10">COLD</span>
            </div>
            <div id="heatPanelDesc" class="text-xs text-slate-400 leading-snug">No heat — use tools freely.</div>
          </div>
        </div>
        <!-- Curses section -->
        <div class="border-t border-[#1e3a5f] pt-2.5">
          <div class="text-[10px] font-bold uppercase tracking-widest text-slate-600 mb-2">Active Curses</div>
          <div id="cursesEmpty" class="text-xs text-slate-400 leading-snug">No curses currently active.</div>
          <ul id="cursesList" class="cursesList hidden"></ul>
        </div>
      </div>
    </div>
```

- [ ] **Step 2: Verify in browser**

Open the browser console. Run `document.getElementById('panelHeat')` — should return the element. Run `document.getElementById('cursesEmpty')` — should also return its element (now inside `#panelHeat`). `document.getElementById('panelCurses')` should return `null`.

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "feat: replace panelCurses with panelHeat containing heat row and curses list"
```

---

## Task 4: Update `styles.css`

**Files:**
- Modify: `styles.css:91-94` (FAB stack classes)
- Modify: `styles.css:249-261` (heat widget colours — add `overflow:hidden`)
- Modify: `styles.css:266-278` (remove defunct `#btnCurses` rules)
- Modify: `styles.css:520-578` (retarget panel miasma from `.panel--curses` to `#panelHeat`, add heat FAB miasma)

- [ ] **Step 1: Remove dead stack4 and stack5 rules**

Find:

```css
.fab--stack2{ top:calc(var(--hud-pad) + var(--hud-btn) + var(--hud-gap)); }
.fab--stack3{ top:calc(var(--hud-pad) + (var(--hud-btn) + var(--hud-gap)) * 2); }
.fab--stack4{ top:calc(var(--hud-pad) + (var(--hud-btn) + var(--hud-gap)) * 3); }
.fab--stack5{ top:calc(var(--hud-pad) + (var(--hud-btn) + var(--hud-gap)) * 4); }
```

Replace with:

```css
.fab--stack2{ top:calc(var(--hud-pad) + var(--hud-btn) + var(--hud-gap)); }
.fab--stack3{ top:calc(var(--hud-pad) + (var(--hud-btn) + var(--hud-gap)) * 2); }
```

- [ ] **Step 2: Remove defunct `#btnCurses` state rules**

Find and delete this entire block (lines ~266–278):

```css
/* ─── Curses button states ───────────────────────────────────────── */
.fab--curse{ font-size:22px; }
.fab--curse.isInactive{ color:rgba(255,255,255,.32); }
.fab--curse.isActive{
  color:rgba(216,180,254,1);
  text-shadow:0 0 16px rgba(168,85,247,.85);
  box-shadow:
    0 0 0 1px rgba(168,85,247,.35),
    0 0 24px rgba(168,85,247,.45),
    0 0 48px rgba(168,85,247,.22),
    0 12px 30px rgba(0,0,0,.32);
  animation:cursePulse 1.35s ease-in-out infinite;
}
```

- [ ] **Step 3: Add heat FAB miasma CSS**

Directly after the `#heatWidget.heat-5` block (around line 261), add:

```css
/* ─── Heat FAB curse-active miasma ──────────────────────────────── */
#heatWidget.curse-active{
  border-color:rgba(168,85,247,.55) !important;
  box-shadow:
    0 0 0 1px rgba(168,85,247,.25),
    0 0 18px rgba(168,85,247,.35),
    0 2px 8px rgba(0,0,0,.4);
}
#heatWidget.curse-active::after{
  content:'';
  position:absolute;
  bottom:0; left:0; right:0;
  height:55%;
  background:linear-gradient(to top,
    rgba(88,28,135,.75) 0%,
    rgba(168,85,247,.45) 60%,
    transparent 100%);
  border-radius:0 0 inherit inherit;
  animation:heatMiasmaPulse 2s ease-in-out infinite alternate;
  pointer-events:none;
  z-index:0;
}
@keyframes heatMiasmaPulse{
  from{ opacity:.65; height:52%; }
  to{   opacity:1.0; height:66%; }
}
```

- [ ] **Step 4: Retarget panel miasma from `.panel--curses` to `#panelHeat`**

Find and replace all four occurrences of `.panel--curses` in the miasma block:

```css
.panel--curses .panelBody{ padding:12px 0 0; }
```
→ Delete this line entirely (the new panel uses inline padding classes).

```css
.panel--curses.curse-active{
```
→
```css
#panelHeat.curse-active{
```

```css
.panel--curses.curse-active::before{
```
→
```css
#panelHeat.curse-active::before{
```

```css
.panel--curses.curse-active::after{
```
→
```css
#panelHeat.curse-active::after{
```

```css
.panel--curses.curse-active > *{ position:relative; z-index:1; }
```
→
```css
#panelHeat.curse-active > *{ position:relative; z-index:1; }
```

- [ ] **Step 5: Verify in browser**

Open the browser console. Run:
```js
document.getElementById('heatWidget').classList.add('curse-active')
```
Confirm a purple miasma gradient rises from the bottom of the heat FAB. Run:
```js
document.getElementById('panelHeat').classList.add('open','curse-active')
```
Confirm the heat panel opens with the purple miasma fog animation. Remove both test classes afterwards.

- [ ] **Step 6: Commit**

```bash
git add styles.css
git commit -m "feat: update FAB stack CSS, add heat FAB miasma, retarget panel miasma to panelHeat"
```

---

## Task 5: Rewire panel handlers in `js/14_panels_misc.js`

**Files:**
- Modify: `js/14_panels_misc.js:1-245`

- [ ] **Step 1: Update variable declarations (lines 1–21)**

Find:

```js
  const panelCurses = document.getElementById("panelCurses");
  const panelNewGame = document.getElementById("panelNewGame");
  const panelSystem = document.getElementById("panelSystem");
  const panelInfo = document.getElementById("panelInfo");
  const panelCurseSelect = document.getElementById("panelCurseSelect");
  const panelPhotoGallery    = document.getElementById("panelPhotoGallery");
  const btnPhotoGallery      = document.getElementById("btnPhotoGallery");
  const btnPhotoGalleryClose = document.getElementById("btnPhotoGalleryClose");
  const btnGameplay = document.getElementById("btnGameplay");
  const btnDebug = document.getElementById("btnDebug");
  const btnCurses = document.getElementById("btnCurses");
  const btnSystem = document.getElementById("btnSystem");
  const btnInfo = document.getElementById("btnInfo");
  const btnDbgSimCurse = document.getElementById("btnDbgSimCurse");
  const backdrop = document.getElementById("panelBackdrop");

  const allPanels = [panelGameplay, panelDebug, panelCurses, panelNewGame, panelSystem, panelInfo, panelCurseSelect, panelPhotoGallery].filter(Boolean);
```

Replace with:

```js
  const panelHeat = document.getElementById("panelHeat");
  const panelNewGame = document.getElementById("panelNewGame");
  const panelSystem = document.getElementById("panelSystem");
  const panelCurseSelect = document.getElementById("panelCurseSelect");
  const panelPhotoGallery    = document.getElementById("panelPhotoGallery");
  const btnPhotoGallery      = document.getElementById("btnPhotoGallery");
  const btnPhotoGalleryClose = document.getElementById("btnPhotoGalleryClose");
  const btnGameplay = document.getElementById("btnGameplay");
  const btnSystem = document.getElementById("btnSystem");
  const heatWidget = document.getElementById("heatWidget");
  const btnDbgSimCurse = document.getElementById("btnDbgSimCurse");
  const backdrop = document.getElementById("panelBackdrop");

  const allPanels = [panelGameplay, panelDebug, panelHeat, panelNewGame, panelSystem, panelCurseSelect, panelPhotoGallery].filter(Boolean);
```

- [ ] **Step 2: Update `btnGameplay` handler — replace `panelCurses`/`panelInfo` references**

Find inside the `btnGameplay` click handler:

```js
        setOpen(panelDebug, false);
        setOpen(panelCurses, false);
        setOpen(panelNewGame, false);
        setOpen(panelInfo, false);
        setOpen(panelCurseSelect, false);
```

Replace with:

```js
        setOpen(panelDebug, false);
        setOpen(panelHeat, false);
        setOpen(panelNewGame, false);
        setOpen(panelCurseSelect, false);
```

- [ ] **Step 3: Replace `btnCurses` handler with `heatWidget` handler**

Find and replace the entire curses panel toggle block:

```js
  // Curses panel toggle
  if (btnCurses && panelCurses) {
    btnCurses.addEventListener("click", () => {
      const willOpen = !panelCurses.classList.contains("open");
      setOpen(panelCurses, willOpen);
      if (willOpen) {
        setOpen(panelGameplay, false);
        setOpen(panelDebug, false);
        setOpen(panelNewGame, false);
        setOpen(panelSystem, false);
        setOpen(panelInfo, false);
        setOpen(panelCurseSelect, false);
        setOpen(panelPhotoGallery, false);
        try { if (typeof updateCursesPanel === 'function') updateCursesPanel(); } catch (e) {}
      }
    });
  }
```

Replace with:

```js
  // Heat panel toggle (also shows active curses)
  if (heatWidget && panelHeat) {
    heatWidget.addEventListener("click", () => {
      const willOpen = !panelHeat.classList.contains("open");
      setOpen(panelHeat, willOpen);
      if (willOpen) {
        setOpen(panelGameplay, false);
        setOpen(panelDebug, false);
        setOpen(panelNewGame, false);
        setOpen(panelSystem, false);
        setOpen(panelCurseSelect, false);
        setOpen(panelPhotoGallery, false);
        try { if (typeof updateCursesPanel === 'function') updateCursesPanel(); } catch (e) {}
      }
    });
  }
```

- [ ] **Step 4: Update `btnSystem` handler — add Dev Tools button, remove stale references**

Find the `btnSystem` handler block:

```js
  // System panel toggle
  if (btnSystem && panelSystem) {
    btnSystem.addEventListener("click", () => {
      const willOpen = !panelSystem.classList.contains("open");
      setOpen(panelSystem, willOpen);
      if (willOpen) {
        setOpen(panelGameplay, false);
        setOpen(panelDebug, false);
        setOpen(panelCurses, false);
        setOpen(panelNewGame, false);
        setOpen(panelInfo, false);
        setOpen(panelCurseSelect, false);
        setOpen(panelPhotoGallery, false);
      }
    });
  }
```

Replace with:

```js
  // System panel toggle
  if (btnSystem && panelSystem) {
    btnSystem.addEventListener("click", () => {
      const willOpen = !panelSystem.classList.contains("open");
      setOpen(panelSystem, willOpen);
      if (willOpen) {
        setOpen(panelGameplay, false);
        setOpen(panelDebug, false);
        setOpen(panelHeat, false);
        setOpen(panelNewGame, false);
        setOpen(panelCurseSelect, false);
        setOpen(panelPhotoGallery, false);
      }
    });
  }

  // Dev Tools button inside System panel — closes System, opens Debug
  const btnSystemDevTools = document.getElementById("btnSystemDevTools");
  if (btnSystemDevTools && panelDebug) {
    btnSystemDevTools.addEventListener("click", () => {
      setOpen(panelSystem, false);
      setOpen(panelDebug, true);
      setOpen(panelGameplay, false);
      setOpen(panelHeat, false);
      setOpen(panelNewGame, false);
      setOpen(panelCurseSelect, false);
      setOpen(panelPhotoGallery, false);
    });
  }
```

- [ ] **Step 5: Update backdrop handler**

Find:

```js
    backdrop.addEventListener("pointerdown", () => {
      setOpen(panelGameplay, false);
      setOpen(panelDebug, false);
      setOpen(panelCurses, false);
      setOpen(panelNewGame, false);
      setOpen(panelSystem, false);
      setOpen(panelInfo, false);
      setOpen(panelCurseSelect, false);
      setOpen(panelPhotoGallery, false);
    });
```

Replace with:

```js
    backdrop.addEventListener("pointerdown", () => {
      setOpen(panelGameplay, false);
      setOpen(panelDebug, false);
      setOpen(panelHeat, false);
      setOpen(panelNewGame, false);
      setOpen(panelSystem, false);
      setOpen(panelCurseSelect, false);
      setOpen(panelPhotoGallery, false);
    });
```

- [ ] **Step 6: Remove `btnDebug` and `btnInfo` handlers**

Delete both handler blocks entirely:

```js
  if (btnDebug && panelDebug) {
    btnDebug.addEventListener("click", () => {
      ...
    });
  }
```

```js
  // Info panel toggle
  if (btnInfo && panelInfo) {
    btnInfo.addEventListener("click", () => {
      ...
    });
  }
```

- [ ] **Step 7: Verify in browser**

- Tap ⌂ → System panel opens. All other panels are closed.
- Tap Dev Tools inside System → System closes, Debug panel opens.
- Tap 🔥 → Heat panel opens. All other panels close.
- Tap backdrop → all panels close.
- Tap ☰ (now on left) → Gameplay panel opens.
- None of the removed FABs (⚙︎ ⓘ ☠) trigger anything.

- [ ] **Step 8: Commit**

```bash
git add js/14_panels_misc.js
git commit -m "feat: rewire panel handlers — heat widget opens panelHeat, Dev Tools button in system panel"
```

---

## Task 6: Update `js/09_ui_helpers.js`

**Files:**
- Modify: `js/09_ui_helpers.js:313-321` (heat widget colour update in `updateHUD`)
- Modify: `js/09_ui_helpers.js:474-528` (curse button/panel functions)

- [ ] **Step 1: Add heat panel row update to `updateHUD`**

Find the heat colour block in `updateHUD`:

```js
  // Heat — colour flame FAB by level
  const heatEl = elHeatWidget;
  if (heatEl) {
    const hv  = (typeof heatValue === "number" && isFinite(heatValue)) ? heatValue : 0;
    const L   = (typeof heatLevel === "number" && isFinite(heatLevel)) ? (heatLevel | 0) : Math.floor(hv);
    const lvl = Math.max(0, Math.min(5, L));
    heatEl.classList.remove('heat-1','heat-2','heat-3','heat-4','heat-5');
    if (lvl >= 1) heatEl.classList.add(`heat-${lvl}`);
  }
```

Replace with:

```js
  // Heat — colour flame FAB and heat panel row by level
  const heatEl = elHeatWidget;
  const hv  = (typeof heatValue === "number" && isFinite(heatValue)) ? heatValue : 0;
  const hL  = (typeof heatLevel === "number" && isFinite(heatLevel)) ? (heatLevel | 0) : Math.floor(hv);
  const lvl = Math.max(0, Math.min(5, hL));
  if (heatEl) {
    heatEl.classList.remove('heat-1','heat-2','heat-3','heat-4','heat-5');
    if (lvl >= 1) heatEl.classList.add(`heat-${lvl}`);
  }
  // Keep heat panel row in sync (same heat-N classes drive the colour via CSS)
  const heatPanelRow = document.getElementById('heatPanelRow');
  if (heatPanelRow) {
    heatPanelRow.classList.remove('heat-1','heat-2','heat-3','heat-4','heat-5');
    if (lvl >= 1) heatPanelRow.classList.add(`heat-${lvl}`);
  }
  const heatPanelLevel = document.getElementById('heatPanelLevel');
  if (heatPanelLevel) heatPanelLevel.textContent = `${lvl} / 5`;
  const heatPanelBadge = document.getElementById('heatPanelBadge');
  if (heatPanelBadge) {
    const labels = ['COLD','WARM','WARM','HOT','HOT','MAX'];
    heatPanelBadge.textContent = labels[lvl] || 'COLD';
  }
  const heatPanelDesc = document.getElementById('heatPanelDesc');
  if (heatPanelDesc) heatPanelDesc.textContent = heatConsequencesText(lvl);
```

Note: `heatConsequencesText` is defined later in the same file at line 440 — this is fine since `updateHUD` is called at runtime, not at parse time.

- [ ] **Step 2: Add heat-N colour rules for `#heatPanelRow` to `styles.css`**

In `styles.css`, after the existing `#heatWidget.heat-5` block, add rules so the panel row's SVG and text inherit the correct colour:

```css
/* ─── Heat panel row heat-level colours (mirrors FAB) ───────────── */
#heatPanelRow           { color: #4a627a; }
#heatPanelRow.heat-1    { color: #fbbf24; }
#heatPanelRow.heat-2    { color: #f97316; }
#heatPanelRow.heat-3    { color: #ef4444; }
#heatPanelRow.heat-4    { color: #dc2626; }
#heatPanelRow.heat-5    { color: #ff2222; }
```

- [ ] **Step 3: Rename `updateCursesButton` and retarget to `#heatWidget`**

Find:

```js
function updateCursesButton(){
  const btn = document.getElementById('btnCurses');
  if (!btn) return;
  const list = __getActiveCursesForUI();
  const isActive = Array.isArray(list) && list.length > 0;
  btn.classList.toggle('isActive', isActive);
  btn.classList.toggle('isInactive', !isActive);
}
```

Replace with:

```js
function updateHeatCurseButton(){
  const btn = document.getElementById('heatWidget');
  if (!btn) return;
  const list = __getActiveCursesForUI();
  btn.classList.toggle('curse-active', Array.isArray(list) && list.length > 0);
}
```

- [ ] **Step 4: Retarget `updateCursesPanel` to `#panelHeat`**

Find:

```js
  const panel = document.getElementById('panelCurses');
  if (panel) panel.classList.toggle('curse-active', Array.isArray(list) && list.length > 0);
```

Replace with:

```js
  const panel = document.getElementById('panelHeat');
  if (panel) panel.classList.toggle('curse-active', Array.isArray(list) && list.length > 0);
```

- [ ] **Step 5: Update window exports and default render call**

Find:

```js
// Expose for curses system.
window.updateCursesButton = updateCursesButton;
window.updateCursesPanel = updateCursesPanel;

// Default render.
try { updateCursesButton(); updateCursesPanel(); } catch (e) {}
```

Replace with:

```js
// Expose for curses system. updateCursesButton alias kept for 19_curses.js back-compat.
window.updateHeatCurseButton = updateHeatCurseButton;
window.updateCursesButton = updateHeatCurseButton;
window.updateCursesPanel = updateCursesPanel;

// Default render.
try { updateHeatCurseButton(); updateCursesPanel(); } catch (e) {}
```

- [ ] **Step 6: Verify in browser**

Open the browser console. Trigger a simulated curse via the debug panel (Simulate curse → button). Confirm:
- The 🔥 FAB gains the purple miasma glow.
- Opening the heat panel shows the curse in the list.
- The heat panel title bar gets the purple miasma fog animation.
- `window.updateCursesButton()` still works (backward compat for `19_curses.js`).

- [ ] **Step 7: Commit**

```bash
git add js/09_ui_helpers.js styles.css
git commit -m "feat: updateHeatCurseButton targets heatWidget, heat panel row syncs with HUD"
```

---

## Task 7: Close `#panelHeat` on new round

**Files:**
- Modify: `js/20_guess.js:478-482` (`startNewRound` cleanup block)

- [ ] **Step 1: Add `panelHeat` close to `startNewRound`**

Find the gameplay panel close inside `startNewRound`:

```js
    // Close gameplay panel first so the new game panel isn't hidden behind it.
    try {
      const pg = document.getElementById('panelGameplay');
      if (pg) pg.classList.remove('open');
    } catch(e) {}
```

Replace with:

```js
    // Close gameplay and heat panels so the new game panel isn't hidden behind them.
    try {
      const pg = document.getElementById('panelGameplay');
      if (pg) pg.classList.remove('open');
      const ph = document.getElementById('panelHeat');
      if (ph) ph.classList.remove('open');
    } catch(e) {}
```

- [ ] **Step 2: Verify in browser**

Open the heat panel. Trigger a new round (New Game button). Confirm the heat panel closes as part of the round reset flow.

- [ ] **Step 3: Commit**

```bash
git add js/20_guess.js
git commit -m "fix: close panelHeat on startNewRound"
```

---

## Task 8: Final regression check

- [ ] **Step 1: Full panel smoke test**

Open the game. Verify each of the 5 FABs works:
- ⌂ opens System panel. Dev Tools button opens Debug. How to Play content is visible.
- ☰ opens Gameplay panel. All tools accessible. Submenus navigate correctly.
- ⌖ recentres the map (no panel).
- 📷 opens Photo Gallery panel.
- 🔥 opens Heat panel. Heat level, badge, and description show correctly. Curses section shows "No curses currently active."

- [ ] **Step 2: Curse active state**

In Debug panel → "Simulate curse →". Confirm:
- Heat FAB gains purple miasma from bottom.
- Opening Heat panel shows the active curse with a countdown timer and the panel miasma fog.
- Closing the panel and letting the curse expire removes the FAB miasma.

- [ ] **Step 3: New round reset**

Start a new round. Confirm:
- Heat panel closes if it was open.
- Heat FAB returns to its standard heat-level colour (no stuck miasma).
- All panels closed, New Game panel opens as expected.

- [ ] **Step 4: Mobile touch check**

On a mobile browser (or DevTools device mode):
- FABs are reachable with thumbs on both sides.
- Swipe-down-to-dismiss works on Heat panel.
- Tapping backdrop closes Heat panel.
- Map panning and zooming unaffected behind all panels.

- [ ] **Step 5: Push**

```bash
git push
```
