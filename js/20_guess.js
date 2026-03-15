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

  function computeScore(distM){
    const d = Math.max(0, num(distM) ?? Infinity);
    const maxPts = (typeof SCORE_MAX_POINTS !== 'undefined') ? num(SCORE_MAX_POINTS) : 5000;
    const zeroAt = (typeof SCORE_ZERO_AT_M !== 'undefined') ? num(SCORE_ZERO_AT_M) : 2000;
    if (!maxPts || !zeroAt) return 0;
    // Smooth falloff: quadratic-ish clamp.
    const x = Math.min(1, d / zeroAt);
    const pts = Math.round(maxPts * Math.max(0, 1 - (x*x)));
    return Math.max(0, pts);
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

  function openResultModal(html){
    const m = document.getElementById('resultModal');
    const b = document.getElementById('resultModalBody');
    if (b) b.innerHTML = html;
    if (m) m.classList.remove('hidden');
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

    const score = computeScore(useAdj ? adjD : rawD);
    const grade = computeGrade(useAdj ? adjD : rawD);

    const _tLimit = (typeof window.getRoundTimeLimitMs === 'function') ? window.getRoundTimeLimitMs() : 30*60*1000;
    const _tStart = (typeof roundStartMs === 'number' && isFinite(roundStartMs)) ? roundStartMs : Date.now();
    const guessRemainingMs = _tLimit - (Date.now() - _tStart);

    setRound({
      hasGuessed: true,
      guessLatLng: { lat: guess.lat, lon: guess.lon },
      guessGpsAccuracyM: acc,
      guessTimestamp: Date.now(),
      distanceToTargetM: rawD,
      adjustedDistanceM: adjD,
      scorePoints: score,
      gradeLabel: grade,
      guessRemainingMs,
    });

    // Reveal line/markers if Leaflet helpers exist
    try {
      if (typeof window.showRevealOverlay === 'function') window.showRevealOverlay({ guess, target: tgt });
    } catch(e) {}

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

    const timeStatVal = guessRemainingMs >= 0
      ? formatMMSS(guessRemainingMs)
      : `OT ${formatMMSS(Math.abs(guessRemainingMs))}`;
    const timeStatColor = guessRemainingMs >= 0 ? '#fff' : '#ef4444';
    const timeStatLabel = guessRemainingMs >= 0 ? 'Remaining' : 'Overtime';

    const adjLine = (useAdj && rawD != null && adjD != null && rawD !== adjD)
      ? `<div class="muted" style="font-size:0.7rem;text-align:center;margin-bottom:4px;">Adjusted ${fmtMeters(adjD)} · GPS ±${acc != null ? fmtMeters(acc) : '—'}</div>`
      : '';

    const html = `
      <div class="resultHero">
        <div class="resultGradeBadge">
          <svg class="resultMedalSvg" viewBox="0 0 80 92" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="28" y="2" width="24" height="20" rx="4" fill="${gc}" opacity="0.85"/>
            <rect x="36" y="18" width="8" height="8" fill="${gc}" opacity="0.7"/>
            <circle cx="40" cy="62" r="28" fill="${gc}"/>
            <circle cx="40" cy="62" r="21" fill="none" stroke="white" stroke-width="2.5" stroke-opacity="0.2"/>
          </svg>
          <div class="resultGradeLabel" style="color:${gc}">${grade}</div>
        </div>
        <div class="resultFlavor" style="color:${gc}">${flavor}</div>
        <div class="resultScore">${score.toLocaleString()}<span class="resultScoreLabel">pts</span></div>
        <div class="resultStats">
          <div class="resultStat">
            <div class="resultStatVal">${fmtMeters(rawD)}</div>
            <div class="resultStatLabel">Distance</div>
          </div>
          <div class="resultStat">
            <div class="resultStatVal" style="color:${timeStatColor}">${timeStatVal}</div>
            <div class="resultStatLabel">${timeStatLabel}</div>
          </div>
        </div>
        ${adjLine}
        <div class="resultActions">
          <button id="btnResultNewRound" class="primary" style="flex:1;">New Round</button>
          <button id="btnResultClose" style="flex:0 0 auto;">Close ✕</button>
        </div>
      </div>
    `;
    openResultModal(html);

    // Wire modal buttons
    try {
      const b1 = document.getElementById('btnResultNewRound');
      if (b1) b1.onclick = () => { try { closeResultModal(); } catch(e) {} try { if (typeof window.startNewRound === 'function') window.startNewRound(); } catch(e) {} };
      const b2 = document.getElementById('btnResultClose');
      if (b2) b2.onclick = () => closeResultModal();
    } catch(e) {}
  }

  function startNewRound(){
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
    if (m) m.classList.remove('hidden');
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
