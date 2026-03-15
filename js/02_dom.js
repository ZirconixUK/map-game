// ---- DOM ----
let __landmarkLiveCache = {};       // { [kind]: { pois, ts } } — cleared each new game
let __landmarkCategoryHTML = null;  // saved category list HTML for restore
let __landmarkActiveFetchKind = null; // stale-fetch guard

const canvas = document.getElementById("view");
const ctx = canvas.getContext("2d", { alpha: true });

const elLog = document.getElementById("log");
const elPlayer = document.getElementById("playerOut");
const elTarget = document.getElementById("targetOut");
const elClues = document.getElementById("cluesOut");
const elDbgMode = document.getElementById("dbgMode");
const elBBox = document.getElementById("dbgBBox");
const elDbgSimCurse = document.getElementById("dbgSimCurse");
const elDbgShowAllPois = document.getElementById("dbgShowAllPois");
const elViewBboxOut = document.getElementById("viewBboxOut");
const elLast = document.getElementById("lastAnswer");

const elRadarPreset = document.getElementById("radarPreset");
const elBearingBuckets = document.getElementById("bearingBuckets");
const elDistBucket = document.getElementById("distBucket");

// Debug: round controls
const elDbgHeatNew = document.getElementById("dbgHeatNew");
const elDbgHeatApply = document.getElementById("dbgHeatApply");
const elDbgHeatCurrent = document.getElementById("dbgHeatCurrent");
const elDbgTimerPlus5 = document.getElementById("dbgTimerPlus5");

// HUD
const elTimerMain = document.getElementById("timerMain");
const elTimerPenalty = document.getElementById("timerPenalty");
const elHeatWidget = document.getElementById("heatWidget");




// Bind UI event listeners (called from boot after all functions are defined).
// Toasts are queued so we can show "answer" first, then (optionally) a "cursed" popup after dismissal.
const __toastQueue = [];
let __toastShowing = false;

function __showNextToast(){
  const toast = document.getElementById("toast");
  if (!toast) { __toastQueue.length = 0; __toastShowing = false; return; }
  const item = __toastQueue.shift();
  if (!item) { __toastShowing = false; return; }

  __toastShowing = true;

  const { msg, ok, kind, resolve } = item;
  const icon = (kind === "curse") ? "🟣" : (ok ? "✅" : "❌");
  toast.innerHTML = `<div class="toastIcon">${icon}</div><div>${msg}</div>`;
  toast.classList.remove("hidden","good","bad","curse");
  if (kind === "curse") toast.classList.add("curse");
  else toast.classList.add(ok ? "good" : "bad");

  const dismiss = () => {
    toast.classList.add("hidden");
    toast.classList.remove("good","bad","curse");
    window.removeEventListener("pointerdown", dismiss, true);
    window.removeEventListener("keydown", dismiss, true);
    try { resolve && resolve(); } catch(e) {}
    // next
    __showNextToast();
  };

  window.addEventListener("pointerdown", dismiss, true);
  window.addEventListener("keydown", dismiss, true);
}

function enqueueToast(msg, ok, opts = null){
  return new Promise((resolve) => {
    const kind = (opts && opts.kind) ? String(opts.kind) : "";
    __toastQueue.push({ msg, ok: !!ok, kind, resolve });
    if (!__toastShowing) __showNextToast();
  });
}

function showToast(msg, ok, opts = null){
  // Back-compat: most callers ignore the promise.
  try { enqueueToast(msg, ok, opts); } catch(e) {}
}

// Expose for modules that want to chain popups.
window.enqueueToast = enqueueToast;

function on(id, ev, fn){ const el=document.getElementById(id); if(el) el.addEventListener(ev, fn); return el; }

function formatViewBbox(bounds){
  // Leaflet bounds -> python script bbox string: WEST,SOUTH,EAST,NORTH
  const sw = bounds.getSouthWest();
  const ne = bounds.getNorthEast();
  const west = sw.lng;
  const south = sw.lat;
  const east = ne.lng;
  const north = ne.lat;
  const fmt = (n) => (Math.round(n * 1e6) / 1e6).toFixed(6);
  return {
    west, south, east, north,
    csv: `${fmt(west)},${fmt(south)},${fmt(east)},${fmt(north)}`
  };
}

async function copyTextToClipboard(text){
  // Try modern clipboard API first
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch(e) {}

  // Fallback: hidden textarea
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    ta.style.top = "-9999px";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return !!ok;
  } catch(e) {
    return false;
  }
}

