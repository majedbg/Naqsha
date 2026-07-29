// spaceColonizationSkeleton — the PURE branching-skeleton core shared by the
// `branch` Pattern (which DRAWS it) and the `branch` semantic anchor extractor
// (which ANCHORS on it). No p5, no DOM, no React.
//
// WHY A SHARED CORE (docs/vine-scaffolds-PLAN.md §2): getSemanticAnchors is a
// pure function of params — it never sees the drawn output. So a semantic
// branchy host must have a skeleton computable TWICE, IDENTICALLY: once by
// Pattern.generate() to draw it, once by the extractor to anchor on it. This
// module is that single computation. The precedent is gridGeometry.js, which
// Grid.js draws and gridAnchors.js anchors against.
//
// ALGORITHM — space colonization (Runions, Lane & Prusinkiewicz, "Modeling Trees
// with a Space Colonization Algorithm", EG Workshop on Natural Phenomena 2007,
// https://algorithmicbotany.org/papers/colonization.egwnp2007.pdf):
//   1. Scatter `attractorCount` attraction points inside an ENVELOPE (the shape
//      mask — this is what sets the silhouette, and why this algorithm was
//      chosen over Honda: canvas coverage is solved by construction).
//   2. Each attractor votes for the NEAREST node within `attractionRadius`.
//   3. Every node that received votes grows one child of length `stepLength`
//      along the mean of its votes (± `angleJitter`).
//   4. Attractors within `killDistance` of a node are consumed.
//   5. Repeat until the attractors are exhausted, nothing grows, or `maxNodes`.
// Branching is EMERGENT from attractor competition — the monopodial / sympodial
// / dichotomous enum of PLAN §2 does NOT map onto it and is deliberately absent
// (see the T3 CONTRACT's "Correction to §2"); it belongs to Honda/L-system
// generators, which can implement this same return contract later.
//
// TRUNK FORMATION: attractors are rejected within ROOT_CLEAR_FACTOR × the
// EFFECTIVE `reach` of the root (see the reach floor inside buildSkeleton —
// attractionRadius is a lower bound on it, not the whole story). Without that
// clear zone the root — which sits on the envelope's lower rim, surrounded by
// attractors — fans out immediately and there is no trunk at all: no long first
// stem for a vine to ride, and no high-Strahler-order run for T4's order filter
// to select ("big palmettes on the trunk"). It is DERIVED rather than exposed as
// its own slider because the T3 CONTRACT's param list is frozen.
//
// RNG CONTRACT: `rng` is INJECTED and is a ZERO-ARG function returning [0,1).
// All scaling arithmetic happens here, so the two callers cannot disagree about
// argument forms:
//   • Pattern.generate → () => ctx.random()          (live p5, after randomSeed)
//   • extractor        → makeP5Random(hostSeed)      (byte-exact port of p5's LCG)
// Draw order is fixed: every attractor sample first, then one angle-jitter draw
// per growing node per round, in ascending node index.
//
// COORDINATE FRAME: CENTRED (origin = canvas centre), matching
// DifferentialGrowth's "absolute, origin-centered coords". drawBase replays them
// under applySymmetryDraw, which translates by (cx+offsetX, cy+offsetY); the
// extractor world-translates by the same. offsetX/offsetY are NOT read here.
//
// MODULATION: this core reads NO modulation channel and the `branch` Pattern
// does not draw a warped variant, so — unlike Grid/Spiral, which DO consume
// params.modulation and must honesty-gate to null when the drawn curve can no
// longer be tied to the ideal one — there is no warp divergence to gate on here.
// Warp × branchy scaffolds is R1 in the plan, a later ticket. Do not add a
// warp→null branch until this pattern actually consumes warp: it would blank the
// vine whenever any warp guide merely exists in the document.

const DEG = Math.PI / 180;

// Spatial-hash bucket key — the same mix DifferentialGrowth.js:126 uses.
const cellKey = (gx, gy) => (gx * 73856093) ^ (gy * 19349663);

// Attractors are rejected inside this multiple of the effective `reach` around
// the root, which is what forces a trunk before the first fan-out (see header).
const ROOT_CLEAR_FACTOR = 2;

