// Unit tests for the operations-library band sync (issue #17, C8). This is the
// pure mapper Studio commits through useOperationsHistory's commitOperations when
// the per-layer variable-weight toggle / N control changes: it strips the layer's
// previous band ops and appends a freshly generated band (or none when disabled).
//
// Covers the issue's "enabling creates N operation rows; changing N updates row
// count" interaction at the model level (the OperationsPanel renders one row per
// op, so N band ops === N rows).
import { describe, it, expect } from "vitest";
import { seedOperations } from "./operations.js";
import { syncWeightBand, DEFAULT_BAND_COUNT } from "./variableWeight.js";

describe("syncWeightBand — live band rows in the operations library (#17 C8)", () => {
  it("enabling appends N band ops (default N) to the library, leaving seeds intact", () => {
    const seeds = seedOperations();
    const out = syncWeightBand(seeds, {
      layerId: "l1",
      profileId: "laser",
      enabled: true,
      n: DEFAULT_BAND_COUNT,
    });
    // Seeds preserved + N band ops appended.
    expect(out).toHaveLength(seeds.length + DEFAULT_BAND_COUNT);
    const band = out.filter((o) => o.bandLayerId === "l1");
    expect(band).toHaveLength(DEFAULT_BAND_COUNT);
    // Band ops carry the link markers so #17 can identify them.
    band.forEach((o, i) => expect(o.bandIndex).toBe(i));
  });

  it("changing N re-buckets live — regenerates the band to the new row count", () => {
    const seeds = seedOperations();
    const five = syncWeightBand(seeds, { layerId: "l1", profileId: "laser", enabled: true, n: 5 });
    expect(five.filter((o) => o.bandLayerId === "l1")).toHaveLength(5);
    // Re-sync with N=8 over the previous result: old band stripped, new band added.
    const eight = syncWeightBand(five, { layerId: "l1", profileId: "laser", enabled: true, n: 8 });
    expect(eight.filter((o) => o.bandLayerId === "l1")).toHaveLength(8);
    // Still only one band for the layer (no duplicate/leaked rows).
    expect(eight.filter((o) => o.bandLayerId === "l1" && o.bandIndex === 0)).toHaveLength(1);
  });

  it("disabling removes that layer's band ops (and only that layer's)", () => {
    const seeds = seedOperations();
    let out = syncWeightBand(seeds, { layerId: "l1", profileId: "laser", enabled: true, n: 4 });
    out = syncWeightBand(out, { layerId: "l2", profileId: "laser", enabled: true, n: 3 });
    expect(out.filter((o) => o.bandLayerId === "l1")).toHaveLength(4);
    expect(out.filter((o) => o.bandLayerId === "l2")).toHaveLength(3);
    // Disable l1 only.
    out = syncWeightBand(out, { layerId: "l1", profileId: "laser", enabled: false, n: 4 });
    expect(out.filter((o) => o.bandLayerId === "l1")).toHaveLength(0);
    expect(out.filter((o) => o.bandLayerId === "l2")).toHaveLength(3);
  });

  it("drag-cutter profile adds no band ops (feature unsupported)", () => {
    const seeds = seedOperations();
    const out = syncWeightBand(seeds, {
      layerId: "l1",
      profileId: "dragCutter",
      enabled: true,
      n: 5,
    });
    expect(out.filter((o) => o.bandLayerId === "l1")).toHaveLength(0);
    expect(out).toHaveLength(seeds.length);
  });
});
