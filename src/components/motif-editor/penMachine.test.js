// penMachine — pure geometry + selection ops for the direct-select tool.
// Node env (no DOM): the machine is headless, so this is the TDD centerpiece.

import { describe, it, expect } from 'vitest';
import {
  hitTest,
  moveAnchor,
  moveHandle,
  deleteAnchors,
  toggleSelect,
  marqueeSelect,
  isSelected,
  hitTestSegment,
  addAnchorOnSegment,
  convertAnchor,
  setSmoothHandle,
  moveWholePath,
  appendAnchor,
  closeSubpath,
  hitTestRoot,
  constrainTo45,
  angleFromArm,
} from './penMachine.js';
import { anchorsToD } from '../../lib/motif/pathModel.js';

// A one-path / one-subpath fixture:
//   A0 corner  (0,0)   out (2,0)                — leading corner, no `in`
//   A1 smooth  (10,0)  in (8,0)  out (12,0)     — collinear + mirror-length
//   A2 corner  (20,0)  in (18,0)                — trailing corner, no `out`
function fixture() {
  return [
    {
      d: 'M0,0 C2,0 8,0 10,0 C12,0 18,0 20,0',
      closed: false,
      dirty: false,
      model: {
        subpaths: [
          {
            closed: false,
            anchors: [
              { x: 0, y: 0, in: null, out: { x: 2, y: 0 }, type: 'corner' },
              { x: 10, y: 0, in: { x: 8, y: 0 }, out: { x: 12, y: 0 }, type: 'smooth' },
              { x: 20, y: 0, in: { x: 18, y: 0 }, out: null, type: 'corner' },
            ],
          },
        ],
      },
    },
  ];
}

const t = (pathIndex, subpathIndex, anchorIndex, part = 'anchor') => ({
  pathIndex,
  subpathIndex,
  anchorIndex,
  part,
});

// ── Slice 1: hitTest anchor / miss ──────────────────────────────────────────
describe('hitTest', () => {
  it('finds the nearest anchor within tol', () => {
    const hit = hitTest(fixture(), { x: 10.1, y: 0 }, 1);
    expect(hit).toEqual(t(0, 0, 1, 'anchor'));
  });

  it('returns null when nothing is within tol', () => {
    expect(hitTest(fixture(), { x: 100, y: 100 }, 1)).toBeNull();
  });

  // ── Slice 2: category priority — handles beat anchors ────────────────────
  it('prefers a handle over an anchor when both are within tol', () => {
    // Point sits 0.1 from A1.out (12,0) and 1.9 from A1 (10,0); tol admits both.
    const hit = hitTest(fixture(), { x: 11.9, y: 0 }, 3);
    expect(hit).toEqual(t(0, 0, 1, 'out'));
  });
});

// ── Slice 3: moveAnchor translates anchor + both handles; dirties ───────────
describe('moveAnchor', () => {
  it('translates the anchor and BOTH handles by the same delta and dirties the path', () => {
    const paths = fixture();
    const next = moveAnchor(paths, t(0, 0, 1), { x: 10, y: 5 }); // delta (0,+5)
    const a = next[0].model.subpaths[0].anchors[1];
    expect(a).toMatchObject({ x: 10, y: 5 });
    expect(a.in).toEqual({ x: 8, y: 5 });
    expect(a.out).toEqual({ x: 12, y: 5 });
    expect(next[0].dirty).toBe(true);
    // input untouched (immutability)
    expect(paths[0].model.subpaths[0].anchors[1].y).toBe(0);
    expect(paths[0].dirty).toBe(false);
  });
});

// ── Slice 4: moveHandle on a corner moves only that handle ──────────────────
describe('moveHandle — corner', () => {
  it('moves only the dragged handle; the null opposite stays null; type stays corner', () => {
    const next = moveHandle(fixture(), t(0, 0, 2, 'in'), { x: 18, y: 3 });
    const a = next[0].model.subpaths[0].anchors[2];
    expect(a.in).toEqual({ x: 18, y: 3 });
    expect(a.out).toBeNull();
    expect(a.type).toBe('corner');
    expect(next[0].dirty).toBe(true);
  });
});

