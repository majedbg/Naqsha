import { describe, it, expect } from 'vitest';
import {
  splitGroup,
  renderPaths,
  optimizeGroup,
  parseTransformAttr,
  formatSeconds,
} from '../pipeline.js';

// ---------------------------------------------------------------------------
// parseTransformAttr — affine matrix helpers
// ---------------------------------------------------------------------------
describe('parseTransformAttr', () => {
  it('returns identity for null/empty input', () => {
    const M = parseTransformAttr(null);
    expect(M).toEqual([1, 0, 0, 1, 0, 0]);
    expect(parseTransformAttr('')).toEqual([1, 0, 0, 1, 0, 0]);
  });

  it('parses translate(tx, ty)', () => {
    const M = parseTransformAttr('translate(10, 20)');
    // Identity with translation: [1,0,0,1, tx, ty]
    expect(M[4]).toBeCloseTo(10, 10);
    expect(M[5]).toBeCloseTo(20, 10);
    expect(M[0]).toBeCloseTo(1, 10);
    expect(M[3]).toBeCloseTo(1, 10);
  });

  it('parses scale(sx)', () => {
    const M = parseTransformAttr('scale(2)');
    expect(M[0]).toBeCloseTo(2, 10); // sx
    expect(M[3]).toBeCloseTo(2, 10); // sy (uniform)
    expect(M[4]).toBe(0);
  });

  it('parses scale(sx, sy) non-uniform', () => {
    const M = parseTransformAttr('scale(3, 0.5)');
    expect(M[0]).toBeCloseTo(3, 10);
    expect(M[3]).toBeCloseTo(0.5, 10);
  });

  it('parses rotate(angle) — 90 degrees', () => {
    const M = parseTransformAttr('rotate(90)');
    // [cos90, sin90, -sin90, cos90, 0, 0] = [0, 1, -1, 0, 0, 0]
    expect(M[0]).toBeCloseTo(0, 10);  // cos90
    expect(M[1]).toBeCloseTo(1, 10);  // sin90
    expect(M[2]).toBeCloseTo(-1, 10); // -sin90
    expect(M[3]).toBeCloseTo(0, 10);  // cos90
  });

  it('parses rotate(angle, cx, cy) — rotate-with-pivot', () => {
    // Rotate 90° around (5,5): a point at (5,0) should map to (10,5)
    const M = parseTransformAttr('rotate(90, 5, 5)');
    // Apply to (5, 0): x' = M[0]*5 + M[2]*0 + M[4], y' = M[1]*5 + M[3]*0 + M[5]
    const xOut = M[0] * 5 + M[2] * 0 + M[4];
    const yOut = M[1] * 5 + M[3] * 0 + M[5];
    expect(xOut).toBeCloseTo(10, 8);
    expect(yOut).toBeCloseTo(5, 8);
  });

  it('composes translate then rotate in correct order (characterization)', () => {
    // translate(5,0) then rotate(90): SVG/CSS convention — transforms applied
    // right-to-left to coordinates. The effective mapping: rotate(90°) the
    // coordinate system, then translate(5,0) within that system.
    //
    // Applying the composed matrix to (1,0):
    //   After multiply(translate, rotate): M = [0,1,-1,0,5,0]
    //   x' = 0*1 + (-1)*0 + 5 = 5
    //   y' = 1*1 + 0*0 + 0 = 1
    const M = parseTransformAttr('translate(5,0) rotate(90)');
    const x = M[0] * 1 + M[2] * 0 + M[4];
    const y = M[1] * 1 + M[3] * 0 + M[5];
    expect(x).toBeCloseTo(5, 8);
    expect(y).toBeCloseTo(1, 8);
  });

  it('parses matrix(a,b,c,d,e,f)', () => {
    const M = parseTransformAttr('matrix(1,2,3,4,5,6)');
    expect(M).toEqual([1, 2, 3, 4, 5, 6]);
  });
});

// ---------------------------------------------------------------------------
// splitGroup / renderPaths
// ---------------------------------------------------------------------------
describe('splitGroup', () => {
  it('extracts a single path from a group', () => {
    const svg = `<g><path d="M0,0 L10,10"/></g>`;
    const { paths, prefix, suffix } = splitGroup(svg);
    expect(paths).toHaveLength(1);
    expect(paths[0].points).toEqual([[0, 0], [10, 10]]);
    expect(prefix).toBe('<g>');
    expect(suffix).toBe('</g>');
  });

  it('extracts multiple paths', () => {
    const svg = `<g><path d="M0,0 L1,1"/><path d="M2,2 L3,3"/></g>`;
    const { paths } = splitGroup(svg);
    expect(paths).toHaveLength(2);
  });

  it('preserves attrs after d attribute', () => {
    const svg = `<g><path d="M0,0 L10,0" stroke="#f00" stroke-width="1"/></g>`;
    const { paths } = splitGroup(svg);
    expect(paths[0].attrs).toContain('stroke="#f00"');
  });

  it('returns empty paths for a group with no paths', () => {
    const svg = `<g><circle cx="5" cy="5" r="3"/></g>`;
    const { paths } = splitGroup(svg);
    expect(paths).toHaveLength(0);
  });

  // =========================================================================
  // RED TEST: PATH_RE drops points when `stroke` attribute comes BEFORE `d`
  //
  // Current regex: /<path\s+d="([^"]*)"([^/]*)\/>/g
  // This requires `d` to be the FIRST attribute on <path>.
  // When a pattern emits `stroke="..." d="..."`, the regex gets NO match,
  // and splitGroup returns paths=[] → all points are silently lost.
  // =========================================================================
  it('RED → should extract points from <path stroke="…" d="…"/> (stroke-first)', () => {
    const svg = `<g><path stroke="#000" d="M0,0 L10,10"/></g>`;
    const { paths } = splitGroup(svg);
    // This SHOULD succeed and return 1 path with 2 points.
    // Currently FAILS because PATH_RE requires d to be the first attribute.
    expect(paths).toHaveLength(1);
    expect(paths[0].points).toEqual([[0, 0], [10, 10]]);
  });

  it('RED → optimizeGroup preserves paths when d is not first attribute', () => {
    const svg = `<g><path stroke="#f00" stroke-width="2" d="M0,0 L10,0 L10,10"/></g>`;
    const { svg: out, stats } = optimizeGroup(svg, { reorder: { enabled: true } });
    // Currently hits the !original.length early-return and passes svg through unchanged.
    // With fix: stats.after.paths should be 1, not 0.
    expect(stats.after.paths).toBe(1);
    // The rendered output should contain the d attribute with the points
    expect(out).toContain('M0.00,0.00');
  });
});

