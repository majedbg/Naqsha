// Module D of PRD #143 — the CELL-GRID anchor extractor (#151).
//
// GEOMETRY-IN: every case here constructs the tiling LITERALLY rather than
// running a pattern, so a change to how ModuleGrid or Truchet paints can never
// break these. The end-to-end wiring is asserted separately, in
// moduleGrid.integration.test.js, where running the real pattern is the point.

import { describe, it, expect } from 'vitest';
import { cellGridAnchors } from './cellGridAnchors.js';

const HALF_PI = Math.PI / 2;

/** A uniform r×c tiling of `half`-extent cells, Truchet's shape of input. */
function tiling(cols, rows, half, extra = () => ({})) {
  const out = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      out.push({ x: col * half * 2 + half, y: row * half * 2 + half, ...extra(col, row) });
    }
  }
  return out;
}

describe('cellGridAnchors — one anchor per cell', () => {
  it('places one cell anchor at each cell centre, in input order', () => {
    const cells = tiling(3, 2, 10);
    const anchors = cellGridAnchors(cells, { half: 10 });
    expect(anchors).toHaveLength(6);
    anchors.forEach((a, i) => {
      expect(a.role).toBe('cell');
      expect(a.x).toBe(cells[i].x);
      expect(a.y).toBe(cells[i].y);
      expect(a.s).toBe(0);
      expect(a.meta.cell).toBe(i);
    });
  });

  it('ids are positional over the input list — `cell:<index>`', () => {
    const anchors = cellGridAnchors(tiling(2, 2, 5), { half: 5 });
    expect(anchors.map((a) => a.id)).toEqual(['cell:0', 'cell:1', 'cell:2', 'cell:3']);
  });
});

describe('cellGridAnchors — hostRadius', () => {
  it('a CONSTANT half-extent gives every anchor the same hostRadius (Truchet\'s case)', () => {
    const anchors = cellGridAnchors(tiling(3, 3, 12), { half: 12 });
    expect(anchors.map((a) => a.hostRadius)).toEqual(new Array(9).fill(12));
  });

  it('PER-CELL half-extents produce PER-CELL radii, not one shared value', () => {
    // The criterion in the ticket, stated directly: a tiling whose cells declare
    // their own half-extents must NOT collapse to a single shared radius.
    const cells = [
      { x: 0, y: 0, half: 4 },
      { x: 20, y: 0, half: 9 },
      { x: 40, y: 0, half: 15 },
    ];
    const anchors = cellGridAnchors(cells);
    expect(anchors.map((a) => a.hostRadius)).toEqual([4, 9, 15]);
    expect(new Set(anchors.map((a) => a.hostRadius)).size).toBe(3);
  });

  it('a per-cell half OVERRIDES the shared fallback; cells without one take it', () => {
    const cells = [{ x: 0, y: 0, half: 3 }, { x: 10, y: 0 }, { x: 20, y: 0, half: 7 }];
    expect(cellGridAnchors(cells, { half: 5 }).map((a) => a.hostRadius)).toEqual([3, 5, 7]);
  });

  it('no half anywhere yields anchors with NO hostRadius rather than a throw', () => {
    // hostRadius is an OPTIONAL top-level field: absent ⇒ the engine sizes the
    // glyph exactly as it does on any host that declares nothing. A caller with no
    // notion of cell size still gets usable anchors.
    const anchors = cellGridAnchors([{ x: 1, y: 2 }, { x: 3, y: 4 }]);
    expect(anchors).toHaveLength(2);
    for (const a of anchors) {
      expect('hostRadius' in a).toBe(false);
      expect(a.x).toBeTypeOf('number');
    }
  });

  it('a non-positive or non-finite half declares no hostRadius', () => {
    const cells = [
      { x: 0, y: 0, half: 0 },
      { x: 10, y: 0, half: -4 },
      { x: 20, y: 0, half: Number.NaN },
      { x: 30, y: 0, half: Number.POSITIVE_INFINITY },
    ];
    const anchors = cellGridAnchors(cells);
    expect(anchors).toHaveLength(4);
    for (const a of anchors) expect('hostRadius' in a).toBe(false);
  });
});

