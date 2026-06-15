import { Pattern } from './drawingContext';
import { applySymmetryDraw } from './symmetryUtils';

/**
 * IslamicStar (Girih) — generative Islamic star patterns via Hankin's
 * "polygons-in-contact" (PIC) method.
 *
 * Reference: Craig S. Kaplan, "Islamic Star Patterns from Polygons in Contact"
 * (Graphics Interface 2005). https://cs.uwaterloo.ca/~csk/publications/Papers/kaplan_2005.pdf
 *
 * ----------------------------------------------------------------------------
 * THE ALGORITHM (faithful to the paper)
 * ----------------------------------------------------------------------------
 * 1. Tile the plane with a chosen polygon tiling (the "network"; hidden in the
 *    final art). Each tile is a convex polygon given as a CCW vertex list.
 * 2. The midpoint of every tile edge is a CONTACT POINT. From each contact point
 *    we emit TWO rays *inward*, each making the CONTACT ANGLE θ with the edge —
 *    one tilted +θ, one tilted -θ. The two rays form half an "X". Because the
 *    SAME edge midpoint is shared by the neighbouring tile (which emits the
 *    mirror-image rays), the half-X on each side completes into a full X that
 *    spans the shared edge → straps connect ACROSS tile boundaries by
 *    construction (PITFALL 1). We verify this with shared-edge contact keys.
 * 3. MOTIF INFERENCE (per tile): a tile with n edges has 2n inward rays. We pair
 *    them up greedily: for every pair of rays compute their forward intersection
 *    P; cost = |AP| + |PD| (or, for collinear rays pointing at each other, the
 *    straight length |AD|). Sort all candidate pairs by cost ascending and walk
 *    them, accepting a pair iff neither ray is used yet. An accepted pair becomes
 *    the bent strap segment  A → P → D  (two skeleton edges meeting at P). On a
 *    regular n-gon this yields the familiar n-pointed star motif.
 * 4. The union of all accepted strap segments across all tiles is the SKELETON.
 *    Skeleton vertices are de-duplicated on a quantised grid so that a strap
 *    leaving one tile and the strap entering the neighbour share the *exact same*
 *    contact-point vertex (the join), giving one continuous network.
 * 5. IRREGULARITY (optional, PITFALL 3): jitter is applied to the SKELETON
 *    vertices BEFORE banding, consistently per unique vertex (same key → same
 *    displacement), so shared joins stay shared and the weave survives.
 * 6. INTERLACE (optional): trace each continuous STRAND through the skeleton.
 *    Offset two parallel band edges either side of the strand centre-line. Walk
 *    the strands, and at every crossing alternate over/under ALONG THE STRAND
 *    (PITFALL 2 — alternation is per-strand, not per-crossing) so the result is a
 *    consistent woven interlace, with the under-strand broken by a small gap at
 *    each crossing it dives beneath.
 *
 * Determinism: ctx.randomSeed(seed); irregularity jitter via ctx.random only.
 * Built ONCE in origin-centered coords; drawBase replays it and the SVG strings
 * are emitted from the same arrays (canvas == SVG). Symmetry is hardcoded to 1.
 */

const Q = 1e3; // quantisation for vertex de-dup / shared-edge keys (3 dp)
const vkey = (x, y) => `${Math.round(x * Q)},${Math.round(y * Q)}`;
const EPS = 1e-6;

