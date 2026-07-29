import { describe, it, expect } from 'vitest';
import MagneticScroll, { buildScrollTraces, traceVolute } from '../MagneticScroll.js';
import { RecordingContext, Pattern } from '../drawingContext.js';
import { makePatternThumbnailSVG } from '../../patternThumbnail.js';
import { DEFAULT_PARAMS, PATTERN_TYPES, PATTERN_TAXONOMY, PATTERN_SYMBOLS, PATTERN_PARAM_DEFS } from '../../../constants.js';
import { PATTERN_CLASSES, getPatternClass, patternUsesSeed } from '../index.js';
import { EDGE_MOTIF_HOSTS, isEdgeHost, isSemanticHost, isMotifHost, defaultRolesForHost } from '../../motif/hostKinds.js';

// Headless characterization of MagneticScroll (Xu & Mould magnetic curves as an
// islimi scroll field). Under RecordingContext ctx.random() is a deterministic
// mulberry32 stream, so the whole field is reproducible. This locks the LOGIC —
// the volute geometry (openness, turning, tip-at-the-eye), determinism, canvas
// == SVG parity, symmetry wiring and registration — not production p5 bytes.

const SEED = 7;
const BASE = DEFAULT_PARAMS.magnetscroll;
const COLOR = '#224488';
const OPACITY = 80;
const W = 900;
const H = 700;

function run(params = BASE, seed = SEED) {
  const inst = new MagneticScroll();
  const ctx = new RecordingContext({ seed });
  inst.generateWithContext(ctx, seed, params, W, H, COLOR, OPACITY);
  return { inst, ctx };
}

/** Deterministic uniform source, so helper-level tests need no ctx at all. */
function fixedRand(seed = 1) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const traces = (params = BASE) => buildScrollTraces(params, W, H, fixedRand());

/** Signed total turning of a polyline, in radians. Sign = coil handedness. */
function signedTurning(pts) {
  let total = 0;
  let prev = null;
  for (let i = 1; i < pts.length; i++) {
    const a = Math.atan2(pts[i].y - pts[i - 1].y, pts[i].x - pts[i - 1].x);
    if (prev !== null) {
      let d = a - prev;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      total += d;
    }
    prev = a;
  }
  return total;
}

/** Half the bounding-box diagonal — the trace's own scale. */
function boundingRadius(pts) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of pts) {
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
  }
  return Math.hypot(maxX - minX, maxY - minY) / 2;
}

/** Max distance from `origin` over the LAST `frac` of the polyline. */
function tailSpread(pts, frac) {
  const from = Math.floor(pts.length * (1 - frac));
  const tip = pts[pts.length - 1];
  let d = 0;
  for (let i = from; i < pts.length; i++) d = Math.max(d, Math.hypot(pts[i].x - tip.x, pts[i].y - tip.y));
  return d;
}

