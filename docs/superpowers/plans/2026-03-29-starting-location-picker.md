# Starting Location Picker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow players to optionally tap the map to seed the target area for a new game, while real GPS tracking still takes over during gameplay.

**Architecture:** Three files change. `js/07_geolocation.js` gains a guard flag to defer the GPS watch. `index.html` gains a Starting Location section in `panelNewGame` plus hidden pick-mode UI elements. `js/02_dom.js` gains the pick-mode state, the `__startLocationPickMode()` function, and a seeded code path through `startNewGameFromMenuOrDebug()`.

**Tech Stack:** Vanilla JS, Leaflet (L.marker draggable), Tailwind CSS utility classes (no build step).

---

## File Map

| File | What changes |
|------|-------------|
| `js/07_geolocation.js` | Add `window.__holdGeoWatch` guard at top of `startGeolocationWatch()` |
| `index.html` | Add Starting Location `choiceBtn` section to `panelNewGame`; add hidden `#locationPickBanner` and `#locationPickConfirmBar` elements |
| `js/02_dom.js` | Add `__newGameLocationMode`, `__pickedAreaSeed`, `__pickModeMarker` vars; update `positionPlayerForNewGame` to accept `opts`; add `__startLocationPickMode()`; update `btnNewGameStartReal` click handler; add seeded path to `startNewGameFromMenuOrDebug()` |

---

### Task 1: Guard `startGeolocationWatch` with `__holdGeoWatch`

**Files:**
- Modify: `js/07_geolocation.js:172`

- [ ] **Step 1: Add the guard**

In `js/07_geolocation.js`, find `startGeolocationWatch()` which starts at line 172. Add the guard as the very first line of the function body:

```js
function startGeolocationWatch() {
  if (window.__holdGeoWatch) return;   // <-- add this line
  if (debugMode) return;
  if (!navigator.geolocation) {
```

- [ ] **Step 2: Verify**

Open the file and confirm `if (window.__holdGeoWatch) return;` is the first statement in `startGeolocationWatch`. No automated test needed — this is a guard that is verified in Task 5.

- [ ] **Step 3: Commit**

```bash
git add js/07_geolocation.js
git commit -m "feat: add __holdGeoWatch guard to startGeolocationWatch"
```

---

### Task 2: Add HTML — Starting Location section and pick-mode overlay elements

**Files:**
- Modify: `index.html` (two insertion points)

- [ ] **Step 1: Add the Starting Location choice section to `panelNewGame`**

In `index.html`, find this block (around line 380):

```html
          <div id="gauntletModeInfo" class="hidden mt-2.5 px-3 py-2.5 rounded-xl bg-[#111827] border border-[#1e3a5f] text-xs text-slate-300 leading-snug">
            Find 5 targets back-to-back. One 90-minute clock. No scores between targets — only your final average counts.
          </div>
        </div>

        <div class="mt-4">
          <div class="sectionLabel text-[11px] uppercase tracking-widest text-cyan-400 font-semibold mb-2">Difficulty</div>
```

Insert a new section between the closing `</div>` of the Mode block and the opening `<div class="mt-4">` of the Difficulty block:

```html
          <div id="gauntletModeInfo" class="hidden mt-2.5 px-3 py-2.5 rounded-xl bg-[#111827] border border-[#1e3a5f] text-xs text-slate-300 leading-snug">
            Find 5 targets back-to-back. One 90-minute clock. No scores between targets — only your final average counts.
          </div>
        </div>

        <div class="mt-4">
          <div class="sectionLabel text-[11px] uppercase tracking-widest text-cyan-400 font-semibold mb-2">Starting Location</div>
          <div class="grid grid-cols-2 gap-2.5">
            <button class="choiceBtn relative flex flex-col items-center justify-center gap-2 min-h-[72px] rounded-2xl border border-[#2a3f60] bg-[#1e2d44] font-bold text-sm text-gray-100 cursor-pointer transition-all duration-150 hover:bg-[#253550] hover:-translate-y-px active:scale-[.98] is-selected" type="button" data-start-location="current" aria-pressed="true">
              <span class="text-2xl">📍</span><span>Current Location</span>
            </button>
            <button class="choiceBtn relative flex flex-col items-center justify-center gap-2 min-h-[72px] rounded-2xl border border-[#2a3f60] bg-[#1e2d44] font-bold text-sm text-gray-100 cursor-pointer transition-all duration-150 hover:bg-[#253550] hover:-translate-y-px active:scale-[.98]" type="button" data-start-location="pick" aria-pressed="false">
              <span class="text-2xl">🗺️</span><span>Pick on Map</span>
            </button>
          </div>
        </div>

        <div class="mt-4">
          <div class="sectionLabel text-[11px] uppercase tracking-widest text-cyan-400 font-semibold mb-2">Difficulty</div>
```

