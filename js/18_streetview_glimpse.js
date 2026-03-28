// Google Street View Static API "Photo Glimpse"
// - No location links (to avoid spoilers)
// - Intended as a Jet Lag-style "photo question" analogue
(function(){
  // Cache the last successfully shown glimpse so re-opening it doesn't
  // consume additional API quota or in-game costs.
  let __cachedTargetKey = null;
  let __cachedImgUrl = null;
  let __cachedHtml = null;
  let __cachedLoaded = false;

  function targetKey(tgt){
    if (!tgt) return null;
    const id = tgt.id || tgt.osm_id || tgt.name || '';
    const lat = (typeof tgt.lat === 'number' || typeof tgt.lat === 'string') ? String(tgt.lat) : '';
    const lon = (typeof tgt.lon === 'number' || typeof tgt.lon === 'string') ? String(tgt.lon) : '';
    return `${id}|${lat}|${lon}`;
  }

  function clearCache(){
    __cachedTargetKey = null;
    __cachedImgUrl = null;
    __cachedHtml = null;
    __cachedLoaded = false;
    try { if (__cachedTargetKey) { localStorage.removeItem(__svCacheKey(__cachedTargetKey, "snapshot")); localStorage.removeItem(__svCacheKey(__cachedTargetKey, "glimpse")); } } catch(e) {}
    try { if (typeof window.updateCostBadgesFromConfig === 'function') window.updateCostBadgesFromConfig(); } catch(e) {}
  }

  // Canvas mosaic: scales image down to a coarse grid then back up with no smoothing.
  // Uses two separate canvases to avoid self-draw (the Canvas spec says drawing a canvas
  // onto itself via drawImage produces undefined results).
  // Returns a Promise<dataURL>. Falls back to the original dataUrl on any error.
  function pixelateImage(dataUrl, cellSize) {
    return new Promise(function(resolve) {
      var cs = (typeof cellSize === 'number' && cellSize > 0) ? Math.round(cellSize) : 16;
      var img = new Image();
      img.onload = function() {
        try {
          var w = img.naturalWidth  || img.width  || 640;
          var h = img.naturalHeight || img.height || 640;
          cs = Math.max(2, Math.min(w, Math.min(h, cs)));
          var sw = Math.max(1, Math.floor(w / cs));
          var sh = Math.max(1, Math.floor(h / cs));
          // Step 1: draw the image at tiny size on a small canvas
          var small = document.createElement('canvas');
          small.width  = sw;
          small.height = sh;
          var smallCtx = small.getContext('2d');
          smallCtx.drawImage(img, 0, 0, sw, sh);
          // Step 2: scale the tiny canvas back up onto a full-size canvas using
          // nearest-neighbour (imageSmoothingEnabled = false → hard mosaic blocks)
          var canvas = document.createElement('canvas');
          canvas.width  = w;
          canvas.height = h;
          var ctx = canvas.getContext('2d');
          ctx.imageSmoothingEnabled = false;
          ctx.drawImage(small, 0, 0, sw, sh, 0, 0, w, h);
          resolve(canvas.toDataURL('image/jpeg', 0.88));
        } catch(e) {
          resolve(dataUrl); // fallback: show original on canvas error
        }
      };
      img.onerror = function() { resolve(dataUrl); }; // fallback: cross-origin or load failure
      img.src = dataUrl;
    });
  }

  function __svCacheKey(targetKeyStr, context){
    const ctx = (context || 'glimpse').toLowerCase();
    return `mg_sv_img_${ctx}_${targetKeyStr}`;
  }

  function __loadCachedDataUrl(targetKeyStr, context){
    try {
      const k = __svCacheKey(targetKeyStr, context);
      const v = localStorage.getItem(k);
      return (v && v.startsWith('data:image/')) ? v : null;
    } catch(e){ return null; }
  }

  function __saveCachedDataUrl(targetKeyStr, context, dataUrl){
    try {
      if (!dataUrl || typeof dataUrl !== 'string') return;
      const k = __svCacheKey(targetKeyStr, context);
      localStorage.setItem(k, dataUrl);
    } catch(e) {}
  }

  async function __fetchAsDataUrl(url){
    const res = await fetch(url, { cache: 'force-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    return await new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = () => reject(new Error('file_read_error'));
      r.readAsDataURL(blob);
    });
  }

  function isStreetViewGlimpseFreeForCurrentTarget(){
    // "Free" means we already successfully loaded (and cached) the glimpse for this target.
    const tgt = getTargetSafe();
    const k = targetKey(tgt);
    return !!(k && __cachedTargetKey === k && __cachedLoaded && __cachedHtml);
  }

  function openModal(){
    const m = document.getElementById('photoModal');
    if (!m) return;
    m.classList.remove('hidden');
  }
  function closeModal(){
    const m = document.getElementById('photoModal');
    if (!m) return;
    m.classList.add('hidden');
  }

  function setModal(bodyHtml, footerText){
    const body = document.getElementById('photoModalBody');
    const footer = document.getElementById('photoModalFooter');
    if (body) body.innerHTML = bodyHtml;
    if (footer) footer.textContent = footerText || '';
  }

  function setTitle(text){
    try {
      const t = document.getElementById('photoModalTitle');
      if (t) t.textContent = text || 'Photo';
    } catch(e) {}
  }

  function toNum(x){
    const n = (typeof x === 'string') ? parseFloat(x) : x;
    return (typeof n === 'number' && isFinite(n)) ? n : null;
  }

  function getTargetSafe(){
    let tgt = null;
    try { if (typeof getTarget === 'function') tgt = getTarget(); } catch(e) {}
    if (!tgt) { try { if (typeof target !== 'undefined') tgt = target; } catch(e) {} }
    if (!tgt) { try { tgt = window.target; } catch(e) {} }
    return tgt;
  }

  function buildStreetViewUrl(tgt, opts){
    const o = opts || {};
    // Read config values if available
    const key = (typeof GOOGLE_STREETVIEW_API_KEY !== 'undefined') ? GOOGLE_STREETVIEW_API_KEY : '';
    const size = (typeof STREETVIEW_SIZE !== 'undefined') ? STREETVIEW_SIZE : '640x640';
    const fov = (typeof STREETVIEW_FOV !== 'undefined') ? STREETVIEW_FOV : 90;
    const pitch = (typeof STREETVIEW_PITCH !== 'undefined') ? STREETVIEW_PITCH : 0;
    const heading = (typeof STREETVIEW_HEADING !== 'undefined') ? STREETVIEW_HEADING : null;

    const lat = toNum(tgt && tgt.lat);
    const lon = toNum(tgt && tgt.lon);
    const panoId = (tgt && (tgt.pano_id || tgt.panoid || tgt.panoId)) ? String(tgt.pano_id || tgt.panoid || tgt.panoId) : null;

    if (!key) return { ok:false, reason:'no_key', url:null };

    const params = new URLSearchParams();
    params.set('size', String(size));

    // Prefer a stable pano_id when available (keeps the round consistent).
    if (panoId) {
      params.set('pano', panoId);
    } else {
      params.set('location', `${lat},${lon}`);
    }

    params.set('fov', String(isFinite(o.fov) ? o.fov : fov));
    params.set('pitch', String(isFinite(o.pitch) ? o.pitch : pitch));

    // Heading:
    // - If explicitly provided, use it.
    // - Otherwise, if config heading is set, use it.
    // - Otherwise, omit so Google chooses a reasonable direction.
    const h = (o.heading !== null && o.heading !== undefined) ? o.heading : heading;
    if (h !== null && h !== undefined && h !== '') {
      params.set('heading', String(h));
    }
    // You can optionally enforce radius; leaving it out tends to find the best pano.
    // params.set('radius', '50');

    // Prefer outdoor imagery when possible (helps avoid indoor venue panos).
    // Docs: Street View Static API supports source=outdoor.
    try { params.set('source', 'outdoor'); } catch(e) {}
    params.set('key', String(key));

    return {
      ok:true,
      url: `https://maps.googleapis.com/maps/api/streetview?${params.toString()}`,
      reason:null,
    };
  }

  function setLoading(){
    setModal('<div class="muted">Loading…</div>', '');
  }

  function setNoKey(){
    setModal(
      '<div class="muted">Photo Glimpse is disabled: no Google Street View API key is set.</div>' +
      '<div class="muted" style="margin-top:8px;">Set <b>GOOGLE_STREETVIEW_API_KEY</b> in <b>js/00_config.js</b> to enable.</div>',
      ''
    );
  }

  function setError(msg){
    setModal(`<div class="muted">${msg}</div>`, 'Imagery © Google');
  }

  function setPhoto(imgUrl, tipText, context){
    const ctx = (context || 'glimpse').toLowerCase();
    const frameClass = (ctx === 'snapshot') ? 'is-snapshot' : 'is-glimpse';
    const uncorrupted = (typeof window.__arePhotosUncorrupted === 'function') ? !!window.__arePhotosUncorrupted() : false;
    const ucClass = uncorrupted ? 'is-uncorrupted' : '';
    // Crop + light blur + heavy "glitch" corruption (CSS-only, no pixel access)
    const html = `
      <div class="photo-glimpse-frame ${frameClass} ${ucClass}">
        <img class="photo-glimpse-img base" src="${imgUrl}" alt="Street View snapshot" loading="lazy" />
        <img class="photo-glimpse-img rgb rgb-a" src="${imgUrl}" alt="" aria-hidden="true" loading="lazy" />
        <img class="photo-glimpse-img rgb rgb-b" src="${imgUrl}" alt="" aria-hidden="true" loading="lazy" />
        <div class="photo-glitch-slices" id="photoGlitchSlices" aria-hidden="true"></div>
        <div class="photo-corrupt-overlay" aria-hidden="true"></div>
        <div class="photo-corrupt-blocks" id="photoCorruptBlocks" aria-hidden="true"></div>
      </div>
      <div class="muted" style="margin-top:10px;">${tipText || 'Tip: treat this like a quick glance — look for obvious anchors, not the exact address.'}</div>
    `;
    setModal(html, 'Imagery © Google');
  }

  function seedCorruption(intensity, imgUrl, context){
    const enabled = (typeof STREETVIEW_CORRUPTION_ENABLED !== 'undefined') ? !!STREETVIEW_CORRUPTION_ENABLED : true;
    if (!enabled) return;
    // If the round has been "uncorrupted", never add corruption layers.
    try {
      const __unc = (typeof window.__arePhotosUncorrupted === 'function') ? !!window.__arePhotosUncorrupted() : false;
      if (__unc) return;
    } catch(e) {}
    const el = document.getElementById('photoCorruptBlocks');
    if (!el) return;
    el.innerHTML = '';

    // Also seed "tear" slices (RGB-split bands that shift horizontally)
    const slices = document.getElementById('photoGlitchSlices');
    if (slices) slices.innerHTML = '';

    const I = Math.max(0, Math.min(1, (typeof intensity === 'number' && isFinite(intensity)) ? intensity : 0.6));
    const n = Math.round(10 + I * 22);
    for (let i = 0; i < n; i++) {
      const b = document.createElement('div');
      b.className = 'photo-corrupt-block';

      // Mostly thin horizontal slices, with a few chunkier blocks.
      const isSlice = Math.random() < 0.7;
      const w = isSlice ? (15 + Math.random() * 70) : (10 + Math.random() * 35);
      const h = isSlice ? (1.5 + Math.random() * 6) : (6 + Math.random() * 18);
      const top = Math.random() * (100 - h);
      const left = Math.random() * (100 - w);

      const o = 0.06 + Math.random() * (0.10 + I * 0.14);
      // Subtle motion: keep blocks snappy but not too swimmy.
      const dx = (-14 + Math.random() * 28) * (0.48 + I * 0.62);

      b.style.top = `${top}%`;
      b.style.left = `${left}%`;
      b.style.width = `${w}%`;
      b.style.height = `${h}%`;
      b.style.setProperty('--o', o.toFixed(3));
      b.style.setProperty('--dx', `${dx.toFixed(1)}px`);

      // Slight variance in tint
      if (Math.random() < 0.5) {
        b.style.background = 'linear-gradient(90deg, rgba(0,255,255,0.28), rgba(255,0,255,0.20))';
      }
      el.appendChild(b);
    }

    // Stronger glitch: horizontal tear slices that jitter
    if (slices && imgUrl) {
      const ctx = (context || 'glimpse').toLowerCase();
      const sliceCount = Math.round((ctx === 'snapshot' ? 4 : 3) + I * (ctx === 'snapshot' ? 9 : 6));
      for (let i = 0; i < sliceCount; i++) {
        const s = document.createElement('img');
        s.className = 'photo-glitch-slice';
        s.setAttribute('aria-hidden', 'true');
        s.alt = '';
        s.loading = 'lazy';
        s.src = imgUrl;

        // A thin horizontal band (tear)
        const h = (3 + Math.random() * (10 + I * 18)); // % height
        const top = Math.random() * (100 - h);
        const bottom = 100 - (top + h);

        // Tone down slice travel slightly (glitch stays obvious, less motion sickness).
        const dx = (-30 + Math.random() * 60) * (0.20 + I * 0.42); // px
        const dy = (-6 + Math.random() * 12) * 0.20; // px (tiny)
        const o = 0.16 + Math.random() * (0.22 + I * 0.30);
        const hue = Math.floor(-30 + Math.random() * 120); // degrees
        const dur = (1.4 + Math.random() * (2.2 + I * 1.8)).toFixed(2);

        s.style.setProperty('--top', `${top.toFixed(2)}%`);
        s.style.setProperty('--bottom', `${bottom.toFixed(2)}%`);
        s.style.setProperty('--dx', `${dx.toFixed(1)}px`);
        s.style.setProperty('--dy', `${dy.toFixed(1)}px`);
        s.style.setProperty('--o', o.toFixed(3));
        s.style.setProperty('--h', `${hue}deg`);
        s.style.setProperty('--dur', `${dur}s`);
        slices.appendChild(s);
      }
    }
  }

  async function showStreetViewGlimpseForTarget(opts){
    const o = (opts && typeof opts === 'object') ? opts : {};
    const context = (o.context || 'glimpse').toLowerCase();
    const tgt = getTargetSafe();
    const lat = toNum(tgt && tgt.lat);
    const lon = toNum(tgt && tgt.lon);

    // If we already loaded a glimpse for this target during this round,
    // just reopen it without re-requesting or re-charging.
    const k = targetKey(tgt);
    if (k && __cachedTargetKey === k && __cachedLoaded && (__cachedHtml || __cachedImgUrl)) {
      // IMPORTANT: if the player purchased "Uncorrupt" after we cached HTML,
      // we must not reuse the old corrupted markup. Re-render from the cached
      // image URL so the uncorrupted class + overlay suppression applies.
      const __unc = (typeof window.__arePhotosUncorrupted === 'function') ? !!window.__arePhotosUncorrupted() : false;
      setTitle(context === 'snapshot' ? 'Circle Snapshot' : 'Photo Glimpse');
      openModal();
      if (__unc && __cachedImgUrl) {
        const tip = (context === 'snapshot')
          ? "This is the Circle's snapshot. Your job is to find the street location where it was taken."
          : 'Tip: treat this like a quick glance — look for obvious anchors, not the exact address.';
        setPhoto(__cachedImgUrl, tip, context);
        try {
          const s = document.getElementById('photoGlitchSlices');
          if (s) s.innerHTML = '';
          const b = document.getElementById('photoCorruptBlocks');
          if (b) b.innerHTML = '';
        } catch(e) {}
      } else if (__cachedHtml) {
        setModal(__cachedHtml, 'Imagery © Google');
      } else {
        // Fallback: no cached HTML, just re-render from cached image URL.
        const tip = (context === 'snapshot')
          ? "This is the Circle's snapshot. Your job is to find the street location where it was taken."
          : 'Tip: treat this like a quick glance — look for obvious anchors, not the exact address.';
        let fallbackDisplayUrl = __cachedImgUrl;
        try {
          const __uncFb = (typeof window.__arePhotosUncorrupted === 'function') ? !!window.__arePhotosUncorrupted() : false;
          if (!__uncFb && __cachedImgUrl) {
            const cellSize = (typeof STREETVIEW_CORRUPTION_CELL_SIZE !== 'undefined') ? STREETVIEW_CORRUPTION_CELL_SIZE : 16;
            fallbackDisplayUrl = await pixelateImage(__cachedImgUrl, cellSize);
          }
        } catch(e) {}
        setPhoto(fallbackDisplayUrl, tip, context);
      }
      if (typeof window.log === 'function') window.log('📷 Photo Glimpse: re-opened cached image (no extra cost).');
      return { ok:true, cached:true };
    }

    if (!tgt || lat == null || lon == null) {
      if (typeof window.showToast === 'function') window.showToast('No target set yet.', false);
      return { ok:false, reason:'no_target' };
    }

    setTitle(context === 'snapshot' ? 'Circle Snapshot' : 'Photo Glimpse');
    openModal();
    setLoading();

    // Snapshot uses stable per-round parameters so refresh/re-open doesn't generate a new image.
    let heading = null;
    let pitchUsed = null;
    let fovUsed = null;

    const snapshotFov = (typeof STREETVIEW_SNAPSHOT_FOV !== 'undefined') ? STREETVIEW_SNAPSHOT_FOV : 70;
    const glimpseFov = (typeof STREETVIEW_GLIMPSE_FOV !== 'undefined') ? STREETVIEW_GLIMPSE_FOV : null;
    const basePitch = (typeof STREETVIEW_PITCH !== 'undefined') ? STREETVIEW_PITCH : 0;

    if (context === 'snapshot') {
      // Prefer a stored param bundle (more future-proof than just snapshot_heading).
      const existingParams = (tgt && tgt.snapshot_params && typeof tgt.snapshot_params === 'object') ? tgt.snapshot_params : null;
      if (existingParams && (existingParams.heading !== undefined || existingParams.pitch !== undefined || existingParams.fov !== undefined)) {
        heading = (existingParams.heading !== undefined) ? existingParams.heading : null;
        pitchUsed = (existingParams.pitch !== undefined) ? existingParams.pitch : basePitch;
        fovUsed = (existingParams.fov !== undefined) ? existingParams.fov : snapshotFov;
      } else {
        // Choose from a small curated set to keep the snapshot "fair" but not identical every round.
        const presets = (typeof STREETVIEW_SNAPSHOT_PRESETS !== 'undefined' && Array.isArray(STREETVIEW_SNAPSHOT_PRESETS) && STREETVIEW_SNAPSHOT_PRESETS.length)
          ? STREETVIEW_SNAPSHOT_PRESETS
          : null;
        const preset = presets ? presets[Math.floor(Math.random() * presets.length)] : null;

        heading = Math.floor(Math.random() * 360);
        pitchUsed = (preset && isFinite(preset.pitch)) ? preset.pitch : basePitch;
        fovUsed = (preset && isFinite(preset.fov)) ? preset.fov : snapshotFov;

        try {
          if (tgt) {
            tgt.snapshot_heading = heading; // legacy convenience
            tgt.snapshot_params = { heading, pitch: pitchUsed, fov: fovUsed };
          }
          if (typeof saveRoundState === 'function') saveRoundState();
        } catch(e) {}
      }
    } else {
      // Non-snapshot glimpses can be a bit wider (or configured).
      heading = null;
      pitchUsed = basePitch;
      fovUsed = (glimpseFov !== null ? glimpseFov : undefined);
    }

    const built = buildStreetViewUrl(tgt, {
      heading,
      pitch: pitchUsed,
      fov: fovUsed
    });
    if (!built.ok) {
      setNoKey();
      if (typeof window.log === 'function') window.log('📷 Photo Glimpse: disabled (no Street View API key).');
      return { ok:false, reason:'no_key' };
    }

    // We can't reliably preflight the image without triggering another request.
    // Instead, let the <img> load and handle errors.
    const tip = (context === 'snapshot')
      ? "This is the Circle's snapshot. Your job is to find the street location where it was taken."
      : 'Tip: treat this like a quick glance — look for obvious anchors, not the exact address.';

    // Use a persistent cached data URL on refresh so we do not re-request the image.
    const persisted = __loadCachedDataUrl(k, context);
    let dataUrl = persisted;
    if (!dataUrl) {
      try {
        dataUrl = await __fetchAsDataUrl(built.url);
        // Persist the original (pre-pixelation) URL so the uncorrupt tool can reveal the clean image after a reload.
        __saveCachedDataUrl(k, context, dataUrl);
      } catch (e) {
        // Fallback to direct URL if fetch fails
        dataUrl = built.url;
      }
    }

    // Pixelate before display (unless uncorrupted). Keep original dataUrl in __cachedImgUrl
    // so the uncorrupt tool can still reveal the clean image.
    let displayUrl = dataUrl;
    try {
      const __uncPx = (typeof window.__arePhotosUncorrupted === 'function') ? !!window.__arePhotosUncorrupted() : false;
      if (!__uncPx) {
        const cellSize = (typeof STREETVIEW_CORRUPTION_CELL_SIZE !== 'undefined') ? STREETVIEW_CORRUPTION_CELL_SIZE : 16;
        displayUrl = await pixelateImage(dataUrl, cellSize);
      }
    } catch(e) {}

    setPhoto(displayUrl, tip, context);
    // Add a glitchy "corruption" layer (stronger for snapshot than for optional glimpses).
    try {
      const __unc = (typeof window.__arePhotosUncorrupted === 'function') ? !!window.__arePhotosUncorrupted() : false;
      if (__unc) {
        // Ensure any previously seeded corruption is cleared.
        try {
          const s = document.getElementById('photoGlitchSlices');
          if (s) s.innerHTML = '';
          const b = document.getElementById('photoCorruptBlocks');
          if (b) b.innerHTML = '';
        } catch(e) {}
      } else {
      const inten = (context === 'snapshot')
        ? ((typeof STREETVIEW_CORRUPTION_INTENSITY_SNAPSHOT !== 'undefined') ? STREETVIEW_CORRUPTION_INTENSITY_SNAPSHOT : 0.85)
        : ((typeof STREETVIEW_CORRUPTION_INTENSITY_GLIMPSE !== 'undefined') ? STREETVIEW_CORRUPTION_INTENSITY_GLIMPSE : 0.60);
      seedCorruption(inten, dataUrl, context);
      }
    } catch (e) {}

    // Register the photo with Phase 1 RoundState v1 (starter snapshot + future gallery).
    try {
      if (typeof window.__onStreetViewPhotoCaptured === 'function') {
        window.__onStreetViewPhotoCaptured({
          context,
          url: dataUrl,
          sourceUrl: built.url,
          panoId: (tgt && (tgt.pano_id || tgt.panoid || tgt.panoId)) ? String(tgt.pano_id || tgt.panoid || tgt.panoId) : null,
          lat,
          lon,
          heading: (typeof heading === 'number' && isFinite(heading)) ? heading : null,
          pitch: (typeof pitchUsed === 'number' && isFinite(pitchUsed)) ? pitchUsed : null,
          fov: (typeof fovUsed === 'number' && isFinite(fovUsed)) ? fovUsed : null,
        });
      }
    } catch(e) {}

    // Retry SV cache write after __onStreetViewPhotoCaptured (which calls saveRoundState and
    // strips large URLs from localStorage, freeing quota). The initial write at line ~394 may
    // have silently failed with QuotaExceededError if localStorage was near-full at that point.
    try { if (!__loadCachedDataUrl(k, context)) __saveCachedDataUrl(k, context, dataUrl); } catch(e) {}

    // Cache the URL and mark as current target (we'll mark loaded on onload).
    __cachedTargetKey = k;
    __cachedImgUrl = dataUrl;
    __cachedLoaded = false;

    // Attach a one-time error handler to show a friendly message if the image fails.
    const img = document.querySelector('#photoModalBody img.photo-glimpse-img.base');
    if (img) {
      img.onload = () => {
        try {
          const body = document.getElementById('photoModalBody');
          __cachedHtml = body ? body.innerHTML : null;
          __cachedLoaded = true;
          try { if (typeof window.updateCostBadgesFromConfig === 'function') window.updateCostBadgesFromConfig(); } catch(e) {}
        } catch(e) {}
      };
      img.onerror = () => {
        setError('Could not load Street View imagery for this target right now (no coverage, quota, or network issue).');
        if (typeof window.log === 'function') window.log('📷 Photo Glimpse: Street View image failed to load.');
        clearCache();
      };
    }

    if (typeof window.log === 'function') window.log('📷 Photo Glimpse: Street View image loaded (or loading).');
    // Treat persisted data-URL loads as cached so callers can avoid charging.
    return { ok:true, cached: !!persisted };
  }

  function bindPhotoModal(){
    const m = document.getElementById('photoModal');
    if (!m) return;
    const close = document.getElementById('photoModalClose');
    if (close && !close.dataset.bound) {
      close.dataset.bound = '1';
      close.addEventListener('click', closeModal);
    }
    if (!m.dataset.boundBackdrop) {
      m.dataset.boundBackdrop = '1';
      m.addEventListener('click', (e) => {
        if (e.target === m) closeModal();
      });
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeModal();
      });
    }
  }


