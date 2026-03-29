// ---- State ----
let debugMode = false;
let geoWatchId = null;
let player = null;  // {lat, lon}
let target = null;  // {name, lat, lon}
const clues = [];   // constraints to intersect
let thermoBaseline = null;

// Timed thermometer run (persisted)
let thermoRun = null; // { startMs, requiredDistM, startPlayer:{lat,lon} }

// Per-round tool usage lockout (exact option ids only).
// Example shape: { radar: { '100': true }, nsew: { 'NS': true } }
let usedToolOptions = {};

function __normalizeToolOptionId(v) {
  return String(v == null ? '' : v).trim();
}

function __cloneUsedToolOptions(src) {
  const out = {};
  if (!src || typeof src !== 'object') return out;
  for (const [toolId, opts] of Object.entries(src)) {
    if (!opts || typeof opts !== 'object') continue;
    const clean = {};
    for (const [optId, used] of Object.entries(opts)) {
      if (used) clean[__normalizeToolOptionId(optId)] = true;
    }
    if (Object.keys(clean).length) out[String(toolId)] = clean;
  }
  return out;
}

window.isToolOptionUsedThisRound = (toolId, optionId) => {
  const t = String(toolId || '').trim();
  const o = __normalizeToolOptionId(optionId);
  return !!(t && o && usedToolOptions && usedToolOptions[t] && usedToolOptions[t][o]);
};

window.markToolOptionUsedThisRound = (toolId, optionId) => {
  const t = String(toolId || '').trim();
  const o = __normalizeToolOptionId(optionId);
  if (!t || !o) return false;
  if (!usedToolOptions || typeof usedToolOptions !== 'object') usedToolOptions = {};
  if (!usedToolOptions[t] || typeof usedToolOptions[t] !== 'object') usedToolOptions[t] = {};
  if (usedToolOptions[t][o]) return false;
  usedToolOptions[t][o] = true;
  try { saveRoundStateDebounced(); } catch(e) {}
  return true;
};

window.clearUsedToolOptionsThisRound = () => {
  usedToolOptions = {};
  try { saveRoundState(); } catch(e) {}
};

window.getUsedToolOptionsThisRound = () => __cloneUsedToolOptions(usedToolOptions);
window.__restoreUsedToolOptionsThisRound = (src) => {
  usedToolOptions = __cloneUsedToolOptions(src);
};

window.getRoundElapsedMs = () => {
  const start = (typeof roundStartMs === 'number' && isFinite(roundStartMs)) ? roundStartMs : null;
  return start ? Math.max(0, Date.now() - start) : 0;
};

window.getModeTargetRadiusM = () => {
  try {
    const setup = (typeof window.getGameSetupSelection === 'function') ? window.getGameSetupSelection() : null;
    const length = setup && typeof setup.length === 'string' ? setup.length.toLowerCase() : 'short';
    if (length === 'medium') return 1000;
    if (length === 'long') return 1500;
    return 500;
  } catch (e) {
    return 500;
  }
};

window.getRoundTimeLimitMs = () => {
  try {
    const setup = (typeof window.getGameSetupSelection === 'function') ? window.getGameSetupSelection() : null;
    if (setup && setup.mode === 'gauntlet') {
      return (typeof GAUNTLET_TIME_LIMIT_MS === 'number' && isFinite(GAUNTLET_TIME_LIMIT_MS)) ? GAUNTLET_TIME_LIMIT_MS : (90 * 60 * 1000);
    }
    const length = setup && typeof setup.length === 'string' ? setup.length.toLowerCase() : 'short';
    if (length === 'medium') return 45 * 60 * 1000;
    if (length === 'long') return 60 * 60 * 1000;
    return (typeof ROUND_TIME_LIMIT_MS === 'number' && isFinite(ROUND_TIME_LIMIT_MS)) ? ROUND_TIME_LIMIT_MS : (30 * 60 * 1000);
  } catch (e) {
    return (typeof ROUND_TIME_LIMIT_MS === 'number' && isFinite(ROUND_TIME_LIMIT_MS)) ? ROUND_TIME_LIMIT_MS : (30 * 60 * 1000);
  }
};

