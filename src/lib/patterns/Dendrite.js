import { Pattern } from './drawingContext';
import { applySymmetryDraw } from './symmetryUtils';

/**
 * Dendrite — diffusion-limited aggregation (DLA) rendered as a BRANCH SKELETON.
 *
 * Particles random-walk until they stick to a growing cluster, forming a
 * branching dendrite (frost / coral / lightning). We do NOT fill the mass — we
 * emit one CONNECTED root→tip <polyline> per decomposed branch (S1,
 * docs/vine-scaffolds-PLAN.md), not one <line> per stuck-particle bond, so the
 * output reads as a vector branch tree — and a walkable one, usable as a vine
 * host — suitable for a pen-plotter / vinyl-cutter.
 *
 * Why it BRANCHES instead of clumping (the DLA "screening" effect):
 *   - A new node is placed at the WALKER's actual arrival position, not snapped
 *     onto the parent or onto a fixed shell. The off-axis arrival point is what
 *     makes tips fan out into a dendritic tree.
 *   - Walkers are spawned NEAR the current cluster boundary (for perf) and walk
 *     UNBIASED — no inward drift (inward drift fills the fjords and makes a disk).
 *   - With high `stickiness`, exposed tips capture walkers before they can reach
 *     the sheltered interior, so growth concentrates at the tips → branches.
 *
 * Seeding (`seedMode`, all in origin-centered coords; +y is DOWN):
 *   center — one node at (0,0)            → snowflake / coral
 *   ground — a row of nodes at y = +H/2   → frost climbing UP from the floor
 *   ring   — nodes on a circle r≈min/4    → a band of inward+outward fronds
 *
 * Perf is O(maxNodes): an APPEND-ONLY spatial hash (nodes never move, unlike
 * DifferentialGrowth which rebuilds every pass), spawn-near-boundary, bounded
 * walker steps + a kill radius, and a global step/failure safety cap. A default
 * regenerate finishes well under ~1s.
 *
 * The whole simulation runs off `ctx.random` (seeded) so it is deterministic.
 * `drawBase` replays the decomposed paths via `ctx.beginShape`/`vertex`/
 * `endShape`; the SVG <polyline>/<circle> strings are built from the SAME
 * arrays, so canvas == SVG. Like DifferentialGrowth, this pattern KEEPS the
 * real radial-symmetry control (we override only `contentFor`, never
 * `toSVGGroup`, so the real `symmetry` param flows through wrapSVGSymmetry).
 *
 * PATH DECOMPOSITION (S1). Bonds are stored `{ p, c }` parent-index →
 * child-index, and — because a node is only ever added to the cluster once it
 * has a parent already in it — `p < c` always, and `bonds` is naturally sorted
 * ascending by `c` (each stuck node's one incoming bond is pushed the instant
 * that node is added). `decomposeIntoPaths` (below) exploits both facts to
 * fold the bond forest into CONNECTED root→tip node-index paths, using the
 * main-branch-continuation rule the vine-scaffolds plan froze for T3's
 * `buildSkeleton` (docs/vine-scaffolds-PLAN.md, "T3 CONTRACT"): at each
 * junction, the child leading to the DEEPEST subtree continues the CURRENT
 * path; every other child STARTS a new path (from the junction, so the bond
 * to that junction is still emitted, just as the first segment of a new
 * path). That puts every bond in EXACTLY ONE path. The alternative — walking
 * every tip back to the root — would stamp shared trunk bonds once per
 * descendant tip, so a motif arc-length-sampling the result would pile glyphs
 * on the trunk in proportion to how bushy the tree is above it.
 */
