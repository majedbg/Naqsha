// Unit tests for SVG import parsing (issue #12, C4 — place-as-artwork).
// Pure, node-testable: an SVG string in, normalized path data out (or an error).

import { describe, it, expect } from 'vitest';
import { parseSVGImport, extractMotifDrawables } from './svgImport.js';

describe('parseSVGImport', () => {
  it('extracts the path d attribute from a single-path SVG, preserving it verbatim', () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg"><path d="M10,10 L90,90 C100,50 50,0 10,10 Z"/></svg>';
    const result = parseSVGImport(svg);
    expect(result.ok).toBe(true);
    expect(result.paths).toEqual(['M10,10 L90,90 C100,50 50,0 10,10 Z']);
  });

  it('extracts multiple paths in document order', () => {
    const svg =
      '<svg><path d="M0,0 L1,1"/><rect/><path d=\'M2,2 L3,3\'/></svg>';
    const result = parseSVGImport(svg);
    expect(result.ok).toBe(true);
    expect(result.paths).toEqual(['M0,0 L1,1', 'M2,2 L3,3']);
  });

  it('rejects an empty string without throwing', () => {
    const result = parseSVGImport('');
    expect(result.ok).toBe(false);
    expect(typeof result.error).toBe('string');
    expect(result.error.length).toBeGreaterThan(0);
  });

  it('rejects non-SVG markup without throwing', () => {
    expect(parseSVGImport('<html><body>nope</body></html>').ok).toBe(false);
  });

  it('rejects an SVG with no path geometry without throwing', () => {
    const result = parseSVGImport('<svg xmlns="http://www.w3.org/2000/svg"><rect x="0" y="0" width="5" height="5"/></svg>');
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/path/i);
  });

  it('rejects null/undefined input without throwing', () => {
    expect(parseSVGImport(null).ok).toBe(false);
    expect(parseSVGImport(undefined).ok).toBe(false);
  });
});

// extractMotifDrawables (P5-3) — motif-only enhanced extractor. Shares NOTHING
// with parseSVGImport's return object identity; only mirrors its `{ok, paths}`
// shape. Covers basic-shape conversion + single-top-level-transform flattening.
// importMotif is the sole consumer.
describe('extractMotifDrawables — untransformed path stays verbatim (tracer)', () => {
  it('keeps an untransformed <path> d byte-for-byte identical to parseSVGImport', () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg"><path d="M10,10 L90,90 C100,50 50,0 10,10 Z"/></svg>';
    const result = extractMotifDrawables(svg);
    expect(result.ok).toBe(true);
    expect(result.paths).toEqual(['M10,10 L90,90 C100,50 50,0 10,10 Z']);
  });
});