// ---- Phase 5: Echo Snapshots ----
function __insideBboxLatLon(lat, lon){
  try {
    if (typeof __insideBbox === 'function') return __insideBbox(lat, lon);
  } catch(e) {}
  try {
    if (typeof WEST !== 'undefined' && typeof EAST !== 'undefined' && typeof SOUTH !== 'undefined' && typeof NORTH !== 'undefined') {
      return (lon >= WEST && lon <= EAST && lat >= SOUTH && lat <= NORTH);
    }
  } catch(e) {}
  return true; // if bbox unknown, don't reject
}

async function __streetViewMetadataLocal(lat, lon, radiusM){
  try {
    if (typeof __streetViewMetadata === 'function') return await __streetViewMetadata(lat, lon, radiusM);
  } catch(e) {}
  // Fallback: inline metadata fetch (mirrors the picker)
  const key = (typeof GOOGLE_STREETVIEW_API_KEY !== 'undefined') ? GOOGLE_STREETVIEW_API_KEY : '';
  if (!key) return { ok:false, status:'NO_KEY' };
  const params = new URLSearchParams();
  params.set('location', `${lat},${lon}`);
  if (typeof radiusM === 'number' && isFinite(radiusM) && radiusM > 0) params.set('radius', String(Math.round(radiusM)));
  try { params.set('source','outdoor'); } catch(e) {}
  params.set('key', String(key));
  const url = `https://maps.googleapis.com/maps/api/streetview/metadata?${params.toString()}`;
  const res = await fetch(url, { cache: 'no-store' });
  const data = await res.json();
  if (!data || data.status !== 'OK' || !data.location) return { ok:false, status:(data && data.status) ? data.status : 'ERR' };
  return { ok:true, pano_id:data.pano_id || null, location:{ lat:data.location.lat, lon:data.location.lng }, date:data.date || null, status:data.status };
}