export default class Dendrite extends Pattern {
  generate(ctx, seed, params, canvasW, canvasH, color, opacity) {
    ctx.randomSeed(seed);
    this.svgElements = [];

    const {
      seedMode = 'center',
      render = 'bonds',
      maxNodes = 1200,
      stickiness = 0.8,
      nodeSpacing = 6,
      strokeWeight = 0.7,
      symmetry = 1,
      startAngle = 0,
      offsetX = 0,
      offsetY = 0,
    } = params || {};

    const cx = canvasW / 2;
    const cy = canvasH / 2;

    const cap = Math.max(8, Math.round(maxNodes));
    const spacing = Math.max(1, nodeSpacing);
    const spacing2 = spacing * spacing;
    const stepSize = spacing * 0.5;          // < spacing so walkers don't tunnel the shell
    const stick = Math.max(0, Math.min(1, stickiness));

    // --- cluster storage: flat parallel arrays (cache-friendly) -------------
    const nx = [];        // node x (origin-centered)
    const ny = [];        // node y
    const bonds = [];     // { p, c } — parent index → child index

    // --- append-only spatial hash (cellSize = nodeSpacing) ------------------
    // Nodes never move once stuck, so we insert on stick and never rebuild.
    const cellSize = spacing;
    const grid = new Map();
    const cellKey = (gx, gy) => gx * 73856093 ^ gy * 19349663;
    const addToGrid = (i) => {
      const gx = Math.floor(nx[i] / cellSize);
      const gy = Math.floor(ny[i] / cellSize);
      const k = cellKey(gx, gy);
      let arr = grid.get(k);
      if (!arr) { arr = []; grid.set(k, arr); }
      arr.push(i);
    };
    const addNode = (x, y) => {
      const i = nx.length;
      nx.push(x);
      ny.push(y);
      addToGrid(i);
      return i;
    };

    // Nearest cluster node to (x,y) within `spacing`; returns its index or -1.
    // Queries the 3×3 block of cells around the point (max query radius = one
    // cell = spacing, so the 3×3 neighborhood covers everything within spacing).
    const nearestWithin = (x, y) => {
      const gx = Math.floor(x / cellSize);
      const gy = Math.floor(y / cellSize);
      let best = -1;
      let bestD2 = spacing2;
      for (let cxg = gx - 1; cxg <= gx + 1; cxg++) {
        for (let cyg = gy - 1; cyg <= gy + 1; cyg++) {
          const arr = grid.get(cellKey(cxg, cyg));
          if (!arr) continue;
          for (let a = 0; a < arr.length; a++) {
            const j = arr[a];
            const dx = x - nx[j];
            const dy = y - ny[j];
            const d2 = dx * dx + dy * dy;
            if (d2 < bestD2) { bestD2 = d2; best = j; }
          }
        }
      }
      return best;
    };

    // --- seed the cluster ---------------------------------------------------
    const radial = seedMode !== 'ground';
    if (seedMode === 'ground') {
      // A row of nodes along the bottom edge (y = +H/2), spaced ~nodeSpacing.
      const y0 = canvasH / 2;
      const x0 = -canvasW / 2;
      const cols = Math.max(2, Math.floor(canvasW / spacing));
      for (let c = 0; c <= cols; c++) addNode(x0 + c * spacing, y0);
    } else if (seedMode === 'ring') {
      // Nodes on a circle of radius ~min(W,H)/4.
      const r = Math.min(canvasW, canvasH) / 4;
      const n0 = Math.max(8, Math.floor((Math.PI * 2 * r) / spacing));
      for (let i = 0; i < n0; i++) {
        const a = (i / n0) * Math.PI * 2;
        addNode(Math.cos(a) * r, Math.sin(a) * r);
      }
    } else {
      // center: a single seed node at the origin.
      addNode(0, 0);
    }

    // Track the cluster's current radial extent (for radial spawn/kill) and the
    // current frost line (for ground spawn/kill). These update as nodes stick.
    let maxExtent = 0;       // max distance from origin among nodes (radial)
    let frostTop = canvasH / 2; // smallest y (highest point) among nodes (ground)
    for (let i = 0; i < nx.length; i++) {
      if (radial) {
        const d = Math.hypot(nx[i], ny[i]);
        if (d > maxExtent) maxExtent = d;
      } else if (ny[i] < frostTop) {
        frostTop = ny[i];
      }
    }

    // Bounds for ground walkers (don't let them escape the canvas sideways).
    const groundHalfW = canvasW / 2 + spacing;
    const groundCeil = -canvasH / 2 - spacing * 2; // stop frost from leaving the top

    // --- aggregate until the cluster reaches `cap` nodes --------------------
    // Global safety cap: no param combo (e.g. very low stickiness → walkers
    // rarely stick) may hang generate or the "runs fast" test.
    const maxTotalSteps = cap * 4000 + 200000;
    let totalSteps = 0;

    while (nx.length < cap && totalSteps < maxTotalSteps) {
      // Spawn a walker near the boundary (NOT from infinity — required for perf).
      let wx, wy;
      let spawnR = 0;
      if (radial) {
        spawnR = Math.max(spacing * 3, maxExtent + spacing * 4);
        const a = ctx.random() * Math.PI * 2;
        wx = Math.cos(a) * spawnR;
        wy = Math.sin(a) * spawnR;
      } else {
        // ground: random x across the canvas, a few spacings above the frost line.
        wx = ctx.random(-canvasW / 2, canvasW / 2);
        wy = frostTop - spacing * (2 + ctx.random() * 3);
      }

      // kill radius (radial) / kill band (ground) bounds this walker.
      const killR = spawnR * 1.5;
      const killR2 = killR * killR;
      const maxWalkSteps = 4000;

      let stepsThisWalker = 0;
      let stuck = false;

      while (stepsThisWalker < maxWalkSteps) {
        stepsThisWalker++;
        totalSteps++;
        if (totalSteps >= maxTotalSteps) break;

        // Unbiased random-walk step (no inward drift), but with a MEAN-VALUE
        // (largest-empty-disk) jump: across the empty annulus the walker can
        // safely jump by its guaranteed clearance to the nearest node, then
        // reverts to the fine step near the cluster surface. `gap` is a true
        // lower bound on distance-to-nearest-node (all radial nodes lie within
        // maxExtent; all ground nodes have y >= frostTop), so the walker can
        // never tunnel past a node's detection shell. A uniform-direction jump
        // of radius `gap` is statistically identical to fine-stepping across the
        // clear disk (2D random-walk mean-value property) — same branching, far
        // fewer steps (keeps generate fast as the cluster grows).
        let gap;
        if (radial) gap = Math.hypot(wx, wy) - maxExtent;
        else gap = frostTop - wy;
        const step = gap > stepSize ? gap : stepSize;
        const ang = ctx.random() * Math.PI * 2;
        wx += Math.cos(ang) * step;
        wy += Math.sin(ang) * step;

        // Proximity test against the cluster.
        const parent = nearestWithin(wx, wy);
        if (parent >= 0) {
          // Within range — stick with probability `stickiness`.
          if (ctx.random() < stick) {
            // Place the new node at the WALKER's position (NOT snapped) — this
            // off-axis arrival is what makes the tree branch.
            const c = addNode(wx, wy);
            bonds.push({ p: parent, c });
            if (radial) {
              const d = Math.hypot(wx, wy);
              if (d > maxExtent) maxExtent = d;
            } else if (wy < frostTop) {
              frostTop = wy;
            }
            stuck = true;
            break;
          }
          // Didn't stick this time — keep walking (it may stick later).
        }

        // Bound the walker. Out of bounds → discard, spawn a fresh one.
        if (radial) {
          if (wx * wx + wy * wy > killR2) break;
        } else if (wx < -groundHalfW || wx > groundHalfW || wy < groundCeil || wy > canvasH / 2 + spacing) {
          break;
        }
      }

      // (stuck just falls through to the next spawn; the global cap guarantees
      // termination even in the degenerate low-stickiness / tiny-cluster case.)
      void stuck;
    }

    // --- decompose bonds into CONNECTED root→tip paths (S1) -----------------
    // Pure/topological — see decomposeIntoPaths' docstring for the rule.
    const paths = decomposeIntoPaths(bonds, nx.length);

    // --- emit: one <polyline> per decomposed path ----------------------------
    const fmt = (v) => (Math.round(v * 100) / 100).toString();
    const nodesAlso = render === 'nodesBonds';
    const nodeR = Math.max(0.3, strokeWeight * 1.5);

    for (const path of paths) {
      const pts = path.map((idx) => `${fmt(nx[idx])},${fmt(ny[idx])}`).join(' ');
      this.svgElements.push(
        `<polyline points="${pts}" fill="none" stroke="${color}" stroke-width="${strokeWeight}" stroke-linecap="round"/>`
      );
    }
    if (nodesAlso) {
      for (let i = 0; i < nx.length; i++) {
        this.svgElements.push(
          `<circle cx="${fmt(nx[i])}" cy="${fmt(ny[i])}" r="${fmt(nodeR)}" fill="${color}" stroke="none"/>`
        );
      }
    }

    const drawBase = () => {
      const c = ctx.color(color);
      c.setAlpha(Math.round((opacity / 100) * 255));
      ctx.noFill();
      ctx.stroke(c);
      ctx.strokeWeight(strokeWeight);
      ctx.strokeCap(ctx.ROUND);
      for (const path of paths) {
        ctx.beginShape();
        for (const idx of path) ctx.vertex(nx[idx], ny[idx]);
        ctx.endShape(); // open — no CLOSE, root end to tip end
      }
      if (nodesAlso) {
        ctx.noStroke();
        ctx.fill(c);
        for (let i = 0; i < nx.length; i++) {
          ctx.ellipse(nx[i], ny[i], nodeR * 2, nodeR * 2);
        }
      }
    };

    // REAL symmetry param (KEPT — like DifferentialGrowth/Feather/Spiral).
    applySymmetryDraw(ctx, symmetry, cx, cy, drawBase, startAngle * Math.PI / 180, offsetX, offsetY);
  }

