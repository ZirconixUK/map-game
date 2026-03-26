// ---- Boot ----

// Allow map image loader to notify us when it finishes (including cached loads).
window.__onMapLoaded = function () {
  try {
    if (!mapReady) return;
    // Fit view once map dimensions are known
    if (typeof fitViewToMap === "function") fitViewToMap();
    if (typeof updateUI === "function") updateUI();
    if (typeof draw === "function") draw();
    // Leaflet refactor: attach debug click handler once the map exists
    try { if (typeof setupMobileGestures === 'function') setupMobileGestures(); } catch(e) {}
  } catch (e) {
    console.error("onMapLoaded error", e);
  }
};

window.addEventListener("resize", () => {
  if (!mapReady) return;
  if (typeof fitViewToMap === "function") fitViewToMap();
  if (typeof draw === "function") draw();
});


let __didRestoreOverlays = false;

function __tryRestoreFog(saved) {
  try {
    const fogActions = saved && Array.isArray(saved.fogActions) && saved.fogActions.length > 0 ? saved.fogActions : null;
    if (!fogActions) return false;
    if (!window.leafletMap || !window.martinez) return false;
    if (typeof rebuildFogFromActions !== "function") return false;
    rebuildFogFromActions(fogActions);
    if (!__didRestoreOverlays) {
      __didRestoreOverlays = true;
      try { if (typeof log === 'function') log('🔄 Restored existing overlays.'); } catch(e) {}
    }
    return true;
  } catch (e) {
    console.error(e);
    return false;
  }
}

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

