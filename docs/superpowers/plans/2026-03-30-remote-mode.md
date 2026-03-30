# Remote Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement Remote mode — tap-to-move gameplay with a limited move budget, shortened timer, GPS-anchored region, and remote-specific curses.

**Architecture:** A new `js/22_remote.js` module owns all remote logic (tap handler, move budget, undo, remote curses), mirroring the `21_gauntlet.js` pattern. Existing files get minimal, targeted patches to accept the new mode. GPS watch is suppressed for remote rounds; the initial GPS fix still runs to anchor the region.

**Tech Stack:** Vanilla JS, localStorage persistence, Tailwind CSS (inline classes matching project style), Leaflet map click events.

---

## File Map

| Action | File | Purpose |
|--------|------|---------|
| Modify | `js/00_config.js` | Add `REMOTE_MOVE_BUDGETS`, `REMOTE_TIME_LIMITS_MS`, `REMOTE_CURSE_DURATION_MS` |
| Modify | `js/04_state.js` | Accept `'remote'` in `__normalizeGameMode`; add remote case to `getRoundTimeLimitMs`; add `remoteState` to save payload |
| Create | `js/22_remote.js` | All remote logic: state, tap handler, undo, curse effects, persistence API |
| Modify | `index.html` | Mode selector 3-col grid + Remote button + `remoteModeInfo` blurb; `#remoteMoveCounter` in timer HUD; `#remoteUndoBtn`; load `22_remote.js` |
| Modify | `js/02_dom.js` | Show/hide `remoteModeInfo`; suppress GPS watch for remote; call `__initRemoteIfNeeded` on game start |
| Modify | `js/07_geolocation.js` | Skip `startGeolocationWatch` when `isRemoteActive()` |
| Modify | `js/09_ui_helpers.js` | Render move counter beside timer when remote active |
| Modify | `js/19_curses.js` | Skip disabled curses, override duration, route remote curse IDs |
| Modify | `js/13_boot.js` | Restore remote state on page load |

---

## Task 1: Add Remote Constants

**Files:**
- Modify: `js/00_config.js` (after line 123, after `GAUNTLET_TIME_LIMIT_MS`)

- [ ] **Step 1: Add constants**

In `js/00_config.js`, after the line `const GAUNTLET_TIME_LIMIT_MS = 90 * 60 * 1000;` add:

```js
const REMOTE_MOVE_BUDGETS    = { short: 15, medium: 20, long: 25 };
const REMOTE_TIME_LIMITS_MS  = { short: 5 * 60 * 1000, medium: 8 * 60 * 1000, long: 12 * 60 * 1000 };
const REMOTE_CURSE_DURATION_MS = 60 * 1000; // 1 minute — all timed curses shortened in remote mode
```

- [ ] **Step 2: Verify**

Open `js/00_config.js` and confirm the three constants appear after `GAUNTLET_TIME_LIMIT_MS`.

- [ ] **Step 3: Update BUILD_ID**

In `js/00_config.js`, update `BUILD_ID` to `2026-03-30.remote-constants`.

- [ ] **Step 4: Commit**

```bash
git add js/00_config.js
git commit -m "feat: add REMOTE_MOVE_BUDGETS, REMOTE_TIME_LIMITS_MS, REMOTE_CURSE_DURATION_MS constants"
```

---

## Task 2: State — Accept `'remote'` Mode

**Files:**
- Modify: `js/04_state.js` (~lines 168–171 and 79–91)

- [ ] **Step 1: Update `__normalizeGameMode`**

Find:
```js
function __normalizeGameMode(v) {
  const x = String(v == null ? '' : v).trim().toLowerCase();
  return (x === 'gauntlet') ? 'gauntlet' : 'normal';
}
```

Replace with:
```js
function __normalizeGameMode(v) {
  const x = String(v == null ? '' : v).trim().toLowerCase();
  return (x === 'gauntlet' || x === 'remote') ? x : 'normal';
}
```

- [ ] **Step 2: Add remote case to `getRoundTimeLimitMs`**

Find inside `window.getRoundTimeLimitMs`:
```js
    if (setup && setup.mode === 'gauntlet') {
      return (typeof GAUNTLET_TIME_LIMIT_MS === 'number' && isFinite(GAUNTLET_TIME_LIMIT_MS)) ? GAUNTLET_TIME_LIMIT_MS : (90 * 60 * 1000);
    }
```

Replace with:
```js
    if (setup && setup.mode === 'gauntlet') {
      return (typeof GAUNTLET_TIME_LIMIT_MS === 'number' && isFinite(GAUNTLET_TIME_LIMIT_MS)) ? GAUNTLET_TIME_LIMIT_MS : (90 * 60 * 1000);
    }
    if (setup && setup.mode === 'remote') {
      const len = (setup && setup.length) || 'short';
      const budgets = (typeof REMOTE_TIME_LIMITS_MS !== 'undefined') ? REMOTE_TIME_LIMITS_MS : { short: 5 * 60 * 1000, medium: 8 * 60 * 1000, long: 12 * 60 * 1000 };
      return budgets[len] || budgets.short;
    }
```

