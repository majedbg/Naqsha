import { describe, it, expect } from "vitest";
import TopographicContours from "../TopographicContours.js";
import { RecordingContext } from "../drawingContext.js";
import { ScalarField } from "../../fields/ScalarField.js";

// Behavioral spec for TopographicContours' WARP modulation. A guide field
// (channel:'warp') displaces the final contour vertices along the field
// gradient at geometry-build time — AFTER the per-level marching-squares +
// stitch loop completes, before both emits. Off the warp path, output must be
// byte-identical to no modulation.

const SEED = 7;
const W = 800;
const H = 600;
const COLOR = "#224488";
const OPACITY = 80;
const BASE_PARAMS = {
  levels: 16,
  noiseScale: 2.5,
  octaves: 3,
  warp: 0,
  levelBias: 0,
  resolution: 80,
  strokeWeight: 0.6,
  startAngle: 0,
  offsetX: 0,
  offsetY: 0,
};

// TopographicContours' own SVG formatter: round to 2dp, drop trailing zeros.
const fmt = (n) => (Math.round(n * 100) / 100).toString();

function run(params) {
  const inst = new TopographicContours();
  const ctx = new RecordingContext({ seed: SEED });
  inst.generateWithContext(ctx, SEED, params, W, H, COLOR, OPACITY);
  return { inst, ctx };
}

function meanVertexX(svgElements) {
  let sum = 0;
  let n = 0;
  for (const el of svgElements) {
    const m = el.match(/points="([^"]*)"/);
    if (!m) continue;
    for (const pair of m[1].trim().split(/\s+/)) {
      sum += parseFloat(pair.split(",")[0]);
      n += 1;
    }
  }
  return sum / n;
}

const risingField = () =>
  ScalarField.fromFunction((u) => 2 * (u - 0.5), { nx: 65, ny: 65 });

describe("TopographicContours warp modulation", () => {
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
      const m = el.match(/points="([^"]*)"/);
      for (const pair of m[1].trim().split(/\s+/)) svgVerts.push(pair);
    }

    expect(canvasVerts).toEqual(svgVerts);
  });
});
