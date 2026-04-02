// ---- Remote Mode ----
// Manages tap-to-move gameplay with a limited move budget.
// Loaded after 21_gauntlet.js; exposes window.isRemoteActive etc.
(function () {

  // ---- Constants (fallbacks if config not loaded) ----
  function _moveBudget() {
    const setup = typeof window.getGameSetupSelection === 'function' ? window.getGameSetupSelection() : null;
    const len = (setup && setup.length) || 'short';
    const budgets = (typeof REMOTE_MOVE_BUDGETS !== 'undefined') ? REMOTE_MOVE_BUDGETS : { short: 15, medium: 20, long: 25 };
    return budgets[len] || 15;
  }

  // ---- State ----
  let remoteState = {
    active: false,
    movesRemaining: 0,
    prevLatLng: null,       // { lat, lon } — last position before most recent tap (for undo)
    undoAvailable: false,   // true after a tap, until used or next tap
    undoUsed: false,        // set true once undo is used; prevents further undos
    undoTimer: null,        // setTimeout handle for hiding undo button
    lastTapCost: null,      // move cost of last tap (1 or 2), used by undo refund
    doublestepActive: false,
    tunnelvisionActive: false,
    shakeyHandsActive: false,
    doublestepTimer: null,
    tunnelvisionTimer: null,
  };

  // Note: persistence goes through saveRoundState() via getRemoteStateForPersistence(),
  // not direct localStorage. No REMOTE_STATE_KEY needed.

  // ---- Public API ----

  window.isRemoteActive = function () {
    const setup = typeof window.getGameSetupSelection === 'function' ? window.getGameSetupSelection() : null;
    return !!(remoteState.active && setup && setup.mode === 'remote');
  };

  window.getMovesRemaining = function () {
    return remoteState.movesRemaining;
  };

  window.getRemoteStateForPersistence = function () {
    if (!remoteState.active) return null;
    return {
      active: remoteState.active,
      movesRemaining: remoteState.movesRemaining,
      undoUsed: remoteState.undoUsed,
      doublestepActive: remoteState.doublestepActive,
      tunnelvisionActive: remoteState.tunnelvisionActive,
      shakeyHandsActive: remoteState.shakeyHandsActive,
    };
  };

  window.restoreRemoteState = function (saved) {
    if (!saved || typeof saved !== 'object' || !saved.active) return;
    remoteState.active              = true;
    remoteState.movesRemaining      = (typeof saved.movesRemaining === 'number') ? saved.movesRemaining : _moveBudget();
    remoteState.undoUsed            = !!(saved.undoUsed);
    remoteState.undoAvailable       = false; // don't show undo button on restore
    remoteState.doublestepActive    = false;
    remoteState.tunnelvisionActive  = false;
    remoteState.shakeyHandsActive   = !!(saved.shakeyHandsActive);
    if (saved.doublestepActive) __setTimedRemoteCurseFlag('doublestepActive', true);
    if (saved.tunnelvisionActive) __setTimedRemoteCurseFlag('tunnelvisionActive', true);
    __attachMapClickHandler();
    __updateMoveCounterUI();
  };

  window.__initRemoteIfNeeded = function () {
    const setup = typeof window.getGameSetupSelection === 'function' ? window.getGameSetupSelection() : null;
    if (!setup || setup.mode !== 'remote') {
      __resetRemoteState();
      return;
    }
    __resetRemoteState();
    remoteState.active = true;
    remoteState.movesRemaining = _moveBudget();
    __attachMapClickHandler();
    __updateMoveCounterUI();
  };

  window.__resetRemoteState = __resetRemoteState;

  // ---- Internal ----

  let __remoteMapClickHandler = null;

  function __consumeSuppressedRemoteTap() {
    if (window.__suppressNextRemoteTapCount && window.__suppressNextRemoteTapCount > 0) {
      window.__suppressNextRemoteTapCount = Math.max(0, window.__suppressNextRemoteTapCount - 1);
      return true;
    }
    return false;
  }

  function __resetRemoteState() {
    remoteState.active             = false;
    remoteState.movesRemaining     = 0;
    remoteState.prevLatLng         = null;
    remoteState.undoAvailable      = false;
    remoteState.undoUsed           = false;
    remoteState.lastTapCost        = null;
    remoteState.doublestepActive   = false;
    remoteState.tunnelvisionActive = false;
    remoteState.shakeyHandsActive  = false;
    if (remoteState.doublestepTimer) { clearTimeout(remoteState.doublestepTimer); remoteState.doublestepTimer = null; }
    if (remoteState.tunnelvisionTimer) { clearTimeout(remoteState.tunnelvisionTimer); remoteState.tunnelvisionTimer = null; }
    if (remoteState.undoTimer) { clearTimeout(remoteState.undoTimer); remoteState.undoTimer = null; }
    __detachMapClickHandler();
    __updateMoveCounterUI();
    __hideUndoButton();
  }

  function __setTimedRemoteCurseFlag(flagName, on) {
    const timerKey = flagName === 'doublestepActive' ? 'doublestepTimer'
      : (flagName === 'tunnelvisionActive' ? 'tunnelvisionTimer' : null);
    if (!timerKey) return;

    remoteState[flagName] = !!on;
    if (remoteState[timerKey]) {
      clearTimeout(remoteState[timerKey]);
      remoteState[timerKey] = null;
    }

    try { if (typeof updateUI === 'function') updateUI(); } catch(e) {}
    try { if (typeof updateHUD === 'function') updateHUD(); } catch(e) {}
    try { if (typeof saveRoundStateDebounced === 'function') saveRoundStateDebounced(); } catch(e) {}

    if (!on) return;

    const dur = (typeof REMOTE_CURSE_DURATION_MS !== 'undefined') ? REMOTE_CURSE_DURATION_MS : 60000;
    remoteState[timerKey] = setTimeout(() => {
      remoteState[flagName] = false;
      remoteState[timerKey] = null;
      try { if (typeof updateUI === 'function') updateUI(); } catch(e) {}
      try { if (typeof updateHUD === 'function') updateHUD(); } catch(e) {}
      try { if (typeof saveRoundStateDebounced === 'function') saveRoundStateDebounced(); } catch(e) {}
    }, dur);
  }

  function __attachMapClickHandler() {
    __detachMapClickHandler();
    if (!window.leafletMap) return;
    __remoteMapClickHandler = function (e) {
      try { window.remoteHandleTap(e.latlng); } catch(err) {}
    };
    try { window.leafletMap.on('click', __remoteMapClickHandler); } catch(e) {}
  }

  function __detachMapClickHandler() {
    if (window.leafletMap && __remoteMapClickHandler) {
      try { window.leafletMap.off('click', __remoteMapClickHandler); } catch(e) {}
    }
    __remoteMapClickHandler = null;
  }

  function __updateMoveCounterUI() {
    const el = document.getElementById('remoteMoveCounter');
    if (!el) return;
    if (!window.isRemoteActive()) {
      el.classList.add('hidden');
      return;
    }
    el.classList.remove('hidden');
    const n = remoteState.movesRemaining;
    el.textContent = `${n}`;
    // Colour: amber at ≤3, red at 0
    if (n === 0) {
      el.style.color = '#f87171';
    } else if (n <= 3) {
      el.style.color = '#fbbf24';
    } else {
      el.style.color = '#a78bfa';
    }
  }

  function __showUndoButton() {
    const btn = document.getElementById('remoteUndoBtn');
    if (!btn) return;
    btn.classList.remove('hidden');
    if (remoteState.undoTimer) clearTimeout(remoteState.undoTimer);
    remoteState.undoTimer = setTimeout(() => {
      __hideUndoButton();
      remoteState.undoTimer = null;
    }, 3000);
  }

  function __hideUndoButton() {
    const btn = document.getElementById('remoteUndoBtn');
    if (btn) btn.classList.add('hidden');
    if (remoteState.undoTimer) { clearTimeout(remoteState.undoTimer); remoteState.undoTimer = null; }
  }

  // ---- Tap handler ----

  window.remoteHandleTap = function (latlng) {
    if (!window.isRemoteActive()) return;
    if (__consumeSuppressedRemoteTap()) return;
    if (window.__suppressRemoteTapUntil && Date.now() < window.__suppressRemoteTapUntil) return;
    const r = typeof window.getRoundStateV1 === 'function' ? window.getRoundStateV1() : null;
    if (r && r.hasGuessed) return; // round already locked

    // Tunnel Vision: reject taps outside 300m of current position
    if (remoteState.tunnelvisionActive) {
      const cur = typeof player !== 'undefined' ? player : null;
      if (cur && typeof cur.lat === 'number') {
        const dist = __haversineM(cur.lat, cur.lon, latlng.lat, latlng.lng);
        if (dist > 300) {
          try { if (typeof window.showToast === 'function') window.showToast('Tunnel Vision — you can only move within 300m.', false, { autoDismissMs: 1500 }); } catch(e) {}
          return;
        }
      }
    }

    const cost = remoteState.doublestepActive ? 2 : 1;
    if (remoteState.movesRemaining < cost) return; // block tap if not enough moves for this cost

    // Save previous position for undo
    const curPlayer = typeof player !== 'undefined' ? player : null;
    remoteState.prevLatLng = curPlayer ? { lat: curPlayer.lat, lon: curPlayer.lon } : null;

    // Deduct cost (cap at 0)
    remoteState.movesRemaining = Math.max(0, remoteState.movesRemaining - cost);
    remoteState.lastTapCost = cost; // store for undo refund

    // Move player — manual:true ensures playerSaved is written to persistence
    try {
      if (typeof setPlayerLatLng === 'function') {
        setPlayerLatLng(latlng.lat, latlng.lng, { source: 'remote-tap', force: true, manual: true });
      }
    } catch(e) {}
    try { if (typeof updateUI === 'function') updateUI(); } catch(e) {}
    try { if (typeof updateHUD === 'function') updateHUD(); } catch(e) {}

    __updateMoveCounterUI();

    // Undo button (only if not already used and position was captured)
    if (!remoteState.undoUsed && remoteState.prevLatLng) {
      if (!remoteState.shakeyHandsActive) {
        remoteState.undoAvailable = true;
        __showUndoButton();
      }
    }

    // Warning at 3
    if (remoteState.movesRemaining === 3) {
      try {
        if (typeof window.showToast === 'function') {
          window.showToast('⚠️ 3 moves remaining!', false, { autoDismissMs: 0 });
        }
      } catch(e) {}
    }

    // Auto lock-in at 0
    if (remoteState.movesRemaining <= 0) {
      __hideUndoButton();
      try {
        window.enqueueToast('No moves left — locking in your position…', false, { autoDismissMs: 1200 })
          .then(() => {
            try { if (typeof window.lockInGuess === 'function') window.lockInGuess({ autoLock: true }); } catch(e) {}
          });
      } catch(e) {
        try { if (typeof window.lockInGuess === 'function') window.lockInGuess({ autoLock: true }); } catch(e2) {}
      }
    }

    try { if (typeof saveRoundStateDebounced === 'function') saveRoundStateDebounced(); } catch(e) {}
  };

  // ---- Undo ----

  window.undoLastMove = function () {
    if (!window.isRemoteActive()) return;
    if (!remoteState.undoAvailable || remoteState.undoUsed || !remoteState.prevLatLng) return;

    remoteState.undoUsed = true;
    remoteState.undoAvailable = false;
    __hideUndoButton();
    // Dismiss the persistent "3 moves remaining" toast if it's showing
    // (undo may restore moves above 3, making the warning stale)
    try { if (typeof window.dismissAllToasts === 'function') window.dismissAllToasts(); } catch(e) {}

    // Refund the actual cost of the last tap
    const refund = (typeof remoteState.lastTapCost === 'number') ? remoteState.lastTapCost : 1;
    remoteState.movesRemaining = Math.min(_moveBudget(), remoteState.movesRemaining + refund);
    remoteState.lastTapCost = null;

    try {
      if (typeof setPlayerLatLng === 'function') {
        setPlayerLatLng(remoteState.prevLatLng.lat, remoteState.prevLatLng.lon, { source: 'remote-undo', force: true, manual: true });
      }
    } catch(e) {}
    remoteState.prevLatLng = null;
    __updateMoveCounterUI();
    try { if (typeof updateUI === 'function') updateUI(); } catch(e) {}
    try { if (typeof updateHUD === 'function') updateHUD(); } catch(e) {}
    try { if (typeof saveRoundStateDebounced === 'function') saveRoundStateDebounced(); } catch(e) {}
  };

  // ---- Remote curse handlers ----

  window.applyRemoteCurse = function (id) {
    if (!window.isRemoteActive()) return;
    switch (id) {
      case 'remote_doublestep':
        __setTimedRemoteCurseFlag('doublestepActive', true);
        try { if (typeof window.showToast === 'function') window.showToast('Double Step — each move costs 2 for 1 minute.', false, { autoDismissMs: 3000 }); } catch(e) {}
        break;
      case 'remote_shakyhands':
        remoteState.shakeyHandsActive = true;
        remoteState.undoAvailable = false;
        __hideUndoButton();
        try { if (typeof window.showToast === 'function') window.showToast('Shaky Hands — undo is disabled for this round.', false, { autoDismissMs: 3000 }); } catch(e) {}
        try { if (typeof saveRoundStateDebounced === 'function') saveRoundStateDebounced(); } catch(e) {}
        break;
      case 'remote_anchored':
        remoteState.movesRemaining = Math.max(0, remoteState.movesRemaining - 3);
        __updateMoveCounterUI();
        try { if (typeof window.showToast === 'function') window.showToast('Anchored — −3 moves.', false, { autoDismissMs: 3000 }); } catch(e) {}
        if (remoteState.movesRemaining === 3) {
          try { if (typeof window.showToast === 'function') window.showToast('⚠️ 3 moves remaining!', false, { autoDismissMs: 0 }); } catch(e) {}
        }
        if (remoteState.movesRemaining <= 0) {
          try {
            window.enqueueToast('No moves left — locking in your position…', false, { autoDismissMs: 1200 })
              .then(() => { try { if (typeof window.lockInGuess === 'function') window.lockInGuess({ autoLock: true }); } catch(e) {} });
          } catch(e) {
            try { if (typeof window.lockInGuess === 'function') window.lockInGuess({ autoLock: true }); } catch(e2) {}
          }
        }
        try { if (typeof saveRoundStateDebounced === 'function') saveRoundStateDebounced(); } catch(e) {}
        break;
      case 'remote_tunnelvision':
        __setTimedRemoteCurseFlag('tunnelvisionActive', true);
        try { if (typeof window.showToast === 'function') window.showToast('Tunnel Vision — movement limited to 300m per tap for 1 minute.', false, { autoDismissMs: 3000 }); } catch(e) {}
        break;
    }
  };

  // ---- Haversine helper ----

  function __haversineM(lat1, lon1, lat2, lon2) {
    const R = 6371000;
    const toRad = (d) => d * Math.PI / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon/2)**2;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
  }

})();