describe('MagneticScroll — volute geometry', () => {
  it('extends the shared Pattern base', () => {
    expect(new MagneticScroll()).toBeInstanceOf(Pattern);
  });

  it('emits ONE OPEN polyline per trace — beginShape/vertex/endShape, never CLOSE', () => {
    const { inst, ctx } = run();
    const begins = ctx.calls.filter((c) => c.op === 'beginShape');
    const ends = ctx.calls.filter((c) => c.op === 'endShape');
    expect(begins.length).toBe(inst.svgElements.length);
    expect(ends.length).toBe(inst.svgElements.length);
    // The whole point: a closed volute has no tip, and the tip is where the
    // vine's Apex flower goes. endShape must be called with NO arguments.
    for (const e of ends) expect(e.args.length).toBe(0);
    // …and the SVG side must not close either.
    for (const el of inst.svgElements) expect(el).not.toMatch(/[Zz]"/);
  });

  it('every trace turns far enough to READ as a volute (> 1.5 turns)', () => {
    const MIN = 1.5 * Math.PI * 2;
    for (const tr of traces()) {
      expect(Math.abs(signedTurning(tr))).toBeGreaterThan(MIN);
    }
  });

  it('total turning matches the `turns` param (the integrator is exact, not approximate)', () => {
    // Every Euler step turns the heading by exactly Φ/steps, so the summed
    // turning is Φ minus the half-step at each end. A drift here means the
    // angle-space reparameterisation (κ(u) = κ₀(1−u)^−β) has been broken.
    for (const turns of [1, 2.25, 4]) {
      const tr = traceVolute({ x0: 0, y0: 0, heading0: 0, sign: 1, radius: 60, turns, alpha: 0.55 });
      expect(signedTurning(tr)).toBeCloseTo(turns * Math.PI * 2, 0);
    }
  });

  // THE contract the vine feature rests on, checked at every CORNER of the
  // declared (taper × turns) range rather than only at the defaults. If the
  // charge decay were the wrong way round (curvature falling instead of rising)
  // the eye would sit at the ROOT and the tip would fly outward — the pattern
  // would still render, and every other test in this file would still pass.
  //
  // Convergence is driven by β = α/(1−α) and degrades as `turns` rises, so the
  // binding corner is (taper MIN, turns MAX). That corner is why the taper
  // slider starts at 0.5: at 0.1 the last tenth of the trace spans ~1.0× the
  // bounding radius (no eye at all) and the root sits 0.27× from the tip.
  const TAPER_MIN = 0.5;
  const TAPER_MAX = 0.9;
  const TURNS_MIN = 0.75;
  const TURNS_MAX = 5;
  for (const taper of [TAPER_MIN, TAPER_MAX]) {
    for (const turns of [TURNS_MIN, TURNS_MAX]) {
      it(`the TIP is the eye of the volute, and the root is not (taper ${taper}, turns ${turns})`, () => {
        const field = traces({ ...BASE, taper, turns });
        expect(field.length).toBeGreaterThan(0);
        for (const tr of field) {
          const R = boundingRadius(tr);
          const tip = tr[tr.length - 1];
          const root = tr[0];
          // The last tenth of the trace is wound into a disc far smaller than
          // the scroll: it has converged onto a point.
          expect(tailSpread(tr, 0.1) / R).toBeLessThan(0.12);
          // …and the root is nowhere near it.
          expect(Math.hypot(root.x - tip.x, root.y - tip.y) / R).toBeGreaterThan(0.6);
        }
      });
    }
  }

  it('the declared taper range is exactly the range where the eye closes', () => {
    // Guards the slider min against being "opened up" later: at α = 0.1 the
    // tip demonstrably lands on an outer coil, which would silently break every
    // Apex placement without failing any other assertion here.
    const openCoil = traceVolute({ x0: 0, y0: 0, heading0: 0, sign: 1, radius: 60, turns: TURNS_MAX, alpha: 0.1 });
    expect(tailSpread(openCoil, 0.1) / boundingRadius(openCoil)).toBeGreaterThan(0.5);

    const def = PATTERN_PARAM_DEFS.magnetscroll.find((d) => d.key === 'taper');
    expect(def.min).toBe(TAPER_MIN);
    expect(def.max).toBe(TAPER_MAX);
    const turnsDef = PATTERN_PARAM_DEFS.magnetscroll.find((d) => d.key === 'turns');
    expect(turnsDef.min).toBe(TURNS_MIN);
    expect(turnsDef.max).toBe(TURNS_MAX);
  });

  it('coordinates stay finite and bounded to the canvas neighbourhood', () => {
    for (const params of [BASE, { ...BASE, layout: 'grid' }, { ...BASE, layout: 'scatter' }]) {
      for (const tr of buildScrollTraces(params, W, H, fixedRand())) {
        for (const p of tr) {
          expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true);
          expect(Math.abs(p.x)).toBeLessThan(W);
          expect(Math.abs(p.y)).toBeLessThan(H);
        }
      }
    }
  });

  it('α = 0 degenerates to the undecayed magnetic circle (constant curvature)', () => {
    const R = 50;
    const tr = traceVolute({ x0: 0, y0: 0, heading0: 0, sign: 1, radius: R, turns: 1, alpha: 0 });
    // Every point sits on a circle of radius R about the centre of curvature,
    // which for heading0 = 0 and sign = +1 is (0, R).
    for (const p of tr) expect(Math.hypot(p.x - 0, p.y - R)).toBeCloseTo(R, 1);
  });
});