- [ ] **Step 3: Add `remoteState` to save payload**

In `saveRoundState()`, find:
```js
      gauntletState: (typeof window.getGauntletStateForPersistence === 'function') ? window.getGauntletStateForPersistence() : null,
```

Add after it:
```js
      remoteState: (typeof window.getRemoteStateForPersistence === 'function') ? window.getRemoteStateForPersistence() : null,
```

- [ ] **Step 4: Update BUILD_ID**

Update `BUILD_ID` in `js/00_config.js` to `2026-03-30.remote-state`.

- [ ] **Step 5: Commit**

```bash
git add js/04_state.js js/00_config.js
git commit -m "feat: accept 'remote' game mode in state normalizer and getRoundTimeLimitMs"
```

---

## Task 3: Create `js/22_remote.js` — State, Public API, and Persistence

**Files:**
- Create: `js/22_remote.js`

- [ ] **Step 1: Create the file**

Create `js/22_remote.js` with this content:

```js
// ---- Remote Mode ----
// Manages tap-to-move gameplay with a limited move budget.
// Loaded after 21_gauntlet.js; exposes window.isRemoteActive etc.
(function () {

  // ---- Constants (fallbacks if config not loaded) ----
  function _moveBudget() {
    const setup = typeof window.getGameSetupSelection === 'function' ? window.getGameSetupSelection() : null;
    const len = (setup && setup.length) || 'short';
    const budgets = (typeof REMOTE_MOVE_BUDGETS !== 'undefined') ? REMOTE_MOVE_BUDGETS : { short: 15, medium: 20, long: 25 };
    return budgets[len] || 15;
  }

  // ---- State ----
  let remoteState = {
    active: false,
    movesRemaining: 0,
    prevLatLng: null,       // { lat, lon } — last position before most recent tap (for undo)
    undoAvailable: false,   // true after a tap, until used or next tap
    undoUsed: false,        // set true once undo is used; prevents further undos
    undoTimer: null,        // setTimeout handle for hiding undo button
    doublestepActive: false,
    tunnelvisionActive: false,
    shakeyHandsActive: false,
  };

  const REMOTE_STATE_KEY = 'mapgame_remote_state_v1';

  // ---- Public API ----

  window.isRemoteActive = function () {
    const setup = typeof window.getGameSetupSelection === 'function' ? window.getGameSetupSelection() : null;
    return !!(remoteState.active && setup && setup.mode === 'remote');
  };

  window.getMovesRemaining = function () {
    return remoteState.movesRemaining;
  };

  window.getRemoteStateForPersistence = function () {
    if (!remoteState.active) return null;
    return {
      active: remoteState.active,
      movesRemaining: remoteState.movesRemaining,
      undoUsed: remoteState.undoUsed,
      doublestepActive: remoteState.doublestepActive,
      tunnelvisionActive: remoteState.tunnelvisionActive,
      shakeyHandsActive: remoteState.shakeyHandsActive,
    };
  };

  window.restoreRemoteState = function (saved) {
    if (!saved || typeof saved !== 'object' || !saved.active) return;
    remoteState.active              = true;
    remoteState.movesRemaining      = (typeof saved.movesRemaining === 'number') ? saved.movesRemaining : _moveBudget();
    remoteState.undoUsed            = !!(saved.undoUsed);
    remoteState.undoAvailable       = false; // don't show undo button on restore
    remoteState.doublestepActive    = !!(saved.doublestepActive);
    remoteState.tunnelvisionActive  = !!(saved.tunnelvisionActive);
    remoteState.shakeyHandsActive   = !!(saved.shakeyHandsActive);
    __attachMapClickHandler();
    __updateMoveCounterUI();
  };

  window.__initRemoteIfNeeded = function () {
    const setup = typeof window.getGameSetupSelection === 'function' ? window.getGameSetupSelection() : null;
    if (!setup || setup.mode !== 'remote') {
      __resetRemoteState();
      return;
    }
    __resetRemoteState();
    remoteState.active = true;
    remoteState.movesRemaining = _moveBudget();
    __attachMapClickHandler();
    __updateMoveCounterUI();
  };

  window.__resetRemoteState = __resetRemoteState;

  // ---- Internal ----

  let __remoteMapClickHandler = null;

  function __resetRemoteState() {
    remoteState.active             = false;
    remoteState.movesRemaining     = 0;
    remoteState.prevLatLng         = null;
    remoteState.undoAvailable      = false;
    remoteState.undoUsed           = false;
    remoteState.doublestepActive   = false;
    remoteState.tunnelvisionActive = false;
    remoteState.shakeyHandsActive  = false;
    if (remoteState.undoTimer) { clearTimeout(remoteState.undoTimer); remoteState.undoTimer = null; }
    __detachMapClickHandler();
    __updateMoveCounterUI();
    __hideUndoButton();
  }

  function __attachMapClickHandler() {
    __detachMapClickHandler();
    if (!window.leafletMap) return;
    __remoteMapClickHandler = function (e) {
      try { window.remoteHandleTap(e.latlng); } catch(err) {}
    };
    try { window.leafletMap.on('click', __remoteMapClickHandler); } catch(e) {}
  }

  function __detachMapClickHandler() {
    if (window.leafletMap && __remoteMapClickHandler) {
      try { window.leafletMap.off('click', __remoteMapClickHandler); } catch(e) {}
    }
    __remoteMapClickHandler = null;
  }

  function __updateMoveCounterUI() {
    const el = document.getElementById('remoteMoveCounter');
    if (!el) return;
    if (!window.isRemoteActive()) {
      el.classList.add('hidden');
      return;
    }
    el.classList.remove('hidden');
    const n = remoteState.movesRemaining;
    el.textContent = `${n}`;
    // Colour: amber at ≤3, red at 0
    if (n === 0) {
      el.style.color = '#f87171';
    } else if (n <= 3) {
      el.style.color = '#fbbf24';
    } else {
      el.style.color = '#a78bfa';
    }
  }

  function __showUndoButton() {
    const btn = document.getElementById('remoteUndoBtn');
    if (!btn) return;
    btn.classList.remove('hidden');
    if (remoteState.undoTimer) clearTimeout(remoteState.undoTimer);
    remoteState.undoTimer = setTimeout(() => {
      __hideUndoButton();
      remoteState.undoTimer = null;
    }, 3000);
  }

  function __hideUndoButton() {
    const btn = document.getElementById('remoteUndoBtn');
    if (btn) btn.classList.add('hidden');
    if (remoteState.undoTimer) { clearTimeout(remoteState.undoTimer); remoteState.undoTimer = null; }
  }

  // ---- Tap handler ----

  window.remoteHandleTap = function (latlng) {
    if (!window.isRemoteActive()) return;
    const r = typeof window.getRoundStateV1 === 'function' ? window.getRoundStateV1() : null;
    if (r && r.hasGuessed) return; // round already locked

    // Tunnel Vision: reject taps outside 300m of current position
    if (remoteState.tunnelvisionActive) {
      const cur = typeof player !== 'undefined' ? player : null;
      if (cur && typeof cur.lat === 'number') {
        const dist = __haversineM(cur.lat, cur.lon, latlng.lat, latlng.lng);
        if (dist > 300) {
          try { if (typeof window.showToast === 'function') window.showToast('Tunnel Vision — you can only move within 300m.', false, { autoDismissMs: 1500 }); } catch(e) {}
          return;
        }
      }
    }

    const cost = remoteState.doublestepActive ? 2 : 1;
    if (remoteState.movesRemaining <= 0) return;

    // Save previous position for undo
    const curPlayer = typeof player !== 'undefined' ? player : null;
    remoteState.prevLatLng = curPlayer ? { lat: curPlayer.lat, lon: curPlayer.lon } : null;

    // Deduct cost (cap at 0)
    remoteState.movesRemaining = Math.max(0, remoteState.movesRemaining - cost);

    // Move player
    try {
      if (typeof setPlayerLatLng === 'function') {
        setPlayerLatLng(latlng.lat, latlng.lng, { source: 'remote-tap', force: true });
      }
    } catch(e) {}
    try { if (typeof updateUI === 'function') updateUI(); } catch(e) {}
    try { if (typeof updateHUD === 'function') updateHUD(); } catch(e) {}

    __updateMoveCounterUI();

    // Undo button (only if not already used and position was captured)
    if (!remoteState.undoUsed && remoteState.prevLatLng) {
      if (!remoteState.shakeyHandsActive) {
        remoteState.undoAvailable = true;
        __showUndoButton();
      }
    }

    // Warning at 3
    if (remoteState.movesRemaining === 3) {
      try {
        if (typeof window.showToast === 'function') {
          window.showToast('⚠️ 3 moves remaining!', false, { autoDismissMs: 0 });
        }
      } catch(e) {}
    }

    // Auto lock-in at 0
    if (remoteState.movesRemaining <= 0) {
      __hideUndoButton();
      try {
        window.enqueueToast('No moves left — locking in your position…', false, { autoDismissMs: 1200 })
          .then(() => {
            try { if (typeof window.lockInGuess === 'function') window.lockInGuess({ autoLock: true }); } catch(e) {}
          });
      } catch(e) {
        try { if (typeof window.lockInGuess === 'function') window.lockInGuess({ autoLock: true }); } catch(e2) {}
      }
    }

    try { if (typeof saveRoundStateDebounced === 'function') saveRoundStateDebounced(); } catch(e) {}
  };

  // ---- Undo ----

  window.undoLastMove = function () {
    if (!window.isRemoteActive()) return;
    if (!remoteState.undoAvailable || remoteState.undoUsed || !remoteState.prevLatLng) return;

    remoteState.undoUsed = true;
    remoteState.undoAvailable = false;
    __hideUndoButton();

    // Refund 1 move (regardless of double-step cost — undo restores exactly 1)
    remoteState.movesRemaining = Math.min(_moveBudget(), remoteState.movesRemaining + 1);

    try {
      if (typeof setPlayerLatLng === 'function') {
        setPlayerLatLng(remoteState.prevLatLng.lat, remoteState.prevLatLng.lon, { source: 'remote-undo', force: true });
      }
    } catch(e) {}
    remoteState.prevLatLng = null;
    __updateMoveCounterUI();
    try { if (typeof updateUI === 'function') updateUI(); } catch(e) {}
    try { if (typeof updateHUD === 'function') updateHUD(); } catch(e) {}
    try { if (typeof saveRoundStateDebounced === 'function') saveRoundStateDebounced(); } catch(e) {}
  };

  // ---- Remote curse handlers ----

  window.applyRemoteCurse = function (id) {
    if (!window.isRemoteActive()) return;
    switch (id) {
      case 'remote_doublestep':
        remoteState.doublestepActive = true;
        try { if (typeof window.showToast === 'function') window.showToast('Double Step — each move costs 2 for 1 minute.', false, { autoDismissMs: 3000 }); } catch(e) {}
        setTimeout(() => { remoteState.doublestepActive = false; }, (typeof REMOTE_CURSE_DURATION_MS !== 'undefined') ? REMOTE_CURSE_DURATION_MS : 60000);
        break;
      case 'remote_shakyhands':
        remoteState.shakeyHandsActive = true;
        remoteState.undoAvailable = false;
        __hideUndoButton();
        try { if (typeof window.showToast === 'function') window.showToast('Shaky Hands — undo is disabled for this round.', false, { autoDismissMs: 3000 }); } catch(e) {}
        break;
      case 'remote_anchored':
        remoteState.movesRemaining = Math.max(0, remoteState.movesRemaining - 3);
        __updateMoveCounterUI();
        try { if (typeof window.showToast === 'function') window.showToast('Anchored — −3 moves.', false, { autoDismissMs: 3000 }); } catch(e) {}
        if (remoteState.movesRemaining === 3) {
          try { if (typeof window.showToast === 'function') window.showToast('⚠️ 3 moves remaining!', false, { autoDismissMs: 0 }); } catch(e) {}
        }
        if (remoteState.movesRemaining <= 0) {
          try {
            window.enqueueToast('No moves left — locking in your position…', false, { autoDismissMs: 1200 })
              .then(() => { try { if (typeof window.lockInGuess === 'function') window.lockInGuess({ autoLock: true }); } catch(e) {} });
          } catch(e) {
            try { if (typeof window.lockInGuess === 'function') window.lockInGuess({ autoLock: true }); } catch(e2) {}
          }
        }
        try { if (typeof saveRoundStateDebounced === 'function') saveRoundStateDebounced(); } catch(e) {}
        break;
      case 'remote_tunnelvision':
        remoteState.tunnelvisionActive = true;
        try { if (typeof window.showToast === 'function') window.showToast('Tunnel Vision — movement limited to 300m per tap for 1 minute.', false, { autoDismissMs: 3000 }); } catch(e) {}
        setTimeout(() => { remoteState.tunnelvisionActive = false; }, (typeof REMOTE_CURSE_DURATION_MS !== 'undefined') ? REMOTE_CURSE_DURATION_MS : 60000);
        break;
    }
  };

  // ---- Haversine helper ----

  function __haversineM(lat1, lon1, lat2, lon2) {
    const R = 6371000;
    const toRad = (d) => d * Math.PI / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon/2)**2;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
  }

})();
```

