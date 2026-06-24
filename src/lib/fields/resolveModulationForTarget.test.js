import { describe, it, expect } from "vitest";
import { resolveModulationForTarget } from "./resolveModulationForTarget";

// Modulator-centric resolution (Ableton model): a GUIDE layer owns a
// `modulator` device that maps OUT to target layers. Given a target layer,
// this scans all layers for a modulator whose maps include it, and merges the
// device-level transfer (offset/shape/steps/range) with the per-map controls
// (amount/channel) plus the resolved field into the runtime object the consumer
// (params.modulation) expects. Device-level `range` replaces per-map polarity;
// legacy `polarity` maps are migrated to a range per-resolution.

const guide = (over = {}) => ({
  id: "g",
  patternType: "chladni",
  params: { m: 2, n: 1 },
  ...over,
});
const target = (over = {}) => ({ id: "t", patternType: "grainfield", ...over });

describe("resolveModulationForTarget", () => {
  it("returns null when no modulator maps to the target", () => {
    const layers = [guide(), target()];
    expect(resolveModulationForTarget(target(), layers)).toBeNull();
  });

  it("merges device-level + per-map + resolved field for a mapped target", () => {
    const g = guide({
      modulator: {
        offset: 0.1,
        shape: 0.2,
        steps: 3,
        range: { min: 0, max: 1 },
        maps: [{ targetLayerId: "t", channel: "density", amount: 2 }],
      },
    });
    const res = resolveModulationForTarget(target(), [g, target()]);
    expect(res).toBeTruthy();
    expect(typeof res.field.sampleSigned).toBe("function"); // a real ScalarField
    expect(res.channel).toBe("density");
    expect(res.amount).toBe(2);
    expect(res.range).toEqual({ min: 0, max: 1 });
    expect(res.polarity).toBeUndefined(); // polarity dropped from resolved object
    expect(res.offset).toBe(0.1);
    expect(res.shape).toBe(0.2);
    expect(res.steps).toBe(3);
  });

  it("applies defaults when device/map fields are omitted", () => {
    const g = guide({ modulator: { maps: [{ targetLayerId: "t" }] } });
    const res = resolveModulationForTarget(target(), [g, target()]);
    expect(res).toMatchObject({
      channel: "density",
      amount: 1,
      range: { min: -1, max: 1 },
      offset: 0,
      shape: 0,
      steps: 0,
    });
    expect(res.polarity).toBeUndefined();
  });

  it("honors an explicit device-level range", () => {
    const g = guide({
      modulator: { range: { min: -1, max: 0 }, maps: [{ targetLayerId: "t" }] },
    });
    const res = resolveModulationForTarget(target(), [g, target()]);
    expect(res.range).toEqual({ min: -1, max: 0 });
  });

  it("migrates legacy unipolar map (no dev.range) to range {0,1}", () => {
    const g = guide({
      modulator: {
        maps: [{ targetLayerId: "t", polarity: "unipolar" }],
      },
    });
    const res = resolveModulationForTarget(target(), [g, target()]);
    expect(res.range).toEqual({ min: 0, max: 1 });
    expect(res.polarity).toBeUndefined();
  });

  it("migrates legacy bipolar/absent map (no dev.range) to range {-1,1}", () => {
    const gBi = guide({
      modulator: { maps: [{ targetLayerId: "t", polarity: "bipolar" }] },
    });
    expect(
      resolveModulationForTarget(target(), [gBi, target()]).range
    ).toEqual({ min: -1, max: 1 });

    const gNone = guide({ modulator: { maps: [{ targetLayerId: "t" }] } });
    expect(
      resolveModulationForTarget(target(), [gNone, target()]).range
    ).toEqual({ min: -1, max: 1 });
  });

  it("preserves per-map amount across migration", () => {
    const g = guide({
      modulator: {
        maps: [{ targetLayerId: "t", amount: 1.5, polarity: "unipolar" }],
      },
    });
    const res = resolveModulationForTarget(target(), [g, target()]);
    expect(res.amount).toBe(1.5);
    expect(res.range).toEqual({ min: 0, max: 1 });
  });

  it("forbids self-modulation (a layer mapping to itself)", () => {
    const self = guide({
      id: "t",
      modulator: { maps: [{ targetLayerId: "t" }] },
    });
    expect(resolveModulationForTarget(self, [self])).toBeNull();
  });

  it("returns null when the source can't produce a field", () => {
    const nonGuide = {
      id: "g",
      patternType: "spirograph",
      params: {},
      modulator: { maps: [{ targetLayerId: "t" }] },
    };
    expect(resolveModulationForTarget(target(), [nonGuide, target()])).toBeNull();
  });
});
