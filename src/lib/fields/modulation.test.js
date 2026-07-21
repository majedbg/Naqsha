import { describe, it, expect } from "vitest";
import {
  modulationTransfer,
  densityWeight,
  stackDensityWeight,
  applyRange,
  previewValue,
} from "./modulation";
import { ScalarField } from "./ScalarField";

// modulationTransfer is the shared transfer chain (Ableton-LFO inspired):
//   s → applyRange(range) → +offset → shape(ease) → steps(quantize) → ×amount
// applyRange affine-remaps the field's nominal [-1,1] onto [min,max], so the
// device-level range replaces the old per-map polarity toggle. It returns a
// signed contribution; consumers map it to a channel (density: weight = 1 +
// contribution).
// previewValue is the heatmap-readout transfer: applyRange FIRST, then +offset
// — the same order and first two steps as modulationTransfer, so the preview
// never lies about the biased field the output actually consumes.
describe("previewValue", () => {
  it("equals applyRange when offset is 0 / omitted (byte-identical readout)", () => {
    for (const s of [-1, -0.4, 0, 0.7, 1]) {
      const range = { min: -1, max: 1 };
      expect(previewValue(s, { range })).toBeCloseTo(applyRange(s, range));
      expect(previewValue(s, { offset: 0, range })).toBeCloseTo(
        applyRange(s, range)
      );
    }
  });
  it("adds offset AFTER the range remap (matches modulationTransfer order)", () => {
    const range = { min: 0, max: 1 };
    for (const s of [-1, 0, 1]) {
      expect(previewValue(s, { offset: 0.25, range })).toBeCloseTo(
        applyRange(s, range) + 0.25
      );
    }
  });
  it("shares the first two transfer steps with modulationTransfer (shape/steps/amount off)", () => {
    const cfg = { offset: 0.3, range: { min: -1, max: 1 } };
    for (const s of [-0.6, 0.2, 0.9]) {
      // With shape:0, steps:0, amount:1 the transfer chain reduces to preview.
      expect(previewValue(s, cfg)).toBeCloseTo(modulationTransfer(s, cfg));
    }
  });
});

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

// Phase 2b (PRD §5) — the DENSITY channel stacks MULTIPLICATIVELY:
//   Πᵢ densityWeight(fieldᵢ.sampleSigned(u,v), cfgᵢ) = Πᵢ max(0, 1+transferᵢ).
// Multiplicative so a NEUTRAL source (weight 1) is a no-op (×1). The accumulator
// starts from the first source's weight, so N=1 is bit-identical to a lone
// densityWeight. (Additive-sum is the documented A/B alternative — we ship the
// PRD's multiplicative default.)
describe("stackDensityWeight (density multiply)", () => {
  const rising = () =>
    ScalarField.fromFunction((u) => 2 * (u - 0.5), { nx: 65, ny: 65 });
  const flat0 = () => ScalarField.fromFunction(() => 0, { nx: 33, ny: 33 });

  it("N=1 is bit-identical to a single densityWeight", () => {
    const field = rising();
    const cfg = { channel: "density", field, amount: 1.5 };
    const single = densityWeight(field.sampleSigned(0.75, 0.5), cfg);
    const stacked = stackDensityWeight([cfg], 0.75, 0.5);
    expect(stacked).toBe(single);
  });

  it("multiplies two sources' weights", () => {
    const f1 = rising();
    const f2 = rising();
    const c1 = { channel: "density", field: f1, amount: 1 };
    const c2 = { channel: "density", field: f2, amount: 2 };
    const w1 = densityWeight(f1.sampleSigned(0.8, 0.5), c1);
    const w2 = densityWeight(f2.sampleSigned(0.8, 0.5), c2);
    expect(stackDensityWeight([c1, c2], 0.8, 0.5)).toBeCloseTo(w1 * w2, 10);
  });

  it("a neutral source (field 0 → weight 1) is a no-op", () => {
    const c1 = { channel: "density", field: rising(), amount: 1 };
    const neutral = { channel: "density", field: flat0(), amount: 1 };
    const alone = stackDensityWeight([c1], 0.8, 0.5);
    const withNeutral = stackDensityWeight([c1, neutral], 0.8, 0.5);
    expect(withNeutral).toBeCloseTo(alone, 10);
  });

  it("stays clamped ≥ 0 (a repelling source cannot go negative)", () => {
    // left half: field < 0, amount 2 → densityWeight clamps to 0 → product 0.
    const c1 = { channel: "density", field: rising(), amount: 2 };
    const c2 = { channel: "density", field: rising(), amount: 1 };
    expect(stackDensityWeight([c1, c2], 0.1, 0.5)).toBe(0);
    expect(stackDensityWeight([c1, c2], 0.1, 0.5)).toBeGreaterThanOrEqual(0);
  });

  it("ignores non-density / fieldless sources; empty stack is neutral 1", () => {
    const c1 = { channel: "density", field: rising(), amount: 1 };
    const warp = { channel: "warp", field: rising(), amount: 1 };
    const fieldless = { channel: "density", amount: 1 };
    const alone = stackDensityWeight([c1], 0.8, 0.5);
    expect(stackDensityWeight([c1, warp, fieldless], 0.8, 0.5)).toBe(alone);
    expect(stackDensityWeight([], 0.8, 0.5)).toBe(1);
  });
});
