// ---- DOM ----
let __landmarkLiveCache = {};       // { [kind]: { pois, ts } } — cleared each new game
let __landmarkPoiPoolCache = {}; // { [kind]: POI[] } — populated on first menu open, cleared on new game
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
// elDbgSimCurse removed — replaced by btnDbgSimCurse + panelCurseSelect (see 14_panels_misc.js)
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
const elTimerMain            = document.getElementById("timerMain");
const elTimerPenalty         = document.getElementById("timerPenalty");
const elHeatWidget           = document.getElementById("heatWidget");
const elTimerCurseIndicator  = document.getElementById("timerCurseIndicator");
const elThermoProgress       = document.getElementById("thermoProgress");
const elThermoProgressFill   = document.getElementById("thermoProgressFill");
const elThermoProgressText   = document.getElementById("thermoProgressText");




// Bind UI event listeners (called from boot after all functions are defined).
// Toasts are queued so we can show "answer" first, then (optionally) a "cursed" popup after dismissal.
const __toastQueue = [];
let __toastShowing = false;

function __showNextToast(){
  const toast = document.getElementById("toast");
  if (!toast) { __toastQueue.length = 0; __toastShowing = false; return; }
  const item = __toastQueue.shift();
  if (!item) { __toastShowing = false; window.__dismissCurrentToast = null; return; }

  __toastShowing = true;

  const { msg, ok, kind, autoDismissMs, resolve } = item;
  const icon = (kind === "curse") ? "🟣" : (ok ? "✅" : "❌");
  toast.innerHTML = `<div class="toastIcon">${icon}</div><div>${msg}</div>`;
  toast.classList.remove("hidden","good","bad","curse");
  if (kind === "curse") toast.classList.add("curse");
  else toast.classList.add(ok ? "good" : "bad");

  let autoDismissTimer = null;

  // Prevent accidental tap-dismiss during map pan gestures immediately after a toast appears
  let _dismissGuarded = true;
  const _guardTimer = setTimeout(() => { _dismissGuarded = false; }, 600);

  const dismiss = () => {
    clearTimeout(_guardTimer);
    if (autoDismissTimer) { clearTimeout(autoDismissTimer); autoDismissTimer = null; }
    window.__dismissCurrentToast = null;
    toast.classList.add("hidden");
    toast.classList.remove("good","bad","curse");
    window.removeEventListener("pointerdown", _tapDismiss, true);
    window.removeEventListener("keydown", dismiss, true);
    try { resolve && resolve(); } catch(e) {}
    __showNextToast();
  };

  const _tapDismiss = () => {
    if (_dismissGuarded) return;
    dismiss();
  };

  window.__dismissCurrentToast = dismiss;
  window.addEventListener("pointerdown", _tapDismiss, true);
  window.addEventListener("keydown", dismiss, true);
  if (autoDismissMs > 0) autoDismissTimer = setTimeout(dismiss, autoDismissMs);
}

function enqueueToast(msg, ok, opts = null){
  return new Promise((resolve) => {
    const kind = (opts && opts.kind) ? String(opts.kind) : "";
    const autoDismissMs = (opts && opts.autoDismissMs > 0) ? opts.autoDismissMs : 0;
    __toastQueue.push({ msg, ok: !!ok, kind, autoDismissMs, resolve });
    if (!__toastShowing) __showNextToast();
  });
}

function showToast(msg, ok, opts = null){
  // Back-compat: most callers ignore the promise.
  try { enqueueToast(msg, ok, opts); } catch(e) {}
}

// Expose for modules that want to chain popups.
window.enqueueToast = enqueueToast;

// Immediately dismiss any visible toast and drain the queue (e.g. before a reveal animation).
window.dismissAllToasts = function() {
  __toastQueue.length = 0;
  if (typeof window.__dismissCurrentToast === 'function') window.__dismissCurrentToast();
};

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

function __refreshPhotoGalleryStrip() {
  const btn   = document.getElementById('btnPhotoGallery');
  const badge = document.getElementById('photoGalleryBadge');
  if (!btn) return;
  const photos = (() => {
    try {
      const r = (typeof window.getRoundStateV1 === 'function') ? window.getRoundStateV1() : null;
      return (r && Array.isArray(r.photos)) ? r.photos : [];
    } catch(e) { return []; }
  })();
  const count = photos.length;
  if (count === 0) {
    btn.classList.add('hidden');
    if (badge) { badge.textContent = ''; badge.classList.add('hidden'); }
    return;
  }
  btn.classList.remove('hidden');
  if (badge) { badge.textContent = String(count); badge.classList.remove('hidden'); }
}
window.__refreshPhotoGalleryStrip = __refreshPhotoGalleryStrip;

