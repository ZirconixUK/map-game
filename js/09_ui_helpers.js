// ---- UI helpers ----
function setLast(text, ok) {
  if (!elLast) return;
  elLast.className = "pill " + (ok ? "ok" : "no");
  elLast.textContent = text;
}
function updateUI() {
  try { if (typeof syncDebugModeUI === "function") syncDebugModeUI(); } catch(e){}
  if (elClues) elClues.textContent = String(clues.length);
  if (elPlayer) elPlayer.textContent = player ? `${player.lat.toFixed(6)}, ${player.lon.toFixed(6)}` : "not set";
  if (elTarget) {
    if (debugMode && target) {
      // Debug target label:
      // Always show a human-friendly name in the debug panel.
      // For Street View pano targets, show the nearest POI name.
      const isPano = (target && ((target.kind === 'pano') || !!target.pano_id || (target.id && String(target.id).startsWith('pano:'))));

      const ensureNearestPoi = () => {
        if (!isPano) return;
        if (target.debug_poi && target.debug_poi.name) return;

        const hav = function(a, b) {
          const R = 6371000;
          const toRad = (deg) => deg * Math.PI / 180;
          const dLat = toRad((+b.lat) - (+a.lat));
          const dLon = toRad((+b.lon) - (+a.lon));
          const lat1 = toRad(+a.lat);
          const lat2 = toRad(+b.lat);
          const s1 = Math.sin(dLat/2);
          const s2 = Math.sin(dLon/2);
          const h = s1*s1 + Math.cos(lat1)*Math.cos(lat2)*s2*s2;
          return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
        };

        // Prefer shared helper if available.
        let near = null;
        try {
          if (typeof __nearestPoiTo === 'function') near = __nearestPoiTo(target.lat, target.lon);
        } catch (e) { near = null; }

        // Fallback: scan POIS / window.POIS directly.
        if (!near || !near.poi) {
          const arr = (Array.isArray(POIS) && POIS.length) ? POIS : (Array.isArray(window.POIS) ? window.POIS : []);
          let best = null;
          let bestD = Infinity;
          for (let i = 0; i < arr.length; i++) {
            const p = arr[i];
            if (!p) continue;
            const plat = (typeof p.lat === 'number') ? p.lat : parseFloat(p.lat);
            const plon = (typeof p.lon === 'number') ? p.lon : parseFloat(p.lon);
            if (!isFinite(plat) || !isFinite(plon)) continue;
            const d = hav({ lat: target.lat, lon: target.lon }, { lat: plat, lon: plon });
            if (d < bestD) { bestD = d; best = p; }
          }
          if (best) near = { poi: best, dist_m: bestD };
        }

        if (near && near.poi) {
          target.debug_poi = { name: near.poi.name || 'Unnamed', lat: near.poi.lat, lon: near.poi.lon, dist_m: near.dist_m };
          target.debug_label = target.debug_label || target.debug_poi.name;
        }
      };

      try { ensureNearestPoi(); } catch (e) {}

      let txt = String(target.name || 'Unnamed');
      if (isPano) {
        const label = target.debug_label || (target.debug_poi && target.debug_poi.name) || null;
        const dm = (target.debug_poi && typeof target.debug_poi.dist_m === 'number' && isFinite(target.debug_poi.dist_m)) ? target.debug_poi.dist_m : null;
        if (label) txt = `${String(label)}${dm !== null ? ` (${dm.toFixed(0)}m)` : ''}`;
        else txt = `pano @ ${(+target.lat).toFixed(6)}, ${( +target.lon).toFixed(6)}`;
      }
      elTarget.textContent = txt;
    } else {
      elTarget.textContent = 'hidden';
    }
  }
  updateFogUI();

  // Phase 2: end-of-round UI state
  try {
    const over = (typeof window.isRoundOver === 'function') ? window.isRoundOver() : false;
    const btnLock = document.getElementById('btnLockGuess');
    const btnNR = document.getElementById('btnNewRound');
    if (btnLock) {
      btnLock.disabled = !!over;
      btnLock.classList.toggle('disabled', !!over);
    }
    if (btnNR) {
      btnNR.classList.toggle('hidden', !over);
      btnNR.disabled = !over;
    }

    // Disable tool buttons once guessed (allow viewing results/new round only),
    // and grey out exact options already used this round.
    const lockSelectors = [
      '#qRadar','#qThermo','#qDir','#qLandmark','#qPhoto',
      '#radarMenu .menuBtn','#thermoMenu .menuBtn','#dirMenu .menuBtn','#landmarkMenu .menuBtn','#photoMenu .menuBtn'
    ];
    const nodes = document.querySelectorAll(lockSelectors.join(','));

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

    nodes.forEach(n => {
      if (!n) return;
      // Don't disable the round-action buttons
      if (n.id === 'btnLockGuess' || n.id === 'btnNewRound') return;

      const meta = getToolUsageMeta(n);
      let usedThisRound = false;
      let timeLocked = false;
      let lockInfo = null;
      try {
        usedThisRound = !!(meta && typeof window.isToolOptionUsedThisRound === 'function' && window.isToolOptionUsedThisRound(meta.toolId, meta.optionId));
      } catch (e) {
        usedThisRound = false;
      }
      try {
        lockInfo = (meta && typeof window.getToolUnlockInfo === 'function') ? window.getToolUnlockInfo(meta.toolId, meta.optionId) : null;
        timeLocked = !!(lockInfo && lockInfo.locked);
      } catch (e) {
        timeLocked = false;
        lockInfo = null;
      }

      const shouldDisable = !!over || !!usedThisRound || !!timeLocked;
      n.disabled = shouldDisable;
      n.classList.toggle('disabled', !!over);
      n.classList.toggle('used', !!usedThisRound && !over);
      n.classList.toggle('locked', !!timeLocked && !over && !usedThisRound);
      if (!over && !usedThisRound && timeLocked && lockInfo && typeof lockInfo.remainingMs === 'number') {
        n.title = `Unlocks in ${formatMMSS(lockInfo.remainingMs)}`;
      } else {
        n.removeAttribute('title');
      }
      n.setAttribute('aria-disabled', shouldDisable ? 'true' : 'false');
    });

    // Keep the N/S/E/W category button openable; lock the individual NS/EW questions instead.
    const qDir = document.getElementById('qDir');
    if (qDir) {
      const shouldDisable = !!over;
      qDir.disabled = shouldDisable;
      qDir.classList.toggle('disabled', !!over);
      qDir.classList.remove('locked');
      qDir.removeAttribute('title');
      qDir.setAttribute('aria-disabled', shouldDisable ? 'true' : 'false');
    }
  } catch(e) {}
}