- [ ] **Step 2: Add pick-mode overlay elements**

In `index.html`, find the line just before `<!-- Leaflet -->` (around line 762). Insert the two overlay elements immediately before that comment:

```html
  <!-- ── Location pick mode overlays ──────────────────────── -->
  <div id="locationPickBanner" class="hidden fixed top-0 left-0 right-0 z-[2000] flex items-center justify-between px-4 py-3 bg-[#0f1729] border-b border-[#1e3a5f] text-white text-sm font-medium" style="padding-top: max(0.75rem, env(safe-area-inset-top));">
    <span id="locationPickBannerText">Tap the map to set start area</span>
    <button id="locationPickCancel" class="ml-3 px-3 py-1 rounded-lg border border-[#2a3f60] bg-[#1e2d44] text-gray-300 text-sm cursor-pointer hover:bg-[#253550]" type="button">✕ Cancel</button>
  </div>
  <div id="locationPickConfirmBar" class="hidden fixed bottom-0 left-0 right-0 z-[2000] flex items-center gap-3 px-4 py-3 bg-[#0f1729] border-t border-[#1e3a5f]" style="padding-bottom: max(0.75rem, env(safe-area-inset-bottom));">
    <button id="locationPickRepick" class="flex-1 px-4 py-2.5 rounded-2xl border border-[#2a3f60] bg-[#1e2d44] text-gray-300 text-sm cursor-pointer hover:bg-[#253550]" type="button">Re-pick</button>
    <button id="locationPickConfirm" class="flex-1 px-4 py-3 rounded-2xl bg-emerald-600 border-0 text-white font-bold text-sm cursor-pointer hover:bg-emerald-500 active:scale-[.98] transition-all duration-150" type="button">Confirm</button>
  </div>

  <!-- Leaflet -->
```

- [ ] **Step 3: Verify**

Load the game in a browser. Open the New Game panel. Confirm a "Starting Location" section appears with "Current Location" (selected) and "Pick on Map" buttons. Confirm the overlay divs exist in the DOM but are not visible (`hidden` class).

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "feat: add Starting Location section and pick-mode overlays to HTML"
```

---

### Task 3: Add state variables, update `positionPlayerForNewGame`, wire choice buttons

**Files:**
- Modify: `js/02_dom.js`

- [ ] **Step 1: Add module-level state variables**

In `js/02_dom.js`, find these three lines (around line 660–662):

```js
  let selectedGameLength = ((savedGameSetup && savedGameSetup.length) || 'short').toLowerCase();
  let selectedGameDifficulty = ((savedGameSetup && savedGameSetup.difficulty) || 'normal').toLowerCase();
  let selectedGameMode = ((savedGameSetup && savedGameSetup.mode) || 'normal').toLowerCase();
```

Add three new variables immediately after them:

```js
  let selectedGameLength = ((savedGameSetup && savedGameSetup.length) || 'short').toLowerCase();
  let selectedGameDifficulty = ((savedGameSetup && savedGameSetup.difficulty) || 'normal').toLowerCase();
  let selectedGameMode = ((savedGameSetup && savedGameSetup.mode) || 'normal').toLowerCase();
  let __newGameLocationMode = 'current'; // 'current' | 'picked' — resets to 'current' each page load
  let __pickedAreaSeed = null;           // { lat, lon } | null
  let __pickModeMarker = null;           // Leaflet marker during pick mode
```

- [ ] **Step 2: Apply initial selection and wire choice buttons**

Find the block that calls `selectChoice` for the initial state (around line 672) and then wire the `data-game-mode` buttons (around line 704). Add the Starting Location initial selection and click wiring in the same area:

Find:
```js
  selectChoice('[data-game-length]', 'data-game-length', selectedGameLength);
  selectChoice('[data-game-difficulty]', 'data-game-difficulty', selectedGameDifficulty);
  selectChoice('[data-game-mode]', 'data-game-mode', selectedGameMode);
```

Replace with:
```js
  selectChoice('[data-game-length]', 'data-game-length', selectedGameLength);
  selectChoice('[data-game-difficulty]', 'data-game-difficulty', selectedGameDifficulty);
  selectChoice('[data-game-mode]', 'data-game-mode', selectedGameMode);
  selectChoice('[data-start-location]', 'data-start-location', __newGameLocationMode);
