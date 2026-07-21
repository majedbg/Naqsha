import { describe, it, expect } from "vitest";
import {
  transferControlsAffectOutput,
  channelConsumesTransfer,
} from "../transferVisibility";

// offset, shape and steps all run through modulationTransfer, so a single
// predicate governs all three: a channel consumes the transfer chain iff it is
// density or distort (the only channels that call modulationTransfer).

describe("channelConsumesTransfer", () => {
  it("density and distort run the transfer chain (offset/shape/steps)", () => {
    expect(channelConsumesTransfer("density")).toBe(true);
    expect(channelConsumesTransfer("distort")).toBe(true);
  });
  it("warp and lattice skip it (warp uses only amount / lattice has no field knobs)", () => {
    expect(channelConsumesTransfer("warp")).toBe(false);
    expect(channelConsumesTransfer("lattice")).toBe(false);
  });
  it("undefined channel defaults to density (matches resolveGuide) → consumes", () => {
    expect(channelConsumesTransfer(undefined)).toBe(true);
  });
});

describe("transferControlsAffectOutput", () => {
  it("true for a density map", () => {
    expect(
      transferControlsAffectOutput({
        maps: [{ targetLayerId: "t", channel: "density" }],
      })
    ).toBe(true);
  });
  it("true for a distort map", () => {
    expect(
      transferControlsAffectOutput({
        maps: [{ targetLayerId: "t", channel: "distort" }],
      })
    ).toBe(true);
  });
  it("false for a warp-only map", () => {
    expect(
      transferControlsAffectOutput({
        maps: [{ targetLayerId: "t", channel: "warp" }],
      })
    ).toBe(false);
  });
  it("false for a lattice-only map", () => {
    expect(
      transferControlsAffectOutput({
        maps: [{ targetLayerId: "t", channel: "lattice" }],
      })
    ).toBe(false);
  });
  it("false when no targets are mapped (empty maps)", () => {
    expect(transferControlsAffectOutput({ maps: [] })).toBe(false);
  });
  it("false for undefined / missing modulator", () => {
    expect(transferControlsAffectOutput(undefined)).toBe(false);
    expect(transferControlsAffectOutput({})).toBe(false);
  });
  it("true when ANY mapped target consumes the chain (density + warp mixed)", () => {
    expect(
      transferControlsAffectOutput({
        maps: [
          { targetLayerId: "a", channel: "warp" },
          { targetLayerId: "b", channel: "density" },
        ],
      })
    ).toBe(true);
  });
});
