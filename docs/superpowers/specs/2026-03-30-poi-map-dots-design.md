# POI Map Dots — Design Spec

**Date:** 2026-03-30
**Status:** Approved

## Summary

Show all POIs in the current map viewport as colored dots on the Leaflet map. Dots are color-coded by OSM category. Tapping a dot shows the POI name in a popup. This gives players a spatial reference frame when using landmark tools.

---

## Scope

Extend `js/16_leaflet_markers.js` only. No new files. No changes to game logic, scoring, or state.

---

## Layer & Lifecycle

- Remove the `showAllPoiPins = false` default gate. The POI dot layer is always active once the map is ready.
- `rebuildViewportPoiPins()` replaces the role of `rebuildAllPoiPins()`:
  - Clears existing POI markers.
  - Filters `window.POIS` to `window.leafletMap.getBounds()`.
  - Adds a `circleMarker` per visible POI.
- Register `moveend` and `zoomend` listeners on `window.leafletMap` (once, at layer init) to call `rebuildViewportPoiPins()`.
- `window.refreshAllPoiPins` (already called when POIS change) calls `rebuildViewportPoiPins()`.
- POI markers live in `leafletPoiLayer` (overlayPane, z-400) — below fog (z-450) and player (z-700). No pane change needed.

---

## Viewport Culling

```
const bounds = window.leafletMap.getBounds();
const visible = (window.POIS || []).filter(p => bounds.contains([p.lat, p.lon]));
```

Rebuild runs on: POIS change, `moveend`, `zoomend`. No debounce needed — Leaflet fires these events at end of interaction, not continuously.

---

## Category Color Mapping

OSM tags are checked in priority order. First match wins. Unknown tags fall back to grey.

| Category | Color | OSM tag match |
|---|---|---|
| train_station | `#f59e0b` amber | `railway: station/halt/tram_stop`, `station: subway/light_rail/rail` |
| bus_station | `#f97316` orange | `amenity: bus_station` |
| cathedral / place of worship | `#a78bfa` violet | `building: cathedral/church/chapel`, `amenity: place_of_worship` |
| library | `#34d399` emerald | `amenity: library` |
| museum | `#60a5fa` blue | `tourism: museum`, `amenity: museum` |
| park / leisure | `#4ade80` green | `leisure: park/garden/nature_reserve` |
| pub / bar / cafe / restaurant | `#fb923c` warm orange | `amenity: pub/bar/cafe/restaurant/fast_food` |
| hospital / medical | `#f87171` red | `amenity: hospital/clinic/doctors/pharmacy` |
| school / education | `#facc15` yellow | `amenity: school/university/college` |
| hotel / accommodation | `#e879f9` pink | `tourism: hotel/hostel/guest_house/motel` |
| historic | `#d97706` dark amber | `historic: *` (any value) |
| shop | `#94a3b8` slate | `shop: *` (any value) |
| other / unknown | `#6b7280` grey | fallback |

Dot styling: `radius: 5`, `weight: 1`, border `rgba(0,0,0,0.4)`, `fillOpacity: 0.8`, `interactive: true`.

The 5 landmark tool categories use intentionally distinct colors (amber, orange, violet, emerald, blue) so they stand out from the supporting categories.

---

## Tap Interaction

- Each `circleMarker` has `interactive: true`.
- On `click`, bind a Leaflet popup with the POI name: `marker.bindPopup(p.name).openPopup()`.
- Leaflet's default popup behavior: only one open at a time, closes on map click. No custom logic needed.
- Popup styling inherits the existing Leaflet popup CSS (dark theme already in `styles.css` if present, otherwise Leaflet default).

---

## Integration Points

- `rebuildViewportPoiPins()` is called from:
  - `refreshLeafletMarkersVisibility()` (already calls `rebuildAllPoiPins`)
  - `setPoisFromList()` via `window.refreshAllPoiPins`
  - Leaflet `moveend` / `zoomend` listeners (new)
- `setAllPoiPinsVisible()` and the `showAllPoiPins` flag are removed. `window.setAllPoiPinsVisible` becomes a no-op stub — the debug panel in `02_dom.js` references it via a checkbox, which must be preserved per project rules. The stub prevents errors; the checkbox just has no effect since dots are always on.

---

## Out of Scope

- Clustering (no new dependencies)
- Legend UI
- Zoom-level-based dot size changes
- Filtering by category
- Any gameplay mechanic changes
