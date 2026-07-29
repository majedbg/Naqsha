// Motif glyph library — pure data, no p5/DOM/React.
//
// A glyph is authored in a LOCAL coordinate system. The ANCHOR of that system
// is the glyph's `root` — NOT the origin — and `viewRadius` is the max distance
// from the root to any glyph point; the instancing stage (instancing.js) scales
// that up to a placement's absolute footprint radius after sending the root to
// the origin (placementMatrix's trailing R(−root.angle)·T(−root)).
//
// The four hand-authored built-ins below omit `root`, so for THEM the anchor is
// the origin and the art straddles it. That is a property of those four, not an
// invariant of the format: every SVG import (the 58 vector built-ins, and any
// user import) keeps its source document's user space, so its art can sit
// anywhere — the vector built-ins all cluster around (55.5, 55.5). Anything
// framing a glyph for DISPLAY must therefore measure the paths (see
// glyphBounds.js) or de-root them; assuming an origin-centered box silently
// clips or blanks every import.
//
// See docs/motif-adorn-arch-brief.md §8/§9 for house conventions.

// Vector-motif built-ins (58 SVGs authored in Serif/Affinity, imported 2026-07).
// AUTO-GENERATED and flattened from src/lib/motif/vectorMotifs/*.svg — see
// vectorMotifsGlyphs.js. They are spread into MOTIF_GLYPHS below so they ship as
// BUILT-IN glyphs (the `builtin` set in glyphEntries). Unlike the hand-authored
// core four, each carries a `root` (bbox bottom-center, the scale pivot) exactly
// like a user SVG import — the placement pipeline handles root uniformly
// (MotifPattern.js: `glyph.root || {x:0,y:0,angle:0}`).
import { VECTOR_MOTIF_GLYPHS } from './vectorMotifsGlyphs.js';

/**
 * @typedef {{d:string, closed:boolean}} GlyphPath
 * @typedef {{id:string, name:string, tradition:string, paths:GlyphPath[], viewRadius:number, footprintCenter:{x:number,y:number}, footprintRadius:number}} Glyph
 */

// `footprintCenter` / `footprintRadius` are the glyph's MINIMAL ENCLOSING CIRCLE
// (Welzl, src/lib/motif/minEnclosingCircle.js), stored relative to `root` in the
// same local units as `viewRadius`. They are DERIVED, never authored (decision 2
// of docs/motif-footprint-fix-decisions.md): the 58 vector built-ins get theirs
// from `scripts/enrichVectorMotifFootprints.mjs`, the four below are derived once
// by hand with the derivation written down, and every value is re-measured and
// compared exactly by `glyphFootprint.test.js`.
//
// ⚠️ `footprintRadius` is NOT a synonym for `viewRadius` and the two are never
// substituted (decision 2b). `viewRadius` is the placementMatrix scale divisor
// (instancing.js:77, `s = radius / viewRadius`) and is measured FROM THE ROOT;
// `footprintRadius` is the packer's reserve and is measured from the tight
// circle's own centre. They coincide on the four hand-authored glyphs only
// because those straddle the origin — across the vector built-ins the root disc
// is a median 3.42× the tight one in area.

// 'leaf' — a leaf-blade that grows FROM the host line (design 2026-07). The
// stem/base vertex sits at the ORIGIN (0,0), which the placement engine puts ON
// the line; the whole blade extends along +x — the off-line direction, since a
// glyph's local +x maps to the path NORMAL after orientation (see instancing.js
// placementMatrix + placementEngine orientation 'path'/useNormal:true). So every
// non-base vertex is strictly x>0 and the blade hangs off ONE side of the line.
// Deliberately NOT symmetric under y → −y (mirror across the midrib, the +x
// growth axis): one flank bulges wider than the other. That midrib asymmetry is
// what makes a 180° turn — local (x,y)→(−x,−y), used by the Vine to alternate
// leaves above/below — read DIFFERENTLY from a plain `flip` (x-negation,
// (x,y)→(−x,y)); the two differ only by the y-negation the asymmetry exposes.
//
// Curved re-author (2026-07-28): the old shape was a 7-vertex straight-line
// polygon that read as a faceted lens rather than a leaf. Re-authored as TWO
// cubic Béziers — one per flank — sharing the base (0,0) and the tip (20,-1)
// as their shared endpoints, closed with Z. Only M/C/Z are used (no Q/T/A —
// see the parser note in src/lib/plotter/pathOps.js: it understands M/L/C/S/Z
// only, and ignores Q/T/A entirely, so those would render on canvas as
// straight skips while still exporting correctly to SVG — invisible in
// review). The upper flank's control points (4,-9)/(14,-9) bulge to about
// y≈-6.9 at its widest; the lower flank's (15,4)/(6,5) bulge to only y≈3.3 —
// a ~2:1 asymmetry that preserves the midrib contract above. The tip sits at
// (20,-1), not (20,0), which gives the midrib axis a slight droop instead of
// a dead-straight almond spine. Both flanks are single, non-inflecting cubic
// arcs, so the whole outline is convex apart from the two intentional points
// (tip and base) — verified by walking the flattened polygon and checking
// every turn has the same sign (see the scratch check run during authoring;
// no inflection/self-intersection). Overall ≈20 units long, matching the old
// leaf's footprint.
const LEAF_D = 'M0,0 C4,-9 14,-9 20,-1 C15,4 6,5 0,0 Z';

