import { describe, it, expect } from 'vitest';
import { MOTIF_GLYPHS, getGlyph } from './glyphs.js';
import { parsePathD } from '../plotter/pathOps.js';

const TOL = 1e-6;

// Does every vertex have an x-negated mirror also present among the vertices
// (within `tol`)? Symmetric shapes (e.g. a square centered at the origin)
// answer true for every point; an asymmetric shape has at least one vertex
// with no mirror partner.
function isXMirrorSymmetric(points, tol = 1e-6) {
  return points.every(([x, y]) =>
    points.some(([mx, my]) => Math.abs(mx - -x) <= tol && Math.abs(my - y) <= tol)
  );
}

// y-mirror symmetry: does every vertex have a y-negated partner (x, -y)? This is
// mirror across the leaf's MIDRIB (the +x growth axis). It is the asymmetry that
// matters after the base-at-origin reframe (see the "hanging blade" block below):
// `flip` is local (x,y)→(−x,y); a 180° turn is (x,y)→(−x,−y). They differ ONLY by
// y-negation, so they are visually identical IFF the leaf is y-mirror-symmetric.
// A y-asymmetric leaf is therefore what makes the Vine's 180° alternation read as
// distinct from a plain flip — the whole point of Majed asking for 180°, not flip.
function isYMirrorSymmetric(points, tol = 1e-6) {
  return points.every(([x, y]) =>
    points.some(([mx, my]) => Math.abs(mx - x) <= tol && Math.abs(my - -y) <= tol)
  );
}

describe('getGlyph', () => {
  it('returns the leaf glyph', () => {
    expect(getGlyph('leaf')).toBeDefined();
    expect(getGlyph('leaf')).toBe(MOTIF_GLYPHS.leaf);
  });

  it('returns undefined for an unknown id', () => {
    expect(getGlyph('does-not-exist')).toBeUndefined();
  });

  // Document-aware resolution (WI-3): a 2nd `customGlyphs` map argument lets the
  // built-in library be extended per-document. Built-ins ALWAYS win; the custom
  // map is only consulted for ids the built-in library doesn't own.
  describe('document-aware (customGlyphs)', () => {
    const custom = {
      cg1: { id: 'cg1', name: 'Imported', paths: [{ d: 'M0,0 L1,0 L1,1 Z', closed: true }], viewRadius: 1 },
    };

    it('resolves a custom glyph from the customGlyphs map', () => {
      expect(getGlyph('cg1', custom)).toBe(custom.cg1);
    });

    it('built-in wins over the custom map for the same id', () => {
      const shadow = { leaf: { id: 'leaf', name: 'Fake', paths: [], viewRadius: 1 } };
      expect(getGlyph('leaf', shadow)).toBe(MOTIF_GLYPHS.leaf);
    });

    it('built-in still resolves by exact reference with a customGlyphs arg present', () => {
      expect(getGlyph('leaf', custom)).toBe(MOTIF_GLYPHS.leaf);
    });

    it('unknown id with a customGlyphs map returns undefined', () => {
      expect(getGlyph('nope', custom)).toBeUndefined();
    });

    it('back-compat: single-arg call is unchanged (no crash, built-in or undefined)', () => {
      expect(getGlyph('cg1')).toBeUndefined();
      expect(getGlyph('leaf')).toBe(MOTIF_GLYPHS.leaf);
    });

    it('tolerates a null/undefined customGlyphs map', () => {
      expect(getGlyph('cg1', null)).toBeUndefined();
      expect(getGlyph('cg1', undefined)).toBeUndefined();
    });
  });
});

describe('leaf glyph shape', () => {
  const glyph = getGlyph('leaf');

  it('has a positive viewRadius', () => {
    expect(glyph.viewRadius).toBeGreaterThan(0);
  });

  it('every path has a non-empty d string', () => {
    expect(glyph.paths.length).toBeGreaterThan(0);
    for (const p of glyph.paths) {
      expect(typeof p.d).toBe('string');
      expect(p.d.length).toBeGreaterThan(0);
    }
  });

  it('is NOT x-mirror-symmetric (flip-observability contract)', () => {
    // NOTE (2026-07 base-at-origin redesign): now trivially true — the blade is
    // one-sided (all vertices x>0), so no (−x,y) partner can exist. Flip
    // observability is guaranteed by that one-sidedness alone. The MEANINGFUL
    // contract (what distinguishes a 180° turn from a flip) is the midrib
    // y-asymmetry asserted in the "hanging blade" block below.
    const allPoints = glyph.paths.flatMap((p) => parsePathD(p.d).points);
    expect(allPoints.length).toBeGreaterThan(0);
    expect(isXMirrorSymmetric(allPoints, TOL)).toBe(false);
  });

  it('sanity: the symmetry helper is not vacuous — a genuinely symmetric shape passes as symmetric', () => {
    // A square centered at the origin IS symmetric under x -> -x.
    const square = parsePathD('M-5,-5 L5,-5 L5,5 L-5,5 Z').points;
    expect(isXMirrorSymmetric(square, TOL)).toBe(true);
  });

  it('every vertex fits within the bounding circle described by viewRadius', () => {
    const allPoints = glyph.paths.flatMap((p) => parsePathD(p.d).points);
    for (const [x, y] of allPoints) {
      expect(Math.hypot(x, y)).toBeLessThanOrEqual(glyph.viewRadius + 1e-6);
    }
  });
});