// Hard iteration ceiling — a backstop so a pathological param set can never spin
// forever. Growth normally ends when the attractors are consumed.
const MAX_ROUNDS = 4000;

// Raw space colonization ends every round by spawning a child on EVERY node that
// got a vote, so a node adjacent to one leftover attractor throws a single-step
// spur. Measured at default params: 163 tips with a MEDIAN branch length of one
// step — i.e. half the "branches" were 11px stubs. Each of those becomes its own
// path, its own meta.pathIndex, and therefore its own Apex flower, so they are
// not cosmetic: they inflate the flower count with glyphs that then collide and
// get dropped by the placement solver. A leaf branch shorter than the attractor
// KILL DISTANCE carries no spatial information the attractor cloud actually
// asked for, so it is pruned. Iterated, because pruning both children of a
// junction turns that junction into a leaf.
const PRUNE_PASSES = 6;

/** Defaults are the T3 CONTRACT param list. Keep in sync with DEFAULT_PARAMS.branch. */
export const SKELETON_DEFAULTS = Object.freeze({
  envelopeShape: 'circle',
  envelopeScale: 0.92,
  attractorCount: 900,
  attractionRadius: 110,
  killDistance: 26,
  stepLength: 11,
  angleJitter: 12,
  maxNodes: 2000,
});

/**
 * Horton–Strahler order per node, as a pure post-pass over the parent array.
 * Leaves are order 1; a node whose highest child order occurs TWICE OR MORE is
 * promoted to that order + 1, otherwise it inherits the maximum unchanged.
 *
 * Exported for direct unit testing and for T4 (`meta.order` + the chain `order`
 * filter). Relies on the invariant every generator here must keep: parent[i] < i,
 * so one descending sweep visits every child before its parent.
 * @param {Int32Array|number[]} parent  parent index per node; -1 at the root.
 * @returns {Int32Array} Strahler order per node.
 */
export function strahlerFromParents(parent) {
  const n = parent.length;
  const order = new Int32Array(n);
  const maxChild = new Int32Array(n); // highest child order seen so far
  const maxCount = new Int32Array(n); // how many children carry that order
  for (let i = n - 1; i >= 0; i--) {
    order[i] = maxCount[i] === 0 ? 1 : maxCount[i] >= 2 ? maxChild[i] + 1 : maxChild[i];
    const p = parent[i];
    if (p < 0) continue;
    const o = order[i];
    if (o > maxChild[p]) {
      maxChild[p] = o;
      maxCount[p] = 1;
    } else if (o === maxChild[p]) {
      maxCount[p] += 1;
    }
  }
  return order;
}

/**
 * MAIN-BRANCH (Strahler-continuation) path decomposition — the load-bearing
 * detail of the T3 CONTRACT.
 *
 * At each junction the highest-`order` child CONTINUES the current path and every
 * other child STARTS a new one, rooted AT the junction node so the drawing stays
 * connected. Ties on order break on the LOWEST child node index — a fixed rule,
 * so `meta.pathIndex` is stable rather than stable-by-accident (equal-order
 * children are the common case: they are exactly what promotes a Strahler order).
 *
 * The result PARTITIONS the edge set — every edge in exactly one path — so
 * `sampleEdgeAnchors` never stamps the trunk N times, and every path ends at a
 * real tip. Walking each tip back to the root instead would put the trunk in
 * EVERY path and pile the vine's glyphs onto it.
 *
 * Paths are emitted breadth-first from the root, so path 0 is always the trunk.
 * @param {{x:number,y:number}[]} nodes
 * @param {Int32Array|number[]} parent
 * @param {Int32Array|number[]} order
 * @param {number[]} tips
 * @returns {{points:{x:number,y:number}[], nodeIds:number[], tipNode:number}[]}
 */
