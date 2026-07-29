// measureFootprint — the ONE reduction from a point cloud to a glyph's stored
// footprint (§5c, decisions 2 / 2b). Extracted from `importMotif.js` (aee1d1a)
// rather than re-written, because there are now three callers of it:
//
//   1. `importMotif` — an SVG becoming a custom glyph;
//   2. `serializeWorkingCopy` — the pen editor SAVING a glyph, where the art has
//      just changed and the stored measurement is stale by definition;
//   3. `ensureGlyphFootprint` — the load boundary, backfilling every custom
//      glyph imported before the fields existed.
//
// A second hand-written copy of `mec − root` is exactly the future-divergence
// risk already flagged on this branch: the three would agree today and drift on
// the first correction. `minEnclosingCircle.js` stays the sole definition of
// "tight"; this module is the sole definition of the FRAME that circle is stored
// in — root-relative, glyph-local, same units as `viewRadius`, and BEFORE any
// rotation (§7z 7g: `root.angle` is part of the frame `fc` is measured in, and
// `placementEngine` re-applies the growth turn downstream).

import { minEnclosingCircle } from './minEnclosingCircle.js';
import { flattenPathD } from '../plotter/pathOps.js';

// Degenerate geometry (every sampled point coincident) has a well-defined centre
// and a ZERO radius. In px, glyph-local, sub-pen-width. A zero `fr` makes
// `A = |fc|²` and `B = 2(a·u)` describe a POINT reserve — legal arithmetic, but
// it would let a degenerate glyph claim nothing and stack on its neighbours.
// The same constant serves `importMotif`'s `viewRadius` clamp, for the same
// reason (downstream scaling must never divide by / multiply against 0).
export const MIN_MEASURED_RADIUS = 0.5;

/**
 * Is every point finite? #198's finding is that Welzl SWALLOWS an interior NaN —
 * `inCirc` reads `NaN <= r` as false, so the point counts as "not contained",
 * `circ2`/`circ3` propagate the NaN into the circle, and a later real point
 * replaces it. The result is a plausible-looking circle and no throw. So a
 * non-finite point can only be caught by looking, explicitly, before the
 * reduction runs.
 * @param {{x:number,y:number}[]} points
 */
export function isFiniteCloud(points) {
  if (!Array.isArray(points) || points.length === 0) return false;
  for (const p of points) {
    if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) return false;
  }
  return true;
}

/**
 * The minimal enclosing circle of `points`, expressed RELATIVE TO `root`.
 *
 * ⚠️ ORDER IS PART OF THE INPUT. Welzl's shuffle is `(i * 2654435761) % (i + 1)`,
 * a function of array length and index order, so reordering or de-duplicating a
 * cloud permutes it differently and can move the circle at 1e-16 — the
 * `slice18`/`slice91` sign flip §7 warns about. Callers hand the cloud over
 * as-is; this function never sorts or filters it.
 *
 * @param {{x:number,y:number}[]} points  a VALIDATED cloud (see isFiniteCloud)
 * @param {{x:number,y:number}} [root]    the sprout point, glyph-local
 * @returns {{footprintCenter:{x:number,y:number}, footprintRadius:number}|null}
 *   null when there is nothing to measure — never a fabricated circle.
 */
export function measureFootprint(points, root) {
  const mec = minEnclosingCircle(points);
  if (!mec || !Number.isFinite(mec.x) || !Number.isFinite(mec.y) || !Number.isFinite(mec.r)) {
    return null;
  }
  return {
    footprintCenter: { x: mec.x - (root?.x ?? 0), y: mec.y - (root?.y ?? 0) },
    footprintRadius: mec.r > 0 ? mec.r : MIN_MEASURED_RADIUS,
  };
}

/**
 * The flattened point cloud of a glyph's `paths`, in record order — the same
 * cloud `importMotif` reduces (default `flattenPathD` tolerance, paths
 * concatenated in order, no dedup and no filtering).
 * @param {{d:string}[]} paths
 * @returns {{x:number,y:number}[]}
 */
export function glyphPointCloud(paths) {
  const out = [];
  for (const p of paths || []) {
    const { points } = flattenPathD(String(p?.d ?? ''));
    for (const [x, y] of points) out.push({ x, y });
  }
  return out;
}

/** Does this glyph already carry a usable measurement? */
export function hasMeasuredFootprint(glyph) {
  const fc = glyph?.footprintCenter;
  return (
    !!fc &&
    typeof fc === 'object' &&
    Number.isFinite(fc.x) &&
    Number.isFinite(fc.y) &&
    Number.isFinite(glyph.footprintRadius) &&
    glyph.footprintRadius > 0
  );
}

/**
 * Backfill a custom glyph that predates the footprint fields (PR blocker 2).
 *
 * Returns the glyph UNCHANGED — same object identity — when it is already
 * measured (so a document restore doesn't churn React memos) and when there is
 * nothing measurable about it. The second case is deliberate: inventing a circle
 * for a glyph with no sampleable geometry would be the silent degradation
 * ruling 7d refuses, and `placementEngine` throwing is the loud failure the
 * ruling asks for.
 *
 * @template T
 * @param {T} glyph
 * @returns {T}
 */
export function ensureGlyphFootprint(glyph) {
  if (!glyph || typeof glyph !== 'object') return glyph;
  if (hasMeasuredFootprint(glyph)) return glyph;
  const cloud = glyphPointCloud(glyph.paths);
  if (!isFiniteCloud(cloud)) return glyph;
  const measured = measureFootprint(cloud, glyph.root);
  if (!measured) return glyph;
  return { ...glyph, ...measured };
}

/**
 * The same, over a whole `{ [id]: glyph }` map. Returns the SAME map object when
 * nothing needed measuring, so the store's identity (and every memo keyed on it)
 * survives a load that changes nothing.
 * @param {Record<string, object>} map
 */
export function ensureGlyphMapFootprints(map) {
  if (!map || typeof map !== 'object') return map;
  let changed = false;
  const out = {};
  for (const [id, glyph] of Object.entries(map)) {
    const next = ensureGlyphFootprint(glyph);
    if (next !== glyph) changed = true;
    out[id] = next;
  }
  return changed ? out : map;
}
