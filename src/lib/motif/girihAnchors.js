// girihAnchors — module C of PRD #143 (#152). Turns a girih SKELETON GRAPH into
// strand-decomposed `crossing` / `edge` / `tip` anchors.
//
// GEOMETRY-IN, like the Voronoi and Circle Packing extractors: the host resolves
// its own skeleton (seed-driven under `irregularity`, and not reconstructible
// from params) and stashes the de-duplicated VERTEX GRAPH plus the SKELETON EDGE
// LIST; this module is a PURE function of that graph. Anchors therefore sit on
// painted geometry by construction, and the host's RENDER MODE is irrelevant —
// the graph is built before IslamicStar branches into strap lines (skeleton) or
// woven band polygons (interlace).
//
// ── THE DECOMPOSITION IS SPECIFIED, NOT INVENTED ────────────────────────────
// Chain blocks and Slot cycles restart per path, and Apex selects one end-member
// per path, so a graph with no path structure produces arbitrary rhythms and a
// single Apex for the whole field. PRD #143 therefore specifies it:
//
//   A girih strap IS a chain of skeleton edges joined at degree-two BEND
//   vertices. So: walk maximal chains of degree-two vertices, cutting at every
//   vertex of degree one or three-or-more. Each chain is one path, with arc
//   position running along it and a `closed` flag for chains returning to their
//   start.
//
// NOTE this is deliberately NOT the strand tracing inside IslamicStar's
// `buildInterlace`, which runs STRAIGHT THROUGH a crossing (a weave ribbon must
// be one continuous band). The motif host cuts AT the crossing, because a
// crossing is a maker-facing structural anchor and a Chain rhythm should restart
// at it. Two different questions on the same graph; do not "fix" one to match
// the other. Likewise IslamicStar's `isCrossing` is `degree === 4` (a weave
// crossing); the host's crossing is degree >= 3 (straps meeting, weaving or not).
//
// ── VERTEX DEGREE HAS THREE CASES, NOT TWO ──────────────────────────────────
//   • degree 1      → `tip`. Belongs to its single incident strand.
//   • degree >= 3   → `crossing`. Belongs to SEVERAL strands by construction, so
//                     it carries the LOWEST incident strand index as its
//                     `meta.pathIndex` and the FULL incident set as
//                     `meta.strands` — canvas path-picking then finds it from any
//                     of its straps.
//   • degree 2      → a strap BEND: neither tip nor crossing. It is interior to
//                     its strand and belongs to the EDGE role — meaning it is
//                     COVERED by the edge run through it, not that it becomes an
//                     anchor of its own. Edge anchors sit at skeleton-edge
//                     MIDPOINTS ("edge anchors land on their edge with a tangent
//                     along it", PRD testing §C); a vertex is not "their edge"
//                     and has no unambiguous tangent. This is the case an
//                     implementation is most likely to mis-file as a crossing, so
//                     it is tested explicitly.
//   • degree 0      → NOTHING. IslamicStar's crop drops EDGES and never touches
//                     its vertex array, so an orphaned endpoint is on no strand
//                     at all. The pattern re-indexes its stash onto the referenced
//                     set; this guard is the belt to that braces, because the
//                     module is also handed literal test geometry.
//
// ── GIRIH TIPS ARE CROP-MARGIN ARTIFACTS ────────────────────────────────────
// The skeleton is built from a tiling that overruns the canvas and is then
// filtered to a margin WIDER than the canvas itself, so a loose end is a cut edge
// at that margin, not a feature of the tiling. It is a ragged ring rather than a
// designed border — and measured against the shipping pattern, EVERY tip sits
// OUTSIDE the visible canvas (see girihHost.integration.test.js, which pins
// that). Tip anchors are still emitted, honestly, at the cut points; whether a
// glyph is PLACED on one is the placement boundary's business, not this module's.
//
// ── STRAND ORDERING IS DETERMINISTIC, FROM A STABLE SORT OF THE GRAPH ───────
// Never from iteration order. Vertices are RANKED by (x, y, index); the walk is
// seeded and branched in rank order, and the resulting strands are then sorted by
// their canonical rank sequence. Feeding the same graph with permuted vertex and
// edge arrays yields byte-identical anchors — the property `girihAnchors.test.js`
// asserts, and the only one that actually catches iteration-order dependence.
//
// ── ANCHOR IDENTITY IS NORMATIVE ────────────────────────────────────────────
// Override records match by exact anchor id before falling back to spatial
// rebinding, and randomised Slots hash the id, so the scheme is specified rather
// than left open:
//   • `crossing:<i>`             i = index among crossings, in ascending rank.
//   • `tip:<strand>:start|end`   which END of its strand the tip is.
//   • `edge:<strand>:<k>`        k = the edge's position ALONG the strand.
// Ids are POSITIONAL: reseeding, or any param that changes the skeleton,
// renumbers them and overrides fall through to spatial rebinding — the same
// contract Voronoi's and Circle Packing's cell roles already have. There is no
// symmetry-copy suffix because IslamicStar hardcodes symmetry to 1; a host with a
// real symmetry control must append the copy index the way gridAnchors does.

