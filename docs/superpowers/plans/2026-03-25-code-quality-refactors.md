# Code Quality Refactors — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the highest-impact code quality issues identified in the March 2026 review — magic numbers, duplicated restore logic, copy-pasted curse rolls, nested setTimeout anti-pattern, and the HUD tick/render mixing.

**Architecture:** Each task is a targeted, local change. No new abstractions, no file reorganisation. All changes preserve existing runtime behaviour and are safe to verify manually in browser. `bindUI()` decomposition (a 1,100-LOC refactor) is explicitly deferred — it is the next logical step after these are done but deserves its own plan.

**Tech Stack:** Vanilla JS (ES6), no build step. Verify in browser. No test framework — verification steps are manual browser checks.

---

## Task 1: Replace `30 * 60 * 1000` magic literals with `ROUND_TIME_LIMIT_MS`

**Files:**
- Modify: `js/04_state.js:85,87,105`
- Modify: `js/09_ui_helpers.js:226`
- Modify: `js/13_boot.js:70`

The constant `ROUND_TIME_LIMIT_MS = 30 * 60 * 1000` is defined in `js/00_config.js` (which loads before all these files). The fallback literals should reference it. Note: `js/13_boot.js:75` uses `_savedLimit + 30 * 60 * 1000` where the second `30 * 60 * 1000` is an expiry _grace period_ (not the round limit) — leave that one as-is.

- [ ] **Step 1: Fix `js/04_state.js` line 85 — `getRoundTimeLimitMs` short-game return**

Current:
```js
    return 30 * 60 * 1000;
```
Replace with:
```js
    return (typeof ROUND_TIME_LIMIT_MS === 'number' && isFinite(ROUND_TIME_LIMIT_MS)) ? ROUND_TIME_LIMIT_MS : (30 * 60 * 1000);
```

- [ ] **Step 2: Fix `js/04_state.js` line 87 — catch fallback**

Current:
```js
    return (typeof ROUND_TIME_LIMIT_MS === 'number' && isFinite(ROUND_TIME_LIMIT_MS)) ? ROUND_TIME_LIMIT_MS : (30 * 60 * 1000);
```
This line is already correct. No change needed — confirm and move on.

- [ ] **Step 3: Fix `js/04_state.js` line 105 — `getToolUnlockInfo` fallback**

Current:
```js
  const limit = (typeof window.getRoundTimeLimitMs === 'function') ? window.getRoundTimeLimitMs() : ((typeof ROUND_TIME_LIMIT_MS === 'number' && isFinite(ROUND_TIME_LIMIT_MS)) ? ROUND_TIME_LIMIT_MS : (30 * 60 * 1000));
```
This line already uses the constant correctly. No change needed — confirm and move on.

- [ ] **Step 4: Fix `js/09_ui_helpers.js` line 226 — `updateHUD` fallback**

Current (the third fallback in the ternary chain):
```js
      const limit = (typeof window.getRoundTimeLimitMs === "function") ? window.getRoundTimeLimitMs() : (((typeof ROUND_TIME_LIMIT_MS === "number" && isFinite(ROUND_TIME_LIMIT_MS)) ? ROUND_TIME_LIMIT_MS : (30 * 60 * 1000)));
```
This already uses the constant. No change needed — confirm and move on.

- [ ] **Step 5: Fix `js/13_boot.js` line 70 — fallback in expiry check**

Current:
```js
    const _savedLimit = (typeof window.getRoundTimeLimitMs === 'function') ? window.getRoundTimeLimitMs() : 30 * 60 * 1000;
```
Replace with:
```js
    const _savedLimit = (typeof window.getRoundTimeLimitMs === 'function') ? window.getRoundTimeLimitMs() : ((typeof ROUND_TIME_LIMIT_MS === 'number' && isFinite(ROUND_TIME_LIMIT_MS)) ? ROUND_TIME_LIMIT_MS : (30 * 60 * 1000));
```

- [ ] **Step 6: Fix `js/02_dom.js` line 326 — fallback in that file**

Find the line containing `const limitMs = (typeof window.getRoundTimeLimitMs === 'function') ? window.getRoundTimeLimitMs() : (30 * 60 * 1000);` and replace with:
```js
      const limitMs = (typeof window.getRoundTimeLimitMs === 'function') ? window.getRoundTimeLimitMs() : ((typeof ROUND_TIME_LIMIT_MS === 'number' && isFinite(ROUND_TIME_LIMIT_MS)) ? ROUND_TIME_LIMIT_MS : (30 * 60 * 1000));
```

