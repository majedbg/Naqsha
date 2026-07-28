// Motif Sequencer ZONES — partition surviving anchors into maker-facing Zones
// (Apex / Stem / Cell) and resolve the Apex end-selector. Pure, deterministic,
// headless (no p5/DOM/React). See docs/adr/0008-zoned-sequencer-and-mode-identity.md
// and its "Cell is a third Zone" amendment (#150, PRD #143).
//
// A Zone is a structural partition of the survivor set, built FROM internal
// anchor roles but distinct from them (ADR 0008; CONTEXT.md Apex/Stem/Cell):
//   • Apex = path termini — where a vine flowers. Semantic hosts expose these as
//     `tip` anchors; edge-captured hosts emit only uniform `edge` samples, so on
//     an OPEN path that carries NO tip we DERIVE the termini as the min-`s` and
//     max-`s` edge samples (traversal ends). A single edge sample on such a path
//     is itself a terminus. Closed loops have no Apex.
//   • Stem = the interior body: `crossing` junctions (botanically, nodes are
//     where leaves sprout) ∪ non-terminus `edge` samples. Covers a closed loop
//     whole.
//   • Cell = the enclosed regions of the host — a packed circle, a tile, a face.
//     Off the plant, which is exactly why it is its OWN Zone rather than folded
//     into Stem: it has no ends and no direction. Before #150 `cell` anchors
//     belonged to no Zone at all, and the zoned deal rests every anchor it finds
//     in no Zone, so a zoned mode on a cell-only host rendered NOTHING.
//   • Unknown roles fall to Stem (lenient: they are interior-ish, and Stem is the
//     zone that safely covers "everything not clearly an end"). Cell takes the
//     `cell` role and nothing else — a Zone that silently absorbed unrecognised
//     anchors would make the partition unpredictable on every future host.
//
// THE PARTITION IS NOT THE DEAL. Returning a third bucket changes no output on
// its own: `dealSlotsZoned` deals only the zone ids a chain's `zones` array
// actually names and rests everything else, so a stored two-Zone chain still
// rests its cells. That is what keeps this addition additive.
//
// Membership is decided PER PATH (pathKey = meta.pathIndex ?? 0, same convention
// as chain.js). Input order is preserved within each returned partition.

const pathKey = (a) => (a && a.meta && a.meta.pathIndex != null ? a.meta.pathIndex : 0);

/**
 * The Zone ids this module partitions into, in canonical (display and deal)
 * order. THE single source of truth: `partitionZones` returns exactly these keys
 * and the zoned deal walks exactly this list, so the partition and the deal
 * cannot drift. There is no schema validation of zone ids anywhere in the
 * codebase — an id outside this set rests its members rather than throwing — so a
 * new partition is added HERE and nowhere else.
 * @type {readonly ['apex','stem','cell']}
 */
export const ZONE_IDS = Object.freeze(['apex', 'stem', 'cell']);

/**
 * Partition anchors into { apex, stem, cell } Zones (see module header). Two-pass:
 * first derive the terminus edge-anchor ids per open/no-tip path, then one
 * input-order pass assigns each anchor, so global input order is preserved for
 * free.
 *
 * Pass 1 reads `closed`/`tip`/`edge` only — a `cell` anchor can never suppress
 * another Zone's terminus derivation, which is what makes bucketing cells leave
 * Apex and Stem membership byte-identical (asserted per real host in
 * cellZone.integration.test.js).
 * @param {import('./chain.js').Anchor[]} anchors
 * @returns {{apex: import('./chain.js').Anchor[], stem: import('./chain.js').Anchor[],
 *            cell: import('./chain.js').Anchor[]}}
 */