export default class IslamicStar extends Pattern {
  generate(ctx, seed, params, canvasW, canvasH, color, opacity) {
    ctx.randomSeed(seed);
    this.svgElements = [];

    const {
      tiling = 'square8',
      contactAngle = 60,
      density = 4,
      render = 'interlaced',
      bandWidth = 4,
      irregularity = 0,
      strokeWeight = 0.8,
      startAngle = 0,
      offsetX = 0,
      offsetY = 0,
    } = params || {};

    const cx = canvasW / 2;
    const cy = canvasH / 2;

    // --- 1. TILING --------------------------------------------------------
    // The chosen unit cell repeats `density` times across the SHORTER axis; the
    // tiling fills the canvas (origin-centered). Each tile is a CCW vertex list.
    const reps = Math.max(2, Math.round(density));
    const cell = Math.min(canvasW, canvasH) / reps; // unit-cell size in px
    const tiles = buildTiling(tiling, cell, canvasW, canvasH);

    // --- 2 & 3. PIC: rays + greedy motif inference per tile ---------------
    const theta = (Math.max(1, Math.min(89, contactAngle)) * Math.PI) / 180;

    // Skeleton edges as {ax,ay,bx,by}; shared contact-point vertices coincide
    // because both neighbours emit rays from the identical edge midpoint.
    const rawEdges = [];
    for (const tile of tiles) {
      const motif = inferMotif(tile, theta);
      for (const e of motif) rawEdges.push(e);
    }

    // --- 4. De-dup vertices onto a shared graph --------------------------
    // Map every endpoint to a canonical index; coincident endpoints (the shared
    // contact points + each strap's interior bend) merge into one graph node.
    const verts = [];           // [{x,y}]
    const vindex = new Map();   // vkey -> index
    const nodeOf = (x, y) => {
      const k = vkey(x, y);
      let i = vindex.get(k);
      if (i === undefined) {
        i = verts.length;
        verts.push({ x, y });
        vindex.set(k, i);
      }
      return i;
    };
    // Undirected edge set (dedup by sorted index pair) → the skeleton graph.
    const edgeSet = new Map(); // "i,j" -> [i,j]
    for (const e of rawEdges) {
      const a = nodeOf(e.ax, e.ay);
      const b = nodeOf(e.bx, e.by);
      if (a === b) continue;
      const key = a < b ? `${a},${b}` : `${b},${a}`;
      if (!edgeSet.has(key)) edgeSet.set(key, [a, b]);
    }
    let edges = [...edgeSet.values()];

    // --- 5. IRREGULARITY on skeleton vertices (consistent per vertex) -----
    if (irregularity > 0) {
      const amp = irregularity * cell * 0.06; // bounded, small
      for (const v of verts) {
        v.x += ctx.random(-amp, amp);
        v.y += ctx.random(-amp, amp);
      }
    }

    // --- crop to a generous canvas margin (drop fully-outside edges) ------
    const mx = canvasW * 0.55;
    const my = canvasH * 0.55;
    const inBounds = (p) => p.x >= -mx && p.x <= mx && p.y >= -my && p.y <= my;
    edges = edges.filter(([a, b]) => inBounds(verts[a]) || inBounds(verts[b]));

    if (render === 'skeleton' || bandWidth <= 0) {
      this._emitSkeleton(verts, edges, color, strokeWeight);
    } else {
      this._emitInterlace(verts, edges, color, strokeWeight, bandWidth);
    }

    const drawBase = makeDrawBase(ctx, this._draws, color, opacity, strokeWeight);
    applySymmetryDraw(ctx, 1, cx, cy, drawBase, (startAngle * Math.PI) / 180, offsetX, offsetY);
  }

  // Skeleton render: one <line> per skeleton edge.
  _emitSkeleton(verts, edges, color, strokeWeight) {
    this._draws = { lines: [], polys: [] };
    for (const [a, b] of edges) {
      const va = verts[a];
      const vb = verts[b];
      this._draws.lines.push({ x1: va.x, y1: va.y, x2: vb.x, y2: vb.y });
      this.svgElements.push(
        `<line x1="${f(va.x)}" y1="${f(va.y)}" x2="${f(vb.x)}" y2="${f(vb.y)}" stroke="${color}" stroke-width="${strokeWeight}" stroke-linecap="round"/>`
      );
    }
  }

  // Interlace render: trace strands, band them, weave over/under per strand,
  // break the under-strand at each crossing it passes beneath.
  _emitInterlace(verts, edges, color, strokeWeight, bandWidth) {
    this._draws = { lines: [], polys: [] };
    const bands = buildInterlace(verts, edges, bandWidth);
    for (const poly of bands) {
      const pts = poly.map((p) => `${f(p.x)},${f(p.y)}`).join(' ');
      this.svgElements.push(
        `<polyline points="${pts}" fill="none" stroke="${color}" stroke-width="${strokeWeight}" stroke-linecap="round" stroke-linejoin="round"/>`
      );
      this._draws.polys.push(poly);
    }
  }

