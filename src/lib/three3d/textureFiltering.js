/**
 * Pure, three-free texture-filtering math for the Surface-A emissive mark planes
 * (canvas3d/Marks.jsx). Lives on the 2D side of the import boundary so the choices
 * that drive the GPU CanvasTexture are unit-testable in `node` (no WebGL needed).
 *
 * Two knobs that fight the mark-texture ALIASING the 3D preview shows at a grazing
 * 3/4 angle:
 *
 *  1. anisotropy — the mark plane is heavily MINIFIED (a ~2k-px raster shown a few
 *     hundred screen px, tilted), the classic case where a low anisotropic-filter
 *     sample count shimmers/stair-steps. We want the renderer's hardware max, not a
 *     hardcoded small value. clampAnisotropy turns the (possibly bogus) reported max
 *     into a safe integer ≥ 1, optionally capped.
 *
 *  2. raster scale — how many device pixels the offscreen SVG canvas is rasterized
 *     at, folding DPR in BEFORE clamping the longest edge so a fixed cap bounds the
 *     FINAL pixels on any display (not cap×DPR). Too low ⇒ the marks pixelate under
 *     magnification; the cap keeps the offscreen canvas bounded for the perf budget.
 *     A `minEdge` FLOOR (added for the fluorescent-mark fix) is the other half: the
 *     mark SVG's intrinsic size is the DESIGN size (e.g. a 200mm panel decodes to
 *     ~756px), so on a small/dense design DPR alone left the raster well under the
 *     cap — the hatch then merged into blocks both directly and when re-imaged
 *     through the translucent slab. The floor guarantees a minimum resolution so the
 *     hatch is resolved before mipmaps/anisotropy filter it; floor == cap pins every
 *     mark texture to one bounded size regardless of design or display.
 */

/**
 * Resolve the anisotropic-filtering sample count for a mark texture from the
 * renderer's reported maximum (gl.capabilities.getMaxAnisotropy()). Returns a safe
 * integer ≥ 1, never above `cap` (default 16 — the ceiling of every current GPU, so
 * the default is effectively "use the hardware max").
 *
 * @param {number} max - renderer max anisotropy (may be undefined / NaN / < 1)
 * @param {number} [cap=16] - upper bound to stay within the perf budget
 * @returns {number} integer anisotropy in [1, cap]
 */
export function clampAnisotropy(max, cap = 16) {
  const ceil = Number.isFinite(cap) && cap >= 1 ? Math.floor(cap) : 1;
  const m = Number.isFinite(max) && max >= 1 ? Math.floor(max) : 1;
  return Math.max(1, Math.min(ceil, m));
}

/**
 * Choose the rasterization scale for the offscreen mark canvas. DPR is folded in
 * first to get the desired longest edge, which is then clamped into
 * [`minEdge`, `maxEdge`] so the final raster never exceeds the cap NOR falls below
 * the floor on any display. Returns the multiplier to apply to the source
 * width/height when sizing the canvas.
 *
 * `minEdge` (the floor) upscales a small/dense design whose intrinsic SVG size ×
 * DPR would otherwise leave the hatch under-resolved; `maxEdge` (the cap) bounds
 * the offscreen canvas for the perf budget. With no minEdge the result is exactly
 * the prior behaviour (DPR, capped) — back-compatible. A degenerate range
 * (minEdge > maxEdge) lets the cap win so the perf bound is never violated.
 *
 * @param {{ width:number, height:number, dpr?:number, maxEdge?:number, minEdge?:number }} input
 * @returns {number} positive scale factor
 */
export function chooseRasterScale({ width, height, dpr = 1, maxEdge, minEdge } = {}) {
  const w = Number.isFinite(width) && width > 0 ? width : 1;
  const h = Number.isFinite(height) && height > 0 ? height : 1;
  const d = Number.isFinite(dpr) && dpr > 0 ? dpr : 1;
  const sourceLongest = Math.max(w, h);
  let targetLongest = sourceLongest * d;
  if (Number.isFinite(minEdge) && minEdge > 0) targetLongest = Math.max(targetLongest, minEdge);
  // Cap wins last so a (minEdge > maxEdge) misconfig can never blow the perf bound.
  if (Number.isFinite(maxEdge) && maxEdge > 0) targetLongest = Math.min(targetLongest, maxEdge);
  return targetLongest / sourceLongest;
}