export function decomposeMainBranches(nodes, parent, order, tips) {
  const n = nodes.length;
  if (n < 2 || tips.length === 0) return [];

  const children = Array.from({ length: n }, () => []);
  let root = -1;
  for (let i = 0; i < n; i++) {
    const p = parent[i];
    if (p < 0) root = i;
    else children[p].push(i);
  }
  if (root < 0) return [];

  const paths = [];
  const queue = [{ start: root, first: -1 }]; // first<0 ⇒ walk from `start` itself
  while (queue.length > 0) {
    const { start, first } = queue.shift();
    const nodeIds = [start];
    let cur = first >= 0 ? first : start;
    if (first >= 0) nodeIds.push(first);
    for (;;) {
      const kids = children[cur];
      if (kids.length === 0) break;
      let best = kids[0];
      for (let k = 1; k < kids.length; k++) {
        // Highest order continues; tie → lowest node index (kids ascend).
        if (order[kids[k]] > order[best]) best = kids[k];
      }
      for (const kid of kids) {
        if (kid !== best) queue.push({ start: cur, first: kid });
      }
      nodeIds.push(best);
      cur = best;
    }
    paths.push({
      points: nodeIds.map((id) => nodes[id]),
      nodeIds,
      tipNode: nodeIds[nodeIds.length - 1],
    });
  }
  return paths;
}

/**
 * Delete leaf branches shorter than `minLen` (see PRUNE_PASSES). A "leaf branch"
 * is the run from a childless node up to the first node with ≥2 children; a run
 * that reaches the ROOT is the trunk and is never pruned. Mutates the flat
 * xs/ys/parent arrays in place, reindexing so the parent[i] < i invariant (which
 * strahlerFromParents depends on) survives. Deterministic — consumes no RNG.
 * @returns {number} nodes removed.
 */
function pruneStubBranches(xs, ys, parentArr, minLen) {
  let removedTotal = 0;
  for (let pass = 0; pass < PRUNE_PASSES; pass++) {
    const n = parentArr.length;
    if (n < 2) break;
    const childCount = new Int32Array(n);
    for (let i = 0; i < n; i++) if (parentArr[i] >= 0) childCount[parentArr[i]] += 1;

    const remove = new Uint8Array(n);
    let removed = 0;
    for (let i = 0; i < n; i++) {
      if (childCount[i] !== 0) continue; // leaves only
      const run = [i];
      let len = 0;
      let cur = i;
      let stop = -1;
      for (;;) {
        const p = parentArr[cur];
        if (p < 0) break; // reached the root ⇒ this run IS the trunk.
        len += Math.hypot(xs[cur] - xs[p], ys[cur] - ys[p]);
        if (childCount[p] >= 2) {
          stop = p;
          break;
        }
        run.push(p);
        cur = p;
      }
      if (stop < 0 || len >= minLen) continue;
      for (const id of run) {
        if (!remove[id]) {
          remove[id] = 1;
          removed += 1;
        }
      }
    }
    if (removed === 0) break;

    const remap = new Int32Array(n).fill(-1);
    let w = 0;
    for (let i = 0; i < n; i++) {
      if (remove[i]) continue;
      remap[i] = w;
      xs[w] = xs[i];
      ys[w] = ys[i];
      parentArr[w] = parentArr[i];
      w += 1;
    }
    xs.length = w;
    ys.length = w;
    parentArr.length = w;
    for (let i = 0; i < w; i++) {
      parentArr[i] = parentArr[i] < 0 ? -1 : remap[parentArr[i]];
    }
    removedTotal += removed;
  }
  return removedTotal;
}

/** Envelope half-extent + membership test, in the CENTRED frame. */
function makeEnvelope(shape, R) {
  const inner = R * 0.45; // ring only
  switch (shape) {
    case 'lozenge':
      return { R, inside: (x, y) => Math.abs(x) / R + Math.abs(y) / R <= 1 };
    case 'rect':
      return { R, inside: (x, y) => Math.abs(x) <= R && Math.abs(y) <= R };
    case 'ring':
      return {
        R,
        inside: (x, y) => {
          const d2 = x * x + y * y;
          return d2 <= R * R && d2 >= inner * inner;
        },
      };
    case 'circle':
    default:
      return { R, inside: (x, y) => x * x + y * y <= R * R };
  }
}

