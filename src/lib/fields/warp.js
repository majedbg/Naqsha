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

/**
 * Phase 2b (PRD §5) — WARP channel stacking. VECTOR-SUM the per-source
 * displacements: each warp source is clamped independently (per warpDisplacement)
 * then the displacements add. The accumulator initializes from the FIRST source
 * (not 0), so N=1 is bit-for-bit identical to a lone warpDisplacement (no sign-
 * of-zero drift). Sources without a warp field are ignored; an empty stack (or a
 * stack of only flat fields) yields {dx:0, dy:0}.
 *
 * @param {object[]} sources - resolved modulation objects; each may carry
 *   {channel, field, amount, ...}. Only channel==='warp' with a `field` count.
 * @param {number} u
 * @param {number} v
 * @param {object} [opts] - { gain, maxPx } forwarded to warpDisplacement
 * @returns {{dx:number, dy:number}} summed pixel displacement
 */
export function stackWarpDisplacement(sources, u, v, opts = {}) {
  const warp = Array.isArray(sources)
    ? sources.filter((s) => s && s.channel === "warp" && s.field)
    : [];
  if (warp.length === 0) return { dx: 0, dy: 0 };
  let { dx, dy } = warpDisplacement(warp[0].field, u, v, warp[0], opts);
  for (let i = 1; i < warp.length; i++) {
    const d = warpDisplacement(warp[i].field, u, v, warp[i], opts);
    dx += d.dx;
    dy += d.dy;
  }
  return { dx, dy };
}
