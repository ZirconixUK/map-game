// ---- Panels toggle (gameplay + debug overlays) ----
(() => {
  const panelGameplay = document.getElementById("panelGameplay");
  const panelDebug = document.getElementById("panelDebug");
  const panelHeat = document.getElementById("panelHeat");
  const panelNewGame = document.getElementById("panelNewGame");
  const panelSystem = document.getElementById("panelSystem");
  const panelCurseSelect = document.getElementById("panelCurseSelect");
  const panelPhotoGallery    = document.getElementById("panelPhotoGallery");
  const panelHowToPlay       = document.getElementById("panelHowToPlay");
  const panelProfile         = document.getElementById("panelProfile");
  const btnPhotoGallery      = document.getElementById("btnPhotoGallery");
  const btnPhotoGalleryClose = document.getElementById("btnPhotoGalleryClose");
  const btnGameplay = document.getElementById("btnGameplay");
  const heatWidget = document.getElementById("heatWidget");
  const btnSystem = document.getElementById("btnSystem");
  const btnDbgSimCurse = document.getElementById("btnDbgSimCurse");
  const backdrop = document.getElementById("panelBackdrop");

  const allPanels = [panelGameplay, panelDebug, panelHeat, panelNewGame, panelSystem, panelCurseSelect, panelPhotoGallery, panelHowToPlay, panelProfile].filter(Boolean);

  function syncBackdrop() {
    if (!backdrop) return;
    const anyOpen = allPanels.some(p => p.classList.contains("open"));
    backdrop.classList.toggle("active", anyOpen);
  }

  // Watch for direct .classList mutations from other modules (e.g. 02_dom.js)
  const mo = new MutationObserver(syncBackdrop);
  allPanels.forEach(p => mo.observe(p, { attributes: true, attributeFilter: ["class"] }));
  syncBackdrop(); // sync initial state in case a panel was opened before this script loaded

  function setOpen(panel, open) {
    if (!panel) return;
    panel.classList.toggle("open", open);
    syncBackdrop();
  }

  // ---- Swipe-down-to-dismiss ----
  // Primary: attached to .panelHandle (touch-action:none) so the browser
  // never competes with scroll.
  // Secondary: attached to the panel body — only activates when the panel
  // is scrolled to the top, so normal content scrolling is unaffected.
  function addSwipeDismiss(panel) {
    const handle = panel.querySelector('.panelHandle');
    if (!handle) return;

    let startY = 0, pointerId = null;
    let lastY = 0, lastT = 0, velocity = 0;

    function onDown(e, source) {
      if (!e.isPrimary) return;
      // Body drags only engage when panel is scrolled to the top
      if (source === 'body' && panel.scrollTop > 2) return;
      // Don't capture pointer events from interactive elements — would swallow clicks on Chrome/desktop
      if (source === 'body' && e.target.closest('button, input, select, a, textarea, [role="button"]')) return;
      startY = e.clientY;
      lastY = e.clientY;
      lastT = e.timeStamp;
      velocity = 0;
      pointerId = e.pointerId;
      source === 'handle' ? handle.setPointerCapture(e.pointerId) : panel.setPointerCapture(e.pointerId);
      panel.style.transition = 'none';
    }

    function onMove(e) {
      if (e.pointerId !== pointerId) return;
      const dy = e.clientY - startY;
      const dt = e.timeStamp - lastT;
      if (dt > 0) velocity = (e.clientY - lastY) / dt;
      lastY = e.clientY;
      lastT = e.timeStamp;
      if (dy > 0) panel.style.transform = `translateX(-50%) translateY(${dy}px)`;
    }

    function onUp(e) {
      if (e.pointerId !== pointerId) return;
      pointerId = null;
      const dy = e.clientY - startY;
      panel.style.transition = '';
      if (dy > panel.offsetHeight * 0.28 || velocity > 0.5) {
        panel.style.transform = `translateX(-50%) translateY(${panel.offsetHeight}px)`;
        setTimeout(() => { panel.style.transform = ''; setOpen(panel, false); }, 280);
      } else {
        panel.style.transform = '';
      }
    }

    function onCancel(e) {
      if (e.pointerId !== pointerId) return;
      pointerId = null;
      panel.style.transform = '';
      panel.style.transition = '';
    }

    handle.addEventListener('pointerdown', (e) => onDown(e, 'handle'));
    handle.addEventListener('pointermove', onMove);
    handle.addEventListener('pointerup', onUp);
    handle.addEventListener('pointercancel', onCancel);

    panel.addEventListener('pointerdown', (e) => onDown(e, 'body'));
    panel.addEventListener('pointermove', onMove);
    panel.addEventListener('pointerup', onUp);
    panel.addEventListener('pointercancel', onCancel);
  }

  allPanels.forEach(addSwipeDismiss);

  if (btnGameplay && panelGameplay) {
    btnGameplay.addEventListener("click", () => {
      const willOpen = !panelGameplay.classList.contains("open");
      setOpen(panelGameplay, willOpen);
      // Optional: don't stack overlays unless you want them
      if (willOpen) {
        setOpen(panelDebug, false);
        setOpen(panelHeat, false);
        setOpen(panelNewGame, false);
        setOpen(panelSystem, false);
        setOpen(panelCurseSelect, false);
        setOpen(panelPhotoGallery, false);
        setOpen(panelProfile, false);

        // Reset gameplay menus when opening so we never land on an empty submenu state
        const gameMenu = document.getElementById("gameMenu");
        const radarMenu = document.getElementById("radarMenu");
        const thermoMenu = document.getElementById("thermoMenu");
        const dirMenu = document.getElementById("dirMenu");
        const landmarkMenu = document.getElementById("landmarkMenu");
        const photoMenu = document.getElementById("photoMenu");
        try {
          if (gameMenu) gameMenu.classList.remove("hidden");
          if (radarMenu) radarMenu.classList.add("hidden");
          if (thermoMenu) thermoMenu.classList.add("hidden");
          if (dirMenu) dirMenu.classList.add("hidden");
          if (landmarkMenu) landmarkMenu.classList.add("hidden");
          if (photoMenu) photoMenu.classList.add("hidden");
        } catch (e) {}

        // Also reset via the shared menu helper if present.
        try { if (typeof showMenu === 'function') showMenu('main'); } catch (e) {}

        // Refresh dynamic affordability/cost badges when opening.
        try { if (typeof updateHUD === 'function') updateHUD(); } catch (e) {}
        try { if (typeof window.updateCostBadgesFromConfig === 'function') window.updateCostBadgesFromConfig(); } catch (e) {}

        // Keep the panel width snug for the icon-only main menu.
        try { if (typeof updateGameplayPanelWidth === "function") updateGameplayPanelWidth(); } catch (e) {}
      }
    });
  }

  // Heat panel toggle (also shows active curses)
  if (heatWidget && panelHeat) {
    heatWidget.addEventListener("click", () => {
      const willOpen = !panelHeat.classList.contains("open");
      setOpen(panelHeat, willOpen);
      if (willOpen) {
        setOpen(panelGameplay, false);
        setOpen(panelDebug, false);
        setOpen(panelNewGame, false);
        setOpen(panelSystem, false);
        setOpen(panelCurseSelect, false);
        setOpen(panelPhotoGallery, false);
        setOpen(panelProfile, false);
        try { if (typeof updateCursesPanel === 'function') updateCursesPanel(); } catch (e) {}
      }
    });
  }

  // System panel toggle
  if (btnSystem && panelSystem) {
    btnSystem.addEventListener("click", () => {
      const willOpen = !panelSystem.classList.contains("open");
      setOpen(panelSystem, willOpen);
      if (willOpen) {
        setOpen(panelGameplay, false);
        setOpen(panelDebug, false);
        setOpen(panelHeat, false);
        setOpen(panelNewGame, false);
        setOpen(panelCurseSelect, false);
        setOpen(panelPhotoGallery, false);
        setOpen(panelHowToPlay, false);
        setOpen(panelProfile, false);
      }
    });
  }

  // How to Play button inside System panel — closes System, opens How to Play
  const btnSystemHowToPlay = document.getElementById("btnSystemHowToPlay");
  if (btnSystemHowToPlay && panelHowToPlay) {
    btnSystemHowToPlay.addEventListener("click", () => {
      setOpen(panelSystem, false);
      setOpen(panelHowToPlay, true);
      setOpen(panelGameplay, false);
      setOpen(panelDebug, false);
      setOpen(panelHeat, false);
      setOpen(panelNewGame, false);
      setOpen(panelCurseSelect, false);
      setOpen(panelPhotoGallery, false);
      setOpen(panelProfile, false);
    });
  }

  // Dev Tools button inside System panel — closes System, opens Debug
  const btnSystemDevTools = document.getElementById("btnSystemDevTools");
  if (btnSystemDevTools && panelDebug) {
    btnSystemDevTools.addEventListener("click", () => {
      setOpen(panelSystem, false);
      setOpen(panelDebug, true);
      setOpen(panelGameplay, false);
      setOpen(panelHeat, false);
      setOpen(panelNewGame, false);
      setOpen(panelCurseSelect, false);
      setOpen(panelPhotoGallery, false);
      setOpen(panelHowToPlay, false);
      setOpen(panelProfile, false);
    });
  }

  // Tapping the backdrop closes all panels
  if (backdrop) {
    backdrop.addEventListener("pointerdown", () => {
      setOpen(panelGameplay, false);
      setOpen(panelDebug, false);
      setOpen(panelHeat, false);
      setOpen(panelNewGame, false);
      setOpen(panelSystem, false);
      setOpen(panelCurseSelect, false);
      setOpen(panelPhotoGallery, false);
      setOpen(panelHowToPlay, false);
      setOpen(panelProfile, false);
    });
  }

  // Photo gallery panel toggle
  if (btnPhotoGallery && panelPhotoGallery) {
    btnPhotoGallery.addEventListener("click", () => {
      const willOpen = !panelPhotoGallery.classList.contains("open");
      allPanels.forEach(p => { if (p !== panelPhotoGallery) setOpen(p, false); });
      setOpen(panelPhotoGallery, willOpen);
      if (willOpen) {
        try { if (typeof window.__buildPhotoGalleryGrid === 'function') window.__buildPhotoGalleryGrid(); } catch(e) {}
      }
    });
  }
  if (btnPhotoGalleryClose && panelPhotoGallery) {
    btnPhotoGalleryClose.addEventListener("click", () => setOpen(panelPhotoGallery, false));
  }
  // Delegated tap on grid items → open full-screen photo modal
  const _galleryGrid = document.getElementById("photoGalleryGrid");
  if (_galleryGrid) {
    _galleryGrid.addEventListener("click", (e) => {
      const item = e.target.closest('.photoGalleryItem');
      if (!item) return;
      const url    = item.dataset.photoUrl    || '';
      const kind   = item.dataset.photoKind   || 'Photo';
      const source = item.dataset.photoSource || null;
      const ctx    = item.dataset.photoContext || 'snapshot';
      // Snapshot photos: always use the same code path as the gameplay menu button.
      // This guarantees it works whether or not the SV cache is warm.
      if (ctx === 'snapshot') {
        try { if (typeof window.showStreetViewGlimpseForTarget === 'function') window.showStreetViewGlimpseForTarget({ context: 'snapshot' }); } catch(e) {}
        return;
      }
      if (!url) return;
      try { if (typeof window.showPhotoInModal === 'function') window.showPhotoInModal(url, kind, source); } catch(e) {}
    });
  }

  // Curse picker panel (debug) — open from btnDbgSimCurse
  if (btnDbgSimCurse && panelCurseSelect) {
    btnDbgSimCurse.addEventListener("click", () => {
      const willOpen = !panelCurseSelect.classList.contains("open");
      setOpen(panelCurseSelect, willOpen);
      if (willOpen) {
        setOpen(panelGameplay, false);
        setOpen(panelDebug, false);
        setOpen(panelHeat, false);
        setOpen(panelNewGame, false);
        setOpen(panelSystem, false);
        // Build the curse list when opening
        try { buildCurseSelectList(); } catch (e) {}
      }
    });
  }

  function buildCurseSelectList() {
    const body = document.getElementById("curseSelectBody");
    if (!body) return;

    const cfg = window.__curseConfig || null;
    // Gather all curses from config, or fall back to known IDs.
    // heatLabel: "Heat N" for exact-tier curses, "Heat N+" for specials with a min threshold.
    const curses = [];
    if (cfg) {
      if (cfg.tiers) {
        for (const k of Object.keys(cfg.tiers)) {
          const c = cfg.tiers[k];
          if (c && c.id) curses.push({ id: c.id, name: c.name || c.id, description: c.description || "", durationMs: c.durationMs || cfg.defaultDurationMs || 300000, heatLabel: `Heat ${k}` });
        }
      }
      if (cfg.special) {
        // Find the minimum heat level (>0 chance) for each special curse's own table.
        const specialTableKeys = { overcharged: "overchargedChanceByHeatLevel", veil: "veilChanceByHeatLevel", blackout: "blackoutChanceByHeatLevel", ghost: "ghostChanceByHeatLevel", timepen_minor: "timePenMinorChanceByHeatLevel", timepen_moderate: "timePenModerateChanceByHeatLevel", timepen_major: "timePenMajorChanceByHeatLevel" };
        for (const k of Object.keys(cfg.special)) {
          const c = cfg.special[k];
          if (!c || !c.id) continue;
          let heatLabel = "";
          const tableKey = specialTableKeys[c.id];
          if (tableKey && cfg[tableKey]) {
            const table = cfg[tableKey];
            const minHeat = [1,2,3,4,5].find(n => (table[String(n)] || 0) > 0);
            if (minHeat != null) heatLabel = `Heat ${minHeat}+`;
          }
          curses.push({ id: c.id, name: c.name || c.id, description: c.description || "", durationMs: c.durationMs || cfg.defaultDurationMs || 300000, heatLabel });
        }
      }
    } else {
      // Fallback hardcoded list matching known curse IDs
      const fallback = [
        { id: "heat1", name: "Accelerant", description: "Every question costs +0.25 extra heat.", durationMs: 300000, heatLabel: "Heat 1" },
        { id: "heat2", name: "Fever Surge", description: "Every question costs +0.5 extra heat.", durationMs: 300000, heatLabel: "Heat 2" },
        { id: "heat3", name: "Compass Rot", description: "N/S/E/W is locked.", durationMs: 300000, heatLabel: "Heat 3" },
        { id: "heat4", name: "Signal Clamp", description: "Radar is limited to 250m.", durationMs: 300000, heatLabel: "Heat 4" },
        { id: "heat5", name: "Burned Lens", description: "Extra photos are blocked.", durationMs: 300000, heatLabel: "Heat 5" },
        { id: "overcharged", name: "Overcharged", description: "Tool use costs time while active.", durationMs: 240000, heatLabel: "Heat 2+" },
        { id: "veil", name: "Veil of Ignorance", description: "The map fades to nothing.", durationMs: 300000, heatLabel: "Heat 3+" },
        { id: "blackout", name: "The Blackout", description: "All visual reference vanishes. Only your position remains.", durationMs: 300000, heatLabel: "Heat 3+" },
        { id: "ghost", name: "Ghost Walk", description: "Your presence fades from the map.", durationMs: 180000, heatLabel: "Heat 3+" },
        { id: "timepen_minor", name: "Time Slip", description: "", durationMs: 0, heatLabel: "Heat 2+" },
        { id: "timepen_moderate", name: "Temporal Bleed", description: "", durationMs: 0, heatLabel: "Heat 3+" },
        { id: "timepen_major", name: "Void Collapse", description: "", durationMs: 0, heatLabel: "Heat 4+" },
      ];
      curses.push(...fallback);
    }

    if (!curses.length) {
      body.innerHTML = '<div class="text-xs text-slate-400">No curses defined.</div>';
      return;
    }

    body.innerHTML = curses.map(c =>
      `<div class="flex items-start justify-between gap-2 py-2 border-b border-[#1e3a5f] last:border-b-0" data-curse-id="${c.id}" data-curse-dur="${c.durationMs}">
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-1.5 leading-snug">
            <span class="text-xs font-semibold text-gray-200 truncate">${c.name}</span>
            ${c.heatLabel ? `<span class="flex-shrink-0 text-[10px] font-semibold text-purple-400 bg-purple-900/40 border border-purple-700/50 rounded px-1 py-px">${c.heatLabel}</span>` : ''}
          </div>
          <div class="text-[11px] text-slate-400 leading-snug mt-0.5">${c.description}</div>
        </div>
        <button class="btnApplyCurse flex-shrink-0 px-2 py-1 rounded-lg border border-[#2a3f60] bg-[#1e2d44] text-gray-300 text-[11px] font-semibold cursor-pointer hover:bg-[#253550] transition-colors" type="button" aria-label="Apply ${c.name}">Apply</button>
      </div>`
    ).join('');
  }

  // Delegated handler for Apply buttons in the curse picker
  const curseSelectBody = document.getElementById("curseSelectBody");
  if (curseSelectBody) {
    curseSelectBody.addEventListener("click", (e) => {
      const btn = e.target.closest(".btnApplyCurse");
      if (!btn) return;
      const row = btn.closest("[data-curse-id]");
      if (!row) return;
      const id = row.dataset.curseId;
      const dur = parseInt(row.dataset.curseDur, 10) || 300000;
      try {
        if (typeof window.applyCurse === "function") {
          const result = window.applyCurse(id, { durationMs: dur });
          if (result && result.curse && typeof showToast === "function") {
            const c = result.curse;
            if (c.penaltyAppliedMs > 0) {
              // Instant time-penalty curse — show amount lost, not a duration
              const s = Math.round(c.penaltyAppliedMs / 1000);
              const label = s >= 60 ? `${Math.floor(s/60)}m${s%60?' '+s%60+'s':''}`.trim() : `${s}s`;
              showToast(`<b>${c.name}</b> — <span class="text-red-400">⏱ ${label} lost from your timer.</span>`, false, { kind: 'curse' });
            } else {
              const descPart = c.description ? `<br><span style="opacity:.8">${c.description}</span>` : '';
              showToast(`You've been cursed: <b>${c.name}</b>${descPart}`, false, { kind: 'curse' });
            }
          }
        }
      } catch (e) {}
      setOpen(panelCurseSelect, false);
    });
  }

  // Start hidden (map-first)
  setOpen(panelGameplay, false);
  setOpen(panelDebug, false);
  setOpen(panelHeat, false);
  setOpen(panelNewGame, false);
  setOpen(panelSystem, false);
  setOpen(panelCurseSelect, false);
  setOpen(panelHowToPlay, false);
  setOpen(panelProfile, false);

  // Profile panel — open from System panel button
  const btnSystemProfileLink = document.getElementById("systemProfileLink");
  const btnProfileClose = document.getElementById("btnProfileClose");
  if (btnSystemProfileLink && panelProfile) {
    btnSystemProfileLink.addEventListener("click", () => {
      setOpen(panelSystem, false);
      setOpen(panelGameplay, false);
      setOpen(panelDebug, false);
      setOpen(panelHeat, false);
      setOpen(panelNewGame, false);
      setOpen(panelCurseSelect, false);
      setOpen(panelPhotoGallery, false);
      setOpen(panelHowToPlay, false);
      setOpen(panelProfile, true);
      try { if (typeof window.__loadProfilePanel === 'function') window.__loadProfilePanel(); } catch(e) {}
    });
  }
  if (btnProfileClose && panelProfile) {
    btnProfileClose.addEventListener("click", () => setOpen(panelProfile, false));
  }
})();


