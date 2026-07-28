import { describe, it, expect } from 'vitest';
// Side-effect import: self-registers the built-in extras (Hilbert, Lissajous,
// Chladni, Truchet) into the dynamic registry, exactly as main.jsx does at boot.
// Those hosts live OUTSIDE the static PATTERN_CLASSES / DEFAULT_PARAMS tables —
// resolving them the way the runtime does (getPatternClass + getDynamicDefaults)
// is what makes this loop generic over the whole edge-host set (#144).
import '../registerBuiltinExtras.js';
import { P5Adapter } from '../patterns/drawingContext.js';
import { capturePolylines } from './capturePolylines.js';
import { sampleEdgeAnchors } from './anchors.js';
import { placeMotifs } from './placementEngine.js';
import { mulberry32 } from '../patterns/rng.js';
import FlowField from '../patterns/FlowField.js';
import { EDGE_MOTIF_HOSTS } from './hostKinds.js';
import { getPatternClass } from '../patterns/index.js';
import { getDynamicDefaults, getDynamicParamDefs } from '../patternRegistry.js';
import { DEFAULT_PARAMS, PATTERN_PARAM_DEFS } from '../../constants.js';

/**
 * The host's REAL creation-time params, resolved through the same two-table
 * lookup useLayers/useLayerParams use when creating a layer: static built-ins
 * from DEFAULT_PARAMS first, then self-registering extras (hilbert, lissajous,
 * chladni) from the dynamic registry. The static map alone reports a real,
 * working host as having no params at all.
 */
function defaultParamsFor(type) {
  return DEFAULT_PARAMS[type] || getDynamicDefaults(type) || null;
}

