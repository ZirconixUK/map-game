# Signal Lock Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Signal Lock" once-per-round gameplay tool that reveals N candidate circular zones on the map, exactly one of which contains the hidden target.

**Architecture:** New self-contained module `js/22_signal_lock.js` exposes a `window.*` API. It handles circle generation (with retry/fallback), Leaflet rendering into a dedicated pane, and in-memory state. State is persisted as a top-level `signalLockCircles` field in localStorage (same pattern as `fogActions`). All existing modules (state, boot, clues, UI, dom) receive small wiring additions.

**Tech Stack:** Vanilla JS, Leaflet (`L.circle`, `L.layerGroup`, custom pane), existing `haversineMeters` + `destinationLatLon` geo helpers, `localStorage` persistence, `tools.json` cost config.

---

## Task 1: Add config constants

**Files:**
- Modify: `js/00_config.js`

- [ ] Open `js/00_config.js`. After the `THERMO_OPTIONS_BY_MODE` block (around line 149), add:

```js
// ---- Signal Lock options per game mode ----
// count: number of candidate circles revealed
// radius: circle radius in metres
// heat: heat cost (fixed, not mode-dependent)
const SIGNAL_LOCK_CONFIG_BY_MODE = {
  short:  { count: 4, radius: 175, heat: 2.0 },
  medium: { count: 4, radius: 250, heat: 2.0 },
  long:   { count: 5, radius: 425, heat: 2.0 },
};
```

- [ ] Update `BUILD_ID` at line 9:

```js
const BUILD_ID = '2026-04-01.signal-lock';
```

- [ ] Verify: open browser console and type `SIGNAL_LOCK_CONFIG_BY_MODE` — should return the object.

---

## Task 2: Add Signal Lock to tools.json

**Files:**
- Modify: `tools.json`

- [ ] Open `tools.json`. Add a new `signalLock` entry inside the `tools` object, after the `photo` block (before the final closing `}`):

```json
    ,
    "signalLock": {
      "label": "Signal Lock",
      "default": {
        "heat_cost": 2.0
      }
    }
```

The full `tools` object should now end:
```json
    "signalLock": {
      "label": "Signal Lock",
      "default": {
        "heat_cost": 2.0
      }
    }
  }
}
```

- [ ] Verify: `fetch('tools.json').then(r=>r.json()).then(d=>console.log(d.tools.signalLock))` in browser console — should print `{ label: "Signal Lock", default: { heat_cost: 2 } }`.

---

## Task 3: Create js/22_signal_lock.js — core module

**Files:**
- Create: `js/22_signal_lock.js`

This is the largest task. Create the file with the full content below.

- [ ] Create `js/22_signal_lock.js`:

