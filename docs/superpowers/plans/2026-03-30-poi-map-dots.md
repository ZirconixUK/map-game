# POI Map Dots Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show all visible-viewport POIs as color-coded dots on the Leaflet map, always on, with tap-to-show-name popups.

**Architecture:** Extend `js/16_leaflet_markers.js` only. Replace the debug-gated `rebuildAllPoiPins()` with a viewport-culled `rebuildViewportPoiPins()` that colors markers by OSM category and attaches popups. Register `moveend`/`zoomend` listeners on the map once to keep dots in sync with pan/zoom.

**Tech Stack:** Leaflet `circleMarker`, `bindPopup`, `getBounds`, `on('moveend'/'zoomend')`. No new files, no new dependencies.

---

## File Map

| File | Change |
|---|---|
| `js/16_leaflet_markers.js` | All changes. Add `__poiCategoryColor()`, replace `rebuildAllPoiPins` with `rebuildViewportPoiPins`, add map listeners in `ensureLeafletPoiLayer`, make markers interactive with popups, convert `setAllPoiPinsVisible` to no-op stub. |

---

### Task 1: Add `__poiCategoryColor(p)` — OSM tag → color lookup

**Files:**
- Modify: `js/16_leaflet_markers.js` — add function after line 12 (after the module-level vars)

- [ ] **Step 1: Insert the color lookup function**

Add this function immediately after `let showAllPoiPins = false;` (line 12):

```javascript
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
```

- [ ] **Step 2: Verify in browser console**

With the page loaded, run:
```javascript
__poiCategoryColor({ osm_tags: { railway: 'station' } })
// Expected: { fillColor: '#f59e0b', color: 'rgba(0,0,0,0.4)' }

__poiCategoryColor({ osm_tags: { amenity: 'library' } })
// Expected: { fillColor: '#34d399', color: 'rgba(0,0,0,0.4)' }

__poiCategoryColor({ osm_tags: { amenity: 'pub' } })
// Expected: { fillColor: '#fb923c', color: 'rgba(0,0,0,0.4)' }

__poiCategoryColor({})
// Expected: { fillColor: '#6b7280', color: 'rgba(0,0,0,0.4)' }
```

- [ ] **Step 3: Commit**

```bash
git add js/16_leaflet_markers.js
git commit -m "feat: add POI category color lookup by OSM tags"
```

---

### Task 2: Replace `rebuildAllPoiPins` with viewport-culled `rebuildViewportPoiPins`

**Files:**
- Modify: `js/16_leaflet_markers.js` — replace the body of `rebuildAllPoiPins` (lines 52–75)

- [ ] **Step 1: Replace the function**

Replace the entire `rebuildAllPoiPins` function (lines 52–75) with:

```javascript
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
```

- [ ] **Step 2: Verify in browser console**

```javascript
// Manually trigger a rebuild and check dot count:
rebuildViewportPoiPins();
leafletPoiMarkers.length; // should be > 0 if POIS is populated and map is centred on them
```

Pan the map — dots should disappear at the old viewport edge and new ones appear. Tap a dot — popup should show the POI name.

- [ ] **Step 3: Commit**

```bash
git add js/16_leaflet_markers.js
git commit -m "feat: replace rebuildAllPoiPins with viewport-culled rebuildViewportPoiPins"
```

---

### Task 3: Register `moveend`/`zoomend` listeners in `ensureLeafletPoiLayer`

**Files:**
- Modify: `js/16_leaflet_markers.js` — update `ensureLeafletPoiLayer` (lines 32–38) and add a flag variable

- [ ] **Step 1: Add the listener-attached flag after existing module vars**

After `let showAllPoiPins = false;` (now right before `__poiCategoryColor`), add:

```javascript
let __poiMapListenersAttached = false;
```

- [ ] **Step 2: Update `ensureLeafletPoiLayer` to attach listeners once**

Replace the existing `ensureLeafletPoiLayer` function body:

```javascript
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
```

- [ ] **Step 3: Verify in browser**

Load the page. Pan the map — dots should update to match the new viewport. Zoom in/out — dots should refresh. Open browser console and confirm no errors.

- [ ] **Step 4: Commit**

```bash
git add js/16_leaflet_markers.js
git commit -m "feat: attach moveend/zoomend listeners for POI dot viewport refresh"
```

---

### Task 4: Remove `showAllPoiPins` gate, convert `setAllPoiPinsVisible` to no-op, wire always-on

**Files:**
- Modify: `js/16_leaflet_markers.js` — update `setAllPoiPinsVisible`, `refreshLeafletMarkersVisibility`, and exported globals

- [ ] **Step 1: Remove `showAllPoiPins` variable**

Delete the line:
```javascript
let showAllPoiPins = false;
```

- [ ] **Step 2: Replace `setAllPoiPinsVisible` with a no-op stub**

Replace the entire `setAllPoiPinsVisible` function (lines 77–84 in original):

```javascript
function setAllPoiPinsVisible() {
  // no-op: POI dots are always visible. Debug toggle retained for UI compatibility.
}
```

- [ ] **Step 3: Update `refreshLeafletMarkersVisibility`**

The existing function calls `rebuildAllPoiPins` — update it to call `rebuildViewportPoiPins`:

```javascript
function refreshLeafletMarkersVisibility() {
  syncLeafletTargetMarker();
  syncLeafletPlayerMarker();
  try { rebuildViewportPoiPins(); } catch(e) {}
}
```

- [ ] **Step 4: Update the exported globals at the bottom of the file**

Find:
```javascript
window.refreshAllPoiPins = rebuildAllPoiPins;
```
Replace with:
```javascript
window.refreshAllPoiPins = rebuildViewportPoiPins;
```

- [ ] **Step 5: Trigger initial build on first POIS population**

In `js/01_pois.js`, `setPoisFromList` already calls `window.refreshAllPoiPins()` — this now calls `rebuildViewportPoiPins()`, so dots appear automatically when POIS are set. No changes needed in `01_pois.js`.

Verify: after game start, dots should appear without any manual trigger.

- [ ] **Step 6: Update BUILD_ID**

In `js/00_config.js`, update:
```javascript
const BUILD_ID = '2026-03-30.poi-map-dots';
```

- [ ] **Step 7: Commit**

```bash
git add js/16_leaflet_markers.js js/00_config.js
git commit -m "feat: POI map dots always-on with category colors and tap-to-name popups"
```

---

### Task 5: End-to-end verification

- [ ] **Step 1: Load the game and verify dots appear**

- POIS should appear as colored dots on the map immediately when the game starts.
- Pan the map — dots in the new viewport appear, old ones disappear.
- Zoom in — fewer dots (smaller viewport). Zoom out — more dots.

- [ ] **Step 2: Verify category colors**

In the Liverpool area, expect to see:
- Amber dots (`#f59e0b`) at train stations (Lime Street, Central, etc.)
- Violet dots (`#a78bfa`) at churches/cathedrals
- Blue dots (`#60a5fa`) at museums (World Museum, etc.)
- Emerald dots (`#34d399`) at libraries
- Warm orange dots (`#fb923c`) at pubs/cafes

- [ ] **Step 3: Verify tap interaction**

Tap a dot on mobile (or click on desktop). A popup should appear showing the POI name. Tapping elsewhere on the map should dismiss the popup.

- [ ] **Step 4: Verify debug toggle is harmless**

Open the debug panel, toggle the "show all POI pins" checkbox. Dots should remain visible regardless (no-op). No JS errors in console.

- [ ] **Step 5: Verify player/target markers still render above dots**

Player dot (blue, z-700) should always be visible above POI dots (z-400). Target marker in debug mode should also be above POI dots.

- [ ] **Step 6: Push**

```bash
git push
```