function __randRingDistance(innerM, outerM){
  const r1 = Math.max(0, innerM || 0);
  const r2 = Math.max(r1 + 1, outerM || (r1 + 1));
  const u = Math.random();
  return Math.sqrt(u * (r2*r2 - r1*r1) + r1*r1);
}

function __panoMatchesExisting(panoId, lat, lon){
  try {
    const rs = (typeof window.getRoundStateV1 === 'function') ? window.getRoundStateV1() : null;
    const photos = rs && Array.isArray(rs.photos) ? rs.photos : [];
    for (const p of photos) {
      if (!p) continue;
      if (panoId && p.panoId && String(p.panoId) === String(panoId)) return true;
      // If no panoId, fall back to proximity check
      if (typeof p.lat === 'number' && typeof p.lon === 'number' && typeof window.haversineMeters === 'function') {
        const d = window.haversineMeters(p.lat, p.lon, lat, lon);
        const minSep = (typeof ECHO_SNAPSHOT_MIN_SEPARATION_M === 'number' && isFinite(ECHO_SNAPSHOT_MIN_SEPARATION_M)) ? ECHO_SNAPSHOT_MIN_SEPARATION_M : 25;
        if (typeof d === 'number' && isFinite(d) && d < minSep) return true;
      }
    }
  } catch(e) {}
  return false;
}