// ── Slice 5: moveHandle on a smooth mirrors the opposite (preserve length) ──
describe('moveHandle — smooth mirror', () => {
  it('reflects the dragged direction to the opposite side, preserving the opposite arm length', () => {
    // Drag A1.out from (12,0) up to (10,4): direction is straight up, len 4.
    const next = moveHandle(fixture(), t(0, 0, 1, 'out'), { x: 10, y: 4 });
    const a = next[0].model.subpaths[0].anchors[1];
    expect(a.out).toEqual({ x: 10, y: 4 });
    // Opposite `in` kept its length (2) but flipped to point straight down.
    expect(a.in.x).toBeCloseTo(10, 6);
    expect(a.in.y).toBeCloseTo(-2, 6);
    // Collinear through the anchor: in, anchor, out share a line (x=10 here).
    const cross =
      (a.out.x - a.x) * (a.in.y - a.y) - (a.out.y - a.y) * (a.in.x - a.x);
    expect(cross).toBeCloseTo(0, 6);
    // length preserved
    expect(Math.hypot(a.in.x - a.x, a.in.y - a.y)).toBeCloseTo(2, 6);
    expect(a.type).toBe('smooth');
  });
});

// ── Slice 6: moveHandle with {alt} breaks the tangent ───────────────────────
describe('moveHandle — alt break', () => {
  it('moves only the dragged handle, leaves the opposite unchanged, flips type to corner', () => {
    const next = moveHandle(fixture(), t(0, 0, 1, 'out'), { x: 10, y: 4 }, { alt: true });
    const a = next[0].model.subpaths[0].anchors[1];
    expect(a.out).toEqual({ x: 10, y: 4 });
    expect(a.in).toEqual({ x: 8, y: 0 }); // untouched
    expect(a.type).toBe('corner');
  });
});

// ── Slice 7: deleteAnchors — rejoin, and drop a subpath below 2 ──────────────
describe('deleteAnchors', () => {
  it('removes an anchor and rejoins the neighbors', () => {
    const next = deleteAnchors(fixture(), [t(0, 0, 1)]);
    const anchors = next[0].model.subpaths[0].anchors;
    expect(anchors).toHaveLength(2);
    expect(anchors.map((a) => a.x)).toEqual([0, 20]);
    expect(next[0].dirty).toBe(true);
  });

  it('drops a subpath that falls below 2 anchors', () => {
    const paths = [
      {
        d: 'M0,0 L5,5',
        closed: false,
        dirty: false,
        model: {
          subpaths: [
            {
              closed: false,
              anchors: [
                { x: 0, y: 0, in: null, out: null, type: 'corner' },
                { x: 5, y: 5, in: null, out: null, type: 'corner' },
              ],
            },
          ],
        },
      },
    ];
    const next = deleteAnchors(paths, [t(0, 0, 0)]);
    expect(next[0].model.subpaths).toHaveLength(0); // empty model, no crash
    expect(next[0].dirty).toBe(true);
  });

  it('removes multiple anchors across the same subpath without index drift', () => {
    // Delete A0 and A2 from the 3-anchor fixture → only A1 remains → subpath drops.
    const next = deleteAnchors(fixture(), [t(0, 0, 0), t(0, 0, 2)]);
    expect(next[0].model.subpaths).toHaveLength(0);
  });
});

// ── Slice 8: selection toggle + marquee ─────────────────────────────────────
describe('selection', () => {
  it('non-additive select replaces the selection with the bare target', () => {
    const sel = toggleSelect([], t(0, 0, 1), { additive: false });
    expect(sel).toEqual([{ pathIndex: 0, subpathIndex: 0, anchorIndex: 1 }]);
  });

  it('additive toggles membership on and off', () => {
    const a = toggleSelect([{ pathIndex: 0, subpathIndex: 0, anchorIndex: 0 }], t(0, 0, 1), {
      additive: true,
    });
    expect(a).toHaveLength(2);
    const b = toggleSelect(a, t(0, 0, 1), { additive: true });
    expect(b).toEqual([{ pathIndex: 0, subpathIndex: 0, anchorIndex: 0 }]);
  });

  it('marqueeSelect returns every anchor inside the rect (corner-agnostic)', () => {
    // Rect covers x∈[-1,11] → A0 (0,0) and A1 (10,0); excludes A2 (20,0).
    const sel = marqueeSelect(fixture(), { x0: 11, y0: 5, x1: -1, y1: -5 });
    expect(sel).toEqual([
      { pathIndex: 0, subpathIndex: 0, anchorIndex: 0 },
      { pathIndex: 0, subpathIndex: 0, anchorIndex: 1 },
    ]);
  });

  it('isSelected reflects membership', () => {
    const sel = [{ pathIndex: 0, subpathIndex: 0, anchorIndex: 1 }];
    expect(isSelected(sel, 0, 0, 1)).toBe(true);
    expect(isSelected(sel, 0, 0, 0)).toBe(false);
  });
});

// ── WI-P2-4 structural ops ──────────────────────────────────────────────────