- [ ] **Step 2: Verify file exists**

```bash
ls -la js/22_remote.js
```

Expected: file exists, ~200 lines.

- [ ] **Step 3: Commit**

```bash
git add js/22_remote.js
git commit -m "feat: create 22_remote.js — remote mode state, tap handler, undo, curse effects"
```

---

## Task 4: HTML — Mode Button, HUD Elements, Script Load

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Change mode selector from 2-col to 3-col grid and add Remote button**

Find:
```html
          <div class="grid grid-cols-2 gap-2.5">
            <button class="choiceBtn relative flex flex-col items-center justify-center gap-2 min-h-[72px] rounded-2xl border border-[#2a3f60] bg-[#1e2d44] font-bold text-sm text-gray-100 cursor-pointer transition-all duration-150 hover:bg-[#253550] hover:-translate-y-px active:scale-[.98] is-selected" type="button" data-game-mode="normal" aria-pressed="true">
              <span class="text-2xl">🎯</span><span>Normal</span>
            </button>
            <button class="choiceBtn relative flex flex-col items-center justify-center gap-2 min-h-[72px] rounded-2xl border border-[#2a3f60] bg-[#1e2d44] font-bold text-sm text-gray-100 cursor-pointer transition-all duration-150 hover:bg-[#253550] hover:-translate-y-px active:scale-[.98]" type="button" data-game-mode="gauntlet" aria-pressed="false">
              <span class="text-2xl">⚔️</span><span>Gauntlet</span>
            </button>
          </div>
```

