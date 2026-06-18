// Follow-up #4 (carried into #17): band operations carry RESERVED spectrum colors
// (orange→yellow, disjoint from cut/score/engrave). remapOperationsToProfile must
// NOT clobber a band op's spectrum color to the laser cut/score/engrave convention
// when the target profile is laser, and must PRESERVE the band link markers
// (bandId/bandLayerId/bandIndex) so the band stays identifiable after a remap.
import { describe, it, expect } from "vitest";
import { remapOperationsToProfile } from "./machineProfiles.js";
import {
  generateWeightBand,
  spectrumColors,
  isBandOperation,
  supportsVariableWeight,
} from "./variableWeight.js";
import { seedOperations } from "./operations.js";

describe("remapOperationsToProfile — band ops exempt from laser color-lock (#4 follow-up)", () => {
  it("keeps a band op's spectrum color AND markers after a laser remap", () => {
    const band = generateWeightBand({ layerId: "l1", profileId: "laser", n: 4 });
    const colors = spectrumColors(4);
    const out = remapOperationsToProfile(band, "laser");

    out.forEach((op, i) => {
      // Color NOT locked to a reserved cut/score/engrave convention color.
      expect(op.color).toBe(colors[i]);
      expect(["#FF0000", "#0000FF", "#000000"]).not.toContain(op.color);
      // Band link markers survive the remap.
      expect(op.bandLayerId).toBe("l1");
      expect(op.bandIndex).toBe(i);
    });
  });

  it("still locks NON-band laser ops to convention (seed cut/score/engrave)", () => {
    // A mixed library: seeds + a band. The remap must lock the seeds but exempt
    // the band.
    const band = generateWeightBand({ layerId: "l1", profileId: "laser", n: 2 });
    const mixed = [...seedOperations(), ...band];
    const out = remapOperationsToProfile(mixed, "laser");

    const cut = out.find((o) => o.process === "cut" && !o.bandLayerId);
    expect(cut.color).toBe("#FF0000"); // still locked to laser convention
    const bandOut = out.filter((o) => o.bandLayerId === "l1");
    expect(bandOut).toHaveLength(2);
    expect(bandOut[0].color).toBe(spectrumColors(2)[0]); // exempt
  });

  // Switching to a profile that does NOT support banding (drag cutter) must HIDE
  // the feature — Studio's handleProfileChange drops band ops when
  // supportsVariableWeight(target) is false, so no orphan band rows leak into the
  // operations panel. This pins the exact composed primitive Studio applies.
  it("drops band ops when remapping to an unsupported profile (drag cutter)", () => {
    const band = generateWeightBand({ layerId: "l1", profileId: "laser", n: 4 });
    const mixed = [...seedOperations(), ...band];

    // Studio: remap then drop band ops when the target can't band.
    const remapped = remapOperationsToProfile(mixed, "dragCutter");
    const result = supportsVariableWeight("dragCutter")
      ? remapped
      : remapped.filter((o) => !isBandOperation(o));

    expect(result.some(isBandOperation)).toBe(false);
    expect(result.filter((o) => o.bandLayerId === "l1")).toHaveLength(0);
    // Non-band seeds survive the remap.
    expect(result).toHaveLength(seedOperations().length);
  });
});
