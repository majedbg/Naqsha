/**
 * warp.js — pure WARP displacement helper for the pattern-modulation feature.
 *
 * The WARP channel displaces the VERTICES of vertex-list patterns (Chladni,
 * TopographicContours, FlowField) along a guide field's gradient, at geometry-
 * BUILD time — before each pattern's dual emit (canvas via ctx, SVG via string
 * templating). It must mutate the shared vertex arrays, never via a ctx
 * decorator (SVG export bypasses ctx).
 *
 * Displacement formula — raw gradient with a magnitude clamp:
 *   - We push each vertex along ∇f (uphill, toward higher field). Chladni's
 *     gradient is steepest exactly on the nodal zero-set it draws, so the raw
 *     gradient is the expressive part; the clamp keeps high-mode fields bounded.
 *   - WARP_GAIN (px per unit-gradient) and WARP_MAX_PX (clamp at amount 1) are
 *     the single tuning surface — VISUAL values, tuned via Playwright, not tests.
 *
 * v1 consumes ONLY cfg.amount. The transfer chain (offset / shape / steps /
 * polarity) used by the density channel is DEFERRED for warp — not applied here.
 */

// px per unit-gradient. Small: the Chladni gradient near nodal lines is large,
// so a modest gain plus the clamp gives a clear-but-tasteful warp at amount 1.
export const WARP_GAIN = 6;

// Clamp at amount 1, in px. ~0.04 of a ~600px reference canvas (≈24px). The
// clamp scales with amount, so amount 3 reaches ~72px before saturating.
export const WARP_MAX_PX = 24;

/**
 * Pixel displacement for a vertex at unit-domain coords (u,v).
 * @param {import('./ScalarField.js').ScalarField} field - guide field
 * @param {number} u
 * @param {number} v
 * @param {object} [cfg] - runtime modulation object; v1 uses only cfg.amount
 * @param {object} [opts] - { gain, maxPx } tuning overrides (default module consts)
 * @returns {{dx:number, dy:number}} pixel displacement
 */
export function warpDisplacement(field, u, v, cfg = {}, opts = {}) {
  const { dx: gx, dy: gy } = field.sampleGradient(u, v);
  const amount = cfg.amount ?? 1;
  const gain = opts.gain ?? WARP_GAIN;
  const maxPx = (opts.maxPx ?? WARP_MAX_PX) * amount;

  let vx = gx * gain * amount;
  let vy = gy * gain * amount;

  const len = Math.hypot(vx, vy);
  if (len > maxPx && len > 0) {
    const s = maxPx / len;
    vx *= s;
    vy *= s;
  }
  return { dx: vx, dy: vy };
}