// 'dot' — a small filled circle, approximated as a regular octagon (8
// vertices at radius 3). Symmetric under any reflection/rotation.
const DOT_D =
  'M3,0 L2.1213,2.1213 L0,3 L-2.1213,2.1213 L-3,0 L-2.1213,-2.1213 L0,-3 L2.1213,-2.1213 Z';

// 'diamond' — a 4-point rhombus, taller than wide, symmetric under both axes.
const DIAMOND_D = 'M0,-8 L5,0 L0,8 L-5,0 Z';

// 'rosette' — a simple 6-petal radial rosette: 12 vertices alternating
// between an outer petal-tip radius (10) and an inner valley radius (4),
// spaced every 30°. Symmetric under 6-fold rotation and x/y reflection.
const ROSETTE_D =
  'M10,0 L3.4641,2 L5,8.66025 L0,4 L-5,8.66025 L-3.4641,2 L-10,0 L-3.4641,-2 L-5,-8.66025 L0,-4 L5,-8.66025 L3.4641,-2 Z';

/** @type {Record<string, Glyph>} */
export const MOTIF_GLYPHS = {
  leaf: {
    id: 'leaf',
    name: 'Leaf',
    tradition: 'botanical',
    paths: [{ d: LEAF_D, closed: true }],
    // Measured against the FLATTENED curve, not the authored anchors (a cubic
    // can bulge past its endpoints — see pathOps.js parsePathD/flattenPathD).
    // Ran LEAF_D through parsePathD (16-step fixed sampling) AND flattenPathD
    // (adaptive, tol=0.25) AND a dense 200k-step analytic sample of both
    // cubics directly — all three agree the farthest flattened point is the
    // tip itself, (20,-1), at |(20,-1)| = sqrt(401) ≈ 20.0250; the curve
    // bodies never bulge past that. 20.1 is that ≈20.025 rounded up for a
    // small safety margin (coincidentally the same numeral as the old
    // straight-line leaf's viewRadius, but re-derived from scratch for this
    // shape — not carried over). Larger than the old centered leaf's 10.2
    // because the blade extends fully to one side instead of straddling the
    // origin — the drawn footprint is still `placement.radius`, so this only
    // re-anchors the leaf at its base, it does not change placement sizing.
    viewRadius: 20.1,
    // FOOTPRINT — the minimal enclosing circle of the same flattened outline,
    // expressed RELATIVE TO ROOT. The leaf has no `root`, so its anchor IS the
    // origin and these are plain local coordinates. Derived, not authored
    // (decision 2): ran LEAF_D through flattenPathD(tol 0.05) and
    // minEnclosingCircle, the same two calls
    // scripts/enrichVectorMotifFootprints.mjs makes for the 58 vector records.
    // The circle comes out as the DIAMETER circle on the blade's two extremes —
    // the base (0,0) and the tip (20,-1) — because both flanks are single
    // non-inflecting cubics that stay inside it: centre is their midpoint
    // (10,-0.5) and the radius is |(20,-1)|/2 = sqrt(401)/2 ≈ 10.0125, half the
    // 20.0250 the viewRadius note above measures. So the tight disc is HALF the
    // root disc in radius and a quarter of it in area — the 4.00× ceiling of §1,
    // hit exactly, because the anchor sits on its own enclosing circle with the
    // farthest point antipodal. That also makes |fc| = fr to the bit, which is
    // why `leaf` is one of §3's four exactly-degenerate glyphs. Full precision
    // deliberately: rounding would move it out of the |A|/fr² < 1e-9 bucket the
    // solver slice's property test is written against, and NOT rounded up the
    // way viewRadius is — a reserve is not a safety margin, it is a measurement.
    footprintCenter: { x: 10, y: -0.5 },
    footprintRadius: 10.012492197250394,
  },
  dot: {
    id: 'dot',
    name: 'Dot',
    tradition: 'geometric',
    paths: [{ d: DOT_D, closed: true }],
    // Every vertex is at radius exactly 3 (octagon inscribed in a
    // radius-3 circle); 3 is the bounding-circle radius.
    viewRadius: 3,
    // FOOTPRINT — measured the same way as `leaf` above, and it lands on the
    // opposite degeneracy. The octagon straddles the origin symmetrically, so
    // the minimal enclosing circle IS the circumscribed radius-3 circle centred
    // on the origin: the offset is zero and the tight disc equals the root disc.
    // fc = (0,0) and fr = viewRadius here is a COINCIDENCE OF THIS SHAPE, not a
    // default (decision 2b keeps the two numbers separate for exactly that
    // reason) — and it is measured rather than assumed, because an absent field
    // is not a safe default: a glyph without `footprintRadius` under
    // sizing.footprint 'tight' falls to undefined and poisons the quadratic with
    // NaN instead of degrading.
    footprintCenter: { x: 0, y: 0 },
    footprintRadius: 3,
  },
  diamond: {
    id: 'diamond',
    name: 'Diamond',
    tradition: 'geometric',
    paths: [{ d: DIAMOND_D, closed: true }],
    // Max vertex distance from origin is |(0,-8)| = 8; 8 is the
    // bounding-circle radius (covers every authored vertex, including
    // the narrower ±5 side points).
    viewRadius: 8,
    // FOOTPRINT — ⚠️ `diamond` HAS NO `root`, so this is expressed relative to
    // the ORIGIN, which is what the placement pipeline treats as its anchor
    // (MotifPattern.js: `glyph.root || {x:0,y:0,angle:0}`). Same convention as
    // the other three hand-authored glyphs and the same convention as the 58
    // vector records, which do carry a root — "relative to root" and "relative
    // to the origin" are the same statement whenever root is absent. Measured:
    // the rhombus straddles the origin, its two ±8 tip vertices are antipodal
    // and the ±5 side vertices sit well inside, so the minimal enclosing circle
    // is the origin-centred radius-8 one. Offset zero, tight disc = root disc —
    // and note this is the glyph §1 records as the single 1.00 in a library
    // whose median root/tight AREA ratio is 3.42.
    footprintCenter: { x: 0, y: 0 },
    footprintRadius: 8,
  },
  rosette: {
    id: 'rosette',
    name: 'Rosette',
    tradition: 'floral',
    paths: [{ d: ROSETTE_D, closed: true }],
    // Max vertex distance from origin is the outer petal-tip radius, 10;
    // the inner valley vertices (radius 4) are well within that bound.
    viewRadius: 10,
    // FOOTPRINT — measured, same two calls. The six petal tips sit at radius 10
    // every 60°, so no half-plane through the origin is empty and the minimal
    // enclosing circle cannot shrink off-centre: it is the origin-centred
    // radius-10 one, and the valley vertices at radius 4 never bind. Offset
    // zero, tight disc = root disc. Like `dot` and `diamond`, this glyph gains
    // nothing from the footprint fix — it was already centred on its own ink;
    // the 58 vector built-ins are the ones rooted at bbox bottom-center that pay
    // the 4× (§1).
    footprintCenter: { x: 0, y: 0 },
    footprintRadius: 10,
  },
  // 58 flattened SVG motifs, ingested as built-ins (see import above).
  ...VECTOR_MOTIF_GLYPHS,
};

/**
 * Resolve a glyph by id. Document-aware (WI-3): a built-in glyph ALWAYS wins;
 * the optional per-document `customGlyphs` map (owned by useLayers) is consulted
 * only for ids the built-in library doesn't own. Single-arg calls stay
 * back-compat (built-in or undefined), so untouched callers never break.
 * @param {string} id
 * @param {Record<string, Glyph>} [customGlyphs] per-document custom-glyph store
 * @returns {Glyph|undefined}
 */
export function getGlyph(id, customGlyphs) {
  return MOTIF_GLYPHS[id] ?? customGlyphs?.[id];
}
