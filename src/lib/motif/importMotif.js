// importMotif (WI-4) — SVG text → a custom-glyph OBJECT (no id; the caller
// stamps it via useLayers.addCustomGlyph). This is the pure geometry half of
// "import an SVG as a reusable motif": parse → normalize → measure. No UI, no
// store, no DOM.
//
// The returned glyph mirrors the built-in library shape (see glyphs.js), with
// two motif-specific fields the built-ins don't need:
//   - tradition: 'imported' (provenance tag)
//   - root: { x, y, angle } — the editable default SPROUT point, placed at the
//     bounding box BOTTOM-CENTER. WI-2's placementMatrix folds T(−root) before
//     scale, so root is the scale pivot; viewRadius is therefore measured FROM
//     root (a bounding circle centered at root, NOT at the bbox center) so the
//     placed footprint equals placement.radius.
//   - footprintCenter / footprintRadius — the MINIMAL ENCLOSING CIRCLE of the
//     same sampled cloud, root-relative, so a user SVG packs by the same law
//     the 62 built-ins do (#202, §5c of docs/motif-footprint-fix-decisions.md).
//     Derived, never authored, and never a substitute for viewRadius.
//
// Normalization is DECIDED (do not redesign): every `d` is kept VERBATIM so
// exported curves survive round-trip; geometry is only SAMPLED (never rewritten)
// to measure the bbox and the root-centered bounding radius.
//
// P5-3 UPDATE: importMotif now consumes `extractMotifDrawables` (svgImport.js),
// the motif-only enhanced extractor. It converts basic shapes (rect incl.
// rounded corners, circle, ellipse, line, polygon, polyline) to path `d`, and
// flattens each element's own `transform` attribute composed with a SINGLE
// top-level transform (on <svg> or one outer <g>) via pathModel's anchor model.
// An untransformed <path> still keeps its `d` VERBATIM (curve-export fidelity
// unaffected); only converted shapes / transform-bearing elements get a
// freshly-serialized `d`.
//
// KNOWN LIMITATION (documented, flagged follow-up, not fixed here): nested or
// multiple `<g>` transform chains are NOT supported — only one top-level
// transform is honored (the regex extractor has no nesting model). A real
// DOMParser-based extractor would close this gap; out of scope for this slice.
// Anything unparseable degrades gracefully to today's behavior (skip / treat
// as identity) rather than throwing. An SVG with zero drawable elements
// returns extractMotifDrawables's error verbatim.

import { extractMotifDrawables } from '../svgImport.js';
import { flattenPathD } from '../plotter/pathOps.js';
import { minEnclosingCircle } from './minEnclosingCircle.js';

// Degenerate single-point geometry (e.g. `<path d="M5,5"/>`) has a well-defined
// root but a zero bounding radius. Fall back to this small positive radius so
// downstream scaling never divides by / multiplies against 0. In px (glyph
// local space), sub-pen-width, so a single-point import stays a visible speck.
const MIN_VIEW_RADIUS = 0.5;

// Does this `d` end in a close-path command? Matches the task's literal
// definition ("the d ends in Z/z") rather than flattenPathD's "a Z appears
// anywhere" — the two agree for every single-subpath import and only diverge on
// a mixed `… Z M… (open)` multi-subpath, where "ends in Z" is the truthful
// per-path answer.
function endsClosed(d) {
  return /[Zz]\s*$/.test(d);
}

// Pull a friendly default name from the SVG if one is cheaply available —
// a <title>, an aria-label, or the root <svg id> — else a generic default.
// Verbatim regex extraction, same spirit as svgImport's tokenizer (no DOM).
function deriveName(svg) {
  const title = /<title[^>]*>([^<]+)<\/title>/i.exec(svg);
  if (title && title[1].trim()) return title[1].trim();
  const aria = /\baria-label\s*=\s*("([^"]*)"|'([^']*)')/i.exec(svg);
  if (aria && (aria[2] ?? aria[3] ?? '').trim()) return (aria[2] ?? aria[3]).trim();
  const svgId = /<svg\b[^>]*?\bid\s*=\s*("([^"]*)"|'([^']*)')/i.exec(svg);
  if (svgId && (svgId[2] ?? svgId[3] ?? '').trim()) return (svgId[2] ?? svgId[3]).trim();
  return 'Imported motif';
}

/**
 * Build a custom-glyph object from raw SVG markup.
 *
 * @param {string} svgText - raw SVG markup
 * @returns {{ ok: true, glyph: {
 *   name: string,
 *   tradition: 'imported',
 *   paths: {d: string, closed: boolean}[],
 *   viewRadius: number,
 *   root: {x: number, y: number, angle: number},
 *   footprintCenter: {x: number, y: number},
 *   footprintRadius: number,
 * } } | { ok: false, error: string }}
 *   The glyph carries NO id — the caller (WI-5) stamps it on insert.
 */
