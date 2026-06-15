import { Pattern } from './drawingContext';
import { applySymmetryDraw } from './symmetryUtils';

/**
 * DifferentialGrowth — a self-avoiding curve that grows and folds into
 * brain-coral / fingerprint meanders, then renders the SETTLED final curve.
 *
 * This is NOT animated: generate() runs a fixed, deterministic budget of
 * grow+relax rounds to completion and emits the resulting polyline once.
 *
 * Model (per relax pass, for every node):
 *   - Attraction : pull toward the average of path-neighbor(s) — keeps the curve
 *                  connected at roughly the rest length.
 *   - Repulsion  : push away from all OTHER nodes within `repulsionRadius`
 *                  (self-avoidance). Queried via a SPATIAL HASH GRID (buckets of
 *                  repulsionRadius-sized cells, 3×3 neighborhood) so it's O(n),
 *                  NOT O(n²). The grid is rebuilt every pass since nodes move.
 *   - Smoothing  : blend toward the midpoint of neighbors — curve regularity.
 *   The three displacements are summed and applied per pass with a small step.
 *
 * Growth: a new node is injected on an edge that has stretched beyond a split
 * distance (a function of repulsionRadius). `growthStyle` selects WHERE nodes go:
 *   - uniform   : split the longest edges past threshold.
 *   - curvature : prefer high-curvature regions (organic lobing).
 *   - scattered : pick edges at random via the seeded RNG.
 * Injection stops once `maxNodes` is reached.
 *
 * topology = 'closed' seeds a small ring (a loop: wrap-around neighbors) → a
 * brain-coral blob. topology = 'open' seeds a short horizontal segment (a path:
 * the two endpoints have a single neighbor) → a fingerprint meander.
 *
 * The final node list is built ONCE in absolute, origin-centered coords.
 * `drawBase` replays it via `ctx` and the SVG (<polygon> closed / <polyline>
 * open) is emitted from the same array, so canvas == SVG and the whole thing is
 * seed-deterministic. Unlike ModuleGrid/Topographic this pattern KEEPS the
 * radial-symmetry control (real `symmetry` param, like Feather/Spiral).
 */