window.debugAdvanceRoundElapsedByMs = (ms) => {
  const delta = Math.max(0, Number(ms) || 0);
  if (!delta) return false;
  if (!(typeof roundStartMs === 'number' && isFinite(roundStartMs))) roundStartMs = Date.now();
  roundStartMs -= delta;
  try { saveRoundStateDebounced(); } catch (e) {}
  // Advance curse expiry timestamps so curses expire in step with the timer.
  try { if (typeof window.debugAdvanceCurseTimersBy === 'function') window.debugAdvanceCurseTimersBy(delta); } catch (e) {}
  return true;
};

window.getToolUnlockInfo = (toolId, optionId) => {
  const t = String(toolId || '').trim();
  const o = __normalizeToolOptionId(optionId).toUpperCase();
  const limit = (typeof window.getRoundTimeLimitMs === 'function') ? window.getRoundTimeLimitMs() : ((typeof ROUND_TIME_LIMIT_MS === 'number' && isFinite(ROUND_TIME_LIMIT_MS)) ? ROUND_TIME_LIMIT_MS : (30 * 60 * 1000));
  const elapsed = (typeof window.getRoundElapsedMs === 'function') ? window.getRoundElapsedMs() : 0;

  // N/S and E/W unlock once half the round time has passed.
  if (t === 'nsew' && (o === 'NS' || o == 'EW')) {
    // Curse: heat3 locks N/S/E/W for its duration
    try {
      if (typeof window.isCurseActive === 'function' && window.isCurseActive('heat3')) {
        const cursed = (window.getActiveCurses ? window.getActiveCurses() : []).find(c => c.id === 'heat3');
        const remainingMs = (typeof window.__msLeftOnCurse === 'function' && cursed)
          ? window.__msLeftOnCurse(cursed)
          : (5 * 60 * 1000);
        return { locked: true, unlockAtMs: 0, remainingMs, reason: 'Locked by curse.' };
      }
    } catch(e) {}

    const unlockAtMs = Math.max(0, Math.floor(limit / 2));
    const remainingMs = Math.max(0, unlockAtMs - elapsed);
    return {
      locked: remainingMs > 0,
      unlockAtMs,
      remainingMs,
      reason: 'Unlocks halfway through the round.'
    };
  }

  return {
    locked: false,
    unlockAtMs: 0,
    remainingMs: 0,
    reason: ''
  };
};

window.isToolLockedByTime = (toolId, optionId) => {
  try {
    const info = (typeof window.getToolUnlockInfo === 'function') ? window.getToolUnlockInfo(toolId, optionId) : null;
    return !!(info && info.locked);
  } catch (e) {
    return false;
  }
};

// ---- New game setup selections (persisted) ----
let gameSetup = {
  length: 'short',
  difficulty: 'normal',
  mode: 'normal',
};

function __normalizeGameLength(v) {
  const x = String(v == null ? '' : v).trim().toLowerCase();
  return (x === 'short' || x === 'medium' || x === 'long') ? x : 'short';
}

function __normalizeGameDifficulty(v) {
  const x = String(v == null ? '' : v).trim().toLowerCase();
  return (x === 'easy' || x === 'normal' || x === 'hard') ? x : 'normal';
}

function __normalizeGameMode(v) {
  const x = String(v == null ? '' : v).trim().toLowerCase();
  return (x === 'gauntlet') ? 'gauntlet' : 'normal';
}

function __normalizeGameSetup(src) {
  const o = (src && typeof src === 'object') ? src : {};
  return {
    length: __normalizeGameLength(o.length),
    difficulty: __normalizeGameDifficulty(o.difficulty),
    mode: __normalizeGameMode(o.mode),
  };
}

window.getGameSetupSelection = () => __normalizeGameSetup(gameSetup);
window.getSelectedGameLength = () => __normalizeGameSetup(gameSetup).length;
window.getSelectedGameDifficulty = () => __normalizeGameSetup(gameSetup).difficulty;
window.setGameSetupSelection = (patch) => {
  const next = __normalizeGameSetup({ ...gameSetup, ...(patch || {}) });
  gameSetup = next;
  try { saveRoundStateDebounced(); } catch (e) {}
  return next;
};
window.__restoreGameSetupSelection = (src) => {
  gameSetup = __normalizeGameSetup(src);
  return gameSetup;
};