import { anchorId } from './anchors.js';

const HALF_PI = Math.PI / 2;

/**
 * @typedef {{x:number, y:number}} Vertex  world (canvas-pixel) coords
 * @typedef {[number, number]} Edge  an undirected pair of indices into `vertices`
 */

/**
 * Lexicographic comparison of two equal-typed number sequences; a proper prefix
 * sorts first.
 */
function compareSeq(a, b) {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return a.length - b.length;
}

/**
 * `crossing` / `edge` / `tip` anchors for a girih skeleton graph.
 *
 * @param {Vertex[]} vertices  de-duplicated skeleton vertices in WORLD coords.
 * @param {Edge[]} edges       undirected index pairs. Self-loops, duplicates and
 *                             out-of-range indices are ignored.
 * @returns {Array<object>} anchors in a fixed emission order — crossings (by
 *   ascending vertex rank), then tips (by ascending rank), then edges (by strand,
 *   then by arc position along that strand). Never null; `[]` for an empty graph.
 */
export function girihGraphAnchors(vertices, edges) {
  if (!Array.isArray(vertices) || !Array.isArray(edges)) return [];
  const N = vertices.length;
  if (N === 0) return [];

  // ── 1. Clean, de-duplicated undirected edge set ───────────────────────────
  const seen = new Set();
  const E = [];
  for (const e of edges) {
    if (!Array.isArray(e) || e.length < 2) continue;
    const a = e[0];
    const b = e[1];
    if (!Number.isInteger(a) || !Number.isInteger(b)) continue;
    if (a < 0 || b < 0 || a >= N || b >= N || a === b) continue;
    const v = vertices[a];
    const w = vertices[b];
    if (!v || !w) continue;
    if (!Number.isFinite(v.x) || !Number.isFinite(v.y)) continue;
    if (!Number.isFinite(w.x) || !Number.isFinite(w.y)) continue;
    const key = a < b ? `${a},${b}` : `${b},${a}`;
    if (seen.has(key)) continue;
    seen.add(key);
    E.push([a, b]);
  }
  if (E.length === 0) return [];

  // ── 2. Adjacency + degree (from the SURVIVING edges only) ─────────────────
  const adj = Array.from({ length: N }, () => []); // vertex → [{ to, ei }]
  E.forEach(([a, b], ei) => {
    adj[a].push({ to: b, ei });
    adj[b].push({ to: a, ei });
  });
  const degree = adj.map((list) => list.length);

  // ── 3. RANK — a stable sort of the graph, never iteration order ───────────
  const rank = new Array(N).fill(-1);
  const order = [];
  for (let i = 0; i < N; i++) if (degree[i] > 0) order.push(i);
  order.sort((i, j) => {
    const a = vertices[i];
    const b = vertices[j];
    if (a.x !== b.x) return a.x - b.x;
    if (a.y !== b.y) return a.y - b.y;
    return i - j; // exact coincidence: fall back to input index (deduped anyway).
  });
  order.forEach((v, i) => {
    rank[v] = i;
  });
  // Branch out of every vertex in ascending neighbour rank, so the walk itself is
  // input-order independent.
  for (let v = 0; v < N; v++) {
    if (degree[v] === 0) continue;
    adj[v].sort((p, q) => rank[p.to] - rank[q.to] || p.ei - q.ei);
  }

  // ── 4. Walk maximal chains of degree-two vertices ─────────────────────────
  // Cut at every vertex of degree 1 or >= 3. Seeded from the junction/terminal
  // vertices in ascending rank; whatever edges remain afterwards are pure
  // degree-two CYCLES and are walked second.
  const usedEdge = new Uint8Array(E.length);
  /** @type {{nodes:number[], closed:boolean}[]} */
  const strands = [];

  const stepFrom = (node, viaEi) => {
    // The one incident edge that is not `viaEi` (node has degree 2 here).
    for (const n of adj[node]) if (n.ei !== viaEi) return n;
    return null;
  };

  for (const start of order) {
    if (degree[start] === 2) continue; // an interior bend never seeds a strand.
    for (const first of adj[start]) {
      if (usedEdge[first.ei]) continue;
      usedEdge[first.ei] = 1;
      const nodes = [start, first.to];
      let cur = first.to;
      let viaEi = first.ei;
      while (degree[cur] === 2) {
        const next = stepFrom(cur, viaEi);
        if (!next || usedEdge[next.ei]) break;
        usedEdge[next.ei] = 1;
        nodes.push(next.to);
        cur = next.to;
        viaEi = next.ei;
      }
      strands.push({ nodes, closed: nodes[0] === nodes[nodes.length - 1] });
    }
  }

  // Remaining edges form closed cycles of degree-two vertices only.
  for (const seedV of order) {
    if (degree[seedV] !== 2) continue;
    const seedEdge = adj[seedV].find((n) => !usedEdge[n.ei]);
    if (!seedEdge) continue;
    usedEdge[seedEdge.ei] = 1;
    const nodes = [seedV];
    let cur = seedEdge.to;
    let viaEi = seedEdge.ei;
    while (cur !== seedV) {
      nodes.push(cur);
      const next = stepFrom(cur, viaEi);
      if (!next || usedEdge[next.ei]) break;
      usedEdge[next.ei] = 1;
      cur = next.to;
      viaEi = next.ei;
    }
    strands.push({ nodes, closed: true }); // cycle: first vertex NOT repeated.
  }

  // ── 5. Canonicalise each strand's direction, then sort the strands ────────
  // Direction: whichever traversal has the lexicographically smaller rank
  // sequence. For a closed cycle, first rotate the minimum-rank vertex to the
  // front (in both directions) and compare. This makes `s`, the edge order and
  // every id independent of which end the walk happened to start from.
  for (const strand of strands) {
    const { nodes, closed } = strand;
    if (closed && nodes[0] === nodes[nodes.length - 1]) {
      // A loop that leaves a junction and comes back: keep the repeated end (the
      // junction is a real endpoint) and only choose the cheaper direction.
      const fwd = nodes.map((v) => rank[v]);
      const rev = [...nodes].reverse().map((v) => rank[v]);
      if (compareSeq(rev, fwd) < 0) strand.nodes = [...nodes].reverse();
    } else if (closed) {
      // A pure cycle (no repeated end). Rotate the min-rank vertex to the front.
      let best = 0;
      for (let i = 1; i < nodes.length; i++) if (rank[nodes[i]] < rank[nodes[best]]) best = i;
      const n = nodes.length;
      const fwd = [];
      const rev = [];
      for (let i = 0; i < n; i++) {
        fwd.push(nodes[(best + i) % n]);
        rev.push(nodes[(best - i + n) % n]);
      }
      strand.nodes = compareSeq(rev.map((v) => rank[v]), fwd.map((v) => rank[v])) < 0 ? rev : fwd;
    } else {
      const fwd = nodes.map((v) => rank[v]);
      const rev = [...nodes].reverse().map((v) => rank[v]);
      if (compareSeq(rev, fwd) < 0) strand.nodes = [...nodes].reverse();
    }
    strand.key = strand.nodes.map((v) => rank[v]);
  }
  strands.sort((a, b) => compareSeq(a.key, b.key));

  // ── 6. Per-vertex strand membership ───────────────────────────────────────
  const incident = new Map(); // vertex → sorted unique strand indices
  strands.forEach((strand, si) => {
    for (const v of strand.nodes) {
      let list = incident.get(v);
      if (!list) {
        list = [];
        incident.set(v, list);
      }
      if (list[list.length - 1] !== si) list.push(si);
    }
  });

  const anchors = [];

  // ── 7. CROSSINGS (degree >= 3), in ascending rank ─────────────────────────
  let ci = 0;
  for (const v of order) {
    if (degree[v] < 3) continue;
    const strandsHere = incident.get(v) || [];
    anchors.push({
      id: anchorId('crossing', ci),
      role: 'crossing',
      x: vertices[v].x,
      y: vertices[v].y,
      // A vertex has no canonical direction — the fixed convention every other
      // crossing/cell role in the studio uses.
      tangent: 0,
      normal: HALF_PI,
      s: 0,
      meta: {
        junction: true,
        degree: degree[v],
        // LOWEST incident strand as the path, FULL set in `strands` — so canvas
        // path-picking finds this crossing from any of its straps.
        pathIndex: strandsHere.length ? strandsHere[0] : 0,
        strands: strandsHere,
      },
    });
    ci += 1;
  }

  // ── 8. TIPS (degree 1), in ascending rank ─────────────────────────────────
  // Each belongs to exactly one strand and is one of its two ends. `tangent`
  // points OUTWARD along the strap (away from the strand), and `normal` is
  // tangent+PI/2 — the same relationship the edge anchors carry, so a glyph reads
  // consistently whether it sits on the strap or at its end.
  for (const v of order) {
    if (degree[v] !== 1) continue;
    const si = (incident.get(v) || [0])[0];
    const nodes = strands[si].nodes;
    const atStart = nodes[0] === v;
    const neighbour = atStart ? nodes[1] : nodes[nodes.length - 2];
    const dx = vertices[v].x - vertices[neighbour].x;
    const dy = vertices[v].y - vertices[neighbour].y;
    const tangent = dx === 0 && dy === 0 ? 0 : Math.atan2(dy, dx);
    anchors.push({
      id: anchorId('tip', si, atStart ? 'start' : 'end'),
      role: 'tip',
      x: vertices[v].x,
      y: vertices[v].y,
      tangent,
      normal: tangent + HALF_PI,
      s: 0,
      meta: {
        pathIndex: si,
        end: atStart ? 'start' : 'end',
        closed: false, // a closed strand has no free end, hence no tip.
        degree: 1,
      },
    });
  }

  // ── 9. EDGES — one per skeleton edge, at its midpoint, in ARC ORDER ───────
  // `s` is the arc-length position of the midpoint along its strand, so a
  // positional rhythm (every-Nth, Slot cycle) runs the LENGTH of the strap
  // instead of restarting at every bend, and Zones' derived-terminus rule reads
  // the true traversal ends.
  strands.forEach((strand, si) => {
    const { nodes, closed } = strand;
    const pureCycle = closed && nodes[0] !== nodes[nodes.length - 1];
    const count = pureCycle ? nodes.length : nodes.length - 1;
    let s = 0;
    for (let k = 0; k < count; k++) {
      const a = vertices[nodes[k]];
      const b = vertices[nodes[(k + 1) % nodes.length]];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len = Math.hypot(dx, dy);
      const tangent = len === 0 ? 0 : Math.atan2(dy, dx);
      anchors.push({
        id: anchorId('edge', si, k),
        role: 'edge',
        x: (a.x + b.x) / 2,
        y: (a.y + b.y) / 2,
        tangent,
        normal: tangent + HALF_PI,
        s: s + len / 2,
        meta: { pathIndex: si, edgeIndex: k, closed },
      });
      s += len;
    }
  });

  return anchors;
}