Replace with:
```html
          <div class="grid grid-cols-3 gap-2.5">
            <button class="choiceBtn relative flex flex-col items-center justify-center gap-2 min-h-[72px] rounded-2xl border border-[#2a3f60] bg-[#1e2d44] font-bold text-sm text-gray-100 cursor-pointer transition-all duration-150 hover:bg-[#253550] hover:-translate-y-px active:scale-[.98] is-selected" type="button" data-game-mode="normal" aria-pressed="true">
              <span class="text-2xl">🎯</span><span>Normal</span>
            </button>
            <button class="choiceBtn relative flex flex-col items-center justify-center gap-2 min-h-[72px] rounded-2xl border border-[#2a3f60] bg-[#1e2d44] font-bold text-sm text-gray-100 cursor-pointer transition-all duration-150 hover:bg-[#253550] hover:-translate-y-px active:scale-[.98]" type="button" data-game-mode="gauntlet" aria-pressed="false">
              <span class="text-2xl">⚔️</span><span>Gauntlet</span>
            </button>
            <button class="choiceBtn relative flex flex-col items-center justify-center gap-2 min-h-[72px] rounded-2xl border border-[#2a3f60] bg-[#1e2d44] font-bold text-sm text-gray-100 cursor-pointer transition-all duration-150 hover:bg-[#253550] hover:-translate-y-px active:scale-[.98]" type="button" data-game-mode="remote" aria-pressed="false">
              <span class="text-2xl">🛋️</span><span>Remote</span>
            </button>
          </div>
```

