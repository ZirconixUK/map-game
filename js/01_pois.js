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

async function loadPois() {
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
    // Ignore persistence failures and fall back to POI.json
  }

  // 2) External POI file (case-sensitive on most hosts)
  const url = "./POI.json";
  try {
    const res = await fetch(url + "?cb=" + Date.now(), { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    let list = null;
    if (Array.isArray(data)) list = data;
    else if (data && Array.isArray(data.pois)) list = data.pois;

    if (Array.isArray(list) && list.length) {
      POIS.length = 0;
      list.forEach(p => POIS.push(p));
      log(`📍 Loaded ${POIS.length} POIs from ${url}`);
      setPoiSourceUI(url);
      try { if (typeof window.refreshAllPoiPins === "function") window.refreshAllPoiPins(); } catch (e) {}
      return;
    }
    throw new Error("Unexpected JSON format");
  } catch (e) {
    log(`⚠️ Could not load ${url}. Using built-in POIs (${POIS.length}).`);
    setPoiSourceUI("built-in");
  }
}

// ---- Live Overpass POI fetch ----
// Fetches OSM POIs from the Overpass API for a given lat/lon/radius.
// Returns a normalised array of POIs matching the game's expected format.
async function fetchPoisAroundPlayer(lat, lon, radiusM) {
  const r = Math.max(500, Math.round(radiusM));
  const q = [
    `[out:json][timeout:25];`,
    `(`,
    `  node["railway"="station"](around:${r},${lat},${lon});`,
    `  way["railway"="station"](around:${r},${lat},${lon});`,
    `  node["building"~"^(cathedral|church|chapel)$"](around:${r},${lat},${lon});`,
    `  way["building"~"^(cathedral|church|chapel)$"](around:${r},${lat},${lon});`,
    `  node["amenity"~"^(bus_station|library|pub|bar|place_of_worship)$"](around:${r},${lat},${lon});`,
    `  way["amenity"~"^(bus_station|library|pub|bar|place_of_worship)$"](around:${r},${lat},${lon});`,
    `  node["tourism"~"^(museum|gallery|attraction|viewpoint)$"](around:${r},${lat},${lon});`,
    `  way["tourism"~"^(museum|gallery|attraction|viewpoint)$"](around:${r},${lat},${lon});`,
    `  node["historic"~"^(monument|memorial|castle|building)$"](around:${r},${lat},${lon});`,
    `  node["leisure"~"^(park|garden|common)$"](around:${r},${lat},${lon});`,
    `  way["leisure"~"^(park|garden|common)$"](around:${r},${lat},${lon});`,
    `  node["man_made"="pier"](around:${r},${lat},${lon});`,
    `);`,
    `out center body;`,
  ].join('\n');

  const res = await fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST',
    body: 'data=' + encodeURIComponent(q),
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });
  if (!res.ok) throw new Error(`Overpass HTTP ${res.status}`);
  const data = await res.json();

  return (data.elements || []).map(el => {
    const elLat = el.type === 'node' ? el.lat : (el.center ? el.center.lat : null);
    const elLon = el.type === 'node' ? el.lon : (el.center ? el.center.lon : null);
    if (elLat == null || elLon == null) return null;
    const tags = el.tags || {};
    const name = tags.name || tags['name:en'] || null;
    if (!name) return null;
    return {
      id: `osm:${el.type}/${el.id}`,
      name,
      lat: elLat,
      lon: elLon,
      osm_tags: tags,
    };
  }).filter(Boolean);
}

// Called at game start (after player location is set) to populate POIS and BBOX
// from live Overpass data. Skips if a user-imported custom pack is loaded.
window.__refreshLivePoisForCurrentLocation = async function() {
  if (!player || typeof player.lat !== 'number' || typeof player.lon !== 'number') return;
  // Don't overwrite a user-imported custom POI pack
  if (window.__POI_PACK__ && window.__POI_PACK__.filename && !window.__POI_PACK__.live) return;

  const modeCapM = (typeof window.getModeTargetRadiusM === 'function') ? window.getModeTargetRadiusM() : 500;
  const queryRadius = Math.max(modeCapM * 2, 2000);

  try {
    log(`🌍 Fetching live POIs (${Math.round(queryRadius / 1000)}km radius)…`);
    const pois = await fetchPoisAroundPlayer(player.lat, player.lon, queryRadius);
    if (!pois.length) {
      log('⚠️ No POIs found from Overpass in this area. Using existing POIs.');
      return;
    }

    // Expand BBOX to cover the live area so __insideBbox passes for local panos.
    if (typeof BBOX !== 'undefined' && BBOX.nw && BBOX.se) {
      const dLat = queryRadius / 111320;
      const dLon = queryRadius / (111320 * Math.cos(player.lat * Math.PI / 180));
      BBOX.nw.lat = player.lat + dLat;
      BBOX.nw.lon = player.lon - dLon;
      BBOX.se.lat = player.lat - dLat;
      BBOX.se.lon = player.lon + dLon;
    }

    setPoisFromList(pois, `Live (Overpass, ${pois.length} POIs)`);
    window.__POI_PACK__ = { filename: 'overpass', live: true };
    log(`✅ Live POIs loaded: ${pois.length} features near your location.`);
  } catch (e) {
    log(`⚠️ Live POI fetch failed: ${e.message}. Using existing POIs.`);
  }
};
