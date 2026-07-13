import { describe, it, expect } from 'vitest';
import { P5Adapter } from '../patterns/drawingContext.js';
import { capturePolylines } from './capturePolylines.js';
import { mulberry32 } from '../patterns/rng.js';
import FlowField from '../patterns/FlowField.js';
import { EDGE_MOTIF_HOSTS } from './hostKinds.js';
import { PATTERN_CLASSES } from '../patterns/index.js';
import { DEFAULT_PARAMS } from '../../constants.js';

// A DETERMINISTIC fake p5 whose randomSeed/noiseSeed actually RESET independent
// mulberry32 streams and whose random()/noise() PULL from them. This is what
// makes the reseed-safety test bite: a host that failed to reseed at the top of
// generate() would draw DIFFERENT geometry after a probe consumed the stream —
// a constant-RNG stub (random(){return 0.5}) would hide that bug.
function makeDeterministicP5() {
  const log = [];
  let r = mulberry32(1);
  let n = mulberry32(0x9e3779b9);
  const rec = (op) => (...args) => { log.push({ op, args }); };
  return {
    log,
    TWO_PI: Math.PI * 2, PI: Math.PI, HALF_PI: Math.PI / 2,
    CLOSE: 'P5_CLOSE', CENTER: 'P5_CENTER', ROUND: 'P5_ROUND',
    randomSeed(s) { r = mulberry32(s | 0); },
    noiseSeed(s) { n = mulberry32(((s | 0) ^ 0x1234567) >>> 0); },
    random(a, b) {
      const u = r();
      if (a === undefined) return u;
      if (b === undefined) return u * a;
      return a + u * (b - a);
    },
    noise() { return n(); }, // stateful ⇒ reseed-bite also covers noiseSeed
    color: () => ({ setAlpha() {} }),
    red: () => 0, green: () => 0, blue: () => 0, map: (v) => v,
    // transform + draw ops all logged (so we can compare against record calls)
    push: rec('push'), pop: rec('pop'), translate: rec('translate'),
    rotate: rec('rotate'), scale: rec('scale'),
    stroke: rec('stroke'), noStroke: rec('noStroke'), fill: rec('fill'), noFill: rec('noFill'),
    strokeWeight: rec('strokeWeight'), strokeCap: rec('strokeCap'), rectMode: rec('rectMode'),
    line: rec('line'), ellipse: rec('ellipse'), rect: rec('rect'), triangle: rec('triangle'),
    beginShape: rec('beginShape'), vertex: rec('vertex'), endShape: rec('endShape'),
  };
}

const CANVAS_W = 400;
const CANVAS_H = 300;
const HOST_PARAMS = { particleCount: 25, stepLength: 6, symmetry: 'none' };
const RECORDED_OPS = new Set([
  'push', 'pop', 'translate', 'rotate', 'scale',
  'line', 'beginShape', 'vertex', 'endShape',
]);

function runFlowField(ctx) {
  new FlowField().generate(ctx, 42, HOST_PARAMS, CANVAS_W, CANVAS_H, '#000000', 100);
}

