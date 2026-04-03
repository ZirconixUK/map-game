// ---- Phase 2: Lock In Guess + Scoring ----
(function(){
  function num(x){
    const n = (typeof x === 'string') ? parseFloat(x) : x;
    return (typeof n === 'number' && isFinite(n)) ? n : null;
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }

  function getTargetLatLng(){
    try {
      if (typeof getTarget === 'function') {
        const t = getTarget();
        if (t && isFinite(t.lat) && isFinite(t.lon)) return { lat:+t.lat, lon:+t.lon };
      }
    } catch(e) {}
    // Some builds keep `target` as a module/global var (not attached to `window`).
    try {
      if (typeof target !== 'undefined' && target && isFinite(target.lat) && isFinite(target.lon)) {
        return { lat:+target.lat, lon:+target.lon };
      }
    } catch(e) {}
    try {
      if (window.target && isFinite(window.target.lat) && isFinite(window.target.lon)) return { lat:+window.target.lat, lon:+window.target.lon };
    } catch(e) {}
    return null;
  }

  function getRound(){
    try { return (typeof window.getRoundStateV1 === 'function') ? window.getRoundStateV1() : (window.roundStateV1 || null); } catch(e) { return null; }
  }

  function setRound(patch){
    const r = getRound();
    if (!r || typeof patch !== 'object') return;
    Object.assign(r, patch);
    try { if (typeof saveRoundState === 'function') saveRoundState(); } catch(e) {}
    try { if (typeof updateUI === 'function') updateUI(); } catch(e) {}
    try { if (typeof updateHUD === 'function') updateHUD(); } catch(e) {}
  }

  function computeGrade(distM){
    const d = Math.max(0, num(distM) ?? Infinity);
    const setup = (typeof window.getGameSetupSelection === 'function') ? window.getGameSetupSelection() : null;
    const modeKey = (setup && typeof setup.length === 'string') ? setup.length.toLowerCase() : 'short';
    const key = (modeKey === 'medium' || modeKey === 'long') ? modeKey : 'short';
    const bands = (typeof GRADE_THRESHOLDS !== 'undefined' && Array.isArray(GRADE_THRESHOLDS))
      ? GRADE_THRESHOLDS
      : [
          { label:'Diamond',  short:10,       medium:10,       long:10       },
          { label:'Emerald',  short:30,       medium:30,       long:30       },
          { label:'Platinum', short:70,       medium:70,       long:70       },
          { label:'Gold',     short:140,      medium:140,      long:140      },
          { label:'Silver',   short:250,      medium:400,      long:550      },
          { label:'Bronze',   short:400,      medium:700,      long:1000     },
          { label:'Copper',   short:Infinity, medium:Infinity, long:Infinity },
        ];
    for (const b of bands) {
      if (d <= (num(b[key]) ?? Infinity)) return String(b.label);
    }
    return 'Copper';
  }

  function computeScore(grade, ctx) {
    const bases = (typeof GRADE_BASE_SCORES !== 'undefined') ? GRADE_BASE_SCORES
      : { Diamond:800, Emerald:650, Platinum:500, Gold:375, Silver:250, Bronze:125, Copper:50 };
    const base = bases[grade] ?? 50;

    const tLimit = ctx.timeLimitMs || 1;
    const timeBonus = Math.round(
      ((typeof SCORE_TIME_BONUS_MAX !== 'undefined') ? SCORE_TIME_BONUS_MAX : 150)
      * (Math.max(0, ctx.remainingMs || 0) / tLimit)
    );

    const lb = (typeof SCORE_LENGTH_BONUS !== 'undefined') ? SCORE_LENGTH_BONUS : {short:0,medium:50,long:100};
    const lengthBonus = lb[ctx.gameLength] ?? 0;

    const db = (typeof SCORE_DIFFICULTY_BONUS !== 'undefined') ? SCORE_DIFFICULTY_BONUS : {easy:0,normal:50,hard:100};
    const diffBonus = db[ctx.difficulty] ?? 0;

    const eff = (typeof SCORE_TOOL_EFFICIENCY !== 'undefined') ? SCORE_TOOL_EFFICIENCY : [100,90,75,60,45,30,15,0];
    const toolBonus = eff[Math.min(ctx.toolsUsed, eff.length - 1)] ?? 0;

    return { base, timeBonus, lengthBonus, diffBonus, toolBonus,
             total: base + timeBonus + lengthBonus + diffBonus + toolBonus };
  }

  async function sampleGpsBriefly(){
    // Try: use a few quick samples and average them.
    // Fallback: use last known fix.
    const samples = [];
    const N = 4;
    const start = Date.now();
    for (let i = 0; i < N; i++) {
      try {
        if (typeof window.__requestGeoSample === 'function') {
          const s = await window.__requestGeoSample({ highAccuracy:true, timeoutMs:2500, maximumAgeMs:0 });
          if (s && isFinite(s.lat) && isFinite(s.lon)) samples.push(s);
        }
      } catch(e) {
        // ignore and continue
      }
      if (Date.now() - start > 3500) break;
      // small pause to allow a new fix
      await new Promise(r => setTimeout(r, 250));
    }
    if (!samples.length) {
      try {
        if (typeof window.__getLastGeoFix === 'function') {
          const s = window.__getLastGeoFix();
          if (s && isFinite(s.lat) && isFinite(s.lon)) return s;
        }
      } catch(e) {}
      // Last-ditch: use current player
      if (window.player && isFinite(window.player.lat) && isFinite(window.player.lon)) {
        return { lat: window.player.lat, lon: window.player.lon, accuracy: window.player.accuracy || null, ts: Date.now() };
      }
      return null;
    }
    // Average lat/lon; use best (lowest) accuracy as representative.
    let lat = 0, lon = 0;
    let bestAcc = null;
    for (const s of samples) {
      lat += s.lat; lon += s.lon;
      const a = num(s.accuracy);
      if (a != null) bestAcc = (bestAcc == null) ? a : Math.min(bestAcc, a);
    }
    lat /= samples.length;
    lon /= samples.length;
    return { lat, lon, accuracy: bestAcc, ts: Date.now() };
  }

  const RESULT_MODAL_KEY = 'mapgame_result_html_v1';
  const RESULT_MODAL_PAYLOAD_KEY = 'mapgame_result_payload_v1';

  function __wireResultModalButtons(){
    try {
      const btnRedeploy = document.getElementById('btnResultRedeploy');
      if (btnRedeploy) btnRedeploy.onclick = () => {
        try { closeResultModal(); } catch(e) {}
        try { if (typeof window.startNewRound === 'function') window.startNewRound(); } catch(e) {}
      };
      const btnReview = document.getElementById('btnResultReviewTarget');
      if (btnReview) btnReview.onclick = () => {
        try { closeResultModal(); } catch(e) {}
        try {
          const tgt = (typeof getTargetLatLng === 'function') ? getTargetLatLng() : null;
          if (tgt && window.leafletMap) window.leafletMap.flyTo([tgt.lat, tgt.lon], 16, { duration: 1 });
        } catch(e) {}
      };
      const btnClose = document.getElementById('btnResultClose');
      if (btnClose) btnClose.onclick = () => closeResultModal();
      const btnOld = document.getElementById('btnResultNewRound');
      if (btnOld) btnOld.onclick = () => {
        try { closeResultModal(); } catch(e) {}
        try { if (typeof window.startNewRound === 'function') window.startNewRound(); } catch(e) {}
      };
    } catch(e) {}
  }

  function openResultModal(html){
    const m = document.getElementById('resultModal');
    const b = document.getElementById('resultModalBody');
    if (b) b.innerHTML = html;
    if (m) m.classList.remove('hidden');
    __wireResultModalButtons();
  }
  function closeResultModal(){
    const m = document.getElementById('resultModal');
    if (m) m.classList.add('hidden');
  }

  function fmtMeters(m){
    const n = num(m);
    if (n == null) return '—';
    if (n >= 1000) return `${(n/1000).toFixed(2)} km`;
    return `${Math.round(n)} m`;
  }

  function countToolsUsed(usedOpts) {
    let toolsUsed = 0;
    for (const [tId, opts] of Object.entries(usedOpts || {})) {
      for (const [oId, used] of Object.entries(opts || {})) {
        if (used && !(tId === 'photo' && oId === 'starter')) toolsUsed++;
      }
    }
    return toolsUsed;
  }

  function getResultTargetName() {
    try {
      const r = (typeof window.getRoundStateV1 === 'function') ? window.getRoundStateV1() : null;
      const tgt = (typeof getTarget === 'function') ? getTarget()
                : (typeof target !== 'undefined' ? target : null);
      const label = (r && r.targetName) || (tgt && (tgt.debug_label || (tgt.debug_poi && tgt.debug_poi.name) || tgt.name)) || null;
      const str = label ? String(label).trim() : null;
      return (str && str !== 'Hidden Node') ? str : null;
    } catch(e) {
      return null;
    }
  }

  function buildResultPayload() {
    const r = getRound();
    if (!r || !r.hasGuessed) return null;
    const usedOpts = (typeof window.getUsedToolOptionsThisRound === 'function')
      ? window.getUsedToolOptionsThisRound() : {};
    const mode = (function() {
      try { const s = window.getGameSetupSelection ? window.getGameSetupSelection() : null; return (s && s.mode) || 'normal'; } catch(e) { return 'normal'; }
    })();
    const gauntletState = (mode === 'gauntlet' && typeof window.getGauntletStateForPersistence === 'function')
      ? window.getGauntletStateForPersistence()
      : null;
    const gauntletResults = gauntletState && Array.isArray(gauntletState.results) ? gauntletState.results.slice() : [];
    if (mode === 'gauntlet' && typeof r.distanceToTargetM === 'number') {
      const currentCount = typeof gauntletState.currentIndex === 'number' ? gauntletState.currentIndex : 0;
      if (gauntletResults.length < currentCount + 1) gauntletResults.push({ distanceM: r.distanceToTargetM });
    }
    const gauntletValidDists = gauntletResults.filter(entry => entry && typeof entry.distanceM === 'number');
    const gauntletAverageDistance = gauntletValidDists.length
      ? (gauntletValidDists.reduce((sum, entry) => sum + entry.distanceM, 0) / gauntletValidDists.length)
      : null;
    return {
      grade: r.gradeLabel || 'Copper',
      rawD: r.distanceToTargetM,
      adjD: r.adjustedDistanceM,
      acc: r.guessGpsAccuracyM,
      guessRemainingMs: r.guessRemainingMs,
      score: r.scorePoints,
      scoreResult: r.scoreBreakdown || null,
      toolsUsed: countToolsUsed(usedOpts),
      targetName: getResultTargetName(),
      gameLength: (typeof window.getSelectedGameLength === 'function') ? window.getSelectedGameLength() : 'short',
      difficulty: (typeof window.getSelectedGameDifficulty === 'function') ? window.getSelectedGameDifficulty() : 'normal',
      useAdj: (typeof USE_ACCURACY_ADJUSTED_DISTANCE !== 'undefined') ? !!USE_ACCURACY_ADJUSTED_DISTANCE : true,
      mode,
      movesLeft: (function() {
        try { return (typeof window.getMovesRemaining === 'function') ? window.getMovesRemaining() : null; } catch(e) { return null; }
      })(),
      gauntletAverageDistance,
      gauntletCurrentIndex: gauntletState && typeof gauntletState.currentIndex === 'number' ? gauntletState.currentIndex + 1 : null,
      gauntletTotalTargets: gauntletState && typeof gauntletState.totalTargets === 'number' ? gauntletState.totalTargets : null,
      outcome: 'located',
    };
  }

  function persistResultPayload(payload) {
    try {
      localStorage.setItem(RESULT_MODAL_PAYLOAD_KEY, JSON.stringify(payload));
      // Backward-compatible sentinel for any old checks that looked for this key.
      localStorage.setItem(RESULT_MODAL_KEY, 'payload');
    } catch (e) {}
  }

  function loadResultPayload() {
    try {
      const raw = localStorage.getItem(RESULT_MODAL_PAYLOAD_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) {
      return null;
    }
  }

  function renderResultHtml(payload) {
    if (!payload || !payload.scoreResult) return '';
    const grade = payload.grade || 'Copper';
    const rawD = payload.rawD;
    const adjD = payload.adjD;
    const acc = payload.acc;
    const score = payload.score || 0;
    const scoreResult = payload.scoreResult;
    const _toolsUsed = payload.toolsUsed || 0;
    const _targetName = payload.targetName || null;
    const useAdj = !!payload.useAdj;
    const mode = payload.mode || 'normal';
    const movesLeft = payload.movesLeft;
    const outcome = payload.outcome || 'located';

    const _outcomeHeadlines = {
      located: 'Target Located',
      time_expired: 'Time Expired',
      moves_exhausted: 'Moves Exhausted',
      all_clear: 'All Targets Clear',
    };
    const headline = _outcomeHeadlines[outcome] || 'Target Located';

    const _distM = useAdj && adjD != null ? adjD : rawD;
    const _distStr = fmtMeters(_distM);
    const _distColour = (_distM == null) ? 'amber' : (_distM <= 50 ? 'green' : _distM <= 200 ? 'amber' : 'red');

    const adjLine = (useAdj && rawD != null && adjD != null && rawD !== adjD)
      ? `<div style="font-size:10px;color:#64748b;text-align:center;margin-top:2px;">adj. ${fmtMeters(adjD)} · ±${acc != null ? fmtMeters(acc) : '—'}</div>`
      : '';

    const gradeInfo = {
      Diamond:  { color:'#67e8f9', glow: true },
      Emerald:  { color:'#10b981', glow: true },
      Platinum: { color:'#b0c4d8', glow: true },
      Gold:     { color:'#f59e0b', glow: false },
      Silver:   { color:'#94a3b8', glow: false },
      Bronze:   { color:'#cd7f32', glow: false },
      Copper:   { color:'#b87333', glow: false },
    }[grade] || { color:'#94a3b8', glow: false };
    const gc = gradeInfo.color;

    const _gradeOrder = [
      { label:'Copper',   color:'#b87333' },
      { label:'Bronze',   color:'#cd7f32' },
      { label:'Silver',   color:'#94a3b8' },
      { label:'Gold',     color:'#f59e0b' },
      { label:'Platinum', color:'#b0c4d8' },
      { label:'Emerald',  color:'#10b981' },
      { label:'Diamond',  color:'#67e8f9' },
    ];

    function _tierShape(label, color, w, h) {
      const sizeAttrs = w ? `width="${w}" height="${h || w}"` : `width="100%" height="100%"`;
      const shapes = {
        Copper:   { vb:'0 0 64 64', paths:`<polygon points="32,56 6,12 58,12" fill="${color}" opacity="0.9"/><polygon points="32,48 14,18 50,18" fill="none" stroke="white" stroke-width="1.5" stroke-opacity="0.2"/>` },
        Bronze:   { vb:'0 0 64 64', paths:`<circle cx="32" cy="32" r="28" fill="${color}" opacity="0.9"/><circle cx="32" cy="32" r="20" fill="none" stroke="white" stroke-width="1.5" stroke-opacity="0.2"/><circle cx="32" cy="32" r="11" fill="none" stroke="white" stroke-width="1" stroke-opacity="0.15"/>` },
        Silver:   { vb:'0 0 64 64', paths:`<path d="M32 6 L56 14 L56 32 Q56 50 32 60 Q8 50 8 32 L8 14 Z" fill="${color}" opacity="0.9"/><path d="M32 13 L49 19 L49 32 Q49 46 32 54 Q15 46 15 32 L15 19 Z" fill="none" stroke="white" stroke-width="1.5" stroke-opacity="0.2"/>` },
        Gold:     { vb:'0 0 64 64', paths:`<polygon points="32,4 38,24 58,24 42,36 48,56 32,44 16,56 22,36 6,24 26,24" fill="${color}" opacity="0.9"/><polygon points="32,12 36,26 50,26 39,34 43,48 32,40 21,48 25,34 14,26 28,26" fill="none" stroke="white" stroke-width="1.2" stroke-opacity="0.2"/>` },
        Platinum: { vb:'0 0 64 64', paths:`<polygon points="32,4 54,17 54,47 32,60 10,47 10,17" fill="${color}" opacity="0.9"/><polygon points="32,12 46,20 46,44 32,52 18,44 18,20" fill="none" stroke="white" stroke-width="1.5" stroke-opacity="0.25"/><line x1="32" y1="4" x2="32" y2="60" stroke="white" stroke-width="0.8" stroke-opacity="0.12"/><line x1="10" y1="17" x2="54" y2="47" stroke="white" stroke-width="0.8" stroke-opacity="0.12"/><line x1="54" y1="17" x2="10" y2="47" stroke="white" stroke-width="0.8" stroke-opacity="0.12"/>` },
        Emerald:  { vb:'0 0 64 72', paths:`<polygon points="16,6 48,6 60,18 60,54 48,66 16,66 4,54 4,18" fill="${color}" opacity="0.9"/><polygon points="20,12 44,12 54,22 54,50 44,60 20,60 10,50 10,22" fill="none" stroke="white" stroke-width="1.5" stroke-opacity="0.2"/>` },
        Diamond:  { vb:'0 0 64 70', paths:`<polygon points="8,26 20,6 44,6 56,26" fill="${color}" opacity="0.95"/><polygon points="8,26 56,26 32,66" fill="#7dd3fc" opacity="0.9"/><line x1="8" y1="26" x2="32" y2="66" stroke="white" stroke-width="1" stroke-opacity="0.3"/><line x1="56" y1="26" x2="32" y2="66" stroke="white" stroke-width="1" stroke-opacity="0.3"/><line x1="8" y1="26" x2="56" y2="26" stroke="white" stroke-width="1" stroke-opacity="0.35"/>` },
      };
      const s = shapes[label] || shapes.Bronze;
      return `<svg ${sizeAttrs} viewBox="${s.vb}" fill="none" xmlns="http://www.w3.org/2000/svg">${s.paths}</svg>`;
    }

    const _stripHtml = _gradeOrder.map(g => {
      const isEarned = g.label === grade;
      if (isEarned) {
        return `<div class="medalItem is-earned${gradeInfo.glow ? ' high-tier' : ''}">
          <div class="medalSvgWrap" style="--glow-color:${gc};">
            ${_tierShape(g.label, gc, 48, 48)}
          </div>
          <div class="medalItemLabel" style="color:${gc};">${g.label.toUpperCase()}</div>
        </div>`;
      }
      return `<div class="medalItem">
        ${_tierShape(g.label, g.color, 22, 22)}
      </div>`;
    }).join('');

    const timeRemStr = formatMMSS(Math.max(0, payload.guessRemainingMs || 0));
    const gauntletAvg = (typeof payload.gauntletAverageDistance === 'number' && isFinite(payload.gauntletAverageDistance))
      ? payload.gauntletAverageDistance
      : rawD;
    const gauntletProgress = (payload.gauntletCurrentIndex && payload.gauntletTotalTargets)
      ? `${payload.gauntletCurrentIndex}/${payload.gauntletTotalTargets}`
      : '—';
    let statHtml;
    if (mode === 'gauntlet') {
      statHtml = `
        <div class="resultStat"><div class="resultStatVal">${fmtMeters(gauntletAvg)}</div><div class="resultStatLabel">Avg Distance</div></div>
        <div class="resultStat"><div class="resultStatVal">${gauntletProgress}</div><div class="resultStatLabel">Targets</div></div>
        <div class="resultStat"><div class="resultStatVal">${_toolsUsed}</div><div class="resultStatLabel">Tools Used</div></div>`;
    } else if (mode === 'remote') {
      statHtml = `
        <div class="resultStat"><div class="resultStatVal">${fmtMeters(rawD)}</div>${adjLine}<div class="resultStatLabel">Distance</div></div>
        <div class="resultStat"><div class="resultStatVal" style="color:${movesLeft != null && movesLeft <= 3 ? '#f87171' : '#a78bfa'}">${movesLeft != null ? movesLeft : '—'}</div><div class="resultStatLabel">Moves Left</div></div>
        <div class="resultStat"><div class="resultStatVal">${_toolsUsed}</div><div class="resultStatLabel">Tools Used</div></div>`;
    } else {
      statHtml = `
        <div class="resultStat"><div class="resultStatVal">${fmtMeters(rawD)}</div>${adjLine}<div class="resultStatLabel">Distance</div></div>
        <div class="resultStat"><div class="resultStatVal">${timeRemStr}</div><div class="resultStatLabel">Time Remaining</div></div>
        <div class="resultStat"><div class="resultStatVal">${_toolsUsed}</div><div class="resultStatLabel">Tools Used</div></div>`;
    }

    const _bd = scoreResult;
    function _bdRow(label, val) {
      const cls = val === 0 ? ' zero' : '';
      const sign = val > 0 ? '+' : '';
      return `<div class="resultBreakdownRow${cls}"><span>${escapeHtml(label)}</span><span>${sign}${val} pts</span></div>`;
    }
    const _timeRowLabel = mode === 'remote'
      ? 'Moves bonus'
      : 'Time bonus';
    const _opsAdjustment = (_bd.lengthBonus || 0) + (_bd.diffBonus || 0);

    return `
      <div>
        <div class="debriefHero">
          <div class="debriefEyebrow">
            Operation Debrief
            <span class="debriefModeChip mode-${escapeHtml(mode)}">${mode.toUpperCase()}</span>
          </div>
          <div class="debriefHeadline">${escapeHtml(headline)}</div>
          <div class="debriefDistance ${_distColour}">${_distStr} off target</div>
          ${_targetName ? `<div class="debriefTargetName">${escapeHtml(_targetName)}</div>` : ''}
          <div class="medalStrip">${_stripHtml}</div>
        </div>
        <div class="debriefSectionLabel">Field Stats</div>
        <div class="resultStats">${statHtml}</div>
        <div class="debriefSectionLabel">Score Breakdown</div>
        <div class="resultBreakdown">
          ${_bdRow('Base score', _bd.base)}
          ${_bdRow('Distance penalty', 0)}
          ${_bdRow(_timeRowLabel, _bd.timeBonus)}
          ${_bdRow('Tool cost', _bd.toolBonus)}
          ${_bdRow(mode === 'gauntlet' ? 'Operational modifiers' : 'Operational modifiers', _opsAdjustment)}
          <div class="resultBreakdownRow resultBreakdownTotal">
            <span>Total</span>
            <span>${score.toLocaleString()} pts</span>
          </div>
        </div>
        <div class="debriefActions">
          <button id="btnResultRedeploy" class="debriefRedeployBtn mode-${escapeHtml(mode)}" type="button">Redeploy</button>
          <div class="debriefSecondaryActions">
            <button id="btnResultReviewTarget" class="debriefSecondaryBtn" type="button">Review Target</button>
            <button id="btnResultClose" class="debriefSecondaryBtn" type="button">Close Debrief</button>
          </div>
        </div>
      </div>
    `;
  }

  async function lockInGuess({ autoLock = false, autoLockReason = null } = {}){
    const r = getRound();
    if (!r) { try { if (typeof showToast === 'function') showToast('No active round.', false); } catch(e) {} return; }
    if (r.hasGuessed) { try { if (typeof showToast === 'function') showToast('Guess already locked.', false); } catch(e) {} return; }

    // Safety net: if a result modal exists in storage, the round was already scored.
    // Prevents a second guess when hasGuessed is stale/false due to a restore glitch.
    try {
      const _existingResult = loadResultPayload() || localStorage.getItem(RESULT_MODAL_KEY);
      if (_existingResult) {
        if (typeof window.reopenResultModal === 'function') window.reopenResultModal();
        return;
      }
    } catch(e) {}

    const tgt = getTargetLatLng();
    if (!tgt) { try { if (typeof showToast === 'function') showToast('No target set yet.', false); } catch(e) {} return; }

    // Debug rule: if debug is enabled, use manual click location (if set), not current geolocation.
    let guess = null;
    const dbg = (typeof debugMode !== 'undefined') ? !!debugMode : !!window.debugMode;
    const pl = (typeof player !== 'undefined') ? player : window.player;
    const _usePlayerPos = (dbg && pl && pl.manualOverride) ||
      (typeof window.isRemoteActive === 'function' && window.isRemoteActive() && pl && typeof pl.lat === 'number');
    if (_usePlayerPos) {
      guess = { lat: +pl.lat, lon: +pl.lon, accuracy: 0, ts: Date.now() };
    } else {
      const lockMsg = autoLock
        ? (autoLockReason === 'moves_exhausted'
            ? 'No moves left — sampling your position…'
            : "Time's up — sampling your position…")
        : 'Locking in guess…';
      try { if (typeof showToast === 'function') showToast(lockMsg, !autoLock); } catch(e) {}
      guess = await sampleGpsBriefly();
    }

    if (!guess || !isFinite(guess.lat) || !isFinite(guess.lon)) {
      try { if (typeof showToast === 'function') showToast('Could not get a location fix to lock in.', false); } catch(e) {}
      return;
    }

    const rawD = (typeof haversineMeters === 'function')
      ? haversineMeters(guess.lat, guess.lon, tgt.lat, tgt.lon)
      : null;

    const acc = num(guess.accuracy);
    const useAdj = (typeof USE_ACCURACY_ADJUSTED_DISTANCE !== 'undefined') ? !!USE_ACCURACY_ADJUSTED_DISTANCE : true;
    const adjD = (rawD != null)
      ? Math.max(0, rawD - (useAdj && acc != null ? acc : 0))
      : null;

    const _tLimit = (typeof window.getRoundTimeLimitMs === 'function') ? window.getRoundTimeLimitMs() : 30*60*1000;
    const _tStart = (typeof roundStartMs === 'number' && isFinite(roundStartMs)) ? roundStartMs : Date.now();
    const _penalty = (typeof penaltyMs === 'number' && isFinite(penaltyMs)) ? penaltyMs : 0;
    const guessRemainingMs = Math.max(0, _tLimit - (Date.now() - _tStart) - _penalty);

    // Count tool uses (exclude photo.starter — it's automatic)
    const _usedOpts = (typeof window.getUsedToolOptionsThisRound === 'function')
      ? window.getUsedToolOptionsThisRound() : {};
    let _toolsUsed = countToolsUsed(_usedOpts);

    const grade = computeGrade(useAdj ? adjD : rawD);
    const scoreResult = computeScore(grade, {
      timeLimitMs: _tLimit,
      remainingMs: guessRemainingMs,
      gameLength:  (typeof window.getSelectedGameLength === 'function') ? window.getSelectedGameLength() : 'short',
      difficulty:  (typeof window.getSelectedGameDifficulty === 'function') ? window.getSelectedGameDifficulty() : 'normal',
      toolsUsed:   _toolsUsed,
    });
    const score = scoreResult.total;

    setRound({
      hasGuessed: true,
      guessLatLng: { lat: guess.lat, lon: guess.lon },
      guessGpsAccuracyM: acc,
      guessTimestamp: Date.now(),
      distanceToTargetM: rawD,
      adjustedDistanceM: adjD,
      scorePoints: score,
      scoreBreakdown: scoreResult,
      gradeLabel: grade,
      guessRemainingMs,
    });

    // Persist round result to server (no-op if not signed in; errors swallowed in db.js)
    // Skip per-target saves in gauntlet mode — summary is saved as one row instead
    const _skipDbSave = (typeof window.isGauntletActive === 'function') ? window.isGauntletActive() : false;
    try {
      if (!_skipDbSave && typeof window.saveRoundResult === 'function') {
        const _tgt = getTargetLatLng();
        const _round = getRound();
        const _tgtNameForSave = (() => {
          try {
            // `target` is a `let` in 04_state.js — accessible by bare name but NOT as window.target
            const t = (typeof getTarget === 'function') ? getTarget()
                    : (typeof target !== 'undefined' ? target : null);
            const r = (typeof window.getRoundStateV1 === 'function') ? window.getRoundStateV1() : null;
            const label = (r && r.targetName) || (t && (t.debug_label || (t.debug_poi && t.debug_poi.name) || t.name)) || null;
            const str = label ? String(label).trim() : null;
            // Don't persist the internal placeholder name — treat as no-name
            return (str && str !== 'Hidden Node') ? str : null;
          } catch(e) { return null; }
        })();
        window.saveRoundResult({
          target_name:         _tgtNameForSave,
          target_lat:          _tgt?.lat          ?? null,
          target_lon:          _tgt?.lon          ?? null,
          game_length:         (typeof window.getSelectedGameLength     === 'function') ? window.getSelectedGameLength()     : null,
          difficulty:          (typeof window.getSelectedGameDifficulty === 'function') ? window.getSelectedGameDifficulty() : null,
          grade_label:         grade,
          score_total:         scoreResult.total,
          score_base:          scoreResult.base,
          score_time_bonus:    scoreResult.timeBonus,
          score_length_bonus:  scoreResult.lengthBonus,
          score_diff_bonus:    scoreResult.diffBonus,
          score_tool_bonus:    scoreResult.toolBonus,
          distance_m:          rawD,
          adjusted_distance_m: adjD,
          elapsed_ms:          Date.now() - _tStart,
          remaining_ms:        guessRemainingMs,
          tools_used_count:    _toolsUsed,
          tools_used_json:     _usedOpts,
          curses_active_json:  (typeof window.getActiveCurses === 'function') ? window.getActiveCurses() : null,
          round_start_lat:     _round?.startLatLng?.lat ?? null,
          round_start_lon:     _round?.startLatLng?.lon ?? null,
        });
      }
    } catch(e) {}

    // Dismiss any active toast so it doesn't obscure the reveal animation
    try { if (typeof window.dismissAllToasts === 'function') window.dismissAllToasts(); } catch(e) {}

    // Reveal line/markers if Leaflet helpers exist
    try {
      if (typeof window.showRevealOverlay === 'function') window.showRevealOverlay({ guess, target: tgt });
    } catch(e) {}

    // Fit map to show both player and target during the reveal beat
    try {
      if (window.leafletMap && typeof L !== 'undefined') {
        window.leafletMap.fitBounds(
          L.latLngBounds([[guess.lat, guess.lon], [tgt.lat, tgt.lon]]),
          { padding: [60, 60], animate: true, maxZoom: 17 }
        );
      }
    } catch(e) {}

    const payload = buildResultPayload();
    const resolvedOutcome = autoLock
      ? (autoLockReason === 'moves_exhausted' ? 'moves_exhausted' : 'time_expired')
      : 'located';
    if (payload) {
      payload.outcome = resolvedOutcome;
      payload.mode = (function(){ try { const s = window.getGameSetupSelection(); return (s && s.mode) || 'normal'; } catch(e){ return 'normal'; } })();
      payload.movesLeft = (function(){ try { return typeof window.getMovesRemaining === 'function' ? window.getMovesRemaining() : null; } catch(e){ return null; } })();
    }
    const html = renderResultHtml(payload);
    try {
      const _pl = buildResultPayload();
      if (_pl) {
        _pl.outcome = resolvedOutcome;
        _pl.mode = (function(){ try { const s = window.getGameSetupSelection(); return (s && s.mode) || 'normal'; } catch(e){ return 'normal'; } })();
        _pl.movesLeft = (function(){ try { return typeof window.getMovesRemaining === 'function' ? window.getMovesRemaining() : null; } catch(e){ return null; } })();
        persistResultPayload(_pl);
      }
    } catch(e) {}

    // Brief pause so the player can see the reveal line on the map before the modal appears
    await new Promise(r => setTimeout(r, 1800));

    // Capture gauntlet state BEFORE dispatching — the event handler runs synchronously
    // and may set gauntletState.complete = true (on the last target), which would make
    // isGauntletActive() return false by the time we check it below.
    const _gauntletActive = (typeof window.isGauntletActive === 'function') ? window.isGauntletActive() : false;

    // Fire guesslocked event so gauntlet module can intercept before result modal
    try {
      window.dispatchEvent(new CustomEvent('guesslocked', {
        detail: {
          grade,
          distanceM: rawD,
          adjustedDistanceM: adjD,
          guessLatLng: { lat: guess.lat, lon: guess.lon },
          targetLatLng: tgt,
        }
      }));
    } catch(e) {}

    // Suppress normal result modal when gauntlet is active — it shows its own modals
    if (!_gauntletActive) {
      openResultModal(html);
    }

  }

  function startNewRound(){
    try { if (typeof clearRevealOverlay === 'function') clearRevealOverlay(); } catch(e) {}
    try { localStorage.removeItem(RESULT_MODAL_KEY); } catch(e) {}
    try { localStorage.removeItem(RESULT_MODAL_PAYLOAD_KEY); } catch(e) {}
    try { const b = document.getElementById('resultModalBody'); if (b) b.innerHTML = ''; } catch(e) {}
    // Reset photo gallery badge, grid, and close panel (FAB stays visible — permanent button)
    try {
      const badge = document.getElementById('photoGalleryBadge');
      const grid  = document.getElementById('photoGalleryGrid');
      const empty = document.getElementById('photoGalleryEmpty');
      const panel = document.getElementById('panelPhotoGallery');
      if (badge) { badge.textContent = ''; badge.classList.add('hidden'); }
      if (grid)  grid.innerHTML = '';
      if (empty) empty.classList.remove('hidden');
      if (panel) panel.classList.remove('open');
    } catch(e) {}
    // Close all sibling panels so the new game panel isn't hidden behind them.
    try { if (typeof window.__cancelPickModeIfActive === 'function') window.__cancelPickModeIfActive(); } catch(e) {}
    try {
      ['panelGameplay','panelHeat','panelSystem','panelDebug','panelCurseSelect','panelHowToPlay','panelProfile'].forEach(id => {
        const el = document.getElementById(id); if (el) el.classList.remove('open');
      });
    } catch(e) {}
    try {
      if (typeof window.__showBriefingModal === 'function') {
        window.__showBriefingModal('return');
      } else {
        const p = document.getElementById('panelNewGame');
        if (p) p.classList.add('open');
      }
    } catch(e) {}
  }

  function canUseTools(){
    const r = getRound();
    return !(r && r.hasGuessed);
  }

  function reopenResultModal(){
    const m = document.getElementById('resultModal');
    const b = document.getElementById('resultModalBody');
    if (!m) return;
    // Restore content from structured storage if body is empty (e.g. after a page refresh).
    if (b && !b.innerHTML.trim()) {
      try {
        const payload = loadResultPayload() || buildResultPayload();
        const html = renderResultHtml(payload);
        if (html) {
          b.innerHTML = html;
          __wireResultModalButtons();
        } else {
          // Payload unrecoverable — give the player an escape route rather than a blank modal.
          b.innerHTML = '<div style="padding:1.5rem;text-align:center;color:#ccc;font-size:.95rem">Result unavailable.</div>' +
            '<div style="display:flex;gap:.5rem;padding:0 1.5rem 1.5rem">' +
            '<button id="btnResultClose" style="flex:1;padding:.75rem;border:1px solid #555;border-radius:8px;background:transparent;color:#ccc;font-weight:700">Close</button>' +
            '<button id="btnResultNewRound" style="flex:1;padding:.75rem;border:none;border-radius:8px;background:#f4a62a;color:#000;font-weight:700">New Round</button>' +
            '</div>';
          __wireResultModalButtons();
        }
      } catch(e) {}
    }
    m.classList.remove('hidden');
  }

  // Public API
  window.lockInGuess = lockInGuess;
  window.startNewRound = startNewRound;
  window.isRoundOver = () => {
    const r = getRound();
    return !!(r && r.hasGuessed);
  };
  window.canUseTools = canUseTools;
  window.closeResultModal = closeResultModal;
  window.reopenResultModal = reopenResultModal;

})();
