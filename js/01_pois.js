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
      window.__allPois = list.slice(); // master unfiltered set — used for radius filtering at game start
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

// In-memory cache: stores the largest successful fetch so that subsequent
// games at the same location with a smaller radius skip the API entirely.
let __overpassCache = null; // { lat, lon, radiusM, pois, ts }

function __overpassCacheHit(lat, lon, radiusM) {
  if (!__overpassCache || !Array.isArray(__overpassCache.pois)) return null;
  // Allow cache reuse if player is within 300m of the cached centre and the
  // requested radius is covered by the cached radius.
  const dx = (__overpassCache.lat - lat) * 111320;
  const dy = (__overpassCache.lon - lon) * 111320 * Math.cos(lat * Math.PI / 180);
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist > 300) return null; // player moved too far
  if (radiusM > __overpassCache.radiusM) return null; // need a larger area
  // Filter the cached set down to the requested radius.
  const pois = __overpassCache.pois.filter(p => {
    const pdx = (p.lat - lat) * 111320;
    const pdy = (p.lon - lon) * 111320 * Math.cos(lat * Math.PI / 180);
    return Math.sqrt(pdx * pdx + pdy * pdy) <= radiusM;
  });
  return pois;
}

async function __overpassFetch(q) {
  const __endpoints = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
  ];
  const __body = 'data=' + encodeURIComponent(q);
  let res;
  for (let __i = 0; __i < __endpoints.length; __i++) {
    const controller = new AbortController();
    // Client timeout must exceed the server [timeout:25] so we don't abort
    // a running query before the server has a chance to respond.
    const __timer = setTimeout(() => controller.abort(), 32000);
    try {
      res = await fetch(__endpoints[__i], {
        method: 'POST',
        body: __body,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        signal: controller.signal,
      });
      clearTimeout(__timer);
      if (res.ok) break;
    } catch (e) {
      clearTimeout(__timer);
      if (__i === __endpoints.length - 1) throw e;
    }
  }
  if (!res || !res.ok) throw new Error(`Overpass HTTP ${res ? res.status : 'no response'}`);
  return res.json();
}

function __normaliseOverpassElements(elements) {
  return (elements || []).map(el => {
    const elLat = el.type === 'node' ? el.lat : (el.center ? el.center.lat : null);
    const elLon = el.type === 'node' ? el.lon : (el.center ? el.center.lon : null);
    if (elLat == null || elLon == null) return null;
    const tags = el.tags || {};
    const name = tags.name || tags['name:en'] || null;
    if (!name) return null;
    return { id: `osm:${el.type}/${el.id}`, name, lat: elLat, lon: elLon, osm_tags: tags };
  }).filter(Boolean);
}

