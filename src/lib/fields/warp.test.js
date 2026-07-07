import { describe, it, expect } from "vitest";
import {
  warpDisplacement,
  stackWarpDisplacement,
  WARP_GAIN,
  WARP_MAX_PX,
} from "./warp.js";
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

// Phase 2b (PRD §5) — the WARP channel stacks by VECTOR-SUM of per-source
// displacements. `stackWarpDisplacement` sums warpDisplacement over every warp
// source; N=1 is bit-identical to a lone warpDisplacement, and a flat (zero-
// gradient) source contributes nothing.
describe("stackWarpDisplacement (warp vector-sum)", () => {
  const rising = () =>
    ScalarField.fromFunction((u) => 2 * (u - 0.5), { nx: 65, ny: 65 });
  const falling = () =>
    ScalarField.fromFunction((u) => -2 * (u - 0.5), { nx: 65, ny: 65 });
  const flat = () => ScalarField.fromFunction(() => 0.7, { nx: 33, ny: 33 });
  const opts = { gain: 1, maxPx: 1000 }; // stay in the linear (pre-clamp) regime

  it("N=1 is bit-identical to a single warpDisplacement", () => {
    const field = rising();
    const cfg = { channel: "warp", field, amount: 1 };
    const single = warpDisplacement(field, 0.5, 0.5, cfg, opts);
    const stacked = stackWarpDisplacement([cfg], 0.5, 0.5, opts);
    expect(stacked.dx).toBe(single.dx);
    expect(stacked.dy).toBe(single.dy);
  });

  it("vector-sums two sources' displacements", () => {
    const f1 = rising();
    const f2 = rising();
    const c1 = { channel: "warp", field: f1, amount: 1 };
    const c2 = { channel: "warp", field: f2, amount: 1 };
    const d1 = warpDisplacement(f1, 0.5, 0.5, c1, opts);
    const d2 = warpDisplacement(f2, 0.5, 0.5, c2, opts);
    const stacked = stackWarpDisplacement([c1, c2], 0.5, 0.5, opts);
    expect(stacked.dx).toBeCloseTo(d1.dx + d2.dx, 10);
    expect(stacked.dy).toBeCloseTo(d1.dy + d2.dy, 10);
  });

  it("cancels opposing sources (rising + falling → ~0)", () => {
    const c1 = { channel: "warp", field: rising(), amount: 1 };
    const c2 = { channel: "warp", field: falling(), amount: 1 };
    const stacked = stackWarpDisplacement([c1, c2], 0.5, 0.5, opts);
    expect(Math.abs(stacked.dx)).toBeLessThan(1e-9);
  });

  it("a flat (zero-gradient) source is a no-op in the sum", () => {
    const warp = { channel: "warp", field: rising(), amount: 1 };
    const neutral = { channel: "warp", field: flat(), amount: 1 };
    const alone = stackWarpDisplacement([warp], 0.5, 0.5, opts);
    const withNeutral = stackWarpDisplacement([warp, neutral], 0.5, 0.5, opts);
    expect(withNeutral.dx).toBeCloseTo(alone.dx, 10);
    expect(withNeutral.dy).toBeCloseTo(alone.dy, 10);
  });

  it("ignores non-warp / fieldless sources in the stack", () => {
    const warp = { channel: "warp", field: rising(), amount: 1 };
    const density = { channel: "density", field: rising(), amount: 1 };
    const fieldless = { channel: "warp", amount: 1 };
    const alone = stackWarpDisplacement([warp], 0.5, 0.5, opts);
    const mixed = stackWarpDisplacement(
      [warp, density, fieldless],
      0.5,
      0.5,
      opts
    );
    expect(mixed.dx).toBe(alone.dx);
    expect(mixed.dy).toBe(alone.dy);
  });

  it("empty stack yields zero displacement", () => {
    expect(stackWarpDisplacement([], 0.5, 0.5, opts)).toEqual({ dx: 0, dy: 0 });
  });
});