function log(msg) {
  const t = new Date().toLocaleTimeString();
  if (!elLog) return;
  elLog.innerHTML = `<div style="margin-bottom:8px;"><span class="muted">[${t}]</span> ${msg}</div>` + elLog.innerHTML;
}

function syncDebugModeUI() {
  const el = document.getElementById("dbgMode");
  if (el) el.checked = !!debugMode;
}

// ---- HUD (timer + heat) ----
function pad2(n) { return String(n).padStart(2, "0"); }
function formatMMSS(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const mm = Math.floor(total / 60);
  const ss = total % 60;
  return `${pad2(mm)}:${pad2(ss)}`;
}

function updateHUD() {
  try { if (typeof applyHeatDecay === "function") applyHeatDecay(Date.now()); } catch (e) {}
  try { if (typeof tickCurses === 'function') tickCurses(Date.now()); } catch (e) {}
  try { if (typeof updateCostBadgesFromConfig === 'function') updateCostBadgesFromConfig(); } catch (e) {}
  // Timer
  if (elTimerMain) {
    const r = (typeof window.getRoundStateV1 === 'function') ? window.getRoundStateV1() : (window.roundStateV1 || null);
    if (r && r.hasGuessed && typeof r.guessRemainingMs === 'number') {
      elTimerMain.textContent = formatMMSS(Math.max(0, r.guessRemainingMs));
      elTimerMain.style.color = '#fbbf24'; // amber — locked
    } else {
      elTimerMain.style.color = '';
      const start = (typeof roundStartMs === "number" && isFinite(roundStartMs)) ? roundStartMs : null;
      const elapsed = start ? (Date.now() - start) : 0;
      const limit = (typeof window.getRoundTimeLimitMs === "function") ? window.getRoundTimeLimitMs() : (((typeof ROUND_TIME_LIMIT_MS === "number" && isFinite(ROUND_TIME_LIMIT_MS)) ? ROUND_TIME_LIMIT_MS : (30 * 60 * 1000)));
      const remaining = Math.max(0, limit - elapsed);
      elTimerMain.textContent = formatMMSS(remaining);
    }
  }
  if (elTimerPenalty) {
    const elapsed = (typeof roundStartMs === "number" && isFinite(roundStartMs)) ? (Date.now() - roundStartMs) : 0;
    const limit = (typeof window.getRoundTimeLimitMs === "function") ? window.getRoundTimeLimitMs() : (((typeof ROUND_TIME_LIMIT_MS === "number" && isFinite(ROUND_TIME_LIMIT_MS)) ? ROUND_TIME_LIMIT_MS : (30 * 60 * 1000)));
    const overtime = Math.max(0, elapsed - limit);
    const p = (typeof penaltyMs === "number" && isFinite(penaltyMs)) ? penaltyMs : 0;
    const extra = overtime + p;
    elTimerPenalty.textContent = extra > 0 ? `OT ${formatMMSS(extra)}` : '';
    elTimerPenalty.style.display = extra > 0 ? '' : 'none';
  }

  // Heat
  const heatEl = document.getElementById("heatWidget");
  if (heatEl) {
    const boxes = heatEl.querySelectorAll(".heatBox");
    const vertical = heatEl.classList.contains("heatWidget--vertical");
    // Inner fill uses continuous heatValue for smooth decay; the box glow uses locked-in heatLevel.
    const hv = (typeof heatValue === "number" && isFinite(heatValue)) ? heatValue : ((typeof heatLevel === "number" && isFinite(heatLevel)) ? heatLevel : 0);
    const L = (typeof heatLevel === "number" && isFinite(heatLevel)) ? (heatLevel | 0) : Math.floor(hv);
    boxes.forEach((box, i) => {
      const fill = box.querySelector(".heatBoxFill");
      const amt = Math.max(0, Math.min(1, hv - i)); // 0..1 in this segment
      if (fill) {
        const pct = `${Math.round(amt * 100)}%`;
        if (vertical) {
          fill.style.height = pct;
          fill.style.width = "100%";
        } else {
          fill.style.width = pct;
          fill.style.height = "100%";
        }
      }
      box.classList.toggle("is-full", amt >= 0.999);
      box.classList.toggle("is-partial", amt > 0.001 && amt < 0.999);
      box.classList.toggle("lit", (i + 1) <= Math.max(0, Math.min(5, L)));
    });
  }

  // Thermometer progress
  const tp = document.getElementById("thermoProgress");
  const tpFill = document.getElementById("thermoProgressFill");
  const tpText = document.getElementById("thermoProgressText");
  if (tp && tpFill && tpText) {
    if (thermoRun && typeof thermoRun.requiredDistM === "number" && thermoRun.startPlayer) {
      const moved = (player && typeof player.lat === "number" && typeof haversineMeters === "function")
        ? haversineMeters(thermoRun.startPlayer.lat, thermoRun.startPlayer.lon, player.lat, player.lon)
        : 0;
      const pct = Math.max(0, Math.min(1, moved / thermoRun.requiredDistM));
      const remaining = Math.max(0, Math.round(thermoRun.requiredDistM - moved));
      tp.classList.remove("hidden");
      tpFill.style.width = `${Math.round(pct * 100)}%`;
      tpText.textContent = remaining > 0
        ? `Thermometer: ${remaining}m to go`
        : `Thermometer: almost there…`;
    } else {
      tp.classList.add("hidden");
      tpFill.style.width = "0%";
      tpText.textContent = "Thermometer";
    }
  }

  // Debug: current heat display (if present)
  const dbgHeatCurrent = document.getElementById("dbgHeatCurrent");
  if (dbgHeatCurrent) {
    const v = (typeof heatValue === "number" && isFinite(heatValue)) ? heatValue : ((typeof heatLevel === "number" && isFinite(heatLevel)) ? heatLevel : 0);
    const L = (typeof heatLevel === "number" && isFinite(heatLevel)) ? (heatLevel | 0) : Math.floor(v);
    dbgHeatCurrent.textContent = `${Math.max(0, Math.min(5, v)).toFixed(2)}/5  (Level ${Math.max(0, Math.min(5, L))})`;
  }

}