  contentFor() {
    return this.svgElements.join('\n');
  }
}

// ===========================================================================
// SVG/number helpers
// ===========================================================================
const f = (n) => (Math.round(n * 100) / 100).toString();

function makeDrawBase(ctx, draws, color, opacity, strokeWeight) {
  return () => {
    const c = ctx.color(color);
    c.setAlpha(Math.round((opacity / 100) * 255));
    ctx.noFill();
    ctx.stroke(c);
    ctx.strokeWeight(strokeWeight);
    ctx.strokeCap(ctx.ROUND);
    for (const l of draws.lines) ctx.line(l.x1, l.y1, l.x2, l.y2);
    for (const poly of draws.polys) {
      ctx.beginShape();
      for (const p of poly) ctx.vertex(p.x, p.y);
      ctx.endShape();
    }
  };
}

// ===========================================================================
// MOTIF INFERENCE (PIC core) — Kaplan §3
// ===========================================================================
/**
 * Build the strap segments for one polygon tile.
 * @param {{x,y}[]} poly  CCW vertex list of the tile
 * @param {number} theta  contact angle in radians
 * @returns {{ax,ay,bx,by}[]}  skeleton edges (each accepted pair = A→P + P→D)
 */
function inferMotif(poly, theta) {
  const n = poly.length;
  // Tile centroid — used to orient "inward".
  let ccx = 0;
  let ccy = 0;
  for (const p of poly) { ccx += p.x; ccy += p.y; }
  ccx /= n; ccy /= n;

  // For each edge, two rays from its midpoint, each at angle theta to the edge,
  // both pointing INWARD (toward centroid side).
  const rays = []; // { ox, oy, dx, dy }  origin + unit direction
  for (let i = 0; i < n; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % n];
    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2;
    // Edge unit vector.
    let ex = b.x - a.x;
    let ey = b.y - a.y;
    const el = Math.hypot(ex, ey) || 1;
    ex /= el; ey /= el;
    // Inward normal: rotate edge dir by +90° gives one normal; pick the one
    // pointing toward the centroid.
    let nx = -ey;
    let ny = ex;
    if ((ccx - mx) * nx + (ccy - my) * ny < 0) { nx = -nx; ny = -ny; }
    // The two rays make angle theta with the EDGE, tilting symmetrically about
    // the inward normal. Direction = normal rotated by ±(90° - theta) from the
    // edge... equivalently: dir = cos(beta)*normal ± sin(beta)*edge where the
    // angle to the edge is theta ⇒ angle to normal is (90°-theta), so we mix
    // sin(theta)*normal with cos(theta)*edge.
    const ct = Math.cos(theta);
    const st = Math.sin(theta);
    // Ray 1: leans toward +edge ; Ray 2: leans toward -edge.
    rays.push({ ox: mx, oy: my, dx: st * nx + ct * ex, dy: st * ny + ct * ey });
    rays.push({ ox: mx, oy: my, dx: st * nx - ct * ex, dy: st * ny - ct * ey });
  }

  // Candidate pairings: forward intersection of every pair of rays.
  const cand = [];
  for (let i = 0; i < rays.length; i++) {
    for (let j = i + 1; j < rays.length; j++) {
      const hit = rayIntersect(rays[i], rays[j]);
      if (hit) cand.push({ i, j, p: hit.p, cost: hit.cost });
    }
  }
  cand.sort((u, v) => u.cost - v.cost);

  // Greedy: accept the cheapest pair whose rays are both unused.
  const used = new Uint8Array(rays.length);
  const out = [];
  for (const c of cand) {
    if (used[c.i] || used[c.j]) continue;
    used[c.i] = 1;
    used[c.j] = 1;
    const ri = rays[c.i];
    const rj = rays[c.j];
    // Strap A → P → D : ri.origin → P and P → rj.origin (two skeleton edges).
    out.push({ ax: ri.ox, ay: ri.oy, bx: c.p.x, by: c.p.y });
    out.push({ ax: c.p.x, ay: c.p.y, bx: rj.ox, by: rj.oy });
  }
  return out;
}