- [ ] **Step 7: Verify in browser**

Open the game, start a short round, check the timer counts down from ~30 minutes. Confirm no console errors on page load. Check the timer expiry still auto-locks (either wait or use the debug "+5 min" button repeatedly).

- [ ] **Step 8: Commit**

```bash
cd /Users/sierro/Claude
git add js/04_state.js js/09_ui_helpers.js js/13_boot.js js/02_dom.js
git commit -m "refactor: replace 30*60*1000 literals with ROUND_TIME_LIMIT_MS fallback"
git push
```

---

## Task 2: Extract duplicated round restore logic in `13_boot.js`

**Files:**
- Modify: `js/13_boot.js:110–198`

Lines 110–151 (`targetCustom` branch) and 156–198 (`targetIdx` branch) are nearly identical — same fields, same logic. Extract a shared helper. The only difference is that `targetCustom` branch also calls `__nearestPoiTo` for the debug label (lines 100–108), which already runs _before_ the common block.

- [ ] **Step 1: Write `__restoreCommonRoundFields` just before the `init()` IIFE**

Insert this function before line 45 (`(async function init() {`):
```js
function __restoreCommonRoundFields(saved, _savedExpiredOnLoad) {
  roundStartMs = (typeof saved.roundStartMs === 'number') ? saved.roundStartMs : Date.now();
  penaltyMs    = (typeof saved.penaltyMs    === 'number') ? saved.penaltyMs    : 0;

  const restoredHeatValue = (typeof saved.heatValue === 'number' && isFinite(saved.heatValue))
    ? saved.heatValue
    : ((typeof saved.heatLevel === 'number' && isFinite(saved.heatLevel)) ? saved.heatLevel : 0);
  try {
    if (typeof setHeatValue === 'function') {
      setHeatValue(restoredHeatValue, 'restore');
    } else {
      heatLevel = restoredHeatValue;
    }
  } catch (e) {}

  heatLastMs = (typeof saved.heatLastMs === 'number') ? saved.heatLastMs : Date.now();
  thermoRun  = (saved.thermoRun && typeof saved.thermoRun.startMs === 'number') ? saved.thermoRun : null;

  try { if (typeof window.__restoreUsedToolOptionsThisRound === 'function') window.__restoreUsedToolOptionsThisRound(saved.usedToolOptions || null); } catch(e) {}
  try { if (typeof window.__restoreCursesFromSave === 'function') window.__restoreCursesFromSave(saved.activeCurses); } catch (e) {}

  if (typeof saved.debugMode === 'boolean') {
    debugMode = saved.debugMode;
    try { const cb = document.getElementById('dbgMode'); if (cb) cb.checked = !!debugMode; } catch (e) {}
  }

  if (saved.playerSaved && typeof saved.playerSaved.lat === 'number' && typeof saved.playerSaved.lon === 'number') {
    try {
      if (typeof setPlayerLatLng === 'function') {
        setPlayerLatLng(saved.playerSaved.lat, saved.playerSaved.lon, { source: 'restore', manual: true, force: true });
      } else {
        player = { lat: saved.playerSaved.lat, lon: saved.playerSaved.lon, manualOverride: true };
      }
    } catch (e) {}
  }

  if (_savedExpiredOnLoad) window.__roundExpiredOnLoad = true;
}
```

- [ ] **Step 2: Replace the duplicated block in the `targetCustom` branch**

Replace lines 110–152 (the block starting `roundStartMs = (typeof saved.roundStartMs ...` through `if (_savedExpiredOnLoad) window.__roundExpiredOnLoad = true;`) with a single call:
```js
      __restoreCommonRoundFields(saved, _savedExpiredOnLoad);
```

Keep the lines above (target assignment, `__nearestPoiTo` call) and the lines after (closing brace of the `else if`) unchanged.

- [ ] **Step 3: Replace the duplicated block in the `targetIdx` branch**

Similarly replace lines 156–198 (from `roundStartMs = ...` through `if (_savedExpiredOnLoad) ...`) with:
```js
      __restoreCommonRoundFields(saved, _savedExpiredOnLoad);
```

Keep `targetIdx = saved.targetIdx; target = POIS[targetIdx];` before the call.

- [ ] **Step 4: Verify in browser**

Load the game, start a round, close the tab, reopen. Confirm the round is restored correctly: timer continues from where it was, heat is preserved, curses are restored, player position is restored if it was manually set.

