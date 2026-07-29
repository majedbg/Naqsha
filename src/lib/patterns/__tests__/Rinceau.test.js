import { describe, it, expect } from 'vitest';
import Rinceau, { buildRinceauRows } from '../Rinceau.js';
import { RecordingContext, P5Adapter, Pattern } from '../drawingContext.js';
import { capturePolylines } from '../../motif/capturePolylines.js';
import { sampleEdgeAnchors } from '../../motif/anchors.js';
import { PATTERN_CLASSES, SEEDLESS_PATTERN_IDS, getPatternClass } from '../index.js';
import {
  PATTERN_TYPES,
  DEFAULT_PARAMS,
  PATTERN_PARAM_DEFS,
  PATTERN_TAXONOMY,
  PATTERN_SYMBOLS,
  PATTERN_FAMILIES,
  SPATIAL_FORM_ROWS,
  PARAM_GROUP_MAP,
} from '../../../constants.js';
import { EDGE_MOTIF_HOSTS, isEdgeHost, isMotifHost, defaultRolesForHost } from '../../motif/hostKinds.js';
import { makePatternThumbnailSVG } from '../../patternThumbnail.js';

// Headless characterization of Rinceau — the running-scroll spine (T2,
// docs/vine-scaffolds-PLAN.md). The thing under test is NOT "it looks nice":
// it is the EDGE-HOST CONTRACT. One OPEN polyline per strip row, canvas byte-for-
// byte equal to the exported SVG, a strictly increasing arc length so edge-anchor
// sampling never hits a degenerate tangent, and determinism under a fixed seed.
const W = 1000;
const H = 800;
const SEED = 7;
const COLOR = '#224488';
const OPACITY = 80;
const P = DEFAULT_PARAMS.rinceau;

function run(params = P, seed = SEED, w = W, h = H) {
  const inst = new Rinceau();
  const ctx = new RecordingContext({ seed });
  inst.generateWithContext(ctx, seed, params, w, h, COLOR, OPACITY);
  return { inst, ctx };
}

/** The vertex sequences the CANVAS drew, split per beginShape run. */
function drawnRuns(ctx) {
  const runs = [];
  let cur = null;
  for (const c of ctx.calls) {
    if (c.op === 'beginShape') cur = { points: [], closed: false };
    else if (c.op === 'vertex' && cur) cur.points.push({ x: c.args[0], y: c.args[1] });
    else if (c.op === 'endShape' && cur) {
      cur.closed = c.args.length > 0;
      runs.push(cur);
      cur = null;
    }
  }
  return runs;
}

/** The point sequences the SVG carries, one per <polyline>. */
function svgRuns(svgElements) {
  return svgElements.map((el) => {
    const m = el.match(/points="([^"]*)"/);
    return m[1].trim().split(/\s+/).map((p) => {
      const [x, y] = p.split(',').map(Number);
      return { x, y };
    });
  });
}