- [ ] **Step 2: Add `remoteModeInfo` blurb after `gauntletModeInfo`**

Find:
```html
          <div id="gauntletModeInfo" class="hidden mt-2.5 px-3 py-2.5 rounded-xl bg-[#111827] border border-[#1e3a5f] text-xs text-slate-300 leading-snug">
            Find 5 targets back-to-back. One 90-minute clock. No scores between targets — only your final average counts.
          </div>
```

Replace with:
```html
          <div id="gauntletModeInfo" class="hidden mt-2.5 px-3 py-2.5 rounded-xl bg-[#111827] border border-[#1e3a5f] text-xs text-slate-300 leading-snug">
            Find 5 targets back-to-back. One 90-minute clock. No scores between targets — only your final average counts.
          </div>
          <div id="remoteModeInfo" class="hidden mt-2.5 px-3 py-2.5 rounded-xl bg-[#111827] border border-[#1e3a5f] text-xs text-slate-300 leading-snug">
            Tap the map to move — no walking required. Short: 15 moves · 5 min. Medium: 20 moves · 8 min. Long: 25 moves · 12 min.
          </div>
```

- [ ] **Step 3: Add `#remoteMoveCounter` and `#remoteUndoBtn` to the HUD**

Find:
```html
      <div id="timerWidget" class="flex items-center gap-2.5 h-[46px] px-4 rounded-2xl bg-[#111827] border border-[#1e3a5f] shadow-fab tabular-nums select-none cursor-pointer" aria-label="Round timer" title="Tap for info">
        <span id="timerMain" class="font-bold text-cyan-400 tracking-tight">30:00</span>
        <span id="timerPenalty" class="font-bold text-red-400 tracking-tight" style="display:none;"></span>
        <span id="timerCurseIndicator" class="text-[10px] font-bold text-purple-400 tracking-tight hidden flex items-center gap-1">⚗ <span id="timerCurseCountdown">0:00</span></span>
      </div>
```

Replace with:
```html
      <div id="timerWidget" class="flex items-center gap-2.5 h-[46px] px-4 rounded-2xl bg-[#111827] border border-[#1e3a5f] shadow-fab tabular-nums select-none cursor-pointer" aria-label="Round timer" title="Tap for info">
        <span id="timerMain" class="font-bold text-cyan-400 tracking-tight">30:00</span>
        <span id="timerPenalty" class="font-bold text-red-400 tracking-tight" style="display:none;"></span>
        <span id="timerCurseIndicator" class="text-[10px] font-bold text-purple-400 tracking-tight hidden flex items-center gap-1">⚗ <span id="timerCurseCountdown">0:00</span></span>
        <span id="remoteMoveCounter" class="hidden font-bold text-purple-400 tracking-tight text-sm">–</span>
      </div>
      <button id="remoteUndoBtn" class="hidden text-[11px] font-bold text-amber-300 bg-[#111827]/90 border border-[#2a3f60] rounded-lg px-2.5 py-1 cursor-pointer select-none" type="button" aria-label="Undo last move" onclick="try { if (typeof window.undoLastMove === 'function') window.undoLastMove(); } catch(e) {}">↩ Undo</button>
```

