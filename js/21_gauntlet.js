// ---- Gauntlet Mode ----
// Manages the 5-target chain under a single 90-minute timer.
// Loaded after 20_guess.js; exposes window.isGauntletActive etc.
(function () {

  // ---- State ----
  let gauntletState = {
    active: false,
    complete: false,
    totalTargets: (typeof GAUNTLET_TARGET_COUNT !== 'undefined') ? GAUNTLET_TARGET_COUNT : 5,
    currentIndex: 0,
    results: [],
    chainTimerStartMs: null,
  };

  const GAUNTLET_SUMMARY_KEY = 'mapgame_gauntlet_summary_v1';

  // ---- Public API ----

  window.isGauntletActive = function () {
    return !!(gauntletState.active && !gauntletState.complete);
  };

  window.isGauntletComplete = function () {
    return !!(gauntletState.complete);
  };

  window.getGauntletChainStartMs = function () {
    return gauntletState.chainTimerStartMs;
  };

  window.getGauntletStateForPersistence = function () {
    return {
      active: gauntletState.active,
      complete: gauntletState.complete,
      totalTargets: gauntletState.totalTargets,
      currentIndex: gauntletState.currentIndex,
      results: gauntletState.results.slice(),
      chainTimerStartMs: gauntletState.chainTimerStartMs,
    };
  };

  window.restoreGauntletState = function (saved) {
    if (!saved || typeof saved !== 'object' || !saved.active) return;
    gauntletState.active          = true;
    gauntletState.complete        = !!(saved.complete);
    gauntletState.totalTargets    = (typeof saved.totalTargets === 'number' && saved.totalTargets > 0) ? saved.totalTargets : 5;
    gauntletState.currentIndex    = (typeof saved.currentIndex === 'number') ? saved.currentIndex : 0;
    gauntletState.results         = Array.isArray(saved.results) ? saved.results : [];
    gauntletState.chainTimerStartMs = (typeof saved.chainTimerStartMs === 'number') ? saved.chainTimerStartMs : null;

    // If complete, reopen summary on load (handled by boot after this call)
    if (gauntletState.complete) return;

    // If chain timer has expired while page was away, auto-fill remaining and show summary
    if (gauntletState.chainTimerStartMs) {
      const timeLimit = (typeof GAUNTLET_TIME_LIMIT_MS !== 'undefined') ? GAUNTLET_TIME_LIMIT_MS : (90 * 60 * 1000);
      const chainElapsed = Date.now() - gauntletState.chainTimerStartMs;
      if (chainElapsed >= timeLimit) {
        const needed = gauntletState.totalTargets - gauntletState.results.length;
        for (let i = 0; i < needed; i++) {
          gauntletState.results.push({ distanceM: null, grade: 'Copper', score: __copperScore(), guessLatLng: null, targetLatLng: null });
        }
        gauntletState.active = false;
        gauntletState.complete = true;
        setTimeout(function () { __showGauntletSummary(); }, 600);
        return;
      }
    }

    // If current target's guess is locked (hasGuessed true), the reveal already played
    // before the page was closed — skip straight to next-target modal or summary.
    setTimeout(function () {
      try {
        const r = typeof window.getRoundStateV1 === 'function' ? window.getRoundStateV1() : null;
        if (r && r.hasGuessed) {
          const grade = r.gradeLabel || 'Copper';
          const distM = typeof r.distanceToTargetM === 'number' ? r.distanceToTargetM : null;
          if (gauntletState.currentIndex === gauntletState.results.length) {
            gauntletState.results.push({
              distanceM: distM,
              grade: grade,
              score: __individualScore(grade),
              guessLatLng: r.guessLatLng || null,
              targetLatLng: r.targetPanoLatLng || null,
            });
            gauntletState.currentIndex++;
          }
          __saveGauntletState();
          if (gauntletState.currentIndex >= gauntletState.totalTargets) {
            gauntletState.active = false;
            gauntletState.complete = true;
            __saveGauntletState();
            __showGauntletSummary();
          } else {
            __showNextTargetModal(gauntletState.currentIndex, distM);
          }
        } else {
          __updateProgressBadge();
        }
      } catch (e) {}
    }, 600);
  };

  window.reopenGauntletSummary = function () {
    try {
      const saved = localStorage.getItem(GAUNTLET_SUMMARY_KEY);
      const modal = document.getElementById('gauntletSummaryModal');
      const body = document.getElementById('gauntletSummaryBody');
      if (!modal) return;
      if (body && saved && !body.innerHTML.trim()) {
        body.innerHTML = saved;
        __wireGauntletSummaryButtons();
      }
      modal.classList.remove('hidden');
    } catch (e) {}
  };

  // Called from js/02_dom.js before pickNewTarget
  window.__initGauntletIfNeeded = function () {
    const setup = typeof window.getGameSetupSelection === 'function' ? window.getGameSetupSelection() : null;
    if (setup && setup.mode === 'gauntlet') {
      __initGauntlet();
    } else {
      __deactivateGauntlet();
    }
  };

  // ---- Internal ----

  function __initGauntlet() {
    gauntletState = {
      active: true,
      complete: false,
      totalTargets: (typeof GAUNTLET_TARGET_COUNT !== 'undefined') ? GAUNTLET_TARGET_COUNT : 5,
      currentIndex: 0,
      results: [],
      chainTimerStartMs: Date.now(),
    };
    __saveGauntletState();
    __updateProgressBadge();
    try { localStorage.removeItem(GAUNTLET_SUMMARY_KEY); } catch (e) {}
  }

  function __deactivateGauntlet() {
    if (!gauntletState.active && !gauntletState.complete) return;
    gauntletState = {
      active: false, complete: false,
      totalTargets: 5, currentIndex: 0,
      results: [], chainTimerStartMs: null,
    };
    __saveGauntletState();
    __hideProgressBadge();
  }

  function __saveGauntletState() {
    try { if (typeof saveRoundState === 'function') saveRoundState(); } catch (e) {}
  }

  function __copperScore() {
    const bases = (typeof GRADE_BASE_SCORES !== 'undefined') ? GRADE_BASE_SCORES : { Copper: 50 };
    return bases.Copper || 50;
  }

  function __individualScore(grade) {
    // Gauntlet individual score = base + difficulty bonus + tool efficiency bonus
    // (no time bonus, no length bonus — gauntlet is always short)
    const bases = (typeof GRADE_BASE_SCORES !== 'undefined') ? GRADE_BASE_SCORES
      : { Diamond: 800, Emerald: 650, Platinum: 500, Gold: 375, Silver: 250, Bronze: 125, Copper: 50 };
    const base = bases[grade] || 50;

    const setup = typeof window.getGameSetupSelection === 'function' ? window.getGameSetupSelection() : null;
    const difficulty = (setup && setup.difficulty) || 'normal';
    const db = (typeof SCORE_DIFFICULTY_BONUS !== 'undefined') ? SCORE_DIFFICULTY_BONUS : { easy: 0, normal: 50, hard: 100 };
    const diffBonus = db[difficulty] || 0;

    const _usedOpts = typeof window.getUsedToolOptionsThisRound === 'function' ? window.getUsedToolOptionsThisRound() : {};
    let toolsUsed = 0;
    for (const [tId, opts] of Object.entries(_usedOpts)) {
      for (const [oId, used] of Object.entries(opts || {})) {
        if (used && !(tId === 'photo' && oId === 'starter')) toolsUsed++;
      }
    }
    const eff = (typeof SCORE_TOOL_EFFICIENCY !== 'undefined') ? SCORE_TOOL_EFFICIENCY : [100, 90, 75, 60, 45, 30, 15, 0];
    const toolBonus = eff[Math.min(toolsUsed, eff.length - 1)] || 0;

    return base + diffBonus + toolBonus;
  }

  function __chainRemainingMs() {
    if (!gauntletState.chainTimerStartMs) return 0;
    const timeLimit = (typeof GAUNTLET_TIME_LIMIT_MS !== 'undefined') ? GAUNTLET_TIME_LIMIT_MS : (90 * 60 * 1000);
    return Math.max(0, gauntletState.chainTimerStartMs + timeLimit - Date.now());
  }

  function __fmtMeters(m) {
    if (m == null || !isFinite(m)) return '—';
    if (m >= 1000) return (m / 1000).toFixed(2) + ' km';
    return Math.round(m) + ' m';
  }

  function __updateProgressBadge() {
    try {
      const badge = document.getElementById('gauntletProgress');
      const text = document.getElementById('gauntletProgressText');
      if (!badge) return;
      const idx = gauntletState.currentIndex + 1;
      const total = gauntletState.totalTargets;
      if (text) text.textContent = idx + ' / ' + total;
      badge.classList.remove('hidden');
    } catch (e) {}
  }

  function __hideProgressBadge() {
    try {
      const badge = document.getElementById('gauntletProgress');
      if (badge) badge.classList.add('hidden');
    } catch (e) {}
  }

  // ---- guesslocked handler ----

  window.addEventListener('guesslocked', function (event) {
    if (!window.isGauntletActive()) return;

    const detail = (event && event.detail) || {};
    const grade = detail.grade || 'Copper';
    const distanceM = (typeof detail.distanceM === 'number') ? detail.distanceM : null;
    const score = __individualScore(grade);

    gauntletState.results.push({
      distanceM: distanceM,
      grade: grade,
      score: score,
      guessLatLng: detail.guessLatLng || null,
      targetLatLng: detail.targetLatLng || null,
    });

    const chainExpired = __chainRemainingMs() <= 0;
    gauntletState.currentIndex++;

    if (chainExpired) {
      const needed = gauntletState.totalTargets - gauntletState.results.length;
      for (let i = 0; i < needed; i++) {
        gauntletState.results.push({ distanceM: null, grade: 'Copper', score: __copperScore(), guessLatLng: null, targetLatLng: null });
      }
      gauntletState.active = false;
      gauntletState.complete = true;
      __saveGauntletState();
      __showGauntletSummary();
      return;
    }

    if (gauntletState.currentIndex >= gauntletState.totalTargets) {
      gauntletState.active = false;
      gauntletState.complete = true;
      __saveGauntletState();
      __showGauntletSummary();
    } else {
      __saveGauntletState();
      __showNextTargetModal(gauntletState.currentIndex, distanceM);
    }
  });

  // ---- Next Target modal ----

  function __showNextTargetModal(completedCount, distanceM) {
    try {
      const modal = document.getElementById('gauntletNextModal');
      const distEl = document.getElementById('gauntletNextDistance');
      const progEl = document.getElementById('gauntletNextProgress');
      const btn    = document.getElementById('btnGauntletNext');
      if (!modal) return;

      if (distEl) distEl.textContent = 'You were ' + __fmtMeters(distanceM) + ' away';
      if (progEl) progEl.textContent = 'Target ' + completedCount + ' of ' + gauntletState.totalTargets + ' complete';

      const isLast = completedCount >= gauntletState.totalTargets;

      if (btn) {
        const newBtn = btn.cloneNode(true);
        btn.parentNode.replaceChild(newBtn, btn);
        const freshBtn = document.getElementById('btnGauntletNext');
        if (freshBtn) {
          freshBtn.textContent = isLast ? 'See Results' : 'Next Target →';
          freshBtn.addEventListener('click', function () {
            modal.classList.add('hidden');
            if (isLast) {
              __showGauntletSummary();
            } else {
              __startNextTarget();
            }
          }, { once: true });
        }
      }

      modal.classList.remove('hidden');
    } catch (e) {}
  }

  function __startNextTarget() {
    try { resetRound({ keepTarget: false }); } catch (e) {}
    try {
      const pl = typeof player !== 'undefined' ? player : window.player;
      if (typeof window.__initRoundStateV1ForNewTarget === 'function' && pl) {
        window.__initRoundStateV1ForNewTarget({ lat: pl.lat, lon: pl.lon }, null);
      }
    } catch (e) {}
    try {
      const badge = document.getElementById('photoGalleryBadge');
      const grid  = document.getElementById('photoGalleryGrid');
      const empty = document.getElementById('photoGalleryEmpty');
      const panel = document.getElementById('panelPhotoGallery');
      if (badge) { badge.textContent = ''; badge.classList.add('hidden'); }
      if (grid)  grid.innerHTML = '';
      if (empty) empty.classList.remove('hidden');
      if (panel) panel.classList.remove('open');
    } catch (e) {}
    try { if (typeof clearRevealOverlay === 'function') clearRevealOverlay(); } catch (e) {}
    try { localStorage.removeItem('mapgame_result_html_v1'); } catch (e) {}
    __updateProgressBadge();
    try { if (typeof pickNewTarget === 'function') pickNewTarget(true); } catch (e) {}
  }

  // ---- Gauntlet Summary modal ----

  function __overallGrade(avgDistM) {
    const d = Math.max(0, avgDistM || Infinity);
    const bands = (typeof GRADE_THRESHOLDS !== 'undefined' && Array.isArray(GRADE_THRESHOLDS)) ? GRADE_THRESHOLDS
      : [
          { label: 'Diamond',  short: 10       },
          { label: 'Emerald',  short: 30       },
          { label: 'Platinum', short: 70       },
          { label: 'Gold',     short: 140      },
          { label: 'Silver',   short: 250      },
          { label: 'Bronze',   short: 400      },
          { label: 'Copper',   short: Infinity },
        ];
    for (const b of bands) {
      const threshold = (typeof b.short === 'number') ? b.short : Infinity;
      if (d <= threshold) return String(b.label);
    }
    return 'Copper';
  }

  const __gradeColors = {
    Diamond: '#a5f3fc', Emerald: '#34d399', Platinum: '#e2e8f0',
    Gold: '#fbbf24', Silver: '#94a3b8', Bronze: '#f97316', Copper: '#ef4444',
  };

  function __showGauntletSummary() {
    try {
      const modal = document.getElementById('gauntletSummaryModal');
      const body  = document.getElementById('gauntletSummaryBody');
      if (!modal || !body) return;

      const results = gauntletState.results;
      const total = gauntletState.totalTargets;

      const validDists = results.filter(r => typeof r.distanceM === 'number' && isFinite(r.distanceM));
      const avgDist = validDists.length > 0 ? (validDists.reduce((s, r) => s + r.distanceM, 0) / validDists.length) : null;
      const sumScores = results.reduce((s, r) => s + (r.score || 0), 0);

      const remainingMs = __chainRemainingMs();
      const timeLimit = (typeof GAUNTLET_TIME_LIMIT_MS !== 'undefined') ? GAUNTLET_TIME_LIMIT_MS : (90 * 60 * 1000);
      const timeBonusMax = (typeof SCORE_TIME_BONUS_MAX !== 'undefined') ? SCORE_TIME_BONUS_MAX : 300;
      const timeBonus = Math.round(timeBonusMax * (remainingMs / timeLimit));

      const overallScore = Math.round(sumScores / total) + timeBonus;
      const overallGrade = avgDist != null ? __overallGrade(avgDist) : 'Copper';
      const overallColor = __gradeColors[overallGrade] || '#94a3b8';

      let rowsHtml = '';
      for (let i = 0; i < total; i++) {
        const r = results[i] || { distanceM: null, grade: 'Copper', score: __copperScore() };
        const gc = __gradeColors[r.grade] || '#94a3b8';
        rowsHtml += `
          <tr>
            <td class="py-1.5 px-2 text-slate-400 text-xs">${i + 1}</td>
            <td class="py-1.5 px-2 text-white text-xs">${__fmtMeters(r.distanceM)}</td>
            <td class="py-1.5 px-2 text-xs font-bold" style="color:${gc}">${r.grade}</td>
            <td class="py-1.5 px-2 text-slate-300 text-xs text-right">${r.score}</td>
          </tr>`;
      }

      const html = `
        <div class="flex flex-col gap-4">
          <div class="text-center">
            <div class="text-3xl font-extrabold" style="color:${overallColor}">${overallGrade}</div>
            <div class="text-sm text-slate-400 mt-1">${avgDist != null ? __fmtMeters(avgDist) + ' average' : 'No valid guesses'}</div>
          </div>
          <table class="w-full border-collapse">
            <thead>
              <tr class="border-b border-[#1e3a5f]">
                <th class="py-1 px-2 text-left text-[10px] uppercase tracking-widest text-slate-500">#</th>
                <th class="py-1 px-2 text-left text-[10px] uppercase tracking-widest text-slate-500">Distance</th>
                <th class="py-1 px-2 text-left text-[10px] uppercase tracking-widest text-slate-500">Grade</th>
                <th class="py-1 px-2 text-right text-[10px] uppercase tracking-widest text-slate-500">Score</th>
              </tr>
            </thead>
            <tbody>${rowsHtml}
              <tr class="border-t border-[#1e3a5f] font-bold">
                <td class="pt-2 px-2 text-slate-400 text-xs" colspan="2">${avgDist != null ? __fmtMeters(avgDist) + ' avg' : '—'}</td>
                <td class="pt-2 px-2 text-xs font-bold" style="color:${overallColor}">${overallGrade}</td>
                <td class="pt-2 px-2 text-white text-xs text-right">${overallScore}</td>
              </tr>
            </tbody>
          </table>
          <div class="flex flex-col gap-1 text-xs text-slate-400 px-1">
            <div class="flex justify-between"><span>Avg target score</span><span>${Math.round(sumScores / total)}</span></div>
            <div class="flex justify-between"><span>Time bonus</span><span>+${timeBonus}</span></div>
            <div class="flex justify-between font-bold text-white border-t border-[#1e3a5f] pt-1 mt-0.5"><span>Overall score</span><span>${overallScore.toLocaleString()} pts</span></div>
          </div>
          <div class="flex gap-2 pt-1">
            <button id="btnGauntletNewGame" class="flex-1 px-4 py-3 rounded-2xl bg-emerald-600 border-0 text-white font-bold text-sm cursor-pointer hover:bg-emerald-500 active:scale-[.98] transition-all duration-150" type="button">New Game</button>
            <button id="btnGauntletSummaryClose" class="px-4 py-3 rounded-2xl bg-[#1e2d44] border border-[#2a3f60] text-gray-300 text-sm cursor-pointer hover:bg-[#253550]" type="button">Close ✕</button>
          </div>
        </div>`;

      body.innerHTML = html;
      try { localStorage.setItem(GAUNTLET_SUMMARY_KEY, html); } catch (e) {}

      // Persist to database (no-op for guests)
      try {
        if (typeof window.saveGauntletRun === 'function') {
          const setup = typeof window.getGameSetupSelection === 'function' ? window.getGameSetupSelection() : null;
          window.saveGauntletRun({
            difficulty:     (setup && setup.difficulty) || 'normal',
            overall_grade:  overallGrade,
            overall_score:  overallScore,
            avg_distance_m: avgDist,
            time_bonus:     timeBonus,
            remaining_ms:   remainingMs,
            elapsed_ms:     gauntletState.chainTimerStartMs ? (Date.now() - gauntletState.chainTimerStartMs) : null,
            target_count:   gauntletState.totalTargets,
            results_json:   gauntletState.results,
          });
        }
      } catch (e) {}

      __wireGauntletSummaryButtons();
      modal.classList.remove('hidden');
    } catch (e) {}
  }

  function __wireGauntletSummaryButtons() {
    try {
      const closeBtn  = document.getElementById('gauntletSummaryClose');
      const newBtn    = document.getElementById('btnGauntletNewGame');
      const closeBtn2 = document.getElementById('btnGauntletSummaryClose');
      if (closeBtn) closeBtn.onclick = __closeGauntletSummary;
      if (closeBtn2) closeBtn2.onclick = __closeGauntletSummary;
      if (newBtn) newBtn.onclick = function () {
        __closeGauntletSummary();
        __deactivateGauntlet();
        try { localStorage.removeItem(GAUNTLET_SUMMARY_KEY); } catch (e) {}
        try { if (typeof window.__resetGameModeToNormal === 'function') window.__resetGameModeToNormal(); } catch (e) {}
        if (typeof window.startNewRound === 'function') window.startNewRound();
      };
    } catch (e) {}
  }

  function __closeGauntletSummary() {
    try {
      const modal = document.getElementById('gauntletSummaryModal');
      if (modal) modal.classList.add('hidden');
    } catch (e) {}
  }

})();
