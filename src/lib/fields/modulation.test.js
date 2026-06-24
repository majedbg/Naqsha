import { describe, it, expect } from "vitest";
import { modulationTransfer, densityWeight, applyRange } from "./modulation";

// modulationTransfer is the shared transfer chain (Ableton-LFO inspired):
//   s → applyRange(range) → +offset → shape(ease) → steps(quantize) → ×amount
// applyRange affine-remaps the field's nominal [-1,1] onto [min,max], so the
// device-level range replaces the old per-map polarity toggle. It returns a
// signed contribution; consumers map it to a channel (density: weight = 1 +
// contribution).
describe("applyRange", () => {
  it("is identity for the full range [-1,1]", () => {
    for (const s of [-1, -0.5, 0, 0.3, 1]) {
      expect(applyRange(s, { min: -1, max: 1 })).toBeCloseTo(s);
    }
  });

  it("hits the endpoints exactly", () => {
    expect(applyRange(-1, { min: 0, max: 1 })).toBeCloseTo(0);
    expect(applyRange(1, { min: 0, max: 1 })).toBeCloseTo(1);
    expect(applyRange(-1, { min: -1, max: 0 })).toBeCloseTo(-1);
    expect(applyRange(1, { min: -1, max: 0 })).toBeCloseTo(0);
    expect(applyRange(0, { min: 0, max: 1 })).toBeCloseTo(0.5);
  });
});

describe("modulationTransfer", () => {
  it("is 0 for a neutral field at defaults", () => {
    expect(modulationTransfer(0, {})).toBe(0);
  });

  it("scales the field by amount (bipolar, default amount 1)", () => {
    expect(modulationTransfer(1, {})).toBeCloseTo(1);
    expect(modulationTransfer(-1, {})).toBeCloseTo(-1);
    expect(modulationTransfer(1, { amount: 2 })).toBeCloseTo(2);
    expect(modulationTransfer(0.5, { amount: 2 })).toBeCloseTo(1);
  });

  it("offset shifts the field center before scaling", () => {
    expect(modulationTransfer(0, { offset: 0.5 })).toBeCloseTo(0.5);
    expect(modulationTransfer(0, { offset: 0.5, amount: 2 })).toBeCloseTo(1);
  });

  it("range [-1,1] is identity (attract + repel)", () => {
    for (const s of [-1, -0.4, 0, 0.7, 1]) {
      expect(modulationTransfer(s, { range: { min: -1, max: 1 } })).toBeCloseTo(s);
    }
    // absent range defaults to identity too
    expect(modulationTransfer(-1, {})).toBeCloseTo(-1);
    expect(modulationTransfer(1, {})).toBeCloseTo(1);
  });

  it("range [0,1] is attract-only (output >= 0)", () => {
    // [-1,1] → [0,1]: negative field no longer pulls below the base value
    const r = { min: 0, max: 1 };
    expect(modulationTransfer(-1, { range: r })).toBeCloseTo(0);
    expect(modulationTransfer(0, { range: r })).toBeCloseTo(0.5);
    expect(modulationTransfer(1, { range: r })).toBeCloseTo(1);
    for (const s of [-1, -0.6, 0, 0.5, 1]) {
      expect(modulationTransfer(s, { range: r })).toBeGreaterThanOrEqual(0);
    }
  });

  it("range [-1,0] is repel-only (output <= 0)", () => {
    const r = { min: -1, max: 0 };
    expect(modulationTransfer(-1, { range: r })).toBeCloseTo(-1);
    expect(modulationTransfer(0, { range: r })).toBeCloseTo(-0.5);
    expect(modulationTransfer(1, { range: r })).toBeCloseTo(0);
    for (const s of [-1, -0.2, 0, 0.8, 1]) {
      expect(modulationTransfer(s, { range: r })).toBeLessThanOrEqual(0);
    }
  });

  it("shape eases the response while preserving endpoints and sign", () => {
    // identity at shape 0
    expect(modulationTransfer(0.5, { shape: 0 })).toBeCloseTo(0.5);
    // endpoints fixed
    expect(modulationTransfer(0, { shape: 0.5 })).toBeCloseTo(0);
    expect(modulationTransfer(1, { shape: 0.5 })).toBeCloseTo(1);
    // positive shape pulls the midpoint down (slow start)
    expect(modulationTransfer(0.5, { shape: 0.5 })).toBeLessThan(0.5);
    // negative shape pushes it up (fast start)
    expect(modulationTransfer(0.5, { shape: -0.5 })).toBeGreaterThan(0.5);
    // sign preserved (odd symmetry around 0 for bipolar)
    expect(modulationTransfer(-0.5, { shape: 0.5 })).toBeCloseTo(
      -modulationTransfer(0.5, { shape: 0.5 })
    );
  });

  it("steps quantize the response into discrete bands", () => {
    // steps:2 snaps to multiples of 1/2 → 0.4 rounds up to 0.5, 0.24 down to 0
    expect(modulationTransfer(0.4, { steps: 2 })).toBeCloseTo(0.5);
    expect(modulationTransfer(0.24, { steps: 2 })).toBeCloseTo(0);
    // steps:0 stays continuous
    expect(modulationTransfer(0.4, { steps: 0 })).toBeCloseTo(0.4);
    // quantization happens before amount scaling
    expect(modulationTransfer(0.4, { steps: 2, amount: 2 })).toBeCloseTo(1);
  });
});

describe("densityWeight (consumer wrapper)", () => {
  it("is 1 + transfer, clamped at 0", () => {
    expect(densityWeight(0, {})).toBeCloseTo(1); // neutral
    expect(densityWeight(1, { amount: 2 })).toBeCloseTo(3); // 1 + 2
    expect(densityWeight(-1, { amount: 2 })).toBeCloseTo(0); // 1 + (-2) → clamp 0
  });

  it("equals max(0, 1 + modulationTransfer) for any config", () => {
    const cfg = { amount: 1.5, offset: 0.2, shape: 0.4, steps: 3 };
    for (const s of [-1, -0.3, 0, 0.6, 1]) {
      expect(densityWeight(s, cfg)).toBeCloseTo(
        Math.max(0, 1 + modulationTransfer(s, cfg))
      );
    }
  });
});
