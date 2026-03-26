// ---- Phase 2: Lock In Guess + Scoring ----
(function(){
  function num(x){
    const n = (typeof x === 'string') ? parseFloat(x) : x;
    return (typeof n === 'number' && isFinite(n)) ? n : null;
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
    const radius = (typeof window.getModeTargetRadiusM === 'function') ? window.getModeTargetRadiusM() : 500;
    const bands = (typeof GRADE_THRESHOLDS_FRAC !== 'undefined' && Array.isArray(GRADE_THRESHOLDS_FRAC))
      ? GRADE_THRESHOLDS_FRAC
      : [
          { label:'Diamond', frac:0.04 }, { label:'Emerald', frac:0.12 },
          { label:'Platinum', frac:0.24 }, { label:'Gold', frac:0.44 },
          { label:'Silver', frac:0.68 }, { label:'Bronze', frac:0.92 },
          { label:'Copper', frac:Infinity },
        ];
    for (const b of bands) {
      if (d <= (num(b.frac) ?? Infinity) * radius) return String(b.label);
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

  function __wireResultModalButtons(){
    try {
      const b1 = document.getElementById('btnResultNewRound');
      if (b1) b1.onclick = () => { try { closeResultModal(); } catch(e) {} try { if (typeof window.startNewRound === 'function') window.startNewRound(); } catch(e) {} };
      const b2 = document.getElementById('btnResultClose');
      if (b2) b2.onclick = () => closeResultModal();
    } catch(e) {}
  }

  function openResultModal(html){
    const m = document.getElementById('resultModal');
    const b = document.getElementById('resultModalBody');
    if (b) b.innerHTML = html;
    if (m) m.classList.remove('hidden');
    try { localStorage.setItem(RESULT_MODAL_KEY, html); } catch(e) {}
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

  async function lockInGuess({ autoLock = false } = {}){
    const r = getRound();
    if (!r) { try { if (typeof showToast === 'function') showToast('No active round.', false); } catch(e) {} return; }
    if (r.hasGuessed) { try { if (typeof showToast === 'function') showToast('Guess already locked.', false); } catch(e) {} return; }

    // Safety net: if a result modal exists in storage, the round was already scored.
    // Prevents a second guess when hasGuessed is stale/false due to a restore glitch.
    try {
      const _existingResult = localStorage.getItem(RESULT_MODAL_KEY);
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
    if (dbg && pl && pl.manualOverride) {
      guess = { lat: +pl.lat, lon: +pl.lon, accuracy: num(pl.accuracy) ?? 0, ts: Date.now() };
    } else {
      const lockMsg = autoLock ? "Time's up — sampling your position…" : 'Locking in guess…';
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
    let _toolsUsed = 0;
    for (const [tId, opts] of Object.entries(_usedOpts)) {
      for (const [oId, used] of Object.entries(opts || {})) {
        if (used && !(tId === 'photo' && oId === 'starter')) _toolsUsed++;
      }
    }

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
    try {
      if (typeof window.saveRoundResult === 'function') {
        const _tgt = getTargetLatLng();
        const _round = getRound();
        window.saveRoundResult({
          target_name:         _round?.targetName || null,
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

    const _targetName = (() => {
      try {
        const r = (typeof window.getRoundStateV1 === 'function') ? window.getRoundStateV1() : null;
        const tgt = (typeof getTarget === 'function') ? getTarget() : (window.target || null);
        // Prefer debug label (nearest POI name for pano targets)
        const label = (r && r.targetName) || (tgt && (tgt.debug_label || (tgt.debug_poi && tgt.debug_poi.name) || tgt.name)) || null;
        return label && String(label).trim() ? String(label).trim() : null;
      } catch(e) { return null; }
    })();

    const gradeInfo = {
      Diamond:  { color:'#a5f3fc', flavor:'Extraordinary' },
      Emerald:  { color:'#34d399', flavor:'Exceptional' },
      Platinum: { color:'#e2e8f0', flavor:'Excellent' },
      Gold:     { color:'#fbbf24', flavor:'Impressive' },
      Silver:   { color:'#94a3b8', flavor:'Good effort' },
      Bronze:   { color:'#f97316', flavor:'Off the mark' },
      Copper:   { color:'#ef4444', flavor:'Way off' },
    }[grade] || { color:'#94a3b8', flavor:'' };
    const gc = gradeInfo.color;
    const flavor = gradeInfo.flavor;

    const timeStatVal = formatMMSS(guessRemainingMs);
    const timeStatColor = '#fff';
    const timeStatLabel = 'Remaining';

    const adjLine = (useAdj && rawD != null && adjD != null && rawD !== adjD)
      ? `<div class="muted" style="font-size:0.65rem;text-align:center;margin-top:2px;">adj. ${fmtMeters(adjD)} · ±${acc != null ? fmtMeters(acc) : '—'}</div>`
      : '';

    const _gradeOrder = [
      { label:'Copper',   color:'#ef4444' },
      { label:'Bronze',   color:'#f97316' },
      { label:'Silver',   color:'#94a3b8' },
      { label:'Gold',     color:'#fbbf24' },
      { label:'Platinum', color:'#e2e8f0' },
      { label:'Emerald',  color:'#34d399' },
      { label:'Diamond',  color:'#a5f3fc' },
    ];
    function _tierShape(label, color, w, h) {
      const sizeAttrs = w ? `width="${w}" height="${h || w}"` : `width="100%" height="100%"`;
      const shapes = {
        Copper: {
          vb: '0 0 64 64',
          paths: `<polygon points="32,56 6,12 58,12" fill="${color}" opacity="0.9"/>` +
                 `<polygon points="32,48 14,18 50,18" fill="none" stroke="white" stroke-width="1.5" stroke-opacity="0.2"/>`,
        },
        Bronze: {
          vb: '0 0 64 64',
          paths: `<circle cx="32" cy="32" r="28" fill="${color}" opacity="0.9"/>` +
                 `<circle cx="32" cy="32" r="20" fill="none" stroke="white" stroke-width="1.5" stroke-opacity="0.2"/>` +
                 `<circle cx="32" cy="32" r="11" fill="none" stroke="white" stroke-width="1" stroke-opacity="0.15"/>`,
        },
        Silver: {
          vb: '0 0 64 64',
          paths: `<path d="M32 6 L56 14 L56 32 Q56 50 32 60 Q8 50 8 32 L8 14 Z" fill="${color}" opacity="0.9"/>` +
                 `<path d="M32 13 L49 19 L49 32 Q49 46 32 54 Q15 46 15 32 L15 19 Z" fill="none" stroke="white" stroke-width="1.5" stroke-opacity="0.2"/>`,
        },
        Gold: {
          vb: '0 0 64 64',
          paths: `<polygon points="32,4 38,24 58,24 42,36 48,56 32,44 16,56 22,36 6,24 26,24" fill="${color}" opacity="0.9"/>` +
                 `<polygon points="32,12 36,26 50,26 39,34 43,48 32,40 21,48 25,34 14,26 28,26" fill="none" stroke="white" stroke-width="1.2" stroke-opacity="0.2"/>`,
        },
        Platinum: {
          vb: '0 0 64 64',
          paths: `<polygon points="32,4 54,17 54,47 32,60 10,47 10,17" fill="${color}" opacity="0.9"/>` +
                 `<polygon points="32,12 46,20 46,44 32,52 18,44 18,20" fill="none" stroke="white" stroke-width="1.5" stroke-opacity="0.25"/>` +
                 `<line x1="32" y1="4" x2="32" y2="60" stroke="white" stroke-width="0.8" stroke-opacity="0.12"/>` +
                 `<line x1="10" y1="17" x2="54" y2="47" stroke="white" stroke-width="0.8" stroke-opacity="0.12"/>` +
                 `<line x1="54" y1="17" x2="10" y2="47" stroke="white" stroke-width="0.8" stroke-opacity="0.12"/>`,
        },
        Emerald: {
          vb: '0 0 64 72',
          paths: `<polygon points="16,6 48,6 60,18 60,54 48,66 16,66 4,54 4,18" fill="${color}" opacity="0.9"/>` +
                 `<polygon points="20,12 44,12 54,22 54,50 44,60 20,60 10,50 10,22" fill="none" stroke="white" stroke-width="1.5" stroke-opacity="0.2"/>` +
                 `<polygon points="24,20 40,20 46,26 46,46 40,52 24,52 18,46 18,26" fill="none" stroke="white" stroke-width="1" stroke-opacity="0.15"/>`,
        },
        Diamond: {
          vb: '0 0 64 70',
          paths: `<polygon points="8,26 20,6 44,6 56,26" fill="${color}" opacity="0.95"/>` +
                 // Pavilion uses a darker shade than the tier colour to simulate a less-lit facet
                 `<polygon points="8,26 56,26 32,66" fill="#7dd3fc" opacity="0.9"/>` +
                 `<line x1="8" y1="26" x2="32" y2="66" stroke="white" stroke-width="1" stroke-opacity="0.3"/>` +
                 `<line x1="56" y1="26" x2="32" y2="66" stroke="white" stroke-width="1" stroke-opacity="0.3"/>` +
                 `<line x1="8" y1="26" x2="56" y2="26" stroke="white" stroke-width="1" stroke-opacity="0.35"/>` +
                 `<line x1="20" y1="6" x2="32" y2="26" stroke="white" stroke-width="0.8" stroke-opacity="0.25"/>` +
                 `<line x1="44" y1="6" x2="32" y2="26" stroke="white" stroke-width="0.8" stroke-opacity="0.25"/>` +
                 `<line x1="20" y1="6" x2="8" y2="26" stroke="white" stroke-width="0.8" stroke-opacity="0.2"/>` +
                 `<line x1="44" y1="6" x2="56" y2="26" stroke="white" stroke-width="0.8" stroke-opacity="0.2"/>` +
                 `<line x1="32" y1="26" x2="32" y2="66" stroke="white" stroke-width="0.6" stroke-opacity="0.2"/>`,
        },
      };
      const s = shapes[label] || shapes.Bronze;
      return `<svg ${sizeAttrs} viewBox="${s.vb}" fill="none" xmlns="http://www.w3.org/2000/svg">${s.paths}</svg>`;
    }
    function _flankMedal(label, color, side, rank) {
      return `<div class="resultFlankMedal ${side} rank-${rank}">` +
        _tierShape(label, color) +
        `</div>`;
    }
    const _earnedIdx = _gradeOrder.findIndex(g => g.label === grade);
    const _leftHtml = _gradeOrder.slice(Math.max(0, _earnedIdx - 2), _earnedIdx)
      .map((g, i, arr) => _flankMedal(g.label, g.color, 'left', arr.length - i)).join('');
    const _rightHtml = _gradeOrder.slice(_earnedIdx + 1, Math.min(_gradeOrder.length, _earnedIdx + 3))
      .map((g, i) => _flankMedal(g.label, g.color, 'right', i + 1)).join('');
    const _glowAnim = ['Platinum','Emerald','Diamond'].includes(grade) ? 'tierGlowHigh' : 'tierGlowLow';

    const _bd = scoreResult;
    const _bdTimeLabel = `Time (${timeStatVal} ${timeStatLabel.toLowerCase()})`;
    const _bdLengthLabel = `Game length (${(typeof window.getSelectedGameLength === 'function') ? window.getSelectedGameLength() : 'short'})`;
    const _bdDiffLabel = `Difficulty (${(typeof window.getSelectedGameDifficulty === 'function') ? window.getSelectedGameDifficulty() : 'normal'})`;
    function _bdRow(label, val) {
      const cls = val === 0 ? ' zero' : '';
      const sign = val > 0 ? '+' : '';
      return `<div class="resultBreakdownRow${cls}"><span>${label}</span><span>${sign}${val} pts</span></div>`;
    }

    const html = `
      <div class="resultHero">
        <div class="resultGradeBadge">
          <div class="resultMedalScene">
            ${_leftHtml}
            <div class="resultMedalGlowWrap" style="--glow-color:${gc};animation:${_glowAnim} 1.8s ease-in-out 0.2s 2 forwards;">
              ${_tierShape(grade, gc, 80, 80)}
            </div>
            ${_rightHtml}
          </div>
          <div class="resultGradeLabel" style="color:${gc}">${grade}</div>
        </div>
        <div class="resultFlavor" style="color:${gc}">${flavor}</div>
        ${_targetName ? `<div class="muted" style="font-size:0.75rem;text-align:center;margin-top:2px;letter-spacing:.02em;">📍 ${_targetName}</div>` : ''}
        <div class="resultBreakdown">
          ${_bdRow(`${grade} base`, _bd.base)}
          ${_bdRow(_bdTimeLabel, _bd.timeBonus)}
          ${_bdRow(_bdLengthLabel, _bd.lengthBonus)}
          ${_bdRow(_bdDiffLabel, _bd.diffBonus)}
          ${_bdRow(`Tool efficiency (${_toolsUsed} used)`, _bd.toolBonus)}
        </div>
        <div class="resultScore">${score.toLocaleString()}<span class="resultScoreLabel">pts</span></div>
        <div class="resultStats">
          <div class="resultStat">
            <div class="resultStatVal">${fmtMeters(rawD)}</div>
            ${adjLine}
            <div class="resultStatLabel">Distance</div>
          </div>
          <div class="resultStat">
            <div class="resultStatVal" style="color:${timeStatColor}">${timeStatVal}</div>
            <div class="resultStatLabel">${timeStatLabel}</div>
          </div>
          <div class="resultStat">
            <div class="resultStatVal">${_toolsUsed} used</div>
            <div class="resultStatLabel">Tools</div>
          </div>
        </div>
        <div class="resultActions">
          <button id="btnResultNewRound" class="primary" style="flex:1;">Setup New Round</button>
          <button id="btnResultClose" style="flex:0 0 auto;">Close ✕</button>
        </div>
      </div>
    `;
    // Persist result HTML before the delay so a refresh during the reveal beat can still restore the modal
    try { localStorage.setItem(RESULT_MODAL_KEY, html); } catch(e) {}

    // Brief pause so the player can see the reveal line on the map before the modal appears
    await new Promise(r => setTimeout(r, 1800));

    openResultModal(html);

  }

  function startNewRound(){
    try { localStorage.removeItem(RESULT_MODAL_KEY); } catch(e) {}
    try { const b = document.getElementById('resultModalBody'); if (b) b.innerHTML = ''; } catch(e) {}
    // Clear photo gallery strip
    try {
      const list = document.getElementById('photoGalleryList');
      if (list) list.innerHTML = '';
      const strip = document.getElementById('photoGalleryStrip');
      if (strip) strip.classList.add('hidden');
    } catch(e) {}
    // Close gameplay panel first so the new game panel isn't hidden behind it.
    try {
      const pg = document.getElementById('panelGameplay');
      if (pg) pg.classList.remove('open');
    } catch(e) {}
    // Open the New Game setup panel so the player can choose length and difficulty.
    try {
      const p = document.getElementById('panelNewGame');
      if (p) p.classList.add('open');
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
    // Restore HTML from storage if body is empty (e.g. after a page refresh).
    if (b && !b.innerHTML.trim()) {
      try {
        const saved = localStorage.getItem(RESULT_MODAL_KEY);
        if (saved) { b.innerHTML = saved; __wireResultModalButtons(); }
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
