import { describe, it, expect } from "vitest";
import { densityWeight } from "./modulation";

// densityWeight maps a signed field value s ∈ [-1,1] to a non-negative spatial
// weight used by density-modulated patterns (e.g. weighted Lloyd in GrainField).
// Neutral field → weight 1 so an all-zero field leaves a pattern unchanged.
describe("densityWeight", () => {
  it("is neutral (1) at a zero field with default config", () => {
    expect(densityWeight(0, {})).toBe(1);
  });

  it("raises weight where the field is positive (default gain)", () => {
    // s=+1, gain=1 → 1 + 1*1 = 2
    expect(densityWeight(1, {})).toBeCloseTo(2);
    expect(densityWeight(0.5, {})).toBeCloseTo(1.5);
  });

  it("clamps to 0 instead of going negative on strong negative field", () => {
    // s=-1, gain=2 → 1 + 2*(-1) = -1 → clamped to 0
    expect(densityWeight(-1, { gain: 2 })).toBe(0);
  });

  it("invert flips which lobes attract density", () => {
    // invert negates s: +1 now behaves like -1
    expect(densityWeight(1, { invert: true })).toBeCloseTo(
      densityWeight(-1, {})
    );
    expect(densityWeight(-1, { invert: true })).toBeCloseTo(2);
  });

  it("bias offsets the baseline weight", () => {
    // s=0, bias=0.5 → 1 + 0 + 0.5 = 1.5
    expect(densityWeight(0, { bias: 0.5 })).toBeCloseTo(1.5);
  });
});