// ---- Gameplay panel width helper ----
// The main tool menu is now icon-only and uses a tight 2-column grid.
// To avoid wasted space, we dynamically size the Gameplay panel based on
// whatever menu is currently visible. Submenus can be wider; the main menu
// should be compact.
function updateGameplayPanelWidth() {
  try {
    const panel = document.getElementById("panelGameplay");
    if (!panel) return;
    // Bottom-sheet panels are always full-width; toggle compact only for header centering.
    const menus = [
      document.getElementById("gameMenu"),
      document.getElementById("radarMenu"),
      document.getElementById("thermoMenu"),
      document.getElementById("dirMenu"),
      document.getElementById("landmarkMenu"),
      document.getElementById("photoMenu"),
    ].filter(Boolean);
    const visible = menus.find(m => !m.classList.contains("hidden")) || menus[0];
    const isMain = visible && visible.id === "gameMenu";
    panel.classList.toggle("panel--compact", !!isMain);
  } catch (e) {}
}

// Called by state when heatLevel changes (either by tool use or decay).
// Adds a quick pulse/glow so the player notices the new tier.
function onHeatLevelChanged(prevLevel, newLevel, reason) {
  try {
    const heatEl = document.getElementById("heatWidget");
    if (!heatEl) return;

    const dir = (newLevel > prevLevel) ? "up" : "down";

    // Pulse the whole widget
    heatEl.classList.remove("heatPulseUp", "heatPulseDown");
    // Force reflow so animation restarts
    // eslint-disable-next-line no-unused-expressions
    heatEl.offsetWidth;
    heatEl.classList.add(dir === "up" ? "heatPulseUp" : "heatPulseDown");

    // Highlight newly lit boxes on level-up
    if (dir === "up") {
      const boxes = heatEl.querySelectorAll(".heatBox");
      for (let i = prevLevel; i < newLevel && i < boxes.length; i++) {
        const b = boxes[i];
        b.classList.remove("heatBoxPop");
        // eslint-disable-next-line no-unused-expressions
        b.offsetWidth;
        b.classList.add("heatBoxPop");
      }
    }

    const clearPulse = () => {
      heatEl.classList.remove("heatPulseUp", "heatPulseDown");
      heatEl.removeEventListener("animationend", clearPulse);
    };
    heatEl.addEventListener("animationend", clearPulse);
  } catch (e) {
    // ignore
  }
}