describe('arbitrary-edge host capture — FlowField (B2)', () => {
  it('record-mode calls == draw-mode p5 log filtered to transform+polyline ops (faithful capture)', () => {
    const pDraw = makeDeterministicP5();
    runFlowField(new P5Adapter(pDraw, { draw: true }));
    const drawnOps = pDraw.log.filter((e) => RECORDED_OPS.has(e.op));

    const pRec = makeDeterministicP5();
    const recCtx = new P5Adapter(pRec, { draw: false, record: true });
    runFlowField(recCtx);

    // Same ops, same args, same order — the record adapter captures exactly what
    // the live draw paints (RNG delegates to p5 identically in both).
    expect(recCtx.calls).toEqual(drawnOps);
  });

  it('capturePolylines yields non-empty absolute-coordinate hostPaths', () => {
    const pRec = makeDeterministicP5();
    const recCtx = new P5Adapter(pRec, { draw: false, record: true });
    runFlowField(recCtx);
    const paths = capturePolylines(recCtx.calls);

    expect(paths.length).toBeGreaterThan(0);
    for (const path of paths) {
      expect(path.points.length).toBeGreaterThanOrEqual(2);
      expect(path.closed).toBe(false); // FlowField trails are open
      for (const pt of path.points) {
        expect(Number.isFinite(pt.x)).toBe(true);
        expect(Number.isFinite(pt.y)).toBe(true);
      }
    }

    // FlowField draws its trails inside applySymmetryDraw's translate(cx,cy) with
    // trail coords centered on the origin (±halfW/±halfH). After folding, points
    // must be shifted into absolute canvas space around the center — i.e. NOT
    // clustered around (0,0). At least one point should sit well away from origin.
    const anyAbsolute = paths.some((pth) =>
      pth.points.some((pt) => Math.abs(pt.x - CANVAS_W / 2) < CANVAS_W && pt.x > 1)
    );
    expect(anyAbsolute).toBe(true);
  });

  it('reseed-safety: a capture probe does NOT shift the host paint (with vs without)', () => {
    // WITHOUT a prior probe: measure the host's drawn geometry on a fresh p5.
    const pA = makeDeterministicP5();
    const recA = new P5Adapter(pA, { draw: false, record: true });
    runFlowField(recA);
    const pathsWithout = capturePolylines(recA.calls);

    // WITH a prior probe: run a capture probe FIRST (consumes the RNG/noise
    // streams), THEN measure the host draw on the SAME p5. Because FlowField
    // reseeds random+noise at the top of generate(), the measured draw must be
    // byte-identical to the no-probe case. If it did NOT reseed, the probe's
    // stream consumption would shift every trail and this would FAIL.
    const pB = makeDeterministicP5();
    runFlowField(new P5Adapter(pB, { draw: false, record: true })); // the extra probe
    const recB = new P5Adapter(pB, { draw: false, record: true });
    runFlowField(recB);
    const pathsWith = capturePolylines(recB.calls);

    expect(pathsWith).toEqual(pathsWithout);
  });
});

// Every EDGE host must be RUNTIME-validated, not just grep-asserted. Using the
// pattern's REAL default params (constants.DEFAULT_PARAMS — what useLayers assigns
// on layer creation; some patterns like Spirograph read params with NO inline
// fallback, so an empty {} would spuriously emit nothing), each host must
// (1) capture at least one polyline — else it is a selectable host that stamps
// nothing (a silent dead affordance) — and (2) reseed at the top of generate()
// so a capture probe never shifts its painted realization.
describe('every EDGE_MOTIF_HOSTS type captures polylines at default params + reseeds', () => {
  for (const type of EDGE_MOTIF_HOSTS) {
    it(`${type}: default-params capture is non-empty AND probe-safe (reseeds)`, () => {
      const HostClass = PATTERN_CLASSES[type];
      expect(HostClass, `no PatternClass for "${type}"`).toBeTruthy();
      const params = DEFAULT_PARAMS[type] || {};
      expect(
        Object.keys(params).length,
        `no DEFAULT_PARAMS entry for edge host "${type}"`
      ).toBeGreaterThan(0);

      const run = (ctx) =>
        new HostClass().generate(ctx, 7, params, CANVAS_W, CANVAS_H, '#000000', 100);

      // WITHOUT a prior probe.
      const pA = makeDeterministicP5();
      const recA = new P5Adapter(pA, { draw: false, record: true });
      run(recA);
      const pathsWithout = capturePolylines(recA.calls);

      // A host that emits only dots/ellipses would yield [] here → exclude it.
      expect(
        pathsWithout.length,
        `"${type}" captured no polylines at default params`
      ).toBeGreaterThan(0);

      // WITH a prior probe on the SAME p5 (consumes the RNG/noise streams first).
      const pB = makeDeterministicP5();
      run(new P5Adapter(pB, { draw: false, record: true })); // extra probe
      const recB = new P5Adapter(pB, { draw: false, record: true });
      run(recB);
      const pathsWith = capturePolylines(recB.calls);

      // Reseed proof: the measured draw is identical with vs without the probe.
      expect(
        pathsWith,
        `"${type}" did not reseed — a probe shifted its output`
      ).toEqual(pathsWithout);
    });
  }
});
