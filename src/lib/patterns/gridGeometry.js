/**
 * gridGeometry — the pure, RNG-injected core of the Grid pattern's line layout.
 *
 * Extracted VERBATIM from Grid.generate() so it can be shared by two callers
 * without either drifting:
 *   - Grid.js passes the live p5 `ctx.random` → on-canvas/SVG output is
 *     byte-identical to before this extraction (same math, same RNG, same call
 *     order/count).
 *   - latticeForLayer passes a `makeP5Random(seed)` port so it reconstructs the
 *     SAME jittered positions offline, letting a motif stamp on the grid's real
 *     crossings (see latticeForLayer.js).
 *
 * The eases (power `nonLinear` + Inigo-Quilez/Schlick `gain`) and the jitter
 * loop are reproduced exactly from the original inline code — do NOT change the
 * `random` call order or count here without re-baselining Grid's output.
 */

import { stackWarpDisplacement } from '../fields/warp';
import { catmullRomToBezier } from './catmullRomBezier';

/**
 * Compute the grid's line positions in the ORIGIN-CENTERED frame (offsets about
 * 0, canvas-independent — the caller applies cx/cy via a translate).
 *
 * RNG contract (must match Grid's original inline behaviour EXACTLY):
 *   - `distribute` consumes NO randomness.
 *   - Jitter, ONLY when `jitter > 0`, draws one `rng(-jitter, jitter)` per
 *     x-position (ascending), THEN one per y-position (ascending). When
 *     `jitter <= 0` it draws nothing. Both axes always draw regardless of the
 *     drawHorizontal/drawVertical flags (those gate drawing, not layout).
 *
 * @param {object} params - grid params (cols, rows, spacing, nonLinear,
 *   nonLinearGain, jitter).
 * @param {(min:number, max:number) => number} rng - p5-compatible random.
 * @returns {{ xPositions: number[], yPositions: number[],
 *   xJittered: number[], yJittered: number[], totalW: number, totalH: number }}
 */
export function gridLinePositions(params, rng) {
  const {
    cols = 12,
    rows = 12,
    spacing = 40,
    nonLinear = 0,
    nonLinearGain = 0,
    jitter = 0,
  } = params || {};

  const gamma = nonLinear >= 0 ? 1 + nonLinear : 1 / (1 + Math.abs(nonLinear));
  const gainK = Math.pow(3, nonLinearGain);
  const gain = (x, k) => {
    const a = 0.5 * Math.pow(2 * (x < 0.5 ? x : 1 - x), k);
    return x < 0.5 ? a : 1 - a;
  };
  function distribute(count, totalSpan) {
    const positions = [];
    for (let i = 0; i <= count; i++) {
      const t = count > 0 ? i / count : 0.5; // 0..1
      const centered = t - 0.5; // -0.5..0.5
      const sign = centered >= 0 ? 1 : -1;
      const mag = Math.abs(centered) * 2; // 0..1, distance from center
      const eased = gain(Math.pow(mag, gamma), gainK); // power, then gain
      const tt = 0.5 + sign * eased * 0.5;
      positions.push(-totalSpan / 2 + tt * totalSpan);
    }
    return positions;
  }

  const totalW = cols * spacing;
  const totalH = rows * spacing;
  const xPositions = distribute(cols, totalW);
  const yPositions = distribute(rows, totalH);

  // Jitter — one draw per position, x-axis fully before y-axis, only when > 0.
  const xJittered = xPositions.map((x) => x + (jitter > 0 ? rng(-jitter, jitter) : 0));
  const yJittered = yPositions.map((y) => y + (jitter > 0 ? rng(-jitter, jitter) : 0));

  return { xPositions, yPositions, xJittered, yJittered, totalW, totalH };
}

/**
 * Build the warp-node chain + Catmull-Rom curve for each straight grid line —
 * the shared warped-geometry core. A straight line has only 2 endpoints and
 * cannot bend, so a warped line SUBDIVIDES into K nodes; interior nodes are
 * displaced along the guide field while the two ENDPOINTS stay pinned (tidy
 * plotter frame). This is the SINGLE source of the warped grid geometry: the
 * renderer paints the returned curve (canvas == SVG), and the extractor
 * reconstructs the identical curve for anchor placement — "exact-to-paint" by
 * construction rather than by two implementations agreeing by luck (PRD #109).
 *
 * Extracted VERBATIM from Grid.generate()'s inline warp build so on-canvas/SVG
 * output stays byte-identical: same K clamp, same source resolution, same
 * unit-domain formula, same interior-only displacement, same catmullRomToBezier.
 * warp consumes NO RNG — it runs after the jitter stream, so moving it here
 * cannot perturb call order. Returns FULL-PRECISION numbers; rounding/formatting
 * (toFixed) stays at the renderer's emit site.
 *
 * Warp displacement comes ONLY from `stackWarpDisplacement` (D2 invariant) — no
 * parallel warp math here or anywhere.
 *
 * @param {{x1:number,y1:number,x2:number,y2:number}[]} lines - straight lines in
 *   the ORIGIN-CENTERED frame (as Grid builds them from the jittered positions).
 * @param {object} warpMod - the resolved warp modulation object; its warp
 *   sources are `warpMod.sources ?? [warpMod]` (N=1 → the lone object).
 * @param {object} opts
 * @param {number} opts.canvasW - canvas width (px) for unit-domain mapping.
 * @param {number} opts.canvasH - canvas height (px).
 * @param {number} opts.warpNodes - requested node count; clamped to [2,24] and
 *   rounded (K).
 * @returns {{ nodes: {x:number,y:number}[],
 *   start: {x:number,y:number},
 *   segments: {c1:{x:number,y:number}, c2:{x:number,y:number}, end:{x:number,y:number}}[]
 * }[]} one warped curve per input line, index-aligned. `nodes` is the K-node
 *   warp chain; `start`/`segments` are its Catmull-Rom cubic form.
 */
export function gridWarpCurves(lines, warpMod, { canvasW, canvasH, warpNodes }) {
  const K = Math.max(2, Math.min(24, Math.round(warpNodes)));
  // Phase 2b: vector-SUM every warp source (N=1 → single, byte-identical).
  const sources = warpMod.sources ?? [warpMod];
  const curves = [];
  for (const l of lines) {
    const nodes = [];
    for (let k = 0; k < K; k++) {
      const t = k / (K - 1);
      const node = { x: l.x1 + (l.x2 - l.x1) * t, y: l.y1 + (l.y2 - l.y1) * t };
      // Pin endpoints: displace only interior nodes k=1..K-2.
      if (k > 0 && k < K - 1) {
        const u = (node.x + canvasW / 2) / canvasW;
        const v = (node.y + canvasH / 2) / canvasH;
        const { dx, dy } = stackWarpDisplacement(sources, u, v);
        node.x += dx;
        node.y += dy;
      }
      nodes.push(node);
    }
    const { start, segments } = catmullRomToBezier(nodes);
    curves.push({ nodes, start, segments });
  }
  return curves;
}
