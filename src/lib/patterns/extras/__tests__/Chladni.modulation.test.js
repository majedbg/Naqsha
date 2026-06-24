import { describe, it, expect } from "vitest";
import Chladni from "../Chladni.js";
import { RecordingContext } from "../../drawingContext.js";
import { ScalarField } from "../../../fields/ScalarField.js";

// Behavioral spec for Chladni's WARP modulation. A guide field supplied via
// params.modulation (channel:'warp') displaces the final nodal-line vertices
// along the field gradient at geometry-build time, before both emits. Field is
// sampled in base coords with u=(x+canvasW/2)/canvasW so the warp aligns
// spatially with the pattern it modulates. Off the warp path, output must be
// byte-identical to no modulation.

const SEED = 42;
const W = 800;
const H = 600;
const COLOR = "#3366aa";
const OPACITY = 80;
const BASE_PARAMS = {
  m: 4,
  n: 3,
  blend: 0,
  m2: 5,
  n2: 2,
  resolution: 120,
  strokeWeight: 0.6,
  symmetry: 1, // single base copy → drawBase replays once
  startAngle: 0,
  offsetX: 0,
  offsetY: 0,
};

// Each pattern's own SVG formatter: round to 2dp, drop trailing zeros.
const fmt = (val) => (Math.round(val * 100) / 100).toString();

function run(params) {
  const inst = new Chladni();
  const ctx = new RecordingContext({ seed: SEED });
  inst.generateWithContext(ctx, SEED, params, W, H, COLOR, OPACITY);
  return { inst, ctx };
}

// Mean x across all <polyline> vertices.
function meanVertexX(svgElements) {
  let sum = 0;
  let n = 0;
  for (const el of svgElements) {
    const m = el.match(/points="([^"]*)"/);
    if (!m) continue;
    for (const pair of m[1].trim().split(/\s+/)) {
      const x = parseFloat(pair.split(",")[0]);
      sum += x;
      n += 1;
    }
  }
  return sum / n;
}

const risingField = () =>
  ScalarField.fromFunction((u) => 2 * (u - 0.5), { nx: 65, ny: 65 });

describe("Chladni warp modulation", () => {
  it("shifts vertices toward the field gradient (rightward-rising field)", () => {
    const field = risingField();
    const baseline = run(BASE_PARAMS);
    const modulated = run({
      ...BASE_PARAMS,
      modulation: { field, channel: "warp", amount: 3 },
    });
    const baseMean = meanVertexX(baseline.inst.svgElements);
    const modMean = meanVertexX(modulated.inst.svgElements);
    expect(modMean).toBeGreaterThan(baseMean + 3);
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

    // Recorded vertex args, formatted with Chladni's own fmt.
    const canvasVerts = ctx.calls
      .filter((c) => c.op === "vertex")
      .map((c) => `${fmt(c.args[0])},${fmt(c.args[1])}`);

    const svgVerts = [];
    for (const el of inst.svgElements) {
      const m = el.match(/points="([^"]*)"/);
      for (const pair of m[1].trim().split(/\s+/)) svgVerts.push(pair);
    }

    expect(canvasVerts).toEqual(svgVerts);
  });
});