/**
 * Forward intersection of two rays (origin + direction). Returns the meeting
 * point P and cost = |o1→P| + |o2→P|, only if both rays reach P forward (t>=0).
 * Collinear rays pointing toward each other return their midpoint join.
 */
function rayIntersect(r1, r2) {
  const { ox: x1, oy: y1, dx: dx1, dy: dy1 } = r1;
  const { ox: x2, oy: y2, dx: dx2, dy: dy2 } = r2;
  const denom = dx1 * dy2 - dy1 * dx2;
  if (Math.abs(denom) < EPS) {
    // Parallel / collinear. Accept only if collinear AND pointing toward each
    // other (so the straps meet head-on). Join at the midpoint of origins.
    const rx = x2 - x1;
    const ry = y2 - y1;
    const cross = rx * dy1 - ry * dx1;
    if (Math.abs(cross) > 1e-3) return null; // parallel but offset
    // Pointing toward each other: directions roughly opposite and origins
    // separated along that axis.
    if (dx1 * dx2 + dy1 * dy2 > -0.5) return null;
    const t = rx * dx1 + ry * dy1; // projection of o2-o1 onto dir1
    if (t <= EPS) return null;      // o2 not ahead of o1
    const px = x1 + dx1 * (t / 2);
    const py = y1 + dy1 * (t / 2);
    return { p: { x: px, y: py }, cost: t };
  }
  const t1 = ((x2 - x1) * dy2 - (y2 - y1) * dx2) / denom;
  const t2 = ((x2 - x1) * dy1 - (y2 - y1) * dx1) / denom;
  if (t1 < EPS || t2 < EPS) return null; // intersection behind a ray origin
  const px = x1 + dx1 * t1;
  const py = y1 + dy1 * t1;
  return { p: { x: px, y: py }, cost: t1 + t2 };
}

// ===========================================================================
// INTERLACE — trace strands, band, weave (Kaplan-style strapwork decoration)
// ===========================================================================
/**
 * Turn the skeleton graph into woven bands.
 *   - A STRAND is a maximal path that goes "straight through" each node it
 *     visits (at a degree-2 node it just continues; at a star centre /
 *     higher-degree node it picks the most collinear continuation). Strands are
 *     the continuous strapwork ribbons.
 *   - Each strand is offset into two parallel edges ±bandWidth/2 (a ribbon).
 *   - over/under alternates ALONG each strand (per-strand parity), and the
 *     under-strand ribbon is broken with a gap at each crossing it dives under.
 * Returns an array of polylines (each a band edge or band-edge fragment).
 */