/**
 * Build the branching skeleton. See the module header for the algorithm, the RNG
 * contract and the coordinate frame.
 *
 * @param {object} params  envelopeShape / envelopeScale / attractorCount /
 *   attractionRadius / killDistance / stepLength / angleJitter / maxNodes.
 * @param {number} canvasW
 * @param {number} canvasH
 * @param {() => number} rng  zero-arg, returns [0,1).
 * @returns {{nodes:{x:number,y:number}[], parent:Int32Array, tips:number[],
 *   junctions:number[], order:Int32Array,
 *   paths:{points:{x:number,y:number}[], nodeIds:number[], tipNode:number}[],
 *   bbox:{minX:number,minY:number,maxX:number,maxY:number}}}
 */
export function buildSkeleton(params, canvasW, canvasH, rng) {
  const {
    envelopeShape = SKELETON_DEFAULTS.envelopeShape,
    envelopeScale = SKELETON_DEFAULTS.envelopeScale,
    attractorCount = SKELETON_DEFAULTS.attractorCount,
    attractionRadius = SKELETON_DEFAULTS.attractionRadius,
    killDistance = SKELETON_DEFAULTS.killDistance,
    stepLength = SKELETON_DEFAULTS.stepLength,
    angleJitter = SKELETON_DEFAULTS.angleJitter,
    maxNodes = SKELETON_DEFAULTS.maxNodes,
  } = params || {};

  const R = Math.max(1, (envelopeScale * Math.min(canvasW, canvasH)) / 2);
  const env = makeEnvelope(envelopeShape, R);
  const step = Math.max(0.5, stepLength);
  const kill = Math.max(0.5, killDistance);
  const cap = Math.max(1, Math.round(maxNodes));
  const jitterRad = Math.max(0, angleJitter) * DEG;
  const wanted = Math.max(0, Math.round(attractorCount));

  // EFFECTIVE reach — a FLOOR under the user's attractionRadius, never a ceiling.
  // Space colonization propagates only while a tip can still SEE an attractor
  // after consuming the one it just reached. Two ways that fails, both reachable
  // from the sliders, both measured:
  //   • attractionRadius ≲ killDistance — the tip eats its target and the next
  //     one is already out of sight. (attractionRadius 30 with the default
  //     killDistance 26: growth died at 8 nodes, 898 of 900 attractors unused.)
  //   • attractionRadius below the attractor SPACING — same stall, from density
  //     rather than from the kill sweep. (attractionRadius 30, 2000 attractors on
  //     a full-canvas envelope: died at 21 nodes with the nearest live attractor
  //     37.9px away.) Spacing is estimated from the envelope's bounding box, which
  //     over-estimates it for non-rect shapes — erring toward a generous floor.
  // Raising the radius is the only honest repair: the alternative is a slider
  // position that silently empties the sheet. At DEFAULT params both floors sit
  // far below attractionRadius (52.6 and 70.6 vs 110), so defaults are untouched.
  const attractorSpacing = wanted > 0 ? (2 * R) / Math.sqrt(wanted) : 0;
  const reach = Math.max(attractionRadius, kill * 1.6 + step, attractorSpacing * 2);

  // Root: bottom-centre of the envelope's bounding box, so the plant grows UP
  // into the envelope and the sheet fills from a single rooted point.
  const rootX = 0;
  const rootY = R;

  // ── 1. Attractors (all RNG for them is drawn up front, in index order) ──────
  // Rejection-sampled in the envelope's bounding box, minus the root clear zone.
  const clear2 = (ROOT_CLEAR_FACTOR * reach) ** 2;
  const ax = [];
  const ay = [];
  for (let i = 0; i < wanted; i++) {
    for (let attempt = 0; attempt < 64; attempt++) {
      const x = (rng() * 2 - 1) * R;
      const y = (rng() * 2 - 1) * R;
      if (!env.inside(x, y)) continue;
      const dx = x - rootX;
      const dy = y - rootY;
      if (dx * dx + dy * dy < clear2) continue;
      ax.push(x);
      ay.push(y);
      break;
    }
  }
  const aCount = ax.length;
  const aDead = new Uint8Array(aCount);

  // Attractor hash — static positions, bucket size = killDistance so the kill
  // sweep is a 3×3 neighbourhood query (DifferentialGrowth.js:172-176 idiom).
  const aCell = kill;
  const aGrid = new Map();
  for (let i = 0; i < aCount; i++) {
    const k = cellKey(Math.floor(ax[i] / aCell), Math.floor(ay[i] / aCell));
    let bucket = aGrid.get(k);
    if (!bucket) {
      bucket = [];
      aGrid.set(k, bucket);
    }
    bucket.push(i);
  }

  // ── 2. Nodes + their spatial hash ──────────────────────────────────────────
  // Nodes NEVER move once created, so the hash is built incrementally (unlike
  // DifferentialGrowth's, which is rebuilt every pass because its nodes move).
  const nx = [rootX];
  const ny = [rootY];
  const parentArr = [-1];
  // Bucket size is a pure query-speed knob: nearestNode returns the true nearest
  // node within `reach` for ANY positive nCell, so tuning it cannot change output.
  const nCell = Math.max(1, reach / 4);
  const nGrid = new Map();
  const addNode = (x, y, p) => {
    const idx = nx.length;
    nx.push(x);
    ny.push(y);
    parentArr.push(p);
    const k = cellKey(Math.floor(x / nCell), Math.floor(y / nCell));
    let bucket = nGrid.get(k);
    if (!bucket) {
      bucket = [];
      nGrid.set(k, bucket);
    }
    bucket.push(idx);
    return idx;
  };
  // Seed the hash with the root (already present in the arrays above).
  nGrid.set(cellKey(Math.floor(rootX / nCell), Math.floor(rootY / nCell)), [0]);

  // Nearest node within `maxDist`, by expanding Chebyshev rings over the node
  // hash. A cell at ring r is at least (r-1)*nCell away, so once the best hit is
  // closer than that bound no further ring can improve it — the ring search is
  // the O(1)-ish generalisation of the 3×3 query to a radius > one bucket.
  const nearestNode = (x, y, maxDist) => {
    const gx0 = Math.floor(x / nCell);
    const gy0 = Math.floor(y / nCell);
    const maxRing = Math.ceil(maxDist / nCell) + 1;
    let best = -1;
    let bestD2 = maxDist * maxDist;
    for (let ring = 0; ring <= maxRing; ring++) {
      if (best >= 0 && (ring - 1) * nCell > Math.sqrt(bestD2)) break;
      const lo = -ring;
      const hi = ring;
      for (let gx = gx0 + lo; gx <= gx0 + hi; gx++) {
        for (let gy = gy0 + lo; gy <= gy0 + hi; gy++) {
          // Border of the (2*ring+1)² square only — inner cells were done.
          if (ring > 0 && gx !== gx0 + lo && gx !== gx0 + hi && gy !== gy0 + lo && gy !== gy0 + hi) {
            continue;
          }
          const bucket = nGrid.get(cellKey(gx, gy));
          if (!bucket) continue;
          for (let b = 0; b < bucket.length; b++) {
            const j = bucket[b];
            const dx = x - nx[j];
            const dy = y - ny[j];
            const d2 = dx * dx + dy * dy;
            if (d2 < bestD2) {
              bestD2 = d2;
              best = j;
            }
          }
        }
      }
    }
    return best;
  };

  // Consume every live attractor within killDistance of a freshly grown node.
  const killAround = (x, y) => {
    const gx0 = Math.floor(x / aCell);
    const gy0 = Math.floor(y / aCell);
    const k2 = kill * kill;
    for (let gx = gx0 - 1; gx <= gx0 + 1; gx++) {
      for (let gy = gy0 - 1; gy <= gy0 + 1; gy++) {
        const bucket = aGrid.get(cellKey(gx, gy));
        if (!bucket) continue;
        for (let b = 0; b < bucket.length; b++) {
          const i = bucket[b];
          if (aDead[i]) continue;
          const dx = x - ax[i];
          const dy = y - ay[i];
          if (dx * dx + dy * dy <= k2) aDead[i] = 1;
        }
      }
    }
  };

  killAround(rootX, rootY);

  // ── 3. Grow ────────────────────────────────────────────────────────────────
  let active = [];
  for (let i = 0; i < aCount; i++) if (!aDead[i]) active.push(i);

  let trunkPhase = true; // ends permanently at the first attractor vote.
  const sumX = new Map(); // node index → accumulated unit direction
  const sumY = new Map();

  for (let round = 0; round < MAX_ROUNDS && nx.length < cap && active.length > 0; round++) {
    sumX.clear();
    sumY.clear();

    for (let a = 0; a < active.length; a++) {
      const i = active[a];
      const j = nearestNode(ax[i], ay[i], reach);
      if (j < 0) continue;
      const dx = ax[i] - nx[j];
      const dy = ay[i] - ny[j];
      const d = Math.hypot(dx, dy);
      if (d === 0) continue;
      sumX.set(j, (sumX.get(j) || 0) + dx / d);
      sumY.set(j, (sumY.get(j) || 0) + dy / d);
    }

    if (sumX.size === 0) {
      // No node is in reach of any attractor. Before the first vote this is the
      // TRUNK phase: extend the leading node toward the nearest live attractor
      // until the canopy comes within reach. After it, growth is finished.
      if (!trunkPhase) break;
      const lead = nx.length - 1;
      let bestI = -1;
      let bestD2 = Infinity;
      for (let a = 0; a < active.length; a++) {
        const i = active[a];
        const dx = ax[i] - nx[lead];
        const dy = ay[i] - ny[lead];
        const d2 = dx * dx + dy * dy;
        if (d2 < bestD2) {
          bestD2 = d2;
          bestI = i;
        }
      }
      if (bestI < 0) break;
      let ang = Math.atan2(ay[bestI] - ny[lead], ax[bestI] - nx[lead]);
      ang += (rng() * 2 - 1) * jitterRad;
      const cxn = nx[lead] + Math.cos(ang) * step;
      const cyn = ny[lead] + Math.sin(ang) * step;
      addNode(cxn, cyn, lead);
      killAround(cxn, cyn);
      active = active.filter((i) => !aDead[i]);
      continue;
    }

    trunkPhase = false;

    // One child per voting node, in ASCENDING node index (fixes the rng order).
    const voters = Array.from(sumX.keys()).sort((p, q) => p - q);
    let grew = false;
    for (const j of voters) {
      if (nx.length >= cap) break;
      const vx = sumX.get(j);
      const vy = sumY.get(j);
      const len = Math.hypot(vx, vy);
      // Opposing votes can cancel exactly; growing there would be a zero-length
      // (NaN-direction) edge, so the node simply sits this round out.
      if (len < 1e-9) continue;
      let ang = Math.atan2(vy, vx);
      ang += (rng() * 2 - 1) * jitterRad;
      const cxn = nx[j] + Math.cos(ang) * step;
      const cyn = ny[j] + Math.sin(ang) * step;
      addNode(cxn, cyn, j);
      killAround(cxn, cyn);
      grew = true;
    }
    if (!grew) break;
    active = active.filter((i) => !aDead[i]);
  }

  // ── 4. Prune single-step spurs, then derive the contract's structures ──────
  pruneStubBranches(nx, ny, parentArr, kill);

  const n = nx.length;
  const nodes = new Array(n);
  for (let i = 0; i < n; i++) nodes[i] = { x: nx[i], y: ny[i] };
  const parent = Int32Array.from(parentArr);
  const order = strahlerFromParents(parent);

  const childCount = new Int32Array(n);
  for (let i = 0; i < n; i++) if (parent[i] >= 0) childCount[parent[i]] += 1;

  const tips = [];
  const junctions = [];
  if (n >= 2) {
    for (let i = 0; i < n; i++) {
      if (childCount[i] === 0) tips.push(i);
      else if (childCount[i] >= 2) junctions.push(i);
    }
  }
  // n < 2 ⇒ a lone root: no terminus that can honestly be called a tip, nothing
  // drawable, nothing to sample. Everything degenerates to empty (see the
  // extractor's honesty gate).

  const paths = decomposeMainBranches(nodes, parent, order, tips);

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < n; i++) {
    if (nx[i] < minX) minX = nx[i];
    if (nx[i] > maxX) maxX = nx[i];
    if (ny[i] < minY) minY = ny[i];
    if (ny[i] > maxY) maxY = ny[i];
  }

  return { nodes, parent, tips, junctions, order, paths, bbox: { minX, minY, maxX, maxY } };
}
