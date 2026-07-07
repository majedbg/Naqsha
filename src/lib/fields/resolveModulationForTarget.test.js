import { describe, it, expect } from "vitest";
import {
  resolveModulationForTarget,
  resolveModulationsForTarget,
  composeModulationParam,
} from "./resolveModulationForTarget";

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

// Phase 2b — multi-source stacking (PRD §5). `resolveModulationsForTarget`
// (plural) returns the FULL array of resolved modulations — one per guide that
// maps to the target — instead of the first match. The singular
// `resolveModulationForTarget` is a back-compat wrapper (= plural[0] ?? null),
// pinning single-source output byte-identical.
describe("resolveModulationsForTarget (multi-source stack)", () => {
  const density = (id, over = {}) =>
    guide({
      id,
      modulator: { maps: [{ targetLayerId: "t", channel: "density", amount: 1 }] },
      ...over,
    });

  it("returns [] when no modulator maps to the target", () => {
    expect(resolveModulationsForTarget(target(), [guide(), target()])).toEqual([]);
  });

  it("N=1 pin: array is exactly [the singular result]", () => {
    const g = density("g");
    const arr = resolveModulationsForTarget(target(), [g, target()]);
    expect(arr).toHaveLength(1);
    expect(arr[0]).toEqual(resolveModulationForTarget(target(), [g, target()]));
  });

  it("N=2: one resolved source per guide, in layer order", () => {
    const g1 = density("g1", { params: { m: 2, n: 1 } });
    const g2 = density("g2", { params: { m: 3, n: 2 } });
    const arr = resolveModulationsForTarget(target(), [g1, g2, target()]);
    expect(arr).toHaveLength(2);
    expect(arr.every((r) => r.channel === "density")).toBe(true);
    // singular still yields the FIRST (layer-order) source — back-compat.
    expect(resolveModulationForTarget(target(), [g1, g2, target()])).toEqual(arr[0]);
  });

  it("skips self-maps and non-field-producing guides while collecting the rest", () => {
    const g1 = density("g1");
    const nonField = {
      id: "g2",
      patternType: "spirograph",
      params: {},
      modulator: { maps: [{ targetLayerId: "t", channel: "density" }] },
    };
    const arr = resolveModulationsForTarget(target(), [nonField, g1, target()]);
    expect(arr).toHaveLength(1);
    expect(arr[0].channel).toBe("density");
  });
});

// The injection seam (useCanvas): fold the resolved-sources ARRAY into the
// COMPOSITE `params.modulation` every consumer reads — the first source's object
// (so existing single-source readers see the identical shape) plus a `sources`
// array carrying the full stack. This is the one link between resolver output
// and consumer input, so it is unit-pinned here rather than only through render.
describe("composeModulationParam (injection seam)", () => {
  const src = (channel, extra = {}) => ({ channel, field: {}, amount: 1, ...extra });

  it("returns undefined for an empty stack (adds NO modulation key)", () => {
    expect(composeModulationParam([])).toBeUndefined();
    expect(composeModulationParam(null)).toBeUndefined();
  });

  it("N=1: top-level fields === the lone source, sources === [it]", () => {
    const only = src("warp", { offset: 0.3 });
    const composite = composeModulationParam([only]);
    expect(composite.channel).toBe("warp");
    expect(composite.offset).toBe(0.3);
    expect(composite.field).toBe(only.field);
    expect(composite.sources).toEqual([only]);
  });

  it("N≥2: top-level fields come from the FIRST source; sources holds all", () => {
    const a = src("warp", { amount: 2 });
    const b = src("warp", { amount: 5 });
    const composite = composeModulationParam([a, b]);
    expect(composite.channel).toBe("warp");
    expect(composite.amount).toBe(2); // first source drives the back-compat top level
    expect(composite.sources).toEqual([a, b]);
    expect(composite.sources).toHaveLength(2);
  });
});