async function fetchPoisAroundPlayer(lat, lon, radiusM) {
  const r = Math.max(100, Math.round(radiusM));

  // Return from in-memory cache when possible to avoid hammering Overpass.
  const cached = __overpassCacheHit(lat, lon, radiusM);
  if (cached) {
    try { log(`📍 POIs from cache (${cached.length} within ${Math.round(r / 1000)}km).`); } catch(e) {}
    return cached;
  }

  // Single combined query — one round trip instead of two.
  const q = [
    `[out:json][timeout:25];`,
    `(`,
    // Transport
    `  nwr["name"]["railway"~"^(station|halt|tram_stop)$"](around:${r},${lat},${lon});`,
    `  nwr["name"]["station"~"^(subway|light_rail|monorail|rail)$"](around:${r},${lat},${lon});`,
    // Religious / civic buildings
    `  nwr["name"]["building"~"^(cathedral|church|chapel)$"](around:${r},${lat},${lon});`,
    `  nwr["name"]["office"~"^(government|civic)$"](around:${r},${lat},${lon});`,
    // Amenities
    `  nwr["name"]["amenity"~"^(bus_station|library|pub|bar|place_of_worship|theatre|cinema|arts_centre|restaurant|cafe|fast_food|school|college|university|hospital|clinic|pharmacy|bank|community_centre|social_centre|sports_centre|marketplace)$"](around:${r},${lat},${lon});`,
    // Tourism
    `  nwr["name"]["tourism"~"^(museum|gallery|attraction|viewpoint|hotel)$"](around:${r},${lat},${lon});`,
    // Historic
    `  nwr["name"]["historic"~"^(monument|memorial|castle|building|ruins)$"](around:${r},${lat},${lon});`,
    // Leisure
    `  nwr["name"]["leisure"~"^(park|garden|common|stadium|sports_centre|swimming_pool|golf_course|ice_rink)$"](around:${r},${lat},${lon});`,
    // Man-made / shops
    `  nwr["name"]["man_made"="pier"](around:${r},${lat},${lon});`,
    `  nwr["name"]["shop"~"^(supermarket|department_store|mall)$"](around:${r},${lat},${lon});`,
    `  nwr["name"]["building"~"^(hotel|school|college|university|hospital)$"](around:${r},${lat},${lon});`,
    `);`,
    `out center 2000;`,
  ].join('\n');

  const data = await __overpassFetch(q);
  const pois = __normaliseOverpassElements(data.elements);

  // Store in cache (keyed to the larger radius so future smaller-radius games can reuse).
  if (pois.length) {
    __overpassCache = { lat, lon, radiusM: r, pois, ts: Date.now() };
  }

  return pois;
}


// Called at game start (after player location is set) to filter POI.json data
// to the current mode radius around the player. No network request.
window.__refreshLivePoisForCurrentLocation = function() {
  if (!player || typeof player.lat !== 'number' || typeof player.lon !== 'number') return;
  // Don't overwrite a user-imported custom POI pack (but always allow re-filtering from POI.json)
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
    setPoisFromList(filtered, `POI.json (${count} in range)`);
    window.__POI_PACK__ = { filename: 'POI.json', fromJson: true };
    try { if (typeof window.showToast === 'function') window.showToast(`📍 ${count} POI${count !== 1 ? 's' : ''} in range.`, true); } catch(e) {}
  } else {
    log('⚠️ No POIs from POI.json within mode radius — POI data may not cover this area.');
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

window.__fetchLandmarkPoisForKind = async function(kind, lat, lon, radiusM) {
  // Filter from the master POI.json set by radius and kind — no network request.
  const r = Math.max(100, radiusM);
  const cosLat = Math.cos(lat * Math.PI / 180);

  // Safety net: if __allPois wasn't populated at boot (e.g. stale LS import path),
  // fetch POI.json now. Browser cache means this is essentially free after first load.
  if (!Array.isArray(window.__allPois) || !window.__allPois.length) {
    try {
      const res = await fetch('./POI.json', { cache: 'force-cache' });
      if (res.ok) {
        const data = await res.json();
        const list = Array.isArray(data) ? data : (Array.isArray(data.pois) ? data.pois : null);
        if (list && list.length) window.__allPois = list;
      }
    } catch(e) {}
  }

  const source = Array.isArray(window.__allPois) && window.__allPois.length ? window.__allPois : (window.POIS || []);
  const inRadius = source.filter(p => {
    if (!p || typeof p.lat !== 'number' || typeof p.lon !== 'number') return false;
    const dx = (p.lat - lat) * 111320;
    const dy = (p.lon - lon) * 111320 * cosLat;
    return Math.sqrt(dx * dx + dy * dy) <= r;
  });

  // Merge any novel POIs into window.POIS so fog Voronoi sees them.
  const existingIds = new Set((window.POIS || []).map(p => p && p.id));
  const novel = inRadius.filter(p => p && p.id && !existingIds.has(p.id));
  if (novel.length) {
    POIS.push(...novel);
    window.POIS = POIS;
  }

  const pois = __landmarkCategoryPoisFilter(kind, inRadius);
  log(`🏛️ Landmark "${kind}": ${pois.length} found within ${Math.round(r)}m (POI.json)`);
  return { pois, error: null };
};