describe('extractMotifDrawables — basic shape conversion', () => {
  it('converts a sharp-cornered <rect> to a closed 4-point path', () => {
    const svg = '<svg><rect x="10" y="20" width="30" height="40"/></svg>';
    const result = extractMotifDrawables(svg);
    expect(result.ok).toBe(true);
    expect(result.paths).toEqual(['M10,20 L40,20 L40,60 L10,60 Z']);
  });

  it('converts a rounded <rect> (rx/ry) to a path with arc corners', () => {
    const svg = '<svg><rect x="0" y="0" width="100" height="50" rx="10" ry="10"/></svg>';
    const result = extractMotifDrawables(svg);
    expect(result.ok).toBe(true);
    expect(result.paths).toHaveLength(1);
    const d = result.paths[0];
    expect(d).toMatch(/^M/);
    expect(d).toMatch(/A10,10/);
    expect(d.trim().endsWith('Z')).toBe(true);
  });

  it('defaults ry to rx when only rx is given on a rounded rect', () => {
    const svg = '<svg><rect x="0" y="0" width="100" height="50" rx="8"/></svg>';
    const result = extractMotifDrawables(svg);
    expect(result.paths[0]).toMatch(/A8,8/);
  });

  it('converts a <circle> to a closed two-arc path', () => {
    const svg = '<svg><circle cx="50" cy="50" r="25"/></svg>';
    const result = extractMotifDrawables(svg);
    expect(result.ok).toBe(true);
    expect(result.paths[0]).toBe('M25,50 A25,25 0 1,0 75,50 A25,25 0 1,0 25,50 Z');
  });

  it('converts an <ellipse> to a closed two-arc path', () => {
    const svg = '<svg><ellipse cx="50" cy="50" rx="30" ry="10"/></svg>';
    const result = extractMotifDrawables(svg);
    expect(result.ok).toBe(true);
    expect(result.paths[0]).toBe('M20,50 A30,10 0 1,0 80,50 A30,10 0 1,0 20,50 Z');
  });

  it('converts a <line> to an OPEN 2-point path', () => {
    const svg = '<svg><line x1="0" y1="0" x2="10" y2="20"/></svg>';
    const result = extractMotifDrawables(svg);
    expect(result.ok).toBe(true);
    expect(result.paths[0]).toBe('M0,0 L10,20');
    expect(result.paths[0].trim().endsWith('Z')).toBe(false);
  });

  it('converts a <polygon> to a CLOSED path', () => {
    const svg = '<svg><polygon points="0,0 10,0 10,10"/></svg>';
    const result = extractMotifDrawables(svg);
    expect(result.ok).toBe(true);
    expect(result.paths[0]).toBe('M0,0 L10,0 L10,10 Z');
  });

  it('converts a <polyline> to an OPEN path', () => {
    const svg = '<svg><polyline points="0,0 10,0 10,10"/></svg>';
    const result = extractMotifDrawables(svg);
    expect(result.ok).toBe(true);
    expect(result.paths[0]).toBe('M0,0 L10,0 L10,10');
  });
});

describe('extractMotifDrawables — transform flattening', () => {
  it('applies an element-own translate() to a path, rewriting its d', () => {
    const svg = '<svg><path d="M0,0 L10,0 L10,10 Z" transform="translate(5,7)"/></svg>';
    const result = extractMotifDrawables(svg);
    expect(result.ok).toBe(true);
    // Rewritten (no longer verbatim) — every vertex shifted by (5,7).
    expect(result.paths[0]).not.toBe('M0,0 L10,0 L10,10 Z');
    expect(result.paths[0]).toContain('M5.00,7.00');
  });

  it('applies scale() to a path', () => {
    const svg = '<svg><path d="M1,1 L2,2" transform="scale(10)"/></svg>';
    const result = extractMotifDrawables(svg);
    expect(result.paths[0]).toContain('M10.00,10.00');
    expect(result.paths[0]).toContain('20.00,20.00');
  });

  it('applies rotate(90) about the origin to a path', () => {
    // rotate(90): (x,y) -> (-y, x)
    const svg = '<svg><path d="M10,0 L0,0" transform="rotate(90)"/></svg>';
    const result = extractMotifDrawables(svg);
    const d = result.paths[0];
    expect(d).toContain('M0.00,10.00');
  });

  it('applies rotate(angle,cx,cy) about an explicit center', () => {
    // rotate(180,5,5) around (5,5): point (5,0) -> (5,10)
    const svg = '<svg><path d="M5,0 L5,5" transform="rotate(180,5,5)"/></svg>';
    const result = extractMotifDrawables(svg);
    expect(result.paths[0]).toContain('M5.00,10.00');
  });

  it('applies skewX() to a path', () => {
    // skewX(45): x' = x + tan(45deg)*y = x + y
    const svg = '<svg><path d="M0,10" transform="skewX(45)"/></svg>';
    const result = extractMotifDrawables(svg);
    expect(result.paths[0]).toContain('M10.00,10.00');
  });

  it('applies skewY() to a path', () => {
    // skewY(45): y' = y + tan(45deg)*x = y + x
    const svg = '<svg><path d="M10,0" transform="skewY(45)"/></svg>';
    const result = extractMotifDrawables(svg);
    expect(result.paths[0]).toContain('10.00,10.00');
  });

  it('applies an explicit matrix() function', () => {
    // matrix(1,0,0,1,3,4) === translate(3,4)
    const svg = '<svg><path d="M0,0" transform="matrix(1,0,0,1,3,4)"/></svg>';
    const result = extractMotifDrawables(svg);
    expect(result.paths[0]).toBe('M3.00,4.00');
  });

  it('composes multiple functions in one transform attribute left-to-right', () => {
    // translate(10,0) then rotate(90) means rotate happens first (inner),
    // matching SVG's outer-applied-last order: p' = T(R(p)).
    // R(90) on (1,0) -> (0,1); then T(10,0) -> (10,1).
    const svg = '<svg><path d="M1,0" transform="translate(10,0) rotate(90)"/></svg>';
    const result = extractMotifDrawables(svg);
    expect(result.paths[0]).toBe('M10.00,1.00');
  });

  it('composes a single top-level <g transform> with each element (translate + translate)', () => {
    const svg =
      '<svg><g transform="translate(100,0)"><path d="M0,0" transform="translate(0,5)"/></g></svg>';
    const result = extractMotifDrawables(svg);
    expect(result.paths[0]).toBe('M100.00,5.00');
  });

  it('applies a top-level transform to a converted basic shape', () => {
    const svg = '<svg transform="translate(10,10)"><rect x="0" y="0" width="4" height="4"/></svg>';
    const result = extractMotifDrawables(svg);
    expect(result.ok).toBe(true);
    expect(result.paths[0]).toContain('M10.00,10.00');
  });

  it('does NOT apply a lone <g> transform to a SIBLING group (multi-<g> safety rail)', () => {
    // Two sibling top-level <g>s: guessing "the first <g>'s transform wraps
    // everything" would mis-apply group-1's translate to group-2's path.
    // Multi-<g> documents fall back to NO top-level transform (verbatim/
    // identity), never a wrong one.
    const svg =
      '<svg><g transform="translate(100,0)"><path d="M0,0 L1,1"/></g>' +
      '<g><path d="M2,2 L3,3"/></g></svg>';
    const result = extractMotifDrawables(svg);
    expect(result.ok).toBe(true);
    expect(result.paths).toEqual(['M0,0 L1,1', 'M2,2 L3,3']);
  });
});