// ── Leaf coordinate contract (design 2026-07: base-at-origin hanging blade) ──
//
// COORDINATE STORY (verified against instancing.placementMatrix + placementEngine
// orientation policy 'path'+useNormal:true, the app default in starterChips
// PLACEMENT):
//   • placement.rotation (deg) = deg(anchor.normal) for orientation policy 'path',
//     useNormal:true (see placementEngine.test.js "path policy uses normal").
//   • instancing core matrix maps local (1,0) → (cosθ, sinθ) with θ=rotation, so
//     glyph-space **+x points OFF the line, along the path NORMAL**; glyph-space
//     +y runs ALONG the line (the tangent).
//   • `flip` is x-negation (instancing folds it into sx): local (x,y)→(−x,y),
//     which swings the whole blade to the OTHER side of the line.
//
// A real leaf grows FROM the line: the stem sits ON the line (at the anchor =
// glyph origin) and the blade hangs off ONE side. So the re-authored leaf puts
// its base vertex at (0,0) and every other vertex strictly at x>0 (the blade
// extends along +x, off the line). The deliberate asymmetry is now across the
// midrib (y-axis of the shape), so a 180° turn reads differently from a flip.
describe('leaf glyph — base-at-origin hanging blade (design 2026-07)', () => {
  const glyph = getGlyph('leaf');
  const points = glyph.paths.flatMap((p) => parsePathD(p.d).points);

  it('starts its base/stem vertex exactly at the origin (sits ON the line)', () => {
    const [bx, by] = points[0];
    expect(bx).toBeCloseTo(0, 9);
    expect(by).toBeCloseTo(0, 9);
  });

  it('has the base as its ONLY on-axis vertex — every other vertex hangs off one side (x>0)', () => {
    // The blade extends along +x (the off-line NORMAL direction). Exactly one
    // vertex sits on the line (x==0, the base); all others are strictly x>0, so
    // the whole blade hangs off a single side of the host line.
    const onAxis = points.filter(([x]) => Math.abs(x) <= TOL);
    expect(onAxis).toHaveLength(1);
    for (const [x] of points.slice(1)) {
      expect(x).toBeGreaterThan(TOL);
    }
  });

  it('preserves a deliberate midrib asymmetry (NOT y-mirror-symmetric)', () => {
    // The asymmetry that makes the Vine's 180° alternation distinguishable from a
    // plain x-flip (see isYMirrorSymmetric comment). One flank bulges wider.
    expect(isYMirrorSymmetric(points, TOL)).toBe(false);
  });

  it('blade length regression: farthest vertex ≈20 units (matches the old ±10 leaf overall size), viewRadius covers it', () => {
    const maxDist = Math.max(...points.map(([x, y]) => Math.hypot(x, y)));
    expect(maxDist).toBeGreaterThan(18);
    expect(maxDist).toBeLessThan(22);
    // viewRadius is the bounding-circle radius: it must cover the farthest vertex.
    expect(glyph.viewRadius).toBeGreaterThanOrEqual(maxDist);
  });
});

describe('MOTIF_GLYPHS registry', () => {
  it('has exactly 4 entries', () => {
    expect(Object.keys(MOTIF_GLYPHS).length).toBe(4);
  });
});

describe.each(['dot', 'diamond', 'rosette'])('%s glyph shape', (id) => {
  const glyph = getGlyph(id);

  it('exists', () => {
    expect(glyph).toBeDefined();
  });

  it('has a positive viewRadius', () => {
    expect(glyph.viewRadius).toBeGreaterThan(0);
  });

  it('every path has a non-empty d string', () => {
    expect(glyph.paths.length).toBeGreaterThan(0);
    for (const p of glyph.paths) {
      expect(typeof p.d).toBe('string');
      expect(p.d.length).toBeGreaterThan(0);
    }
  });

  it('every vertex fits within the bounding circle described by viewRadius', () => {
    const allPoints = glyph.paths.flatMap((p) => parsePathD(p.d).points);
    expect(allPoints.length).toBeGreaterThan(0);
    for (const [x, y] of allPoints) {
      expect(Math.hypot(x, y)).toBeLessThanOrEqual(glyph.viewRadius + 1e-6);
    }
  });
});
