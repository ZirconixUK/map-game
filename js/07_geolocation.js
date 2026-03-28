function setPlayerLatLng(lat, lon, opts) {
  if (!player) player = { lat: 0, lon: 0 };
  // If player has manually overridden location, ignore GPS updates unless explicitly forced.
  if (player.manualOverride && opts && opts.source && opts.source.startsWith("gps") && !opts.force) {
    return;
  }

  const prev = (player && typeof player.lat === 'number' && typeof player.lon === 'number')
    ? { lat: player.lat, lon: player.lon }
    : null;

  player.lat = lat;
  player.lon = lon;

  if (opts && typeof opts.accuracy === "number") player.accuracy = opts.accuracy;
  if (opts && opts.manual === true) player.manualOverride = true;
  if (opts && opts.manual === false) player.manualOverride = false;

  try { player.__source = opts && opts.source ? opts.source : player.__source; } catch(e) {}

  try { if (typeof syncLeafletPlayerMarker === "function") syncLeafletPlayerMarker(); } catch(e) {}

  // Check if a distance thermometer run has completed at this new position.
  try { if (typeof checkDistanceThermometer === "function") checkDistanceThermometer(lat, lon); } catch(e) {}

  drawThrottled();
}

// ---- Geolocation ----
let hasCenteredOnce = false;
const LAST_GEO_FIX_KEY = "mapgame_last_real_geo_fix_v1";
let lastGeoFix = null; // { lat, lon, accuracy, ts }

function persistLastGeoFix(fix) {
  try {
    if (!fix || typeof fix.lat !== "number" || typeof fix.lon !== "number") return;
    localStorage.setItem(LAST_GEO_FIX_KEY, JSON.stringify({
      lat: fix.lat,
      lon: fix.lon,
      accuracy: (typeof fix.accuracy === "number") ? fix.accuracy : null,
      ts: (typeof fix.ts === "number") ? fix.ts : Date.now(),
    }));
  } catch (e) {}
}

function hydrateLastGeoFix() {
  try {
    if (lastGeoFix && typeof lastGeoFix.lat === "number" && typeof lastGeoFix.lon === "number") return lastGeoFix;
    const raw = localStorage.getItem(LAST_GEO_FIX_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.lat !== "number" || typeof parsed.lon !== "number") return null;
    lastGeoFix = {
      lat: parsed.lat,
      lon: parsed.lon,
      accuracy: (typeof parsed.accuracy === "number") ? parsed.accuracy : null,
      ts: (typeof parsed.ts === "number") ? parsed.ts : Date.now(),
    };
    return lastGeoFix;
  } catch (e) {
    return null;
  }
}

try { hydrateLastGeoFix(); } catch(e) {}

// Expose last fix + a one-shot sampler for other modules (e.g., Phase 2 lock-in guess)
window.__getLastGeoFix = () => lastGeoFix || hydrateLastGeoFix();