  // One element per decomposed path (+ optional node circles), joined plainly.
  // toSVGGroup is INHERITED: it reads this._lastParams.symmetry, so the real
  // symmetry param flows through wrapSVGSymmetry for free. We deliberately do
  // NOT override toSVGGroup (that would risk re-hardcoding symmetry to 1).
  contentFor() {
    return this.svgElements.join('\n');
  }
}

/**
 * Decompose a bond forest (`{p,c}` parent-index → child-index pairs, in
 * CHILD-ASCENDING creation order — see the file header for why Dendrite's
 * `bonds` array always satisfies that) into CONNECTED root→tip node-index
 * paths, using main-branch continuation: at each junction, the child leading
 * to the DEEPEST subtree continues the current path; every other child starts
 * a NEW path (from the junction, so its bond to that junction is still
 * emitted, as that new path's first segment). Every bond therefore appears in
 * EXACTLY ONE returned path.
 *
 * Pure and coordinate-free — no p5, no `ctx`, unit-testable with hand-built
 * synthetic trees. A "root" is any node index in `[0, nodeCount)` that never
 * appears as a `c` in `bonds` (a DLA seed node, or any forest root generally —
 * `seedMode: 'ground'`/`'ring'` seed multiple disconnected roots).
 *
 * @param {{p:number,c:number}[]} bonds
 * @param {number} nodeCount total node count (seeds + stuck particles)
 * @returns {number[][]} paths, each of length >= 2 (>= 1 bond); root/junction → tip
 */