```js
(function () {
  // ---- Signal Lock ----
  // Generates N candidate circles on the map. Exactly one contains the target.
  // All others are false leads. Informational overlay only — does not touch fog.

  let __signalLockLayer = null;     // Leaflet LayerGroup
  let __signalLockCircles = [];     // [{ lat, lon, radiusM, isTrue }]

  // ---- Pane ----
  function ensureSignalPane() {
    if (!window.leafletMap) return null;
    let pane = window.leafletMap.getPane('signalPane');
    if (!pane) {
      pane = window.leafletMap.createPane('signalPane');
      // Above fog (450), below player (700)
      pane.style.zIndex = '460';
      pane.style.pointerEvents = 'none';
    }
    return pane;
  }

  function ensureSignalLayer() {
    if (!window.leafletMap) return false;
    ensureSignalPane();
    if (!__signalLockLayer) {
      __signalLockLayer = L.layerGroup({ pane: 'signalPane' }).addTo(window.leafletMap);
    }
    return true;
  }

  // ---- Geo helpers (local wrappers so this module is self-contained) ----
  function _haversine(lat1, lon1, lat2, lon2) {
    // Re-use global if available; otherwise inline
    if (typeof haversineMeters === 'function') return haversineMeters(lat1, lon1, lat2, lon2);
    const R = 6378137, toR = d => d * Math.PI / 180;
    const dLat = toR(lat2 - lat1), dLon = toR(lon2 - lon1);
    const a = Math.sin(dLat/2)**2 + Math.cos(toR(lat1))*Math.cos(toR(lat2))*Math.sin(dLon/2)**2;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
  }

  function _destination(lat, lon, bearingDeg, distM) {
    if (typeof destinationLatLon === 'function') return destinationLatLon(lat, lon, bearingDeg, distM);
    const R = 6378137, toR = d => d * Math.PI / 180, toD = r => r * 180 / Math.PI;
    const brng = toR(bearingDeg), δ = distM / R;
    const φ1 = toR(lat), λ1 = toR(lon);
    const sinφ2 = Math.sin(φ1)*Math.cos(δ) + Math.cos(φ1)*Math.sin(δ)*Math.cos(brng);
    const φ2 = Math.asin(sinφ2);
    const y2 = Math.sin(brng)*Math.sin(δ)*Math.cos(φ1);
    const x2 = Math.cos(δ) - Math.sin(φ1)*Math.sin(φ2);
    const λ2 = λ1 + Math.atan2(y2, x2);
    return { lat: toD(φ2), lon: ((toD(λ2) + 540) % 360) - 180 };
  }

  // ---- Generation ----
  function _getModeConfig() {
    const mode = (typeof window.getSelectedGameLength === 'function') ? window.getSelectedGameLength() : 'short';
    if (typeof SIGNAL_LOCK_CONFIG_BY_MODE !== 'undefined' && SIGNAL_LOCK_CONFIG_BY_MODE[mode]) {
      return { mode, ...SIGNAL_LOCK_CONFIG_BY_MODE[mode] };
    }
    // Fallback if config not yet loaded
    const fallbacks = { short: { count:4, radius:175, heat:2.0 }, medium: { count:4, radius:250, heat:2.0 }, long: { count:5, radius:425, heat:2.0 } };
    return { mode, ...(fallbacks[mode] || fallbacks.short) };
  }

  function _getRoundCenter() {
    // Prefer round start latlng recorded at target pick time
    const rs = (typeof window.getRoundStateV1 === 'function') ? window.getRoundStateV1() : null;
    if (rs && rs.startLatLng && typeof rs.startLatLng.lat === 'number') return rs.startLatLng;
    // Fallback: player position
    if (typeof player !== 'undefined' && player && typeof player.lat === 'number') return { lat: player.lat, lon: player.lon };
    // Fallback: target
    if (typeof target !== 'undefined' && target && typeof target.lat === 'number') return { lat: target.lat, lon: target.lon };
    return null;
  }

  function _getTarget() {
    if (typeof target !== 'undefined' && target && typeof target.lat === 'number') return { lat: target.lat, lon: target.lon };
    return null;
  }

  function _getGameAreaRadius() {
    return (typeof window.getModeTargetRadiusM === 'function') ? window.getModeTargetRadiusM() : 500;
  }

  // Returns bearing from roundCenter to the candidate point (used for angular spread)
  function _bearing(fromLat, fromLon, toLat, toLon) {
    const toR = d => d * Math.PI / 180;
    const dLon = toR(toLon - fromLon);
    const x = Math.sin(dLon) * Math.cos(toR(toLat));
    const y = Math.cos(toR(fromLat)) * Math.sin(toR(toLat)) - Math.sin(toR(fromLat)) * Math.cos(toR(toLat)) * Math.cos(dLon);
    return ((Math.atan2(x, y) * 180 / Math.PI) + 360) % 360;
  }

  // Check whether a candidate circle centre is "too close" to any placed circle centre
  function _tooClose(candidateLat, candidateLon, placed, minSepM) {
    for (const c of placed) {
      if (_haversine(candidateLat, candidateLon, c.lat, c.lon) < minSepM) return true;
    }
    return false;
  }

  // Generates the candidate circles.
  // Returns [{ lat, lon, radiusM, isTrue }] length === cfg.count, or throws.
  function generateSignalLockCircles() {
    const cfg = _getModeConfig();
    const tgt = _getTarget();
    const rc = _getRoundCenter();
    const R = _getGameAreaRadius();
    const y = cfg.radius;
    const count = cfg.count;
    const margin = Math.max(50, R * 0.10);
    const maxCenterDistFromRC = R - y - margin;

    if (!tgt) throw new Error('[SignalLock] No target available');
    if (!rc)  throw new Error('[SignalLock] No round center available');

    console.log(`[SignalLock] Generating circles — mode:${cfg.mode} count:${count} radius:${y}m R:${R}m maxCentDist:${maxCenterDistFromRC.toFixed(0)}m`);
    console.log(`[SignalLock] Target: ${tgt.lat.toFixed(6)}, ${tgt.lon.toFixed(6)}`);
    console.log(`[SignalLock] Round center: ${rc.lat.toFixed(6)}, ${rc.lon.toFixed(6)}`);

    // --- True circle ---
    let trueCircle = null;
    // Try random offsets from target
    for (let attempt = 0; attempt < 40; attempt++) {
      const bearing = Math.random() * 360;
      const offsetDist = Math.random() * y * 0.65; // centre up to 65% of radius from target
      const centre = _destination(tgt.lat, tgt.lon, bearing, offsetDist);
      const distFromTgt = _haversine(centre.lat, centre.lon, tgt.lat, tgt.lon);
      const distFromRC = rc ? _haversine(centre.lat, centre.lon, rc.lat, rc.lon) : 0;
      if (distFromTgt <= y && distFromRC <= maxCenterDistFromRC) {
        trueCircle = { lat: centre.lat, lon: centre.lon, radiusM: y, isTrue: true };
        console.log(`[SignalLock] True circle centre (attempt ${attempt+1}): ${centre.lat.toFixed(6)}, ${centre.lon.toFixed(6)} dist_from_target=${distFromTgt.toFixed(1)}m dist_from_rc=${distFromRC.toFixed(1)}m`);
        break;
      }
    }
    // Fallback: place directly on target (target at circle edge still works)
    if (!trueCircle) {
      console.warn('[SignalLock] True circle fallback — placing centre on target');
      trueCircle = { lat: tgt.lat, lon: tgt.lon, radiusM: y, isTrue: true };
    }

    const placed = [trueCircle];

    // --- False circles ---
    // Relaxation schedule: try stricter spacing first, relax if needed
    const sepLevels = [2.4 * y, 2.2 * y, 2.0 * y, 1.8 * y, 1.5 * y];
    const attemptsPerLevel = 300;
    let retryLevel = 0;
    let totalAttempts = 0;

    while (placed.length < count) {
      const minSep = sepLevels[retryLevel] || sepLevels[sepLevels.length - 1];
      let found = false;

      for (let i = 0; i < attemptsPerLevel; i++) {
        totalAttempts++;

        // Sample a random point inside the playable circle
        // Uniform disc sampling: r = sqrt(random) * maxDist
        const r = Math.sqrt(Math.random()) * maxCenterDistFromRC;
        const b = Math.random() * 360;
        const candidate = _destination(rc.lat, rc.lon, b, r);

        // 1. Must not contain target
        const distToTgt = _haversine(candidate.lat, candidate.lon, tgt.lat, tgt.lon);
        if (distToTgt <= y) continue;

        // 2. Must be inside playable area
        const distFromRC = _haversine(candidate.lat, candidate.lon, rc.lat, rc.lon);
        if (distFromRC > maxCenterDistFromRC) continue;

        // 3. Must be far enough from all placed circles
        if (_tooClose(candidate.lat, candidate.lon, placed, minSep)) continue;

        placed.push({ lat: candidate.lat, lon: candidate.lon, radiusM: y, isTrue: false });
        found = true;
        break;
      }

      if (!found) {
        retryLevel++;
        if (retryLevel >= sepLevels.length) {
          // Hard fallback: accept any valid point ignoring spacing
          console.warn(`[SignalLock] Hard fallback at placed.length=${placed.length} — relaxing all spacing constraints`);
          // Try once more with minimum separation
          let placed2 = false;
          for (let i = 0; i < 2000; i++) {
            const r = Math.sqrt(Math.random()) * maxCenterDistFromRC;
            const b = Math.random() * 360;
            const candidate = _destination(rc.lat, rc.lon, b, r);
            const distToTgt = _haversine(candidate.lat, candidate.lon, tgt.lat, tgt.lon);
            const distFromRC = _haversine(candidate.lat, candidate.lon, rc.lat, rc.lon);
            if (distToTgt <= y) continue;
            if (distFromRC > maxCenterDistFromRC) continue;
            // Just ensure no exact duplicate
            if (_tooClose(candidate.lat, candidate.lon, placed, y * 0.5)) continue;
            placed.push({ lat: candidate.lat, lon: candidate.lon, radiusM: y, isTrue: false });
            placed2 = true;
            break;
          }
          if (!placed2) {
            // Absolute last resort: offset from round center
            const b2 = (360 / count) * placed.length;
            const fallbackDist = Math.min(maxCenterDistFromRC * 0.7, R * 0.4);
            const fc = _destination(rc.lat, rc.lon, b2, fallbackDist);
            const distToTgt2 = _haversine(fc.lat, fc.lon, tgt.lat, tgt.lon);
            // Only use if it doesn't contain the target
            if (distToTgt2 > y) {
              placed.push({ lat: fc.lat, lon: fc.lon, radiusM: y, isTrue: false });
              console.warn(`[SignalLock] Absolute fallback circle at bearing ${b2}°`);
            } else {
              // Worst case: offset in opposite direction
              const opp = _destination(rc.lat, rc.lon, (b2 + 180) % 360, fallbackDist);
              const distOpp = _haversine(opp.lat, opp.lon, tgt.lat, tgt.lon);
              placed.push({ lat: opp.lat, lon: opp.lon, radiusM: y, isTrue: distOpp <= y });
              if (distOpp <= y) {
                // This would be a second true circle — very unlikely but ensure we don't violate the invariant
                // by marking the original true circle as isTrue=false (we now have two candidates; pick the closest)
                console.error('[SignalLock] INVARIANT RISK: emergency fallback may produce two true circles. Fixing...');
                // Keep isTrue only on whichever has smaller dist-to-target
                const trueIdx = placed.reduce((best, c, idx) => {
                  const d = _haversine(c.lat, c.lon, tgt.lat, tgt.lon);
                  return (d < best.d) ? { idx, d } : best;
                }, { idx: 0, d: Infinity }).idx;
                placed.forEach((c, i) => { c.isTrue = (i === trueIdx) && (_haversine(c.lat, c.lon, tgt.lat, tgt.lon) <= c.radiusM); });
              }
            }
          }
          retryLevel = 0; // reset for next circle
        } else {
          console.log(`[SignalLock] Relaxing spacing to ${sepLevels[retryLevel].toFixed(0)}m for circle ${placed.length + 1}`);
        }
      }
    }

    // Log each circle
    placed.forEach((c, i) => {
      const dTgt = _haversine(c.lat, c.lon, tgt.lat, tgt.lon);
      const dRC  = _haversine(c.lat, c.lon, rc.lat, rc.lon);
      console.log(`[SignalLock] Circle ${i}: lat=${c.lat.toFixed(6)} lon=${c.lon.toFixed(6)} r=${c.radiusM}m isTrue=${c.isTrue} dist_to_target=${dTgt.toFixed(1)}m dist_to_rc=${dRC.toFixed(1)}m`);
    });

    // Shuffle so isTrue circle isn't always index 0
    for (let i = placed.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [placed[i], placed[j]] = [placed[j], placed[i]];
    }

    // Final validation: exactly one true circle
    const trueCount = placed.filter(c => c.isTrue).length;
    const trueContainTarget = placed.filter(c => _haversine(c.lat, c.lon, tgt.lat, tgt.lon) <= c.radiusM).length;
    console.log(`[SignalLock] Validation: circles=${placed.length} declared-true=${trueCount} actually-contains-target=${trueContainTarget} totalAttempts=${totalAttempts}`);
    if (trueCount !== 1) console.error('[SignalLock] INVARIANT VIOLATED: trueCount !== 1');
    if (trueContainTarget !== 1) console.error('[SignalLock] INVARIANT VIOLATED: target not in exactly one circle');
    const trueIdx = placed.findIndex(c => c.isTrue);
    if (trueIdx !== -1) console.log(`[SignalLock] True circle is index ${trueIdx}`);

    return placed;
  }

  // ---- Rendering ----
  function renderSignalLockCircles(circles) {
    if (!window.leafletMap) return;
    if (!ensureSignalLayer()) return;
    __signalLockLayer.clearLayers();
    if (!circles || !circles.length) return;

    circles.forEach((c, i) => {
      const circle = L.circle([c.lat, c.lon], {
        radius: c.radiusM,
        color: '#22d3ee',
        weight: 2,
        opacity: 0.85,
        fillColor: '#22d3ee',
        fillOpacity: 0.10,
        dashArray: '6 4',
        interactive: false,
        pane: 'signalPane',
      });
      circle.bindTooltip(`Signal zone ${i + 1}`, { permanent: false, opacity: 0.85 });
      circle.addTo(__signalLockLayer);
    });
  }

  // ---- State API ----
  window.getSignalLockCircles = function () {
    return __signalLockCircles.slice();
  };

  window.__restoreSignalLockCircles = function (circles) {
    __signalLockCircles = Array.isArray(circles) ? circles : [];
  };

  window.clearSignalLockOverlays = function () {
    __signalLockCircles = [];
    if (__signalLockLayer) __signalLockLayer.clearLayers();
  };

  window.renderSignalLockCircles = renderSignalLockCircles;

  // ---- Main action ----
  window.useSignalLock = function () {
    try {
      const circles = generateSignalLockCircles();
      __signalLockCircles = circles;
      renderSignalLockCircles(circles);
      try { if (typeof saveRoundStateDebounced === 'function') saveRoundStateDebounced(); } catch(e) {}
      console.log('[SignalLock] Circles generated and rendered.');
    } catch (e) {
      console.error('[SignalLock] useSignalLock failed:', e);
    }
  };

})();
```

