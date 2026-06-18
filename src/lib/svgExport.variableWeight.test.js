// Follow-up #4 export wiring (carried into #17): buildAllLayersSVG grows an
// ADDITIVE per-element-color branch for layers whose variableWeight.enabled is
// true. Layers WITHOUT it enabled must export BYTE-IDENTICALLY to before — the
// existing svgExport.test.js staying green (unmodified) is the proof; this file
// pins the new behavior alongside it.
import { describe, it, expect } from "vitest";
import { buildAllLayersSVG } from "./svgExport.js";
import { spectrumColors } from "./variableWeight.js";

// A pattern instance exposing per-element { pathD, strokeWeight } (RecursiveGeometry
// shape) plus the normal single-color toSVGGroup.
const vwInst = {
  svgElements: [
    { pathD: "M0,0 L1,1", strokeWeight: 1 },
    { pathD: "M0,0 L2,2", strokeWeight: 5 },
    { pathD: "M0,0 L3,3", strokeWeight: 10 },
  ],
  toSVGGroup: () => '<g id="layer-vw"><path d="M0,0 L1,1"/></g>',
};
// A plain instance (no svgElements) for the non-enabled byte-stability check.
const plainInst = { toSVGGroup: () => '<g id="layer-p"><path d="M0,0 L10,10"/></g>' };

const plainLayer = {
  id: "p", name: "Plain", visible: true,
  color: "#f00", opacity: 100, bgOpacity: 0, bgColor: "#abc",
};

describe("buildAllLayersSVG — variable-weight per-element color (#4 follow-up)", () => {
  it("a non-enabled layer exports BYTE-IDENTICALLY whether or not profileId is passed", () => {
    const base = buildAllLayersSVG([plainLayer], { p: plainInst }, 384, 384, false, {});
    const withProfile = buildAllLayersSVG([plainLayer], { p: plainInst }, 384, 384, false, {
      profileId: "laser",
    });
    expect(withProfile).toBe(base);
  });

  it("an enabled LASER layer emits per-element spectrum stroke colors (not the single group color)", () => {
    const layer = {
      id: "vw", name: "VW", visible: true, color: "#123456", opacity: 100,
      bgOpacity: 0, bgColor: "#abc",
      variableWeight: { enabled: true, n: 3 },
    };
    const svg = buildAllLayersSVG([layer], { vw: vwInst }, 384, 384, false, {
      profileId: "laser",
    });
    const colors = spectrumColors(3); // orange → yellow
    // Each element's bucket spectrum color appears as a per-element stroke.
    expect(svg).toContain(`stroke="${colors[0]}"`);
    expect(svg).toContain(`stroke="${colors[2]}"`);
    // The single group color is NOT what strokes the elements.
    expect(svg).not.toContain('stroke="#123456"');
  });

  it("an enabled PLOTTER layer still emits per-element band (spectrum) colors", () => {
    const layer = {
      id: "vw", name: "VW", visible: true, color: "#123456", opacity: 100,
      bgOpacity: 0, bgColor: "#abc",
      variableWeight: { enabled: true, n: 3 },
    };
    const svg = buildAllLayersSVG([layer], { vw: vwInst }, 384, 384, false, {
      profileId: "plotter",
    });
    const colors = spectrumColors(3);
    expect(svg).toContain(`stroke="${colors[0]}"`);
  });
});