// A single straight-line subpath (two corner anchors, all handles null).
function linePath() {
  return [
    {
      d: 'M0,0 L20,0',
      closed: false,
      dirty: false,
      model: {
        subpaths: [
          {
            closed: false,
            anchors: [
              { x: 0, y: 0, in: null, out: null, type: 'corner' },
              { x: 20, y: 0, in: null, out: null, type: 'corner' },
            ],
          },
        ],
      },
    },
  ];
}

// A single cubic segment (0,0)→(10,0): out (0,10), in (10,10).
function cubicPath() {
  return [
    {
      d: 'M0,0 C0,10 10,10 10,0',
      closed: false,
      dirty: false,
      model: {
        subpaths: [
          {
            closed: false,
            anchors: [
              { x: 0, y: 0, in: null, out: { x: 0, y: 10 }, type: 'corner' },
              { x: 10, y: 0, in: { x: 10, y: 10 }, out: null, type: 'corner' },
            ],
          },
        ],
      },
    },
  ];
}

// ── Slice 1: hitTestSegment on a LINE ───────────────────────────────────────
describe('hitTestSegment — line', () => {
  it('finds a point on a line segment within tol (t≈0.5)', () => {
    const hit = hitTestSegment(linePath(), { x: 10, y: 1 }, 2);
    expect(hit).toMatchObject({ pathIndex: 0, subpathIndex: 0, segIndex: 0 });
    expect(hit.t).toBeCloseTo(0.5, 6);
  });

  it('returns null when the point is off the segment (beyond tol)', () => {
    expect(hitTestSegment(linePath(), { x: 10, y: 10 }, 2)).toBeNull();
  });
});

// ── Slice 2: hitTestSegment on a CUBIC ──────────────────────────────────────
describe('hitTestSegment — cubic', () => {
  it('finds the nearest t on a curved segment', () => {
    // The cubic bows UP to a peak near (5, 7.5) at t=0.5; a point just above it
    // resolves to t≈0.5.
    const hit = hitTestSegment(cubicPath(), { x: 5, y: 9 }, 3);
    expect(hit).toMatchObject({ pathIndex: 0, subpathIndex: 0, segIndex: 0 });
    expect(hit.t).toBeCloseTo(0.5, 1);
  });

  it('returns null when far from the curve', () => {
    expect(hitTestSegment(cubicPath(), { x: 5, y: -20 }, 2)).toBeNull();
  });

  it('includes the closing segment of a CLOSED subpath', () => {
    const paths = linePath();
    paths[0].model.subpaths[0].closed = true;
    // Closing segment runs (20,0)→(0,0); midpoint (10,0) hits segIndex 1.
    const hit = hitTestSegment(paths, { x: 10, y: 0 }, 2);
    expect(hit).not.toBeNull();
  });
});

// ── Slice 3: addAnchorOnSegment on a LINE ───────────────────────────────────
describe('addAnchorOnSegment — line', () => {
  it('inserts a null-handle corner at the point; count +1; shape unchanged', () => {
    const { paths, target } = addAnchorOnSegment(linePath(), {
      pathIndex: 0,
      subpathIndex: 0,
      segIndex: 0,
      t: 0.5,
    });
    const anchors = paths[0].model.subpaths[0].anchors;
    expect(anchors).toHaveLength(3);
    expect(target).toEqual({ pathIndex: 0, subpathIndex: 0, anchorIndex: 1, part: 'anchor' });
    const mid = anchors[1];
    expect(mid).toMatchObject({ x: 10, y: 0, in: null, out: null, type: 'corner' });
    // Endpoints (still collinear) → the flattened line is unchanged.
    expect(anchors.map((a) => [a.x, a.y])).toEqual([[0, 0], [10, 0], [20, 0]]);
    expect(paths[0].dirty).toBe(true);
  });
});

// ── Slice 4: addAnchorOnSegment on a CUBIC (De Casteljau) ────────────────────
describe('addAnchorOnSegment — cubic', () => {
  it('splits via De Casteljau, preserving the curve shape (model-space check)', () => {
    const { paths, target } = addAnchorOnSegment(cubicPath(), {
      pathIndex: 0,
      subpathIndex: 0,
      segIndex: 0,
      t: 0.5,
    });
    const anchors = paths[0].model.subpaths[0].anchors;
    expect(anchors).toHaveLength(3);
    // De Casteljau split of p0(0,0) c1(0,10) c2(10,10) p3(10,0) at t=0.5:
    //   A(0,5) B(5,10) C(10,5) D(2.5,7.5) E(7.5,7.5) F(5,7.5)
    expect(anchors[0].out).toEqual({ x: 0, y: 5 }); // was (0,10) → A
    expect(anchors[2].in).toEqual({ x: 10, y: 5 }); // was (10,10) → C
    const mid = anchors[1];
    expect(mid).toMatchObject({ x: 5, y: 7.5, type: 'smooth' });
    expect(mid.in).toEqual({ x: 2.5, y: 7.5 }); // D
    expect(mid.out).toEqual({ x: 7.5, y: 7.5 }); // E
    expect(target.anchorIndex).toBe(1);
  });
});