// ---- Round / HUD state (persisted) ----
let roundStartMs = null;     // timestamp in ms
let penaltyMs = 0;           // ms
// Heat is stored as a continuous value (heatValue) for decay + UI fill,
// but the *heat level* (heatLevel) has hysteresis so it doesn't instantly
// drop the moment you cross an integer threshold.
//
// Rule:
// - Heat level increases when heatValue >= (level+1)
// - Heat level decreases when heatValue <= (level-1)
//   (i.e. level 3 persists until heatValue cools to 2.0)
let heatValue = 0;           // 0..5 (continuous)
let heatLevel = 0;           // 0..5 (integer with hysteresis)
let heatLastMs = Date.now();  // for heat decay timing
let __lastHeatSaveMs = 0;     // throttle saves from decay
let targetIdx = null;        // index into POIS
// Non-POI targets (e.g. Street View pano targets)
let targetCustom = null;      // { kind, lat, lon, pano_id?, name?, id? }

// ---- Phase 1: RoundState v1 (photo-first hunt) ----
// This is a slim, game-design-facing state model used by the roadmap.
// We keep it alongside the existing state fields for now.
function __defaultRoundStateV1(){
  return {
    startLatLng: null,          // {lat, lon} captured when the round starts
    targetPanoLatLng: null,     // {lat, lon} for pano targets (null for POI targets)
    panoId: null,               // Street View pano_id when available
    starterPhotoUrl: null,      // data: URL (preferred) or Street View URL fallback
    photos: [],                 // [{ kind:'starter'|'near100'|'near200', context, url, sourceUrl, panoId, lat, lon, heading, pitch, fov, ts }]
    photosUncorrupted: false,  // When true, all photos display without blur/glitch
    // Phase 2 (win condition)
    hasGuessed: false,
    guessLatLng: null,          // {lat, lon}
    guessGpsAccuracyM: null,    // meters
    guessTimestamp: null,
    distanceToTargetM: null,    // raw
    adjustedDistanceM: null,    // max(0, d - accuracy)
    scorePoints: null,
    gradeLabel: null,
  };
}

let roundStateV1 = __defaultRoundStateV1();

// Short anti-repeat memory for pano targets
let recentPanoKeys = []; // array of strings
const RECENT_PANO_MAX = 8;

function __panoKey(panoId, lat, lon){
  if (panoId) return `panoid:${String(panoId)}`;
  const la = (typeof lat === 'number' && isFinite(lat)) ? lat.toFixed(6) : '';
  const lo = (typeof lon === 'number' && isFinite(lon)) ? lon.toFixed(6) : '';
  return `latlon:${la},${lo}`;
}

window.getRoundStateV1 = () => roundStateV1;
window.__defaultRoundStateV1 = __defaultRoundStateV1;

window.__arePhotosUncorrupted = () => {
  try { return !!(roundStateV1 && roundStateV1.photosUncorrupted); } catch(e) { return false; }
};

window.__setPhotosUncorrupted = (v) => {
  try {
    roundStateV1.photosUncorrupted = !!v;
    saveRoundState();
  } catch(e) {}
};


window.__isPanoRecentlyUsed = (panoId, lat, lon) => {
  const k = __panoKey(panoId, lat, lon);
  return !!(k && recentPanoKeys && recentPanoKeys.indexOf(k) !== -1);
};

window.__rememberPanoUsed = (panoId, lat, lon) => {
  const k = __panoKey(panoId, lat, lon);
  if (!k) return;
  // Move-to-front de-dupe
  recentPanoKeys = (recentPanoKeys || []).filter(x => x !== k);
  recentPanoKeys.unshift(k);
  if (recentPanoKeys.length > RECENT_PANO_MAX) recentPanoKeys.length = RECENT_PANO_MAX;
  try { saveRoundState(); } catch(e) {}
};

window.__initRoundStateV1ForNewTarget = (startLatLng, tgt) => {
  const s = (startLatLng && typeof startLatLng.lat === 'number' && typeof startLatLng.lon === 'number') ? { lat: startLatLng.lat, lon: startLatLng.lon } : null;
  const isPano = !!(tgt && tgt.kind === 'pano');
  roundStateV1 = {
    ...__defaultRoundStateV1(),
    startLatLng: s,
    targetPanoLatLng: isPano ? { lat: tgt.lat, lon: tgt.lon } : null,
    panoId: isPano ? (tgt.pano_id || null) : null,
  };
  try { saveRoundState(); } catch(e) {}
};