describe('MagneticScroll — composition', () => {
  it('trace count is scrollCount, doubled when the secondary scroll is on', () => {
    const single = traces({ ...BASE, branch: 'single', scrollCount: 8 });
    const paired = traces({ ...BASE, branch: 'paired', scrollCount: 8 });
    expect(single.length).toBe(8);
    expect(paired.length).toBe(16);
  });

  it('counter-rotation ALTERNATES the coil handedness seed to seed', () => {
    const tr = traces({ ...BASE, branch: 'single', rotation: 'alternate', scrollCount: 8, jitter: 0 });
    const signs = tr.map((t) => Math.sign(signedTurning(t)));
    expect(signs).toEqual([1, -1, 1, -1, 1, -1, 1, -1]);
    // Proved, not asserted: equal and opposite ⇒ the field's net turning is nil.
    const net = tr.reduce((s, t) => s + signedTurning(t), 0);
    expect(Math.abs(net)).toBeLessThan(0.5);
  });

  it('rotation "uniform" coils every scroll the same way', () => {
    const tr = traces({ ...BASE, branch: 'single', rotation: 'uniform', scrollCount: 6, jitter: 0 });
    const signs = tr.map((t) => Math.sign(signedTurning(t)));
    expect(signs).toEqual([1, 1, 1, 1, 1, 1]);
  });

  it('the secondary scroll counter-rotates against its parent and is smaller', () => {
    const tr = traces({ ...BASE, branch: 'paired', scrollCount: 4, jitter: 0, branchScale: 0.5 });
    for (let i = 0; i < tr.length; i += 2) {
      const parent = tr[i];
      const child = tr[i + 1];
      expect(Math.sign(signedTurning(parent))).toBe(-Math.sign(signedTurning(child)));
      expect(boundingRadius(child)).toBeLessThan(boundingRadius(parent));
    }
  });

  it('the secondary springs FROM the parent — its root is a point on the parent', () => {
    const tr = traces({ ...BASE, branch: 'paired', scrollCount: 2, jitter: 0 });
    for (let i = 0; i < tr.length; i += 2) {
      const root = tr[i + 1][0];
      const near = Math.min(...tr[i].map((p) => Math.hypot(p.x - root.x, p.y - root.y)));
      expect(near).toBeLessThan(1e-6);
    }
  });

  it('each layout produces the requested number of scrolls', () => {
    for (const layout of ['row', 'grid', 'scatter']) {
      const tr = traces({ ...BASE, layout, branch: 'single', scrollCount: 9 });
      expect(tr.length, layout).toBe(9);
      expect(tr.every((t) => t.length > 2), layout).toBe(true);
    }
  });

  it('the field is centred on the origin whatever the layout', () => {
    // Volutes grow to ONE side of their seed, so an uncentred row would slide a
    // full scroll-width off the canvas.
    for (const layout of ['row', 'grid', 'scatter']) {
      const all = traces({ ...BASE, layout }).flat();
      const xs = all.map((p) => p.x);
      const ys = all.map((p) => p.y);
      expect(Math.abs((Math.min(...xs) + Math.max(...xs)) / 2), layout).toBeLessThan(1e-6);
      expect(Math.abs((Math.min(...ys) + Math.max(...ys)) / 2), layout).toBeLessThan(1e-6);
    }
  });

  it('scrollRadius scales the volute, turns lengthens it', () => {
    const small = boundingRadius(traces({ ...BASE, scrollCount: 1, branch: 'single', jitter: 0, scrollRadius: 40 })[0]);
    const big = boundingRadius(traces({ ...BASE, scrollCount: 1, branch: 'single', jitter: 0, scrollRadius: 120 })[0]);
    expect(big).toBeGreaterThan(small * 2);

    const few = traces({ ...BASE, turns: 1 })[0].length;
    const many = traces({ ...BASE, turns: 5 })[0].length;
    expect(many).toBeGreaterThan(few);
  });

  it('higher taper winds into its eye sooner — a longer stem, a tighter curl', () => {
    // α controls where the turning is SPENT, not how much of it there is: total
    // arc length falls with α while total turning is unchanged.
    const len = (a) => {
      const tr = traceVolute({ x0: 0, y0: 0, heading0: 0, sign: 1, radius: 60, turns: 3, alpha: a });
      let s = 0;
      for (let i = 1; i < tr.length; i++) s += Math.hypot(tr[i].x - tr[i - 1].x, tr[i].y - tr[i - 1].y);
      return s;
    };
    expect(len(0.85)).toBeLessThan(len(0.5));
  });
});