- [ ] **Step 4: Load `22_remote.js` after `21_gauntlet.js`**

Find:
```html
        await load('./js/21_gauntlet.js?cb=' + cb);
```

Replace with:
```html
        await load('./js/21_gauntlet.js?cb=' + cb);
        await load('./js/22_remote.js?cb=' + cb);
```

- [ ] **Step 5: Update BUILD_ID**

Update `BUILD_ID` in `js/00_config.js` to `2026-03-30.remote-html`.

- [ ] **Step 6: Commit**

```bash
git add index.html js/00_config.js
git commit -m "feat: add Remote mode button, move counter HUD, undo button, load 22_remote.js"
```

---

## Task 5: Mode Selector Wiring in `js/02_dom.js`

**Files:**
- Modify: `js/02_dom.js` (~lines 808–850)

- [ ] **Step 1: Extend `__applyGauntletLengthConstraints` to also handle `remoteModeInfo`**

Find:
```js
  function __applyGauntletLengthConstraints(mode) {
    const lengthBtns = document.querySelectorAll('[data-game-length]');
    const infoBlock = document.getElementById('gauntletModeInfo');
    if (mode === 'gauntlet') {
```

Replace with:
```js
  function __applyGauntletLengthConstraints(mode) {
    const lengthBtns = document.querySelectorAll('[data-game-length]');
    const infoBlock = document.getElementById('gauntletModeInfo');
    const remoteInfoBlock = document.getElementById('remoteModeInfo');
    if (remoteInfoBlock) remoteInfoBlock.classList.add('hidden');
    if (mode === 'remote') {
      lengthBtns.forEach(btn => {
        btn.classList.remove('opacity-40', 'pointer-events-none');
        btn.removeAttribute('aria-disabled');
      });
      if (infoBlock) infoBlock.classList.add('hidden');
      if (remoteInfoBlock) remoteInfoBlock.classList.remove('hidden');
      return;
    }
    if (mode === 'gauntlet') {
```

- [ ] **Step 2: Verify**

Open `js/02_dom.js` and confirm `remoteModeInfo` is shown when `mode === 'remote'` and hidden for all other modes. Confirm gauntlet logic is unchanged.

- [ ] **Step 3: Update BUILD_ID**

Update `BUILD_ID` in `js/00_config.js` to `2026-03-30.remote-selector`.

- [ ] **Step 4: Commit**

```bash
git add js/02_dom.js js/00_config.js
git commit -m "feat: show remoteModeInfo in mode selector when Remote is selected"
```

---

## Task 6: GPS Suppression

**Files:**
- Modify: `js/07_geolocation.js` (line 172 area)
- Modify: `js/02_dom.js` (`startNewGameFromMenuOrDebug`)

- [ ] **Step 1: Skip `startGeolocationWatch` when remote mode is active**

In `js/07_geolocation.js`, find:
```js
function startGeolocationWatch() {
  if (window.__holdGeoWatch) return;
  if (debugMode) return;
```

Replace with:
```js
function startGeolocationWatch() {
  if (window.__holdGeoWatch) return;
  if (debugMode) return;
  if (typeof window.isRemoteActive === 'function' && window.isRemoteActive()) return;
```

- [ ] **Step 2: Skip GPS watch restart in `startNewGameFromMenuOrDebug` for remote**

In `js/02_dom.js`, find the `finally` block in `startNewGameFromMenuOrDebug`:
```js
      if (_heldGeoWatch) {
        window.__holdGeoWatch = false;
        try { if (typeof startGeolocationWatch === 'function') startGeolocationWatch(); } catch(e) {}
      }
```

Replace with:
```js
      if (_heldGeoWatch) {
        window.__holdGeoWatch = false;
        const _setup = typeof window.getGameSetupSelection === 'function' ? window.getGameSetupSelection() : null;
        if (!(_setup && _setup.mode === 'remote')) {
          try { if (typeof startGeolocationWatch === 'function') startGeolocationWatch(); } catch(e) {}
        }
      }
```

- [ ] **Step 3: Update BUILD_ID**

Update `BUILD_ID` in `js/00_config.js` to `2026-03-30.remote-gps`.

- [ ] **Step 4: Commit**

```bash
git add js/07_geolocation.js js/02_dom.js js/00_config.js
git commit -m "feat: suppress GPS watch for remote mode rounds"
```

---

## Task 7: Remote Init Hook in `js/02_dom.js`

**Files:**
- Modify: `js/02_dom.js` (~line 510)

- [ ] **Step 1: Call `__initRemoteIfNeeded` in `startNewGameFromMenuOrDebug`**

