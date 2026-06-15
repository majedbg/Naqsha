import { describe, it, expect } from 'vitest';
import DifferentialGrowth from '../DifferentialGrowth.js';
import { RecordingContext, Pattern } from '../drawingContext.js';

// Headless characterization of DifferentialGrowth. Under RecordingContext,
// ctx.random() is a deterministic mulberry32 stream, so the whole grow+relax
// simulation is reproducible. This locks the LOGIC (determinism, topology →
// closed/open element, growth-budget → vertex count, valid single-element SVG,
// real symmetry wiring), not production p5 bytes. Node counts here are kept
// small for speed; one larger case checks perf doesn't blow up.
const SEED = 7;
const PARAMS = {
  topology: 'closed',
  maxNodes: 400,
  repulsionRadius: 12,
  attraction: 0.5,
  repulsion: 0.5,
  smoothing: 0.45,
  growthStyle: 'curvature',
  strokeWeight: 0.8,
  symmetry: 1,
  startAngle: 0,
  offsetX: 0,
  offsetY: 0,
};
const COLOR = '#224488';
const OPACITY = 80;

function run(params = PARAMS, seed = SEED) {
  const inst = new DifferentialGrowth();
  const ctx = new RecordingContext({ seed });
  inst.generateWithContext(ctx, seed, params, 800, 600, COLOR, OPACITY);
  return { inst, ctx };
}

// Total vertex count across all emitted elements (parsed from points="...").
function totalVertices(svgElements) {
  let n = 0;
  for (const el of svgElements) {
    const m = el.match(/points="([^"]*)"/);
    if (!m) continue;
    n += m[1].trim().split(/\s+/).length;
  }
  return n;
}

// Parse the single emitted element back into an array of {x,y} nodes.
function nodes(svgElements) {
  const m = svgElements[0].match(/points="([^"]*)"/);
  return m[1].trim().split(/\s+/).map((p) => {
    const [x, y] = p.split(',').map(Number);
    return { x, y };
  });
}

// Smallest distance between any two NON-ADJACENT nodes (self-avoidance probe).
// Closed loops wrap, so node 0 and node n-1 are adjacent and skipped too.
function minNonAdjacentDist(pts, closed) {
  const n = pts.length;
  let min = Infinity;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const adjacent =
        j === i + 1 || (closed && i === 0 && j === n - 1);
      if (adjacent) continue;
      const d = Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y);
      if (d < min) min = d;
    }
  }
  return min;
}

// Bounding-box diagonal of the node set (spread probe).
function bboxDiagonal(pts) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of pts) {
    if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
  }
  return Math.hypot(maxX - minX, maxY - minY);
}

describe('DifferentialGrowth (headless)', () => {
  it('extends the shared Pattern base', () => {
    expect(new DifferentialGrowth()).toBeInstanceOf(Pattern);
  });

  it('emits exactly one element and draws via beginShape/vertex/endShape', () => {
    const { inst, ctx } = run();
    expect(inst.svgElements.length).toBe(1);
    expect(ctx.calls.some((c) => c.op === 'beginShape')).toBe(true);
    expect(ctx.calls.some((c) => c.op === 'vertex')).toBe(true);
    expect(ctx.calls.some((c) => c.op === 'endShape')).toBe(true);
  });

  it('is deterministic across runs with the same seed', () => {
    expect(run().inst.svgElements).toEqual(run().inst.svgElements);
  });

  it('different seeds change the output', () => {
    expect(run(PARAMS, 7).inst.svgElements).not.toEqual(run(PARAMS, 99).inst.svgElements);
  });

  it('closed topology emits a <polygon>, open emits a <polyline>', () => {
    const closed = run({ ...PARAMS, topology: 'closed' }).inst.svgElements[0];
    const open = run({ ...PARAMS, topology: 'open' }).inst.svgElements[0];
    expect(closed).toMatch(/^<polygon points="[^"]+" fill="none" stroke=".*" stroke-width=".*"\/>$/);
    expect(open).toMatch(/^<polyline points="[^"]+" fill="none" stroke=".*" stroke-width=".*"\/>$/);
  });

  it('closed path is closed via endShape(CLOSE), open is not', () => {
    const { ctx: closedCtx } = run({ ...PARAMS, topology: 'closed' });
    const { ctx: openCtx } = run({ ...PARAMS, topology: 'open' });
    const closedEnd = closedCtx.calls.find((c) => c.op === 'endShape');
    const openEnd = openCtx.calls.find((c) => c.op === 'endShape');
    expect(closedEnd.args[0]).toBe('close'); // RecordingContext.CLOSE === 'close'
    expect(openEnd.args.length).toBe(0);
  });

  it('larger maxNodes yields more vertices', () => {
    const few = totalVertices(run({ ...PARAMS, maxNodes: 300 }).inst.svgElements);
    const many = totalVertices(run({ ...PARAMS, maxNodes: 1000 }).inst.svgElements);
    expect(many).toBeGreaterThan(few);
  });

  it('different growthStyle changes the curve', () => {
    const curv = run({ ...PARAMS, growthStyle: 'curvature' }).inst.svgElements;
    const scat = run({ ...PARAMS, growthStyle: 'scattered' }).inst.svgElements;
    expect(curv).not.toEqual(scat);
  });

  it('the wrapped SVG group honors the real symmetry param', () => {
    const single = run({ ...PARAMS, symmetry: 1 }).inst.toSVGGroup('L1', COLOR, OPACITY);
    const quad = run({ ...PARAMS, symmetry: 4 }).inst.toSVGGroup('L1', COLOR, OPACITY);
    const singleGroups = (single.match(/<g transform="translate/g) || []).length;
    const quadGroups = (quad.match(/<g transform="translate/g) || []).length;
    expect(singleGroups).toBe(1);
    expect(quadGroups).toBe(4);
    expect(quad).toContain('rotate(90)');
  });

  it('self-avoids: non-adjacent nodes stay apart and repulsion drives the spacing', () => {
    // The whole point of the simulation is self-avoidance + spread. These probes
    // would FAIL if the force loop were a no-op (a pure subdivision would still
    // pass the count/topology/SVG tests). repulsion=0 lets attraction+smoothing
    // collapse the curve; repulsion>0 holds non-adjacent nodes apart and expands
    // the blob well beyond the tiny seed ring.
    const withRep = nodes(run({ ...PARAMS, repulsion: 0.5, maxNodes: 600 }).inst.svgElements);
    const noRep = nodes(run({ ...PARAMS, repulsion: 0, maxNodes: 600 }).inst.svgElements);

    const dWith = minNonAdjacentDist(withRep, true);
    const dNo = minNonAdjacentDist(noRep, true);

    // With repulsion, non-adjacent nodes keep a real gap (measured ~3.9 at
    // repulsionRadius=12); without it they pile up (measured ~0.5).
    expect(dWith).toBeGreaterThan(1.5);
    expect(dWith).toBeGreaterThan(dNo * 2);

    // And the curve actually grows outward, not just in node count. The seed
    // ring spans ~72px; a settled blob spreads well past that.
    expect(bboxDiagonal(withRep)).toBeGreaterThan(120);
    expect(bboxDiagonal(withRep)).toBeGreaterThan(bboxDiagonal(noRep));
  });

  it('finishes a large budget without hanging', () => {
    const t0 = Date.now();
    const { inst } = run({ ...PARAMS, maxNodes: 3000 });
    const ms = Date.now() - t0;
    expect(inst.svgElements.length).toBe(1);
    expect(totalVertices(inst.svgElements)).toBeGreaterThan(1000);
    expect(ms).toBeLessThan(5000); // generous ceiling; real default is far faster
  });
});