window.__onStreetViewPhotoCaptured = (info) => {
  try {
    const o = (info && typeof info === 'object') ? info : {};
    const ctx = (o.context || o.kind || 'glimpse');
    const url = o.url || null;
    if (!url) return;

    const entry = {
      kind: (ctx === 'snapshot') ? 'starter' : (o.kind || (ctx === 'near100' ? 'near100' : (ctx === 'near200' ? 'near200' : 'near100'))),
      context: ctx,
      url,
      sourceUrl: o.sourceUrl || null,
      panoId: o.panoId || null,
      lat: (typeof o.lat === 'number' && isFinite(o.lat)) ? o.lat : null,
      lon: (typeof o.lon === 'number' && isFinite(o.lon)) ? o.lon : null,
      heading: (typeof o.heading === 'number' && isFinite(o.heading)) ? o.heading : null,
      pitch: (typeof o.pitch === 'number' && isFinite(o.pitch)) ? o.pitch : null,
      fov: (typeof o.fov === 'number' && isFinite(o.fov)) ? o.fov : null,
      ts: Date.now(),
    };

    // Snapshot is the starter photo and should be stable per round.
    if (ctx === 'snapshot') {
      roundStateV1.starterPhotoUrl = url;
      // Ensure snapshot is the first item in photos[] (replace any existing starter).
      roundStateV1.photos = (roundStateV1.photos || []).filter(p => p && p.kind !== 'starter');
      roundStateV1.photos.unshift(entry);
    } else {
      roundStateV1.photos = (roundStateV1.photos || []);
      roundStateV1.photos.push(entry);
    }

    // Keep panoId in sync when available
    if (!roundStateV1.panoId && entry.panoId) roundStateV1.panoId = entry.panoId;

    saveRoundState();
    try { if (typeof window.__refreshPhotoGalleryStrip === 'function') window.__refreshPhotoGalleryStrip(); } catch(e) {}
  } catch(e) {}
};

const STORAGE_KEY = "mapgame_round_v1";

function safeParseJSON(s) {
  try { return JSON.parse(s); } catch (e) { return null; }
}

// Debounced variant — coalesces rapid-fire saves (tool use, heat changes, penalties).
// Immediate saves (round reset, photo capture, lock-in) call saveRoundState() directly.
let __saveRoundStateTimer = null;
let __penaltyFlashTimer = null;
function saveRoundStateDebounced() {
  if (__saveRoundStateTimer) clearTimeout(__saveRoundStateTimer);
  __saveRoundStateTimer = setTimeout(() => { __saveRoundStateTimer = null; saveRoundState(); }, 300);
}

function saveRoundState() {
  try {
    // Persist non-POI targets explicitly so refresh keeps the same hunt.
    const custom = (target && target.kind === 'pano') ? {
      kind: 'pano',
      id: target.id || null,
      name: target.name || null,
      lat: target.lat,
      lon: target.lon,
      pano_id: target.pano_id || null,
      debug_label: target.debug_label || null,
      snapshot_heading: (target.snapshot_heading !== undefined) ? target.snapshot_heading : null,
      snapshot_params: (target.snapshot_params !== undefined) ? target.snapshot_params : null,
    } : (targetCustom && targetCustom.kind ? { ...targetCustom } : null);

    // Strip large data URLs from photos before saving — they're already persisted in
    // mg_sv_img_* localStorage keys. Storing them again in roundStateV1 can push the
    // payload over the QuotaExceededError limit, causing the save to fail silently and
    // leaving photos=[] in storage even though the in-memory state is correct.
    const _photosForSave = Array.isArray(roundStateV1.photos)
      ? roundStateV1.photos.map(p => Object.assign({}, p, { url: null }))
      : [];
    const _roundStateV1ForSave = Object.assign({}, roundStateV1, {
      photos: _photosForSave,
      starterPhotoUrl: null,  // also large; recoverable from mg_sv_img_snapshot_* cache
    });
    const payload = {
      debugMode,
      playerSaved: (player && player.manualOverride) ? { lat: player.lat, lon: player.lon } : null,
      targetIdx,
      targetCustom: custom,
      roundStartMs,
      penaltyMs,
      heatValue,
      heatLevel,
      heatLastMs,
      activeCurses: (typeof window.__getCursesStateForSave === 'function') ? window.__getCursesStateForSave() : null,
      thermoRun,
      usedToolOptions: __cloneUsedToolOptions(usedToolOptions),
      roundStateV1: _roundStateV1ForSave,
      recentPanoKeys,
      fogActions: (typeof getFogActions === 'function') ? getFogActions() : null,
      gameSetup: __normalizeGameSetup(gameSetup),
      gauntletState: (typeof window.getGauntletStateForPersistence === 'function') ? window.getGauntletStateForPersistence() : null,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch (e) {
    // ignore (private mode / storage blocked)
  }
}

function loadRoundState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return safeParseJSON(raw);
  } catch (e) {
    return null;
  }
}

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
  try { if (typeof window.clearCurses === 'function') window.clearCurses(); } catch(e) {}
  if (!keepTarget) {
    targetIdx = null;
    targetCustom = null;
  }
  saveRoundState();
  try { if (typeof updateHUD === "function") updateHUD(); } catch (e) {}
}