// ---- Profile panel data loading ----
(() => {
  const GRADE_COLORS = {
    Diamond: '#a5f3fc', Emerald: '#34d399', Platinum: '#e2e8f0',
    Gold: '#fbbf24', Silver: '#94a3b8', Bronze: '#f97316', Copper: '#ef4444',
  };
  const GRADE_ORDER = ['Diamond','Emerald','Platinum','Gold','Silver','Bronze','Copper'];
  const ALL_ACHIEVEMENTS = [
    { id: 'first_round',   name: 'First Steps',   desc: 'Complete any round' },
    { id: 'first_diamond', name: 'Diamond Hunter', desc: 'Score a Diamond grade' },
    { id: 'no_tools',      name: 'Naked Eye',      desc: 'Complete a round using no tools' },
    { id: 'ten_rounds',    name: 'Committed',      desc: 'Complete 10 rounds' },
    { id: 'hard_diamond',  name: 'Elite',          desc: 'Diamond on Hard difficulty' },
    { id: 'long_run',      name: 'The Long Walk',  desc: 'Complete a Long round' },
  ];

  function fmtDist(m) {
    if (m == null) return '—';
    return m >= 1000 ? (m / 1000).toFixed(1) + ' km' : Math.round(m) + ' m';
  }
  function fmtDate(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { day:'numeric', month:'short', year:'numeric' });
  }
  function initials(name) {
    return (name || '').split(/\s+/).map(p => p[0]).join('').slice(0, 2).toUpperCase() || '?';
  }
  function showGuest() {
    const player = document.getElementById('profilePanelPlayer');
    if (player) player.innerHTML = '<div class="text-xs text-slate-400 leading-snug">Sign in to see your profile and round history.<br><a href="./login.html" class="text-cyan-400 underline mt-1 inline-block">Sign in</a></div>';
    ['ppStatRounds','ppStatBestScore','ppStatBestGrade','ppStatAvgDist'].forEach(id => {
      const el = document.getElementById(id); if (el) el.textContent = '—';
    });
    const ach = document.getElementById('ppAchievements');
    if (ach) ach.innerHTML = '<div class="text-xs text-slate-400 col-span-2">Sign in to track achievements.</div>';
    const hist = document.getElementById('ppHistory');
    if (hist) hist.innerHTML = '<div class="text-xs text-slate-400">No history yet.</div>';
  }

  window.__loadProfilePanel = async function() {
    try {
    if (!window.__supabase) { showGuest(); return; }
    const { data: { session } } = await window.__supabase.auth.getSession().catch(() => ({ data: { session: null } }));
    if (!session) { showGuest(); return; }

    const user = session.user;
    const meta = user.user_metadata || {};

    // Player row
    const player = document.getElementById('profilePanelPlayer');
    if (player) {
      const avatarInner = meta.avatar_url
        ? `<img src="${meta.avatar_url}" alt="" style="width:100%;height:100%;object-fit:cover;">`
        : initials(meta.full_name || user.email || '');
      player.innerHTML = `
        <div style="width:44px;height:44px;border-radius:50%;background:#1e3a5f;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:1.1rem;color:#67e8f9;flex-shrink:0;overflow:hidden;">${avatarInner}</div>
        <div>
          <div class="text-sm font-bold text-white">${meta.full_name || 'Player'}</div>
          <div class="text-xs text-slate-500 mt-0.5">${user.email || ''}</div>
        </div>`;
    }

    // Fetch rounds + achievements in parallel; gauntlet_runs is optional (table may not exist yet)
    const [roundsResult, earnedResult, gauntletResult] = await Promise.all([
      window.__supabase.from('rounds').select('*').eq('user_id', user.id).order('played_at', { ascending: false }).catch(() => ({ data: null })),
      window.__supabase.from('user_achievements').select('achievement_id').eq('user_id', user.id).catch(() => ({ data: null })),
      window.__supabase.from('gauntlet_runs').select('*').eq('user_id', user.id).order('played_at', { ascending: false }).catch(() => ({ data: null })),
    ]);
    const [{ data: rounds }, { data: earnedRows }, { data: gauntletRuns }] = [roundsResult, earnedResult, gauntletResult];
    const rs = rounds || [];
    const gauntletAsRounds = (gauntletRuns || []).map(g => ({
      grade_label:  g.overall_grade,
      target_name:  'Gauntlet',
      distance_m:   g.avg_distance_m,
      score_total:  g.overall_score,
      game_length:  null,
      played_at:    g.played_at,
    }));
    const allHistory = [...rs, ...gauntletAsRounds].sort((a, b) => new Date(b.played_at) - new Date(a.played_at));

    // Stats
    const scores = rs.map(r => r.score_total).filter(v => v != null);
    const el = (id) => document.getElementById(id);
    if (el('ppStatRounds')) el('ppStatRounds').textContent = rs.length;
    if (el('ppStatBestScore')) el('ppStatBestScore').textContent = scores.length ? Math.max(...scores).toLocaleString() : '—';
    const bestIdx = rs.reduce((best, r) => {
      const idx = GRADE_ORDER.indexOf(r.grade_label);
      return (idx !== -1 && (best === -1 || idx < best)) ? idx : best;
    }, -1);
    if (el('ppStatBestGrade') && bestIdx !== -1) {
      const g = GRADE_ORDER[bestIdx];
      el('ppStatBestGrade').textContent = g;
      el('ppStatBestGrade').style.color = GRADE_COLORS[g] || '#67e8f9';
    }
    const dists = rs.map(r => r.distance_m).filter(v => v != null);
    if (el('ppStatAvgDist')) el('ppStatAvgDist').textContent = dists.length ? fmtDist(dists.reduce((a, b) => a + b, 0) / dists.length) : '—';

    // Achievements
    const earnedSet = new Set((earnedRows || []).map(r => r.achievement_id));
    if (el('ppAchievements')) {
      el('ppAchievements').innerHTML = ALL_ACHIEVEMENTS.map(a => `
        <div style="padding:10px;background:#0f1729;border:1px solid ${earnedSet.has(a.id) ? '#4ade80' : '#1e3a5f'};border-radius:10px;opacity:${earnedSet.has(a.id) ? '1' : '0.35'};">
          <div class="text-xs font-bold" style="color:${earnedSet.has(a.id) ? '#4ade80' : '#f1f5f9'};">${a.name}</div>
          <div class="text-[10px] text-slate-400 mt-0.5">${a.desc}</div>
        </div>`).join('');
    }

    // History
    if (el('ppHistory')) {
      if (!allHistory.length) {
        el('ppHistory').innerHTML = '<div class="text-xs text-slate-400">No rounds yet — get out there.</div>';
      } else {
        el('ppHistory').innerHTML = allHistory.slice(0, 20).map(r => {
          const gc = GRADE_COLORS[r.grade_label] || '#94a3b8';
          return `<div style="display:flex;align-items:center;gap:10px;padding:10px 12px;background:#0f1729;border:1px solid #1e3a5f;border-radius:12px;">
            <div style="font-size:0.8rem;font-weight:700;min-width:56px;color:${gc};">${r.grade_label || '—'}</div>
            <div style="flex:1;min-width:0;">
              <div class="text-xs font-semibold text-slate-200 truncate">${r.target_name || 'Random target'}</div>
              <div class="text-[10px] text-slate-500 mt-0.5"><span style="color:#7a9e7e">${fmtDist(r.distance_m)}</span> · <span style="color:#9b8fb5">${r.game_length || ''}</span> · <span style="color:#b5956b">${fmtDate(r.played_at)}</span></div>
            </div>
            <div class="font-mono text-xs font-bold text-slate-400 flex-shrink-0">${r.score_total != null ? r.score_total.toLocaleString() : '—'}</div>
          </div>`;
        }).join('');
      }
    }
    } catch(e) { console.error('[profile] load failed:', e); showGuest(); }
  };
})();