let __hudTicker = null;
function startHUDTicker() {
  if (__hudTicker) return;
  __hudTicker = setInterval(() => {
    try { updateHUD(); } catch (e) {}
  }, 250);
  document.addEventListener("visibilitychange", () => {
    try { updateHUD(); } catch (e) {}
  });
}

function heatConsequencesText(level) {
  // Placeholder consequences for now (we'll refine once tools/curses are locked).
  const L = Math.max(0, Math.min(5, Math.floor((typeof level === "number" && isFinite(level)) ? level : 0)));
  if (L === 0) return "All good — nothing is tracking you yet.";
  if (L === 1) return "Mild attention — expect slightly pricier questions.";
  if (L === 2) return "Warm — penalties start to bite and some tools may get riskier.";
  if (L === 3) return "Hot — increased penalty pressure and higher chance of a bad draw.";
  if (L === 4) return "Very hot — mistakes get punished; cheap options dry up.";
  return "MAX HEAT — you're basically glowing. Expect the harsh stuff.";
}

function showHeatToast() {
  const hv = (typeof heatValue === "number" && isFinite(heatValue)) ? heatValue : 0;
  const L = Math.max(0, Math.min(5, heatLevel | 0));

  // Decay model: dH/dt = -(base + perHeat*H)  =>
  // H(t) = (H0 + b/a) * exp(-a t) - b/a
  // Solve for t when H(t)=T: t = (1/a) * ln((H0 + b/a) / (T + b/a))
  const base = (typeof HEAT_DECAY_BASE_PER_SEC === "number" && isFinite(HEAT_DECAY_BASE_PER_SEC)) ? HEAT_DECAY_BASE_PER_SEC : 0.0015;
  const perHeat = (typeof HEAT_DECAY_PER_HEAT_PER_SEC === "number" && isFinite(HEAT_DECAY_PER_HEAT_PER_SEC)) ? HEAT_DECAY_PER_HEAT_PER_SEC : 0.0025;

  function timeToHeatTargetSeconds(H0, T) {
    const h0 = Math.max(0, Math.min(5, H0));
    const t = Math.max(0, Math.min(5, T));
    if (h0 <= t) return 0;
    if (perHeat <= 0) {
      // Linear fallback (shouldn't happen with our defaults)
      const rate = Math.max(1e-9, base);
      return (h0 - t) / rate;
    }
    const k = base / perHeat;
    const num = (h0 + k);
    const den = (t + k);
    if (den <= 0 || num <= 0) return 0;
    return (1 / perHeat) * Math.log(num / den);
  }

  const lines = [];
  // Countdown to lower levels (hysteresis: level drops at (level-1).0)
  if (L > 0 && hv > 0) {
    const targets = [];
    for (let lvl = L - 1; lvl >= 0; lvl--) targets.push(lvl);
    for (const tgt of targets) {
      const secs = timeToHeatTargetSeconds(hv, tgt);
      lines.push(`↓ Level ${tgt} in <b>${formatMMSS(secs * 1000)}</b> (at ${tgt.toFixed(1)})`);
    }
  } else {
    lines.push("No cooldown pending.");
  }

  const msg = `
    <div style="display:flex; align-items:baseline; gap:10px;">
      <div style="font-weight:800; letter-spacing:.2px;">🔥 Heat Level ${L}/5</div>
      <div class="muted" style="font-variant-numeric: tabular-nums;">${hv.toFixed(2)}/5</div>
    </div>
    <div class="muted" style="margin-top:6px;">${heatConsequencesText(L)}</div>
    <div style="margin-top:8px; line-height:1.25;">${lines.map(s => `<div>${s}</div>`).join("")}</div>
  `;

  // Neutral toast: use "good" styling so it doesn't look like an answer verdict.
  if (typeof showToast === "function") showToast(msg, true);
}