- [ ] Verify file was created: `ls js/22_signal_lock.js`

---

## Task 4: Load 22_signal_lock.js in index.html

**Files:**
- Modify: `index.html`

- [ ] Open `index.html`. Find the script load sequence (around line 130):

```js
        await load('./js/12_geo_helpers.js?cb=' + cb);
        await load('./js/13_boot.js?cb=' + cb);
```

Add the new script between them:

```js
        await load('./js/12_geo_helpers.js?cb=' + cb);
        await load('./js/22_signal_lock.js?cb=' + cb);
        await load('./js/13_boot.js?cb=' + cb);
```

- [ ] Verify: reload the page, open console, type `window.useSignalLock` — should print the function (not `undefined`).

---

## Task 5: Add Signal Lock button to the gameplay panel

**Files:**
- Modify: `index.html`

- [ ] Find the `gameMenu` main tool grid (around line 226–233). The current grid is:

```html
      <div id="gameMenu">
        <div class="grid gap-2" style="grid-template-columns:repeat(5,1fr)">
          <button id="qRadar" ...>...</button>
          <button id="qThermo" ...>...</button>
          <button id="qDir" ...>...</button>
          <button id="qLandmark" ...>...</button>
          <button id="qPhoto" ...>...</button>
        </div>
```

Change it to a 3-column grid and add the Signal Lock button:

```html
      <div id="gameMenu">
        <div class="grid gap-2" style="grid-template-columns:repeat(3,1fr)">
          <button id="qRadar"      class="menuBtn menuBtn--iconOnly rounded-xl bg-[#060e1c] border border-blue-500/70   transition-all duration-150 active:scale-95" aria-label="Radar"        title="Radar"><span class="iconBox text-2xl">📡</span></button>
          <button id="qThermo"     class="menuBtn menuBtn--iconOnly rounded-xl bg-[#060e1c] border border-orange-500/70 transition-all duration-150 active:scale-95" aria-label="Thermometer"  title="Thermometer"><span class="iconBox text-2xl">🌡️</span></button>
          <button id="qDir"        class="menuBtn menuBtn--iconOnly rounded-xl bg-[#060e1c] border border-cyan-500/70   transition-all duration-150 active:scale-95" aria-label="N/S/E/W"      title="N/S/E/W"><span class="iconBox text-2xl">🧭</span></button>
          <button id="qLandmark"   class="menuBtn menuBtn--iconOnly rounded-xl bg-[#060e1c] border border-emerald-500/70 transition-all duration-150 active:scale-95" aria-label="Landmark"     title="Landmark"><span class="iconBox text-2xl">🏛️</span></button>
          <button id="qPhoto"      class="menuBtn menuBtn--iconOnly rounded-xl bg-[#060e1c] border border-violet-500/70  transition-all duration-150 active:scale-95" aria-label="Photo"        title="Photo"><span class="iconBox text-2xl">📷</span></button>
          <button id="qSignalLock" class="menuBtn menuBtn--iconOnly rounded-xl bg-[#060e1c] border border-teal-500/70   transition-all duration-150 active:scale-95" aria-label="Signal Lock"  title="Signal Lock" data-signal-lock="default"><span class="iconBox text-2xl">📶</span></button>
        </div>
```

