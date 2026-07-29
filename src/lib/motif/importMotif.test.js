// Unit tests for importMotif (WI-4) — SVG text → a custom-glyph object.
// Pure, node-testable: an SVG string in, a glyph (or an error) out.

import { describe, it, expect, vi } from 'vitest';
import { importMotif } from './importMotif.js';

// A sentinel `d` used by exactly one test (the non-finite-geometry guard).
// `flattenPathD` already refuses to push a point built from an unparseable
// coordinate, so the only way a non-finite point reaches the cloud in reality
// is arithmetic overflow inside the subdividers — reachable, but only via a
// `d` that flattens to ~16.7M points, which is not a unit test. The mock below
// injects the same condition for one specific `d` and passes every other call
// through to the real flattener untouched.
const NAN_BOMB = 'M0,0 L10,10 NANBOMB';

vi.mock('../plotter/pathOps.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    flattenPathD: (d, tol) =>
      typeof d === 'string' && d.includes('NANBOMB')
        ? { points: [[0, 0], [Number.NaN, 5], [10, 10]], closed: false }
        : actual.flattenPathD(d, tol),
  };
});

describe('importMotif — single-path SVG (slice 1)', () => {
  // A known axis-aligned box: verticies (10,10) (90,10) (90,90) (10,90),
  // closed. bbox = [10,90]×[10,90], so root = bbox bottom-center = (50, 90).
  // viewRadius = max dist(root, vertex): the two TOP corners (10,10)/(90,10)
  // are farthest at hypot(40,80) = sqrt(8000) ≈ 89.4427191.
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg"><path d="M10,10 L90,10 L90,90 L10,90 Z"/></svg>';

  it('returns ok:true with a single verbatim path', () => {
    const r = importMotif(svg);
    expect(r.ok).toBe(true);
    expect(r.glyph.paths).toEqual([{ d: 'M10,10 L90,10 L90,90 L10,90 Z', closed: true }]);
  });

  it('places root at the bbox bottom-center', () => {
    const { glyph } = importMotif(svg);
    expect(glyph.root).toEqual({ x: 50, y: 90, angle: 0 });
  });

  it('measures viewRadius from root to the farthest sampled point', () => {
    const { glyph } = importMotif(svg);
    expect(glyph.root.x).toBe(50);
    expect(glyph.viewRadius).toBeCloseTo(Math.sqrt(8000), 6);
  });

  it('tags the glyph tradition as imported and stamps NO id', () => {
    const { glyph } = importMotif(svg);
    expect(glyph.tradition).toBe('imported');
    expect(glyph).not.toHaveProperty('id');
    expect(typeof glyph.name).toBe('string');
    expect(glyph.name.length).toBeGreaterThan(0);
  });
});

describe('importMotif — multi-path SVG (slice 2)', () => {
  // Two open strokes: (0,0)-(20,0) and (10,30)-(30,30).
  // Union bbox = [0,30]×[0,30] → root = (15, 30). Farthest sampled point is
  // (0,0) at hypot(15,30) = sqrt(1125) ≈ 33.5410196.
  const svg =
    '<svg><path d="M0,0 L20,0"/><path d="M10,30 L30,30"/></svg>';

  it('keeps ALL paths verbatim in document order', () => {
    const { glyph } = importMotif(svg);
    expect(glyph.paths).toEqual([
      { d: 'M0,0 L20,0', closed: false },
      { d: 'M10,30 L30,30', closed: false },
    ]);
  });

  it('spans the bbox and measures root/viewRadius across the union', () => {
    const { glyph } = importMotif(svg);
    expect(glyph.root).toEqual({ x: 15, y: 30, angle: 0 });
    expect(glyph.viewRadius).toBeCloseTo(Math.sqrt(1125), 6);
  });
});