/** The host's REAL param definitions (min/max), same two-table lookup. */
function paramDefsFor(type) {
  return PATTERN_PARAM_DEFS[type] || getDynamicParamDefs(type) || null;
}

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
      // getPatternClass + defaultParamsFor, never PATTERN_CLASSES[type]: static
      // built-ins live in the map, self-registering extras (hilbert, lissajous,
      // chladni) in the dynamic registry.
      const HostClass = getPatternClass(type);
      expect(HostClass, `no PatternClass for "${type}"`).toBeTruthy();
      const params = defaultParamsFor(type) || {};
      expect(
        Object.keys(params).length,
        `no registered defaults for edge host "${type}"`
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

// ── #144: Radial Etch · Hilbert · Lissajous ─────────────────────────────────
//
// The silent-failure mode this slice guards against: a pattern that draws only
// with operations capturePolylines IGNORES (ellipse/rect/triangle) yields an
// EMPTY motif and NO error — a selectable host that stamps nothing. The loop
// above proves each host is capturable at DEFAULT params; that is not enough on
// its own, because a host can be capturable at defaults and blank at a boundary
// (the Chladni equal-modes case, #148). So each of the three is also swept
// across the ENDS of its declared params space.
//
// These deliberately run the REAL pattern classes — the whole claim is that the
// real draw stream is capturable, which a hand-built fixture cannot establish.

const NEW_EDGE_HOSTS = ['radialetch', 'hilbert', 'lissajous'];

/** Capture one real host run at `params` into absolute-coordinate hostPaths. */
function captureHost(type, params, { w = CANVAS_W, h = CANVAS_H, seed = 7 } = {}) {
  const HostClass = getPatternClass(type);
  const rec = new P5Adapter(makeDeterministicP5(), { draw: false, record: true });
  new HostClass().generate(rec, seed, params, w, h, '#000000', 100);
  return capturePolylines(rec.calls);
}

/** Every {key, min, max} a pattern's param defs declare (pad2d fans out to its keys). */
function boundaryKeys(type) {
  const defs = paramDefsFor(type) || [];
  const out = [];
  for (const def of defs) {
    const min = def.min ?? def.range?.min;
    const max = def.max ?? def.range?.max;
    if (min == null || max == null) continue;
    for (const key of def.keys || [def.key]) {
      if (key) out.push({ key, min, max });
    }
  }
  return out;
}

/** Squared distance from p to segment ab. */
function distSqToSegment(p, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const qx = a.x + t * dx;
  const qy = a.y + t * dy;
  return (p.x - qx) ** 2 + (p.y - qy) ** 2;
}

/** Distance from p to the NEAREST segment of any painted polyline. */
function distToPaint(p, paths) {
  let best = Infinity;
  for (const path of paths) {
    const pts = path.points;
    for (let i = 1; i < pts.length; i++) {
      const d2 = distSqToSegment(p, pts[i - 1], pts[i]);
      if (d2 < best) best = d2;
    }
  }
  return Math.sqrt(best);
}

describe('#144 new edge hosts — capture is non-empty at defaults AND at every params boundary', () => {
  for (const type of NEW_EDGE_HOSTS) {
    it(`${type}: the pattern is resolvable and has real default params`, () => {
      expect(getPatternClass(type), `no PatternClass for "${type}"`).toBeTruthy();
      const params = defaultParamsFor(type);
      expect(params, `no default params for "${type}"`).toBeTruthy();
      expect(Object.keys(params).length).toBeGreaterThan(0);
      expect(boundaryKeys(type).length, `no param defs for "${type}"`).toBeGreaterThan(0);
    });

    it(`${type}: default-params capture yields non-empty paths with ≥2 finite points each`, () => {
      const paths = captureHost(type, defaultParamsFor(type));
      expect(paths.length, `"${type}" captured nothing at defaults`).toBeGreaterThan(0);
      for (const path of paths) {
        expect(path.points.length).toBeGreaterThanOrEqual(2);
        for (const pt of path.points) {
          expect(Number.isFinite(pt.x) && Number.isFinite(pt.y)).toBe(true);
        }
      }
    });

    it(`${type}: capture stays non-empty at BOTH ends of every declared param`, () => {
      const defaults = defaultParamsFor(type);
      for (const { key, min, max } of boundaryKeys(type)) {
        for (const [edge, value] of [['min', min], ['max', max]]) {
          const paths = captureHost(type, { ...defaults, [key]: value });
          expect(
            paths.length,
            `"${type}" captured NOTHING at ${key}=${value} (${edge})`
          ).toBeGreaterThan(0);
          // Degenerate geometry (e.g. a margin larger than the canvas) still has
          // to be finite — a NaN point would arc-length-sample glyphs to nowhere.
          const anyNonFinite = paths.some((pth) =>
            pth.points.some((pt) => !Number.isFinite(pt.x) || !Number.isFinite(pt.y))
          );
          expect(anyNonFinite, `"${type}" produced non-finite points at ${key}=${value}`).toBe(false);
          // …and the paths must be USABLE, not merely present. capturePolylines
          // records a 2-point path for EVERY ctx.line, including a zero-length
          // one, while sampleEdgeAnchors drops any path of zero length — so a
          // boundary that collapsed the geometry to points would satisfy the
          // count above and still yield NO anchors, which is this slice's
          // silent-failure mode one layer down.
          expect(
            sampleEdgeAnchors(paths, { count: 2 }).length,
            `"${type}" captured only degenerate zero-length paths at ${key}=${value}`
          ).toBeGreaterThan(0);
        }
      }
    });

    it(`${type}: capture stays non-empty with EVERY param at its minimum`, () => {
      const params = { ...defaultParamsFor(type) };
      for (const { key, min } of boundaryKeys(type)) params[key] = min;
      const paths = captureHost(type, params);
      expect(paths.length, `"${type}" captured nothing at all-min params`).toBeGreaterThan(0);
      expect(sampleEdgeAnchors(paths, { count: 2 }).length).toBeGreaterThan(0);
    });

    it(`${type}: the placement engine ACCEPTS glyphs on the captured geometry`, () => {
      // The end of the road the maker actually cares about: real pattern →
      // record-mode capture → edge anchors → placeMotifs. Counts the ACCEPTED
      // placements array, never placementStats (which is seeded with the
      // pre-rejection candidate count and would report glyphs that were
      // rejected for no-fit, below-floor or rest).
      const paths = captureHost(type, defaultParamsFor(type));
      const anchors = sampleEdgeAnchors(paths, { spacing: 24 });
      expect(anchors.length).toBeGreaterThan(0);

      const { placements } = placeMotifs(anchors, {}, {
        boundary: { type: 'rect', width: CANVAS_W, height: CANVAS_H },
        canvasW: CANVAS_W,
        canvasH: CANVAS_H,
      });
      expect(
        placements.length,
        `"${type}" captured geometry but the engine placed no glyphs on it`
      ).toBeGreaterThan(0);
    });
  }
});

describe('#144 new edge hosts — anchors land on the curve AS PAINTED', () => {
  const RECORDED = RECORDED_OPS;

  for (const type of NEW_EDGE_HOSTS) {
    it(`${type}: the recorded stream equals the DRAWN p5 op log (capture == paint)`, () => {
      const params = defaultParamsFor(type);
      const pDraw = makeDeterministicP5();
      new (getPatternClass(type))().generate(
        new P5Adapter(pDraw, { draw: true }), 7, params, CANVAS_W, CANVAS_H, '#000000', 100
      );
      const drawnOps = pDraw.log.filter((e) => RECORDED.has(e.op));

      const pRec = makeDeterministicP5();
      const recCtx = new P5Adapter(pRec, { draw: false, record: true });
      new (getPatternClass(type))().generate(
        recCtx, 7, params, CANVAS_W, CANVAS_H, '#000000', 100
      );

      expect(recCtx.calls).toEqual(drawnOps);
    });

    it(`${type}: every sampled edge anchor sits ON a painted segment (no float-off)`, () => {
      // Non-default frame: a rotated + offset host is where "the painted frame"
      // is actually testable — anchors folded through the WRONG transform would
      // land far from the visible line.
      const params = { ...defaultParamsFor(type), startAngle: 41, offsetX: 23, offsetY: -17 };
      const paths = captureHost(type, params);
      expect(paths.length).toBeGreaterThan(0);

      const anchors = sampleEdgeAnchors(paths, { count: 12 });
      expect(anchors.length).toBeGreaterThan(0);
      for (const a of anchors) {
        expect(
          distToPaint(a, paths),
          `"${type}" anchor ${a.id} floated off the painted geometry`
        ).toBeLessThan(1e-6);
      }
    });

    it(`${type}: the capture lands in the PAINTED frame, not the pattern's local one`, () => {
      // All three build geometry origin-centred and rely on applySymmetryDraw's
      // translate(cx+offX, cy+offY) to place it. A capture that dropped the
      // transform fold would cluster every point around (0,0) — visually the
      // motif would sit in the canvas corner while the host paints centre-stage.
      const params = { ...defaultParamsFor(type), symmetry: 1, startAngle: 0, offsetX: 0, offsetY: 0 };
      const paths = captureHost(type, params);
      expect(paths.length).toBeGreaterThan(0);
      let sx = 0, sy = 0, n = 0;
      for (const pth of paths) for (const pt of pth.points) { sx += pt.x; sy += pt.y; n++; }
      const mx = sx / n;
      const my = sy / n;
      // Near-origin-symmetric local geometry (RNG jitter and sampling put the
      // exact centroid a few px off) ⇒ the folded centroid sits AT the canvas
      // centre and nowhere near the local origin.
      expect(Math.hypot(mx - CANVAS_W / 2, my - CANVAS_H / 2)).toBeLessThan(25);
      expect(Math.hypot(mx, my)).toBeGreaterThan(100);
    });

    it(`${type}: radial symmetry replicates the capture onto every copy`, () => {
      const base = { ...defaultParamsFor(type), symmetry: 1, startAngle: 41, offsetX: 23, offsetY: -17 };
      const one = captureHost(type, base);
      const three = captureHost(type, { ...base, symmetry: 3 });

      // Guard the vacuous case: 0 === 0 * 3 would "pass" on a host that captured
      // nothing at all.
      expect(one.length).toBeGreaterThan(0);
      expect(three.length).toBe(one.length * 3);

      // Copy k is copy 0 rotated by 2πk/3 about the transformed origin. This is
      // the guard against the base-copy-only bug the studio has shipped once.
      const cx = CANVAS_W / 2 + base.offsetX;
      const cy = CANVAS_H / 2 + base.offsetY;
      const per = one.length;
      for (let k = 1; k < 3; k++) {
        const th = (Math.PI * 2 / 3) * k;
        const cos = Math.cos(th);
        const sin = Math.sin(th);
        for (let i = 0; i < per; i++) {
          const src = three[i].points;
          const dst = three[k * per + i].points;
          expect(dst.length).toBe(src.length);
          // Spot-check the endpoints; a wrong frame moves them by pixels.
          for (const idx of [0, src.length - 1]) {
            const vx = src[idx].x - cx;
            const vy = src[idx].y - cy;
            expect(dst[idx].x).toBeCloseTo(cx + vx * cos - vy * sin, 6);
            expect(dst[idx].y).toBeCloseTo(cy + vx * sin + vy * cos, 6);
          }
        }
      }
    });
  }

  // Lissajous at damping 0 is a mathematically CLOSED figure, and it terminates
  // its shape bare (endShape() with no CLOSE). #144 pinned that capture reported
  // it OPEN; #147 fixed that on the CAPTURE side by inferring closure from
  // endpoint coincidence under a stated tolerance, so the expectation is flipped
  // here. The patterns were NOT touched — what Lissajous paints and exports is
  // unchanged. The tolerance and the Route/Zones consequences live in
  // capturePolylines.test.js and closureInference.test.js.
  it('lissajous: a mathematically closed figure is reported CLOSED (#147)', () => {
    const paths = captureHost('lissajous', { ...defaultParamsFor('lissajous'), damping: 0 });
    expect(paths.length).toBeGreaterThan(0);
    for (const path of paths) expect(path.closed).toBe(true);
  });

  // The other half of the same criterion: damping > 0 is a decaying harmonograph
  // ribbon with two genuinely separated ends, and it must stay OPEN.
  it('lissajous: a damped figure is still reported OPEN (#147)', () => {
    const paths = captureHost('lissajous', { ...defaultParamsFor('lissajous'), damping: 0.01 });
    expect(paths.length).toBeGreaterThan(0);
    for (const path of paths) expect(path.closed).toBe(false);
  });
});
