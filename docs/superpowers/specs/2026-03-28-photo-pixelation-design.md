# Photo Pixelation / Corruption Increase

**Date:** 2026-03-28
**Status:** Approved

## Goal

Make the starter snapshot and photo glimpses harder to identify instantly for players who know the area, while still allowing confirmation once the correct location is found. Broad shapes, dominant colours, and general massing should survive; text, signs, building facades, and specific architectural detail should be illegible.

## Approach: Canvas Pixelation (Mosaic)

Before displaying the fetched Street View image, pass it through an offscreen canvas mosaic step. This replaces the existing CSS-only approach as the primary obscuring mechanism; the animated CSS glitch layer is kept for atmosphere.

## Pipeline Change

Current flow:
```
fetch dataURL → setPhoto(dataUrl) → seedCorruption(css overlays)
```

New flow:
```
fetch dataURL → pixelateImage(dataUrl) → setPhoto(pixelatedUrl) → seedCorruption(css overlays)
```

The pixelated dataURL replaces `dataUrl` everywhere downstream: the `<img>` src, the cached copy (`__cachedImgUrl`, localStorage), and the corruption seed call.

## Canvas Mosaic Step

Function `pixelateImage(dataUrl, cellSize)` — returns a Promise<dataURL>:

1. Create an offscreen `<canvas>` matching the image's natural dimensions
2. Draw the full image at natural size
3. Scale down to `floor(width/cellSize)` × `floor(height/cellSize)` by redrawing at that size
4. Disable image smoothing (`ctx.imageSmoothingEnabled = false`)
5. Scale back up to original dimensions
6. Export via `canvas.toDataURL('image/jpeg', 0.88)`

`cellSize` defaults to `STREETVIEW_CORRUPTION_CELL_SIZE` (new config constant, value `16`). At 640×640 (the Street View API size), a cell of 16px gives a 40×40 mosaic grid — enough to see colour and rough shape, not enough to read text or distinguish architecture.

## CSS Layer Adjustment

Reduce `--blur` slightly since the canvas step now handles primary obscuring:
- `is-snapshot`: `--blur: 3.8px` → `2.0px`
- Default (glimpse): `--blur: 3.6px` → `2.0px`

All other CSS effects (RGB split, animated slices, corrupt blocks, overlay) remain unchanged.

## Config

Add to `js/00_config.js`:
```js
const STREETVIEW_CORRUPTION_CELL_SIZE = 16; // px — higher = chunkier mosaic
```

## Uncorrupt Tool

No changes needed. The uncorrupt path already displays `built.url` (original Street View URL), not the processed dataURL. Clean reveal is unaffected.

## Failure Handling

If `pixelateImage` throws (e.g. cross-origin canvas taint, which should not occur since the image is already a local dataURL), fall back to the original `dataUrl` and log a warning. The existing CSS corruption still applies.

## Out of Scope

- Per-difficulty cell size variation (can be tuned via config later)
- Selective noise patches on sub-regions
- Any change to the uncorrupt tool flow