// ---- Timer widget tap — show info toast ----
(() => {
  const timerWidget = document.getElementById('timerWidget');
  if (!timerWidget) return;
  timerWidget.addEventListener('click', () => {
    try {
      const over = (typeof window.isRoundOver === 'function') ? window.isRoundOver() : false;
      if (over) {
        const _gauntletDone = typeof window.isGauntletComplete === 'function' && window.isGauntletComplete();
        if (_gauntletDone && typeof window.reopenGauntletSummary === 'function') {
          window.reopenGauntletSummary();
        } else if (typeof window.reopenResultModal === 'function') {
          window.reopenResultModal();
        }
      } else {
        if (typeof showToast === 'function') {
          showToast('Find the target before the timer runs out — once this reaches zero, your location will be locked in for scoring.', true);
        }
      }
    } catch(e) {}
  });
})();

// ---- Welcome / entry modal ----
// The no-save case is handled immediately in index.html start() before scripts load.
// This function handles the timed-out game case, where a save existed but init()
// determined it had expired — so the early check didn't show the modal.
window.__showWelcomeModal = function() {
  if (window.__welcomeShownEarly) return; // already shown and wired

  const welcomeModal = document.getElementById('welcomeModal');
  if (!welcomeModal) return;

  const panelNewGame = document.getElementById('panelNewGame');

  // For the timed-out case, the player is a known returning player.
  const c = document.getElementById('welcomeContentReturn');
  if (c) c.classList.remove('hidden');
  const note = window.__timedOutPreviousGame ? document.getElementById('welcomeTimedOutNote') : null;
  if (note) note.classList.remove('hidden');
  window.__timedOutPreviousGame = false;

  function openNewGamePanel() {
    welcomeModal.classList.add('hidden');
    if (c) c.classList.add('hidden');
    if (note) note.classList.add('hidden');
    window.__suppressAutoNewGame = false;
    window.__needsNewGameSetup = false;
    if (panelNewGame) panelNewGame.classList.add('open');
  }
  const btn = document.getElementById('btnWelcomeStartReturn');
  if (btn) btn.addEventListener('click', openNewGamePanel, { once: true });

  welcomeModal.classList.remove('hidden');
};

// ---- Back-compat (if older single panel ids exist) ----
(() => {
  const btn = document.getElementById("btnPanel");
  const panel = document.getElementById("panel");
  if (!btn || !panel) return;
  btn.addEventListener("click", () => panel.classList.toggle("open"));
  const x = document.getElementById("btnPanelClose");
  if (x) x.addEventListener("click", () => panel.classList.remove("open"));
})();