describe('renderPaths', () => {
  it('renders paths with their attrs', () => {
    const paths = [{ points: [[0, 0], [5, 5]], closed: false, attrs: ' stroke="#000"' }];
    const rendered = renderPaths(paths);
    expect(rendered).toContain('d="M0.00,0.00 L5.00,5.00"');
    expect(rendered).toContain('stroke="#000"');
  });

  it('omits paths with fewer than 2 points', () => {
    const paths = [
      { points: [[0, 0]], closed: false, attrs: '' },
      { points: [[1, 1], [2, 2]], closed: false, attrs: '' },
    ];
    const rendered = renderPaths(paths);
    expect(rendered.split('<path').length - 1).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// optimizeGroup — string in, string out, apply order
// ---------------------------------------------------------------------------
describe('optimizeGroup', () => {
  const baseSvg = `<g>
    <path d="M0,0 L100,0"/>
    <path d="M200,0 L300,0"/>
    <path d="M150,0 L180,0"/>
  </g>`;

  it('re-serializes svg when paths are present even with no opts enabled', () => {
    // NOTE: optimizeGroup always re-renders path `d` values through
    // pathDFromPoints (toFixed(2)), so the output is canonicalized even when
    // no optimization is applied. The raw svgGroup is only returned verbatim
    // when there are NO <path> elements.
    const { svg, stats } = optimizeGroup(baseSvg, {});
    expect(stats.applied).toHaveLength(0);
    // Structural equivalence: same number of paths, all points preserved
    expect(stats.before.paths).toBe(3);
    expect(stats.after.paths).toBe(3);
    // Canonicalized d attributes appear in output
    expect(svg).toContain('M0.00,0.00');
    expect(svg).toContain('M200.00,0.00');
  });

  it('returns stats.applied listing operations that ran', () => {
    const { stats } = optimizeGroup(baseSvg, {
      simplify: { enabled: true, tolerance: 0.1 },
      reorder: { enabled: true },
    });
    expect(stats.applied).toContain('simplify(0.1mm)');
    expect(stats.applied).toContain('reorder');
    expect(stats.applied).not.toContain('merge');
  });

  it('before stats have higher or equal travel than after (reorder only)', () => {
    const { stats } = optimizeGroup(baseSvg, { reorder: { enabled: true } });
    expect(stats.after.travelMm).toBeLessThanOrEqual(stats.before.travelMm);
  });

  it('returns empty stats for a group with no paths', () => {
    const { svg, stats } = optimizeGroup('<g></g>', { reorder: { enabled: true } });
    expect(svg).toBe('<g></g>');
    expect(stats.before.paths).toBe(0);
  });

  it('preserves stroke attrs after optimization', () => {
    const svg = `<g><path d="M0,0 L10,0" stroke="#f00"/></g>`;
    const { svg: out } = optimizeGroup(svg, { reorder: { enabled: true } });
    expect(out).toContain('stroke="#f00"');
  });

  it('renders d-first paths without altering inter-attribute spacing', () => {
    // Regression guard: splitGroup strips the d="…" from allAttrs; the remaining
    // whitespace must be normalized so renderPaths emits single-space separation.
    const svg = `<g><path d="M0,0 L10,0" stroke="#f00"/></g>`;
    const { svg: out } = optimizeGroup(svg, { reorder: { enabled: true } });
    // Must contain exactly one space between d and stroke, no double-space.
    expect(out).toContain('<path d="M0.00,0.00 L10.00,0.00" stroke="#f00"/>');
  });
});

// ---------------------------------------------------------------------------
// formatSeconds
// ---------------------------------------------------------------------------
describe('formatSeconds', () => {
  it('formats sub-60s as integer seconds', () => {
    expect(formatSeconds(45)).toBe('45s');
  });

  it('formats exactly 60s as 1m', () => {
    expect(formatSeconds(60)).toBe('1m');
  });

  it('formats 90s as 1m 30s', () => {
    expect(formatSeconds(90)).toBe('1m 30s');
  });

  it('returns 0s for non-finite or zero', () => {
    expect(formatSeconds(0)).toBe('0s');
    expect(formatSeconds(-5)).toBe('0s');
    expect(formatSeconds(Infinity)).toBe('0s');
    expect(formatSeconds(NaN)).toBe('0s');
  });
});