export default class DifferentialGrowth extends Pattern {
  generate(ctx, seed, params, canvasW, canvasH, color, opacity) {
    ctx.randomSeed(seed);
    this.svgElements = [];

    const {
      topology = 'closed',
      maxNodes = 1200,
      repulsionRadius = 12,
      attraction = 0.5,
      repulsion = 0.5,
      smoothing = 0.45,
      growthStyle = 'curvature',
      strokeWeight = 0.8,
      symmetry = 1,
      startAngle = 0,
      offsetX = 0,
      offsetY = 0,
    } = params || {};

    const cx = canvasW / 2;
    const cy = canvasH / 2;

    const closed = topology !== 'open';
    const cap = Math.max(8, Math.round(maxNodes));

    // Rest length between neighbors — keep it a comfortable margin below the
    // repulsion radius so attraction and repulsion settle to an equilibrium
    // spacing rather than fighting. Split when an edge stretches past ~1.6× rest.
    const radius = Math.max(1, repulsionRadius);
    const restLength = radius * 0.85;
    const splitDist = restLength * 1.6;
    const cellSize = radius; // spatial-hash bucket size = repulsion radius
    const stepSize = 0.35;   // global integration step (stability)

    // --- 1. Seed the node list, centered at origin --------------------------
    // nodes are flat parallel arrays xs[]/ys[] for cache-friendly inner loops.
    let xs = [];
    let ys = [];
    if (closed) {
      // Small ring of ~12 nodes with tiny seeded jitter.
      const n0 = 12;
      const seedR = Math.min(canvasW, canvasH) * 0.06;
      for (let i = 0; i < n0; i++) {
        const a = (i / n0) * Math.PI * 2;
        const jit = 1 + (ctx.random() - 0.5) * 0.1;
        xs.push(Math.cos(a) * seedR * jit);
        ys.push(Math.sin(a) * seedR * jit);
      }
    } else {
      // Short horizontal segment of ~8 nodes with tiny seeded jitter.
      const n0 = 8;
      const span = Math.min(canvasW, canvasH) * 0.12;
      for (let i = 0; i < n0; i++) {
        const t = n0 === 1 ? 0 : i / (n0 - 1);
        const jit = (ctx.random() - 0.5) * (span / n0) * 0.2;
        xs.push((t - 0.5) * span);
        ys.push(jit);
      }
    }

    // Neighbor accessors. For a loop both neighbors wrap; for a path the two
    // endpoints have a single neighbor (prev of node 0, next of last = -1).
    const prevIdx = (i, n) => (closed ? (i - 1 + n) % n : i - 1);
    const nextIdx = (i, n) => (closed ? (i + 1) % n : i + 1);

    // --- 2. Simulate a fixed, deterministic number of grow+relax rounds -----
    // Round count is BOUNDED so a default regenerate finishes well under ~1s and
    // even maxNodes=3000 does not hang. We add a fractional budget of nodes each
    // round so the final count tracks `cap` regardless of cap size (avoids the
    // "<1 node/round floors to 0 → never grows" stall), while edge-splitting
    // still gates on actual stretch so growth stays organic.
    const MAX_ROUNDS = 260;
    const growRounds = Math.round(MAX_ROUNDS * 0.85); // grow during the first 85%
    const startCount = xs.length;
    let budget = 0; // fractional accumulator of nodes allowed this round

    // Scratch displacement arrays (reused each pass).
    let dxs = new Float64Array(cap + 64);
    let dys = new Float64Array(cap + 64);

    // Spatial hash: rebuilt every pass (nodes move). bucket key → list of node
    // indices. Query the 3×3 neighborhood of cells around each node.
    const buildGrid = (n) => {
      const grid = new Map();
      for (let i = 0; i < n; i++) {
        const gx = Math.floor(xs[i] / cellSize);
        const gy = Math.floor(ys[i] / cellSize);
        const k = gx * 73856093 ^ gy * 19349663; // hashed cell key
        let arr = grid.get(k);
        if (!arr) { arr = []; grid.set(k, arr); }
        arr.push(i);
      }
      return grid;
    };

    for (let round = 0; round < MAX_ROUNDS; round++) {
      const n = xs.length;

      // -- relax pass (one integration step) --
      if (dxs.length < n) { dxs = new Float64Array(n + 64); dys = new Float64Array(n + 64); }
      else { dxs.fill(0, 0, n); dys.fill(0, 0, n); }

      const grid = buildGrid(n);
      const r2 = radius * radius;

      for (let i = 0; i < n; i++) {
        const xi = xs[i];
        const yi = ys[i];
        let ax = 0, ay = 0; // accumulated displacement for node i

        // Attraction + smoothing both use the path neighbors.
        const pi = prevIdx(i, n);
        const ni = nextIdx(i, n);
        const hasPrev = pi >= 0;
        const hasNext = ni < n && ni >= 0;
        if (hasPrev || hasNext) {
          let sx = 0, sy = 0, cnt = 0;
          if (hasPrev) { sx += xs[pi]; sy += ys[pi]; cnt++; }
          if (hasNext) { sx += xs[ni]; sy += ys[ni]; cnt++; }
          const mx = sx / cnt;
          const my = sy / cnt;
          // Attraction: move toward neighbor average (rest-length spring feel).
          ax += (mx - xi) * attraction;
          ay += (my - yi) * attraction;
          // Smoothing: blend toward the midpoint of neighbors (curve regularity).
          ax += (mx - xi) * smoothing * 0.5;
          ay += (my - yi) * smoothing * 0.5;
        }

        // Repulsion: push away from OTHER nodes within radius (3×3 cells).
        const gx = Math.floor(xi / cellSize);
        const gy = Math.floor(yi / cellSize);
        let rx = 0, ry = 0;
        for (let cxg = gx - 1; cxg <= gx + 1; cxg++) {
          for (let cyg = gy - 1; cyg <= gy + 1; cyg++) {
            const k = cxg * 73856093 ^ cyg * 19349663;
            const arr = grid.get(k);
            if (!arr) continue;
            for (let a = 0; a < arr.length; a++) {
              const j = arr[a];
              if (j === i) continue;
              const ddx = xi - xs[j];
              const ddy = yi - ys[j];
              const d2 = ddx * ddx + ddy * ddy;
              if (d2 >= r2 || d2 === 0) continue;
              const d = Math.sqrt(d2);
              // Linear falloff: full push at distance 0, zero at radius.
              const force = (radius - d) / radius;
              rx += (ddx / d) * force;
              ry += (ddy / d) * force;
            }
          }
        }
        ax += rx * repulsion;
        ay += ry * repulsion;

        dxs[i] = ax;
        dys[i] = ay;
      }

      // Apply displacements (small global step for stability).
      for (let i = 0; i < n; i++) {
        xs[i] += dxs[i] * stepSize;
        ys[i] += dys[i] * stepSize;
      }

      // -- growth pass: inject nodes on stretched edges, gated by maxNodes --
      if (round < growRounds && xs.length < cap) {
        // Smooth target so the count ramps to `cap` by the end of growRounds.
        const frac = (round + 1) / growRounds;
        const target = startCount + (cap - startCount) * frac;
        budget += target - xs.length; // accumulate fractional node allowance
        let allowed = Math.floor(budget);
        if (allowed > 0) {
          budget -= allowed;
          allowed = Math.min(allowed, cap - xs.length);
          if (allowed > 0) insertNodes(xs, ys, allowed, growthStyle, closed, splitDist, ctx);
          // Re-sync arrays in case insertNodes returned new arrays.
          xs = insertNodes._xs;
          ys = insertNodes._ys;
        }
      }
    }

    // --- A few final relax passes (no growth) to settle the curve -----------
    {
      const n = xs.length;
      if (dxs.length < n) { dxs = new Float64Array(n + 64); dys = new Float64Array(n + 64); }
      for (let pass = 0; pass < 4; pass++) {
        dxs.fill(0, 0, n);
        dys.fill(0, 0, n);
        const grid = buildGrid(n);
        const r2 = radius * radius;
        for (let i = 0; i < n; i++) {
          const xi = xs[i];
          const yi = ys[i];
          let ax = 0, ay = 0;
          const pi = prevIdx(i, n);
          const ni = nextIdx(i, n);
          const hasPrev = pi >= 0;
          const hasNext = ni < n && ni >= 0;
          if (hasPrev || hasNext) {
            let sx = 0, sy = 0, cnt = 0;
            if (hasPrev) { sx += xs[pi]; sy += ys[pi]; cnt++; }
            if (hasNext) { sx += xs[ni]; sy += ys[ni]; cnt++; }
            const mx = sx / cnt;
            const my = sy / cnt;
            ax += (mx - xi) * attraction;
            ay += (my - yi) * attraction;
            ax += (mx - xi) * smoothing * 0.5;
            ay += (my - yi) * smoothing * 0.5;
          }
          const gx = Math.floor(xi / cellSize);
          const gy = Math.floor(yi / cellSize);
          let rx = 0, ry = 0;
          for (let cxg = gx - 1; cxg <= gx + 1; cxg++) {
            for (let cyg = gy - 1; cyg <= gy + 1; cyg++) {
              const k = cxg * 73856093 ^ cyg * 19349663;
              const arr = grid.get(k);
              if (!arr) continue;
              for (let a = 0; a < arr.length; a++) {
                const j = arr[a];
                if (j === i) continue;
                const ddx = xi - xs[j];
                const ddy = yi - ys[j];
                const d2 = ddx * ddx + ddy * ddy;
                if (d2 >= r2 || d2 === 0) continue;
                const d = Math.sqrt(d2);
                const force = (radius - d) / radius;
                rx += (ddx / d) * force;
                ry += (ddy / d) * force;
              }
            }
          }
          ax += rx * repulsion;
          ay += ry * repulsion;
          dxs[i] = ax;
          dys[i] = ay;
        }
        for (let i = 0; i < n; i++) {
          xs[i] += dxs[i] * stepSize;
          ys[i] += dys[i] * stepSize;
        }
      }
    }

    // --- 3. Emit exactly ONE element + build the draw replay ----------------
    const n = xs.length;
    const fmt = (v) => (Math.round(v * 100) / 100).toString();
    const pts = [];
    for (let i = 0; i < n; i++) pts.push(`${fmt(xs[i])},${fmt(ys[i])}`);
    const pointsStr = pts.join(' ');

    if (closed) {
      this.svgElements.push(
        `<polygon points="${pointsStr}" fill="none" stroke="${color}" stroke-width="${strokeWeight}"/>`
      );
    } else {
      this.svgElements.push(
        `<polyline points="${pointsStr}" fill="none" stroke="${color}" stroke-width="${strokeWeight}"/>`
      );
    }

    const drawBase = () => {
      const c = ctx.color(color);
      c.setAlpha(Math.round((opacity / 100) * 255));
      ctx.noFill();
      ctx.stroke(c);
      ctx.strokeWeight(strokeWeight);
      ctx.beginShape();
      for (let i = 0; i < n; i++) ctx.vertex(xs[i], ys[i]);
      if (closed) ctx.endShape(ctx.CLOSE);
      else ctx.endShape();
    };

    // REAL symmetry param (KEPT — like Feather/Spiral, not the hardcoded-1 path).
    applySymmetryDraw(ctx, symmetry, cx, cy, drawBase, startAngle * Math.PI / 180, offsetX, offsetY);
  }