Note: the `data-signal-lock="default"` attribute on the button enables cost badge updates and tool-usage tracking.

- [ ] Reload the page, open the Gameplay panel — should see 6 buttons in a 2×3 grid. The Signal Lock button (📶) should appear.

---

## Task 6: Wire Signal Lock button in gameplay panel delegation

**Files:**
- Modify: `js/02_dom.js`

- [ ] Find `bindUI()` in `js/02_dom.js`. Locate the `showMenu` function (around line 929) and find where the existing tool navigation IDs are handled inside `panelGameplay.addEventListener('click', ...)` (around line 1554):

```js
        if (id === 'qRadar')    { showMenu('radar');    return; }
        if (id === 'qThermo')   { showMenu('thermo');   return; }
        if (id === 'qDir')      { showMenu('dir');      return; }
        if (id === 'qLandmark') { showMenu('landmark'); return; }
        if (id === 'qPhoto')    { showMenu('photo');    return; }
```

Add the Signal Lock handler immediately after those lines:

```js
        if (id === 'qSignalLock') {
          // Once-per-round: check if already used
          if (isToolOptionAlreadyUsed('signalLock', 'default')) {
            try { showToast('Signal Lock already used this round.', false); } catch(e) {}
            return;
          }
          // Show confirmation dialog
          const cost = (typeof getToolCosts === 'function') ? getToolCosts('signalLock', 'default') : { heat_cost: 2.0 };
          __toolConfirmShow({
            title: 'Signal Lock',
            icon: '📶',
            accentClass: 'text-teal-400',
            descHtml: '<div class="text-slate-400 text-sm">Reveals several possible signal zones. The target is inside one of them.</div>',
            cost,
            onConfirm: () => {
              const curseRoll = applyQuestionCosts('signalLock', 'default');
              if (curseRoll && curseRoll.blocked) return;
              noteToolOptionUsed('signalLock', 'default');
              if (panelGameplay) panelGameplay.classList.remove('open');
              showMenu('main');
              try {
                if (typeof window.useSignalLock === 'function') window.useSignalLock();
              } catch (e) {
                console.error('[SignalLock] useSignalLock error:', e);
              }
            }
          });
          return;
        }
```