function setPenaltyMs(ms) {
  penaltyMs = Math.max(0, ms | 0);
  saveRoundStateDebounced();
  try { if (typeof updateHUD === "function") updateHUD(); } catch (e) {}
}

function addPenaltyMs(ms) {
  const delta = ms | 0;
  setPenaltyMs(penaltyMs + delta);
  if (delta <= 0) return;
  // Visual feedback: shake + red flash on #timerMain (only when time is actually deducted)
  try {
    const el = document.getElementById('timerMain');
    if (el) {
      el.classList.remove('timer-penalty-flash');
      // Force reflow so re-adding the class restarts the animation
      void el.offsetWidth;
      el.classList.add('timer-penalty-flash');
      if (__penaltyFlashTimer !== null) clearTimeout(__penaltyFlashTimer);
      __penaltyFlashTimer = setTimeout(() => { try { el.classList.remove('timer-penalty-flash'); } catch(e) {} __penaltyFlashTimer = null; }, 450);
    }
  } catch(e) {}
}

function __recomputeHeatLevelFromValue() {
  const EPS = 1e-9;
  // Ensure integers
  heatLevel = Math.max(0, Math.min(5, (heatLevel | 0)));
  heatValue = Math.max(0, Math.min(5, (typeof heatValue === "number" && isFinite(heatValue)) ? heatValue : 0));

  // Upward transitions: cross integer boundary
  while (heatLevel < 5 && heatValue + EPS >= (heatLevel + 1)) heatLevel++;
  // Downward transitions: cool to the next threshold (inclusive)
  while (heatLevel > 0 && heatValue - EPS <= (heatLevel - 1)) heatLevel--;
}

function setHeatValue(v, reason = 'set') {
  const next = parseFloat(v);
  const prevLevel = heatLevel | 0;
  heatValue = Math.max(0, Math.min(5, isFinite(next) ? next : 0));
  __recomputeHeatLevelFromValue();
  const newLevel = heatLevel | 0;
  if (newLevel !== prevLevel) {
    // Important: call via window.* so it works even if the handler was assigned as a property.
    try { if (typeof window.onHeatLevelChanged === 'function') window.onHeatLevelChanged(prevLevel, newLevel, reason); } catch (e) {}
  }
  heatLastMs = Date.now();
  saveRoundStateDebounced();
  try { if (typeof updateHUD === "function") updateHUD(); } catch (e) {}
}

function addHeat(delta) {
  const d = parseFloat(delta);
  const hv = (typeof heatValue === "number" && isFinite(heatValue)) ? heatValue : 0;
  setHeatValue(hv + (isFinite(d) ? d : 0), 'add');
}

function applyHeatDecay(nowMs = Date.now()) {
  // Heat no longer decays — it only resets at round start.
  // This function is kept as a no-op so callers in updateHUD() still work.
  heatLastMs = (typeof nowMs === "number" && isFinite(nowMs)) ? nowMs : Date.now();
}

// Read-only accessors for other modules
window.getHeatValue = () => heatValue;
window.getHeatLevel = () => heatLevel;

function setThermoRun(run) {
  thermoRun = run;
  saveRoundStateDebounced();
  try { if (typeof updateHUD === "function") updateHUD(); } catch (e) {}
}
function clearThermoRun() {
  thermoRun = null;
  saveRoundStateDebounced();
  try { if (typeof updateHUD === "function") updateHUD(); } catch (e) {}
}

function fogAlpha() {
  const slider = (window.elFogOpacity || document.getElementById('fogOpacity'));
  const v = parseFloat(slider?.value ?? "0.55");
  return Math.max(0, Math.min(0.95, isNaN(v) ? 0.55 : v));
}
function updateFogUI() {
  const out = (window.elFogOpacityOut || document.getElementById('fogOpacityOut'));
  if (out) out.textContent = `${Math.round(fogAlpha() * 100)}%`;
}
