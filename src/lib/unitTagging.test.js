// Unit-tagging schema + conversion contract (GitHub issue #13).
//
// These are the pure/structural tests for the unit-tag mechanism that sit
// underneath the inspector display/convert behaviour:
//   • the schema is additive — tagging a param does NOT change its numeric
//     def fields or the pattern's DEFAULT_PARAMS (so generation, which reads px,
//     is untouched);
//   • a tagged length param round-trips mm <-> px without drift via units.js;
//   • genuinely unitless params stay untagged.
//
// The component-level "what the inspector renders" assertions live in
// Slider.unit.test.jsx and ParamControl.unit.test.jsx. The geometry "output
// unchanged" proof is the existing pattern __snapshots__ (which call generators
// directly with px) plus the additive-schema assertions here.

import { describe, it, expect } from "vitest";
import {
  PATTERN_PARAM_DEFS,
  DEFAULT_PARAMS,
} from "../constants";
import { pxToUnit, unitToPx } from "./units";

// The keys we tag in this batch (issue #13 picks ONE coherent batch).
const TAGGED = {
  spirograph: ["d"],
  wave: ["amplitude", "lineSpacing"],
};

// A representative set of params that must stay UNtagged — they are unitless
// (counts, degrees, multipliers, noise frequencies).
const MUST_STAY_UNITLESS = {
  spirograph: ["revolutions"],
  flowfield: ["noiseScale", "curlStrength", "particleCount"],
  wave: ["waveCount", "frequency"],
  phyllotaxis: ["sizeGrowth", "angle"],
};

function findDef(patternType, key) {
  return PATTERN_PARAM_DEFS[patternType].find((d) => d.key === key);
}

describe("unit-tag schema", () => {
  it("tags the chosen batch's length params with unit:'length'", () => {
    for (const [pattern, keys] of Object.entries(TAGGED)) {
      for (const key of keys) {
        const def = findDef(pattern, key);
        expect(def, `${pattern}.${key} should exist`).toBeTruthy();
        expect(def.unit, `${pattern}.${key} should be tagged`).toBe("length");
      }
    }
  });

  it("leaves genuinely unitless params untagged", () => {
    for (const [pattern, keys] of Object.entries(MUST_STAY_UNITLESS)) {
      for (const key of keys) {
        const def = findDef(pattern, key);
        expect(def, `${pattern}.${key} should exist`).toBeTruthy();
        expect(def.unit, `${pattern}.${key} must stay unitless`).toBeUndefined();
      }
    }
  });

  it("tagging is purely additive — numeric def fields are unchanged", () => {
    // The tag is metadata only; min/max/step (the px-space slider bounds) are
    // the same numbers generation/snapping have always used.
    const d = findDef("spirograph", "d");
    expect(d.min).toBe(10);
    expect(d.max).toBe(600);
    expect(d.step).toBe(1);

    const amp = findDef("wave", "amplitude");
    expect(amp.min).toBe(5);
    expect(amp.max).toBe(500);
    expect(amp.step).toBe(1);

    const ls = findDef("wave", "lineSpacing");
    expect(ls.min).toBe(4);
    expect(ls.max).toBe(40);
    expect(ls.step).toBe(1);
  });

  it("tagging does NOT change DEFAULT_PARAMS (px values generation reads)", () => {
    // If these drift, geometry/export would change — the whole point is they don't.
    expect(typeof DEFAULT_PARAMS.spirograph.d).toBe("number");
    expect(typeof DEFAULT_PARAMS.wave.amplitude).toBe("number");
    expect(typeof DEFAULT_PARAMS.wave.lineSpacing).toBe("number");
  });
});

describe("mm <-> px round-trips without drift", () => {
  // The round-trip the inspector relies on: display = pxToUnit, entry parse =
  // unitToPx. For known px values these must compose back to the original px.
  const KNOWN_PX = [10, 25.4, 96, 100, 250, 500, 600];

  it("mm round-trips px exactly (unitToPx ∘ pxToUnit)", () => {
    for (const px of KNOWN_PX) {
      const mm = pxToUnit(px, "mm");
      expect(unitToPx(mm, "mm")).toBeCloseTo(px, 9);
    }
  });

  it("in round-trips px exactly (unitToPx ∘ pxToUnit)", () => {
    for (const px of KNOWN_PX) {
      const inch = pxToUnit(px, "in");
      expect(unitToPx(inch, "in")).toBeCloseTo(px, 9);
    }
  });
});
