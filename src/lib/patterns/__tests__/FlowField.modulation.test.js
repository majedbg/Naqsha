import { describe, it, expect } from "vitest";
import FlowField from "../FlowField.js";
import { RecordingContext } from "../drawingContext.js";
import { ScalarField } from "../../fields/ScalarField.js";

// Behavioral spec for FlowField's WARP modulation. A guide field (channel:
// 'warp') displaces the final particle-trail vertices along the field gradient
// at geometry-build time, after the trail-build loop, before both emits. The
// unit-domain mapping uses canvasW/2 (NOT FlowField's local halfW, which is
// scaled by patternScale). Off the warp path, output is byte-identical.

const SEED = 11;
const W = 400;
const H = 400;
const COLOR = "#aa3300";
const OPACITY = 100;
const BASE_PARAMS = {
  particleCount: 20,
  stepLength: 6,
  noiseScale: 0.01,
  curlStrength: 90,
  patternScale: 1,
  strokeWeight: 1,
  symmetry: "none", // single base copy → drawBase replays once
  startAngle: 0,
  offsetX: 0,
  offsetY: 0,
};

// FlowField's own SVG formatter: toFixed(2).
const fmt = (n) => n.toFixed(2);

function run(params) {
  const inst = new FlowField();
  const ctx = new RecordingContext({ seed: SEED });
  inst.generateWithContext(ctx, SEED, params, W, H, COLOR, OPACITY);
  return { inst, ctx };
}

// Mean x across all path vertices, parsed from the pathD strings (M x,y L x,y …).
function meanVertexX(svgElements) {
  let sum = 0;
  let n = 0;
  for (const el of svgElements) {
    for (const m of el.pathD.matchAll(/[ML]([-\d.]+),([-\d.]+)/g)) {
      sum += parseFloat(m[1]);
      n += 1;
    }
  }
  return sum / n;
}

const risingField = () =>
  ScalarField.fromFunction((u) => 2 * (u - 0.5), { nx: 65, ny: 65 });

describe("FlowField warp modulation", () => {
  it("shifts vertices toward the field gradient (rightward-rising field)", () => {
    const field = risingField();
    const baseline = run(BASE_PARAMS);
    const modulated = run({
      ...BASE_PARAMS,
      modulation: { field, channel: "warp", amount: 3 },
    });
    expect(meanVertexX(modulated.inst.svgElements)).toBeGreaterThan(
      meanVertexX(baseline.inst.svgElements) + 3
    );
  });

  it("is a no-op when modulation is absent or a non-warp channel", () => {
    const field = risingField();
    const baseline = run(BASE_PARAMS).inst.svgElements;
    const withNull = run({ ...BASE_PARAMS, modulation: null }).inst.svgElements;
    const densityChannel = run({
      ...BASE_PARAMS,
      modulation: { field, channel: "density", amount: 1 },
    }).inst.svgElements;
    expect(withNull).toEqual(baseline);
    expect(densityChannel).toEqual(baseline);
  });

  it("keeps canvas draws and SVG byte-identical under warp", () => {
    const field = risingField();
    const { inst, ctx } = run({
      ...BASE_PARAMS,
      modulation: { field, channel: "warp", amount: 2 },
    });

    const canvasVerts = ctx.calls
      .filter((c) => c.op === "vertex")
      .map((c) => `${fmt(c.args[0])},${fmt(c.args[1])}`);

    const svgVerts = [];
    for (const el of inst.svgElements) {
      for (const m of el.pathD.matchAll(/[ML]([-\d.]+,[-\d.]+)/g)) {
        svgVerts.push(m[1]);
      }
    }

    expect(canvasVerts).toEqual(svgVerts);
  });
});
