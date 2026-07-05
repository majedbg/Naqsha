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