// ---- Curses UI ----
// Render active curses managed by js/19_curses.js

function __getActiveCursesForUI() {
  try { return (typeof window.getActiveCurses === "function") ? window.getActiveCurses() : []; } catch (e) { return []; }
}

function updateCursesButton(){
  const btn = document.getElementById('btnCurses');
  if (!btn) return;
  const list = __getActiveCursesForUI();
  const isActive = Array.isArray(list) && list.length > 0;
  btn.classList.toggle('isActive', isActive);
  btn.classList.toggle('isInactive', !isActive);
}

function __fmtRemaining(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const mm = String(Math.floor(s / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}

function updateCursesPanel(){
  const empty = document.getElementById('cursesEmpty');
  const ul = document.getElementById('cursesList');
  if (!empty || !ul) return;

  const list = __getActiveCursesForUI();

  if (!Array.isArray(list) || list.length === 0) {
    empty.classList.remove('hidden');
    ul.classList.add('hidden');
    ul.innerHTML = '';
    return;
  }

  empty.classList.add('hidden');
  ul.classList.remove('hidden');

  ul.innerHTML = list.map(c => {
    const name = (c && c.name) ? String(c.name) : String((c && c.id) || 'Curse');
    const desc = (c && c.description) ? String(c.description) : '';
    let left = 0;
    try { left = (typeof window.__msLeftOnCurse === 'function') ? window.__msLeftOnCurse(c) : 0; } catch (e) { left = 0; }
    const t = __fmtRemaining(left);
    const d = desc ? `<div class="muted" style="margin-top:2px;">${desc}</div>` : '';
    return `<li><div style="display:flex;align-items:baseline;justify-content:space-between;gap:10px;">
      <span>${name}</span><span class="muted">${t}</span>
    </div>${d}</li>`;
  }).join('');
}

// Expose for curses system.
window.updateCursesButton = updateCursesButton;
window.updateCursesPanel = updateCursesPanel;

// Default render.
try { updateCursesButton(); updateCursesPanel(); } catch (e) {}