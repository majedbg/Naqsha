import { Pattern } from './drawingContext';
import { applySymmetryDraw } from './symmetryUtils';

/**
 * Dendrite — diffusion-limited aggregation (DLA) rendered as a BRANCH SKELETON.
 *
 * Particles random-walk until they stick to a growing cluster, forming a
 * branching dendrite (frost / coral / lightning). We do NOT fill the mass — we
 * emit one <line> per bond (a stuck particle → the particle it attached to), so
 * the output is a vector branch tree suitable for a pen-plotter / vinyl-cutter.
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
 * `drawBase` replays the bonds via `ctx`; the SVG <line>/<circle> strings are
 * built from the SAME arrays, so canvas == SVG. Like DifferentialGrowth, this
 * pattern KEEPS the real radial-symmetry control (we override only `contentFor`,
 * never `toSVGGroup`, so the real `symmetry` param flows through wrapSVGSymmetry).
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

    // --- emit: one <line> per bond (the branch skeleton) --------------------
    const fmt = (v) => (Math.round(v * 100) / 100).toString();
    const nodesAlso = render === 'nodesBonds';
    const nodeR = Math.max(0.3, strokeWeight * 1.5);

    for (const b of bonds) {
      this.svgElements.push(
        `<line x1="${fmt(nx[b.p])}" y1="${fmt(ny[b.p])}" x2="${fmt(nx[b.c])}" y2="${fmt(ny[b.c])}" stroke="${color}" stroke-width="${strokeWeight}" stroke-linecap="round"/>`
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
      for (const b of bonds) {
        ctx.line(nx[b.p], ny[b.p], nx[b.c], ny[b.c]);
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

  // One element per bond (+ optional node circles), joined plainly. toSVGGroup
  // is INHERITED: it reads this._lastParams.symmetry, so the real symmetry param
  // flows through wrapSVGSymmetry for free. We deliberately do NOT override
  // toSVGGroup (that would risk re-hardcoding symmetry to 1).
  contentFor() {
    return this.svgElements.join('\n');
  }
}
