// ---- Leaflet markers for player + target ----
// Keeps player/target anchored to geography (no pixel drift / vanish on pan).

let leafletTargetMarker = null;
let leafletPlayerMarker = null;
let leafletPlayerAccuracyCircle = null;
let leafletMarkersLayer = null;

// Debug: show all POI pins (independent of target/player)
let leafletPoiLayer = null;
let leafletPoiMarkers = [];
let showAllPoiPins = false;
let __poiMapListenersAttached = false;

function __poiCategoryColor(p) {
  const tag = (k) => (p && p.osm_tags) ? String(p.osm_tags[k] || '').toLowerCase() : '';
  const rw = tag('railway'), station = tag('station'), amenity = tag('amenity'),
        tourism = tag('tourism'), building = tag('building'), leisure = tag('leisure'),
        shop = tag('shop'), historic = tag('historic');

  if (rw === 'station' || rw === 'halt' || rw === 'tram_stop' ||
      station === 'subway' || station === 'light_rail' || station === 'rail' || station === 'monorail')
    return { fillColor: '#f59e0b', color: 'rgba(0,0,0,0.4)' };

  if (amenity === 'bus_station')
    return { fillColor: '#f97316', color: 'rgba(0,0,0,0.4)' };

  if (building === 'cathedral' || building === 'church' || building === 'chapel' || amenity === 'place_of_worship')
    return { fillColor: '#a78bfa', color: 'rgba(0,0,0,0.4)' };

  if (amenity === 'library')
    return { fillColor: '#34d399', color: 'rgba(0,0,0,0.4)' };

  if (tourism === 'museum' || amenity === 'museum')
    return { fillColor: '#60a5fa', color: 'rgba(0,0,0,0.4)' };

  if (leisure === 'park' || leisure === 'garden' || leisure === 'nature_reserve')
    return { fillColor: '#4ade80', color: 'rgba(0,0,0,0.4)' };

  if (['pub', 'bar', 'cafe', 'restaurant', 'fast_food'].includes(amenity))
    return { fillColor: '#fb923c', color: 'rgba(0,0,0,0.4)' };

  if (['hospital', 'clinic', 'doctors', 'pharmacy'].includes(amenity))
    return { fillColor: '#f87171', color: 'rgba(0,0,0,0.4)' };

  if (['school', 'university', 'college'].includes(amenity))
    return { fillColor: '#facc15', color: 'rgba(0,0,0,0.4)' };

  if (['hotel', 'hostel', 'guest_house', 'motel'].includes(tourism))
    return { fillColor: '#e879f9', color: 'rgba(0,0,0,0.4)' };

  if (historic)
    return { fillColor: '#d97706', color: 'rgba(0,0,0,0.4)' };

  if (shop)
    return { fillColor: '#94a3b8', color: 'rgba(0,0,0,0.4)' };

  return { fillColor: '#6b7280', color: 'rgba(0,0,0,0.4)' };
}

function ensurePlayerPane() {
  if (!window.leafletMap) return null;
  if (!window.leafletMap.getPane('playerPane')) {
    const pane = window.leafletMap.createPane('playerPane');
    pane.style.zIndex = '700'; // above blackout cover (650) and all default Leaflet panes
    pane.style.pointerEvents = 'none';
  }
  return window.leafletMap.getPane('playerPane');
}

function ensureLeafletMarkersLayer() {
  if (!window.leafletMap) return false;
  if (!leafletMarkersLayer) {
    leafletMarkersLayer = L.layerGroup().addTo(window.leafletMap);
  }
  return true;
}

function ensureLeafletPoiLayer() {
  if (!window.leafletMap) return false;
  if (!leafletPoiLayer) {
    leafletPoiLayer = L.layerGroup().addTo(window.leafletMap);
  }
  if (!__poiMapListenersAttached) {
    window.leafletMap.on('moveend', rebuildViewportPoiPins);
    window.leafletMap.on('zoomend', rebuildViewportPoiPins);
    __poiMapListenersAttached = true;
  }
  return true;
}

function clearAllPoiPins() {
  try {
    if (!leafletPoiLayer) return;
    leafletPoiMarkers.forEach(m => {
      try { leafletPoiLayer.removeLayer(m); } catch(e) {}
    });
    leafletPoiMarkers = [];
  } catch (e) {
    leafletPoiMarkers = [];
  }
}

function rebuildViewportPoiPins() {
  if (!window.leafletMap) return;
  if (!ensureLeafletPoiLayer()) return;
  clearAllPoiPins();

  const bounds = window.leafletMap.getBounds();
  const list = (Array.isArray(window.POIS) ? window.POIS : []).filter(p =>
    p && typeof p.lat === 'number' && typeof p.lon === 'number' &&
    bounds.contains([p.lat, p.lon])
  );
  if (!list.length) return;

  for (const p of list) {
    const { fillColor, color } = __poiCategoryColor(p);
    const m = L.circleMarker([p.lat, p.lon], {
      radius: 5,
      weight: 1,
      color,
      fillColor,
      fillOpacity: 0.8,
      interactive: true,
    });
    if (p.name) m.bindPopup(p.name);
    m.addTo(leafletPoiLayer);
    leafletPoiMarkers.push(m);
  }
}

function setAllPoiPinsVisible(on) {
  showAllPoiPins = !!on;
  if (!showAllPoiPins) {
    clearAllPoiPins();
    return;
  }
  rebuildAllPoiPins();
}

