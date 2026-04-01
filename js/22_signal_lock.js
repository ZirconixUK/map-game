(function () {
  // ---- Signal Lock ----
  // Generates N candidate circles on the map. Exactly one contains the target.
  // All others are false leads. Informational overlay only — does not touch fog.

  let __signalLockLayer = null;     // Leaflet LayerGroup
  let __signalLockCircles = [];     // [{ lat, lon, radiusM, isTrue }]

  // ---- Pane ----
  function ensureSignalPane() {
    if (!window.leafletMap) return null;
    let pane = window.leafletMap.getPane('signalPane');
    if (!pane) {
      pane = window.leafletMap.createPane('signalPane');
      // Above fog (450), below player (700)
      pane.style.zIndex = '460';
      pane.style.pointerEvents = 'none';
    }
    return pane;
  }

  function ensureSignalLayer() {
    if (!window.leafletMap) return false;
    ensureSignalPane();
    if (!__signalLockLayer) {
      __signalLockLayer = L.layerGroup({ pane: 'signalPane' }).addTo(window.leafletMap);
    }
    return true;
  }

  // ---- Geo helpers (local wrappers so this module is self-contained) ----
  function _haversine(lat1, lon1, lat2, lon2) {
    if (typeof haversineMeters === 'function') return haversineMeters(lat1, lon1, lat2, lon2);
    const R = 6378137, toR = d => d * Math.PI / 180;
    const dLat = toR(lat2 - lat1), dLon = toR(lon2 - lon1);
    const a = Math.sin(dLat/2)**2 + Math.cos(toR(lat1))*Math.cos(toR(lat2))*Math.sin(dLon/2)**2;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
  }

  function _destination(lat, lon, bearingDeg, distM) {
    if (typeof destinationLatLon === 'function') return destinationLatLon(lat, lon, bearingDeg, distM);
    const R = 6378137, toR = d => d * Math.PI / 180, toD = r => r * 180 / Math.PI;
    const brng = toR(bearingDeg), δ = distM / R;
    const φ1 = toR(lat), λ1 = toR(lon);
    const sinφ2 = Math.sin(φ1)*Math.cos(δ) + Math.cos(φ1)*Math.sin(δ)*Math.cos(brng);
    const φ2 = Math.asin(sinφ2);
    const y2 = Math.sin(brng)*Math.sin(δ)*Math.cos(φ1);
    const x2 = Math.cos(δ) - Math.sin(φ1)*Math.sin(φ2);
    const λ2 = λ1 + Math.atan2(y2, x2);
    return { lat: toD(φ2), lon: ((toD(λ2) + 540) % 360) - 180 };
  }

  // ---- Generation helpers ----
  function _getModeConfig() {
    const mode = (typeof window.getSelectedGameLength === 'function') ? window.getSelectedGameLength() : 'short';
    if (typeof SIGNAL_LOCK_CONFIG_BY_MODE !== 'undefined' && SIGNAL_LOCK_CONFIG_BY_MODE[mode]) {
      return { mode, ...SIGNAL_LOCK_CONFIG_BY_MODE[mode] };
    }
    const fallbacks = {
      short:  { count: 4, radius: 175, heat: 2.0 },
      medium: { count: 4, radius: 250, heat: 2.0 },
      long:   { count: 5, radius: 425, heat: 2.0 },
    };
    return { mode, ...(fallbacks[mode] || fallbacks.short) };
  }

  function _getRoundCenter() {
    const rs = (typeof window.getRoundStateV1 === 'function') ? window.getRoundStateV1() : null;
    if (rs && rs.startLatLng && typeof rs.startLatLng.lat === 'number') return rs.startLatLng;
    if (typeof player !== 'undefined' && player && typeof player.lat === 'number') return { lat: player.lat, lon: player.lon };
    if (typeof target !== 'undefined' && target && typeof target.lat === 'number') return { lat: target.lat, lon: target.lon };
    return null;
  }

  function _getTarget() {
    if (typeof target !== 'undefined' && target && typeof target.lat === 'number') return { lat: target.lat, lon: target.lon };
    return null;
  }

  function _getGameAreaRadius() {
    return (typeof window.getModeTargetRadiusM === 'function') ? window.getModeTargetRadiusM() : 500;
  }

  function _tooClose(candidateLat, candidateLon, placed, minSepM) {
    for (const c of placed) {
      if (_haversine(candidateLat, candidateLon, c.lat, c.lon) < minSepM) return true;
    }
    return false;
  }

  // ---- Circle generation ----
  function generateSignalLockCircles() {
    const cfg = _getModeConfig();
    const tgt = _getTarget();
    const rc  = _getRoundCenter();
    const R   = _getGameAreaRadius();
    const y   = cfg.radius;
    const count = cfg.count;
    const margin = Math.max(50, R * 0.10);
    const maxCenterDistFromRC = R - y - margin;

    if (!tgt) throw new Error('[SignalLock] No target available');
    if (!rc)  throw new Error('[SignalLock] No round center available');

    console.log(`[SignalLock] Generating — mode:${cfg.mode} count:${count} radius:${y}m R:${R}m maxCentDist:${maxCenterDistFromRC.toFixed(0)}m`);
    console.log(`[SignalLock] Target: ${tgt.lat.toFixed(6)}, ${tgt.lon.toFixed(6)}`);
    console.log(`[SignalLock] Round center: ${rc.lat.toFixed(6)}, ${rc.lon.toFixed(6)}`);

    // --- True circle ---
    // Pick a centre offset from the target so the target is inside but not centred.
    let trueCircle = null;
    for (let attempt = 0; attempt < 40; attempt++) {
      const bearing   = Math.random() * 360;
      const offsetDist = Math.random() * y * 0.65;
      const centre    = _destination(tgt.lat, tgt.lon, bearing, offsetDist);
      const distFromTgt = _haversine(centre.lat, centre.lon, tgt.lat, tgt.lon);
      const distFromRC  = _haversine(centre.lat, centre.lon, rc.lat, rc.lon);
      if (distFromTgt <= y && distFromRC <= maxCenterDistFromRC) {
        trueCircle = { lat: centre.lat, lon: centre.lon, radiusM: y, isTrue: true };
        console.log(`[SignalLock] True circle (attempt ${attempt+1}): ${centre.lat.toFixed(6)}, ${centre.lon.toFixed(6)} dist_from_target=${distFromTgt.toFixed(1)}m dist_from_rc=${distFromRC.toFixed(1)}m`);
        break;
      }
    }
    if (!trueCircle) {
      console.warn('[SignalLock] True circle fallback — placing centre on target');
      trueCircle = { lat: tgt.lat, lon: tgt.lon, radiusM: y, isTrue: true };
    }

    const placed = [trueCircle];

    // --- False circles ---
    const sepLevels = [2.4 * y, 2.2 * y, 2.0 * y, 1.8 * y, 1.5 * y];
    const attemptsPerLevel = 300;
    let retryLevel = 0;

    while (placed.length < count) {
      const minSep = sepLevels[retryLevel] || sepLevels[sepLevels.length - 1];
      let found = false;

      for (let i = 0; i < attemptsPerLevel; i++) {
        // Uniform disc sampling
        const r = Math.sqrt(Math.random()) * maxCenterDistFromRC;
        const b = Math.random() * 360;
        const candidate = _destination(rc.lat, rc.lon, b, r);

        const distToTgt  = _haversine(candidate.lat, candidate.lon, tgt.lat, tgt.lon);
        const distFromRC = _haversine(candidate.lat, candidate.lon, rc.lat, rc.lon);

        if (distToTgt  <= y)               continue; // would contain target
        if (distFromRC >  maxCenterDistFromRC) continue; // outside playable area
        if (_tooClose(candidate.lat, candidate.lon, placed, minSep)) continue;

        placed.push({ lat: candidate.lat, lon: candidate.lon, radiusM: y, isTrue: false });
        found = true;
        break;
      }

      if (!found) {
        if (retryLevel < sepLevels.length - 1) {
          retryLevel++;
          console.log(`[SignalLock] Relaxing spacing to ${sepLevels[retryLevel].toFixed(0)}m for circle ${placed.length + 1}`);
        } else {
          // Hard fallback: ignore spacing, just find any valid non-containing position
          console.warn(`[SignalLock] Hard fallback for circle ${placed.length + 1} — relaxing all spacing`);
          let placed2 = false;
          for (let i = 0; i < 2000; i++) {
            const r = Math.sqrt(Math.random()) * maxCenterDistFromRC;
            const b = Math.random() * 360;
            const candidate = _destination(rc.lat, rc.lon, b, r);
            const distToTgt  = _haversine(candidate.lat, candidate.lon, tgt.lat, tgt.lon);
            const distFromRC = _haversine(candidate.lat, candidate.lon, rc.lat, rc.lon);
            if (distToTgt <= y) continue;
            if (distFromRC > maxCenterDistFromRC) continue;
            if (_tooClose(candidate.lat, candidate.lon, placed, y * 0.5)) continue;
            placed.push({ lat: candidate.lat, lon: candidate.lon, radiusM: y, isTrue: false });
            placed2 = true;
            break;
          }
          if (!placed2) {
            // Absolute last resort: fixed bearing from round centre
            const b2 = (360 / count) * placed.length;
            const fallbackDist = Math.min(maxCenterDistFromRC * 0.7, R * 0.4);
            const fc = _destination(rc.lat, rc.lon, b2, fallbackDist);
            const distToTgt2 = _haversine(fc.lat, fc.lon, tgt.lat, tgt.lon);
            if (distToTgt2 > y) {
              placed.push({ lat: fc.lat, lon: fc.lon, radiusM: y, isTrue: false });
              console.warn(`[SignalLock] Absolute fallback circle at bearing ${b2}°`);
            } else {
              const opp = _destination(rc.lat, rc.lon, (b2 + 180) % 360, fallbackDist);
              placed.push({ lat: opp.lat, lon: opp.lon, radiusM: y, isTrue: false });
              console.warn(`[SignalLock] Absolute fallback (opposite bearing) at ${(b2+180)%360}°`);
            }
          }
          retryLevel = 0; // reset for the next circle
        }
      }
    }

    // Log all circles
    placed.forEach((c, i) => {
      const dTgt = _haversine(c.lat, c.lon, tgt.lat, tgt.lon);
      const dRC  = _haversine(c.lat, c.lon, rc.lat, rc.lon);
      console.log(`[SignalLock] Circle ${i}: ${c.lat.toFixed(6)}, ${c.lon.toFixed(6)} r=${c.radiusM}m isTrue=${c.isTrue} dist_to_target=${dTgt.toFixed(1)}m dist_to_rc=${dRC.toFixed(1)}m`);
    });

    // Shuffle so the true circle isn't always index 0
    for (let i = placed.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [placed[i], placed[j]] = [placed[j], placed[i]];
    }

    // Final validation — hard-fail rather than return broken output
    const trueCount            = placed.filter(c => c.isTrue).length;
    const actuallyContainsTgt  = placed.filter(c => _haversine(c.lat, c.lon, tgt.lat, tgt.lon) <= c.radiusM).length;
    console.log(`[SignalLock] Validation: circles=${placed.length} declared-true=${trueCount} actually-contains-target=${actuallyContainsTgt}`);
    if (trueCount !== 1) throw new Error(`[SignalLock] INVARIANT: trueCount=${trueCount}, expected 1`);
    if (actuallyContainsTgt !== 1) throw new Error(`[SignalLock] INVARIANT: actuallyContainsTgt=${actuallyContainsTgt}, expected 1`);
    const trueIdx = placed.findIndex(c => c.isTrue);
    if (trueIdx !== -1) console.log(`[SignalLock] True circle is index ${trueIdx}`);

    return placed;
  }

  // ---- Rendering ----
  function renderSignalLockCircles(circles) {
    if (!window.leafletMap) return;
    if (!ensureSignalLayer()) return;
    __signalLockLayer.clearLayers();
    if (!circles || !circles.length) return;

    circles.forEach((c, i) => {
      const circle = L.circle([c.lat, c.lon], {
        radius: c.radiusM,
        color: '#22d3ee',
        weight: 2,
        opacity: 0.85,
        fillColor: '#22d3ee',
        fillOpacity: 0.10,
        dashArray: '6 4',
        interactive: false,
        pane: 'signalPane',
      });
      circle.bindTooltip(`Signal zone ${i + 1}`, { permanent: false, opacity: 0.85 });
      circle.addTo(__signalLockLayer);
    });
  }

  // ---- State API ----
  window.getSignalLockCircles = function () {
    return __signalLockCircles.slice();
  };

  window.__restoreSignalLockCircles = function (circles) {
    __signalLockCircles = Array.isArray(circles) ? circles : [];
  };

  window.clearSignalLockOverlays = function () {
    __signalLockCircles = [];
    if (__signalLockLayer) __signalLockLayer.clearLayers();
  };

  window.renderSignalLockCircles = renderSignalLockCircles;

  // ---- Main action ----
  window.useSignalLock = function () {
    try {
      const circles = generateSignalLockCircles();
      __signalLockCircles = circles;
      renderSignalLockCircles(circles);
      try { if (typeof saveRoundStateDebounced === 'function') saveRoundStateDebounced(); } catch(e) {}
      console.log('[SignalLock] Circles generated and rendered.');
      return true;
    } catch (e) {
      console.error('[SignalLock] useSignalLock failed:', e);
      try { if (typeof showToast === 'function') showToast('Signal Lock failed — try again.', false); } catch(_) {}
      return false;
    }
  };

})();