(async function init() {
  updateFogUI();
  await loadPois();
  // Restore persisted round (target + timer) if possible.
  let __saved = null;
  try {
    __saved = loadRoundState();
    const saved = __saved;
    // Restore Phase 1 RoundState v1 + recent pano anti-repeat memory
    try {
      if (saved && Array.isArray(saved.recentPanoKeys)) recentPanoKeys = saved.recentPanoKeys;
      if (saved && typeof window.__restoreGameSetupSelection === 'function') window.__restoreGameSetupSelection(saved.gameSetup || null);
      if (saved && saved.roundStateV1 && typeof saved.roundStateV1 === 'object') {
        // Backward-compatible merge: keep defaults for newly-added fields.
        const d = (typeof window.__defaultRoundStateV1 === 'function') ? window.__defaultRoundStateV1() : {};
        roundStateV1 = Object.assign({}, d, saved.roundStateV1);
        // Ensure nested objects exist
        if (!Array.isArray(roundStateV1.photos)) roundStateV1.photos = [];
        // Synthesise a starter entry if starterPhotoUrl was saved but photos[] is missing it.
        // This covers the case where the page was refreshed before the Street View snapshot
        // callback fired and persisted the entry.
        if (roundStateV1.starterPhotoUrl && !roundStateV1.photos.some(p => p && p.kind === 'starter')) {
          roundStateV1.photos.unshift({
            kind: 'starter', context: 'snapshot',
            url: roundStateV1.starterPhotoUrl, sourceUrl: null,
            panoId: roundStateV1.panoId || null,
            lat: null, lon: null, heading: null, pitch: null, fov: null,
            ts: roundStateV1.roundStartMs || Date.now(),
          });
        }
        // Second-chance recovery: photos[] still empty and starterPhotoUrl also null — this
        // happens when the page is refreshed AFTER __initRoundStateV1ForNewTarget saved
        // (photos=[], starterPhotoUrl=null) but BEFORE __onStreetViewPhotoCaptured fired.
        // The Street View image may already be in the SV localStorage cache; reconstruct the
        // cache key the same way targetKey() does in js/18_streetview_glimpse.js and look it up.
        if (roundStateV1.photos.length === 0) {
          try {
            const _svTgt = (saved.targetCustom && typeof saved.targetCustom.lat === 'number')
              ? saved.targetCustom
              : (typeof saved.targetIdx === 'number' && POIS && POIS[saved.targetIdx])
                ? POIS[saved.targetIdx]
                : null;
            if (_svTgt) {
              const _id = String(_svTgt.id || _svTgt.osm_id || _svTgt.name || '');
              const _ck = `mg_sv_img_snapshot_${_id}|${String(_svTgt.lat)}|${String(_svTgt.lon)}`;
              const _cv = localStorage.getItem(_ck);
              if (_cv && _cv.startsWith('data:image/')) {
                roundStateV1.starterPhotoUrl = _cv;
                roundStateV1.photos.unshift({
                  kind: 'starter', context: 'snapshot',
                  url: _cv, sourceUrl: null,
                  panoId: roundStateV1.panoId || null,
                  lat: null, lon: null, heading: null, pitch: null, fov: null,
                  ts: roundStateV1.roundStartMs || Date.now(),
                });
              }
            }
          } catch(e) {}
        }
      }
    } catch(e) {}
    try { if (typeof window.__refreshPhotoGalleryStrip === 'function') window.__refreshPhotoGalleryStrip(); } catch(e) {}

    // Check wall-clock expiry before restoring any in-progress game.
    // gameSetup is already restored above so getRoundTimeLimitMs() returns the right value.
    const _savedHasGuessed = !!(saved && saved.roundStateV1 && saved.roundStateV1.hasGuessed);
    const _savedRoundStartMs = (saved && typeof saved.roundStartMs === 'number') ? saved.roundStartMs : null;
    const _savedLimit = (typeof window.getRoundTimeLimitMs === 'function') ? window.getRoundTimeLimitMs() : ((typeof ROUND_TIME_LIMIT_MS === 'number' && isFinite(ROUND_TIME_LIMIT_MS)) ? ROUND_TIME_LIMIT_MS : (30 * 60 * 1000));
    const _savedElapsedMs = _savedRoundStartMs ? (Date.now() - _savedRoundStartMs) : 0;
    const _savedPenaltyMs = (saved && typeof saved.penaltyMs === 'number' && isFinite(saved.penaltyMs)) ? saved.penaltyMs : 0;
    const _savedEffectiveElapsed = _savedElapsedMs + _savedPenaltyMs;
    // If expired more than 30 min ago (and no guess already made), discard the round entirely.
    const _savedTimedOutCompletely = !_savedHasGuessed && _savedEffectiveElapsed > _savedLimit + 30 * 60 * 1000;
    // If already past the deadline (but not yet 30 min over), flag for immediate auto-lock on first tick.
    const _savedExpiredOnLoad = !_savedHasGuessed && _savedEffectiveElapsed > _savedLimit;

    // Prefer restoring custom (non-POI) targets first.
    if (_savedTimedOutCompletely) {
      // Discard the stale game — go straight to new game panel with a message.
      window.__needsNewGameSetup = true;
      window.__suppressAutoNewGame = true;
      window.__timedOutPreviousGame = true;
    } else if (saved && saved.targetCustom && typeof saved.targetCustom.lat === 'number' && typeof saved.targetCustom.lon === 'number') {
      targetIdx = null;
      target = {
        kind: saved.targetCustom.kind || 'pano',
        id: saved.targetCustom.id || null,
        name: saved.targetCustom.name || 'Hidden Node',
        lat: saved.targetCustom.lat,
        lon: saved.targetCustom.lon,
        pano_id: saved.targetCustom.pano_id || null,
        debug_label: saved.targetCustom.debug_label || null,
        snapshot_heading: (saved.targetCustom.snapshot_heading !== undefined) ? saved.targetCustom.snapshot_heading : null,
        snapshot_params: (saved.targetCustom.snapshot_params !== undefined) ? saved.targetCustom.snapshot_params : null,
      };

      // For pano targets, re-compute the nearest known POI for debug display.
      try {
        if (target.kind === 'pano' && typeof __nearestPoiTo === 'function') {
          const near = __nearestPoiTo(target.lat, target.lon);
          if (near && near.poi) {
            target.debug_poi = { name: near.poi.name || 'Unnamed', lat: near.poi.lat, lon: near.poi.lon, dist_m: near.dist_m };
            if (!target.debug_label) target.debug_label = target.debug_poi.name;
          }
        }
      } catch (e) {}

      __restoreCommonRoundFields(saved, _savedExpiredOnLoad);
    } else if (saved && typeof saved.targetIdx === "number" && POIS && POIS[saved.targetIdx]) {
      targetIdx = saved.targetIdx;
      target = POIS[targetIdx];
      __restoreCommonRoundFields(saved, _savedExpiredOnLoad);
    } else {
      // No saved game — flag so startup flow opens the New Game panel
      window.__needsNewGameSetup = true;
      window.__suppressAutoNewGame = true;
    }
  } catch (e) {
    // Corrupted save — flag so startup flow opens the New Game panel
    window.__needsNewGameSetup = true;
    window.__suppressAutoNewGame = true;
    window.__timedOutPreviousGame = true; // surface a contextual note in the welcome modal
  }

  // Attempt fog restore SYNCHRONOUSLY before startHUDTicker/updateHUD.
  // updateHUD → applyHeatDecay → saveRoundState reads getFogActions(), which is [] until the
  // fog module's state is restored. If saveRoundState fires first it overwrites fogActions in
  // localStorage with [], so a second refresh sees an empty array and never rebuilds the fog.
  // Restoring now (leafletMap + martinez are already set by the time 13_boot.js runs) fixes that.
  try { __tryRestoreFog(__saved); } catch(e) {}

  try { startHUDTicker(); } catch (e) {}
  try { updateHUD(); } catch (e) {}
  try { if (typeof scheduleThermoCompletion === "function") scheduleThermoCompletion(); } catch (e) {}
  // Polling fallback — handles the rare case where leafletMap or martinez wasn't ready yet above
  (function(){
    const saved = (typeof __saved !== "undefined") ? __saved : null;
    if (!saved || !saved.fogActions || !Array.isArray(saved.fogActions) || saved.fogActions.length === 0) return;
    if (__didRestoreOverlays) return; // already succeeded synchronously above
    let tries = 0;
    const maxTries = 200; // ~10s
    const t = setInterval(() => {
      tries++;
      if (__tryRestoreFog(saved) || tries >= maxTries) clearInterval(t);
    }, 50);
  })();
  updateUI();
  try { if (typeof refreshLeafletMarkersVisibility === 'function') refreshLeafletMarkersVisibility(); } catch(e) {}
  try { if (typeof syncLeafletTargetMarker === 'function') syncLeafletTargetMarker(); } catch(e) {}

  log("Ready. Tip: on mobile, use HTTPS or localhost for geolocation.");
  // Always render once so we show either map, loading, or errors.
  if (typeof draw === "function") draw();
})();