async function showStreetViewExtraPhotoForTarget({ tier = 'near100' } = {}){
  const rs = (typeof window.getRoundStateV1 === 'function') ? window.getRoundStateV1() : null;
  const center = (rs && rs.targetPanoLatLng) ? rs.targetPanoLatLng : null;
  if (!center || typeof center.lat !== 'number' || typeof center.lon !== 'number') {
    return { ok:false, reason:'no_target' };
  }

  const kind = String(tier || 'near100').toLowerCase();
  if (kind !== 'near100' && kind !== 'near200') return { ok:false, reason:'bad_tier' };

  // If already purchased, just re-open from cache for free.
  try {
    const photos = (rs && Array.isArray(rs.photos)) ? rs.photos : [];
    const existing = photos.find(p => p && String(p.kind) === kind && p.url);
    if (existing) {
      openModal();
      setTitle(kind === 'near100' ? 'Extra photo (≤100m)' : 'Extra photo (≤200m)');
      const tip = (kind === 'near100') ? 'A nearby angle (within 100m of the target pano).' : 'A wider nearby angle (within 200m of the target pano).';
      setPhoto(existing.url, tip, 'glimpse');
      const __unc = (typeof window.__arePhotosUncorrupted === 'function') ? !!window.__arePhotosUncorrupted() : false;
      if (!__unc) try { seedCorruption(0.55, existing.url, 'glimpse'); } catch(e) {}
      if (typeof window.log === 'function') window.log(`📷 Extra photo: re-opened cached (${kind}).`);
      return { ok:true, cached:true };
    }
  } catch(e) {}

  // Ring sampling defaults
  const innerM = (kind === 'near100')
    ? ((typeof EXTRA_PHOTO_100_INNER_M === 'number' && isFinite(EXTRA_PHOTO_100_INNER_M)) ? EXTRA_PHOTO_100_INNER_M : 30)
    : ((typeof EXTRA_PHOTO_200_INNER_M === 'number' && isFinite(EXTRA_PHOTO_200_INNER_M)) ? EXTRA_PHOTO_200_INNER_M : 100);
  const outerM = (kind === 'near100')
    ? ((typeof EXTRA_PHOTO_100_OUTER_M === 'number' && isFinite(EXTRA_PHOTO_100_OUTER_M)) ? EXTRA_PHOTO_100_OUTER_M : 100)
    : ((typeof EXTRA_PHOTO_200_OUTER_M === 'number' && isFinite(EXTRA_PHOTO_200_OUTER_M)) ? EXTRA_PHOTO_200_OUTER_M : 200);

  const maxAttempts = (typeof ECHO_SNAPSHOT_MAX_ATTEMPTS === 'number' && isFinite(ECHO_SNAPSHOT_MAX_ATTEMPTS)) ? (ECHO_SNAPSHOT_MAX_ATTEMPTS|0) : 28;
  const metaRadius = (typeof STREETVIEW_METADATA_RADIUS_M === 'number' && isFinite(STREETVIEW_METADATA_RADIUS_M)) ? STREETVIEW_METADATA_RADIUS_M : 200;

  let chosen = null;
  let attempts = 0;
  let rejects = 0;

  while (attempts < maxAttempts) {
    attempts++;
    const bearing = Math.random() * 360;
    const dist = __randRingDistance(innerM, outerM);

    let pt = null;
    try {
      if (typeof destinationLatLon === 'function') {
        pt = destinationLatLon(center.lat, center.lon, bearing, dist);
      }
    } catch(e) {}
    if (!pt) {
      const dLat = (dist/111111) * Math.cos(bearing*Math.PI/180);
      const dLon = (dist/(111111*Math.cos(center.lat*Math.PI/180))) * Math.sin(bearing*Math.PI/180);
      pt = { lat:center.lat + dLat, lon:center.lon + dLon };
    }

    const meta = await __streetViewMetadataLocal(pt.lat, pt.lon, metaRadius);
    if (!meta || !meta.ok || !meta.location) { rejects++; continue; }

    const lat = meta.location.lat;
    const lon = meta.location.lon;
    const panoId = meta.pano_id || null;

    if (!__insideBboxLatLon(lat, lon)) { rejects++; continue; }

    // Ensure it's within the requested distance cap (metadata can snap further than the sampled point)
    if (typeof window.haversineMeters === 'function') {
      const dToTarget = window.haversineMeters(center.lat, center.lon, lat, lon);
      const cap = (kind === 'near100') ? 100 : 200;
      if (typeof dToTarget === 'number' && isFinite(dToTarget) && dToTarget > cap) { rejects++; continue; }
    }

    if (__panoMatchesExisting(panoId, lat, lon)) { rejects++; continue; }

    chosen = { lat, lon, panoId };
    break;
  }

  if (!chosen) {
    if (typeof window.log === 'function') window.log(`📷 Extra photo (${kind}): none available (attempts=${attempts}, rejects=${rejects}).`);
    return { ok:false, reason:'none_available' };
  }

  // Build static image URL
  const preset = (Array.isArray(STREETVIEW_SNAPSHOT_PRESETS) && STREETVIEW_SNAPSHOT_PRESETS.length)
    ? STREETVIEW_SNAPSHOT_PRESETS[Math.floor(Math.random()*STREETVIEW_SNAPSHOT_PRESETS.length)] : {};
  const opts = Object.assign({}, preset || {});
  if (typeof opts.pitch === 'number' && isFinite(opts.pitch)) {
    // Extra photos: a touch less downward than the starter
    opts.pitch = Math.min(0, Math.max(-22, opts.pitch + 4));
  }

  const urlObj = buildStreetViewUrl({ lat: chosen.lat, lon: chosen.lon, pano_id: chosen.panoId }, opts);
  if (!urlObj || !urlObj.ok || !urlObj.url) return { ok:false, reason:'no_key' };

  openModal();
  setTitle(kind === 'near100' ? 'Extra photo (≤100m)' : 'Extra photo (≤200m)');
  setLoading();

  let dataUrl = null;
  try {
    dataUrl = await __fetchAsDataUrl(urlObj.url);
    try { const _k = targetKey(getTargetSafe()); if (_k) __saveCachedDataUrl(_k, kind, dataUrl); } catch(e) {}
  } catch(e) {
    dataUrl = urlObj.url;
  }


  const tip = (kind === 'near100') ? 'A nearby angle (within 100m of the target pano).' : 'A wider nearby angle (within 200m of the target pano).';
  setPhoto(dataUrl, tip, 'glimpse');
  const __unc = (typeof window.__arePhotosUncorrupted === 'function') ? !!window.__arePhotosUncorrupted() : false;
  if (!__unc) try { seedCorruption(0.55, dataUrl, 'glimpse'); } catch(e) {}

  // Register in round photos cache/state
  try {
    if (typeof window.__onStreetViewPhotoCaptured === 'function') {
      window.__onStreetViewPhotoCaptured({
        context: kind,
        kind: kind,
        url: dataUrl,
        sourceUrl: urlObj.url,
        panoId: chosen.panoId,
        lat: chosen.lat,
        lon: chosen.lon,
        heading: (opts.heading !== undefined) ? opts.heading : null,
        pitch: (opts.pitch !== undefined) ? opts.pitch : null,
        fov: (opts.fov !== undefined) ? opts.fov : null,
      });
    }
  } catch(e) {}

  try { if (typeof window.updateCostBadgesFromConfig === 'function') window.updateCostBadgesFromConfig(); } catch(e) {}
  if (typeof window.log === 'function') window.log(`📷 Extra photo: loaded (${kind}).`);
  return { ok:true, panoId: chosen.panoId, lat: chosen.lat, lon: chosen.lon };
}
async function showStreetViewHorizonPhotoForTarget() {
  const rs = (typeof window.getRoundStateV1 === 'function') ? window.getRoundStateV1() : null;

  // Re-view for free if already purchased this round
  const photos = (rs && Array.isArray(rs.photos)) ? rs.photos : [];
  const existing = photos.find(p => p && String(p.kind) === 'horizon' && p.url);
  if (existing) {
    openModal();
    setTitle('Horizon photo');
    const tip = 'The skyline as seen from the target, facing toward you.';
    setPhoto(existing.url, tip, 'glimpse');
    const __unc = (typeof window.__arePhotosUncorrupted === 'function') ? !!window.__arePhotosUncorrupted() : false;
    if (!__unc) try { seedCorruption(0.55, existing.url, 'glimpse'); } catch(e) {}
    if (typeof window.log === 'function') window.log('📷 Horizon photo: re-opened cached (no extra cost).');
    return { ok: true, cached: true };
  }

  // Need target pano
  const tgt = getTargetSafe();
  if (!tgt || typeof tgt.lat !== 'number') {
    if (typeof window.showToast === 'function') window.showToast('No target set yet.', false);
    return { ok: false, reason: 'no_target' };
  }

  // Compute heading: target → player
  let heading = 0;
  try {
    const pl = window.player;
    if (pl && typeof pl.lat === 'number' && typeof pl.lon === 'number') {
      const dLon = toRad(pl.lon - tgt.lon);
      const lat1 = toRad(tgt.lat);
      const lat2 = toRad(pl.lat);
      const y = Math.sin(dLon) * Math.cos(lat2);
      const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
      heading = (toDeg(Math.atan2(y, x)) + 360) % 360;
    }
  } catch(e) {}

  const fov = 65;
  const pitch = 58;

  const urlObj = buildStreetViewUrl(tgt, { heading, pitch, fov });
  if (!urlObj || !urlObj.ok || !urlObj.url) {
    openModal();
    setTitle('Horizon photo');
    setNoKey();
    return { ok: false, reason: 'no_key' };
  }

  openModal();
  setTitle('Horizon photo');
  setLoading();

  const k = targetKey(tgt);
  const persisted = __loadCachedDataUrl(k, 'horizon');
  let dataUrl = persisted;
  if (!dataUrl) {
    try {
      dataUrl = await __fetchAsDataUrl(urlObj.url);
      __saveCachedDataUrl(k, 'horizon', dataUrl);
    } catch(e) {
      dataUrl = urlObj.url;
    }
  }

  const tip = 'The skyline as seen from the target, facing toward you.';
  setPhoto(dataUrl, tip, 'glimpse');
  const __unc = (typeof window.__arePhotosUncorrupted === 'function') ? !!window.__arePhotosUncorrupted() : false;
  if (!__unc) try { seedCorruption(0.55, dataUrl, 'glimpse'); } catch(e) {}

  // Register in round state so re-open is free
  try {
    if (typeof window.__onStreetViewPhotoCaptured === 'function') {
      window.__onStreetViewPhotoCaptured({
        context: 'horizon',
        kind: 'horizon',
        url: dataUrl,
        sourceUrl: urlObj.url,
        panoId: (tgt.pano_id || tgt.panoid || tgt.panoId) ? String(tgt.pano_id || tgt.panoid || tgt.panoId) : null,
        lat: tgt.lat,
        lon: tgt.lon,
        heading,
        pitch,
        fov,
      });
    }
  } catch(e) {}

  try { if (typeof window.updateCostBadgesFromConfig === 'function') window.updateCostBadgesFromConfig(); } catch(e) {}
  if (typeof window.log === 'function') window.log('📷 Horizon photo: loaded.');
  return { ok: true, cached: !!persisted };
}