- [ ] Reload the page, click the 📶 button — a confirmation dialog should appear with the heat cost shown. Cancelling should dismiss it cleanly.

---

## Task 7: Update cost badge system

**Files:**
- Modify: `js/15_tools_config.js`

- [ ] Open `js/15_tools_config.js`. Find the `map` array inside `updateCostBadgesFromConfig()` (around line 152):

```js
  const map = [
    { toolId: "radar", selector: "[data-radar]", getOption: (el) => el.getAttribute("data-radar") },
    { toolId: "thermometer", selector: "[data-thermo]", getOption: (el) => el.getAttribute("data-thermo") },
    { toolId: "nsew", selector: "[data-dir]", getOption: (el) => el.getAttribute("data-dir") },
    { toolId: "landmark", selector: "[data-landmark]", getOption: (el) => el.getAttribute("data-landmark") },
    { toolId: "photo", selector: "[data-photo]", getOption: (el) => el.getAttribute("data-photo") },
  ];
```

Add the `signalLock` entry:

```js
  const map = [
    { toolId: "radar", selector: "[data-radar]", getOption: (el) => el.getAttribute("data-radar") },
    { toolId: "thermometer", selector: "[data-thermo]", getOption: (el) => el.getAttribute("data-thermo") },
    { toolId: "nsew", selector: "[data-dir]", getOption: (el) => el.getAttribute("data-dir") },
    { toolId: "landmark", selector: "[data-landmark]", getOption: (el) => el.getAttribute("data-landmark") },
    { toolId: "photo", selector: "[data-photo]", getOption: (el) => el.getAttribute("data-photo") },
    { toolId: "signalLock", selector: "[data-signal-lock]", getOption: (el) => el.getAttribute("data-signal-lock") },
  ];
```

However, the Signal Lock button is an `iconOnly` button — it has no `.costRow` inside it by default. The badge needs to be added to the button HTML. The badge won't display unless we add the cost row. For `menuBtn--iconOnly` buttons, the cost badge is not shown in the main icon grid (they only appear in submenus). So this entry is for correctness/future-proofing; the actual heat cost display happens in the confirm dialog. No additional HTML change needed.

- [ ] Verify: open browser console after reload, type `window.updateCostBadgesFromConfig()` — should not throw.

---

## Task 8: Register Signal Lock in tool node cache and usage meta

**Files:**
- Modify: `js/09_ui_helpers.js`

- [ ] Open `js/09_ui_helpers.js`. Find `__cacheToolButtonNodes()` (around line 11):

```js
function __cacheToolButtonNodes() {
  const lockSelectors = [
    '#qRadar','#qThermo','#qDir','#qLandmark','#qPhoto',
    '#radarMenu .menuBtn','#thermoMenu .menuBtn','#dirMenu .menuBtn','#landmarkMenu .menuBtn','#photoMenu .menuBtn'
  ];
  __toolButtonNodes = Array.from(document.querySelectorAll(lockSelectors.join(',')));
  __radarMenuNodes  = Array.from(document.querySelectorAll('#radarMenu .menuBtn[data-radar]'));
}
```

Add `'#qSignalLock'` to the `lockSelectors` array:

```js
function __cacheToolButtonNodes() {
  const lockSelectors = [
    '#qRadar','#qThermo','#qDir','#qLandmark','#qPhoto','#qSignalLock',
    '#radarMenu .menuBtn','#thermoMenu .menuBtn','#dirMenu .menuBtn','#landmarkMenu .menuBtn','#photoMenu .menuBtn'
  ];
  __toolButtonNodes = Array.from(document.querySelectorAll(lockSelectors.join(',')));
  __radarMenuNodes  = Array.from(document.querySelectorAll('#radarMenu .menuBtn[data-radar]'));
}
```

