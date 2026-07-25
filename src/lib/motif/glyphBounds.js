// Glyph bounding box — the true drawn extent of a glyph's paths, in the glyph's
// own local coordinates. Pure, deterministic, headless (no p5/DOM/React).
//
// WHY THIS EXISTS. Preview surfaces (GlyphThumb, the slot swatch, RhythmStrip)
// used to derive their viewport from `viewRadius` alone, centered on the local
// ORIGIN — which silently assumes the art straddles (0,0). That assumption held
// for the four hand-authored built-ins and is FALSE for every SVG import: paths
// arrive in the source document's user space (the 58 vector built-ins all sit
// around (55.5, 55.5) with ~96-unit extents), so an origin-centered box showed
// them off-centre, clipped, or — at the slot swatch's hard-coded `-12 -12 24 24`
// — entirely empty. See `root`/`viewRadius` semantics in instancing.js: the
// canvas pipeline is unaffected because placementMatrix re-centres on `root`,
// so ONLY the preview surfaces were ever wrong.
//
// A bbox is the honest answer for a preview: it needs the extent of what is
// actually drawn, which no single radius about an assumed centre can give.
import { flattenPathD } from '../plotter/pathOps.js';

/**
 * @typedef {{minX:number, minY:number, maxX:number, maxY:number,
 *            width:number, height:number, cx:number, cy:number}} GlyphBBox
 */

// Curve flatness for bbox sampling, in glyph-local units. Coarser than the
// plotter default (0.25px) because a preview thumbnail is drawn at ~24px from a
// ~100-unit box — a quarter-unit of bulge is far under one rendered pixel — and
// this runs over every glyph in a dense picker grid. Still adaptive, so a
// tight curve gets the vertices it needs.
const BBOX_TOL = 0.5;

// Stroke width as a fraction of the viewBox's long side. 1/18 reproduces the
// weight of the previous `strokeWidth = r/9` on a `2r`-wide box exactly.
const STROKE_RATIO = 1 / 18;

// Bboxes are pure functions of the glyph object, and glyph refs are stable
// (memoized buildGlyphEntries / getGlyph — see GlyphThumb's memo rationale), so
// cache per object identity. WeakMap: an evicted/edited glyph is collectable,
// and an EDITED glyph is a NEW object (useMotifEditor rebuilds `working` on each
// commit), so a stale box can never be served for changed geometry.
const cache = new WeakMap();

/**
 * The bounding box of every path in `glyph`, in glyph-local coordinates.
 *
 * Curve-aware: uses the shared `flattenPathD` tokenizer, so C/S/Q/T/A commands
 * contribute their true swept extent rather than their control-point hull (a
 * control point can sit well outside the curve it steers, which would inflate
 * the box and shrink the preview).
 *
 * @param {{paths?: {d:string}[]}} glyph
 * @returns {GlyphBBox|null} null when the glyph has no parseable geometry —
 *   callers fall back to their own viewRadius box rather than render nothing.
 */
export function glyphBBox(glyph) {
  if (!glyph || !Array.isArray(glyph.paths) || glyph.paths.length === 0) return null;

  const hit = cache.get(glyph);
  if (hit !== undefined) return hit;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const p of glyph.paths) {
    if (!p || typeof p.d !== 'string') continue;
    const { points } = flattenPathD(p.d, BBOX_TOL);
    for (let i = 0; i < points.length; i++) {
      const x = points[i][0];
      const y = points[i][1];
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }

  // No finite vertex anywhere (empty/garbage `d`) — report nothing rather than
  // an Infinity box, so callers take their documented fallback.
  const box =
    minX === Infinity
      ? null
      : {
          minX,
          minY,
          maxX,
          maxY,
          width: maxX - minX,
          height: maxY - minY,
          cx: (minX + maxX) / 2,
          cy: (minY + maxY) / 2,
        };

  cache.set(glyph, box);
  return box;
}

/**
 * A square-ish SVG `viewBox` that spans the glyph completely, with headroom for
 * the stroke drawn on top of it.
 *
 * Returns the box PLUS the stroke width the caller should draw at, because the
 * two are coupled: the padding has to clear half the stroke (round caps/joins
 * bulge past the geometry), and the stroke has to scale with the box or a
 * wide-flat glyph reads visually heavier than a tall one in the same grid.
 *
 * Stroke weight is pinned to the pre-existing look: the old box was `2r` across
 * with `strokeWidth = r/9`, i.e. exactly 1/18 of the viewport, and
 * `STROKE_RATIO` reproduces that. Because `preserveAspectRatio` defaults to
 * `xMidYMid meet`, a square viewport renders a non-square viewBox at
 * `size / max(width, height)` — so scaling the stroke by the LONG side is what
 * keeps apparent thickness constant across shapes.
 *
 * @param {{paths?: {d:string}[], viewRadius?: number}} glyph
 * @returns {{x:number, y:number, w:number, h:number, strokeWidth:number}}
 */
export function glyphViewBox(glyph) {
  const box = glyphBBox(glyph);

  // Fallback: the historical origin-centered viewRadius box. Reached only for a
  // glyph with no drawable geometry, where there is nothing to centre on.
  if (!box) {
    const r = (glyph?.viewRadius || 10) * 1.2;
    return { x: -r, y: -r, w: 2 * r, h: 2 * r, strokeWidth: r / 9 };
  }

  // A degenerate axis (a perfectly flat/vertical glyph) must not collapse the
  // box to zero — that would divide by zero in the render scale. Fall back to
  // the other axis, or to viewRadius when both are degenerate (a single point).
  let { width, height } = box;
  if (width <= 0 && height <= 0) {
    const span = (glyph?.viewRadius || 10) * 2;
    width = span;
    height = span;
  } else if (width <= 0) {
    width = height;
  } else if (height <= 0) {
    height = width;
  }

  const long = Math.max(width, height);
  const strokeWidth = long * STROKE_RATIO;
  // Clear half the stroke with margin to spare, so round joins at the extremes
  // never touch the edge.
  const pad = strokeWidth;

  return {
    x: box.cx - width / 2 - pad,
    y: box.cy - height / 2 - pad,
    w: width + pad * 2,
    h: height + pad * 2,
    strokeWidth,
  };
}