- [ ] **Step 5: Commit**

```bash
git add js/13_boot.js
git commit -m "refactor: extract __restoreCommonRoundFields to eliminate ~80 lines of duplicated restore logic"
git push
```

---

## Task 3: Extract `__rollCurse` helper in `19_curses.js`

**Files:**
- Modify: `js/19_curses.js:239–322` (inside `maybeTriggerCurseFromQuestion`)

The Overcharged, Veil, Blackout, Ghost, and (implicitly) tier curse rolls all follow the same pattern: read a probability from config by heat level, apply difficulty scaling, roll `Math.random()`, call `applyCurse`. This is copy-pasted 4 times.

- [ ] **Step 1: Add `__rollCurse` inside the IIFE, before `maybeTriggerCurseFromQuestion`**

Insert this function just before `function maybeTriggerCurseFromQuestion(` (around line 212):
```js
  /**
   * Read probability for `configKey[level]` from CURSES_CONFIG, apply difficulty scaling,
   * roll Math.random(), and call applyCurse(curseId) if it hits.
   * Returns the applyCurse result, or null if it didn't trigger.
   */
  function __rollCurse(configKey, curseId, level, diff) {
    try {
      if (!CURSES_CONFIG || !CURSES_CONFIG[configKey]) return null;
      const raw = CURSES_CONFIG[configKey][String(level)];
      let p = (typeof raw === 'number' && isFinite(raw)) ? Math.max(0, Math.min(1, raw)) : 0;
      if (p <= 0) return null;
      if (diff === 'easy') p *= 0.75;
      else if (diff === 'hard') p = Math.min(1, p * 1.5);
      return (Math.random() < p) ? applyCurse(curseId) : null;
    } catch (e) {
      return null;
    }
  }
```

- [ ] **Step 2: Replace the 4 copy-pasted roll blocks in `maybeTriggerCurseFromQuestion`**

Replace lines 238–322 (the `// Second independent roll: Overcharged` through `// Fifth independent roll: Ghost` blocks) with:
```js
      const diff = (() => {
        try { return (typeof window.getSelectedGameDifficulty === 'function') ? window.getSelectedGameDifficulty() : 'normal'; } catch(e) { return 'normal'; }
      })();

      // Second independent roll: Overcharged (time-penalty curse)
      const overchargedResult = __rollCurse('overchargedChanceByHeatLevel', 'overcharged', level, diff);

      // Third independent roll: Veil (canvas overlay hidden)
      const veilResult = __rollCurse('veilChanceByHeatLevel', 'veil', level, diff);

      // Fourth independent roll: Blackout (map tiles + canvas hidden)
      const blackoutResult = __rollCurse('blackoutChanceByHeatLevel', 'blackout', level, diff);

      // Fifth independent roll: Ghost (player dot hidden)
      const ghostResult = __rollCurse('ghostChanceByHeatLevel', 'ghost', level, diff);
```

Also update the existing first difficulty-scaling block (lines 226–231) to reuse the same `diff` variable you compute above. Move the existing `diff` read to before the first roll and remove the per-roll inline difficulty reads. The tier curse roll (the `triggered` variable, line 233–236) reads `diff` for its own scaling via the existing code — also replace that scaling to use the shared `diff`:

Find this existing block:
```js
      // Scale curse probability by difficulty
      try {
        const diff = (typeof window.getSelectedGameDifficulty === 'function') ? window.getSelectedGameDifficulty() : 'normal';
        if (diff === 'easy') p *= 0.75;
        else if (diff === 'hard') p = Math.min(1, p * 1.5);
      } catch(e) {}
```
And replace it with just the scaling lines (no new `diff` declaration — the shared one computed above is already in scope):
```js
      if (diff === 'easy') p *= 0.75;
      else if (diff === 'hard') p = Math.min(1, p * 1.5);
```

Note: move the `const diff = ...` block to _before_ `let p = getTriggerChanceForHeatLevel(level);` so it's in scope for both the tier roll and `__rollCurse` calls.

- [ ] **Step 3: Verify in browser**

Open game, start a round. Use tools to raise heat to level 2+. Verify curses still trigger at the right frequency. Use the debug curse picker to confirm individual curses can still be manually applied. Check the console for errors.

- [ ] **Step 4: Commit**

```bash
git add js/19_curses.js
git commit -m "refactor: extract __rollCurse helper to eliminate 4 copy-pasted curse probability rolls"
git push
```

