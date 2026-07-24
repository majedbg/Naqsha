// warpFrame — finite-difference tangent/normal frame helper (FREE POINTS ONLY).
//
// Behavioural coverage (issue #114, parent PRD #109):
//   1. No-warp regression — with no warp channel the frame reduces to the
//      unwarped grid axes: tangent 0, normal π/2 (byte-exact).
//   2. D2 rule — the frame is derived ONLY from stackWarpDisplacement: the
//      helper's tangent/normal equal an independent central-difference of that
//      one primitive at ε = 1/512.
//   3. warpOpts pass-through — gain/maxPx reach the primitive (same warp the
//      paint pass sees), so changing them changes the frame.
//   4. Accuracy — the FD tangent matches the painted CLAMPED geometry to
//      < 0.24° on the prototype/warp-frame fixtures (harness lifted verbatim).

import { describe, it, expect } from 'vitest';
import { ScalarField } from './ScalarField.js';
import { stackWarpDisplacement, WARP_GAIN, WARP_MAX_PX } from './warp.js';
import { computeWarpFrame } from './warpFrame.js';

const W = 600;
const H = 600;

const degDiff = (r1, r2) => {
  let d = ((r1 - r2) * 180) / Math.PI;
  while (d > 180) d -= 360;
  while (d < -180) d += 360;
  return Math.abs(d);
};

describe('computeWarpFrame — no-warp regression', () => {
  it('reduces to the unwarped grid axes (tangent 0, normal π/2) with no sources', () => {
    const { tangent, normal } = computeWarpFrame([], 0.4, 0.6, { W, H });
    expect(tangent).toBe(0);
    expect(normal).toBeCloseTo(Math.PI / 2, 12);
  });

  it('reduces to the unwarped axes when the only source is a flat (zero-gradient) field', () => {
    const flat = ScalarField.fromFunction(() => 0.5, { nx: 33, ny: 33 });
    const sources = [{ channel: 'warp', field: flat, amount: 1 }];
    const { tangent, normal } = computeWarpFrame(sources, 0.4, 0.6, { W, H });
    expect(tangent).toBe(0);
    expect(normal).toBeCloseTo(Math.PI / 2, 12);
  });

  it('ignores non-warp channels (density) exactly as stackWarpDisplacement does', () => {
    const field = ScalarField.fromFunction((u, v) => Math.sin(6 * u) * Math.cos(6 * v), {
      nx: 65,
      ny: 65,
    });
    const sources = [{ channel: 'density', field, amount: 1 }];
    const { tangent, normal } = computeWarpFrame(sources, 0.333, 0.412, { W, H });
    expect(tangent).toBe(0);
    expect(normal).toBeCloseTo(Math.PI / 2, 12);
  });
});

describe('computeWarpFrame — D2 (single warp primitive)', () => {
  it('derives tangent & normal from a central-difference of stackWarpDisplacement at ε=1/512', () => {
    const field = ScalarField.fromFunction((u, v) => Math.sin(9 * u) * Math.cos(9 * v), {
      nx: 129,
      ny: 129,
    });
    const sources = [{ channel: 'warp', field, amount: 1 }];
    const u = 0.37;
    const v = 0.58;
    const eps = 1 / 512;

    // Independent central difference of the ONLY allowed primitive.
    const duP = stackWarpDisplacement(sources, u + eps, v);
    const duM = stackWarpDisplacement(sources, u - eps, v);
    const dvP = stackWarpDisplacement(sources, u, v + eps);
    const dvM = stackWarpDisplacement(sources, u, v - eps);
    const ddx_du = (duP.dx - duM.dx) / (2 * eps);
    const ddy_du = (duP.dy - duM.dy) / (2 * eps);
    const ddx_dv = (dvP.dx - dvM.dx) / (2 * eps);
    const ddy_dv = (dvP.dy - dvM.dy) / (2 * eps);
    const expectTangent = Math.atan2(ddy_du, W + ddx_du);
    const expectNormal = Math.atan2(H + ddy_dv, ddx_dv);

    const { tangent, normal } = computeWarpFrame(sources, u, v, { W, H });
    expect(tangent).toBeCloseTo(expectTangent, 12);
    expect(normal).toBeCloseTo(expectNormal, 12);
  });

  it('forwards warpOpts (gain) to the primitive, changing the frame', () => {
    const field = ScalarField.fromFunction((u, v) => Math.sin(9 * u) * Math.cos(9 * v), {
      nx: 129,
      ny: 129,
    });
    const sources = [{ channel: 'warp', field, amount: 1 }];
    const base = computeWarpFrame(sources, 0.37, 0.58, { W, H });
    const boosted = computeWarpFrame(sources, 0.37, 0.58, {
      W,
      H,
      warpOpts: { gain: WARP_GAIN * 4, maxPx: WARP_MAX_PX * 4 },
    });
    expect(boosted.tangent).not.toBeCloseTo(base.tangent, 6);
  });
});

// ── Accuracy fixture — harness lifted verbatim from prototype/warp-frame ──────
// (docs/research/proto-warp-frame/warpFrame.proto.mjs). Ground truth = the
// derivative of the TRUE CONTINUOUS CLAMPED warp map (exact closed-form ∇f, same
// clamp as warpDisplacement, high-res FD). Any method must match THIS.
describe('computeWarpFrame — accuracy vs painted clamped geometry (< 0.24°)', () => {
  const GAIN = WARP_GAIN;
  const MAXPX = WARP_MAX_PX;
  const A = 1;
  const a = 2 * Math.PI * 1.5;
  const b = 2 * Math.PI * 1.5;
  const f = (u, v) => A * Math.sin(a * u) * Math.cos(b * v);
  const f_u = (u, v) => A * a * Math.cos(a * u) * Math.cos(b * v);
  const f_v = (u, v) => -A * b * Math.sin(a * u) * Math.sin(b * v);

  function trueClampedDisp(u, v, amount) {
    let vx = GAIN * amount * f_u(u, v);
    let vy = GAIN * amount * f_v(u, v);
    const len = Math.hypot(vx, vy);
    const maxPx = MAXPX * amount;
    if (len > maxPx && len > 0) {
      const s = maxPx / len;
      vx *= s;
      vy *= s;
    }
    return { dx: vx, dy: vy };
  }
  function frameGroundTruthClamped(u, v, amount) {
    const e = 1e-5;
    const du = trueClampedDisp(u + e, v, amount);
    const du2 = trueClampedDisp(u - e, v, amount);
    const ddx_du = (du.dx - du2.dx) / (2 * e);
    const ddy_du = (du.dy - du2.dy) / (2 * e);
    return Math.atan2(ddy_du, W + ddx_du);
  }

  // Well-resolved field so the helper is limited by its OWN truncation error,
  // not field discretization (prototype: 0.009° at 65², vs 0.424° at 17²).
  const field = ScalarField.fromFunction(f, { nx: 129, ny: 129 });
  const amount = 1;
  const sources = [{ channel: 'warp', field, amount }];

  it.each([
    { name: 'smooth interior', u: 0.333, v: 0.412 },
    { name: 'near nodal (steep, clamped)', u: 0.5, v: 0.02 },
  ])('FD tangent matches painted clamped geometry within 0.24° at $name', ({ u, v }) => {
    const gt = frameGroundTruthClamped(u, v, amount);
    const { tangent } = computeWarpFrame(sources, u, v, { W, H });
    expect(degDiff(tangent, gt)).toBeLessThan(0.24);
  });
});
