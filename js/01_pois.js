// ---- POIs ----
const DEFAULT_POIS = [
  { name: "Liverpool Lime Street Station", lat: 53.4073, lon: -2.9777 },
  { name: "St George's Hall",             lat: 53.4084, lon: -2.9801 },
  { name: "Royal Albert Dock",            lat: 53.4009, lon: -2.9943 },
];

let POIS = DEFAULT_POIS;
window.POIS = POIS;

// Optional: when POIs are imported, we stash the raw payload for re-export.
// This is intentionally lightweight and non-persistent.
window.__POI_PACK__ = null;

// Persist imported POIs so a refresh keeps the same set.
// IndexedDB avoids localStorage size limits.
const __POI_DB_NAME__ = "mapgame";
const __POI_STORE__ = "kv";
const __POI_KEY__ = "imported_pois_pack_v1";
const __POI_LS_KEY__ = "mapgame_imported_pois_pack_v1";

function __canUseLocalStorage() {
  try {
    const k = "__mg_test__";
    localStorage.setItem(k, "1");
    localStorage.removeItem(k);
    return true;
  } catch (e) {
    return false;
  }
}

function __lsGet(key) {
  if (!__canUseLocalStorage()) return null;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

function __lsSet(key, value) {
  if (!__canUseLocalStorage()) return false;
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (e) {
    return false;
  }
}

function __lsDel(key) {
  if (!__canUseLocalStorage()) return false;
  try {
    localStorage.removeItem(key);
    return true;
  } catch (e) {
    return false;
  }
}

function __openPoiDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(__POI_DB_NAME__, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(__POI_STORE__)) {
        db.createObjectStore(__POI_STORE__);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error("IndexedDB open failed"));
  });
}

async function __idbGet(key) {
  const db = await __openPoiDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(__POI_STORE__, "readonly");
    const store = tx.objectStore(__POI_STORE__);
    const req = store.get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error("IndexedDB get failed"));
  });
}

async function __idbSet(key, value) {
  const db = await __openPoiDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(__POI_STORE__, "readwrite");
    const store = tx.objectStore(__POI_STORE__);
    const req = store.put(value, key);
    req.onsuccess = () => resolve(true);
    req.onerror = () => reject(req.error || new Error("IndexedDB put failed"));
  });
}

async function __idbDel(key) {
  const db = await __openPoiDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(__POI_STORE__, "readwrite");
    const store = tx.objectStore(__POI_STORE__);
    const req = store.delete(key);
    req.onsuccess = () => resolve(true);
    req.onerror = () => reject(req.error || new Error("IndexedDB delete failed"));
  });
}

// Exposed helpers used by the import UI.
async function saveImportedPoisPack({ filename, label, pack, pois }) {
  const payload = {
    filename: filename || null,
    label: label || null,
    pack: pack || null,
    pois: Array.isArray(pois) ? pois : [],
    savedAt: Date.now(),
  };

  // Prefer IndexedDB; fall back to localStorage if IndexedDB isn't available
  // (common when running from file:// or restricted browser contexts).
  try {
    await __idbSet(__POI_KEY__, payload);
  } catch (e) {
    const ok = __lsSet(__POI_LS_KEY__, payload);
    if (!ok) throw e;
  }
}

async function forgetImportedPoisPack() {
  try { await __idbDel(__POI_KEY__); } catch (e) {}
  try { __lsDel(__POI_LS_KEY__); } catch (e) {}
}

window.saveImportedPoisPack = saveImportedPoisPack;
window.forgetImportedPoisPack = forgetImportedPoisPack;

function setPoiSourceUI(text) {
  try {
    const el = document.getElementById("poiSourceOut");
    if (el) el.textContent = text || "(unknown)";
  } catch (e) {}
}

window.setPoiSourceUI = setPoiSourceUI;

function setPoisFromList(list, sourceLabel = "(import)") {
  if (!Array.isArray(list) || !list.length) throw new Error("POI list is empty");

  // Clear current POIs in-place (keeps references stable)
  POIS.length = 0;
  for (const p of list) POIS.push(p);
  log(`📍 Loaded ${POIS.length} POIs from ${sourceLabel}`);
  setPoiSourceUI(sourceLabel);
  try { if (typeof window.refreshAllPoiPins === "function") window.refreshAllPoiPins(); } catch (e) {}
}

function coercePoisPayload(data) {
  // Supported shapes:
  // 1) Array<poi>
  // 2) { pois: Array<poi> }
  // 3) { curated: Array<poi>, full: Array<poi>, ... }
  if (Array.isArray(data)) return { chosen: data, pack: null, label: "array" };
  if (data && Array.isArray(data.pois)) return { chosen: data.pois, pack: null, label: "pois" };
  if (data && (Array.isArray(data.curated) || Array.isArray(data.full))) {
    const curated = Array.isArray(data.curated) ? data.curated : null;
    const full = Array.isArray(data.full) ? data.full : null;
    // Default to curated when available; fallback to full.
    const chosen = (curated && curated.length) ? curated : (full && full.length ? full : null);
    if (!chosen) throw new Error("Pack has no usable arrays (curated/full)");
    return { chosen, pack: { curated, full, meta: data.meta || null }, label: (curated && curated.length) ? "curated" : "full" };
  }
  throw new Error("Unexpected JSON format");
}

