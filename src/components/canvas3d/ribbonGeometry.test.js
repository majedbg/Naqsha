// @vitest-environment jsdom
// jsdom is required: SVGLoader.parse() uses DOMParser (absent in the default node
// env). This exercises the three.js ribbon builder directly — pure geometry math,
// no WebGL/<Canvas> render — which IS valid in jsdom (only R3F rendering is not).
import { describe, it, expect } from 'vitest';
import { strokeGeometriesForSvg, buildRibbonGeometry } from './ribbonGeometry.js';

// Two stroked paths in a 100×100 SVG. SVGLoader keys stroke width off stroke-width.
const TWO_PATHS = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100">
  <path d="M0 10 L100 10" stroke="#ff0000" fill="none" stroke-width="2"/>
  <path d="M0 90 L100 90" stroke="#ff0000" fill="none" stroke-width="2"/>
</svg>`;

describe('strokeGeometriesForSvg — SVG strokes → flat ribbon geometries', () => {
  it('returns one geometry per stroked subpath, each with positive vertex count', () => {
    const geoms = strokeGeometriesForSvg(TWO_PATHS);
    expect(geoms).toHaveLength(2);
    for (const g of geoms) {
      expect(g.attributes.position.count).toBeGreaterThan(0);
      // pointsToStroke emits position + normal + uv (so geometries merge cleanly).
      expect(g.attributes.normal).toBeTruthy();
      expect(g.attributes.uv).toBeTruthy();
      expect(g.index).toBeNull(); // non-indexed
    }
  });

  it('strokes <line>/<polyline> elements too (countSvgPaths misses these)', () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="50" height="50">
      <line x1="0" y1="0" x2="50" y2="50" stroke="#00f" stroke-width="1"/>
      <polyline points="0,10 25,40 50,10" stroke="#00f" fill="none" stroke-width="1"/>
    </svg>`;
    expect(strokeGeometriesForSvg(svg)).toHaveLength(2);
  });

  it('skips fill-only (non-stroked) paths — no groove to relieve', () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="50" height="50">
      <path d="M0 0 L50 0 L50 50 Z" fill="#000"/>
    </svg>`;
    expect(strokeGeometriesForSvg(svg)).toHaveLength(0);
  });

  it('returns [] for empty / invalid input without throwing', () => {
    expect(strokeGeometriesForSvg('')).toEqual([]);
    expect(strokeGeometriesForSvg('   ')).toEqual([]);
    expect(strokeGeometriesForSvg(null)).toEqual([]);
    expect(strokeGeometriesForSvg(undefined)).toEqual([]);
  });
});

describe('buildRibbonGeometry — merged emissive ribbon', () => {
  it('merges all subpath ribbons into one geometry (vertex count = sum of parts)', () => {
    const parts = strokeGeometriesForSvg(TWO_PATHS);
    const sum = parts.reduce((n, g) => n + g.attributes.position.count, 0);
    const merged = buildRibbonGeometry(TWO_PATHS);
    expect(merged).not.toBeNull();
    expect(merged.attributes.position.count).toBe(sum);
  });

  it('emits one render GROUP per merged ribbon when useGroups is set', () => {
    const merged = buildRibbonGeometry(TWO_PATHS, { useGroups: true });
    expect(merged.groups).toHaveLength(2);
    // groups partition the buffer contiguously from offset 0.
    expect(merged.groups[0].start).toBe(0);
  });

  it('returns null for a degenerate SVG (caller must texture-fallback)', () => {
    expect(buildRibbonGeometry('')).toBeNull();
    expect(buildRibbonGeometry('<svg xmlns="http://www.w3.org/2000/svg"></svg>')).toBeNull();
  });

  it('BAKES the SVG→world transform: y-flipped + centered on the plane frame', () => {
    // A single horizontal stroke at SVG y=0 (the TOP edge) across a 20×10 frame.
    // Expected mapping: x 0..20 → -10..10 ; SVG-top (y=0) → world-top (+h/2 = +5).
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="10" viewBox="0 0 20 10">
      <path d="M0 0 L20 0" stroke="#fff" fill="none" stroke-width="2"/>
    </svg>`;
    const g = buildRibbonGeometry(svg, { width: 20, height: 10 });
    g.computeBoundingBox();
    const { min, max } = g.boundingBox;
    // centered in x on the origin
    expect((min.x + max.x) / 2).toBeCloseTo(0, 1);
    expect(min.x).toBeCloseTo(-10, 1);
    expect(max.x).toBeCloseTo(10, 1);
    // SVG TOP edge (y=0) lands at the world TOP (+height/2), proving the Y-flip.
    // The stroke centerline maps to +h/2 = +5; the 1mm half-width brackets it to
    // bbox y ∈ [+4, +6] — entirely in the TOP half (not flipped to the bottom).
    expect((min.y + max.y) / 2).toBeCloseTo(5, 0);
    expect(min.y).toBeGreaterThan(3.5);
    expect(max.y).toBeLessThan(6.5);
  });

  it('leaves geometry in raw SVG space when width/height are omitted', () => {
    // Same top stroke, no transform: SVG y≈0 stays near y=0 (NOT lifted to +h/2).
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="10">
      <path d="M0 0 L20 0" stroke="#fff" fill="none" stroke-width="2"/>
    </svg>`;
    const g = buildRibbonGeometry(svg);
    g.computeBoundingBox();
    expect(g.boundingBox.min.x).toBeCloseTo(0, 1); // raw left edge at x=0, not -10
  });
});