// ── Slice 5: convertAnchor ──────────────────────────────────────────────────
describe('convertAnchor', () => {
  // Anchor (10,0) between (0,0) and (20,0) → symmetric horizontal handles.
  function threeCorners() {
    return [
      {
        d: 'M0,0 L10,0 L20,0',
        closed: false,
        dirty: false,
        model: {
          subpaths: [
            {
              closed: false,
              anchors: [
                { x: 0, y: 0, in: null, out: null, type: 'corner' },
                { x: 10, y: 0, in: null, out: null, type: 'corner' },
                { x: 20, y: 0, in: null, out: null, type: 'corner' },
              ],
            },
          ],
        },
      },
    ];
  }

  it("'smooth' synthesizes collinear symmetric handles tangent to the neighbours", () => {
    const next = convertAnchor(threeCorners(), { pathIndex: 0, subpathIndex: 0, anchorIndex: 1 }, 'smooth');
    const a = next[0].model.subpaths[0].anchors[1];
    expect(a.type).toBe('smooth');
    // direction is horizontal (through (0,0)→(20,0)); arms 1/3 of neighbour dist.
    expect(a.out).toEqual({ x: 10 + 10 / 3, y: 0 });
    expect(a.in).toEqual({ x: 10 - 10 / 3, y: 0 });
    const cross = (a.out.x - a.x) * (a.in.y - a.y) - (a.out.y - a.y) * (a.in.x - a.x);
    expect(cross).toBeCloseTo(0, 6); // collinear through the anchor
    expect(next[0].dirty).toBe(true);
  });

  it("'corner' nulls BOTH handles", () => {
    const smooth = convertAnchor(threeCorners(), { pathIndex: 0, subpathIndex: 0, anchorIndex: 1 }, 'smooth');
    const back = convertAnchor(smooth, { pathIndex: 0, subpathIndex: 0, anchorIndex: 1 }, 'corner');
    const a = back[0].model.subpaths[0].anchors[1];
    expect(a.in).toBeNull();
    expect(a.out).toBeNull();
    expect(a.type).toBe('corner');
  });
});

// ── setSmoothHandle (convert drag-pull) ─────────────────────────────────────
describe('setSmoothHandle', () => {
  it('sets out and mirrors in at EQUAL length; type smooth', () => {
    const next = setSmoothHandle(linePath(), { pathIndex: 0, subpathIndex: 0, anchorIndex: 0 }, { x: 3, y: 4 });
    const a = next[0].model.subpaths[0].anchors[0];
    expect(a.out).toEqual({ x: 3, y: 4 });
    expect(a.in).toEqual({ x: -3, y: -4 }); // mirror of out about anchor (0,0)
    expect(a.type).toBe('smooth');
    expect(next[0].dirty).toBe(true);
  });
});

// ── Slice 6: moveWholePath ──────────────────────────────────────────────────
describe('moveWholePath', () => {
  it('translates every anchor + handle by delta and dirties', () => {
    const next = moveWholePath(cubicPath(), 0, { x: 5, y: -2 });
    const anchors = next[0].model.subpaths[0].anchors;
    expect(anchors[0]).toMatchObject({ x: 5, y: -2 });
    expect(anchors[0].out).toEqual({ x: 5, y: 8 }); // (0,10)+delta
    expect(anchors[1]).toMatchObject({ x: 15, y: -2 });
    expect(anchors[1].in).toEqual({ x: 15, y: 8 }); // (10,10)+delta
    expect(next[0].dirty).toBe(true);
    // immutable
    expect(cubicPath()[0].model.subpaths[0].anchors[0].x).toBe(0);
  });
});