// Expose
  window.showStreetViewGlimpseForTarget = showStreetViewGlimpseForTarget;
  window.showStreetViewExtraPhotoForTarget = showStreetViewExtraPhotoForTarget;
  window.showStreetViewHorizonPhotoForTarget = showStreetViewHorizonPhotoForTarget;
  window.bindPhotoModal = bindPhotoModal;
  window.clearStreetViewGlimpseCache = clearCache;
  window.isStreetViewGlimpseFreeForCurrentTarget = isStreetViewGlimpseFreeForCurrentTarget;
  // Expose cache lookup using the internal targetKey() so callers get the exact same key.
  window.__getStreetViewCachedDataUrl = function(tgt, context) {
    if (!tgt) return null;
    const k = targetKey(tgt);
    if (!k) return null;
    return __loadCachedDataUrl(k, context || 'snapshot');
  };

  // Fetch and cache a Street View data URL for the current target without opening the modal.
  // Returns the data URL string, or null on failure.
  window.__fetchStreetViewDataUrl = async function(context) {
    const ctx = (context || 'snapshot').toLowerCase();
    const tgt = getTargetSafe();
    if (!tgt) return null;
    const k = targetKey(tgt);
    if (!k) return null;
    const cached = __loadCachedDataUrl(k, ctx);
    if (cached) return cached;
    // Build the URL using the same param logic as showStreetViewGlimpseForTarget
    let heading = null, pitchUsed = null, fovUsed = null;
    const snapshotFov = (typeof STREETVIEW_SNAPSHOT_FOV !== 'undefined') ? STREETVIEW_SNAPSHOT_FOV : 70;
    const basePitch   = (typeof STREETVIEW_PITCH !== 'undefined') ? STREETVIEW_PITCH : 0;
    if (ctx === 'snapshot') {
      const ep = (tgt.snapshot_params && typeof tgt.snapshot_params === 'object') ? tgt.snapshot_params : null;
      if (ep) {
        heading   = (ep.heading !== undefined) ? ep.heading : null;
        pitchUsed = (ep.pitch   !== undefined) ? ep.pitch   : basePitch;
        fovUsed   = (ep.fov     !== undefined) ? ep.fov     : snapshotFov;
      } else {
        const presets = (typeof STREETVIEW_SNAPSHOT_PRESETS !== 'undefined' && Array.isArray(STREETVIEW_SNAPSHOT_PRESETS) && STREETVIEW_SNAPSHOT_PRESETS.length) ? STREETVIEW_SNAPSHOT_PRESETS : null;
        const preset  = presets ? presets[Math.floor(Math.random() * presets.length)] : null;
        heading   = Math.floor(Math.random() * 360);
        pitchUsed = (preset && isFinite(preset.pitch)) ? preset.pitch : basePitch;
        fovUsed   = (preset && isFinite(preset.fov))   ? preset.fov   : snapshotFov;
      }
    }
    const built = buildStreetViewUrl(tgt, { heading, pitch: pitchUsed, fov: fovUsed });
    if (!built || !built.ok || !built.url) return null;
    try {
      const dataUrl = await __fetchAsDataUrl(built.url);
      __saveCachedDataUrl(k, ctx, dataUrl);
      return dataUrl;
    } catch(e) { return null; }
  };

  window.showPhotoInModal = function(url, title, sourceUrl) {
    try {
      const kindLabel = {
        starter: 'Circle Snapshot',
        near100: 'Extra photo (≤100m)',
        near200: 'Extra photo (≤200m)',
        horizon: 'Horizon photo',
      };
      const displayTitle = kindLabel[title] || title || 'Photo';
      const context = (title === 'starter') ? 'snapshot' : 'glimpse';
      const tipText = (context === 'snapshot')
        ? 'Your circle snapshot from this round.'
        : 'Tip: treat this like a quick glance — look for obvious anchors, not the exact address.';
      openModal();
      setTitle(displayTitle);
      setPhoto(url, tipText, context);
      const __unc = (typeof window.__arePhotosUncorrupted === 'function') ? !!window.__arePhotosUncorrupted() : false;
      if (!__unc && context !== 'snapshot') {
        try { seedCorruption(0.55, url, context); } catch(e) {}
      }
    } catch(e) {}
  };
})();