function bindUI() {
  on("btnRecenter","click", (ev) => {
    try { if (ev && ev.preventDefault) ev.preventDefault(); if (ev && ev.stopPropagation) ev.stopPropagation(); } catch(e) {}

    // a) Ensure debug is OFF so taps don't accidentally override player location
    try {
      const cb = document.getElementById("dbgMode");
      if (cb && cb.checked) {
        cb.checked = false;
        cb.dispatchEvent(new Event("change"));
      } else {
        debugMode = false;
      }
    } catch(e) { try { debugMode = false; } catch(e2) {} }

    // b) Ensure geolocation permission + grab a fix
    try {
      if (typeof enableGeolocation === "function") {
        // Force GPS to override any prior manual override (e.g., debug-set player location)
        enableGeolocation({ centerAfterFix: true, force: true });
        return;
      }
    } catch(e) {}

    // Fallback: if geolocation isn't available, just tell the user
    try { if (!("geolocation" in navigator)) log("❌ Geolocation not available in this browser."); } catch(e) {}
  });

  on("btnGeo","click", (ev) => {
    try { if (ev && ev.preventDefault) ev.preventDefault(); if (ev && ev.stopPropagation) ev.stopPropagation(); } catch(e) {}
    try { log("📡 Use location clicked."); } catch(e) {}
    try { console.info("[MapGame] Use location clicked"); } catch(e) {}

    if (!("geolocation" in navigator)) {
      try { log("❌ Geolocation not available in this browser."); } catch(e) {}
      try { if (typeof showToast === "function") showToast("Geolocation isn't available in this browser.", false); } catch(e) {}
      return;
    }
    if (!window.isSecureContext) {
      try { log("❌ Geolocation requires HTTPS (or localhost)."); } catch(e) {}
      try { if (typeof showToast === "function") showToast("Geolocation requires HTTPS (or localhost).", false); } catch(e) {}
      return;
    }

    try { log("📡 Requesting your location…"); } catch(e) {}

    if (typeof window.__setPlayerFromCurrentLocation === "function") {
      window.__setPlayerFromCurrentLocation({
        source: "gps-button",
        force: true,
        centerAfterFix: false,
        geoOpts: { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 }
      }).then((fix) => {
        try {
          const el = document.getElementById("playerOut");
          if (el && fix) el.textContent = `${fix.lat.toFixed(6)}, ${fix.lon.toFixed(6)}`;
        } catch(e) {}
        try { if (typeof updateUI === "function") updateUI(); } catch(e) {}
        try { if (typeof updateHUD === "function") updateHUD(); } catch(e) {}
        try { if (fix) log(`📍 Player set: ${fix.lat.toFixed(6)}, ${fix.lon.toFixed(6)}`); } catch(e) {}
        try { if (typeof showToast === "function") showToast("✅ Location set.", true); } catch(e) {}
      }).catch((err) => {
        try { log(`❌ Geolocation error: ${err && err.message ? err.message : err}`); } catch(e) {}
        try { if (typeof showToast === "function") showToast(`Geolocation error: ${err && err.message ? err.message : err}`, false); } catch(e) {}
      });
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        try {
          if (typeof setPlayerLatLng === "function") {
            setPlayerLatLng(latitude, longitude, { source: "gps-button", manual: false, accuracy: pos.coords.accuracy, force: true });
          }
        } catch(e) {}

        // Update debug panel immediately (playerOut)
        try {
          const el = document.getElementById("playerOut");
          if (el) el.textContent = `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
        } catch(e) {}
        try { if (typeof updateUI === "function") updateUI(); } catch(e) {}
        try { if (typeof updateHUD === "function") updateHUD(); } catch(e) {}

        try { log(`📍 Player set: ${latitude.toFixed(6)}, ${longitude.toFixed(6)}`); } catch(e) {}
        try { if (typeof showToast === "function") showToast("✅ Location set.", true); } catch(e) {}

        // Start continuous tracking (no spam logs)
        try { if (typeof enableGeolocation === "function") enableGeolocation(); } catch(e) {}
      },
      (err) => {
        try { log(`❌ Geolocation error: ${err.message}`); } catch(e) {}
        try { if (typeof showToast === "function") showToast(`Geolocation error: ${err.message}`, false); } catch(e) {}
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 }
    );
  });
  on("btnCenter","click",(ev)=>{ try{ if(ev&&ev.preventDefault) ev.preventDefault(); }catch(e){} try{ log("🎯 Center clicked."); }catch(e){} if (typeof centerOnPlayer==="function") centerOnPlayer(); });
  on("btnClear","click",clearClues);
  async function positionPlayerForNewGame() {
    // In debug mode with a location already set, keep it — skip GPS override.
    if (debugMode && player && typeof player.lat === 'number' && typeof player.lon === 'number') {
      try { log(`📍 Debug mode: keeping location (${player.lat.toFixed(6)}, ${player.lon.toFixed(6)})`); } catch(e) {}
      return true;
    }
    // Use the exact same working helper as the top-right "Use location" button.
    // Order required by design: get real location -> centre map on player -> then pick target.
    try { log("📡 Requesting your current location for new game…"); } catch (e) {}

    try {
      if (typeof window.__setPlayerFromCurrentLocation === 'function') {
        const fix = await window.__setPlayerFromCurrentLocation({
          source: 'new-game-start',
          force: true,
          centerAfterFix: true,
          geoOpts: { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 }
        });
        try {
          const el = document.getElementById("playerOut");
          if (el && fix) el.textContent = `${fix.lat.toFixed(6)}, ${fix.lon.toFixed(6)}`;
        } catch(e) {}
        try { if (typeof updateUI === 'function') updateUI(); } catch (e) {}
        try { if (typeof updateHUD === 'function') updateHUD(); } catch (e) {}
        try { log(`📍 New game start location: ${fix.lat.toFixed(6)}, ${fix.lon.toFixed(6)}${(typeof fix.accuracy === "number" && isFinite(fix.accuracy)) ? ` (±${Math.round(fix.accuracy)}m)` : ""}`); } catch (e) {}
        return true;
      }

      if (!("geolocation" in navigator)) throw new Error('no_geolocation');
      if (!window.isSecureContext) throw new Error('insecure_context');

      const fix = await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(
          (pos) => resolve({
            lat: pos.coords.latitude,
            lon: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
            ts: Date.now(),
          }),
          (err) => reject(err || new Error('geo_error')),
          { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 }
        );
      });

      try {
        if (typeof setPlayerLatLng === 'function') {
          setPlayerLatLng(fix.lat, fix.lon, {
            source: 'new-game-start',
            accuracy: fix.accuracy,
            force: true,
            manual: false,
          });
        }
      } catch (e) {}
      try { if (typeof centerOnPlayer === 'function') centerOnPlayer(); } catch (e) {}
      try { log(`📍 New game start location: ${fix.lat.toFixed(6)}, ${fix.lon.toFixed(6)}${(typeof fix.accuracy === "number" && isFinite(fix.accuracy)) ? ` (±${Math.round(fix.accuracy)}m)` : ""}`); } catch (e) {}
      return true;
    } catch (err) {
      const msg = (err && err.message) ? err.message : String(err || 'geo_unavailable');
      try { log(`⚠️ Couldn't get current location for new game (${msg}); using default start.`); } catch (e) {}
      try {
        if (typeof DEFAULT_START_LATLNG !== 'undefined' && DEFAULT_START_LATLNG && typeof setPlayerLatLng === 'function') {
          setPlayerLatLng(DEFAULT_START_LATLNG.lat, DEFAULT_START_LATLNG.lon, { manual: true, source: 'fallback:default-start', force: true });
          try { if (typeof centerOnPlayer === 'function') centerOnPlayer(); } catch (e) {}
          try { log(`📍 New game fallback start: ${DEFAULT_START_LATLNG.lat.toFixed(6)}, ${DEFAULT_START_LATLNG.lon.toFixed(6)} (Lime Street)`); } catch (e) {}
        }
      } catch (e) {}
      return false;
    }
  }

  function __formatGameSetupLabel() {
    try {
      const setup = (typeof window.getGameSetupSelection === 'function') ? window.getGameSetupSelection() : null;
      const length = ((setup && setup.length) || 'short');
      const difficulty = ((setup && setup.difficulty) || 'normal');
      const limitMs = (typeof window.getRoundTimeLimitMs === 'function') ? window.getRoundTimeLimitMs() : (30 * 60 * 1000);
      const mins = Math.round(limitMs / 60000);
      const pretty = (v) => String(v || '').charAt(0).toUpperCase() + String(v || '').slice(1);
      return `${pretty(length)} | ${pretty(difficulty)} | ${mins} min`;
    } catch (e) {
      return 'Short | Normal | 30 min';
    }
  }

  async function startNewGameFromMenuOrDebug() {
    const btnStart = document.getElementById("btnNewGameStartReal");
    const originalLabel = btnStart ? btnStart.textContent : null;
    try {
      if (btnStart) {
        btnStart.disabled = true;
        btnStart.classList.add('disabled');
        btnStart.textContent = 'Starting game…';
      }
      try { if (typeof log === 'function') log(`🎮 Game setup: ${__formatGameSetupLabel()}`); } catch (e) {}
      __landmarkLiveCache = {};
      __landmarkCategoryHTML = null;
      // Rebuild radar menu for the newly-selected mode before the round starts.
      try { if (typeof window.updateRadarMenuForMode === 'function') window.updateRadarMenuForMode(); } catch(e) {}
      await positionPlayerForNewGame();
      clearClues();
      // Refresh live POIs from Overpass based on player location + mode radius.
      try { if (typeof window.__refreshLivePoisForCurrentLocation === 'function') await window.__refreshLivePoisForCurrentLocation(); } catch(e) {}
      // By design: player location first, map centre second, then target pick based on that player location.
      await pickNewTarget(true);
    } finally {
      if (btnStart) {
        btnStart.disabled = false;
        btnStart.classList.remove('disabled');
        btnStart.textContent = originalLabel || 'Start';
      }
    }
  }

  function openNewGamePanel() {
    const panelGameplay = document.getElementById("panelGameplay");
    const panelSystem = document.getElementById("panelSystem");
    const panelNewGame = document.getElementById("panelNewGame");
    if (panelGameplay) panelGameplay.classList.remove("open");
    if (panelSystem) panelSystem.classList.remove("open");
    if (panelNewGame) panelNewGame.classList.add("open");
  }

  on("btnNewTarget","click", startNewGameFromMenuOrDebug);
  on("btnSystemNewGame","click", openNewGamePanel);
  on("btnNewGameStartReal","click", () => {
    try {
      if (typeof window.setGameSetupSelection === 'function') {
        window.setGameSetupSelection({
          length: selectedGameLength,
          difficulty: selectedGameDifficulty,
        });
      }
    } catch (e) {}
    const panelNewGame = document.getElementById("panelNewGame");
    if (panelNewGame) panelNewGame.classList.remove("open");
    startNewGameFromMenuOrDebug();
  });
  on("btnNewGameCancel","click", () => {
    const panelNewGame = document.getElementById("panelNewGame");
    if (panelNewGame) panelNewGame.classList.remove("open");
  });
  on("btnRadar","click",askRadar);
  on("btnNorth","click", () => askDirection("N"));
  on("btnSouth","click", () => askDirection("S"));
  on("btnEast","click", () => askDirection("E"));
  on("btnWest","click", () => askDirection("W"));
  on("btnQuadrant","click",askQuadrant);
  on("btnThermo","click",askThermometer);
  if (elBBox) elBBox.addEventListener("change", draw);

  // ---- Debug: simulate active curse (lights the curses button) ----
  if (elDbgSimCurse) {
    elDbgSimCurse.addEventListener("change", () => {
      const on = !!elDbgSimCurse.checked;
      try {
        if (typeof window.debugSimulateCurse === "function") {
          window.debugSimulateCurse(on);
        }
      } catch (e) {}
      try { log(on ? "🟣 Simulated curse ON." : "⚪ Simulated curse OFF."); } catch (e) {}
    });
  }

  // ---- Debug: view bbox (copy/paste into python script) ----
  let lastViewBboxCsv = "";
  on("btnGetViewBbox", "click", () => {
    try {
      const m = window.leafletMap;
      if (!m || typeof m.getBounds !== "function") {
        log("❌ Map not ready yet.");
        return;
      }
      const info = formatViewBbox(m.getBounds());
      lastViewBboxCsv = info.csv;
      if (elViewBboxOut) elViewBboxOut.textContent = info.csv;
      log(`🧾 View BBOX: ${info.csv}`);
    } catch (e) {
      log(`❌ BBOX failed: ${e.message}`);
    }
  });

  on("btnCopyViewBbox", "click", async () => {
    try {
      // If not computed yet, compute now
      if (!lastViewBboxCsv) {
        const m = window.leafletMap;
        if (!m || typeof m.getBounds !== "function") {
          log("❌ Map not ready yet.");
          return;
        }
        const info = formatViewBbox(m.getBounds());
        lastViewBboxCsv = info.csv;
        if (elViewBboxOut) elViewBboxOut.textContent = info.csv;
      }
      const ok = await copyTextToClipboard(lastViewBboxCsv);
      log(ok ? `📋 Copied BBOX: ${lastViewBboxCsv}` : "❌ Copy failed (browser blocked clipboard)." );
    } catch (e) {
      log(`❌ Copy failed: ${e.message}`);
    }
  });

  if (elDbgMode) {
    elDbgMode.addEventListener("change", () => {
      debugMode = !!elDbgMode.checked;
      log(`Debug mode: ${debugMode ? "ON" : "OFF"}`);

      
      if (!debugMode) {
        // Leaving debug mode: resume real GPS location (starts watch, may prompt if not yet granted)
        try { enableGeolocation(); } catch(e) {}
      }
if (debugMode) {
        // stop auto-follow, but remember if it was running
        wasWatchingBeforeDebug = (typeof watchId !== "undefined" && watchId != null);
        if (typeof stopGeolocationWatch === "function") stopGeolocationWatch();
      } else {
        // restore auto-follow if it was previously enabled
        if (wasWatchingBeforeDebug && typeof startGeolocationWatch === "function") startGeolocationWatch();
      }

      updateUI();
      draw();
    });
  }

  // Debug: heat override (typed value + Apply)
  const applyHeatFromInput = () => {
    if (!elDbgHeatNew) return;
    const raw = (elDbgHeatNew.value ?? "").toString().trim();
    let v = parseFloat(raw);
    if (!isFinite(v)) v = 0;
    v = Math.max(0, Math.min(5, v));
    // normalize input
    elDbgHeatNew.value = v.toFixed(1);
    // Heat model is continuous (heatValue) with a locked-in integer tier (heatLevel).
    // Debug override should set the continuous value.
    if (typeof setHeatValue === "function") setHeatValue(v);
    // current heat display will refresh via updateHUD; but update immediately too
    if (elDbgHeatCurrent) elDbgHeatCurrent.textContent = `${v.toFixed(1)}/5`;
  };

  if (elDbgHeatApply) {
    elDbgHeatApply.addEventListener("click", applyHeatFromInput);
  }
  if (elDbgHeatNew) {
    elDbgHeatNew.addEventListener("keydown", (e) => {
      if (e.key === "Enter") applyHeatFromInput();
    });
    elDbgHeatNew.addEventListener("blur", () => {
      if ((elDbgHeatNew.value ?? "").toString().trim() === "") return;
      applyHeatFromInput();
    });
  }

  if (elDbgTimerPlus5) {
    elDbgTimerPlus5.addEventListener("click", () => {
      try {
        if (typeof window.debugAdvanceRoundElapsedByMs === "function") {
          const changed = window.debugAdvanceRoundElapsedByMs(5 * 60 * 1000);
          if (changed) {
            if (typeof updateHUD === "function") updateHUD();
            if (typeof updateUI === "function") updateUI();
            if (typeof log === "function") log("⏱️ Debug: advanced elapsed round time by 5 minutes.");
          }
        }
      } catch (e) {
        console.error(e);
      }
    });
  }


  // Heat widget toast
  if (elHeatWidget) {
    elHeatWidget.addEventListener("click", () => {
      try {
        if (typeof showHeatToast === "function") showHeatToast();
      } catch (e) {}
    });
  }

  // ---- Debug: show all POI pins (Leaflet) ----
  if (elDbgShowAllPois) {
    elDbgShowAllPois.addEventListener("change", () => {
      const on = !!elDbgShowAllPois.checked;
      try {
        if (typeof window.setAllPoiPinsVisible === "function") window.setAllPoiPinsVisible(on);
      } catch (e) {}
    });
  }


  // Gameplay menu navigation (new UI)
  const gameMenu = document.getElementById("gameMenu");
  const radarMenu = document.getElementById("radarMenu");
  const thermoMenu = document.getElementById("thermoMenu");
  const dirMenu = document.getElementById("dirMenu");
  const landmarkMenu = document.getElementById("landmarkMenu");
  const photoMenu = document.getElementById("photoMenu");
  const panelGameplay = document.getElementById("panelGameplay");
  const panelNewGame = document.getElementById("panelNewGame");
  const savedGameSetup = (typeof window.getGameSetupSelection === 'function')
    ? window.getGameSetupSelection()
    : { length: 'short', difficulty: 'normal' };
  let selectedGameLength = ((savedGameSetup && savedGameSetup.length) || 'short').toLowerCase();
  let selectedGameDifficulty = ((savedGameSetup && savedGameSetup.difficulty) || 'normal').toLowerCase();

  function selectChoice(groupSelector, attrName, value) {
    document.querySelectorAll(groupSelector).forEach(btn => {
      const isSel = (btn.getAttribute(attrName) || "") === value;
      btn.classList.toggle("is-selected", isSel);
      btn.setAttribute("aria-pressed", isSel ? "true" : "false");
    });
  }

  selectChoice('[data-game-length]', 'data-game-length', selectedGameLength);
  selectChoice('[data-game-difficulty]', 'data-game-difficulty', selectedGameDifficulty);

  document.querySelectorAll('[data-game-length]').forEach(btn => {
    btn.addEventListener('click', () => {
      selectedGameLength = (btn.getAttribute('data-game-length') || 'short').toLowerCase();
      selectChoice('[data-game-length]', 'data-game-length', selectedGameLength);
      try { if (typeof window.setGameSetupSelection === 'function') window.setGameSetupSelection({ length: selectedGameLength }); } catch (e) {}
    });
  });

  document.querySelectorAll('[data-game-difficulty]').forEach(btn => {
    btn.addEventListener('click', () => {
      selectedGameDifficulty = (btn.getAttribute('data-game-difficulty') || 'normal').toLowerCase();
      selectChoice('[data-game-difficulty]', 'data-game-difficulty', selectedGameDifficulty);
      try { if (typeof window.setGameSetupSelection === 'function') window.setGameSetupSelection({ difficulty: selectedGameDifficulty }); } catch (e) {}
    });
  });


  function refreshLandmarkNearestLabels() {
    try {
      if (!landmarkMenu) return;
      const labels = landmarkMenu.querySelectorAll("[data-nearest-label]");
      if (!labels || !labels.length) return;

      // If player location isn't set yet, show a friendly prompt.
      if (!player || typeof player.lat !== "number" || typeof player.lon !== "number") {
        labels.forEach(el => { el.textContent = "Nearest: (set location)"; });
        return;
      }

      // Use full dataset for labels — POIS is filtered to mode radius, __allPois is not.
      const pois = Array.isArray(window.__allPois) && window.__allPois.length ? window.__allPois : (Array.isArray(POIS) ? POIS : []);

      const pools = (typeof window.__landmarkCategoryPoisFilter === 'function')
        ? {
            train_station: window.__landmarkCategoryPoisFilter('train_station', pois),
            cathedral:     window.__landmarkCategoryPoisFilter('cathedral', pois),
            bus_station:   window.__landmarkCategoryPoisFilter('bus_station', pois),
            library:       window.__landmarkCategoryPoisFilter('library', pois),
            museum:        window.__landmarkCategoryPoisFilter('museum', pois),
          }
        : {};

      function nearestFrom(list) {
        let best = null;
        let bestD = Infinity;
        for (const p of list) {
          const d = haversineMeters(player.lat, player.lon, p.lat, p.lon);
          if (d < bestD) { bestD = d; best = p; }
        }
        return { poi: best, meters: bestD };
      }

      labels.forEach(el => {
        const kind = (el.getAttribute("data-nearest-label") || "").toLowerCase();
        const list = pools[kind] || [];
        if (!list.length) {
          el.textContent = "Nearest: (none)";
          return;
        }
        const n = nearestFrom(list);
        const name = (n.poi && n.poi.name) ? n.poi.name : "Unknown";
        el.textContent = `Nearest: ${name} (${Math.round(n.meters)}m)`;
      });
    } catch (e) {
      // fail silently (UI nicety only)
      console.error(e);
    }
  }

  function showMenu(which) {
    if (!gameMenu || !radarMenu || !thermoMenu || !dirMenu || !landmarkMenu || !photoMenu) return;
    const showMain = which === "main";
    const showRadar = which === "radar";
    const showThermo = which === "thermo";
    const showDir = which === "dir";
    const showLandmark = which === "landmark";
    const showPhoto = which === "photo";

    gameMenu.classList.toggle("hidden", !showMain);
    radarMenu.classList.toggle("hidden", !showRadar);
    thermoMenu.classList.toggle("hidden", !showThermo);
    dirMenu.classList.toggle("hidden", !showDir);
    landmarkMenu.classList.toggle("hidden", !showLandmark);
    photoMenu.classList.toggle("hidden", !showPhoto);
    if (showLandmark) refreshLandmarkNearestLabels();
    if (showRadar) {
      try { if (typeof window.updateRadarMenuForMode === 'function') window.updateRadarMenuForMode(); } catch(e) {}
    }

    // Resize Gameplay panel to fit the active menu (main menu is compact).
    try { if (typeof updateGameplayPanelWidth === "function") updateGameplayPanelWidth(); } catch (e) {}
  }

  on("qRadar", "click", () => showMenu("radar"));
  on("qThermo", "click", () => showMenu("thermo"));
  on("qDir", "click", () => showMenu("dir"));
  on("qLandmark", "click", () => showMenu("landmark"));
  on("qPhoto", "click", () => showMenu("photo"));
  on("radarBack", "click", () => showMenu("main"));
  on("gameClose", "click", () => { if (panelGameplay) panelGameplay.classList.remove("open"); showMenu("main"); });
  on("thermoBack", "click", () => showMenu("main"));
  on("thermoClose", "click", () => { if (panelGameplay) panelGameplay.classList.remove("open"); showMenu("main"); });
  on("dirBack", "click", () => showMenu("main"));
  on("dirClose", "click", () => { if (panelGameplay) panelGameplay.classList.remove("open"); showMenu("main"); });
  on("landmarkBack", "click", () => showMenu("main"));
  on("landmarkClose", "click", () => { if (panelGameplay) panelGameplay.classList.remove("open"); showMenu("main"); });
  on("photoBack", "click", () => showMenu("main"));
  on("photoClose", "click", () => { if (panelGameplay) panelGameplay.classList.remove("open"); showMenu("main"); });


  function isToolOptionAlreadyUsed(toolId, optionId) {
    try {
      return !!(window.isToolOptionUsedThisRound && window.isToolOptionUsedThisRound(toolId, optionId));
    } catch (e) {
      return false;
    }
  }

  function noteToolOptionUsed(toolId, optionId) {
    try { if (window.markToolOptionUsedThisRound) window.markToolOptionUsedThisRound(toolId, optionId); } catch (e) {}
    try { if (typeof updateUI === 'function') updateUI(); } catch (e) {}
    try { if (typeof window.updateHUD === 'function') window.updateHUD(); } catch (e) {}
  }

  function blockIfToolOptionAlreadyUsed(toolId, optionId, niceLabel) {
    if (!isToolOptionAlreadyUsed(toolId, optionId)) return false;
    const label = niceLabel || `${toolId} ${optionId}`;
    try { if (typeof showToast === 'function') showToast(`${label} has already been used this round.`, false); } catch (e) {}
    return true;
  }

  function applyQuestionCosts(toolId, optionId) {
    const cost = (typeof getToolCosts === "function") ? getToolCosts(toolId, optionId) : null;
    let h = (cost && typeof cost.heat_cost === "number" && isFinite(cost.heat_cost))
      ? cost.heat_cost
      : (typeof QUESTION_HEAT_COST === "number" ? QUESTION_HEAT_COST : 0.5);

    // Curse surcharges: heat1 = +0.25, heat2 = +0.5
    try {
      if (typeof window.isCurseActive === "function") {
        if (window.isCurseActive("heat1")) h += 0.25;
        if (window.isCurseActive("heat2")) h += 0.5;
      }
    } catch(e) {}

    try { if (typeof addHeat === "function") addHeat(h); else if (typeof setHeatLevel === "function") setHeatLevel((heatLevel||0)+h); } catch(e) {}

    // Curse roll (v2): each question can trigger a curse based on current heat level.
    // Return the roll so the caller can show a follow-up popup AFTER the answer toast.
    try {
      if (typeof window.maybeTriggerCurseFromQuestion === 'function') {
        return window.maybeTriggerCurseFromQuestion({ toolId, optionId });
      }
    } catch (e) {}
    return null;
  }

  if (radarMenu) {
    radarMenu.querySelectorAll("[data-radar]").forEach(btn => {
      btn.addEventListener("click", () => {
        const meters = parseFloat(btn.getAttribute("data-radar") || "0");
        if (blockIfToolOptionAlreadyUsed('radar', String(meters), `${meters}m radar`)) return;
        // Curse: heat4 caps radar at 250m
        if (typeof window.isCurseActive === "function" && window.isCurseActive("heat4") && meters > 250) {
          showToast("Radar is limited to 250m while cursed.", false);
          return;
        }
        // Apply costs
        const curseRoll = applyQuestionCosts("radar", String(meters));
        if (curseRoll && curseRoll.blocked) return;
        // Close overlay immediately
        if (panelGameplay) panelGameplay.classList.remove("open");
        showMenu("main");
        try {
          const res = (meters > 0) ? askRadar(meters) : askRadar();
          if (res && typeof res.ok === "boolean") {
            const m = res.meters;
            const pretty = (m >= 1000)
              ? (m/1000).toFixed(m%1000===0?0:1) + "km"
              : m + "m";
            const msg = res.ok
              ? `Yes — the target is within ${pretty}.`
              : `No — the target is not within ${pretty}.`;
            showToast(msg, res.ok);
            noteToolOptionUsed('radar', String(meters));

            // If a curse triggered, queue a follow-up popup AFTER the answer toast is dismissed.
            try {
              if (curseRoll && curseRoll.triggered && curseRoll.applied && curseRoll.applied.curse) {
                const c = curseRoll.applied.curse;
                showToast(`You've been cursed: <b>${c.name}</b>.<br>(5 minutes)`, false, { kind: 'curse' });
              }
            } catch (e) {}
          }
        } catch (e) {
          console.error(e);
        }
      });
    });
  }

  // Thermometer menu (UI only for now)
  if (thermoMenu) {
    thermoMenu.querySelectorAll("[data-thermo]").forEach(btn => {
      btn.addEventListener("click", () => {
        const distM = parseFloat(btn.getAttribute("data-thermo") || "0");
        if (blockIfToolOptionAlreadyUsed('thermometer', String(distM), `${distM}m thermometer`)) return;
        if (panelGameplay) panelGameplay.classList.remove("open");
        showMenu("main");
        if (typeof showToast === "function") {
          let started = false;
          try {
            if (typeof startDistanceThermometer === "function") {
              const r = startDistanceThermometer(distM);
              started = !!(r && r.ok);
            }
          } catch(e) { console.error(e); }
          if (started) {
            const curseRoll = applyQuestionCosts("thermometer", String(distM));
            if (curseRoll && curseRoll.blocked) return;
            showToast(`Thermometer active — walk ${distM}m.`, true);
            noteToolOptionUsed('thermometer', String(distM));

            try {
              if (curseRoll && curseRoll.triggered && curseRoll.applied && curseRoll.applied.curse) {
                const c = curseRoll.applied.curse;
                showToast(`You've been cursed: <b>${c.name}</b>.<br>(5 minutes)`, false, { kind: 'curse' });
              }
            } catch (e) {}
          } else {
            showToast("Set your location first (geolocation) before using the thermometer.", false);
          }
        }
      });
    });
  }


  // N/S/E/W menu (UI only for now + location check)
  if (dirMenu) {
    dirMenu.querySelectorAll("[data-dir]").forEach(btn => {
      btn.addEventListener("click", () => {
        const mode = btn.getAttribute("data-dir") || "";
        try {
          const info = (typeof window.getToolUnlockInfo === 'function') ? window.getToolUnlockInfo('nsew', String(mode)) : null;
          if (info && info.locked) {
            if (typeof showToast === "function") showToast(`This tool unlocks in ${formatMMSS(info.remainingMs)}.`, false);
            return;
          }
        } catch (e) {}
        if (blockIfToolOptionAlreadyUsed('nsew', String(mode), `${mode} split`)) return;
        if (!player) {
          if (typeof showToast === "function") showToast("Set your location first (geolocation) before using N/S/E/W.", false);
          return;
        }
        const curseRoll = applyQuestionCosts("nsew", String(mode));
        if (curseRoll && curseRoll.blocked) return;
        if (panelGameplay) panelGameplay.classList.remove("open");
        showMenu("main");
        try {
          const res = (typeof askAxisDirection === "function") ? askAxisDirection(mode) : null;
          if (res && typeof showToast === "function") {
            const msg = (mode === "NS")
              ? `The target is ${res.label} of you.`
              : `The target is ${res.label} of you.`;
            showToast(msg, true);
            noteToolOptionUsed('nsew', String(mode));

            try {
              if (curseRoll && curseRoll.triggered && curseRoll.applied && curseRoll.applied.curse) {
                const c = curseRoll.applied.curse;
                showToast(`You've been cursed: <b>${c.name}</b>.<br>(5 minutes)`, false, { kind: 'curse' });
              }
            } catch (e) {}
          }
        } catch (e) {
          console.error(e);
          if (typeof showToast === "function") showToast("Couldn't run N/S/E/W right now.", false);
        }
      });
    });
  }


  // Landmark live-query helpers

  function __landmarkSaveCategoryHTML() {
    if (__landmarkCategoryHTML !== null) return;
    if (landmarkMenu) __landmarkCategoryHTML = landmarkMenu.innerHTML;
  }

  function __landmarkRestoreCategoryList() {
    __landmarkActiveFetchKind = null;
    if (landmarkMenu && __landmarkCategoryHTML) {
      landmarkMenu.innerHTML = __landmarkCategoryHTML;
      try { if (typeof refreshLandmarkNearestLabels === 'function') refreshLandmarkNearestLabels(); } catch(e) {}
    }
  }

  function __landmarkShowLoading(kind) {
    const label = kind.replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase());
    if (!landmarkMenu) return;
    landmarkMenu.innerHTML = `
      <div class="flex justify-between mb-3">
        <button id="lmPreviewBack" class="px-3 py-2 rounded-xl bg-[#1e2d44] border border-[#2a3f60] text-sm text-gray-300 cursor-pointer hover:bg-[#253550]">← Back</button>
        <button id="lmPreviewClose" class="px-3 py-2 rounded-xl bg-[#1e2d44] border border-[#2a3f60] text-sm text-gray-300 cursor-pointer hover:bg-[#253550]">Close ✕</button>
      </div>
      <div class="text-[11px] uppercase tracking-widest text-emerald-400 font-semibold mb-3">${label}</div>
      <div id="lmPreviewBody" class="flex flex-col gap-3 py-2">
        <div class="text-slate-400 text-sm animate-pulse">Searching nearby…</div>
      </div>`;
    document.getElementById('lmPreviewBack')
      ?.addEventListener('click', __landmarkRestoreCategoryList);
    document.getElementById('lmPreviewClose')
      ?.addEventListener('click', () => { __landmarkRestoreCategoryList(); if (panelGameplay) panelGameplay.classList.remove('open'); showMenu('main'); });
  }

  function __landmarkShowPreviewResult(kind, nearestPoi, nearestMeters, error) {
    const body = document.getElementById('lmPreviewBody');
    if (!body) return;
    const cost = (typeof getToolCosts === 'function') ? getToolCosts('landmark', kind) : { heat_cost: 0.5 };
    const heatDisplay = Number(cost && cost.heat_cost != null ? cost.heat_cost : 0.5).toFixed(1);
    if (error || !nearestPoi) {
      body.innerHTML = `
        <div class="text-slate-400 text-sm">${error || 'Nothing found nearby.'}</div>
        <button id="lmCancelBtn" class="mt-2 px-4 py-2 rounded-xl bg-[#1e2d44] border border-[#2a3f60] text-sm text-gray-300 cursor-pointer hover:bg-[#253550]">Cancel</button>`;
    } else {
      const dist = nearestMeters < 1000 ? `${Math.round(nearestMeters)}m` : `${(nearestMeters/1000).toFixed(1)}km`;
      body.innerHTML = `
        <div class="text-gray-100 text-sm">Your nearest: <b>${nearestPoi.name}</b><span class="text-slate-400"> (${dist})</span></div>
        <div class="text-slate-400 text-xs">Costs <span class="text-amber-400 font-semibold">🔥 ${heatDisplay}</span> heat to confirm.</div>
        <div class="flex gap-2 mt-1">
          <button id="lmConfirmBtn" class="flex-1 px-4 py-2 rounded-xl bg-emerald-600 text-white font-bold text-sm cursor-pointer hover:bg-emerald-500 active:scale-[.98]">Confirm</button>
          <button id="lmCancelBtn" class="px-4 py-2 rounded-xl bg-[#1e2d44] border border-[#2a3f60] text-sm text-gray-300 cursor-pointer hover:bg-[#253550]">Cancel</button>
        </div>`;
    }
    document.getElementById('lmCancelBtn')?.addEventListener('click', __landmarkRestoreCategoryList);
  }

  function __landmarkConfirm(kind, categoryPois) {
    const pretty = kind.replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase());
    if (blockIfToolOptionAlreadyUsed('landmark', kind, pretty)) return;

    const curseRoll = applyQuestionCosts('landmark', kind);
    if (curseRoll && curseRoll.blocked) return;

    __landmarkRestoreCategoryList();
    if (panelGameplay) panelGameplay.classList.remove('open');
    showMenu('main');

    let npPoi = null, npDist = Infinity, ntPoi = null, ntDist = Infinity;
    for (const p of categoryPois) {
      const dp = haversineMeters(player.lat, player.lon, p.lat, p.lon);
      const dt = haversineMeters(target.lat, target.lon, p.lat, p.lon);
      if (dp < npDist) { npDist = dp; npPoi = p; }
      if (dt < ntDist) { ntDist = dt; ntPoi = p; }
    }

    if (!npPoi) { showToast(`No ${pretty} found in range.`, false); return; }

    const pKey = String(npPoi.id || npPoi.name);
    const tKey = ntPoi ? String(ntPoi.id || ntPoi.name) : '';
    const same = !!ntPoi && pKey === tKey;

    try {
      if (kind === 'train_station' && typeof addFogNearestStation === 'function')
        addFogNearestStation(pKey, same);
      else if (typeof addFogNearestLandmark === 'function')
        addFogNearestLandmark(kind, pKey, same);
    } catch(e) { console.error(e); }

    showToast(
      same ? `YES — you and the target share the same nearest ${pretty}.`
           : `NO — your nearest ${pretty} is not the target's nearest.`,
      same
    );

    noteToolOptionUsed('landmark', kind);

    try {
      if (curseRoll && curseRoll.triggered && curseRoll.applied && curseRoll.applied.curse) {
        const c = curseRoll.applied.curse;
        showToast(`You've been cursed: <b>${c.name}</b>.<br>(5 minutes)`, false, { kind: 'curse' });
      }
    } catch(e) {}
  }

  // Landmark menu — use event delegation so listeners survive innerHTML replacement
  // when __landmarkRestoreCategoryList() swaps the category list back in.
  if (landmarkMenu) {
    landmarkMenu.addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-landmark]');
      if (!btn) return;
      const kind = (btn.getAttribute('data-landmark') || '').toLowerCase();
      if (!player || typeof player.lat !== 'number') {
        showToast('Set your location before using Landmark.', false); return;
      }
      if (!target || typeof target.lat !== 'number') {
        showToast('No target set yet.', false); return;
      }

      __landmarkSaveCategoryHTML();
      __landmarkActiveFetchKind = kind;
      __landmarkShowLoading(kind);

      let categoryPois;
      const cached = __landmarkLiveCache[kind];
      if (cached) {
        categoryPois = cached.pois;
      } else {
        const result = await window.__fetchLandmarkPoisForKind(kind);
        if (__landmarkActiveFetchKind !== kind) return; // user pressed Back mid-fetch
        if (result.error && !result.pois.length) {
          __landmarkShowPreviewResult(kind, null, null, result.error); return;
        }
        __landmarkLiveCache[kind] = { pois: result.pois, ts: Date.now() };
        categoryPois = result.pois;
      }

      let nearestPoi = null, nearestDist = Infinity;
      for (const p of categoryPois) {
        const d = haversineMeters(player.lat, player.lon, p.lat, p.lon);
        if (d < nearestDist) { nearestDist = d; nearestPoi = p; }
      }

      __landmarkShowPreviewResult(kind, nearestPoi, nearestDist, null);

      document.getElementById('lmConfirmBtn')?.addEventListener('click', () => {
        __landmarkActiveFetchKind = null;
        __landmarkConfirm(kind, categoryPois);
      });
    });
  }

  // Photo menu
  if (photoMenu) {
    photoMenu.querySelectorAll('[data-photo]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const mode = (btn.getAttribute('data-photo') || 'glimpse').toLowerCase();
        if (panelGameplay) panelGameplay.classList.remove('open');
        showMenu('main');

        if (mode === 'starter') {
          try {
            if (typeof showStreetViewGlimpseForTarget === 'function') {
              const res = await showStreetViewGlimpseForTarget({ context: 'snapshot' });
              // Re-viewing the starter snapshot is always free.
              if (res && res.ok) {
                if (typeof window.setLast === 'function') window.setLast('REVIEW', true);
              }
            } else {
              showToast('Photo glimpse module not loaded.', false);
            }
          } catch (e) {
            console.error(e);
            showToast('Could not load the starter photo right now.', false);
          }
          return;
        }

        if (mode === 'near100' || mode === 'near200') {
          // Curse: heat5 blocks extra photos
          if (typeof window.isCurseActive === "function" && window.isCurseActive("heat5")) {
            showToast("Extra photos are blocked while cursed.", false);
            return;
          }
          try {
            if (typeof window.showStreetViewExtraPhotoForTarget === 'function') {
              const res = await window.showStreetViewExtraPhotoForTarget({ tier: mode });
              if (!res || !res.ok) {
                showToast('No further photos available for this target.', false);
              } else {
                // First unlock adds heat; re-opening an already unlocked photo is free.
                try {
                  if (!res.cached) {
                    const cost = (typeof getToolCosts === "function") ? getToolCosts("photo", String(mode)) : null;
                    const h = (cost && typeof cost.heat_cost === "number" && isFinite(cost.heat_cost))
                      ? cost.heat_cost
                      : (typeof QUESTION_HEAT_COST === "number" ? QUESTION_HEAT_COST : 0.5);
                    if (typeof addHeat === "function") addHeat(h);
                    else if (typeof setHeatLevel === "function") setHeatLevel((heatLevel||0)+h);
                  }
                } catch(e) {}
              }
              try { if (typeof window.updateCostBadgesFromConfig === 'function') window.updateCostBadgesFromConfig(); } catch(e) {}
              try { if (typeof window.updateHUD === 'function') window.updateHUD(); } catch(e) {}
            } else {
              showToast('Extra photo module not loaded.', false);
            }
          } catch(e) { console.error(e); showToast('Could not fetch an extra photo right now.', false); }
          return;
        }

        if (mode === 'uncorrupt') {
          if (blockIfToolOptionAlreadyUsed('photo', String(mode), 'Uncorrupt')) return;
          try {
            const already = (typeof window.__arePhotosUncorrupted === 'function') ? !!window.__arePhotosUncorrupted() : false;
            if (already) {
              showToast('Photos are already uncorrupted for this round.', true);
              return;
            }
            if (typeof window.__setPhotosUncorrupted === 'function') window.__setPhotosUncorrupted(true);

            // If a photo is currently open, update its frame instantly.
            try {
              document.querySelectorAll('.photo-glimpse-frame').forEach(el => el.classList.add('is-uncorrupted'));
              const s = document.getElementById('photoGlitchSlices');
              if (s) s.innerHTML = '';
              const b = document.getElementById('photoCorruptBlocks');
              if (b) b.innerHTML = '';
            } catch(e) {}

            try { if (typeof window.updateHUD === 'function') window.updateHUD(); } catch(e) {}
            showToast('All photos uncorrupted for this round.', true);
            noteToolOptionUsed('photo', String(mode));
          } catch(e) { console.error(e); showToast('Could not uncorrupt photos right now.', false); }
          return;
        }

        // Unknown mode
        return;

      });
    });
  }

  // Ensure modal handlers are wired (safe to call multiple times)
  try { if (typeof bindPhotoModal === 'function') bindPhotoModal(); } catch(e) {}

  // Phase 2: Lock In Guess + Start New Round
  try {
    const btnLock = document.getElementById('btnLockGuess');
    if (btnLock) {
      btnLock.addEventListener('click', async () => {
        try {
          if (typeof window.lockInGuess === 'function') await window.lockInGuess();
        } catch(e) { console.error(e); }
      });
    }
    const btnNR = document.getElementById('btnNewRound');
    if (btnNR) {
      btnNR.addEventListener('click', () => {
        try { if (typeof window.closeResultModal === 'function') window.closeResultModal(); } catch(e) {}
        try { if (typeof window.startNewRound === 'function') window.startNewRound(); } catch(e) {}
      });
    }
    const rClose = document.getElementById('resultModalClose');
    if (rClose) rClose.addEventListener('click', () => {
      try { if (typeof window.closeResultModal === 'function') window.closeResultModal(); } catch(e) {}
    });
  } catch(e) {}


}
window.bindUI = bindUI;