function buildInterlace(verts, edges, bandWidth) {
  const N = verts.length;
  // adjacency
  const adj = Array.from({ length: N }, () => []);
  edges.forEach(([a, b], ei) => { adj[a].push({ to: b, ei }); adj[b].push({ to: a, ei }); });

  // --- 1. trace strands via a NODE PAIRING (rotation system). At every node we
  // deterministically pair each incident edge with its "straightest opposite"
  // (largest turn-angle = closest to going straight through). A strand entering
  // a node via edge e leaves via pair(e), so strands pass STRAIGHT THROUGH every
  // crossing as one coherent ribbon (instead of fragmenting at degree-4 nodes).
  // Each undirected edge has two directed half-edges; following the pairing from
  // any unused half-edge until we return traces one strand. -----------------
  const dirOf = (a, b) => {
    const dx = verts[b].x - verts[a].x;
    const dy = verts[b].y - verts[a].y;
    const l = Math.hypot(dx, dy) || 1;
    return { x: dx / l, y: dy / l };
  };
  // For node `n`, given we arrived FROM neighbour `from`, return the neighbour to
  // continue to: the incident edge whose direction is most opposite to the
  // arrival direction (straightest through). Degree-1 → dead end (null).
  const continueThrough = (n, from) => {
    const nb = adj[n];
    if (nb.length === 1) return null;            // dead end
    const inDir = dirOf(from, n);                // heading INTO n
    let best = null;
    let bestDot = -2;
    for (const { to } of nb) {
      if (to === from) continue;
      const od = dirOf(n, to);                   // candidate outgoing heading
      const dot = inDir.x * od.x + inDir.y * od.y; // 1 = perfectly straight
      if (dot > bestDot) { bestDot = dot; best = to; }
    }
    return best;
  };
  const usedDir = new Set(); // "from>to" half-edges consumed
  const dirKey = (a, b) => `${a}>${b}`;
  const strands = []; // each: [nodeIdx, ...]
  for (const [s0, s1] of edges) {
    for (const [a, b] of [[s0, s1], [s1, s0]]) {
      if (usedDir.has(dirKey(a, b))) continue;
      const path = [a];
      let prev = a;
      let cur = b;
      while (true) {
        if (usedDir.has(dirKey(prev, cur))) break;
        usedDir.add(dirKey(prev, cur));
        path.push(cur);
        const next = continueThrough(cur, prev);
        if (next === null || usedDir.has(dirKey(cur, next))) break;
        prev = cur;
        cur = next;
      }
      if (path.length >= 2) strands.push(path);
    }
  }

  // --- 2. crossings: a node visited by 2+ strands (or degree>=4) is a weave
  // crossing. Record, per node, every (strand, position-in-path) visit. ----
  const passAt = Array.from({ length: N }, () => []); // node -> [{strand, pos}]
  strands.forEach((path, si) => {
    path.forEach((node, pos) => passAt[node].push({ strand: si, pos }));
  });
  // A WEAVE crossing is a degree-4 graph node where two ribbons cross.
  const isCrossing = (node) => adj[node].length === 4;

  // --- 3. OVER/UNDER by 2-COLORING (PITFALL 2 done correctly). We build a
  // constraint graph whose nodes are CROSSING-VISITS — each (strand si, index k
  // of a crossing along that strand). Two kinds of "must-differ" edges:
  //   (a) SEQUENTIAL: consecutive crossings along the same strand must alternate
  //       over↔under  → guarantees over,under,over,… ALONG each strand.
  //   (b) SHARED: the two visits at the same physical crossing node are opposite
  //       (one over, one under) → a proper weave at every crossing.
  // BFS 2-colours the graph; for the alternating projection of a star pattern it
  // is bipartite, so the colouring is a perfect, globally-consistent weave. (Any
  // rare odd-cycle conflict forces one visit; that's a single local break, never
  // the per-crossing mess.) colour 0 = OVER.
  // Enumerate crossing-visits in strand order.
  const visitId = []; // strands[si] crossing-visits → global visit id list per strand
  const visitNode = []; // visit id -> node
  const nodeVisits = new Map(); // node -> [visit ids] (the two strands meeting)
  strands.forEach((path) => {
    const ids = [];
    for (const node of path) {
      if (!isCrossing(node)) { ids.push(-1); continue; } // non-crossing → placeholder
      const id = visitNode.length;
      visitNode.push(node);
      ids.push(id);
      let arr = nodeVisits.get(node);
      if (!arr) { arr = []; nodeVisits.set(node, arr); }
      arr.push(id);
    }
    visitId.push(ids);
  });
  // Build adjacency of the constraint graph.
  const cadj = Array.from({ length: visitNode.length }, () => []);
  const link = (u, v) => { if (u >= 0 && v >= 0 && u !== v) { cadj[u].push(v); cadj[v].push(u); } };
  // (a) sequential along each strand (consecutive *crossing* visits, skipping -1)
  for (const ids of visitId) {
    let prev = -1;
    for (const id of ids) {
      if (id < 0) continue;
      if (prev >= 0) link(prev, id);
      prev = id;
    }
  }
  // (b) shared crossing: visits at the same node pair up as opposites.
  for (const arr of nodeVisits.values()) {
    for (let i = 0; i + 1 < arr.length; i++) link(arr[i], arr[i + 1]);
  }
  // BFS 2-colour. color[id]: 0 = OVER, 1 = UNDER.
  const color = new Int8Array(visitNode.length).fill(-1);
  for (let s = 0; s < visitNode.length; s++) {
    if (color[s] !== -1) continue;
    color[s] = 0;
    const stack = [s];
    while (stack.length) {
      const u = stack.pop();
      for (const v of cadj[u]) {
        if (color[v] === -1) { color[v] = color[u] ^ 1; stack.push(v); }
        // (odd-cycle conflicts are tolerated: v keeps its first colour)
      }
    }
  }

  // --- 4. band each strand into a closed ribbon outline; where the strand is
  // UNDER at a crossing, interrupt BOTH offset edges with a visible gap so the
  // over-strand reads as passing on top. -----------------------------------
  const half = bandWidth / 2;
  const out = [];
  const gap = Math.max(3, bandWidth * 1.6); // visible break width at unders

  strands.forEach((path, si) => {
    const ids = visitId[si];
    const overAt = path.map((node, k) => {
      if (!isCrossing(node)) return true;      // not a crossing → continuous
      const id = ids[k];
      return id < 0 || color[id] === 0;        // colour 0 = over
    });
    for (const sideSign of [+1, -1]) {
      let run = [];
      for (let k = 0; k < path.length; k++) {
        const node = path[k];
        const p = verts[node];
        const off = offsetAt(verts, path, k, sideSign, half);
        const pt = { x: p.x + off.x, y: p.y + off.y };
        if (!overAt[k]) {
          // UNDER here: end the current run a touch before this point, drop the
          // point, and resume after — carving a gap centred on the crossing.
          if (run.length) {
            const trimmed = trimEnd(run, pt, gap / 2);
            if (trimmed.length >= 2) out.push(trimmed);
          }
          run = [];
          // resume: start the next run a touch PAST this point toward k+1.
          if (k < path.length - 1) {
            const np = verts[path[k + 1]];
            const noff = offsetAt(verts, path, k + 1, sideSign, half);
            const npt = { x: np.x + noff.x, y: np.y + noff.y };
            const resumed = trimStart(pt, npt, gap / 2);
            if (resumed) run.push(resumed);
          }
          continue;
        }
        run.push(pt);
      }
      if (run.length >= 2) out.push(run);
    }
  });

  return out;
}