function __buildPhotoGalleryGrid() {
  const grid  = document.getElementById('photoGalleryGrid');
  const empty = document.getElementById('photoGalleryEmpty');
  if (!grid) return;
  const photos = (() => {
    try {
      const r = (typeof window.getRoundStateV1 === 'function') ? window.getRoundStateV1() : null;
      return (r && Array.isArray(r.photos)) ? r.photos : [];
    } catch(e) { return []; }
  })();
  grid.innerHTML = '';
  if (!photos.length) {
    if (empty) empty.classList.remove('hidden');
    return;
  }
  if (empty) empty.classList.add('hidden');
  const isCorrupted = !(typeof window.__arePhotosUncorrupted === 'function' && window.__arePhotosUncorrupted());
  for (const photo of photos) {
    const item = document.createElement('div');
    item.className = 'photoGalleryItem';
    if (isCorrupted && photo.kind !== 'starter') item.classList.add('is-corrupted');
    item.dataset.photoUrl    = photo.url || '';
    item.dataset.photoKind   = photo.kind || 'Photo';
    item.dataset.photoSource = photo.sourceUrl || '';
    const img = document.createElement('img');
    img.src = photo.url || '';
    img.alt = photo.kind || 'Photo';
    img.loading = 'lazy';
    item.appendChild(img);
    grid.appendChild(item);
  }
}
window.__buildPhotoGalleryGrid = __buildPhotoGalleryGrid;

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
    try { if (typeof window.__setInitStatus === 'function') window.__setInitStatus('Finding your location…'); } catch(e) {}

    try {
      if (typeof window.__setPlayerFromCurrentLocation === 'function') {
        const fix = await window.__setPlayerFromCurrentLocation({
          source: 'new-game-start',
          force: true,
          centerAfterFix: true,
          geoOpts: { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 }
        });
        try { if (typeof window.__setInitStatus === 'function') window.__setInitStatus(''); } catch(e) {}
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
      try { if (typeof window.__setInitStatus === 'function') window.__setInitStatus(''); } catch(e) {}
      return true;
    } catch (err) {
      try { if (typeof window.__setInitStatus === 'function') window.__setInitStatus(''); } catch(e) {}
      const msg = (err && err.message) ? err.message : String(err || 'geo_unavailable');
      try { log(`⚠️ Couldn't get current location for new game (${msg}); using default start.`); } catch (e) {}
      try {
        if (typeof DEFAULT_START_LATLNG !== 'undefined' && DEFAULT_START_LATLNG && typeof setPlayerLatLng === 'function') {
          setPlayerLatLng(DEFAULT_START_LATLNG.lat, DEFAULT_START_LATLNG.lon, { manual: true, source: 'fallback:default-start', force: true });
          try { if (typeof centerOnPlayer === 'function') centerOnPlayer(); } catch (e) {}
          try { log(`📍 New game fallback start: ${DEFAULT_START_LATLNG.lat.toFixed(6)}, ${DEFAULT_START_LATLNG.lon.toFixed(6)} (Lime Street)`); } catch (e) {}
        }
      } catch (e) {}
      try {
        showToast("📍 Couldn't get your location — map centred on Liverpool city centre. You may want to set your position before starting.", false, { autoDismissMs: 0 });
      } catch(e) {}
      return false;
    }
  }

  function __formatGameSetupLabel() {
    try {
      const setup = (typeof window.getGameSetupSelection === 'function') ? window.getGameSetupSelection() : null;
      const length = ((setup && setup.length) || 'short');
      const difficulty = ((setup && setup.difficulty) || 'normal');
      const limitMs = (typeof window.getRoundTimeLimitMs === 'function') ? window.getRoundTimeLimitMs() : ((typeof ROUND_TIME_LIMIT_MS === 'number' && isFinite(ROUND_TIME_LIMIT_MS)) ? ROUND_TIME_LIMIT_MS : (30 * 60 * 1000));
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
      // Clear any persisted result from the previous round so a refresh mid-game
      // doesn't restore a stale result modal instead of resuming the live game.
      try { localStorage.removeItem('mapgame_result_html_v1'); } catch(e) {}
      try { const m = document.getElementById('resultModal'); if (m) m.classList.add('hidden'); } catch(e) {}
      __landmarkLiveCache = {};
      __landmarkPoiPoolCache = {};
      __landmarkCategoryHTML = null;
      // Rebuild radar and thermometer menus for the newly-selected mode before the round starts.
      try { if (typeof window.updateRadarMenuForMode === 'function') window.updateRadarMenuForMode(); } catch(e) {}
      try { if (typeof window.updateThermoMenuForMode === 'function') window.updateThermoMenuForMode(); } catch(e) {}
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

  // ---- Debug: simulate curse — handled in 14_panels_misc.js via btnDbgSimCurse + panelCurseSelect ----

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
    if (showThermo) {
      try { if (typeof window.updateThermoMenuForMode === 'function') window.updateThermoMenuForMode(); } catch(e) {}
    }

    // Resize Gameplay panel to fit the active menu (main menu is compact).
    try { if (typeof updateGameplayPanelWidth === "function") updateGameplayPanelWidth(); } catch (e) {}
  }

  // Menu navigation is handled via panelGameplay delegation below (survives innerHTML restores).


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

  // ─── Generic tool confirmation helper ───────────────────────────────────────
  // Replaces `menu.innerHTML` with a confirm/cancel view. Calls `onConfirm()`
  // on confirmation or restores original HTML on cancel/back/close.
  function __formatTimeCost(ms) {
    const s = Math.round(ms / 1000);
    if (s <= 0) return '';
    return s >= 60 ? `${Math.floor(s/60)}m${s%60?' '+s%60+'s':''}`.trim() : `${s}s`;
  }

  function __showCurseToasts(curseRoll) {
    try {
      if (curseRoll && curseRoll.triggered && curseRoll.applied && curseRoll.applied.curse) {
        const c = curseRoll.applied.curse;
        const dur = c.expiresAt && c.appliedAt ? Math.round((c.expiresAt - c.appliedAt) / 60000) : 5;
        const descPart = c.description ? `<br><span style="opacity:.8">${c.description}</span>` : `<br><span class="muted">(${dur} minutes)</span>`;
        showToast(`You've been cursed: <b>${c.name}</b>${descPart}`, false, { kind: 'curse' });
      }
      if (curseRoll && curseRoll.overcharged && curseRoll.overcharged.curse) {
        const oc = curseRoll.overcharged.curse;
        const stacks = oc.stacks || 1;
        const msg = stacks > 1
          ? `<b>Overcharged ×${stacks}</b> — tool uses now cost <b>${__formatTimeCost(stacks * (typeof OVERCHARGED_COST_PER_STACK_S === 'number' ? OVERCHARGED_COST_PER_STACK_S : 90) * 1000)}</b> from your timer.`
          : `<b>Overcharged</b> — tool uses now cost time from your timer.`;
        showToast(msg, false, { kind: 'curse' });
        try { if (typeof window.updateCostBadgesFromConfig === 'function') window.updateCostBadgesFromConfig(); } catch(e) {}
      }
    } catch(e) {}
  }

  function __toolConfirmShow({ menu, title, accentClass, descHtml, cost, onConfirm }) {
    if (!menu) return;
    const savedHTML = menu.innerHTML;
    const heatDisplay = (cost && typeof cost.heat_cost === 'number') ? Number(cost.heat_cost).toFixed(1) : null;
    // Time cost is curse-gated — only show when overcharged curse is active
    const _tcMs = (typeof getToolTimeCostMs === 'function') ? getToolTimeCostMs() : 0;
    const timeDisplay = _tcMs > 0 ? __formatTimeCost(_tcMs) : null;
    const stacks = (typeof window.getOverchargedStacks === 'function') ? window.getOverchargedStacks() : 0;
    const heatRow = heatDisplay
      ? `<div class="text-slate-400 text-xs">Costs <span class="text-amber-400 font-semibold">🔥 ${heatDisplay}</span> heat.</div>`
      : '';
    const timeRow = timeDisplay
      ? `<div class="text-red-400 text-xs mt-1">⚠ Time cursed — costs <span class="font-semibold">⏱ ${timeDisplay}</span> from your timer${stacks > 1 ? ` (${stacks}× stacked)` : ''}.</div>`
      : '';
    const costRow = heatRow + timeRow;
    const restore = () => { menu.innerHTML = savedHTML; };
    menu.innerHTML = `
      <div class="flex justify-between mb-3">
        <button class="__tcBack px-3 py-2 rounded-xl bg-[#1e2d44] border border-[#2a3f60] text-sm text-gray-300 cursor-pointer hover:bg-[#253550]">← Back</button>
        <button class="__tcClose px-3 py-2 rounded-xl bg-[#1e2d44] border border-[#2a3f60] text-sm text-gray-300 cursor-pointer hover:bg-[#253550]">Close ✕</button>
      </div>
      <div class="sectionLabel text-[11px] uppercase tracking-widest ${accentClass} mb-3">${title}</div>
      <div class="flex flex-col gap-2 py-1">
        ${descHtml || ''}
        ${costRow}
        <div class="flex gap-2 mt-2">
          <button class="__tcConfirm flex-1 px-4 py-2 rounded-xl bg-emerald-600 text-white font-bold text-sm cursor-pointer hover:bg-emerald-500 active:scale-[.98]">Confirm</button>
          <button class="__tcCancel px-4 py-2 rounded-xl bg-[#1e2d44] border border-[#2a3f60] text-sm text-gray-300 cursor-pointer hover:bg-[#253550]">Cancel</button>
        </div>
      </div>`;
    menu.querySelector('.__tcBack')?.addEventListener('click', restore);
    menu.querySelector('.__tcCancel')?.addEventListener('click', restore);
    menu.querySelector('.__tcClose')?.addEventListener('click', () => {
      restore();
      if (panelGameplay) panelGameplay.classList.remove('open');
      showMenu('main');
    });
    menu.querySelector('.__tcConfirm')?.addEventListener('click', () => { restore(); onConfirm(); });
  }

  // ─── Radar ───────────────────────────────────────────────────────────────────
  if (radarMenu) {
    radarMenu.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-radar]');
      if (!btn) return;
      const meters = parseFloat(btn.getAttribute('data-radar') || '0');
      if (blockIfToolOptionAlreadyUsed('radar', String(meters), `${meters}m radar`)) return;
      if (typeof window.isCurseActive === 'function' && window.isCurseActive('heat4') && meters > 250) {
        showToast('Radar is limited to 250m while cursed.', false); return;
      }
      const label = meters >= 1000 ? `${meters/1000}km` : `${meters}m`;
      const cost = (typeof getToolCosts === 'function') ? getToolCosts('radar', String(meters)) : { heat_cost: 0.5 };
      __toolConfirmShow({
        menu: radarMenu,
        title: `📡 Radar — ${label}`,
        accentClass: 'text-blue-400',
        cost,
        onConfirm: () => {
          const curseRoll = applyQuestionCosts('radar', String(meters));
          if (curseRoll && curseRoll.blocked) return;
          if (panelGameplay) panelGameplay.classList.remove('open');
          showMenu('main');
          try {
            const res = meters > 0 ? askRadar(meters) : askRadar();
            if (res && typeof res.ok === 'boolean') {
              const m = res.meters;
              const pretty = m >= 1000 ? (m/1000).toFixed(m%1000===0?0:1)+'km' : m+'m';
              showToast(res.ok ? `Yes — the target is within ${pretty}.` : `No — the target is not within ${pretty}.`, res.ok);
              noteToolOptionUsed('radar', String(meters));
              try { if (typeof addPenaltyMs === 'function') addPenaltyMs(getToolTimeCostMs('radar', String(meters))); } catch(e) {}
              __showCurseToasts(curseRoll);
            }
          } catch(e) { console.error(e); }
        }
      });
    });
  }

  // ─── Thermometer ─────────────────────────────────────────────────────────────
  if (thermoMenu) {
    thermoMenu.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-thermo]');
      if (!btn) return;
      const distM = parseFloat(btn.getAttribute('data-thermo') || '0');
      if (blockIfToolOptionAlreadyUsed('thermometer', String(distM), `${distM}m thermometer`)) return;
      const label = distM >= 1000 ? `${distM/1000}km` : `${distM}m`;
      const cost = (typeof getToolCosts === 'function') ? getToolCosts('thermometer', String(distM)) : { heat_cost: 0.5 };
      __toolConfirmShow({
        menu: thermoMenu,
        title: `🌡️ Thermometer — ${label}`,
        accentClass: 'text-orange-400',
        descHtml: `<div class="text-slate-400 text-sm">Walk <span class="text-gray-100 font-semibold">${label}</span> — temperature rises as you approach the target.</div>`,
        cost,
        onConfirm: () => {
          if (panelGameplay) panelGameplay.classList.remove('open');
          showMenu('main');
          let started = false;
          try {
            if (typeof startDistanceThermometer === 'function') {
              const r = startDistanceThermometer(distM);
              started = !!(r && r.ok);
            }
          } catch(e) { console.error(e); }
          if (started) {
            const curseRoll = applyQuestionCosts('thermometer', String(distM));
            if (curseRoll && curseRoll.blocked) return;
            if (typeof showToast === 'function') {
              showToast(`Thermometer started — walk ${distM}m from here.`, true, { autoDismissMs: 3500 });
            }
            noteToolOptionUsed('thermometer', String(distM));
            try { if (typeof addPenaltyMs === 'function') addPenaltyMs(getToolTimeCostMs('thermometer', String(distM))); } catch(e) {}
            __showCurseToasts(curseRoll);
          } else {
            showToast('Set your location first (geolocation) before using the thermometer.', false);
          }
        }
      });
    });
  }

  // ─── N/S/E/W ─────────────────────────────────────────────────────────────────
  if (dirMenu) {
    dirMenu.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-dir]');
      if (!btn) return;
      const mode = btn.getAttribute('data-dir') || '';
      try {
        const info = (typeof window.getToolUnlockInfo === 'function') ? window.getToolUnlockInfo('nsew', String(mode)) : null;
        if (info && info.locked) {
          showToast(`This tool unlocks in ${formatMMSS(info.remainingMs)}.`, false); return;
        }
      } catch(e) {}
      if (blockIfToolOptionAlreadyUsed('nsew', String(mode), `${mode} split`)) return;
      const _pairedMode = mode === 'NS' ? 'EW' : 'NS';
      const _pairedLabel = _pairedMode === 'NS' ? 'N/S' : 'E/W';
      if (isToolOptionAlreadyUsed('nsew', _pairedMode)) {
        showToast(`${_pairedLabel} split already used — only one axis allowed per round.`, false); return;
      }
      if (!player) { showToast('Set your location first (geolocation) before using N/S/E/W.', false); return; }
      const label = mode === 'NS' ? 'North/South' : 'East/West';
      const cost = (typeof getToolCosts === 'function') ? getToolCosts('nsew', String(mode)) : { heat_cost: 0.5 };
      __toolConfirmShow({
        menu: dirMenu,
        title: `🧭 ${label} Split`,
        accentClass: 'text-cyan-400',
        descHtml: `<div class="text-slate-400 text-sm">Reveals whether the target is <span class="text-gray-100 font-semibold">${mode === 'NS' ? 'North or South' : 'East or West'}</span> of your current position.</div>
          <div class="text-amber-400 text-xs mt-2">⚠ Using this locks out the ${_pairedLabel} split for this round.</div>`,
        cost,
        onConfirm: () => {
          const curseRoll = applyQuestionCosts('nsew', String(mode));
          if (curseRoll && curseRoll.blocked) return;
          if (panelGameplay) panelGameplay.classList.remove('open');
          showMenu('main');
          try {
            const res = typeof askAxisDirection === 'function' ? askAxisDirection(mode) : null;
            if (res) {
              showToast(`The target is ${res.label} of you.`, true);
              noteToolOptionUsed('nsew', String(mode));
              noteToolOptionUsed('nsew', _pairedMode); // lock out the other axis
              try { if (typeof addPenaltyMs === 'function') addPenaltyMs(getToolTimeCostMs('nsew', String(mode))); } catch(e) {}
              __showCurseToasts(curseRoll);
            }
          } catch(e) { console.error(e); showToast("Couldn't run N/S/E/W right now.", false); }
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
    const _tcMs = (typeof getToolTimeCostMs === 'function') ? getToolTimeCostMs() : 0;
    const _timeLabel = _tcMs > 0 ? __formatTimeCost(_tcMs) : '';
    const _stacks = (typeof window.getOverchargedStacks === 'function') ? window.getOverchargedStacks() : 0;
    if (error || !nearestPoi) {
      body.innerHTML = `
        <div class="text-slate-400 text-sm">${error || 'Nothing found nearby.'}</div>
        <button id="lmCancelBtn" class="mt-2 px-4 py-2 rounded-xl bg-[#1e2d44] border border-[#2a3f60] text-sm text-gray-300 cursor-pointer hover:bg-[#253550]">Cancel</button>`;
    } else {
      const dist = nearestMeters < 1000 ? `${Math.round(nearestMeters)}m` : `${(nearestMeters/1000).toFixed(1)}km`;
      const _timeRow = _timeLabel ? `<div class="text-red-400 text-xs mt-1">⚠ Time cursed — costs <span class="font-semibold">⏱ ${_timeLabel}</span>${_stacks > 1 ? ` (${_stacks}× stacked)` : ''}.</div>` : '';
      body.innerHTML = `
        <div class="text-gray-100 text-sm">Your nearest: <b>${nearestPoi.name}</b><span class="text-slate-400"> (${dist})</span></div>
        <div class="text-slate-400 text-xs">Costs <span class="text-amber-400 font-semibold">🔥 ${heatDisplay}</span> heat to confirm.</div>
        ${_timeRow}
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
    try { if (typeof addPenaltyMs === 'function') addPenaltyMs(getToolTimeCostMs('landmark', kind)); } catch(e) {}

    __showCurseToasts(curseRoll);
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
  // Extracts the async execution logic so the confirm flow can call it after the menu HTML is restored.
  async function __photoExec(mode) {
    if (mode === 'starter') {
      try {
        if (typeof showStreetViewGlimpseForTarget === 'function') {
          const res = await showStreetViewGlimpseForTarget({ context: 'snapshot' });
          if (res && res.ok) { if (typeof window.setLast === 'function') window.setLast('REVIEW', true); }
        } else {
          showToast('Photo glimpse module not loaded.', false);
        }
      } catch(e) { console.error(e); showToast('Could not load the starter photo right now.', false); }
      return;
    }

    if (mode === 'near100' || mode === 'near200') {
      if (typeof window.isCurseActive === 'function' && window.isCurseActive('heat5')) {
        showToast('Extra photos are blocked while cursed.', false); return;
      }
      try {
        if (typeof window.showStreetViewExtraPhotoForTarget === 'function') {
          const res = await window.showStreetViewExtraPhotoForTarget({ tier: mode });
          if (!res || !res.ok) {
            showToast('No further photos available for this target.', false);
          } else {
            if (!res.cached) {
              const curseRoll = applyQuestionCosts('photo', String(mode));
              if (curseRoll && curseRoll.blocked) return;
              try { if (typeof addPenaltyMs === 'function') addPenaltyMs(getToolTimeCostMs('photo', String(mode))); } catch(e) {}
              __showCurseToasts(curseRoll);
            }
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
      try {
        const already = (typeof window.__arePhotosUncorrupted === 'function') ? !!window.__arePhotosUncorrupted() : false;
        if (already) { showToast('Photos are already uncorrupted for this round.', true); return; }
        const curseRoll = applyQuestionCosts('photo', 'uncorrupt');
        if (curseRoll && curseRoll.blocked) return;
        if (typeof window.__setPhotosUncorrupted === 'function') window.__setPhotosUncorrupted(true);
        try {
          document.querySelectorAll('.photo-glimpse-frame').forEach(el => el.classList.add('is-uncorrupted'));
          const s = document.getElementById('photoGlitchSlices'); if (s) s.innerHTML = '';
          const b = document.getElementById('photoCorruptBlocks'); if (b) b.innerHTML = '';
        } catch(e) {}
        try { if (typeof window.updateHUD === 'function') window.updateHUD(); } catch(e) {}
        try { if (typeof window.__refreshPhotoGalleryStrip === 'function') window.__refreshPhotoGalleryStrip(); } catch(e) {}
        try { const p = document.getElementById('panelPhotoGallery'); if (p && p.classList.contains('open') && typeof window.__buildPhotoGalleryGrid === 'function') window.__buildPhotoGalleryGrid(); } catch(e) {}
        showToast('All photos uncorrupted for this round.', true);
        noteToolOptionUsed('photo', 'uncorrupt');
        try { if (typeof addPenaltyMs === 'function') addPenaltyMs(getToolTimeCostMs('photo', 'uncorrupt')); } catch(e) {}
        __showCurseToasts(curseRoll);
      } catch(e) { console.error(e); showToast('Could not uncorrupt photos right now.', false); }
      return;
    }
    if (mode === 'horizon') {
      if (typeof window.isCurseActive === 'function' && window.isCurseActive('heat5')) {
        showToast('Extra photos are blocked while cursed.', false); return;
      }
      try {
        const res = await window.showStreetViewHorizonPhotoForTarget();
        if (res && res.ok && !res.cached) {
          const curseRoll = applyQuestionCosts('photo', 'horizon');
          if (curseRoll && curseRoll.blocked) return;
          if (typeof noteToolOptionUsed === 'function') noteToolOptionUsed('photo', 'horizon');
          try { if (typeof addPenaltyMs === 'function') addPenaltyMs(getToolTimeCostMs('photo', 'horizon')); } catch(e) {}
          if (typeof updateCostBadgesFromConfig === 'function') updateCostBadgesFromConfig();
          if (typeof updateHUD === 'function') updateHUD();
          __showCurseToasts(curseRoll);
        }
      } catch(e) { console.error(e); showToast('Could not load the horizon photo right now.', false); }
      return;
    }
    // Unknown mode — no-op
  }

  if (photoMenu) {
    photoMenu.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-photo]');
      if (!btn) return;
      const mode = (btn.getAttribute('data-photo') || '').toLowerCase();

      // Starter photo is always free — no confirmation needed.
      if (mode === 'starter') {
        if (panelGameplay) panelGameplay.classList.remove('open');
        showMenu('main');
        __photoExec('starter');
        return;
      }

      // Extra photos: skip confirm if already owned (re-open is free).
      if (mode === 'near100' || mode === 'near200') {
        const _diff = (typeof window.getSelectedGameDifficulty === 'function') ? window.getSelectedGameDifficulty() : 'normal';
        if (_diff === 'hard') {
          showToast('Extra photos are unavailable on hard mode.', false); return;
        }
        try {
          const rs = (typeof window.getRoundStateV1 === 'function') ? window.getRoundStateV1() : null;
          const photos = (rs && Array.isArray(rs.photos)) ? rs.photos : [];
          const owned = photos.some(p => p && String(p.kind) === mode && p.url);
          if (owned) {
            if (panelGameplay) panelGameplay.classList.remove('open');
            showMenu('main');
            __photoExec(mode);
            return;
          }
        } catch(e) {}
        const tierLabel = mode === 'near100' ? '≤100m' : '≤200m';
        const cost = (typeof getToolCosts === 'function') ? getToolCosts('photo', mode) : { heat_cost: 0.5 };
        __toolConfirmShow({
          menu: photoMenu,
          title: `📸 Extra photo (${tierLabel})`,
          accentClass: 'text-violet-400',
          descHtml: `<div class="text-slate-400 text-sm">A Street View photo taken within <span class="text-gray-100 font-semibold">${tierLabel}</span> of the target.</div>`,
          cost,
          onConfirm: () => {
            if (panelGameplay) panelGameplay.classList.remove('open');
            showMenu('main');
            __photoExec(mode);
          }
        });
        return;
      }

      if (mode === 'uncorrupt') {
        if (blockIfToolOptionAlreadyUsed('photo', 'uncorrupt', 'Uncorrupt')) return;
        const cost = (typeof getToolCosts === 'function') ? getToolCosts('photo', 'uncorrupt') : { heat_cost: 0.5 };
        __toolConfirmShow({
          menu: photoMenu,
          title: `✨ Uncorrupt all photos`,
          accentClass: 'text-violet-400',
          descHtml: `<div class="text-slate-400 text-sm">Removes glitch corruption from all photos this round.</div>`,
          cost,
          onConfirm: () => {
            if (panelGameplay) panelGameplay.classList.remove('open');
            showMenu('main');
            __photoExec('uncorrupt');
          }
        });
        return;
      }

      if (mode === 'horizon') {
        const rs = (typeof window.getRoundStateV1 === 'function') ? window.getRoundStateV1() : null;
        const owned = !!(rs && Array.isArray(rs.photos) && rs.photos.some(p => p && String(p.kind) === 'horizon' && p.url));
        if (owned) {
          if (panelGameplay) panelGameplay.classList.remove('open');
          showMenu('main');
          __photoExec('horizon');
          return;
        }
        __toolConfirmShow({
          menu: photoMenu,
          title: '🌅 Horizon photo',
          accentClass: 'text-violet-400',
          descHtml: '<div class="text-slate-400 text-sm">A skyline view from the target pano, facing toward your current position.</div>',
          cost: (typeof getToolCosts === 'function') ? getToolCosts('photo', 'horizon') : { heat_cost: 1.0 },
          onConfirm: () => {
            if (panelGameplay) panelGameplay.classList.remove('open');
            showMenu('main');
            __photoExec('horizon');
          }
        });
        return;
      }
    });
  }

  // Ensure modal handlers are wired (safe to call multiple times)
  try { if (typeof bindPhotoModal === 'function') bindPhotoModal(); } catch(e) {}

  // Phase 2: Panel navigation + Lock In + Start New Round
  // All navigation uses delegation on panelGameplay so listeners survive innerHTML swaps
  // on gameMenu (lock-in confirm) and sub-menus (__toolConfirmShow restores).
  try {
    if (panelGameplay) {
      panelGameplay.addEventListener('click', (e) => {
        const btn = e.target.closest('button');
        if (!btn) return;
        const id = btn.id;

        // ── Tool navigation ──────────────────────────────────────────────────
        if (id === 'qRadar')    { showMenu('radar');    return; }
        if (id === 'qThermo')   { showMenu('thermo');   return; }
        if (id === 'qDir')      { showMenu('dir');      return; }
        if (id === 'qLandmark') { showMenu('landmark'); return; }
        if (id === 'qPhoto')    { showMenu('photo');    return; }
        if (id === 'radarBack' || id === 'thermoBack' || id === 'dirBack' || id === 'landmarkBack' || id === 'photoBack') {
          showMenu('main'); return;
        }
        if (id === 'gameClose' || id === 'thermoClose' || id === 'dirClose' || id === 'landmarkClose' || id === 'photoClose') {
          panelGameplay.classList.remove('open'); showMenu('main'); return;
        }

        // ── Lock-in confirmation ─────────────────────────────────────────────
        if (id !== 'btnLockGuess') return;
        const gm = document.getElementById('gameMenu');
        if (!gm) return;
        const savedHTML = gm.innerHTML;
        const restore = () => { gm.innerHTML = savedHTML; };
        gm.innerHTML = `
          <div class="flex justify-between mb-3">
            <button class="__lcBack px-3 py-2 rounded-xl bg-[#1e2d44] border border-[#2a3f60] text-sm text-gray-300 cursor-pointer hover:bg-[#253550]">← Back</button>
          </div>
          <div class="sectionLabel text-[11px] uppercase tracking-widest text-amber-400 mb-3">🎯 Lock In Guess</div>
          <div class="flex flex-col gap-3 py-1">
            <div class="text-slate-400 text-sm">Lock in your current position as your final guess for this round.</div>
            <div class="flex gap-2 mt-1">
              <button class="__lcConfirm flex-1 px-4 py-3 rounded-2xl bg-amber-500 text-white font-bold text-sm cursor-pointer hover:bg-amber-400 active:scale-[.98]">🎯 Lock In</button>
              <button class="__lcCancel px-4 py-3 rounded-2xl bg-[#1e2d44] border border-[#2a3f60] text-sm text-gray-300 cursor-pointer hover:bg-[#253550]">Cancel</button>
            </div>
          </div>`;
        gm.querySelector('.__lcBack')?.addEventListener('click', restore);
        gm.querySelector('.__lcCancel')?.addEventListener('click', restore);
        gm.querySelector('.__lcConfirm')?.addEventListener('click', async () => {
          restore();
          panelGameplay.classList.remove('open');
          showMenu('main');
          try { if (typeof window.lockInGuess === 'function') await window.lockInGuess(); } catch(e) { console.error(e); }
        });
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

  // Cache tool button node lists for updateUI performance
  try { if (typeof window.__cacheToolButtonNodes === 'function') window.__cacheToolButtonNodes(); } catch(e) {}

}
window.bindUI = bindUI;