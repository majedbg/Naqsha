import { describe, it, expect } from "vitest";
import { channelForTarget } from "./channelConsumers.js";

describe("channelForTarget", () => {
  it("maps grainfield to the density channel", () => {
    expect(channelForTarget("grainfield")).toBe("density");
  });

  it("maps vertex-list patterns to the warp channel", () => {
    expect(channelForTarget("chladni")).toBe("warp");
    expect(channelForTarget("topographic")).toBe("warp");
    expect(channelForTarget("flowfield")).toBe("warp");
  });

  it("returns null for non-consumer patterns", () => {
    expect(channelForTarget("ellipse")).toBe(null);
    expect(channelForTarget("unknown")).toBe(null);
    expect(channelForTarget(undefined)).toBe(null);
  });
});
