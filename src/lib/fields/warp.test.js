import { describe, it, expect } from "vitest";
import { warpDisplacement, WARP_GAIN, WARP_MAX_PX } from "./warp.js";
import { ScalarField } from "./ScalarField.js";

// Behavioral spec for the WARP displacement helper. A guide field's gradient
// drives a pixel displacement applied to vertex-list patterns at geometry-build
// time. v1 consumes only cfg.amount; the transfer chain (offset/shape/steps/
// polarity) is deliberately deferred. Tests pass explicit opts.gain/opts.maxPx
// so they stay deterministic regardless of the tunable module constants
// (WARP_GAIN / WARP_MAX_PX are visual values, retuned via Playwright).

describe("warpDisplacement", () => {
  it("displaces along the gradient (uphill) for a rightward-rising field", () => {
    // s = 2*(u-0.5) → ∂s/∂u = +2 everywhere, ∂s/∂v = 0.
    const field = ScalarField.fromFunction((u) => 2 * (u - 0.5), {
      nx: 65,
      ny: 65,
    });
    const { dx, dy } = warpDisplacement(field, 0.5, 0.5, {}, { gain: 1, maxPx: 1000 });
    expect(dx).toBeGreaterThan(0);
    expect(Math.abs(dy)).toBeLessThan(1e-6);
  });

  it("clamps displacement magnitude to maxPx*amount", () => {
    // Steep field so raw gradient (≈100) * gain (1) far exceeds the clamp.
    const field = ScalarField.fromFunction((u) => 100 * u, { nx: 65, ny: 65 });
    const maxPx = 20;
    const { dx, dy } = warpDisplacement(field, 0.5, 0.5, { amount: 1 }, { gain: 1, maxPx });
    const len = Math.hypot(dx, dy);
    expect(len).toBeCloseTo(maxPx, 4);
  });

  it("zero displacement on a flat field", () => {
    const field = ScalarField.fromFunction(() => 0.7, { nx: 33, ny: 33 });
    const { dx, dy } = warpDisplacement(field, 0.3, 0.6, {}, { gain: 1, maxPx: 1000 });
    expect(dx).toBe(0);
    expect(dy).toBe(0);
  });

  it("scales with amount up to the clamp", () => {
    // Gentle field + generous clamp so we stay in the linear (pre-clamp) regime.
    const field = ScalarField.fromFunction((u) => 2 * (u - 0.5), {
      nx: 65,
      ny: 65,
    });
    const a1 = warpDisplacement(field, 0.5, 0.5, { amount: 1 }, { gain: 1, maxPx: 1000 });
    const a2 = warpDisplacement(field, 0.5, 0.5, { amount: 2 }, { gain: 1, maxPx: 1000 });
    expect(a2.dx).toBeCloseTo(a1.dx * 2, 4);
  });

  it("amount defaults to 1", () => {
    const field = ScalarField.fromFunction((u) => 2 * (u - 0.5), {
      nx: 65,
      ny: 65,
    });
    const explicit = warpDisplacement(field, 0.5, 0.5, { amount: 1 }, { gain: 1, maxPx: 1000 });
    const defaulted = warpDisplacement(field, 0.5, 0.5, {}, { gain: 1, maxPx: 1000 });
    expect(defaulted.dx).toBeCloseTo(explicit.dx, 10);
  });

  it("exposes WARP_GAIN and WARP_MAX_PX as numeric constants", () => {
    expect(typeof WARP_GAIN).toBe("number");
    expect(typeof WARP_MAX_PX).toBe("number");
  });
});
