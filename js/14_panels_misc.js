// ---- Panels toggle (gameplay + debug overlays) ----
(() => {
  const panelGameplay = document.getElementById("panelGameplay");
  const panelDebug = document.getElementById("panelDebug");
  const panelCurses = document.getElementById("panelCurses");
  const panelNewGame = document.getElementById("panelNewGame");
  const panelSystem = document.getElementById("panelSystem");
  const panelInfo = document.getElementById("panelInfo");
  const panelCurseSelect = document.getElementById("panelCurseSelect");
  const panelPhotoGallery    = document.getElementById("panelPhotoGallery");
  const btnPhotoGallery      = document.getElementById("btnPhotoGallery");
  const btnPhotoGalleryClose = document.getElementById("btnPhotoGalleryClose");
  const btnGameplay = document.getElementById("btnGameplay");
  const btnDebug = document.getElementById("btnDebug");
  const btnCurses = document.getElementById("btnCurses");
  const btnSystem = document.getElementById("btnSystem");
  const btnInfo = document.getElementById("btnInfo");
  const btnDbgSimCurse = document.getElementById("btnDbgSimCurse");
  const backdrop = document.getElementById("panelBackdrop");

  const allPanels = [panelGameplay, panelDebug, panelCurses, panelNewGame, panelSystem, panelInfo, panelCurseSelect, panelPhotoGallery].filter(Boolean);

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
        setOpen(panelCurses, false);
        setOpen(panelNewGame, false);
        setOpen(panelInfo, false);
        setOpen(panelCurseSelect, false);

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

  // Curses panel toggle
  if (btnCurses && panelCurses) {
    btnCurses.addEventListener("click", () => {
      const willOpen = !panelCurses.classList.contains("open");
      setOpen(panelCurses, willOpen);
      if (willOpen) {
        setOpen(panelGameplay, false);
        setOpen(panelDebug, false);
        setOpen(panelNewGame, false);
        setOpen(panelSystem, false);
        setOpen(panelInfo, false);
        setOpen(panelCurseSelect, false);
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
        setOpen(panelCurses, false);
        setOpen(panelNewGame, false);
        setOpen(panelInfo, false);
        setOpen(panelCurseSelect, false);
      }
    });
  }

  // Tapping the backdrop closes all panels
  if (backdrop) {
    backdrop.addEventListener("pointerdown", () => {
      setOpen(panelGameplay, false);
      setOpen(panelDebug, false);
      setOpen(panelCurses, false);
      setOpen(panelNewGame, false);
      setOpen(panelSystem, false);
      setOpen(panelInfo, false);
      setOpen(panelCurseSelect, false);
      setOpen(panelPhotoGallery, false);
    });
  }

  if (btnDebug && panelDebug) {
    btnDebug.addEventListener("click", () => {
      const willOpen = !panelDebug.classList.contains("open");
      setOpen(panelDebug, willOpen);
      if (willOpen) {
        setOpen(panelGameplay, false);
        setOpen(panelCurses, false);
        setOpen(panelNewGame, false);
        setOpen(panelSystem, false);
        setOpen(panelInfo, false);
        setOpen(panelCurseSelect, false);
      }
    });
  }

  // Info panel toggle
  if (btnInfo && panelInfo) {
    btnInfo.addEventListener("click", () => {
      const willOpen = !panelInfo.classList.contains("open");
      setOpen(panelInfo, willOpen);
      if (willOpen) {
        setOpen(panelGameplay, false);
        setOpen(panelDebug, false);
        setOpen(panelCurses, false);
        setOpen(panelNewGame, false);
        setOpen(panelSystem, false);
        setOpen(panelCurseSelect, false);
      }
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
        setOpen(panelCurses, false);
        setOpen(panelNewGame, false);
        setOpen(panelSystem, false);
        setOpen(panelInfo, false);
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
        const specialTableKeys = { overcharged: "overchargedChanceByHeatLevel", veil: "veilChanceByHeatLevel", blackout: "blackoutChanceByHeatLevel", ghost: "ghostChanceByHeatLevel" };
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
        { id: "heat1", name: "Accelerant", description: "Every question costs +0.25 extra heat for 5 minutes.", durationMs: 300000, heatLabel: "Heat 1" },
        { id: "heat2", name: "Fever Surge", description: "Every question costs +0.5 extra heat for 5 minutes.", durationMs: 300000, heatLabel: "Heat 2" },
        { id: "heat3", name: "Compass Rot", description: "N/S/E/W is locked for 5 minutes.", durationMs: 300000, heatLabel: "Heat 3" },
        { id: "heat4", name: "Signal Clamp", description: "Radar is limited to 250m for 5 minutes.", durationMs: 300000, heatLabel: "Heat 4" },
        { id: "heat5", name: "Burned Lens", description: "Extra photos are blocked for 5 minutes.", durationMs: 300000, heatLabel: "Heat 5" },
        { id: "overcharged", name: "Overcharged", description: "Tool use costs time while active.", durationMs: 240000, heatLabel: "Heat 2+" },
        { id: "veil", name: "Veil of Ignorance", description: "The map fades to nothing.", durationMs: 300000, heatLabel: "Heat 3+" },
        { id: "blackout", name: "The Blackout", description: "All visual reference vanishes. Only your position remains.", durationMs: 300000, heatLabel: "Heat 3+" },
        { id: "ghost", name: "Ghost Walk", description: "Your presence fades from the map.", durationMs: 180000, heatLabel: "Heat 3+" },
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
            const durMins = Math.round(dur / 60000);
            const descPart = c.description ? `<br><span style="opacity:.8">${c.description}</span>` : `<br><span class="muted">(${durMins} minutes)</span>`;
            showToast(`You've been cursed: <b>${c.name}</b>${descPart}`, false, { kind: 'curse' });
          }
        }
      } catch (e) {}
      setOpen(panelCurseSelect, false);
    });
  }

  // Start hidden (map-first)
  setOpen(panelGameplay, false);
  setOpen(panelDebug, false);
  setOpen(panelCurses, false);
  setOpen(panelNewGame, false);
  setOpen(panelSystem, false);
  setOpen(panelInfo, false);
  setOpen(panelCurseSelect, false);
})();


// ---- Timer widget tap — show info toast ----
(() => {
  const timerWidget = document.getElementById('timerWidget');
  if (!timerWidget) return;
  timerWidget.addEventListener('click', () => {
    try {
      const over = (typeof window.isRoundOver === 'function') ? window.isRoundOver() : false;
      if (over) {
        if (typeof window.reopenResultModal === 'function') window.reopenResultModal();
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