function syncLeafletTargetMarker() {
  if (!ensureLeafletMarkersLayer()) return;
  if (!target) {
    if (leafletTargetMarker) { leafletMarkersLayer.removeLayer(leafletTargetMarker); leafletTargetMarker = null; }
    return;
  }
  const ll = L.latLng(target.lat, target.lon);
  if (!leafletTargetMarker) {
    // Red target marker (debug-only)
    leafletTargetMarker = L.circleMarker(ll, {
      radius: 8,
      weight: 2,
      fillOpacity: 0.95,
      interactive: false,
    });
    // Set colours (explicit, small & clear)
    leafletTargetMarker.setStyle({ color: "#ffffff", fillColor: "#d22f2f" });
    if (debugMode) leafletTargetMarker.addTo(leafletMarkersLayer);
  } else {
    leafletTargetMarker.setLatLng(ll);
    if (debugMode && !leafletMarkersLayer.hasLayer(leafletTargetMarker)) leafletTargetMarker.addTo(leafletMarkersLayer);
    if (!debugMode && leafletMarkersLayer.hasLayer(leafletTargetMarker)) leafletMarkersLayer.removeLayer(leafletTargetMarker);
  }
}

function syncLeafletPlayerMarker() {
  if (!ensureLeafletMarkersLayer()) return;
  if (!player) {
    if (leafletPlayerMarker) { leafletMarkersLayer.removeLayer(leafletPlayerMarker); leafletPlayerMarker = null; }
    if (leafletPlayerAccuracyCircle) { leafletMarkersLayer.removeLayer(leafletPlayerAccuracyCircle); leafletPlayerAccuracyCircle = null; }
    return;
  }
  const ll = L.latLng(player.lat, player.lon);
  // Accuracy circle intentionally disabled (keeps UI cleaner).
  const acc = null;

  const _ghostActive = typeof window.isCurseActive === 'function' && window.isCurseActive('ghost');
  ensurePlayerPane();
  if (!leafletPlayerMarker) {
    leafletPlayerMarker = L.circleMarker(ll, {
      radius: 7,
      weight: 2,
      fillOpacity: _ghostActive ? 0 : 0.9,
      opacity: _ghostActive ? 0 : 1,
      interactive: false,
      pane: 'playerPane',
    }).addTo(leafletMarkersLayer);
  } else {
    leafletPlayerMarker.setLatLng(ll);
    leafletPlayerMarker.setStyle({
      fillOpacity: _ghostActive ? 0 : 0.9,
      opacity: _ghostActive ? 0 : 1,
    });
    if (!leafletMarkersLayer.hasLayer(leafletPlayerMarker)) leafletPlayerMarker.addTo(leafletMarkersLayer);
  }

  if (false) {
    if (!leafletPlayerAccuracyCircle) {
      leafletPlayerAccuracyCircle = L.circle(ll, {
        radius: acc,
        weight: 1,
        fillOpacity: 0.12,
        interactive: false,
      }).addTo(leafletMarkersLayer);
    } else {
      leafletPlayerAccuracyCircle.setLatLng(ll);
      leafletPlayerAccuracyCircle.setRadius(acc);
      if (!leafletMarkersLayer.hasLayer(leafletPlayerAccuracyCircle)) leafletPlayerAccuracyCircle.addTo(leafletMarkersLayer);
    }
  } else {
    if (leafletPlayerAccuracyCircle) { leafletMarkersLayer.removeLayer(leafletPlayerAccuracyCircle); leafletPlayerAccuracyCircle = null; }
  }
}

// Keep in sync when debugMode toggles (called from UI helpers)
function refreshLeafletMarkersVisibility() {
  syncLeafletTargetMarker();
  syncLeafletPlayerMarker();
  // POI pins are independent of debugMode; refresh if enabled.
  try { rebuildViewportPoiPins(); } catch(e) {}
}

// Expose functions globally so other modules can call them
window.syncLeafletTargetMarker = syncLeafletTargetMarker;

// ---- Phase 2: reveal overlay (guess → target) ----
let __revealLayer = null;

function clearRevealOverlay(){
  try {
    if (__revealLayer && window.leafletMap) window.leafletMap.removeLayer(__revealLayer);
  } catch(e) {}
  __revealLayer = null;
}

function showRevealOverlay({ guess, target }){
  try {
    if (!window.leafletMap || !guess || !target) return;
    clearRevealOverlay();
    const g = L.latLng(+guess.lat, +guess.lon);
    const t = L.latLng(+target.lat, +target.lon);
    ensurePlayerPane(); // ensure playerPane (700) exists so reveal renders above fog (450)
    const grp = L.layerGroup();
    L.polyline([g, t], { weight: 4, opacity: 0.85, pane: 'playerPane' }).addTo(grp);
    L.circleMarker(g, { radius: 7, weight: 2, opacity: 0.9, fillOpacity: 0.5, pane: 'playerPane' }).addTo(grp);
    L.circleMarker(t, { radius: 7, weight: 2, opacity: 0.9, fillOpacity: 0.5, pane: 'playerPane' }).addTo(grp);
    grp.addTo(window.leafletMap);
    __revealLayer = grp;
  } catch(e) {}
}

window.showRevealOverlay = showRevealOverlay;
window.clearRevealOverlay = clearRevealOverlay;
window.syncLeafletPlayerMarker = syncLeafletPlayerMarker;
window.refreshLeafletMarkersVisibility = refreshLeafletMarkersVisibility;

// POI pins
window.setAllPoiPinsVisible = setAllPoiPinsVisible;
window.refreshAllPoiPins = rebuildViewportPoiPins;
