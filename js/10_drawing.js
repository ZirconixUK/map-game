// ---- Drawing ----
let rafPending = false;
function drawThrottled() {
  if (rafPending) return;
  rafPending = true;
  requestAnimationFrame(() => {
    rafPending = false;
    draw();
  });
}
window.drawThrottled = drawThrottled;


function getLeafletFogTransform() {
  if (!window.leafletMap || !window.FOG_TL || typeof window.FOG_ZF !== "number") return null;

  const map = window.leafletMap;
  const z = map.getZoom();

  // Scale from our fixed fog zoom (FOG_ZF) into current zoom space
  const scaleCss = Math.pow(2, z - window.FOG_ZF);

  // Leaflet pans by translating its internal map pane; getPixelOrigin() can stay stable while panning.
  // getPixelBounds().min gives the projected pixel coord of the current viewport top-left and DOES move with pan.
  const topLeft = map.getPixelBounds().min;

  // Where the fog-world top-left lands in container CSS pixels
  const dxCss = window.FOG_TL.x * scaleCss - topLeft.x;
  const dyCss = window.FOG_TL.y * scaleCss - topLeft.y;

  // Our overlay canvas is in device pixels, Leaflet math is in CSS pixels => convert using DPR.
  const dpr = window.devicePixelRatio || 1;

  return {
    scale: scaleCss,
    scaleDpr: scaleCss * dpr,
    dx: dxCss,
    dy: dyCss,
    dxDpr: dxCss * dpr,
    dyDpr: dyCss * dpr,
    dpr
  };
}

function draw() {
  resizeCanvasToDisplaySize();
  const __t = getLeafletFogTransform();
  if (__t) { view.scale = __t.scale; view.tx = __t.dxDpr; view.ty = __t.dyDpr; }
  if (!mapReady) {
    resizeCanvasToDisplaySize();
    ctx.clearRect(0,0,canvas.width,canvas.height);
    ctx.fillStyle = "rgba(255,255,255,.85)";
    ctx.font = `${Math.max(12, Math.round(12*(window.devicePixelRatio||1)))}px system-ui`;
    const msg = (typeof mapError === "string" && mapError) ? mapError : "Loading map...";
    ctx.fillText(msg, 20, 30);
    ctx.fillStyle = "rgba(255,255,255,.55)";
    ctx.fillText("Tip: Leaflet tiles require internet (or swap in an ImageOverlay basemap).", 20, 52);
    return;
  }

  // base clear
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Veil curse: hide canvas overlay + fog layer. Blackout: hide everything + show solid black cover.
  const _veilOn = typeof window.isCurseActive === 'function' && window.isCurseActive('veil');
  const _blackoutOn = typeof window.isCurseActive === 'function' && window.isCurseActive('blackout');

  // Canvas overlay (both curses)
  canvas.style.opacity = (_veilOn || _blackoutOn) ? '0' : '';

  // Fog layer: veil and blackout both hide fog clue info
  try {
    if (typeof window.setFogLayerVisible === 'function') window.setFogLayerVisible(!_veilOn && !_blackoutOn);
  } catch (e) {}

  // Overlay pane (blackout only — hides all vector layers including player dot)
  try {
    const _overlayPane = document.querySelector('#leafletMap .leaflet-overlay-pane');
    if (_overlayPane) _overlayPane.style.opacity = _blackoutOn ? '0' : '';
  } catch (e) {}

  // Tile panes (blackout only)
  try {
    const _tilePanes = document.querySelectorAll('.leaflet-tile-pane');
    for (const _tp of _tilePanes) _tp.style.opacity = _blackoutOn ? '0' : '';
  } catch (e) {}

  // Marker pane (blackout only)
  try {
    const _markerPane = document.querySelector('#leafletMap .leaflet-marker-pane');
    if (_markerPane) _markerPane.style.opacity = _blackoutOn ? '0' : '';
  } catch (e) {}

  // Solid black cover for blackout (z-index 10: above map/canvas, below FABs/HUD at 30)
  let _blackoutCover = document.getElementById('_blackoutCover');
  if (!_blackoutCover) {
    _blackoutCover = document.createElement('div');
    _blackoutCover.id = '_blackoutCover';
    _blackoutCover.style.cssText = 'position:fixed;inset:0;background:#000;z-index:10;pointer-events:none;display:none;';
    (document.getElementById('mapShell') || document.body).appendChild(_blackoutCover);
  }
  _blackoutCover.style.display = _blackoutOn ? 'block' : 'none';

  if ((elBBox ? elBBox.checked : false)) drawMapBounds();

  // Fog is now handled by Leaflet geometry (js/17_leaflet_fog.js)

}

function drawMapBounds() {
  const MW = (window.FOG_W||0), MH = (window.FOG_H||0);
  if (!MW || !MH) return;
  ctx.save();
  ctx.translate(view.tx, view.ty);
  ctx.scale(view.scale, view.scale);
  ctx.strokeStyle = "rgba(148,163,184,.55)";
  ctx.lineWidth = 2 / view.scale;
  ctx.strokeRect(0, 0, MW, MH);
  ctx.restore();
}