describe('extractMotifDrawables — graceful fallback', () => {
  it('never throws on an unparseable transform, falling back to untransformed geometry', () => {
    const svg = '<svg><path d="M1,2 L3,4" transform="not-a-real-function(1,2,3)"/></svg>';
    expect(() => extractMotifDrawables(svg)).not.toThrow();
    const result = extractMotifDrawables(svg);
    expect(result.ok).toBe(true);
    // Unparseable transform degrades to identity => verbatim d preserved.
    expect(result.paths).toEqual(['M1,2 L3,4']);
  });

  it('skips an unsupported element and unrelated markup without throwing', () => {
    const svg = '<svg><text>hello</text><path d="M0,0 L1,1"/></svg>';
    expect(() => extractMotifDrawables(svg)).not.toThrow();
    const result = extractMotifDrawables(svg);
    expect(result.ok).toBe(true);
    expect(result.paths).toEqual(['M0,0 L1,1']);
  });

  it('skips a degenerate rect (zero width) rather than crashing', () => {
    const svg = '<svg><rect x="0" y="0" width="0" height="10"/><path d="M0,0 L1,1"/></svg>';
    expect(() => extractMotifDrawables(svg)).not.toThrow();
    const result = extractMotifDrawables(svg);
    expect(result.paths).toEqual(['M0,0 L1,1']);
  });

  it('yields the same path-only output as today when the SVG has no transforms', () => {
    const svg = '<svg><path d="M0,0 L1,1"/><path d="M2,2 L3,3"/></svg>';
    const plain = parseSVGImport(svg);
    const motif = extractMotifDrawables(svg);
    expect(motif.ok).toBe(true);
    expect(motif.paths).toEqual(plain.paths);
  });

  it('rejects an SVG with no drawable elements without throwing', () => {
    const result = extractMotifDrawables('<svg><text>hi</text></svg>');
    expect(result.ok).toBe(false);
    expect(typeof result.error).toBe('string');
  });

  it('rejects empty/non-SVG/null input without throwing, same as parseSVGImport', () => {
    expect(extractMotifDrawables('').ok).toBe(false);
    expect(extractMotifDrawables('<html></html>').ok).toBe(false);
    expect(extractMotifDrawables(null).ok).toBe(false);
    expect(extractMotifDrawables(undefined).ok).toBe(false);
  });
});