export function importMotif(svgText) {
  // 1. Extract the drawable `d` of every supported element (verbatim for
  //    untransformed <path>s; converted/flattened otherwise), or propagate
  //    the parse error.
  const parsed = extractMotifDrawables(svgText);
  if (!parsed.ok) return parsed;

  // 2. Keep every `d` VERBATIM; flag closed by whether it ends in Z/z.
  //    Sample each path once (default tol) to accumulate the point cloud.
  const paths = [];
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const cloud = [];
  for (const d of parsed.paths) {
    paths.push({ d, closed: endsClosed(d) });
    const { points } = flattenPathD(d);
    for (const [x, y] of points) {
      cloud.push([x, y]);
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }

  // Empty point-cloud guard: paths whose `d` survives parseSVGImport but yields
  // NO sampleable vertices (e.g. `d="Z"`, `d="M"`, junk) leave the bbox at
  // ±Infinity, which would produce a NaN/Infinity root and silently poison
  // WI-2's placementMatrix. Reject explicitly rather than emit a broken glyph.
  if (cloud.length === 0) {
    return { ok: false, error: 'No sampleable geometry in this SVG.' };
  }

  // Non-finite point guard. `flattenPathD` refuses to emit a point built from
  // an unparseable coordinate, but its subdividers still do arithmetic, so an
  // extreme `d` can overflow a midpoint to ±Infinity/NaN INSIDE the cloud.
  // Nothing downstream fails loudly on that:
  //   - the bbox comparisons are all `<`/`>`, and every comparison with NaN is
  //     false, so a NaN point silently does not widen the box;
  //   - `viewRadius`'s `dist > viewRadius` is false for NaN too, so it keeps
  //     the last finite maximum;
  //   - and #198's finding — `minEnclosingCircle` SWALLOWS an interior NaN.
  //     `inCirc` reads `NaN <= r` as false, so the point counts as "not
  //     contained", `circ2`/`circ3` propagate the NaN into the circle, and a
  //     later real point replaces it. The result is a plausible-looking circle
  //     and no throw.
  // So the only place this can be caught is here, explicitly, before either
  // reduction runs. Same rejection channel as the empty-cloud guard above.
  for (const [x, y] of cloud) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      return { ok: false, error: 'This SVG contains coordinates too extreme to measure.' };
    }
  }

  // 3–4. root = bbox BOTTOM-CENTER (SVG y-down, so maxY is the bottom edge).
  const root = { x: (minX + maxX) / 2, y: maxY, angle: 0 };

  // 5. viewRadius = max distance from root to any sampled point (a bounding
  //    circle CENTERED AT ROOT — the scale pivot — not the bbox center).
  let viewRadius = 0;
  for (const [x, y] of cloud) {
    const dist = Math.hypot(x - root.x, y - root.y);
    if (dist > viewRadius) viewRadius = dist;
  }
  // Degenerate single-point (all sampled points coincide with root) → 0; clamp
  // to a small positive fallback so downstream scaling stays well-defined.
  if (!(viewRadius > 0)) viewRadius = MIN_VIEW_RADIUS;

  // 5b (§5c, decisions 2 / 2b). footprint = the MINIMAL ENCLOSING CIRCLE of the
  // SAME cloud, expressed RELATIVE TO ROOT so it lands in the frame
  // placementMatrix's trailing R(−root.angle)·T(−root) leaves the glyph in
  // (instancing.js:96-105) — the frame the reserve is solved in. One cloud, two
  // reductions: measuring the footprint over a second flattening pass would let
  // the two numbers disagree about what the glyph is.
  //
  // ⚠️ `footprintRadius` is NOT a substitute for `viewRadius` and never becomes
  // one (decision 2b). `viewRadius` stays the placementMatrix scale divisor and
  // the root-centred bound; `footprintRadius` is what the packer reserves.
  //
  // ⚠️ Stored BEFORE any rotation, exactly as the built-ins are — a bare
  // `mec − root` translation, no R(−root.angle) applied. `root.angle` is part
  // of the frame `fc` is measured in, and placementEngine re-applies the growth
  // turn downstream (§7z 7g). Every import is angle 0 (see the `root` literal
  // above), so this is the same short-circuited case all 62 built-ins are in.
  //
  // The circle itself needs no second finiteness gate: `cloud` is all-finite by
  // the guard above, `circ3` returns null rather than dividing by a vanishing
  // determinant, and `circ2`/`Math.hypot` of finite inputs are finite. The
  // enrichment script (`scripts/enrichVectorMotifFootprints.mjs:132-141`) checks
  // both sides only because it hard-exits; here the input guard is the only
  // reachable one, so there is no untestable branch to add.
  const mec = minEnclosingCircle(cloud.map(([x, y]) => ({ x, y })));
  const footprintCenter = { x: mec.x - root.x, y: mec.y - root.y };
  // Degenerate single-point (every sampled point coincides) → a well-defined
  // centre and a ZERO radius. Reuse MIN_VIEW_RADIUS for the identical reason it
  // exists for `viewRadius`: a zero `fr` makes A = |fc|² and B = 2(a·u) describe
  // a POINT reserve — legal arithmetic, but it would let a degenerate import
  // claim nothing and stack on top of its neighbours.
  const footprintRadius = mec.r > 0 ? mec.r : MIN_VIEW_RADIUS;

  // 6. name — a cheap friendly default; the UI can rename later (WI-5/P2).
  const name = deriveName(svgText);

  return {
    ok: true,
    glyph: { name, tradition: 'imported', paths, viewRadius, root, footprintCenter, footprintRadius },
  };
}