describe('importMotif — curved path (slice 3)', () => {
  // A quadratic that bulges to y=50 midway while both endpoints sit at y=0.
  const svg = '<svg><path d="M0,0 Q50,100 100,0"/></svg>';

  it('preserves the curve d VERBATIM (curves survive export)', () => {
    const { glyph } = importMotif(svg);
    expect(glyph.paths).toEqual([{ d: 'M0,0 Q50,100 100,0', closed: false }]);
  });

  it('bbox/root reflect the FLATTENED curve extent, not just endpoints', () => {
    const { glyph } = importMotif(svg);
    // Both endpoints are at y=0; the bottom (max y) is only reachable by
    // sampling the curve's bulge, so a >0 root.y proves the flattener ran.
    expect(glyph.root.x).toBe(50);
    expect(glyph.root.y).toBeGreaterThan(0);
    // viewRadius must cover the endpoints from the (50, ~50) root.
    expect(glyph.viewRadius).toBeGreaterThan(50);
  });
});

describe('importMotif — failure passthrough (slice 4)', () => {
  it('propagates the empty-input error', () => {
    const r = importMotif('');
    expect(r.ok).toBe(false);
    expect(typeof r.error).toBe('string');
    expect(r.error.length).toBeGreaterThan(0);
  });

  it('propagates the non-SVG error', () => {
    expect(importMotif('<html><body>nope</body></html>').ok).toBe(false);
  });

  it('propagates the no-drawable-geometry error (P5-3: rect now imports, so use an unsupported element)', () => {
    const r = importMotif('<svg><text>hello</text></svg>');
    expect(r.ok).toBe(false);
    expect(typeof r.error).toBe('string');
    expect(r.error.length).toBeGreaterThan(0);
  });

  it('tolerates null/undefined input without throwing', () => {
    expect(importMotif(null).ok).toBe(false);
    expect(importMotif(undefined).ok).toBe(false);
  });

  it('rejects a path whose d parses but yields no sampleable geometry', () => {
    // `d="Z"` survives parseSVGImport (non-empty) but flattens to zero points.
    const r = importMotif('<svg><path d="Z"/></svg>');
    expect(r.ok).toBe(false);
    expect(typeof r.error).toBe('string');
    expect(r.error.length).toBeGreaterThan(0);
  });
});

describe('importMotif — degenerate single-point guard (slice 5)', () => {
  it('gives a single-point path a small POSITIVE viewRadius', () => {
    const r = importMotif('<svg><path d="M5,5"/></svg>');
    expect(r.ok).toBe(true);
    expect(r.glyph.root).toEqual({ x: 5, y: 5, angle: 0 });
    expect(r.glyph.viewRadius).toBeGreaterThan(0);
  });
});

describe('importMotif — closed flag (slice 6)', () => {
  it('marks a Z-terminated path closed and an open path not', () => {
    const svg =
      '<svg><path d="M0,0 L10,0 L10,10 Z"/><path d="M0,0 L10,0 L10,10"/></svg>';
    const { glyph } = importMotif(svg);
    expect(glyph.paths[0].closed).toBe(true);
    expect(glyph.paths[1].closed).toBe(false);
  });
});

describe('importMotif — real-world fidelity: shapes + transforms (P5-3, slice 7)', () => {
  it('keeps an untransformed <path> d VERBATIM end-to-end (proof)', () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg"><path d="M10,10 L90,90 C100,50 50,0 10,10 Z"/></svg>';
    const { glyph } = importMotif(svg);
    expect(glyph.paths).toEqual([{ d: 'M10,10 L90,90 C100,50 50,0 10,10 Z', closed: true }]);
  });

  it('imports a basic <rect> as a closed motif path', () => {
    const svg = '<svg><rect x="0" y="0" width="20" height="10"/></svg>';
    const r = importMotif(svg);
    expect(r.ok).toBe(true);
    expect(r.glyph.paths).toEqual([{ d: 'M0,0 L20,0 L20,10 L0,10 Z', closed: true }]);
  });

  it('rewrites a transformed <path> d (no longer verbatim) and still measures a sane bbox/root', () => {
    const svg = '<svg><path d="M0,0 L10,0 L10,10 Z" transform="translate(100,0)"/></svg>';
    const { glyph } = importMotif(svg);
    expect(glyph.paths[0].d).not.toBe('M0,0 L10,0 L10,10 Z');
    expect(glyph.paths[0].d).toContain('M100.00,0.00');
    // root = bbox bottom-center, shifted by the translate.
    expect(glyph.root.x).toBeCloseTo(105, 6);
    expect(glyph.root.y).toBeCloseTo(10, 6);
  });

  it('imports a basic shape under a transform (rect + translate)', () => {
    const svg = '<svg><rect x="0" y="0" width="10" height="10" transform="translate(5,5)"/></svg>';
    const { glyph } = importMotif(svg);
    expect(glyph.paths[0].d).toContain('M5.00,5.00');
    expect(glyph.root.x).toBeCloseTo(10, 6);
    expect(glyph.root.y).toBeCloseTo(15, 6);
  });

  it('never throws on a weird/unparseable SVG and degrades gracefully', () => {
    const svg = '<svg><path d="M0,0 L1,1" transform="frobnicate(9)"/></svg>';
    expect(() => importMotif(svg)).not.toThrow();
    const r = importMotif(svg);
    expect(r.ok).toBe(true);
    // Unparseable transform => treated as identity => verbatim d.
    expect(r.glyph.paths).toEqual([{ d: 'M0,0 L1,1', closed: false }]);
  });
});

