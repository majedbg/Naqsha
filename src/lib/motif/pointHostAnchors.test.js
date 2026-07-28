// Module B — POINT-HOST anchors. One `cell` anchor per container circle, at its
// centre, declaring its radius through the top-level `hostRadius` channel (#146).
//
// The input is constructed LITERALLY here rather than by running Circle Packing:
// a change to how the pattern paints must never break this extractor's tests.
// The pattern-side stash has its own test (CirclePacking.motif.test.js).

import { describe, it, expect } from 'vitest';
import { pointHostAnchors } from './pointHostAnchors.js';

describe('pointHostAnchors', () => {
  it('produces exactly one anchor per circle, at its centre, carrying its radius', () => {
    const circles = [
      { x: 10, y: 20, r: 5 },
      { x: 100, y: 200, r: 50 },
      { x: 33, y: 44, r: 1.5 },
    ];
    const anchors = pointHostAnchors(circles);
    expect(anchors).toHaveLength(3);
    anchors.forEach((a, i) => {
      expect(a.role).toBe('cell');
      expect(a.x).toBe(circles[i].x);
      expect(a.y).toBe(circles[i].y);
      expect(a.hostRadius).toBe(circles[i].r);
    });
  });

  it('puts hostRadius TOP-LEVEL on the anchor, not in metadata', () => {
    const [a] = pointHostAnchors([{ x: 0, y: 0, r: 7 }]);
    expect(a.hostRadius).toBe(7);
    expect(a.meta.hostRadius).toBeUndefined();
  });

  it('uses the fixed cell convention (tangent 0, normal π/2, s 0)', () => {
    // Matches the Grid / Recursive / Voronoi cell role: a container centre has
    // no canonical direction.
    const [a] = pointHostAnchors([{ x: 1, y: 2, r: 3 }]);
    expect(a.tangent).toBe(0);
    expect(a.normal).toBeCloseTo(Math.PI / 2, 15);
    expect(a.s).toBe(0);
  });

  it('uses the NORMATIVE id format `cell:<index>` in input order', () => {
    // Override records match by EXACT anchor id before falling back to spatial
    // rebinding, and randomised Slots hash the id — so the format is contractual.
    const anchors = pointHostAnchors([
      { x: 0, y: 0, r: 1 },
      { x: 5, y: 5, r: 2 },
      { x: 9, y: 9, r: 3 },
    ]);
    expect(anchors.map((a) => a.id)).toEqual(['cell:0', 'cell:1', 'cell:2']);
  });

  it('carries the container index in metadata for downstream consumers', () => {
    const [, b] = pointHostAnchors([{ x: 0, y: 0, r: 1 }, { x: 5, y: 5, r: 2 }]);
    expect(b.meta.cell).toBe(1);
  });

  it('never produces coincident anchors from distinct circles', () => {
    // The keystone reason the pattern stashes its ACCEPTED circles rather than
    // its EMITTED ones: concentric rings share a centre, and the placement
    // engine's empty-circle test would silently reduce them to one glyph.
    const anchors = pointHostAnchors([
      { x: 10, y: 10, r: 9 },
      { x: 10, y: 10, r: 6 },
      { x: 10, y: 10, r: 3 },
    ]);
    // Coincident input IS collapsed — the extractor refuses to emit a pile.
    expect(anchors).toHaveLength(1);
    expect(anchors[0].hostRadius).toBe(9); // the outermost ring wins
  });

  it('an empty input yields an empty result rather than throwing', () => {
    expect(pointHostAnchors([])).toEqual([]);
  });

  it('a missing/invalid input yields an empty result rather than throwing', () => {
    expect(pointHostAnchors(undefined)).toEqual([]);
    expect(pointHostAnchors(null)).toEqual([]);
    expect(pointHostAnchors('nope')).toEqual([]);
  });

  it('skips degenerate circles (non-finite coords, non-positive radius)', () => {
    const anchors = pointHostAnchors([
      { x: 0, y: 0, r: 0 },
      { x: NaN, y: 0, r: 4 },
      { x: 0, y: 0, r: -2 },
      { x: 7, y: 8, r: 9 },
    ]);
    expect(anchors).toHaveLength(1);
    expect(anchors[0].x).toBe(7);
    // Ids are positional over the SURVIVING containers, so they stay dense.
    expect(anchors[0].id).toBe('cell:0');
  });

  it('is a pure function of its input — never mutates the circles it is given', () => {
    const circles = [{ x: 1, y: 2, r: 3 }];
    const before = JSON.stringify(circles);
    pointHostAnchors(circles);
    expect(JSON.stringify(circles)).toBe(before);
  });
});
