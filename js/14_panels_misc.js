// ---- Panels toggle (gameplay + debug overlays) ----
(() => {
  const panelGameplay = document.getElementById("panelGameplay");
  const panelDebug = document.getElementById("panelDebug");
  const panelCurses = document.getElementById("panelCurses");
  const panelNewGame = document.getElementById("panelNewGame");
  const panelSystem = document.getElementById("panelSystem");
  const panelInfo = document.getElementById("panelInfo");
  const btnGameplay = document.getElementById("btnGameplay");
  const btnDebug = document.getElementById("btnDebug");
  const btnCurses = document.getElementById("btnCurses");
  const btnSystem = document.getElementById("btnSystem");
  const btnInfo = document.getElementById("btnInfo");
  const backdrop = document.getElementById("panelBackdrop");

  const allPanels = [panelGameplay, panelDebug, panelCurses, panelNewGame, panelSystem, panelInfo].filter(Boolean);

  function syncBackdrop() {
    if (!backdrop) return;
    const anyOpen = allPanels.some(p => p.classList.contains("open"));
    backdrop.classList.toggle("active", anyOpen);
  }

  // Watch for direct .classList mutations from other modules (e.g. 02_dom.js)
  const mo = new MutationObserver(syncBackdrop);
  allPanels.forEach(p => mo.observe(p, { attributes: true, attributeFilter: ["class"] }));

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
      }
    });
  }

  // Start hidden (map-first)
  setOpen(panelGameplay, false);
  setOpen(panelDebug, false);
  setOpen(panelCurses, false);
  setOpen(panelNewGame, false);
  setOpen(panelSystem, false);
  setOpen(panelInfo, false);
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

// ---- Back-compat (if older single panel ids exist) ----
(() => {
  const btn = document.getElementById("btnPanel");
  const panel = document.getElementById("panel");
  if (!btn || !panel) return;
  btn.addEventListener("click", () => panel.classList.toggle("open"));
  const x = document.getElementById("btnPanelClose");
  if (x) x.addEventListener("click", () => panel.classList.remove("open"));
})();
