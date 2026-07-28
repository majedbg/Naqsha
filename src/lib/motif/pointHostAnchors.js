// pointHostAnchors — module B of PRD #143. Turns a host's container CIRCLES into
// `cell` anchors: one per circle, at its centre, declaring the circle's radius
// through the top-level `hostRadius` channel (#146).
//
// GEOMETRY-IN, like the Voronoi extractor: the host resolves its own circles
// (seed-driven, not reconstructible from params) and stashes them; this module is
// a PURE function of that geometry, so every anchor sits on real painted geometry
// by construction. It is deliberately generic over "a field of circular
// containers" rather than named for one pattern — Circle Packing is its first
// caller and Phyllotaxis, whose seeds have the same shape, is a later one.
//
// ANCHOR IDENTITY IS NORMATIVE. `cell:<index>` over the SURVIVING container list,
// in the host's own order. Override records match by exact id before falling back
// to spatial rebinding, and randomised Slots hash the id, so two implementations
// choosing different schemes would both pass their extractor tests and behave
// differently under reseed, override reset and hashed Slot assignment. Ids are
// POSITIONAL: changing the host's seed (or any param that changes which
// containers exist) renumbers them, and overrides then fall through to spatial
// rebinding — the same contract the Voronoi cell role already has. There is no
// symmetry-copy suffix because every current caller hardcodes symmetry to 1; a
// caller with a real symmetry control must append the copy index the way
// gridAnchors does (`anchorId(role, …parts, copyIndex)`).
//
// COINCIDENT CENTRES ARE COLLAPSED, not emitted. A nested-render packing draws
// several concentric circles per site sharing one centre; if such a set ever
// reached the engine the empty-circle test would silently reduce it to one glyph
// with no diagnostic. Collapsing here — keeping the LARGEST radius, which is the
// outer ring the maker sees — makes that a property of the module rather than an
// accident of the caller. (Callers should still stash their ACCEPTED set; this is
// the belt, not the braces.)

import { anchorId } from './anchors.js';

const HALF_PI = Math.PI / 2;

/**
 * @typedef {{x:number, y:number, r:number}} Container  world (canvas-pixel) coords
 */

/**
 * `cell` anchors for a field of circular containers.
 * @param {Container[]} circles  container circles in WORLD coords, host order.
 * @returns {Array<object>} one anchor per surviving container (never null).
 */
export function pointHostAnchors(circles) {
  if (!Array.isArray(circles)) return [];

  // Collapse coincident centres, keeping the largest radius (the outer ring).
  // Exact-coordinate keys, matching the Voronoi extractor's dedup: quantizing
  // would risk a false merge of two genuinely distinct neighbouring containers.
  const byCentre = new Map();
  const order = [];
  for (const c of circles) {
    if (!c) continue;
    const { x, y, r } = c;
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    if (!Number.isFinite(r) || r <= 0) continue;
    const key = `${x},${y}`;
    const seen = byCentre.get(key);
    if (seen) {
      if (r > seen.r) seen.r = r;
      continue;
    }
    const entry = { x, y, r };
    byCentre.set(key, entry);
    order.push(entry);
  }

  return order.map((c, i) => ({
    id: anchorId('cell', i),
    role: 'cell',
    x: c.x,
    y: c.y,
    // Fixed cell convention (tangent +x, normal +y) — a container centre has no
    // canonical direction. Matches the Grid / Recursive / Voronoi cell role.
    tangent: 0,
    normal: HALF_PI,
    s: 0,
    // TOP-LEVEL, never in meta: this is a placement-critical engine input.
    hostRadius: c.r,
    meta: { cell: i },
  }));
}
