// Motif Sequencer ZONES — partition surviving anchors into maker-facing Zones
// (Apex / Stem) and resolve the Apex end-selector. Pure, deterministic, headless
// (no p5/DOM/React). See docs/adr/0008-zoned-sequencer-and-mode-identity.md.
//
// A Zone is a structural partition of the survivor set, built FROM internal
// anchor roles but distinct from them (ADR 0008; CONTEXT.md Apex/Stem):
//   • Apex = path termini — where a vine flowers. Semantic hosts expose these as
//     `tip` anchors; edge-captured hosts emit only uniform `edge` samples, so on
//     an OPEN path that carries NO tip we DERIVE the termini as the min-`s` and
//     max-`s` edge samples (traversal ends). A single edge sample on such a path
//     is itself a terminus. Closed loops have no Apex.
//   • Stem = the interior body: `crossing` junctions (botanically, nodes are
//     where leaves sprout) ∪ non-terminus `edge` samples. Covers a closed loop
//     whole.
//   • `cell` anchors are off the plant — excluded from both Zones.
//   • Unknown roles fall to Stem (lenient: they are interior-ish, and Stem is the
//     zone that safely covers "everything not clearly an end").
//
// Membership is decided PER PATH (pathKey = meta.pathIndex ?? 0, same convention
// as chain.js). Input order is preserved within each returned partition.

const pathKey = (a) => (a && a.meta && a.meta.pathIndex != null ? a.meta.pathIndex : 0);

/**
 * Partition anchors into { apex, stem } Zones (see module header). Two-pass: first
 * derive the terminus edge-anchor ids per open/no-tip path, then one input-order
 * pass assigns each anchor, so global input order is preserved for free.
 * @param {import('./chain.js').Anchor[]} anchors
 * @returns {{apex: import('./chain.js').Anchor[], stem: import('./chain.js').Anchor[]}}
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
  for (const a of list) {
    if (a.role === 'tip') {
      apex.push(a);
    } else if (a.role === 'crossing') {
      stem.push(a);
    } else if (a.role === 'cell') {
      // excluded from both Zones (off the plant).
    } else if (a.role === 'edge') {
      if (terminusIds.has(a.id)) apex.push(a);
      else stem.push(a);
    } else {
      stem.push(a); // unknown roles → Stem (lenient).
    }
  }

  return { apex, stem };
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