function cumulativeArcLength(pts) {
  const s = [0];
  for (let i = 1; i < pts.length; i++) {
    s.push(s[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
  }
  return s;
}

/** A minimal p5 stand-in for the record-mode P5Adapter (no drawing, no RNG use). */
function makeRecordingP5() {
  const noop = () => {};
  return {
    TWO_PI: Math.PI * 2, PI: Math.PI, HALF_PI: Math.PI / 2, CLOSE: 'P5_CLOSE',
    randomSeed: noop, noiseSeed: noop, random: () => 0.5, noise: () => 0.5,
    color: () => ({ setAlpha() {} }),
    red: () => 0, green: () => 0, blue: () => 0, map: (v) => v,
    push: noop, pop: noop, translate: noop, rotate: noop, scale: noop,
    beginShape: noop, vertex: noop, endShape: noop, line: noop,
    noFill: noop, fill: noop, stroke: noop, noStroke: noop, strokeWeight: noop,
  };
}

const ys = (pts) => pts.map((p) => p.y);
const xs = (pts) => pts.map((p) => p.x);
const extent = (v) => Math.max(...v) - Math.min(...v);

describe('Rinceau — geometry', () => {
  it('extends the shared Pattern base', () => {
    expect(new Rinceau()).toBeInstanceOf(Pattern);
  });

  it('emits exactly ONE OPEN polyline per strip row — the whole point of the host', () => {
    for (const rows of [1, 2, 3, 5]) {
      const { inst, ctx } = run({ ...P, rows });
      expect(inst.svgElements.length, `rows=${rows}`).toBe(rows);
      for (const el of inst.svgElements) expect(el).toMatch(/^<polyline points="/);
      expect(inst.svgElements.join('\n')).not.toContain('<polygon');

      const runs = drawnRuns(ctx);
      expect(runs.length, `drawn runs at rows=${rows}`).toBe(rows);
      // endShape() with NO argument → capturePolylines records closed:false,
      // which is what lets a vine ride the spine root→tip.
      for (const r of runs) expect(r.closed, 'a spine row was CLOSED').toBe(false);
    }
  });

  it('canvas == SVG: every drawn vertex matches the exported polyline point', () => {
    const { inst, ctx } = run();
    const drawn = drawnRuns(ctx);
    const exported = svgRuns(inst.svgElements);
    expect(drawn.length).toBe(exported.length);
    for (let r = 0; r < drawn.length; r++) {
      expect(drawn[r].points.length, `row ${r} point count`).toBe(exported[r].length);
      for (let i = 0; i < exported[r].length; i++) {
        // The SVG rounds to 2dp (fmt in generate()); anything beyond that is a
        // second computation having crept in.
        expect(drawn[r].points[i].x).toBeCloseTo(exported[r][i].x, 1);
        expect(drawn[r].points[i].y).toBeCloseTo(exported[r][i].y, 1);
      }
    }
  });

  it('canvas == SVG holds for the vertical strip too (the axis swap is in the geometry, not a ctx.rotate)', () => {
    const { inst, ctx } = run({ ...P, orientation: 'vertical' });
    expect(ctx.calls.some((c) => c.op === 'rotate')).toBe(false);
    const drawn = drawnRuns(ctx);
    const exported = svgRuns(inst.svgElements);
    for (let r = 0; r < drawn.length; r++) {
      for (let i = 0; i < exported[r].length; i++) {
        expect(drawn[r].points[i].x).toBeCloseTo(exported[r][i].x, 1);
        expect(drawn[r].points[i].y).toBeCloseTo(exported[r][i].y, 1);
      }
    }
  });

  it('arc length is STRICTLY increasing — no zero-length segment to degenerate a tangent', () => {
    for (const waveform of ['scroll', 'sine']) {
      for (const tension of [0.05, 0.5, 1]) {
        for (const amplitude of [0.01, 0.09]) {
          const rows = buildRinceauRows({ ...P, waveform, tension, amplitude }, W, H);
          for (const row of rows) {
            const s = cumulativeArcLength(row.points);
            for (let i = 1; i < s.length; i++) {
              expect(
                s[i],
                `${waveform} tension=${tension} amp=${amplitude} step ${i}`
              ).toBeGreaterThan(s[i - 1]);
            }
          }
        }
      }
    }
  });

  it('the along-axis coordinate stays monotone, so the spine never doubles back', () => {
    for (const tension of [0.05, 0.5, 1]) {
      const [row] = buildRinceauRows({ ...P, rows: 1, tension }, W, H);
      const u = xs(row.points);
      for (let i = 1; i < u.length; i++) expect(u[i]).toBeGreaterThan(u[i - 1]);
    }
  });

  it('is ORIGIN-CENTRED (both symmetry wrappers translate by the canvas centre)', () => {
    const [row] = buildRinceauRows({ ...P, rows: 1, stripOffset: 0, margin: 60 }, W, H);
    const x = xs(row.points);
    // Span = alongExtent - 2*margin, centred on 0.
    expect(Math.min(...x)).toBeCloseTo(-(W - 120) / 2, 6);
    expect(Math.max(...x)).toBeCloseTo((W - 120) / 2, 6);
    // …and the single row sits on the cross-axis origin, not at canvasH/2.
    const y = ys(row.points);
    expect((Math.min(...y) + Math.max(...y)) / 2).toBeCloseTo(0, 6);
  });

  it('amplitude is a fraction of the CROSS-AXIS extent and the spine fills its band', () => {
    for (const amplitude of [0.03, 0.09, 0.2]) {
      const [row] = buildRinceauRows({ ...P, rows: 1, amplitude, jitter: 0 }, W, H);
      const amp = amplitude * H; // horizontal strip → cross axis is canvasH
      const y = ys(row.points);
      const reach = Math.max(...y.map(Math.abs));
      expect(reach, `amp ${amplitude} overshoots`).toBeLessThanOrEqual(amp + 1e-6);
      expect(reach, `amp ${amplitude} undershoots`).toBeGreaterThan(amp * 0.9);
    }
  });

  it('a vertical strip measures amplitude against canvasW instead', () => {
    const [row] = buildRinceauRows({ ...P, rows: 1, orientation: 'vertical' }, W, H);
    const reach = Math.max(...xs(row.points).map(Math.abs));
    expect(reach).toBeLessThanOrEqual(P.amplitude * W + 1e-6);
    expect(reach).toBeGreaterThan(P.amplitude * W * 0.9);
    // The strip now runs down the page: the long extent is on y.
    expect(extent(ys(row.points))).toBeCloseTo(H - 2 * P.margin, 6);
  });

  it('waveCount sets the number of undulations (counted as sign changes of the cross coord)', () => {
    const crossings = (waveCount) => {
      const [row] = buildRinceauRows({ ...P, rows: 1, waveCount, phase: 0 }, W, H);
      const y = ys(row.points);
      let n = 0;
      for (let i = 1; i < y.length; i++) if (y[i - 1] < 0 !== y[i] < 0) n++;
      return n;
    };
    // A full wave crosses the centerline twice; the spine starts ON it.
    expect(crossings(2)).toBe(4);
    expect(crossings(6)).toBe(12);
    expect(crossings(11)).toBe(22);
  });

  it('the scroll waveform is a DIFFERENT curve from the sine, and tension is what moves it', () => {
    const sine = buildRinceauRows({ ...P, rows: 1, waveform: 'sine' }, W, H)[0].points;
    const soft = buildRinceauRows({ ...P, rows: 1, waveform: 'scroll', tension: 0.75 }, W, H)[0].points;
    const tight = buildRinceauRows({ ...P, rows: 1, waveform: 'scroll', tension: 0.1 }, W, H)[0].points;
    expect(soft).not.toEqual(sine);
    expect(tight).not.toEqual(soft);
    // Both waveforms start at the SAME place — the scroll lattice is quarter-wave
    // shifted so switching waveform re-reads the border instead of sliding it.
    expect(soft[0].x).toBeCloseTo(sine[0].x, 6);
    expect(soft[0].y).toBeCloseTo(sine[0].y, 6);
  });

  it('rows are laid out across the strip by rowSpread and separated by rowPhase', () => {
    const rows = buildRinceauRows({ ...P, rows: 3, rowSpread: 0.6, rowPhase: 180 }, W, H);
    const centres = rows.map((r) => {
      const y = ys(r.points);
      return (Math.min(...y) + Math.max(...y)) / 2;
    });
    expect(centres[0]).toBeCloseTo(-0.3 * H, 4);
    expect(centres[1]).toBeCloseTo(0, 4);
    expect(centres[2]).toBeCloseTo(0.3 * H, 4);
    // 180° of row phase inverts the wave: rows 0 and 1 mirror about their centres.
    const dev = (r, c) => ys(r.points).map((v) => v - c);
    const d0 = dev(rows[0], centres[0]);
    const d1 = dev(rows[1], centres[1]);
    expect(d0.length).toBe(d1.length);
    for (let i = 0; i < d0.length; i += 37) expect(d0[i]).toBeCloseTo(-d1[i], 4);
  });

  it('stripOffset slides the whole band across the sheet', () => {
    const base = buildRinceauRows({ ...P, rows: 1, stripOffset: 0 }, W, H)[0].points;
    const moved = buildRinceauRows({ ...P, rows: 1, stripOffset: 0.25 }, W, H)[0].points;
    for (let i = 0; i < base.length; i += 41) {
      expect(moved[i].x).toBeCloseTo(base[i].x, 6);
      expect(moved[i].y - base[i].y).toBeCloseTo(0.25 * H, 6);
    }
  });

  it('phase slides the wave along the strip without moving its ends', () => {
    const a = buildRinceauRows({ ...P, rows: 1, phase: 0 }, W, H)[0].points;
    const b = buildRinceauRows({ ...P, rows: 1, phase: 90 }, W, H)[0].points;
    expect(a[0].y).not.toBeCloseTo(b[0].y, 3);
    expect(a[0].x).toBeCloseTo(b[0].x, 6);
    expect(a[a.length - 1].x).toBeCloseTo(b[b.length - 1].x, 6);
  });

  it('margin insets the spine ends from the canvas edge', () => {
    const wide = buildRinceauRows({ ...P, rows: 1, margin: 0 }, W, H)[0].points;
    const inset = buildRinceauRows({ ...P, rows: 1, margin: 120 }, W, H)[0].points;
    expect(extent(xs(wide))).toBeCloseTo(W, 6);
    expect(extent(xs(inset))).toBeCloseTo(W - 240, 6);
  });
});

describe('Rinceau — determinism and the probe contract', () => {
  it('is deterministic across runs at the same seed', () => {
    expect(run().inst.svgElements).toEqual(run().inst.svgElements);
    const j = { ...P, jitter: 0.6 };
    expect(run(j).inst.svgElements).toEqual(run(j).inst.svgElements);
  });

  it('at the default jitter:0 the seed is dead — a pure function of its params', () => {
    expect(run(P, 7).inst.svgElements).toEqual(run(P, 99999).inst.svgElements);
  });

  it('jitter turns the seed on and displaces the spine off the ideal curve', () => {
    const j = { ...P, jitter: 0.6 };
    expect(run(j, 7).inst.svgElements).not.toEqual(run(j, 99999).inst.svgElements);
    expect(run(j, 7).inst.svgElements).not.toEqual(run(P, 7).inst.svgElements);
  });

  it('reseeds at the top of generate() so a capture probe cannot shift the paint', () => {
    // The edge-host contract (hostKinds.js header): run a FIRST generate() that
    // consumes the RNG stream, then a second on the SAME context. Without the
    // reseed the second would land somewhere else.
    const j = { ...P, jitter: 0.6 };
    const ctx = new RecordingContext({ seed: SEED });
    const probe = new Rinceau();
    probe.generate(ctx, SEED, j, W, H, COLOR, OPACITY);
    const painted = new Rinceau();
    painted.generate(ctx, SEED, j, W, H, COLOR, OPACITY);
    expect(painted.svgElements).toEqual(probe.svgElements);
  });

  it('the wrapped SVG group honours the real symmetry param', () => {
    const single = run({ ...P, symmetry: 1 }).inst.toSVGGroup('L1', COLOR, OPACITY);
    const quad = run({ ...P, symmetry: 4 }).inst.toSVGGroup('L1', COLOR, OPACITY);
    expect((single.match(/<g transform="translate/g) || []).length).toBe(1);
    expect((quad.match(/<g transform="translate/g) || []).length).toBe(4);
    expect(quad).toContain('rotate(90)');
  });

  it('survives the slider ceilings without hanging or emitting junk', () => {
    const t0 = Date.now();
    const { inst } = run({
      ...P, waveCount: 16, rows: 8, amplitude: 0.3, jitter: 1, tension: 1, margin: 0,
    });
    expect(Date.now() - t0).toBeLessThan(2000);
    expect(inst.svgElements.length).toBe(8);
    for (const el of inst.svgElements) expect(el).not.toContain('NaN');
  });

  it('degenerate params still emit a drawable open spine', () => {
    for (const bad of [
      { ...P, waveCount: 0 }, { ...P, rows: 0 }, { ...P, amplitude: 0 },
      { ...P, margin: 5000 }, { ...P, rowSpread: 0 },
    ]) {
      const { inst } = run(bad);
      expect(inst.svgElements.length).toBeGreaterThan(0);
      for (const el of inst.svgElements) expect(el).not.toContain('NaN');
    }
  });
});

describe('Rinceau — the edge-host contract, end to end', () => {
  // Not a restatement of the geometry tests: this drives the REAL motif pipeline
  // (record-mode P5Adapter → capturePolylines → sampleEdgeAnchors), which is what
  // decides whether a vine can actually ride the spine root→tip.
  const captureRows = (params) => {
    const p = makeRecordingP5();
    const rec = new P5Adapter(p, { draw: false, record: true });
    new Rinceau().generate(rec, SEED, params, W, H, COLOR, OPACITY);
    return capturePolylines(rec.calls);
  };

  it('captures exactly ONE OPEN path per strip row', () => {
    for (const rows of [1, 3, 6]) {
      const paths = captureRows({ ...P, rows, symmetry: 1 });
      expect(paths.length, `rows=${rows}`).toBe(rows);
      for (const path of paths) {
        expect(path.closed, 'a captured spine was CLOSED — a vine cannot root/tip it').toBe(false);
        expect(path.points.length).toBeGreaterThan(50);
      }
    }
  });

  it('symmetry replays the spine, so N copies capture as N × rows paths', () => {
    expect(captureRows({ ...P, rows: 2, symmetry: 3 }).length).toBe(6);
  });

  it('edge anchors run monotonically along each spine and never duplicate an endpoint', () => {
    const paths = captureRows({ ...P, rows: 2, symmetry: 1 });
    const anchors = sampleEdgeAnchors(paths, { count: 12, includeEndpoints: false, idPrefix: 'edge' });
    expect(anchors.length).toBe(24);
    const byPath = new Map();
    for (const a of anchors) {
      const k = a.meta.pathIndex;
      if (!byPath.has(k)) byPath.set(k, []);
      byPath.get(k).push(a);
    }
    expect(byPath.size).toBe(2);
    for (const run of byPath.values()) {
      expect(run.length).toBe(12);
      for (let i = 1; i < run.length; i++) expect(run[i].s).toBeGreaterThan(run[i - 1].s);
      // includeEndpoints:false — no anchor sits on a terminus (that is the
      // `tip` role's territory).
      const len = run[run.length - 1].s + run[0].s;
      expect(run[0].s).toBeGreaterThan(0);
      expect(run[run.length - 1].s).toBeLessThan(len);
      // Every anchor carries a usable frame (tangent/normal are ANGLES) — the
      // payoff of the arc-length monotonicity guarantee. A zero-length segment
      // would yield NaN here, which is the failure this pattern is built to avoid.
      for (const a of run) {
        expect(Number.isFinite(a.tangent)).toBe(true);
        expect(Number.isFinite(a.normal)).toBe(true);
        expect(Math.abs(Math.abs(a.normal - a.tangent) - Math.PI / 2)).toBeLessThan(1e-9);
      }
    }
  });
});

describe('Rinceau — registration completeness (the add-a-pattern checklist)', () => {
  it('is in PATTERN_CLASSES and resolves through getPatternClass', () => {
    expect(PATTERN_CLASSES.rinceau).toBe(Rinceau);
    expect(getPatternClass('rinceau')).toBe(Rinceau);
  });

  it('is NOT in SEEDLESS_PATTERN_IDS — jitter reads the seed (the girih precedent)', () => {
    expect(SEEDLESS_PATTERN_IDS.has('rinceau')).toBe(false);
  });

  it('is a labelled PATTERN_TYPE with defaults, param defs, taxonomy and a unique symbol', () => {
    expect(PATTERN_TYPES.find((t) => t.id === 'rinceau')?.label).toBe('Rinceau');
    expect(Object.keys(DEFAULT_PARAMS.rinceau).length).toBeGreaterThan(0);
    expect(PATTERN_PARAM_DEFS.rinceau.length).toBeGreaterThan(0);

    const tax = PATTERN_TAXONOMY.rinceau;
    expect(PATTERN_FAMILIES[tax.family]).toBeTruthy();
    expect(SPATIAL_FORM_ROWS.some((r) => r.key === tax.form)).toBe(true);
    expect(tax.blurb).toBeTruthy();

    expect(PATTERN_SYMBOLS.rinceau).toBe('Ri');
    const codes = Object.values(PATTERN_SYMBOLS);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('every param def has a default, and every default a group', () => {
    for (const def of PATTERN_PARAM_DEFS.rinceau) {
      const keys = def.keys ?? [def.key];
      for (const k of keys) {
        // `offset` is the synthetic pad2d primary key; its real values are
        // offsetX/offsetY, which DEFAULT_PARAMS carries.
        if (k === 'offset') continue;
        expect(DEFAULT_PARAMS.rinceau, `no default for "${k}"`).toHaveProperty(k);
      }
      expect(PARAM_GROUP_MAP[def.key], `no group for "${def.key}"`).toBeTruthy();
    }
  });

  it('every select default is one of its own options, and every slider default in range', () => {
    for (const def of PATTERN_PARAM_DEFS.rinceau) {
      const v = DEFAULT_PARAMS.rinceau[def.key];
      if (def.type === 'select') {
        expect(def.options.map((o) => o.value), def.key).toContain(v);
      } else if (typeof def.min === 'number' && typeof v === 'number') {
        expect(v, `${def.key} below min`).toBeGreaterThanOrEqual(def.min);
        expect(v, `${def.key} above max`).toBeLessThanOrEqual(def.max);
      }
    }
  });

  it('is an EDGE motif host — never a semantic one — and defaults to the edge role', () => {
    expect(EDGE_MOTIF_HOSTS.has('rinceau')).toBe(true);
    expect(isEdgeHost('rinceau')).toBe(true);
    expect(isMotifHost('rinceau')).toBe(true);
    expect(defaultRolesForHost('rinceau')).toEqual(['edge']);
  });

  it('renders a non-empty picker thumbnail within the perf cap', () => {
    const t0 = Date.now();
    const svg = makePatternThumbnailSVG('rinceau');
    expect(Date.now() - t0).toBeLessThan(500);
    expect(svg).toBeTruthy();
    expect(svg).toContain('<polyline');
    expect(svg).not.toContain('NaN');
  });
});
