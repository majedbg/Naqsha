/**
 * warpFrame.js — finite-difference tangent/normal frame for warp-aware motif
 * anchors, **FOR FREE POINTS ONLY**.
 *
 * ── Scope guard (issue #114 / PRD #109, hard rule) ───────────────────────────
 * This helper is used ONLY for FREE POINTS — anchor classes that are point-
 * warped rather than sampled on a reconstructed curve: **grid cells** and
 * **recursive-bendable centres**. Crossings, edges, and vertices take their
 * tangent EXACTLY from the reconstructed curve in their own slices — do NOT
 * route those through this finite-difference frame. (#105 scoped #104's FD down
 * to free points precisely because point-warp drifts up to ~50px from the true
 * bent-curve geometry at crossings; a free point has no such curve to be exact
 * to, so the FD frame is the correct — and measured-accurate — choice there.)
 *
 * ── Why finite difference ────────────────────────────────────────────────────
 * There is no closed-form warp field: the guide is a sampled grid + bilinear
 * interpolation, and its gradient is itself finite-differenced. Analytic frames
 * were rejected at #104 (drift 4–19° at clamped anchors — no smooth closed form
 * exists to differentiate). Instead we central-difference the ONE warp-
 * displacement primitive `stackWarpDisplacement` (`src/lib/fields/warp.js`) at
 * ε = 1/512 (4 primitive calls per anchor). This:
 *   - honours the D2 invariant trivially (the extractor calls the exact same
 *     primitive the renderer paints with — no parallel warp math), and
 *   - absorbs the magnitude clamp and multi-source stacking for free (they are
 *     inside the primitive), matching the painted CLAMPED geometry to < 0.24°
 *     on the prototype/warp-frame fixtures.
 *
 * ── Frame definition ─────────────────────────────────────────────────────────
 * A free point at unit coords (u,v) is painted at
 *   P(u,v) = ( u·W + dx , v·H + dy ),   {dx,dy} = stackWarpDisplacement(...)
 * so the warp Jacobian is
 *   J = [ [ W + ∂dx/∂u , ∂dx/∂v ],
 *         [     ∂dy/∂u , H + ∂dy/∂v ] ].
 * The frame is `atan2(J·ê)` for the grid basis vectors:
 *   tangent = angle of J·û = (W + ∂dx/∂u,  ∂dy/∂u)        — the u-axis tangent
 *   normal  = angle of J·v̂ = (∂dx/∂v,      H + ∂dy/∂v)    — the v-axis "cross"
 * With no warp J = diag(W,H), so tangent → 0 and normal → π/2 (the unwarped
 * grid axes) — the regression invariant. NOTE the normal is the v-column of the
 * warp Jacobian (grid v-axis under warp), NOT a re-orthonormalised `tangent+π/2`
 * — under shear the two axes are not perpendicular, by design, so an oriented
 * motif tracks how the local *lattice* bends. Only the TANGENT carries the
 * measured < 0.24° accuracy bound.
 */

import { stackWarpDisplacement } from './warp.js';

const DEFAULT_EPS = 1 / 512;

/**
 * Finite-difference tangent/normal frame for a FREE POINT under warp. See the
 * module docstring for the scope guard — do not call this for crossings, edges,
 * or vertices, which take exact tangents from their reconstructed curve.
 *
 * @param {object[]} sources - resolved modulation objects, exactly as passed to
 *   `stackWarpDisplacement` (only `channel==='warp'` entries with a `field` warp;
 *   an empty/warp-free stack yields the unwarped frame).
 * @param {number} u - unit-domain u ∈ [0,1] of the free point.
 * @param {number} v - unit-domain v ∈ [0,1] of the free point.
 * @param {object} o
 * @param {number} o.W - canvas width in px (scales the u-axis basis).
 * @param {number} o.H - canvas height in px (scales the v-axis basis).
 * @param {number} [o.eps=1/512] - central-difference step in unit-(u,v) space.
 * @param {object} [o.warpOpts] - { gain, maxPx } forwarded to the primitive so
 *   the frame uses the SAME warp params as the paint pass (D2 exact-to-paint).
 * @returns {{tangent:number, normal:number}} frame angles in radians.
 */
export function computeWarpFrame(sources, u, v, { W, H, eps = DEFAULT_EPS, warpOpts = {} } = {}) {
  if (!Number.isFinite(W) || !Number.isFinite(H)) {
    throw new Error('computeWarpFrame: W and H (canvas px) are required finite numbers');
  }

  // Central difference of the SINGLE warp primitive — 4 calls: ±ε in u, ±ε in v.
  const duP = stackWarpDisplacement(sources, u + eps, v, warpOpts);
  const duM = stackWarpDisplacement(sources, u - eps, v, warpOpts);
  const dvP = stackWarpDisplacement(sources, u, v + eps, warpOpts);
  const dvM = stackWarpDisplacement(sources, u, v - eps, warpOpts);

  const inv = 1 / (2 * eps);
  const ddx_du = (duP.dx - duM.dx) * inv;
  const ddy_du = (duP.dy - duM.dy) * inv;
  const ddx_dv = (dvP.dx - dvM.dx) * inv;
  const ddy_dv = (dvP.dy - dvM.dy) * inv;

  // tangent = J·û (u-axis), normal = J·v̂ (v-axis).
  const tangent = Math.atan2(ddy_du, W + ddx_du);
  const normal = Math.atan2(H + ddy_dv, ddx_dv);
  return { tangent, normal };
}