---

## Task 4: Fix nested setTimeout auto-lock → use `enqueueToast` Promise

**Files:**
- Modify: `js/09_ui_helpers.js:259–265`

The current code uses a nested `setTimeout` (100ms outer + 1200ms inner) to sequence a toast then auto-lock. `enqueueToast` already returns a Promise that resolves when the toast is dismissed, making the nested timeouts unnecessary.

- [ ] **Step 1: Replace the nested setTimeout block**

Find this block (around line 259, inside `updateHUD` in the `phase === 'expired'` branch):
```js
            setTimeout(() => {
              try { if (typeof showToast === 'function') showToast("Time's up — locking in your position…", false); } catch(e) {}
              setTimeout(() => {
                try { if (typeof window.lockInGuess === 'function') window.lockInGuess({ autoLock: true }); } catch(e) {}
              }, 1200);
            }, 100);
```
Replace with:
```js
            try {
              window.enqueueToast("Time's up — locking in your position…", false)
                .then(() => {
                  try { if (typeof window.lockInGuess === 'function') window.lockInGuess({ autoLock: true }); } catch(e) {}
                });
            } catch(e) {}
```

- [ ] **Step 2: Verify in browser**

Use the debug "+5 min" button repeatedly to advance the timer past 30 minutes. Confirm: "Time's up" toast appears, then after the player dismisses it (or it auto-dismisses if `autoDismissMs` is set), `lockInGuess` fires. The sequence should feel the same as before.

- [ ] **Step 3: Commit**

```bash
git add js/09_ui_helpers.js
git commit -m "refactor: replace nested setTimeout auto-lock with enqueueToast().then() chain"
git push
```

---

## Task 5: Separate tick logic from render in `updateHUD`

**Files:**
- Modify: `js/09_ui_helpers.js:212–342` and `:407–415` (`startHUDTicker`)

`updateHUD` currently calls `applyHeatDecay`, `tickCurses`, and `updateCostBadgesFromConfig` at the top — these are state mutations and side effects, not renders. The `startHUDTicker` interval calls `updateHUD` exclusively. Splitting into a `tickGameState` + `renderHUD` pair makes the intent explicit and makes `renderHUD` safe to call without side effects (e.g. from event handlers).

- [ ] **Step 1: Extract the three side-effecting calls into `__tickGameState`**

Add this function just before `updateHUD`:
```js
function __tickGameState() {
  try { if (typeof applyHeatDecay   === 'function') applyHeatDecay(Date.now()); }   catch (e) {}
  try { if (typeof tickCurses       === 'function') tickCurses(Date.now()); }       catch (e) {}
  try { if (typeof updateCostBadgesFromConfig === 'function') updateCostBadgesFromConfig(); } catch (e) {}
}
```

- [ ] **Step 2: Remove those three calls from the top of `updateHUD`**

Delete lines 213–215 in `updateHUD`:
```js
  try { if (typeof applyHeatDecay === "function") applyHeatDecay(Date.now()); } catch (e) {}
  try { if (typeof tickCurses === 'function') tickCurses(Date.now()); } catch (e) {}
  try { if (typeof updateCostBadgesFromConfig === 'function') updateCostBadgesFromConfig(); } catch (e) {}
```

- [ ] **Step 3: Update `startHUDTicker` to call both in sequence**

Find `startHUDTicker` (around line 407). Replace its interval callback:
```js
// Before:
  __hudTicker = setInterval(() => {
    try { updateHUD(); } catch (e) {}
  }, 250);
  document.addEventListener("visibilitychange", () => {
    try { updateHUD(); } catch (e) {}
  });

// After:
  __hudTicker = setInterval(() => {
    try { __tickGameState(); } catch (e) {}
    try { updateHUD(); }       catch (e) {}
  }, 250);
  document.addEventListener("visibilitychange", () => {
    try { __tickGameState(); } catch (e) {}
    try { updateHUD(); }       catch (e) {}
  });
```

- [ ] **Step 4: Verify in browser**

Start a round. Confirm the timer counts down, heat widget updates, cost badges refresh. Use a tool to raise heat and verify curses still trigger (proving `tickCurses` still runs). Check that `updateCostBadgesFromConfig` still updates tool costs on heat change.

- [ ] **Step 5: Commit**

```bash
git add js/09_ui_helpers.js
git commit -m "refactor: separate __tickGameState from updateHUD render pass in HUD ticker"
git push
```