// Perpendicular offset of the band edge at node k of `path`, on the given side.
function offsetAt(verts, path, k, sideSign, half) {
  const p = verts[path[k]];
  // average direction of adjacent segments
  let dx = 0;
  let dy = 0;
  if (k > 0) { dx += p.x - verts[path[k - 1]].x; dy += p.y - verts[path[k - 1]].y; }
  if (k < path.length - 1) { dx += verts[path[k + 1]].x - p.x; dy += verts[path[k + 1]].y - p.y; }
  const l = Math.hypot(dx, dy) || 1;
  dx /= l; dy /= l;
  // perpendicular
  return { x: -dy * half * sideSign, y: dx * half * sideSign };
}

// Trim the tail of a run so it stops `dist` short of point `target`.
function trimEnd(run, target, dist) {
  if (run.length < 1) return run;
  const last = run[run.length - 1];
  const dx = target.x - last.x;
  const dy = target.y - last.y;
  const l = Math.hypot(dx, dy) || 1;
  if (l <= dist) return run.slice(0, -1);
  const t = (l - dist) / l;
  const end = { x: last.x + dx * t, y: last.y + dy * t };
  return [...run, end];
}

// A point `dist` along from `from` toward `to` (the resume point past a gap).
function trimStart(from, to, dist) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const l = Math.hypot(dx, dy) || 1;
  if (l <= dist) return null;
  const t = dist / l;
  return { x: from.x + dx * t, y: from.y + dy * t };
}

// ===========================================================================
// TILINGS — analytic generators. Each returns CCW polygon tiles (origin-centered)
// ===========================================================================
function buildTiling(name, cell, W, H) {
  switch (name) {
    case 'hex12': return tileHex12(cell, W, H);          // 3.12.12 dodecagons+triangles
    case 'square8':
    default: return tileSquare8(cell, W, H);             // 4.8.8 octagons+squares
  }
}

// Regular polygon vertices (CCW), `n` sides, circumradius `r`, centred (cx,cy),
// first vertex at angle `a0`.
function regPoly(cx, cy, n, r, a0) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = a0 + (2 * Math.PI * i) / n;
    out.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
  }
  return out;
}