window.__setPlayerFromCurrentLocation = function __setPlayerFromCurrentLocation(opts = {}) {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('no_geolocation'));
    if (!window.isSecureContext) return reject(new Error('insecure_context'));

    const force = !!(opts && opts.force);
    const source = (opts && opts.source) ? opts.source : 'gps-current';

    function applyFix(fix) {
      try { lastGeoFix = fix; persistLastGeoFix(fix); } catch(e) {}
      try {
        setPlayerLatLng(fix.lat, fix.lon, { source, accuracy: fix.accuracy, force, manual: force ? false : undefined });
      } catch (e) { return reject(e); }
      try { if (opts && opts.centerAfterFix) centerOnPlayer(); } catch(e) {}
      try { if (!debugMode) startGeolocationWatch(); } catch(e) {}
      resolve(fix);
    }

    // Try high accuracy first (5s). On timeout, retry with low accuracy (cell/WiFi, near-instant).
    navigator.geolocation.getCurrentPosition(
      (pos) => applyFix({ lat: pos.coords.latitude, lon: pos.coords.longitude, accuracy: pos.coords.accuracy, ts: Date.now() }),
      (err) => {
        const isTimeout = err && (err.code === 3 || (err.message && /timed?\s*out/i.test(err.message)));
        if (!isTimeout) return reject(err || new Error('geo_error'));
        // Timeout on high accuracy — retry with low accuracy (uses WiFi/cell, much faster).
        navigator.geolocation.getCurrentPosition(
          (pos) => applyFix({ lat: pos.coords.latitude, lon: pos.coords.longitude, accuracy: pos.coords.accuracy, ts: Date.now() }),
          (err2) => {
            // Both attempts timed out — use last known fix if available (persisted across sessions).
            const cached = lastGeoFix || hydrateLastGeoFix();
            if (cached && typeof cached.lat === 'number') {
              const ageMin = Math.round((Date.now() - (cached.ts || 0)) / 60000);
              try { if (typeof log === 'function') log(`⚠️ Geolocation timed out; using last known location (${ageMin} min old).`); } catch(e) {}
              try { if (typeof showToast === 'function') showToast(`📍 Using last known location (${ageMin} min old).`, false); } catch(e) {}
              applyFix(cached);
            } else {
              reject(err2 || new Error('geo_error'));
            }
          },
          { enableHighAccuracy: false, maximumAge: 30000, timeout: 6000 }
        );
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 5000 }
    );
  });
};
window.__requestGeoSample = function __requestGeoSample(opts = {}) {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('no_geolocation'));
    if (!window.isSecureContext) return reject(new Error('insecure_context'));
    const hi = (opts && typeof opts.highAccuracy === 'boolean') ? opts.highAccuracy : true;
    const timeout = (opts && typeof opts.timeoutMs === 'number') ? opts.timeoutMs : 2500;
    const maximumAge = (opts && typeof opts.maximumAgeMs === 'number') ? opts.maximumAgeMs : 0;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const s = {
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          ts: Date.now(),
        };
        try { lastGeoFix = s; persistLastGeoFix(s); } catch(e) {}
        resolve(s);
      },
      (err) => reject(err || new Error('geo_error')),
      { enableHighAccuracy: hi, maximumAge, timeout }
    );
  });
};

function setPlayer(lat, lon, silent = false) {
  player = { lat, lon };
  elPlayer.textContent = `${lat.toFixed(6)}, ${lon.toFixed(6)}`;
  if (!silent) log(`📍 Player: ${lat.toFixed(6)}, ${lon.toFixed(6)}`);

  if (!hasCenteredOnce && mapReady && viewInited) {
    centerOnPlayer();
    hasCenteredOnce = true;
  } else {
    drawThrottled();
  }
}

function centerOnPlayer() {
  if (!player) return;
  if (window.leafletMap) {
    const ll = L.latLng(player.lat, player.lon);
    window.leafletMap.setView(ll, Math.max(window.leafletMap.getZoom(), 15), { animate: true });
    log("🎯 Centered on player.");
    return;
  }
  log("Leaflet map not ready yet.");
}

// ---- Debug-aware geolocation control helpers ----
function stopGeolocationWatch() {
  if (geoWatchId != null && navigator.geolocation && navigator.geolocation.clearWatch) {
    try { navigator.geolocation.clearWatch(geoWatchId); } catch (e) {}
  }
  geoWatchId = null;
}

function startGeolocationWatch() {
  if (debugMode) return;
  if (!navigator.geolocation) {
    log("Geolocation not available in this browser.");
    return;
  }
  if (geoWatchId != null) return;

  geoWatchId = navigator.geolocation.watchPosition(
    (pos) => {
      if (debugMode) return;
      try {
        lastGeoFix = {
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          ts: Date.now(),
        };
        persistLastGeoFix(lastGeoFix);
      } catch(e) {}
      setPlayerLatLng(pos.coords.latitude, pos.coords.longitude, { source: "gps" });
      try { if (typeof window.__setGpsFailBadge === 'function') window.__setGpsFailBadge(false); } catch(e) {}
    },
    (err) => {
      // Don't kill the watch on transient errors/timeouts; just log.
      log(`Geolocation error: ${err && err.message ? err.message : err}`);
      try { if (typeof window.__setGpsFailBadge === 'function') window.__setGpsFailBadge(true); } catch(e) {}
    },
    { enableHighAccuracy: true, maximumAge: 0, timeout: 12000 }
  );
}