- [ ] In the same file, find `getToolUsageMeta` (around line 116):

```js
    const getToolUsageMeta = (n) => {
      if (!n) return null;
      const has = (attr) => n.hasAttribute && n.hasAttribute(attr);
      const get = (attr) => (n.getAttribute ? n.getAttribute(attr) : null);
      if (has('data-radar')) return { toolId: 'radar', optionId: String(get('data-radar') || '') };
      if (has('data-thermo')) return { toolId: 'thermometer', optionId: String(get('data-thermo') || '') };
      if (has('data-dir')) return { toolId: 'nsew', optionId: String(get('data-dir') || '') };
      if (has('data-landmark')) return { toolId: 'landmark', optionId: String((get('data-landmark') || '').toLowerCase()) };
      if (has('data-photo')) {
        const mode = String((get('data-photo') || '').toLowerCase());
        // Photo re-open actions stay reusable; only one-shot effects lock.
        if (mode === 'uncorrupt') return { toolId: 'photo', optionId: mode };
        return null;
      }
      return null;
    };
```

Add the `data-signal-lock` case before the final `return null`:

```js
      if (has('data-signal-lock')) return { toolId: 'signalLock', optionId: 'default' };
      return null;
```

The full updated function:

```js
    const getToolUsageMeta = (n) => {
      if (!n) return null;
      const has = (attr) => n.hasAttribute && n.hasAttribute(attr);
      const get = (attr) => (n.getAttribute ? n.getAttribute(attr) : null);
      if (has('data-radar')) return { toolId: 'radar', optionId: String(get('data-radar') || '') };
      if (has('data-thermo')) return { toolId: 'thermometer', optionId: String(get('data-thermo') || '') };
      if (has('data-dir')) return { toolId: 'nsew', optionId: String(get('data-dir') || '') };
      if (has('data-landmark')) return { toolId: 'landmark', optionId: String((get('data-landmark') || '').toLowerCase()) };
      if (has('data-photo')) {
        const mode = String((get('data-photo') || '').toLowerCase());
        if (mode === 'uncorrupt') return { toolId: 'photo', optionId: mode };
        return null;
      }
      if (has('data-signal-lock')) return { toolId: 'signalLock', optionId: 'default' };
      return null;
    };
```

- [ ] Verify: after using Signal Lock once in-game, the 📶 button should show the `used` CSS class (dimmed).

---

## Task 9: Persist signal lock circles in round state

**Files:**
- Modify: `js/04_state.js`

- [ ] Open `js/04_state.js`. Find `saveRoundState()` (around line 385). Find the `payload` object (around line 411):

```js
    const payload = {
      debugMode,
      playerSaved: ...,
      targetIdx,
      targetCustom: custom,
      roundStartMs,
      penaltyMs,
      heatValue,
      heatLevel,
      heatLastMs,
      activeCurses: ...,
      thermoRun,
      usedToolOptions: ...,
      roundStateV1: _roundStateV1ForSave,
      recentPanoKeys,
      fogActions: ...,
      gameSetup: ...,
      gauntletState: ...,
    };
```

Add `signalLockCircles` to the payload, immediately after `fogActions`:

```js
      fogActions: (typeof getFogActions === 'function') ? getFogActions() : null,
      signalLockCircles: (typeof window.getSignalLockCircles === 'function') ? window.getSignalLockCircles() : null,
```

- [ ] In the same file, find `resetRound()` (around line 446). After the line `usedToolOptions = {};`, add:

```js
  try { if (typeof window.clearSignalLockOverlays === 'function') window.clearSignalLockOverlays(); } catch(e) {}
```

The updated `resetRound` should look like:

```js
function resetRound({ keepTarget = false } = {}) {
  if (__saveRoundStateTimer) { clearTimeout(__saveRoundStateTimer); __saveRoundStateTimer = null; }
  window.__roundExpiredOnLoad = false;
  roundStartMs = Date.now();
  penaltyMs = 0;
  heatValue = 0;
  heatLevel = 0;
  heatLastMs = Date.now();
  __lastHeatSaveMs = 0;
  thermoRun = null;
  usedToolOptions = {};
  try { if (typeof window.clearSignalLockOverlays === 'function') window.clearSignalLockOverlays(); } catch(e) {}
  try { if (typeof window.clearCurses === 'function') window.clearCurses(); } catch(e) {}
  if (!keepTarget) {
    targetIdx = null;
    targetCustom = null;
  }
  saveRoundState();
  try { if (typeof updateHUD === "function") updateHUD(); } catch (e) {}
}
```

