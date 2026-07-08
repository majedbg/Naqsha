// Unit tests for importMotif (WI-4) — SVG text → a custom-glyph object.
// Pure, node-testable: an SVG string in, a glyph (or an error) out.

import { describe, it, expect } from 'vitest';
import { importMotif } from './importMotif.js';

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

  it('propagates the no-path error', () => {
    const r = importMotif('<svg><rect x="0" y="0" width="5" height="5"/></svg>');
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/path/i);
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