```

Then find the block that wires `data-game-difficulty` buttons (around line 728):
```js
  document.querySelectorAll('[data-game-difficulty]').forEach(btn => {
    btn.addEventListener('click', () => {
      selectedGameDifficulty = (btn.getAttribute('data-game-difficulty') || 'normal').toLowerCase();
      selectChoice('[data-game-difficulty]', 'data-game-difficulty', selectedGameDifficulty);
      try { if (typeof window.setGameSetupSelection === 'function') window.setGameSetupSelection({ difficulty: selectedGameDifficulty }); } catch (e) {}
    });
  });
```

Add the Starting Location wiring immediately after that block:
```js
  document.querySelectorAll('[data-start-location]').forEach(btn => {
    btn.addEventListener('click', () => {
      __newGameLocationMode = (btn.getAttribute('data-start-location') || 'current').toLowerCase();
      selectChoice('[data-start-location]', 'data-start-location', __newGameLocationMode);
    });
  });
```

- [ ] **Step 3: Update `positionPlayerForNewGame` to accept opts**

Find the function signature (around line 361):
```js
  async function positionPlayerForNewGame() {
```

Replace with:
```js
  async function positionPlayerForNewGame(opts = {}) {
```

Then find the `__setPlayerFromCurrentLocation` call inside that function (around line 373–379):
```js
        const fix = await window.__setPlayerFromCurrentLocation({
          source: 'new-game-start',
          force: true,
          centerAfterFix: true,
          geoOpts: { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 }
        });
```

Replace `centerAfterFix: true` with `centerAfterFix: opts.centerAfterFix !== false`:
```js
        const fix = await window.__setPlayerFromCurrentLocation({
          source: 'new-game-start',
          force: true,
          centerAfterFix: opts.centerAfterFix !== false,
          geoOpts: { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 }
        });
```

Also find the fallback `centerOnPlayer()` call in the same function (around line 417, inside the manual geolocation block):
```js
      try { if (typeof centerOnPlayer === 'function') centerOnPlayer(); } catch (e) {}
      try { log(`📍 New game start location: ...`); } catch (e) {}
      try { if (typeof window.__setInitStatus === 'function') window.__setInitStatus(''); } catch(e) {}
      return true;
    } catch (err) {
```

Wrap the `centerOnPlayer()` call there with a guard:
```js
      if (opts.centerAfterFix !== false) {
        try { if (typeof centerOnPlayer === 'function') centerOnPlayer(); } catch (e) {}
      }
      try { log(`📍 New game start location: ...`); } catch (e) {}
```

Also find the `DEFAULT_START_LATLNG` fallback `centerOnPlayer()` call in the `catch (err)` block (around line 427–428):
```js
          setPlayerLatLng(DEFAULT_START_LATLNG.lat, DEFAULT_START_LATLNG.lon, { manual: true, source: 'fallback:default-start', force: true });
          try { if (typeof centerOnPlayer === 'function') centerOnPlayer(); } catch (e) {}
```

Wrap that one too:
```js
          setPlayerLatLng(DEFAULT_START_LATLNG.lat, DEFAULT_START_LATLNG.lon, { manual: true, source: 'fallback:default-start', force: true });
          if (opts.centerAfterFix !== false) {
            try { if (typeof centerOnPlayer === 'function') centerOnPlayer(); } catch (e) {}
          }
```

- [ ] **Step 4: Verify in browser**

Open New Game panel. Click "Pick on Map" — button should get the `is-selected` highlight. Click "Current Location" — it should re-select. Both clicks should toggle `aria-pressed` correctly (inspect DOM). The `positionPlayerForNewGame` change has no visible effect yet.

- [ ] **Step 5: Commit**

```bash
git add js/02_dom.js
git commit -m "feat: add location mode state and wire Starting Location choice buttons"
```

---

### Task 4: Implement `__startLocationPickMode()`

**Files:**
- Modify: `js/02_dom.js`

- [ ] **Step 1: Add the function**

In `js/02_dom.js`, find `function openNewGamePanel()` (around line 489). Insert `__startLocationPickMode` immediately before it:

```js
  function __startLocationPickMode() {
    const banner      = document.getElementById('locationPickBanner');
    const bannerText  = document.getElementById('locationPickBannerText');
    const confirmBar  = document.getElementById('locationPickConfirmBar');
    const cancelBtn   = document.getElementById('locationPickCancel');
    const repickBtn   = document.getElementById('locationPickRepick');
    const confirmBtn  = document.getElementById('locationPickConfirm');

    // Show banner, hide confirm bar
    if (banner)      banner.classList.remove('hidden');
    if (bannerText)  bannerText.textContent = 'Tap the map to set start area';
    if (confirmBar)  confirmBar.classList.add('hidden');

    function _removePinIfExists() {
      if (__pickModeMarker && window.leafletMap) {
        try { window.leafletMap.removeLayer(__pickModeMarker); } catch(e) {}
        __pickModeMarker = null;
      }
    }

    function _cleanup() {
      if (banner)     banner.classList.add('hidden');
      if (confirmBar) confirmBar.classList.add('hidden');
      _removePinIfExists();
      if (window.leafletMap) {
        try { window.leafletMap.off('click', _onMapClick); } catch(e) {}
      }
    }

    function _onMapClick(e) {
      // Drop or move the pin
      _removePinIfExists();
      try {
        __pickModeMarker = L.marker([e.latlng.lat, e.latlng.lng], { draggable: true })
          .addTo(window.leafletMap);
      } catch(e) {}
      if (bannerText)  bannerText.textContent = 'Drag the pin to adjust';
      if (confirmBar)  confirmBar.classList.remove('hidden');
    }

    if (window.leafletMap) {
      try { window.leafletMap.on('click', _onMapClick); } catch(e) {}
    }

    if (cancelBtn) {
      cancelBtn.onclick = () => {
        _cleanup();
        const p = document.getElementById('panelNewGame');
        if (p) p.classList.add('open');
      };
    }

    if (repickBtn) {
      repickBtn.onclick = () => {
        _removePinIfExists();
        if (bannerText)  bannerText.textContent = 'Tap the map to set start area';
        if (confirmBar)  confirmBar.classList.add('hidden');
      };
    }

    if (confirmBtn) {
      confirmBtn.onclick = () => {
        if (!__pickModeMarker) return;
        try {
          const ll = __pickModeMarker.getLatLng();
          __pickedAreaSeed = { lat: ll.lat, lon: ll.lng };
        } catch(e) { return; }
        _cleanup();
        startNewGameFromMenuOrDebug(__pickedAreaSeed);
      };
    }
  }

  function openNewGamePanel() {
```

- [ ] **Step 2: Update `btnNewGameStartReal` click handler to branch on location mode**

Find the existing handler (around line 498):
```js
  on("btnNewGameStartReal","click", () => {
    try {
      if (typeof window.setGameSetupSelection === 'function') {
        window.setGameSetupSelection({
          length: selectedGameLength,
          difficulty: selectedGameDifficulty,
          mode: selectedGameMode,
        });
      }
    } catch (e) {}
    const panelNewGame = document.getElementById("panelNewGame");
    if (panelNewGame) panelNewGame.classList.remove("open");
    startNewGameFromMenuOrDebug();
  });
```

Replace with:
```js
  on("btnNewGameStartReal","click", () => {
    try {
      if (typeof window.setGameSetupSelection === 'function') {
        window.setGameSetupSelection({
          length: selectedGameLength,
          difficulty: selectedGameDifficulty,
          mode: selectedGameMode,
        });
      }
    } catch (e) {}
    const panelNewGame = document.getElementById("panelNewGame");
    if (panelNewGame) panelNewGame.classList.remove("open");
    if (__newGameLocationMode === 'picked') {
      __startLocationPickMode();
    } else {
      startNewGameFromMenuOrDebug();
    }
  });
```

- [ ] **Step 3: Verify pick mode UI in browser**

1. Open New Game panel, select "Pick on Map", hit Start.
2. Panel should close. Top banner "Tap the map to set start area" should appear.
3. Pan the map — no pin should drop.
4. Tap the map — a pin should drop and the confirm bar should appear.
5. Drag the pin — it should move.
6. Tap Re-pick — pin disappears, banner reverts.
7. Tap the map again, then Cancel — panel should reopen.

- [ ] **Step 4: Commit**

```bash
git add js/02_dom.js
git commit -m "feat: implement __startLocationPickMode pick-mode UX"
```

---

### Task 5: Add seeded start path to `startNewGameFromMenuOrDebug()`

**Files:**
- Modify: `js/02_dom.js`

- [ ] **Step 1: Add `areaOverride` parameter and seeded path**

Find the function signature (around line 453):
```js
  async function startNewGameFromMenuOrDebug() {
```

Replace with:
```js
  async function startNewGameFromMenuOrDebug(areaOverride = null) {
```

Then find the `await positionPlayerForNewGame();` call (around line 473):
```js
      await positionPlayerForNewGame();
      clearClues();
      // Refresh live POIs from Overpass based on player location + mode radius.
      try { if (typeof window.__refreshLivePoisForCurrentLocation === 'function') await window.__refreshLivePoisForCurrentLocation(); } catch(e) {}
      // By design: player location first, map centre second, then target pick based on that player location.
      try { if (typeof window.__initGauntletIfNeeded === 'function') window.__initGauntletIfNeeded(); } catch(e) {}
      await pickNewTarget(true);
```

Replace that block with the branched version:
```js
      if (areaOverride && typeof areaOverride.lat === 'number' && typeof areaOverride.lon === 'number') {
        // Seeded path: hold GPS watch, get real fix without centering, then override position to seed.
        window.__holdGeoWatch = true;
        try { if (typeof stopGeolocationWatch === 'function') stopGeolocationWatch(); } catch(e) {}
        await positionPlayerForNewGame({ centerAfterFix: false });
        try {
          if (typeof setPlayerLatLng === 'function') {
            setPlayerLatLng(areaOverride.lat, areaOverride.lon, { source: 'area-seed', force: true });
          }
        } catch(e) {}
        try { if (typeof centerOnPlayer === 'function') centerOnPlayer(); } catch(e) {}
      } else {
        await positionPlayerForNewGame();
      }
      clearClues();
      // Refresh live POIs from Overpass based on player location + mode radius.
      try { if (typeof window.__refreshLivePoisForCurrentLocation === 'function') await window.__refreshLivePoisForCurrentLocation(); } catch(e) {}
      // By design: player location first, map centre second, then target pick based on that player location.
      try { if (typeof window.__initGauntletIfNeeded === 'function') window.__initGauntletIfNeeded(); } catch(e) {}
      await pickNewTarget(true);
      // Release GPS watch hold after full setup so live tracking begins with correct player position.
      if (areaOverride) {
        window.__holdGeoWatch = false;
        try { if (typeof startGeolocationWatch === 'function') startGeolocationWatch(); } catch(e) {}
      }
```

- [ ] **Step 2: Verify full seeded flow in browser**

1. Open New Game panel. Select "Pick on Map". Hit Start.
2. Pick mode activates. Tap a location (e.g. town centre). Hit Confirm.
3. Game should start. The starter photo target should be near the tapped location, not near your actual GPS position.
4. After game loads, check that your player marker (blue dot) moves with your real GPS rather than staying at the tapped spot. (If testing on desktop without GPS, the player marker will stay at the seed location, which is fine — GPS watch would take over on a real device.)

- [ ] **Step 3: Commit**

```bash
git add js/02_dom.js
git commit -m "feat: add seeded start path to startNewGameFromMenuOrDebug"
```

---

### Task 6: Update BUILD_ID and push

**Files:**
- Modify: `js/00_config.js`

- [ ] **Step 1: Update BUILD_ID**

In `js/00_config.js`, find the `BUILD_ID` line and update it:

```js
const BUILD_ID = '2026-03-29.starting-location-picker';
```

- [ ] **Step 2: Commit and push**

```bash
git add js/00_config.js
git commit -m "chore: update BUILD_ID to starting-location-picker"
git push
```

---

## Regression Checklist

After all tasks complete, verify these behaviours haven't broken:

- [ ] "Current Location" selected + Start → game starts from GPS location as before (no change to existing flow)
- [ ] New game panel: Length, Mode, Difficulty, and the new Starting Location section all render with correct default selections on page load
- [ ] Starting Location choice resets to "Current Location" on page reload (not persisted)
- [ ] Pick mode: tapping Cancel re-opens New Game panel with previously chosen length/mode/difficulty still selected
- [ ] Pick mode: panning the map does NOT drop a pin
- [ ] Pick mode: tapping the map DOES drop a pin; dragging it adjusts position
- [ ] Confirm with pin at location X → starter photo target is near X, not near real GPS location
- [ ] After game starts from picked location, player blue dot moves with real GPS during gameplay
- [ ] `btnNewTarget` (debug) still starts a game normally (it calls `startNewGameFromMenuOrDebug()` with no args → `areaOverride = null` → existing path)
- [ ] Gauntlet mode: first target seeded from picked location; subsequent targets use player position as normal