export function decomposeIntoPaths(bonds, nodeCount) {
  const children = new Array(nodeCount);
  for (let i = 0; i < nodeCount; i++) children[i] = [];
  const parentOf = new Int32Array(nodeCount).fill(-1);
  for (const b of bonds) {
    children[b.p].push(b.c);
    parentOf[b.c] = b.p;
  }

  // subtreeDepth[i] = length (in edges) of the longest downward chain rooted
  // at node i. One REVERSE pass over `bonds` suffices — no recursion needed,
  // and no explicit stack — because bonds are child-ascending and a parent
  // index is always < its own child's index: every bond rooted AT a given
  // child c (i.e. every bond with p===c) has a strictly higher child index
  // than c, so it was already folded into subtreeDepth[c] by the time this
  // reverse scan reaches the bond that made c itself a child.
  const subtreeDepth = new Float64Array(nodeCount); // 0 default = leaf
  for (let i = bonds.length - 1; i >= 0; i--) {
    const { p, c } = bonds[i];
    const d = subtreeDepth[c] + 1;
    if (d > subtreeDepth[p]) subtreeDepth[p] = d;
  }

  // Deepest-subtree child continues; ties broken toward the lower (earlier-
  // stuck) child index, for determinism.
  const deepestChild = (node) => {
    const kids = children[node];
    let best = kids[0];
    for (let k = 1; k < kids.length; k++) {
      if (subtreeDepth[kids[k]] > subtreeDepth[best]) best = kids[k];
    }
    return best;
  };

  const paths = [];
  // {node, viaChild}: viaChild=-1 marks a forest root (no forced first move).
  const starts = [];
  for (let i = 0; i < nodeCount; i++) {
    if (parentOf[i] === -1) starts.push({ node: i, viaChild: -1 });
  }
  while (starts.length) {
    const { node: startNode, viaChild } = starts.pop();
    const path = [startNode];
    let node = startNode;
    if (viaChild !== -1) {
      // Resume at the child the ORIGINATING path branched away from — do NOT
      // re-derive startNode's other children here, that already happened
      // once, at the point this marker was created below.
      path.push(viaChild);
      node = viaChild;
    }
    // Every node is entered into this loop body exactly once across the
    // WHOLE decomposition (as a root, as a `chosen` continuation, or as a
    // `viaChild` jump target) — so this enumerates every bond exactly once.
    for (;;) {
      const kids = children[node];
      if (kids.length === 0) break; // tip — no children, path ends here
      const chosen = deepestChild(node);
      for (const kid of kids) {
        if (kid !== chosen) starts.push({ node, viaChild: kid });
      }
      path.push(chosen);
      node = chosen;
    }
    if (path.length >= 2) paths.push(path); // >=2 nodes ⇒ at least one bond
  }
  return paths;
}