function useLocationOnce(opts = {}) {
  if (!navigator.geolocation) {
    log("Geolocation not available in this browser.");
    return;
  }
  if (!window.isSecureContext) {
    log("❌ Geolocation requires HTTPS (or localhost).");
    try { if (typeof showToast === "function") showToast("Geolocation requires HTTPS (or localhost).", false); } catch(e) {}
    return;
  }
  // Recenter button should be responsive even indoors: prefer cached, allow lower accuracy.
  const quick = (opts && typeof opts.quick === "boolean") ? opts.quick : true;
  const geoOpts = quick
    ? { enableHighAccuracy: false, maximumAge: 60000, timeout: 6000 }
    : { enableHighAccuracy: true, maximumAge: 0, timeout: 8000 };

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      try {
        lastGeoFix = {
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          ts: Date.now(),
        };
        persistLastGeoFix(lastGeoFix);
      } catch(e) {}
      // If we've previously set a manual location (debug), allow an explicit caller to override it.
      const force = !!(opts && opts.force);
      setPlayerLatLng(
        pos.coords.latitude,
        pos.coords.longitude,
        {
          source: "gps-once",
          accuracy: pos.coords.accuracy,
          force,
          // When forcing, clear manual override so subsequent GPS updates work.
          manual: force ? false : undefined,
        }
      );
      try { if (typeof window.__setGpsFailBadge === 'function') window.__setGpsFailBadge(false); } catch(e) {}
      try { if (opts && opts.centerAfterFix) centerOnPlayer(); } catch(e) {}
      if (!debugMode) startGeolocationWatch();
    },
    (err) => {
      const msg = (err && err.message) ? err.message : String(err);
      // If this was a timeout and we have a recent fix, fall back to it.
      const isTimeout = (err && (err.code === 3 || /timed\s*out/i.test(msg)));
      if (isTimeout && lastGeoFix && (Date.now() - lastGeoFix.ts) < 5 * 60 * 1000) {
        log(`⚠️ Geolocation timed out; using last known fix (${Math.round((Date.now()-lastGeoFix.ts)/1000)}s old).`);
        const force = !!(opts && opts.force);
        setPlayerLatLng(lastGeoFix.lat, lastGeoFix.lon, { source: "gps-fallback", accuracy: lastGeoFix.accuracy, force, manual: force ? false : undefined });
        try { if (typeof window.__setGpsFailBadge === 'function') window.__setGpsFailBadge(false); } catch(e) {}
        try { if (opts && opts.centerAfterFix) centerOnPlayer(); } catch(e) {}
        if (!debugMode) startGeolocationWatch();
        return;
      }
      log(`Geolocation error: ${msg}`);
      try { if (typeof window.__setGpsFailBadge === 'function') window.__setGpsFailBadge(true); } catch(e) {}
    },
    geoOpts
  );
}

// UI button / HUD recenter uses this name
function enableGeolocation(opts = {}) {
  // If we already have a fresh fix, optionally center immediately.
  try {
    if (opts && opts.centerAfterFix && lastGeoFix && (Date.now() - lastGeoFix.ts) < 15000) {
      const force = !!opts.force;
      setPlayerLatLng(lastGeoFix.lat, lastGeoFix.lon, { source: "gps-cached", accuracy: lastGeoFix.accuracy, force, manual: force ? false : undefined });
      centerOnPlayer();
      if (!debugMode) startGeolocationWatch();
      return;
    }
  } catch(e) {}
  return useLocationOnce(opts);
}

window.__setGpsFailBadge = function(visible) {
  try {
    const badge = document.getElementById('gpsFailBadge');
    if (badge) badge.classList.toggle('hidden', !visible);
  } catch(e) {}
};