export function partitionZones(anchors) {
  const list = Array.isArray(anchors) ? anchors : [];

  // Pass 1 — group by path; note whether each path is closed / has a tip; collect
  // its edge anchors so we can derive termini for open, tip-less paths.
  const groups = new Map();
  for (const a of list) {
    const p = pathKey(a);
    let g = groups.get(p);
    if (!g) {
      g = { closed: false, hasTip: false, edges: [] };
      groups.set(p, g);
    }
    if (a.meta && a.meta.closed === true) g.closed = true;
    if (a.role === 'tip') g.hasTip = true;
    if (a.role === 'edge') g.edges.push(a);
  }

  // Terminus edge-anchor ids: on an OPEN, tip-less path, the min-`s` and max-`s`
  // edge samples are the traversal ends. A single edge sample is both.
  const terminusIds = new Set();
  for (const g of groups.values()) {
    if (g.closed || g.hasTip || g.edges.length === 0) continue;
    let min = g.edges[0];
    let max = g.edges[0];
    for (const e of g.edges) {
      if (e.s < min.s) min = e;
      if (e.s > max.s) max = e;
    }
    terminusIds.add(min.id);
    terminusIds.add(max.id);
  }

  // Pass 2 — assign in input order.
  const apex = [];
  const stem = [];
  const cell = [];
  for (const a of list) {
    if (a.role === 'tip') {
      apex.push(a);
    } else if (a.role === 'crossing') {
      stem.push(a);
    } else if (a.role === 'cell') {
      cell.push(a); // the enclosed regions — their own Zone since #150.
    } else if (a.role === 'edge') {
      if (terminusIds.has(a.id)) apex.push(a);
      else stem.push(a);
    } else {
      stem.push(a); // unknown roles → Stem (lenient).
    }
  }

  return { apex, stem, cell };
}

/**
 * Which Zones a host emitting `roles` can actually FILL — the role→Zone reading
 * rule, stated once, beside the partitioner that implements it.
 *
 * This exists so the Sequencer UI can show only the Zones that can receive an
 * anchor (a cell-only host has no Apex and no Stem to flower or leaf along)
 * WITHOUT growing its own host conditional. Callers pass `rolesForHost(type,
 * params)` — the one host→roles capability seam — and get Zone ids back.
 *
 * Mirrors `partitionZones` exactly, including its leniency:
 *   • Apex ← `tip`, or `edge` (an open captured path's termini are derived).
 *   • Stem ← anything that is neither `cell` nor `tip`: `crossing`, `edge`, and
 *     any unrecognised role, which the partitioner also drops into Stem.
 *   • Cell ← `cell`.
 * @param {string[]} roles  the anchor roles the host emits
 * @returns {string[]} zone ids in ZONE_IDS order; `[]` for no roles
 */
export function zonesForRoles(roles) {
  const set = new Set(Array.isArray(roles) ? roles : []);
  const feeds = {
    apex: set.has('tip') || set.has('edge'),
    stem: [...set].some((r) => r !== 'cell' && r !== 'tip'),
    cell: set.has('cell'),
  };
  return ZONE_IDS.filter((id) => feeds[id]);
}

/**
 * Apply the Apex end-selector, keeping one member per path for 'up'/'down'.
 * The choice is SPATIAL — lexicographic on (y, x), never drawing order, which is
 * invisible and arbitrary on captured hosts (ADR 0008):
 *   • 'both' / undefined ⇒ identity (every Apex member kept).
 *   • 'up'   ⇒ per path, keep ONLY the member with the SMALLEST (y, x).
 *   • 'down' ⇒ per path, keep ONLY the member with the LARGEST (y, x).
 * A path with a single Apex member keeps it under either selector. Input order is
 * preserved (the survivors are filtered, never reordered).
 * @param {import('./chain.js').Anchor[]} apexAnchors
 * @param {'both'|'up'|'down'} [ends]
 * @returns {import('./chain.js').Anchor[]}
 */
export function applyEnds(apexAnchors, ends) {
  const list = Array.isArray(apexAnchors) ? apexAnchors : [];
  if (ends !== 'up' && ends !== 'down') return list.slice(); // 'both'/undefined = identity.

  // Winner id per path: smallest (y,x) for 'up', largest for 'down'.
  const winners = new Map(); // pathKey → anchor
  for (const a of list) {
    const p = pathKey(a);
    const cur = winners.get(p);
    if (cur == null) {
      winners.set(p, a);
      continue;
    }
    const better =
      ends === 'up'
        ? a.y < cur.y || (a.y === cur.y && a.x < cur.x)
        : a.y > cur.y || (a.y === cur.y && a.x > cur.x);
    if (better) winners.set(p, a);
  }
  const keep = new Set([...winners.values()].map((a) => a.id));
  return list.filter((a) => keep.has(a.id));
}