// Cover the canvas with a lattice: returns integer (i,j) ranges that, scaled by
// the basis vectors, fill a region a bit larger than the canvas.
function latticeRange(W, H, ux, uy, vx, vy) {
  // crude bound: how many steps to cover half-diagonal in each basis direction.
  const R = Math.hypot(W, H) * 0.6;
  const ni = Math.ceil(R / Math.max(1, Math.hypot(ux, uy))) + 1;
  const nj = Math.ceil(R / Math.max(1, Math.hypot(vx, vy))) + 1;
  return { ni, nj };
}

// --- 4.8.8 : regular octagons + squares ----------------------------------
function tileSquare8(cell, W, H) {
  // Octagon centres sit on a square lattice of spacing `cell`. The octagon
  // circumradius r relates to spacing s by s = r*(1+√2)*... for edge-touching
  // octagons: an octagon of side a has width across flats = a*(1+√2). Place
  // octagons so neighbours share an edge; the leftover gaps are squares.
  const s = cell;
  // Regular octagon with flat-to-flat = s (so edges meet on the lattice).
  // flat-to-flat W = a(1+√2) ⇒ a = s/(1+√2); circumradius r = a/(2 sin(π/8)).
  const a = s / (1 + Math.SQRT2);
  const r = a / (2 * Math.sin(Math.PI / 8));
  const a0 = Math.PI / 8; // flat sides horizontal/vertical
  const tiles = [];
  const { ni, nj } = latticeRange(W, H, s, 0, 0, s);
  for (let j = -nj; j <= nj; j++) {
    for (let i = -ni; i <= ni; i++) {
      const cxp = i * s;
      const cyp = j * s;
      tiles.push(regPoly(cxp, cyp, 8, r, a0));
      // Square sits at the lattice corner (offset half a cell in x and y),
      // rotated 45° (its corners point at adjacent octagon edge midpoints).
      const sqHalf = (s - a * Math.SQRT2) / 2; // gap square half-diagonal-ish
      // Square side equals octagon side `a`; place rotated 45°, circumradius a/√2.
      tiles.push(regPoly(cxp + s / 2, cyp + s / 2, 4, a / Math.SQRT2, 0));
      void sqHalf;
    }
  }
  return tiles;
}

// --- 3.12.12 : regular dodecagons + triangles ----------------------------
function tileHex12(cell, W, H) {
  // Dodecagon centres on a triangular (hex) lattice. For edge-touching regular
  // dodecagons, the centre spacing = flat-to-flat distance = a*(2+√3), where a
  // is the dodecagon side. Triangles fill the gaps between three dodecagons.
  const s = cell;                       // dodecagon centre spacing
  const a = s / (2 + Math.sqrt(3));      // dodecagon side
  const r = a / (2 * Math.sin(Math.PI / 12)); // circumradius
  const a0 = Math.PI / 12;               // flat side horizontal at bottom
  // Hex lattice basis: u = (s,0), v = (s/2, s*√3/2).
  const ux = s;
  const uy = 0;
  const vx = s / 2;
  const vy = (s * Math.sqrt(3)) / 2;
  const tiles = [];
  const { ni, nj } = latticeRange(W, H, ux, uy, vx, vy);
  const triR = a / Math.sqrt(3); // circumradius of filler triangle (side a)
  for (let j = -nj; j <= nj; j++) {
    for (let i = -ni; i <= ni; i++) {
      const cxp = i * ux + j * vx;
      const cyp = i * uy + j * vy;
      tiles.push(regPoly(cxp, cyp, 12, r, a0));
      // Two triangles per cell fill the rhombic gap (up + down triangles)
      // centred between dodecagons. Their centroids sit at the lattice cell's
      // upper interior; place them at offsets toward the v-up gaps.
      const gx = cxp + ux / 2 + vx / 2;
      const gy = cyp + uy / 2 + vy / 2;
      // distance from gap centre to triangle centroid is small; two opposed tris
      tiles.push(regPoly(gx, gy, 3, triR, Math.PI / 2));
      tiles.push(regPoly(gx, gy, 3, triR, -Math.PI / 2));
    }
  }
  return tiles;
}
