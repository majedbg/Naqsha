import { describe, it, expect } from 'vitest';
import Grid from '../Grid.js';
import { RecordingContext } from '../drawingContext.js';
import { ScalarField } from '../../fields/ScalarField.js';

// Behavioral spec for Grid's WARP modulation. A guide field (channel:'warp')
// replaces each straight grid <line> with a smooth Catmull-Rom bezier <path>
// that follows the field, at geometry-build time — the SAME control points feed
// both the SVG <path> and the p5 beginShape/bezierVertex draw. Endpoints are
// PINNED (only interior nodes displaced). Off the warp path, output must be
// byte-identical to no modulation (still straight <line>).

const SEED = 7;
const W = 800;
const H = 600;
const COLOR = '#224488';
const OPACITY = 80;
// Small grid so tests are fast; warpNodes ~6.
const BASE_PARAMS = {
  cols: 3, rows: 2, spacing: 40, nonLinear: 0, jitter: 0,
  drawHorizontal: 1, drawVertical: 1, margin: 20,
  strokeWeight: 0.8, symmetry: 1, startAngle: 0, offsetX: 0, offsetY: 0,
  warpNodes: 6,
};

// Grid's own SVG formatter.
const fmt = (n) => n.toFixed(2);

const risingField = () =>
  ScalarField.fromFunction((u) => 2 * (u - 0.5), { nx: 65, ny: 65 });

function run(params) {
  const inst = new Grid();
  const ctx = new RecordingContext({ seed: SEED });
  inst.generateWithContext(ctx, SEED, params, W, H, COLOR, OPACITY);
  return { inst, ctx };
}

// Parse a <path d="M x,y C ..."> into { start:[x,y], segments:[{c1,c2,end}] }.
function parsePath(el) {
  const m = el.match(/d="([^"]*)"/);
  const d = m[1].trim();
  const start = d.match(/^M([-\d.]+),([-\d.]+)/);
  const startPt = [parseFloat(start[1]), parseFloat(start[2])];
  const segs = [];
  const re = /C([-\d.]+),([-\d.]+)\s+([-\d.]+),([-\d.]+)\s+([-\d.]+),([-\d.]+)/g;
  let c;
  while ((c = re.exec(d)) !== null) {
    segs.push({
      c1: [parseFloat(c[1]), parseFloat(c[2])],
      c2: [parseFloat(c[3]), parseFloat(c[4])],
      end: [parseFloat(c[5]), parseFloat(c[6])],
    });
  }
  return { start: startPt, segments: segs };
}

