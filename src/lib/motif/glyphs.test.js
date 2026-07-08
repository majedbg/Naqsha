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