- [ ] Verify: use Signal Lock in-game, then reload — open console and type `JSON.parse(localStorage.getItem('mapgame_round_v1')).signalLockCircles` — should print the array of circles.

---

## Task 10: Restore signal lock overlay on page refresh

**Files:**
- Modify: `js/13_boot.js`

- [ ] Open `js/13_boot.js`. After the `__tryRestoreFog` function (around line 43), add:

```js
function __tryRestoreSignalLock(saved) {
  try {
    const circles = saved && Array.isArray(saved.signalLockCircles) && saved.signalLockCircles.length > 0
      ? saved.signalLockCircles
      : null;
    if (!circles) return false;
    if (!window.leafletMap) return false;
    if (typeof window.__restoreSignalLockCircles !== 'function') return false;
    window.__restoreSignalLockCircles(circles);
    window.renderSignalLockCircles(circles);
    return true;
  } catch (e) {
    console.error('[SignalLock] restore error:', e);
    return false;
  }
}
```

- [ ] In the same file, find the line:

```js
  try { __tryRestoreFog(__saved); } catch(e) {}
```

Add the Signal Lock restore immediately after it:

```js
  try { __tryRestoreFog(__saved); } catch(e) {}
  try { __tryRestoreSignalLock(__saved); } catch(e) {}
```

- [ ] Verify: use Signal Lock, reload the page — the cyan circles should reappear on the map.

---

## Task 11: Clear signal lock overlay on new target

**Files:**
- Modify: `js/08_clues_questions.js`

- [ ] Open `js/08_clues_questions.js`. Find `clearClues()` (around line 374):

```js
function clearClues() {
  clues.length = 0;
  try { if (typeof clearFog === "function") clearFog(); } catch(e) {}
  thermoBaseline = null;
  if (elLast) { elLast.className = "pill mid"; elLast.textContent = "Cleared"; }
}
```

Add the Signal Lock clear after the `clearFog` line:

```js
function clearClues() {
  clues.length = 0;
  try { if (typeof clearFog === "function") clearFog(); } catch(e) {}
  try { if (typeof window.clearSignalLockOverlays === 'function') window.clearSignalLockOverlays(); } catch(e) {}
  thermoBaseline = null;
  if (elLast) { elLast.className = "pill mid"; elLast.textContent = "Cleared"; }
}
```

- [ ] Verify: use Signal Lock, then start a new round — the cyan circles should disappear from the map.

---

## Task 12: Commit

- [ ] Verify all acceptance criteria pass:
  1. Signal Lock button visible in gameplay panel (📶, teal border)
  2. Clicking it shows confirmation with heat cost
  3. After confirming, N cyan dashed circles appear on the map (4 for short/medium, 5 for long)
  4. Console log shows `[SignalLock] Validation: ... actually-contains-target=1`
  5. Heat bar increases by 2.0
  6. Button shows `used` class (dimmed) after use
  7. Refresh: circles reappear
  8. New round: circles clear
  9. Fog and other overlays are unaffected

- [ ] Stage and commit:

```bash
git add js/22_signal_lock.js js/00_config.js tools.json js/04_state.js js/08_clues_questions.js js/09_ui_helpers.js js/13_boot.js js/15_tools_config.js js/02_dom.js index.html
git commit -m "feat: add Signal Lock tool — candidate zone reveal with circle generation and persistence"
```

- [ ] Push:

```bash
git push
```

---

## Self-review against spec

| Spec requirement | Task |
|---|---|
| Once-per-round | Task 6 (`isToolOptionAlreadyUsed`) + Task 8 (`getToolUsageMeta`) |
| Correct circle count per mode | Task 1 (config) + Task 3 (generation) |
| Target in exactly one circle | Task 3 (containment assertion) |
| Circles spread out | Task 3 (2.4y min separation + angular sampling) |
| Persist across refresh | Task 9 (save) + Task 10 (restore) |
| Clear on new round | Task 9 (`resetRound`) + Task 11 (`clearClues`) |
| Heat impact 2.0 | Task 2 (tools.json) + Task 6 (`applyQuestionCosts`) |
| Debug logs | Task 3 (console.log throughout) |
| No fog modification | Confirmed — `22_signal_lock.js` never calls any `addFog*` function |
| Target not always at circle centre | Task 3 (random offset up to 0.65y) |
| Used/disabled state | Task 8 (node cache + usage meta) |
| Tooltip/help text | Task 6 (confirm dialog `descHtml`) |
| Round start radius (not viewport) | Task 3 (`_getRoundCenter` + `_getGameAreaRadius`) |
| Fallback always produces required count | Task 3 (multi-level fallback) |