// ── Slice 7: appendAnchor (draw from scratch) ───────────────────────────────
describe('appendAnchor', () => {
  it('creates a path + subpath with one corner anchor from an EMPTY paths array', () => {
    const next = appendAnchor([], null, { x: 3, y: 4 });
    expect(next).toHaveLength(1);
    const sub = next[0].model.subpaths[0];
    expect(sub.anchors).toHaveLength(1);
    expect(sub.anchors[0]).toMatchObject({ x: 3, y: 4, in: null, out: null, type: 'corner' });
    expect(next[0].dirty).toBe(true);
  });

  it('a second append to the active subpath adds a second anchor', () => {
    const one = appendAnchor([], null, { x: 0, y: 0 });
    const two = appendAnchor(one, { pathIndex: 0, subpathIndex: 0 }, { x: 10, y: 0 });
    expect(two[0].model.subpaths[0].anchors).toHaveLength(2);
    expect(two[0].model.subpaths[0].anchors[1]).toMatchObject({ x: 10, y: 0 });
  });

  it('with outHandle makes a SMOOTH anchor (out set, in mirrored)', () => {
    const next = appendAnchor([], null, { x: 5, y: 5 }, { outHandle: { x: 8, y: 5 } });
    const a = next[0].model.subpaths[0].anchors[0];
    expect(a.type).toBe('smooth');
    expect(a.out).toEqual({ x: 8, y: 5 });
    expect(a.in).toEqual({ x: 2, y: 5 }); // mirror about (5,5)
  });
});

// ── Slice 8: closeSubpath ───────────────────────────────────────────────────
describe('closeSubpath', () => {
  it('sets closed so serialize emits Z', () => {
    let paths = appendAnchor([], null, { x: 0, y: 0 });
    paths = appendAnchor(paths, { pathIndex: 0, subpathIndex: 0 }, { x: 10, y: 0 });
    paths = appendAnchor(paths, { pathIndex: 0, subpathIndex: 0 }, { x: 10, y: 10 });
    const closed = closeSubpath(paths, 0, 0);
    expect(closed[0].model.subpaths[0].closed).toBe(true);
    expect(closed[0].closed).toBe(true);
    expect(anchorsToD(closed[0].model)).toMatch(/Z\s*$/);
  });
});

// ── WI-P2-5 Slice 1: hitTestRoot (point vs growth arm) ──────────────────────
describe('hitTestRoot', () => {
  const root = { x: 0, y: 0, angle: 0 }; // arm points +x
  it("returns 'point' when near the root point", () => {
    expect(hitTestRoot(root, { x: 0.2, y: -0.1 }, 1, 10)).toBe('point');
  });
  it("returns 'arm' when near the arm endpoint", () => {
    // arm end = (0,0) + 10*(cos0,sin0) = (10,0)
    expect(hitTestRoot(root, { x: 10.1, y: 0.2 }, 1, 10)).toBe('arm');
  });
  it("honours the arm angle when placing the endpoint", () => {
    const r = { x: 0, y: 0, angle: Math.PI / 2 }; // arm points +y
    expect(hitTestRoot(r, { x: 0, y: 10 }, 1, 10)).toBe('arm');
    expect(hitTestRoot(r, { x: 10, y: 0 }, 1, 10)).toBe(null); // old +x end is gone
  });
  it('returns null when far from both', () => {
    expect(hitTestRoot(root, { x: 5, y: 5 }, 1, 10)).toBe(null);
  });
});

// ── WI-P2-5 Slice 2: constrainTo45 (snap a vector to 45° increments) ─────────
describe('constrainTo45', () => {
  const origin = { x: 0, y: 0 };
  it('snaps a near-horizontal vector to 0° while preserving length', () => {
    const p = constrainTo45(origin, { x: 10, y: 1 });
    const len = Math.hypot(10, 1);
    expect(p.x).toBeCloseTo(len, 6);
    expect(p.y).toBeCloseTo(0, 6);
  });
  it('leaves an exact 45° vector unchanged', () => {
    const p = constrainTo45(origin, { x: 1, y: 1 });
    expect(p.x).toBeCloseTo(1, 6);
    expect(p.y).toBeCloseTo(1, 6);
  });
  it('snaps about a non-origin origin', () => {
    const p = constrainTo45({ x: 5, y: 5 }, { x: 5, y: 14 }); // straight down, 90°
    expect(p.x).toBeCloseTo(5, 6);
    expect(p.y).toBeCloseTo(14, 6);
  });
});

// ── WI-P2-5 Slice 3: angleFromArm ───────────────────────────────────────────
describe('angleFromArm', () => {
  it('is atan2(dy, dx) from the root to the point', () => {
    const root = { x: 0, y: 0, angle: 0 };
    expect(angleFromArm(root, { x: 1, y: 0 })).toBeCloseTo(0, 6);
    expect(angleFromArm(root, { x: 0, y: 1 })).toBeCloseTo(Math.PI / 2, 6);
    expect(angleFromArm(root, { x: -1, y: 0 })).toBeCloseTo(Math.PI, 6);
  });
});
