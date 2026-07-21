import { describe, it, expect } from "vitest";
import {
  offsetAffectsOutput,
  channelConsumesOffset,
} from "../offsetVisibility";

describe("channelConsumesOffset", () => {
  it("density and distort consume offset", () => {
    expect(channelConsumesOffset("density")).toBe(true);
    expect(channelConsumesOffset("distort")).toBe(true);
  });
  it("warp and lattice ignore offset (transfer chain deferred / no field knobs)", () => {
    expect(channelConsumesOffset("warp")).toBe(false);
    expect(channelConsumesOffset("lattice")).toBe(false);
  });
  it("undefined channel defaults to density (matches resolveGuide) → consumes", () => {
    expect(channelConsumesOffset(undefined)).toBe(true);
  });
});

describe("offsetAffectsOutput", () => {
  it("true for a density map", () => {
    expect(
      offsetAffectsOutput({ maps: [{ targetLayerId: "t", channel: "density" }] })
    ).toBe(true);
  });
  it("true for a distort map", () => {
    expect(
      offsetAffectsOutput({ maps: [{ targetLayerId: "t", channel: "distort" }] })
    ).toBe(true);
  });
  it("false for a warp-only map", () => {
    expect(
      offsetAffectsOutput({ maps: [{ targetLayerId: "t", channel: "warp" }] })
    ).toBe(false);
  });
  it("false for a lattice-only map", () => {
    expect(
      offsetAffectsOutput({ maps: [{ targetLayerId: "t", channel: "lattice" }] })
    ).toBe(false);
  });
  it("false when no targets are mapped (empty maps)", () => {
    expect(offsetAffectsOutput({ maps: [] })).toBe(false);
  });
  it("false for undefined / missing modulator", () => {
    expect(offsetAffectsOutput(undefined)).toBe(false);
    expect(offsetAffectsOutput({})).toBe(false);
  });
  it("true when ANY mapped target consumes offset (density + warp mixed)", () => {
    expect(
      offsetAffectsOutput({
        maps: [
          { targetLayerId: "a", channel: "warp" },
          { targetLayerId: "b", channel: "density" },
        ],
      })
    ).toBe(true);
  });
});
