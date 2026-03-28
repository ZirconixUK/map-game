// ---- Curses System (v1) ----
// For now: one test curse per heat tier (1..5). Each lasts 5 minutes and has no gameplay effects.
// Future: each tier can hold multiple curses and we pick randomly per tier.

(function () {
  const DEFAULT_DURATION_MS = 5 * 60 * 1000;

  let CURSES_CONFIG = null; // loaded from curses.json
  let active = []; // [{id, tier, name, description, appliedAt, expiresAt, stacks}]

  function nowMs() { return Date.now(); }

  function getCacheBuster() {
    // index.html sets window.__cb to its cache-buster value.
    return (typeof window.__cb !== "undefined" && window.__cb) ? String(window.__cb) : String(Date.now());
  }

  async function loadCursesConfig() {
    try {
      const cb = getCacheBuster();
      const res = await fetch(`./curses.json?cb=${encodeURIComponent(cb)}`, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      CURSES_CONFIG = await res.json();
      return CURSES_CONFIG;
    } catch (e) {
      console.error("Failed to load curses.json", e);
      CURSES_CONFIG = null;
      return null;
    }
  }

  function tierToCurseId(tier) {
    const t = String(tier);
    if (CURSES_CONFIG && CURSES_CONFIG.tiers && CURSES_CONFIG.tiers[t] && CURSES_CONFIG.tiers[t].id) {
      return CURSES_CONFIG.tiers[t].id;
    }
    return `heat${t}`;
  }

  function getCurseDefById(id) {
    if (!CURSES_CONFIG) return null;
    if (CURSES_CONFIG.tiers) {
      const tiers = CURSES_CONFIG.tiers;
      for (const k of Object.keys(tiers)) {
        if (tiers[k] && tiers[k].id === id) return { tier: parseInt(k, 10), ...tiers[k] };
      }
    }
    if (CURSES_CONFIG.special) {
      const special = CURSES_CONFIG.special;
      for (const k of Object.keys(special)) {
        if (special[k] && special[k].id === id) return { tier: null, ...special[k] };
      }
    }
    return null;
  }

  function normalizeCurseObj(obj) {
    if (!obj || typeof obj !== "object") return null;
    if (!obj.id) return null;
    const def = getCurseDefById(obj.id);
    const tier = (typeof obj.tier === "number" && isFinite(obj.tier)) ? obj.tier : (def ? def.tier : null);
    const durationMs = (typeof obj.durationMs === "number" && isFinite(obj.durationMs))
      ? obj.durationMs
      : (def && typeof def.durationMs === "number" ? def.durationMs : (CURSES_CONFIG && CURSES_CONFIG.defaultDurationMs) || DEFAULT_DURATION_MS);

    const appliedAt = (typeof obj.appliedAt === "number" && isFinite(obj.appliedAt)) ? obj.appliedAt : nowMs();
    const expiresAt = (typeof obj.expiresAt === "number" && isFinite(obj.expiresAt))
      ? obj.expiresAt
      : (appliedAt + durationMs);

    return {
      id: String(obj.id),
      tier: (typeof tier === "number" && isFinite(tier)) ? tier : null,
      name: String(obj.name || (def && def.name) || obj.id),
      description: String(obj.description || (def && def.description) || ""),
      appliedAt,
      expiresAt,
      stacks: (typeof obj.stacks === "number" && isFinite(obj.stacks)) ? obj.stacks : 1
    };
  }

  function refreshUI() {
    try { if (typeof window.updateCursesButton === "function") window.updateCursesButton(); } catch (e) {}
    try { if (typeof window.updateCursesPanel === "function") window.updateCursesPanel(); } catch (e) {}
    try { if (typeof window.drawThrottled === "function") window.drawThrottled(); } catch (e) {}
    try { if (typeof window.syncLeafletPlayerMarker === "function") window.syncLeafletPlayerMarker(); } catch (e) {}
  }

  function saveIfPossible() {
    try { if (typeof window.saveRoundState === "function") window.saveRoundState(); } catch (e) {}
  }

  function getActiveCurses() {
    return active.slice();
  }

  function setActiveCurses(list, { silent = false } = {}) {
    const next = Array.isArray(list) ? list.map(normalizeCurseObj).filter(Boolean) : [];
    active = next;
    if (!silent) {
      refreshUI();
      saveIfPossible();
    }
  }

  function clearCurses() {
    active = [];
    refreshUI();
    saveIfPossible();
  }

  function applyCurse(curseId, { durationMs = null } = {}) {
    const id = String(curseId || "").trim();
    if (!id) return { curse: null, isNew: false };

    const def = getCurseDefById(id);

    // Instant time penalty: subtract time immediately, don't persist in active list
    if (def && def.kind === 'instant_time_penalty') {
      try {
        const setup = typeof window.getGameSetupSelection === 'function' ? window.getGameSetupSelection() : null;
        const length = (setup && setup.length) || 'short';
        const penMs = (def.timePenaltyMs && typeof def.timePenaltyMs[length] === 'number') ? def.timePenaltyMs[length] : 0;
        if (penMs > 0 && typeof addPenaltyMs === 'function') addPenaltyMs(penMs);
        return { curse: { id, name: def.name, penaltyAppliedMs: penMs }, isNew: true };
      } catch (e) {
        return { curse: null, isNew: false };
      }
    }
    const dur = (typeof durationMs === "number" && isFinite(durationMs))
      ? durationMs
      : (def && typeof def.durationMs === "number" ? def.durationMs : (CURSES_CONFIG && CURSES_CONFIG.defaultDurationMs) || DEFAULT_DURATION_MS);

    const existing = active.find(c => c.id === id);
    const now = nowMs();

    if (existing) {
      const maxStacks = (def && typeof def.maxStacks === 'number') ? def.maxStacks : 1;
      if (maxStacks > 1 && existing.stacks < maxStacks) {
        existing.stacks++;
        existing.expiresAt = Math.max(existing.expiresAt, now) + dur; // extend
      } else {
        existing.expiresAt = now + dur; // refresh
      }
      existing.appliedAt = now;
      refreshUI();
      saveIfPossible();
      return { curse: { ...existing }, isNew: false };
    } else {
      const created = normalizeCurseObj({
        id,
        tier: def ? def.tier : null,
        name: def ? def.name : id,
        description: def ? def.description : "",
        appliedAt: now,
        expiresAt: now + dur,
        stacks: 1
      });
      if (created) active.push(created);
      refreshUI();
      saveIfPossible();
      return { curse: created ? { ...created } : null, isNew: true };
    }
  }

  function applyTierCurse(tier) {
    const id = tierToCurseId(tier);
    return applyCurse(id);
  }

  function msLeft(c) {
    const left = (c && typeof c.expiresAt === "number") ? (c.expiresAt - nowMs()) : 0;
    return Math.max(0, left);
  }

  function tickCurses(now = Date.now()) {
    if (!active.length) return;
    const before = active.length;
    active = active.filter(c => (c && typeof c.expiresAt === "number") ? (c.expiresAt > now) : false);
    if (active.length !== before) {
      refreshUI();
      saveIfPossible();
    }
  }

  // Persist/restore helpers
  function getCursesStateForSave() {
    return active.map(c => ({
      id: c.id,
      tier: c.tier,
      name: c.name,
      description: c.description,
      appliedAt: c.appliedAt,
      expiresAt: c.expiresAt,
      stacks: c.stacks
    }));
  }

  function restoreCursesFromSave(savedList) {
    // Called by boot. Don't spam saves on restore.
    setActiveCurses(Array.isArray(savedList) ? savedList : [], { silent: true });
    // Immediately drop any expired curses.
    tickCurses(Date.now());
    refreshUI();
  }

  // Heat hook: whenever heat level increases to N, apply the tier N curse.
  // We intentionally ignore "restore" so refreshing doesn't re-trigger curses.
  function onHeatLevelChanged(prevLevel, newLevel, reason) {
    // v2 design: we *don't* auto-apply curses on level change.
    // Instead, each question roll has a chance based on the *current* heat level.
    // We keep this hook for future effects or telemetry, but no-op for now.
    return;
  }

  function getTriggerChanceForHeatLevel(level) {
    const n = (typeof level === 'number' && isFinite(level)) ? Math.max(0, Math.min(5, level | 0)) : 0;
    if (!CURSES_CONFIG || !CURSES_CONFIG.triggerChanceByHeatLevel) return 0;
    const v = CURSES_CONFIG.triggerChanceByHeatLevel[String(n)];
    return (typeof v === 'number' && isFinite(v)) ? Math.max(0, Math.min(1, v)) : 0;
  }

  /**
   * Read probability for `configKey[level]` from CURSES_CONFIG, apply difficulty scaling,
   * roll Math.random(), and call applyCurse(curseId) if it hits.
   * Returns the applyCurse result, or null if it didn't trigger.
   */
  function __rollCurse(configKey, curseId, level, diff) {
    try {
      if (!CURSES_CONFIG || !CURSES_CONFIG[configKey]) return null;
      const raw = CURSES_CONFIG[configKey][String(level)];
      let p = (typeof raw === 'number' && isFinite(raw)) ? Math.max(0, Math.min(1, raw)) : 0;
      if (p <= 0) return null;
      if (diff === 'easy') p *= 0.75;
      else if (diff === 'hard') p = Math.min(1, p * 1.5);
      return (Math.random() < p) ? applyCurse(curseId) : null;
    } catch (e) {
      return null;
    }
  }

  // Called after a question is asked.
  // Rolls a chance to trigger a curse based on current heat level.
  function maybeTriggerCurseFromQuestion(meta = null) {
    try {
      tickCurses(Date.now());

      const lvl = (typeof window.getHeatLevel === 'function')
        ? window.getHeatLevel()
        : (typeof heatLevel !== 'undefined' ? heatLevel : 0);

      const level = (typeof lvl === 'number' && isFinite(lvl)) ? (lvl | 0) : 0;
      if (level <= 0) return { triggered: false, reason: 'heat0' };

      const diff = (() => {
        try { return (typeof window.getSelectedGameDifficulty === 'function') ? window.getSelectedGameDifficulty() : 'normal'; } catch(e) { return 'normal'; }
      })();

      let p = getTriggerChanceForHeatLevel(level);
      if (p <= 0) return { triggered: false, reason: 'p0', p, level };

      // Scale curse probability by difficulty
      if (diff === 'easy') p *= 0.75;
      else if (diff === 'hard') p = Math.min(1, p * 1.5);

      const r = Math.random();
      const triggered = r < p;
      let applied = null;
      if (triggered) applied = applyTierCurse(level);

      // Second independent roll: Overcharged (time-penalty curse)
      const overchargedResult = __rollCurse('overchargedChanceByHeatLevel', 'overcharged', level, diff);

      // Third independent roll: Veil (canvas overlay hidden)
      const veilResult = __rollCurse('veilChanceByHeatLevel', 'veil', level, diff);

      // Fourth independent roll: Blackout (map tiles + canvas hidden)
      const blackoutResult = __rollCurse('blackoutChanceByHeatLevel', 'blackout', level, diff);

      // Fifth independent roll: Ghost (player dot hidden)
      const ghostResult = __rollCurse('ghostChanceByHeatLevel', 'ghost', level, diff);

      // Independent rolls: instant time penalties (scale with game length)
      const timePenMinorResult    = __rollCurse('timePenMinorChanceByHeatLevel',    'timepen_minor',    level, diff);
      const timePenModerateResult = __rollCurse('timePenModerateChanceByHeatLevel', 'timepen_moderate', level, diff);
      const timePenMajorResult    = __rollCurse('timePenMajorChanceByHeatLevel',    'timepen_major',    level, diff);

      return { triggered, p, r, level, meta, applied, overcharged: overchargedResult, veil: veilResult, blackout: blackoutResult, ghost: ghostResult, timePenMinor: timePenMinorResult, timePenModerate: timePenModerateResult, timePenMajor: timePenMajorResult };
    } catch (e) {
      console.error(e);
      return { triggered: false, reason: 'error' };
    }
  }

  // Debug helper: shift all active curse timestamps backwards by `ms` milliseconds,
  // simulating elapsed time for the purpose of curse expiry. Called by
  // debugAdvanceRoundElapsedByMs in 04_state.js.
  function debugAdvanceCurseTimersBy(ms) {
    const delta = Math.max(0, Number(ms) || 0);
    if (!delta || !active.length) return;
    for (const c of active) {
      if (typeof c.appliedAt === 'number') c.appliedAt -= delta;
      if (typeof c.expiresAt === 'number') c.expiresAt -= delta;
    }
    tickCurses(Date.now());
  }

  // Debug helper: toggle a simulated tier-3 curse (arbitrary).
  function debugSimulateCurse(on) {
    if (on) {
      applyTierCurse(3);
    } else {
      clearCurses();
    }
  }

  function isCurseActive(id) {
    const now = nowMs();
    return active.some(c => c.id === id && c.expiresAt > now);
  }

  function getOverchargedStacks() {
    const now = nowMs();
    const c = active.find(c => c.id === 'overcharged' && c.expiresAt > now);
    return c ? (c.stacks || 1) : 0;
  }

  // Expose
  window.debugAdvanceCurseTimersBy = debugAdvanceCurseTimersBy;
  window.loadCursesConfig = loadCursesConfig;
  window.getActiveCurses = getActiveCurses;
  window.isCurseActive = isCurseActive;
  window.setActiveCurses = setActiveCurses; // still useful for dev tooling
  window.clearCurses = clearCurses;
  window.applyCurse = applyCurse;
  window.applyTierCurse = applyTierCurse;
  window.tickCurses = tickCurses;
  window.maybeTriggerCurseFromQuestion = maybeTriggerCurseFromQuestion;
  window.__getCursesStateForSave = getCursesStateForSave;
  window.__restoreCursesFromSave = restoreCursesFromSave;
  window.onHeatLevelChanged = onHeatLevelChanged;
  window.debugSimulateCurse = debugSimulateCurse;
  window.getOverchargedStacks = getOverchargedStacks;
  window.__msLeftOnCurse = msLeft;

  // Kick off config load ASAP (non-blocking).
  loadCursesConfig().then(() => {
    // refresh UI once definitions are known
    window.__curseConfig = CURSES_CONFIG;
    try { refreshUI(); } catch (e) {}
  });

})();