Find:
```js
      try { if (typeof window.__initGauntletIfNeeded === 'function') window.__initGauntletIfNeeded(); } catch(e) {}
      await pickNewTarget(true);
```

Replace with:
```js
      try { if (typeof window.__initGauntletIfNeeded === 'function') window.__initGauntletIfNeeded(); } catch(e) {}
      try { if (typeof window.__initRemoteIfNeeded === 'function') window.__initRemoteIfNeeded(); } catch(e) {}
      await pickNewTarget(true);
```

- [ ] **Step 2: Reset remote state in the debug reset path**

Find:
```js
    selectedGameMode = 'normal';
    selectChoice('[data-game-mode]', 'data-game-mode', 'normal');
    __applyGauntletLengthConstraints('normal');
    try { if (typeof window.setGameSetupSelection === 'function') window.setGameSetupSelection({ mode: 'normal' }); } catch(e) {}
```

Add after it:
```js
    try { if (typeof window.__resetRemoteState === 'function') window.__resetRemoteState(); } catch(e) {}
```

- [ ] **Step 3: Update BUILD_ID**

Update `BUILD_ID` in `js/00_config.js` to `2026-03-30.remote-init`.

- [ ] **Step 4: Commit**

```bash
git add js/02_dom.js js/00_config.js
git commit -m "feat: call __initRemoteIfNeeded on game start; reset remote state on mode reset"
```

---

## Task 8: Move Counter in `js/09_ui_helpers.js`

**Files:**
- Modify: `js/09_ui_helpers.js`

- [ ] **Step 1: Update move counter in `updateHUD`**

In `js/09_ui_helpers.js`, find the section after the timer phase/color logic ends (after the `if (elTimerCurse)` block, around line 320). Add at the end of the `updateHUD` function, before the closing `}`:

Find this line (it's near the end of `updateHUD`):
```js
  if (elTimerCurse) {
```

After the entire `if (elTimerCurse) { ... }` block closes, add:

```js
  // Remote move counter
  const elMoveCounter = document.getElementById('remoteMoveCounter');
  if (elMoveCounter) {
    if (typeof window.isRemoteActive === 'function' && window.isRemoteActive()) {
      elMoveCounter.classList.remove('hidden');
      const moves = typeof window.getMovesRemaining === 'function' ? window.getMovesRemaining() : 0;
      elMoveCounter.textContent = `${moves}`;
      if (moves === 0) {
        elMoveCounter.style.color = '#f87171';
      } else if (moves <= 3) {
        elMoveCounter.style.color = '#fbbf24';
      } else {
        elMoveCounter.style.color = '#a78bfa';
      }
    } else {
      elMoveCounter.classList.add('hidden');
    }
  }
```

- [ ] **Step 2: Verify**

Read `js/09_ui_helpers.js` and confirm the move counter block is inside `updateHUD` and references `#remoteMoveCounter`.

- [ ] **Step 3: Update BUILD_ID**

Update `BUILD_ID` in `js/00_config.js` to `2026-03-30.remote-hud`.

- [ ] **Step 4: Commit**

```bash
git add js/09_ui_helpers.js js/00_config.js
git commit -m "feat: render remote move counter in updateHUD"
```

---

## Task 9: Curse Gate in `js/19_curses.js`

**Files:**
- Modify: `js/19_curses.js` (`applyCurse` function, ~line 112)

- [ ] **Step 1: Add remote curse gate at the top of `applyCurse`**

Find:
```js
  function applyCurse(curseId, { durationMs = null } = {}) {
    const id = String(curseId || "").trim();
    if (!id) return { curse: null, isNew: false };

    const def = getCurseDefById(id);
```

Replace with:
```js
  function applyCurse(curseId, { durationMs = null } = {}) {
    const id = String(curseId || "").trim();
    if (!id) return { curse: null, isNew: false };

    const _remoteActive = typeof window.isRemoteActive === 'function' && window.isRemoteActive();

    // Remote mode: route remote-specific curses to 22_remote.js handler
    if (_remoteActive && (id === 'remote_doublestep' || id === 'remote_shakyhands' || id === 'remote_anchored' || id === 'remote_tunnelvision')) {
      try { if (typeof window.applyRemoteCurse === 'function') window.applyRemoteCurse(id); } catch(e) {}
      return { curse: { id }, isNew: true };
    }

    // Remote mode: suppress timer-based curses
    if (_remoteActive && (id === 'overcharged' || id === 'timepen_minor' || id === 'timepen_moderate' || id === 'timepen_major')) {
      return { curse: null, isNew: false };
    }

    const def = getCurseDefById(id);
```

- [ ] **Step 2: Override curse duration for remote mode**

In the same function, find:
```js
    const dur = (typeof durationMs === "number" && isFinite(durationMs))
      ? durationMs
      : (def && typeof def.durationMs === "number" ? def.durationMs : (CURSES_CONFIG && CURSES_CONFIG.defaultDurationMs) || DEFAULT_DURATION_MS);
```

Replace with:
```js
    const _remoteDur = _remoteActive ? ((typeof REMOTE_CURSE_DURATION_MS === 'number') ? REMOTE_CURSE_DURATION_MS : 60000) : null;
    const dur = _remoteDur !== null
      ? _remoteDur
      : ((typeof durationMs === "number" && isFinite(durationMs))
          ? durationMs
          : (def && typeof def.durationMs === "number" ? def.durationMs : (CURSES_CONFIG && CURSES_CONFIG.defaultDurationMs) || DEFAULT_DURATION_MS));
```

- [ ] **Step 3: Verify**

Read `js/19_curses.js` and confirm:
- Remote curse IDs are routed to `window.applyRemoteCurse`
- Disabled curse IDs return early
- Duration is overridden to `REMOTE_CURSE_DURATION_MS` in remote mode

- [ ] **Step 4: Update BUILD_ID**

Update `BUILD_ID` in `js/00_config.js` to `2026-03-30.remote-curses`.

- [ ] **Step 5: Commit**

```bash
git add js/19_curses.js js/00_config.js
git commit -m "feat: gate curses for remote mode — suppress timer curses, override duration, route remote curse IDs"
```

---

## Task 10: Persistence — Restore Remote State on Boot

**Files:**
- Modify: `js/13_boot.js` (~line 176)

- [ ] **Step 1: Restore remote state alongside gauntlet state**

In `js/13_boot.js`, find (appears twice, on lines ~176 and ~181):
```js
      try { if (typeof window.restoreGauntletState === 'function' && saved.gauntletState) window.restoreGauntletState(saved.gauntletState); } catch(e) {}
```

For **both** occurrences, add the remote restore immediately after:
```js
      try { if (typeof window.restoreRemoteState === 'function' && saved.remoteState) window.restoreRemoteState(saved.remoteState); } catch(e) {}
```

- [ ] **Step 2: Verify**

Read `js/13_boot.js` lines 170–190 and confirm both restore call sites now include the `restoreRemoteState` line.

- [ ] **Step 3: Update BUILD_ID**

Update `BUILD_ID` in `js/00_config.js` to `2026-03-30.remote-persistence`.

- [ ] **Step 4: Commit**

```bash
git add js/13_boot.js js/00_config.js
git commit -m "feat: restore remote state on page load from persisted save"
```

---

## Task 11: End-to-End Verification

**No code changes — testing only.**

- [ ] **Step 1: Load the game in a browser and open the New Game panel**

Confirm:
- Mode selector shows three equal-width buttons: Normal, Gauntlet, Remote
- Tapping Remote shows `remoteModeInfo` blurb; tapping Normal/Gauntlet hides it

- [ ] **Step 2: Start a Short Remote game**

Confirm:
- Move counter (`#remoteMoveCounter`) appears beside the timer, showing `15`
- Timer shows 5:00
- GPS watch is not continuously updating player position (player stays put)

- [ ] **Step 3: Tap the map 12 times**

Confirm:
- Player marker teleports to each tapped location
- Move counter decrements with each tap
- Undo button appears briefly after each tap and disappears after ~3 seconds

- [ ] **Step 4: Use undo**

After a tap, immediately tap Undo.
Confirm:
- Player returns to previous position
- Move counter increments by 1
- Undo button disappears and does not appear on the next tap (one use only)

- [ ] **Step 5: Continue until 3 moves remain**

Confirm:
- A persistent toast appears: "⚠️ 3 moves remaining!"
- Move counter turns amber

- [ ] **Step 6: Use last 3 moves**

Confirm:
- At 0 moves, the toast "No moves left — locking in your position…" appears
- Lock-in triggers automatically after the toast
- Result modal appears

- [ ] **Step 7: Refresh mid-game (before lock-in)**

Start a new remote game, make 5 taps, then refresh.
Confirm:
- Game resumes with correct move count and player position
- Remote mode is still active after refresh

- [ ] **Step 8: Verify curse suppression (requires debug mode)**

Open debug curse picker. In remote mode, attempting to apply `overcharged`, `timepen_minor`, `timepen_moderate`, `timepen_major` should silently no-op (confirm no effect).

- [ ] **Step 9: Verify remote curse effects (requires debug mode)**

Apply `remote_anchored` — confirm move count drops by 3 immediately.
Apply `remote_doublestep` — confirm next tap costs 2 moves.
Apply `remote_tunnelvision` — confirm tapping more than 300m away shows "Tunnel Vision" toast and does not move player.
Apply `remote_shakyhands` — confirm undo button no longer appears after taps.

- [ ] **Step 10: Commit BUILD_ID update**

Update `BUILD_ID` in `js/00_config.js` to `2026-03-30.remote-mode`.

```bash
git add js/00_config.js
git commit -m "feat: complete remote mode implementation"
git push
```