// After all scripts loaded, bind UI handlers.
if (typeof window.bindUI === "function") {
  window.bindUI();
}

// Auto-locate player on startup and open New Game panel if no game is in progress.
// Delay slightly so 14_panels_misc.js has finished wiring up panel observers.
setTimeout(async function __autoStartup() {
  // Respect debug mode — don't override a manually-placed position with GPS
  const inDebug = (typeof debugMode !== 'undefined') && debugMode;

  if (!inDebug && window.isSecureContext && navigator.geolocation) {
    try { if (typeof window.__setInitStatus === 'function') window.__setInitStatus('Obtaining location…'); } catch(e) {}
    try {
      await window.__setPlayerFromCurrentLocation({ centerAfterFix: true });
    } catch (e) {
      // GPS failed — try to center on whatever fix we already have
      try {
        const fix = typeof window.__getLastGeoFix === 'function' ? window.__getLastGeoFix() : null;
        if (fix && typeof fix.lat === 'number') {
          if (typeof setPlayerLatLng === 'function') setPlayerLatLng(fix.lat, fix.lon, { source: 'cached', accuracy: fix.accuracy });
          if (typeof centerOnPlayer === 'function') centerOnPlayer();
        }
      } catch (e2) {}
    }
  } else if (!inDebug) {
    // HTTPS not available (dev HTTP) — still try to center on last known fix
    try {
      const fix = typeof window.__getLastGeoFix === 'function' ? window.__getLastGeoFix() : null;
      if (fix && typeof fix.lat === 'number') {
        if (typeof setPlayerLatLng === 'function') setPlayerLatLng(fix.lat, fix.lon, { source: 'cached', accuracy: fix.accuracy });
        if (typeof centerOnPlayer === 'function') centerOnPlayer();
      }
    } catch (e) {}
  }
  try { if (typeof window.__setInitStatus === 'function') window.__setInitStatus(''); } catch(e) {}

  // If a result modal was persisted (round already completed), restore it so the player
  // isn't left staring at a frozen timer with no context. This also guards against a
  // rare restore glitch where hasGuessed is stale/false despite a result existing.
  if (!window.__needsNewGameSetup) {
    try {
      const _savedResult = localStorage.getItem('mapgame_result_html_v1');
      if (_savedResult && typeof window.reopenResultModal === 'function') {
        window.reopenResultModal();
      }
    } catch(e) {}
  }

  // Open New Game setup panel if there was no saved game to resume.
  // When the welcome modal is active (__suppressAutoNewGame), show it instead.
  if (window.__needsNewGameSetup) {
    if (window.__suppressAutoNewGame) {
      if (window.__welcomeShownEarly) {
        // Early path in start() already showed the modal and wired buttons — just clean up.
        window.__needsNewGameSetup = false;
        window.__suppressAutoNewGame = false;
      } else {
        try { if (typeof window.__showWelcomeModal === 'function') window.__showWelcomeModal(); } catch(e) {}
      }
    } else {
      try {
        const p = document.getElementById('panelNewGame');
        if (p) p.classList.add('open');
      } catch (e) {}
      window.__needsNewGameSetup = false;
    }
  }
}, 400);

// Keep Gameplay panel sizing responsive when switching menus or resizing.
try {
  if (typeof updateGameplayPanelWidth === "function") updateGameplayPanelWidth();
  window.addEventListener("resize", () => {
    try { if (typeof updateGameplayPanelWidth === "function") updateGameplayPanelWidth(); } catch (e) {}
  }, { passive: true });
} catch (e) {}