describe('Grid warp modulation', () => {
  it('replaces each straight line with a cubic <path>, one per line', () => {
    const baseline = run(BASE_PARAMS).inst.svgElements;
    const lineCount = baseline.length;
    expect(baseline.every((el) => el.includes('<line'))).toBe(true);

    const warped = run({
      ...BASE_PARAMS,
      modulation: { field: risingField(), channel: 'warp', amount: 3 },
    }).inst.svgElements;

    expect(warped.length).toBe(lineCount);
    for (const el of warped) {
      expect(el).toContain('<path');
      expect(el).toMatch(/\sC/); // contains a cubic segment
    }
  });

  it('is a no-op when modulation is absent, null, or a non-warp channel', () => {
    const field = risingField();
    const baseline = run(BASE_PARAMS).inst.svgElements;
    const withNull = run({ ...BASE_PARAMS, modulation: null }).inst.svgElements;
    const densityChannel = run({
      ...BASE_PARAMS,
      modulation: { field, channel: 'density', amount: 3 },
    }).inst.svgElements;

    expect(withNull).toEqual(baseline);
    expect(densityChannel).toEqual(baseline);
    // still straight lines
    for (const el of baseline) expect(el).toContain('<line');
  });

  it('pins endpoints: warped path start/end equal the straight line endpoints', () => {
    const baseline = run(BASE_PARAMS).inst.svgElements;
    const warped = run({
      ...BASE_PARAMS,
      modulation: { field: risingField(), channel: 'warp', amount: 3 },
    }).inst.svgElements;

    for (let i = 0; i < baseline.length; i++) {
      const lm = baseline[i].match(
        /x1="([-\d.]+)" y1="([-\d.]+)" x2="([-\d.]+)" y2="([-\d.]+)"/
      );
      const x1 = parseFloat(lm[1]);
      const y1 = parseFloat(lm[2]);
      const x2 = parseFloat(lm[3]);
      const y2 = parseFloat(lm[4]);

      const { start, segments } = parsePath(warped[i]);
      const end = segments[segments.length - 1].end;

      expect(start[0]).toBeCloseTo(x1, 2);
      expect(start[1]).toBeCloseTo(y1, 2);
      expect(end[0]).toBeCloseTo(x2, 2);
      expect(end[1]).toBeCloseTo(y2, 2);
    }
  });

  it('displaces interior geometry by the field', () => {
    const baseline = run(BASE_PARAMS).inst.svgElements;
    const warped = run({
      ...BASE_PARAMS,
      modulation: { field: risingField(), channel: 'warp', amount: 3 },
    }).inst.svgElements;

    // For each warped path, reconstruct the un-displaced interior node x and
    // check at least one moved. A pinned-endpoint straight line's interior node
    // at parameter t has x = x1 + (x2-x1)*t; the anchor of segment k is the
    // node k+1 (segment.end). If warp moved geometry, some interior anchor x
    // differs from its un-displaced value.
    let moved = false;
    for (let i = 0; i < baseline.length; i++) {
      const lm = baseline[i].match(
        /x1="([-\d.]+)" y1="([-\d.]+)" x2="([-\d.]+)" y2="([-\d.]+)"/
      );
      const x1 = parseFloat(lm[1]);
      const x2 = parseFloat(lm[3]);
      const { segments } = parsePath(warped[i]);
      const K = segments.length + 1;
      // interior anchors are segment.end for k=0..K-3 (last end is pinned).
      for (let k = 0; k < segments.length - 1; k++) {
        const t = (k + 1) / (K - 1);
        const undisplacedX = x1 + (x2 - x1) * t;
        if (Math.abs(segments[k].end[0] - undisplacedX) > 0.01) moved = true;
      }
    }
    expect(moved).toBe(true);
  });

  it('keeps canvas draws (vertex/bezierVertex) byte-identical to the SVG path', () => {
    const { inst, ctx } = run({
      ...BASE_PARAMS,
      modulation: { field: risingField(), channel: 'warp', amount: 2 },
    });

    // Collect canvas numeric args in order: vertex -> M point; bezierVertex -> C.
    const canvasNums = [];
    for (const c of ctx.calls) {
      if (c.op === 'vertex') canvasNums.push(fmt(c.args[0]), fmt(c.args[1]));
      else if (c.op === 'bezierVertex') {
        canvasNums.push(
          fmt(c.args[0]), fmt(c.args[1]),
          fmt(c.args[2]), fmt(c.args[3]),
          fmt(c.args[4]), fmt(c.args[5])
        );
      }
    }

    // Collect SVG numeric args in order from the parsed paths.
    const svgNums = [];
    for (const el of inst.svgElements) {
      const { start, segments } = parsePath(el);
      svgNums.push(fmt(start[0]), fmt(start[1]));
      for (const s of segments) {
        svgNums.push(
          fmt(s.c1[0]), fmt(s.c1[1]),
          fmt(s.c2[0]), fmt(s.c2[1]),
          fmt(s.end[0]), fmt(s.end[1])
        );
      }
    }

    expect(canvasNums).toEqual(svgNums);
  });

  it('records bezierVertex calls through the RecordingContext under warp', () => {
    const { ctx } = run({
      ...BASE_PARAMS,
      modulation: { field: risingField(), channel: 'warp', amount: 2 },
    });
    const bez = ctx.calls.filter((c) => c.op === 'bezierVertex');
    expect(bez.length).toBeGreaterThan(0);
  });
});