// ---------------------------------------------------------------------------
// #202 — the imported glyph measures its own footprint (§5c, decisions 2/2b)
// ---------------------------------------------------------------------------
// `footprintCenter`/`footprintRadius` are the MINIMAL ENCLOSING CIRCLE of the
// same point cloud `viewRadius` is measured from, expressed RELATIVE TO ROOT so
// they land in the frame `placementMatrix`'s trailing R(−root.angle)·T(−root)
// leaves the glyph in. Same algorithm, same frame and same root-relative
// convention as the 62 built-ins (`scripts/enrichVectorMotifFootprints.mjs`).
//
// ⚠️ ONE CONVENTION DELIBERATELY DIVERGES. The built-ins are measured at
// `flattenPathD` tol 0.05; an import reuses the cloud `viewRadius` is built
// from, which is tol 0.25 (`FLATTEN_TOL`). That is forced: #202 requires one
// cloud and two reductions, and requires `viewRadius` to be bit-unchanged, so
// the tolerance cannot move without moving `viewRadius`. Intra-glyph
// consistency is the property that matters — the engine normalises `fr` and
// `fc` by that record's OWN `viewRadius`, so mixing tolerances between the two
// would break `footprintRadius ≤ rootRadius` on a curve, which is the
// containment certificate decision 5-rev rests on.
describe('importMotif — the glyph measures its own footprint (#202)', () => {
  // Hand-computable, and free of any tolerance question because it is all
  // straight segments. Vertices (10,10) (90,10) (90,90) (10,90): the minimal
  // enclosing circle of a square is its circumcircle — centre (50,50), radius
  // hypot(40,40) = √3200 ≈ 56.5685. root = bbox bottom-centre = (50,90), so
  //   footprintCenter = (50−50, 50−90) = (0, −40)   EXACTLY
  //   footprintRadius = √3200
  // against viewRadius = √8000 ≈ 89.4427 from the same cloud.
  const SQUARE =
    '<svg xmlns="http://www.w3.org/2000/svg"><path d="M10,10 L90,10 L90,90 L10,90 Z"/></svg>';

  it('emits a footprint whose numbers are the hand-computed MEC of the square', () => {
    const { glyph } = importMotif(SQUARE);
    // Not {0,0}: the art hangs entirely to one side of the root, which is the
    // whole reason this PRD exists.
    expect(glyph.footprintCenter.x).toBe(0); // exact — the square is symmetric in x
    expect(glyph.footprintCenter.y).toBeCloseTo(-40, 9);
    expect(glyph.footprintRadius).toBeCloseTo(Math.sqrt(3200), 9);
  });

  it('leaves `root` and `viewRadius` exactly where they were — decision 2b, never substituted', () => {
    const { glyph } = importMotif(SQUARE);
    expect(glyph.root).toEqual({ x: 50, y: 90, angle: 0 });
    expect(glyph.viewRadius).toBeCloseTo(Math.sqrt(8000), 9);
    expect(glyph.footprintRadius).not.toBe(glyph.viewRadius);
  });

  // The two invariants that catch a FRAME or UNITS bug without re-running the
  // measurement, borrowed verbatim from `glyphFootprint.test.js`. For an import
  // `viewRadius` IS the freshly-measured max distance from root over the same
  // cloud (never a rounded literal, which is why `leaf` fails the second one in
  // the built-in suite), so it can stand in for `rootRadius` here.
  const FIXTURES = {
    square: SQUARE,
    'multi-path': '<svg><path d="M0,0 L10,0 L10,10 Z"/><path d="M20,20 L30,20 L30,30 Z"/></svg>',
    curve: '<svg><path d="M0,0 Q50,100 100,0"/></svg>',
    rect: '<svg><rect x="0" y="0" width="20" height="10"/></svg>',
    'off-centre': '<svg><path d="M100,0 L140,0 L140,40 L100,40 Z"/></svg>',
  };

  it.each(Object.keys(FIXTURES))(
    '%s: the tight circle nests inside the root disc and still reaches the farthest point',
    (name) => {
      const { glyph } = importMotif(FIXTURES[name]);
      const { x, y } = glyph.footprintCenter;
      expect(Number.isFinite(x) && Number.isFinite(y)).toBe(true);
      expect(Number.isFinite(glyph.footprintRadius)).toBe(true);
      expect(glyph.footprintRadius).toBeGreaterThan(0);
      // fr ≤ rootRadius — the MINIMAL circle can never beat the root-centred one.
      expect(glyph.footprintRadius).toBeLessThanOrEqual(glyph.viewRadius + 1e-9);
      // Strictly smaller, in fact, for any glyph whose root is not its centre.
      expect(glyph.footprintRadius).toBeLessThan(glyph.viewRadius);
      // |fc| + fr ≥ rootRadius — the triangle inequality. A circle measured in
      // the wrong frame (e.g. absolute instead of root-relative) fails here.
      expect(Math.hypot(x, y) + glyph.footprintRadius).toBeGreaterThanOrEqual(
        glyph.viewRadius - 1e-9
      );
    }
  );

  it('is reproducible: the same SVG string twice yields Object.is-identical numbers', () => {
    const a = importMotif(SQUARE).glyph;
    const b = importMotif(SQUARE).glyph;
    expect(Number.isFinite(a.footprintRadius)).toBe(true); // not vacuously true
    expect(Object.is(a.footprintCenter.x, b.footprintCenter.x)).toBe(true);
    expect(Object.is(a.footprintCenter.y, b.footprintCenter.y)).toBe(true);
    expect(Object.is(a.footprintRadius, b.footprintRadius)).toBe(true);
  });

  it('clamps a single-point import to MIN_VIEW_RADIUS rather than a zero reserve', () => {
    const { glyph } = importMotif('<svg><path d="M5,5"/></svg>');
    // A zero `fr` is legal arithmetic — it just describes a POINT reserve, and
    // would let a degenerate import claim nothing and stack on its neighbours.
    // Same clamp, same rationale, adjacent lines to `viewRadius`'s.
    expect(glyph.footprintRadius).toBe(0.5);
    expect(glyph.footprintCenter).toEqual({ x: 0, y: 0 });
    expect(glyph.viewRadius).toBe(0.5);
  });

  it('rejects non-finite geometry instead of handing Welzl a poisoned cloud', () => {
    // #198: `minEnclosingCircle` SWALLOWS an interior NaN — `inCirc` reads
    // `NaN <= r` as false, so the point is "not contained", `circ2`/`circ3`
    // propagate the NaN into the circle, and a later real point silently
    // replaces it. The result is a plausible-looking circle, no throw. So the
    // cloud is validated explicitly, on the way in.
    const r = importMotif(`<svg><path d="${NAN_BOMB}"/></svg>`);
    expect(r.ok).toBe(false);
    expect(typeof r.error).toBe('string');
    expect(r.error.length).toBeGreaterThan(0);
  });

  it('still short-circuits an empty cloud before calling into Welzl', () => {
    const r = importMotif('<svg><path d="Z"/></svg>');
    expect(r.ok).toBe(false);
    expect(r.glyph).toBeUndefined();
  });
});