describe('cellGridAnchors — rotation', () => {
  it('carries per-cell rotation through as tangent, with normal a quarter-turn on', () => {
    const cells = [
      { x: 0, y: 0, rotation: 0 },
      { x: 10, y: 0, rotation: Math.PI / 6 },
      { x: 20, y: 0, rotation: -1.1 },
    ];
    const anchors = cellGridAnchors(cells, { half: 5 });
    expect(anchors.map((a) => a.tangent)).toEqual([0, Math.PI / 6, -1.1]);
    anchors.forEach((a) => expect(a.normal).toBeCloseTo(a.tangent + HALF_PI, 12));
  });

  it('OMITTING rotation yields UNROTATED anchors rather than throwing', () => {
    const anchors = cellGridAnchors([{ x: 1, y: 1, half: 2 }, { x: 5, y: 1, half: 2 }]);
    expect(anchors).toHaveLength(2);
    for (const a of anchors) {
      expect(a.tangent).toBe(0);
      expect(a.normal).toBeCloseTo(HALF_PI, 12);
    }
  });

  it('a non-finite rotation degrades to unrotated', () => {
    const anchors = cellGridAnchors([{ x: 0, y: 0, rotation: Number.NaN }]);
    expect(anchors[0].tangent).toBe(0);
    expect(anchors[0].normal).toBeCloseTo(HALF_PI, 12);
  });

  it('rotation is per-cell — a mixed tiling keeps every cell\'s own angle', () => {
    const cells = tiling(2, 2, 6, (col, row) => ({ rotation: (col + 2 * row) * 0.25 }));
    const anchors = cellGridAnchors(cells, { half: 6 });
    expect(anchors.map((a) => a.tangent)).toEqual([0, 0.25, 0.5, 0.75]);
  });
});

describe('cellGridAnchors — degenerate tilings', () => {
  it('a ONE-cell tiling yields exactly one anchor', () => {
    const anchors = cellGridAnchors([{ x: 7, y: 9, half: 3, rotation: 0.4 }]);
    expect(anchors).toHaveLength(1);
    expect(anchors[0]).toMatchObject({ id: 'cell:0', role: 'cell', x: 7, y: 9, hostRadius: 3 });
    expect(anchors[0].tangent).toBe(0.4);
  });

  it('a ZERO-cell tiling yields an empty array rather than throwing', () => {
    expect(cellGridAnchors([])).toEqual([]);
    expect(cellGridAnchors([], { half: 10 })).toEqual([]);
  });

  it('a missing / non-array input yields an empty array rather than throwing', () => {
    expect(cellGridAnchors()).toEqual([]);
    expect(cellGridAnchors(null)).toEqual([]);
    expect(cellGridAnchors(undefined, { half: 4 })).toEqual([]);
  });

  it('cells with non-finite centres are dropped, and the survivors re-index', () => {
    const anchors = cellGridAnchors([
      { x: 0, y: 0, half: 1 },
      { x: Number.NaN, y: 0, half: 1 },
      null,
      { x: 5, y: 5, half: 2 },
    ]);
    expect(anchors.map((a) => a.id)).toEqual(['cell:0', 'cell:1']);
    expect(anchors.map((a) => a.hostRadius)).toEqual([1, 2]);
  });
});

describe('cellGridAnchors — purity', () => {
  it('does not mutate its input', () => {
    const cells = [{ x: 1, y: 2, half: 3, rotation: 0.5 }];
    const snapshot = JSON.parse(JSON.stringify(cells));
    cellGridAnchors(cells, { half: 9 });
    expect(cells).toEqual(snapshot);
  });

  it('is free of any host-specific knowledge — the same tiling in, the same anchors out', () => {
    // The module is shared with Truchet (#153). Two callers describing the SAME
    // tiling differently — one leaning on the shared fallback, one spelling out
    // per-cell halves — must get identical anchors.
    const shared = cellGridAnchors(tiling(2, 2, 8), { half: 8 });
    const explicit = cellGridAnchors(tiling(2, 2, 8, () => ({ half: 8 })));
    expect(explicit).toEqual(shared);
  });
});