describe('MagneticScroll — determinism, SVG parity, symmetry', () => {
  it('is deterministic across runs with the same seed', () => {
    expect(run().inst.svgElements).toEqual(run().inst.svgElements);
  });

  it('different seeds change the output', () => {
    expect(run(BASE, 7).inst.svgElements).not.toEqual(run(BASE, 99).inst.svgElements);
  });

  it('is registered as seed-USING (jitter consumes the stream)', () => {
    expect(patternUsesSeed('magnetscroll')).toBe(true);
  });

  it('CANVAS == SVG — the drawn vertices are exactly the <path> coordinates', () => {
    const { inst, ctx } = run();
    // Rebuild the polylines from the recorded draw stream…
    const drawn = [];
    let cur = null;
    for (const c of ctx.calls) {
      if (c.op === 'beginShape') cur = [];
      else if (c.op === 'vertex' && cur) cur.push([c.args[0], c.args[1]]);
      else if (c.op === 'endShape' && cur) { drawn.push(cur); cur = null; }
    }
    // …and from the emitted SVG, and compare at the SVG's 2-dp precision.
    const fromSVG = inst.svgElements.map((el) =>
      el.match(/ d="([^"]+)"/)[1].slice(1).split(/ L/).map((p) => p.split(',').map(Number))
    );
    expect(fromSVG.length).toBe(drawn.length);
    // `+ 0` collapses -0 to 0: rounding a tiny negative coordinate gives -0,
    // which Number#toString writes as "0" and parseFloat reads back as +0. The
    // SVG is correct; only the comparison needs the normalisation.
    const round = (v) => Math.round(v * 100) / 100 + 0;
    for (let i = 0; i < drawn.length; i++) {
      expect(fromSVG[i]).toEqual(drawn[i].map(([x, y]) => [round(x), round(y)]));
    }
  });

  it('emits valid open <path> SVG', () => {
    const el = run().inst.svgElements[0];
    expect(el).toMatch(/^<path d="M-?[\d.]+,-?[\d.]+( L-?[\d.]+,-?[\d.]+)+" stroke=".*" fill="none" stroke-width=".*" stroke-linecap="round"\/>$/);
  });

  it('the wrapped SVG group honors the real symmetry param', () => {
    const single = run({ ...BASE, symmetry: 1 }).inst.toSVGGroup('L1', COLOR, OPACITY);
    const hex = run({ ...BASE, symmetry: 6 }).inst.toSVGGroup('L1', COLOR, OPACITY);
    expect((single.match(/<g transform="translate/g) || []).length).toBe(1);
    expect((hex.match(/<g transform="translate/g) || []).length).toBe(6);
    expect(hex).toContain('rotate(60)');
  });

  it('generates the default field, and a heavy one, fast', () => {
    const t0 = Date.now();
    run();
    expect(Date.now() - t0).toBeLessThan(2000);

    const t1 = Date.now();
    const { inst } = run({ ...BASE, scrollCount: 48, turns: 5 });
    expect(inst.svgElements.length).toBeGreaterThan(50);
    expect(Date.now() - t1).toBeLessThan(5000);
  });

  it('renders a picker thumbnail within the perf cap', () => {
    const t0 = Date.now();
    const svg = makePatternThumbnailSVG('magnetscroll');
    const ms = Date.now() - t0;
    expect(svg).toBeTruthy();
    expect(svg).toContain('<path');
    expect(svg).not.toContain('NaN');
    // No THUMBNAIL_PARAM_OVERRIDES entry: the default field is ~4.6k vertices at
    // THUMB_GEN, lighter than flowfield's capped 14k. Guard that it stays so.
    expect((svg.match(/ L/g) || []).length).toBeLessThan(12000);
    expect(ms).toBeLessThan(2000);
  });
});

describe('MagneticScroll — registration completeness', () => {
  it('is in PATTERN_CLASSES and resolvable by id', () => {
    expect(PATTERN_CLASSES.magnetscroll).toBe(MagneticScroll);
    expect(getPatternClass('magnetscroll')).toBe(MagneticScroll);
  });

  it('has a PATTERN_TYPES entry, defaults, param defs, taxonomy and a unique symbol', () => {
    expect(PATTERN_TYPES.some((t) => t.id === 'magnetscroll')).toBe(true);
    expect(Object.keys(DEFAULT_PARAMS.magnetscroll ?? {}).length).toBeGreaterThan(0);
    expect((PATTERN_PARAM_DEFS.magnetscroll ?? []).length).toBeGreaterThan(0);
    expect(PATTERN_TAXONOMY.magnetscroll).toBeTruthy();
    expect(PATTERN_SYMBOLS.magnetscroll).toBe('Ms');
    const symbols = Object.values(PATTERN_SYMBOLS);
    expect(new Set(symbols).size).toBe(symbols.length);
  });

  it('every declared param def has a matching default (and vice versa)', () => {
    const defaults = DEFAULT_PARAMS.magnetscroll;
    for (const def of PATTERN_PARAM_DEFS.magnetscroll) {
      for (const key of def.keys || [def.key]) {
        expect(defaults[key], `no default for param "${key}"`).toBeDefined();
      }
    }
    const declared = new Set(PATTERN_PARAM_DEFS.magnetscroll.flatMap((d) => d.keys || [d.key]));
    for (const key of Object.keys(defaults)) {
      expect(declared.has(key), `default "${key}" has no param def`).toBe(true);
    }
  });

  it('every slider default sits inside its declared range', () => {
    const defaults = DEFAULT_PARAMS.magnetscroll;
    for (const def of PATTERN_PARAM_DEFS.magnetscroll) {
      const min = def.min ?? def.range?.min;
      const max = def.max ?? def.range?.max;
      if (min == null || max == null) continue;
      for (const key of def.keys || [def.key]) {
        expect(defaults[key], `${key} below min`).toBeGreaterThanOrEqual(min);
        expect(defaults[key], `${key} above max`).toBeLessThanOrEqual(max);
      }
    }
  });

  it('every select default is one of its declared options', () => {
    const defaults = DEFAULT_PARAMS.magnetscroll;
    for (const def of PATTERN_PARAM_DEFS.magnetscroll) {
      if (def.type !== 'select') continue;
      expect(def.options.map((o) => o.value)).toContain(defaults[def.key]);
    }
  });

  it('is an EDGE motif host defaulting to the edge role — never semantic', () => {
    expect(EDGE_MOTIF_HOSTS.has('magnetscroll')).toBe(true);
    expect(isEdgeHost('magnetscroll')).toBe(true);
    expect(isEdgeHost('magnetscroll', {})).toBe(true);
    expect(isSemanticHost('magnetscroll')).toBe(false);
    expect(isMotifHost('magnetscroll')).toBe(true);
    expect(defaultRolesForHost('magnetscroll')).toEqual(['edge']);
  });
});
