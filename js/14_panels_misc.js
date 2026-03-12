// ---- Panels toggle (gameplay + debug overlays) ----
(() => {
  const panelGameplay = document.getElementById("panelGameplay");
  const panelDebug = document.getElementById("panelDebug");
  const panelCurses = document.getElementById("panelCurses");
  const panelNewGame = document.getElementById("panelNewGame");
  const btnGameplay = document.getElementById("btnGameplay");
  const btnDebug = document.getElementById("btnDebug");
  const btnCurses = document.getElementById("btnCurses");
  const backdrop = document.getElementById("panelBackdrop");

  const allPanels = [panelGameplay, panelDebug, panelCurses, panelNewGame].filter(Boolean);

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
  function addSwipeDismiss(panel) {
    let startY = 0, startScrollTop = 0;
    let dragging = false, pointerId = null;
    let lastY = 0, lastT = 0, velocity = 0;

    panel.addEventListener('pointerdown', (e) => {
      if (!e.isPrimary) return;
      startY = e.clientY;
      startScrollTop = panel.scrollTop;
      dragging = false;
      pointerId = e.pointerId;
      lastY = e.clientY;
      lastT = e.timeStamp;
      velocity = 0;
    }, { passive: true });

    panel.addEventListener('pointermove', (e) => {
      if (e.pointerId !== pointerId) return;
      const dy = e.clientY - startY;
      const dt = e.timeStamp - lastT;
      if (dt > 0) velocity = (e.clientY - lastY) / dt;
      lastY = e.clientY;
      lastT = e.timeStamp;

      // Only engage if dragging downward from a non-scrolled position
      if (!dragging) {
        if (dy > 10 && startScrollTop === 0) {
          dragging = true;
          try { panel.setPointerCapture(e.pointerId); } catch (_) {}
        } else {
          return;
        }
      }

      panel.style.transform = `translateX(-50%) translateY(${Math.max(0, dy)}px)`;
      panel.style.transition = 'none';
      e.preventDefault();
    }, { passive: false });

    function finish(e) {
      if (e.pointerId !== pointerId) return;
      if (!dragging) { pointerId = null; return; }
      dragging = false;
      pointerId = null;
      const dy = e.clientY - startY;
      panel.style.transition = '';
      if (dy > panel.offsetHeight * 0.28 || velocity > 0.5) {
        // Fling off-screen then close
        panel.style.transform = `translateX(-50%) translateY(${panel.offsetHeight}px)`;
        setTimeout(() => {
          panel.style.transform = '';
          setOpen(panel, false);
        }, 300);
      } else {
        // Snap back
        panel.style.transform = '';
      }
    }

    panel.addEventListener('pointerup', finish);
    panel.addEventListener('pointercancel', (e) => {
      if (e.pointerId !== pointerId) return;
      dragging = false;
      pointerId = null;
      panel.style.transform = '';
      panel.style.transition = '';
    });
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
        try { if (typeof updateCursesPanel === 'function') updateCursesPanel(); } catch (e) {}
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
      }
    });
  }

  // Start hidden (map-first)
  setOpen(panelGameplay, false);
  setOpen(panelDebug, false);
  setOpen(panelCurses, false);
  setOpen(panelNewGame, false);
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
