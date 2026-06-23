import { describe, it, expect } from "vitest";
import GrainField from "../GrainField.js";
import { RecordingContext } from "../drawingContext.js";
import { ScalarField } from "../../fields/ScalarField.js";

// Behavioral spec for GrainField's density modulation. A guide field supplied
// via params.modulation steers where grain packs: weighted-Lloyd centroids pull
// points toward high-field regions. Field is sampled in base (pre-symmetry)
// coords with the unit-domain mapping u=(x+halfW)/canvasW, so a guide aligns
// spatially with the grain it modulates.

const SEED = 7;
const W = 800;
const H = 600;
const BASE_PARAMS = {
  pointCount: 80,
  relaxPasses: 4,
  neighborK: 3,
  minDashLen: 6,
  maxDashLen: 28,
  strokeWeight: 1,
  symmetry: 1,
  startAngle: 0,
  offsetX: 0,
  offsetY: 0,
};

// Parse dash midpoint x from each <line> svgElement (origin-centered coords:
// x>0 is the right half of the canvas).
function dashMidXs(svgElements) {
  return svgElements.map((el) => {
    const x1 = parseFloat(el.match(/x1="([-\d.]+)"/)[1]);
    const x2 = parseFloat(el.match(/x2="([-\d.]+)"/)[1]);
    return (x1 + x2) / 2;
  });
}

function run(params) {
  const inst = new GrainField();
  const ctx = new RecordingContext({ seed: SEED });
  inst.generateWithContext(ctx, SEED, params, W, H, "#000000", 100);
  return { inst, ctx };
}

describe("GrainField density modulation", () => {
  it("packs more grain toward the high-field half", () => {
    // Field rising left→right: s = 2*(u-0.5) ∈ [-1,1], positive on the right.
    const field = ScalarField.fromFunction((u) => 2 * (u - 0.5), {
      nx: 65,
      ny: 65,
    });

    const baseline = run(BASE_PARAMS);
    const modulated = run({
      ...BASE_PARAMS,
      modulation: { field, channel: "density", amount: 1 },
    });

    // Center of mass: where the grain concentrates. A rightward-rising field
    // should pull the mean dash x toward the right (higher).
    const meanX = (xs) => xs.reduce((a, c) => a + c, 0) / xs.length;
    const baseMean = meanX(dashMidXs(baseline.inst.svgElements));
    const modMean = meanX(dashMidXs(modulated.inst.svgElements));

    expect(modMean).toBeGreaterThan(baseMean + 3);
  });

  it("is a no-op when modulation is absent or an unknown channel", () => {
    const field = ScalarField.fromFunction((u) => 2 * (u - 0.5), {
      nx: 65,
      ny: 65,
    });
    const baseline = run(BASE_PARAMS).inst.svgElements;
    // explicit null, and a channel this consumer doesn't honor, both no-op
    const withNull = run({ ...BASE_PARAMS, modulation: null }).inst.svgElements;
    const otherChannel = run({
      ...BASE_PARAMS,
      modulation: { field, channel: "warp", amount: 1 },
    }).inst.svgElements;

    expect(withNull).toEqual(baseline);
    expect(otherChannel).toEqual(baseline);
  });

  it("keeps canvas draws and SVG byte-identical under modulation", () => {
    const field = ScalarField.fromFunction((u) => 2 * (u - 0.5), {
      nx: 65,
      ny: 65,
    });
    const { inst, ctx } = run({
      ...BASE_PARAMS,
      symmetry: 1, // single base copy → one ctx.line per dash
      modulation: { field, channel: "density", amount: 1.5 },
    });

    const r2 = (n) => n.toFixed(2);
    const canvasSegs = ctx.calls
      .filter((c) => c.op === "line")
      .map((c) => c.args.map(r2).join(","));
    const svgSegs = inst.svgElements.map((el) => {
      const m = el.match(
        /x1="([-\d.]+)" y1="([-\d.]+)" x2="([-\d.]+)" y2="([-\d.]+)"/
      );
      return [m[1], m[2], m[3], m[4]].join(",");
    });

    expect(canvasSegs).toEqual(svgSegs);
  });
});