function exportPoisToFile(list, filenameBase = "POI_export") {
  if (!Array.isArray(list) || !list.length) {
    log("⚠️ Nothing to export.");
    return;
  }
  const json = JSON.stringify(list, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${filenameBase}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  log(`⬇️ Exported ${list.length} POIs → ${a.download}`);
}

// IDB cache key and URL for the UK POI dataset
const UK_POI_URL = './POI_UK_runtime.json';
const UK_POI_CACHE_KEY = 'uk_pois_cache_v1';

// Expose so users can bust the IDB cache from the browser console.
window.__clearPoiCache = () => __idbDel(UK_POI_CACHE_KEY);

async function loadPois() {
  // Load UK POI dataset into __allPois.
  // IDB cache means repeat loads are instant; Worker parse keeps the first-load
  // main thread free during the ~300–700ms JSON parse of 31MB.
  try {
    const cached = await __idbGet(UK_POI_CACHE_KEY);
    if (cached && Array.isArray(cached.pois) && cached.pois.length > 1000) {
      window.__allPois = cached.pois;
      log(`📍 ${cached.pois.length} POIs from IDB cache (${cached.lastModified || 'unknown date'})`);
    } else {
      throw new Error('no cache');
    }
  } catch(_) {
    // No cache — fetch via Worker so the main thread stays responsive.
    try {
      if (typeof window.showToast === 'function') window.showToast('Downloading map data… (first run only)', false);
    } catch(e) {}
    try {
      const pois = await new Promise((resolve, reject) => {
        let worker;
        try { worker = new Worker('./js/poi_worker.js'); } catch(e) { reject(e); return; }
        const tid = setTimeout(() => { worker.terminate(); reject(new Error('worker timeout')); }, 30000);
        worker.onmessage = ev => {
          clearTimeout(tid); worker.terminate();
          if (ev.data.ok) {
            __idbSet(UK_POI_CACHE_KEY, { pois: ev.data.pois, lastModified: ev.data.lastModified, savedAt: Date.now() })
              .catch(() => {}); // cache failure is non-fatal
            resolve(ev.data.pois);
          } else reject(new Error(ev.data.error));
        };
        worker.onerror = ev => { clearTimeout(tid); worker.terminate(); reject(ev); };
        worker.postMessage({ url: UK_POI_URL + '?cb=' + Date.now() });
      });
      window.__allPois = pois;
      log(`📍 ${pois.length} POIs loaded from ${UK_POI_URL}`);
    } catch(e) {
      // Worker unavailable — fall back to main-thread fetch (may briefly freeze UI)
      log(`⚠️ Worker unavailable, parsing on main thread: ${e.message}`);
      try {
        const r = await fetch(UK_POI_URL + '?cb=' + Date.now(), { cache: 'no-store' });
        const d = await r.json();
        const list = Array.isArray(d) ? d : (Array.isArray(d.pois) ? d.pois : null);
        if (list && list.length) window.__allPois = list;
      } catch(e2) {}
    }
  }

  // 1) Prefer last imported pack (persisted) if present.
  // Try localStorage first (works in some contexts where IndexedDB is blocked).
  try {
    const savedLS = __lsGet(__POI_LS_KEY__);
    if (savedLS && Array.isArray(savedLS.pois) && savedLS.pois.length) {
      POIS.length = 0;
      savedLS.pois.forEach(p => POIS.push(p));
      window.__POI_PACK__ = savedLS.pack ? { ...savedLS.pack, filename: savedLS.filename } : (savedLS.filename ? { filename: savedLS.filename } : null);
      log(`📍 Loaded ${POIS.length} POIs from saved import${savedLS.filename ? ` (${savedLS.filename})` : ""}`);
      setPoiSourceUI(`saved import${savedLS.filename ? ` (${savedLS.filename})` : ""}`);
      try { if (typeof window.refreshAllPoiPins === "function") window.refreshAllPoiPins(); } catch (e) {}
      return;
    }
  } catch (e) {
    // ignore
  }

  try {
    const saved = await __idbGet(__POI_KEY__);
    if (saved && Array.isArray(saved.pois) && saved.pois.length) {
      POIS.length = 0;
      saved.pois.forEach(p => POIS.push(p));
      window.__POI_PACK__ = saved.pack ? { ...saved.pack, filename: saved.filename } : (saved.filename ? { filename: saved.filename } : null);
      log(`📍 Loaded ${POIS.length} POIs from saved import${saved.filename ? ` (${saved.filename})` : ""}`);
      setPoiSourceUI(`saved import${saved.filename ? ` (${saved.filename})` : ""}`);
      try { if (typeof window.refreshAllPoiPins === "function") window.refreshAllPoiPins(); } catch (e) {}
      return;
    }
  } catch (e) {
    // Ignore persistence failures and fall back to built-ins
  }

  // 2) No import and no custom local file — use built-in DEFAULT_POIS.
  // POIS will be re-filtered from __allPois (UK dataset) at game start by
  // __refreshLivePoisForCurrentLocation(), so this is just the pre-game default.
  log(`📍 No POI import found. Using built-in defaults; UK dataset will filter at game start.`);
  setPoiSourceUI("built-in (UK dataset loads at game start)");
}

// Called at game start (after player location is set) to filter POI_UK_runtime.json data
// to the current mode radius around the player. No network request.
window.__refreshLivePoisForCurrentLocation = function() {
  if (!player || typeof player.lat !== 'number' || typeof player.lon !== 'number') return;
  // Don't overwrite a user-imported custom POI pack (but always allow re-filtering from UK dataset)
  if (window.__POI_PACK__ && window.__POI_PACK__.filename && !window.__POI_PACK__.live && !window.__POI_PACK__.fromJson) return;

  const modeCapM = (typeof window.getModeTargetRadiusM === 'function') ? window.getModeTargetRadiusM() : 500;
  const lat = player.lat, lon = player.lon;
  const cosLat = Math.cos(lat * Math.PI / 180);

  const source = Array.isArray(window.__allPois) && window.__allPois.length ? window.__allPois : POIS;
  const filtered = source.filter(p => {
    if (!p || typeof p.lat !== 'number' || typeof p.lon !== 'number') return false;
    const dx = (p.lat - lat) * 111320;
    const dy = (p.lon - lon) * 111320 * cosLat;
    return Math.sqrt(dx * dx + dy * dy) <= modeCapM;
  });

  const count = filtered.length;
  log(`📍 ${count} POIs within ${modeCapM}m of player.`);

  if (count > 0) {
    // Expand BBOX to cover the play area so __insideBbox passes for local panos.
    if (typeof BBOX !== 'undefined' && BBOX.nw && BBOX.se) {
      const dLat = modeCapM / 111320;
      const dLon = modeCapM / (111320 * cosLat);
      BBOX.nw.lat = lat + dLat;
      BBOX.nw.lon = lon - dLon;
      BBOX.se.lat = lat - dLat;
      BBOX.se.lon = lon + dLon;
    }
    setPoisFromList(filtered, `UK POIs (${count} in range)`);
    window.__POI_PACK__ = { filename: 'POI_UK_runtime.json', fromJson: true };
    try { if (typeof window.showToast === 'function') window.showToast(`📍 ${count} POI${count !== 1 ? 's' : ''} in range.`, true); } catch(e) {}
  } else {
    log('⚠️ No POIs from UK dataset within mode radius — POI data may not cover this area.');
    try { if (typeof window.showToast === 'function') window.showToast('⚠️ No POIs found in range.', false); } catch(e) {}
  }
};

// ---- Landmark live-query helpers ----

function __landmarkCategoryPoisFilter(kind, poisArray) {
  const tag = (p, k) => (p && p.osm_tags) ? String(p.osm_tags[k] || '').toLowerCase() : '';
  return (poisArray || []).filter(p => {
    if (!p) return false;
    const rw = tag(p, 'railway'), st = tag(p, 'station');
    if (kind === 'train_station')
      return rw === 'station' || rw === 'halt' || rw === 'tram_stop' ||
             st === 'subway' || st === 'light_rail' || st === 'rail' || st === 'monorail';
    if (kind === 'cathedral')
      return tag(p, 'building') === 'cathedral' || tag(p, 'building') === 'church' ||
             tag(p, 'building') === 'chapel' || tag(p, 'amenity') === 'place_of_worship';
    if (kind === 'bus_station') return tag(p, 'amenity') === 'bus_station';
    if (kind === 'library')     return tag(p, 'amenity') === 'library';
    if (kind === 'museum')      return tag(p, 'tourism') === 'museum' || tag(p, 'amenity') === 'museum';
    return false;
  });
}
window.__landmarkCategoryPoisFilter = __landmarkCategoryPoisFilter;

window.__fetchLandmarkPoisForKind = async function(kind) {
  // Return ALL POIs of this kind from the full UK dataset — no radius cap.
  // The landmark clue works by comparing nearest-to-player vs nearest-to-target,
  // which only makes sense over the complete dataset. A cathedral 3km away is still
  // a valid reference point for deduction.

  // Safety net: if __allPois wasn't populated at boot (e.g. stale LS import path),
  // fetch the UK dataset now using browser cache — essentially free after first page load.
  if (!Array.isArray(window.__allPois) || !window.__allPois.length) {
    try {
      const res = await fetch(UK_POI_URL, { cache: 'force-cache' });
      if (res.ok) {
        const data = await res.json();
        const list = Array.isArray(data) ? data : (Array.isArray(data.pois) ? data.pois : null);
        if (list && list.length) window.__allPois = list;
      }
    } catch(e) {}
  }

  const source = Array.isArray(window.__allPois) && window.__allPois.length ? window.__allPois : (window.POIS || []);
  const pois = __landmarkCategoryPoisFilter(kind, source);
  log(`🏛️ Landmark "${kind}": ${pois.length} in full dataset`);
  return { pois, error: null };
};