  // One element (polygon or polyline), joined plainly (mirrors Feather/Topographic).
  // toSVGGroup is INHERITED: it reads this._lastParams.symmetry, so the real
  // symmetry param flows through wrapSVGSymmetry for free. We deliberately do
  // NOT override toSVGGroup (that would risk re-hardcoding symmetry to 1).
  contentFor() {
    return this.svgElements.join('\n');
  }
}

/**
 * Insert `count` new nodes into the xs/ys arrays by splitting edges, choosing
 * WHERE based on `style`. Each new node is the midpoint of a chosen edge; the
 * relax pass then pushes it apart. Splits are applied to a fresh pair of arrays
 * so neighbor indices stay coherent, then exposed on insertNodes._xs/_ys.
 *
 *   uniform   — split the longest edges past the split distance.
 *   curvature — prefer high-curvature edges (turn angle at the edge's nodes),
 *               producing organic lobing; still only past the split distance.
 *   scattered — pick eligible edges at random via the seeded RNG.
 *
 * Edges are between node i and its forward neighbor. For a closed loop every
 * node has a forward edge (i → (i+1)%n); for an open path edges are 0..n-2.
 */
function insertNodes(xs, ys, count, style, closed, splitDist, ctx) {
  const n = xs.length;
  const edgeCount = closed ? n : n - 1;
  if (edgeCount <= 0) { insertNodes._xs = xs; insertNodes._ys = ys; return; }

  // Score each edge; only edges longer than splitDist are eligible.
  const candidates = []; // { edge: i, score }
  for (let i = 0; i < edgeCount; i++) {
    const j = closed ? (i + 1) % n : i + 1;
    const ex = xs[j] - xs[i];
    const ey = ys[j] - ys[i];
    const len = Math.hypot(ex, ey);
    if (len < splitDist) continue;

    let score;
    if (style === 'uniform') {
      score = len;
    } else if (style === 'scattered') {
      score = ctx.random(); // seeded random priority
    } else {
      // curvature: turn angle at the two edge endpoints (sum of |angle| between
      // adjacent edges). High curvature → preferred, scaled by length so very
      // long edges still split.
      const curv = vertexCurvature(xs, ys, i, n, closed) + vertexCurvature(xs, ys, j, n, closed);
      score = len * (1 + curv * 2);
    }
    candidates.push({ edge: i, score });
  }

  if (candidates.length === 0) {
    // Nothing past threshold yet — fall back to splitting the longest edges so
    // growth never fully stalls early (keeps the final count tracking maxNodes).
    for (let i = 0; i < edgeCount; i++) {
      const j = closed ? (i + 1) % n : i + 1;
      const len = Math.hypot(xs[j] - xs[i], ys[j] - ys[i]);
      candidates.push({ edge: i, score: style === 'scattered' ? ctx.random() : len });
    }
  }

  // Highest score first; take up to `count` distinct edges.
  candidates.sort((a, b) => b.score - a.score);
  const chosen = new Set();
  for (let k = 0; k < candidates.length && chosen.size < count; k++) {
    chosen.add(candidates[k].edge);
  }

  // Rebuild the arrays, inserting a midpoint AFTER node i for each chosen edge i.
  const outX = [];
  const outY = [];
  for (let i = 0; i < n; i++) {
    outX.push(xs[i]);
    outY.push(ys[i]);
    if (chosen.has(i)) {
      const j = closed ? (i + 1) % n : i + 1;
      // j is always valid here: open-path edges are 0..n-2 so i+1 < n.
      outX.push((xs[i] + xs[j]) / 2);
      outY.push((ys[i] + ys[j]) / 2);
    }
  }

  insertNodes._xs = outX;
  insertNodes._ys = outY;
}

/** |turn angle| (radians) at node i, between its incoming and outgoing edges. */
function vertexCurvature(xs, ys, i, n, closed) {
  const pi = closed ? (i - 1 + n) % n : i - 1;
  const ni = closed ? (i + 1) % n : i + 1;
  if (pi < 0 || ni >= n) return 0; // endpoint of an open path
  const ax = xs[i] - xs[pi];
  const ay = ys[i] - ys[pi];
  const bx = xs[ni] - xs[i];
  const by = ys[ni] - ys[i];
  const a1 = Math.atan2(ay, ax);
  const a2 = Math.atan2(by, bx);
  let d = a2 - a1;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return Math.abs(d);
}
