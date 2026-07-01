import { describe, it, expect } from 'vitest';
import { catmullRomToBezier } from '../catmullRomBezier.js';

describe('catmullRomToBezier', () => {
  it('interpolates every anchor: start === points[0], K-1 segments, seg.end === next anchor', () => {
    const points = [
      { x: 0, y: 0 },
      { x: 10, y: 20 },
      { x: 30, y: -5 },
      { x: 50, y: 40 },
      { x: 70, y: 10 },
    ];
    const { start, segments } = catmullRomToBezier(points);
    expect(start).toEqual(points[0]);
    expect(segments.length).toBe(points.length - 1);
    for (let i = 0; i < segments.length; i++) {
      expect(segments[i].end).toEqual(points[i + 1]);
    }
  });

  it('K === 2: single straight cubic with control points at 1/6 and 5/6', () => {
    const P0 = { x: 0, y: 0 };
    const P1 = { x: 6, y: 12 };
    const { start, segments } = catmullRomToBezier([P0, P1]);
    expect(start).toEqual(P0);
    expect(segments.length).toBe(1);
    const { c1, c2, end } = segments[0];
    // c1 = P0 + (P1 - P0)/6 -> (1, 2)
    expect(c1.x).toBeCloseTo(1, 10);
    expect(c1.y).toBeCloseTo(2, 10);
    // c2 = P1 - (P1 - P0)/6 -> (5, 10)
    expect(c2.x).toBeCloseTo(5, 10);
    expect(c2.y).toBeCloseTo(10, 10);
    expect(end).toEqual(P1);
  });

  it('4 equally-spaced colinear points on y=0 -> all control points have y ≈ 0 (straight stays straight)', () => {
    const points = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
      { x: 3, y: 0 },
    ];
    const { segments } = catmullRomToBezier(points);
    for (const seg of segments) {
      expect(seg.c1.y).toBeCloseTo(0, 10);
      expect(seg.c2.y).toBeCloseTo(0, 10);
      expect(seg.end.y).toBeCloseTo(0, 10);
    }
  });

  it('pinned boundary: first c1 = P0 + (P1-P0)/6 exactly; last c2 = P_last - (P_last - P_prev)/6 exactly', () => {
    const points = [
      { x: 2, y: 3 },
      { x: 8, y: 9 },
      { x: 14, y: -3 },
      { x: 20, y: 21 },
    ];
    const { segments } = catmullRomToBezier(points);
    const n = points.length;
    const P0 = points[0];
    const P1 = points[1];
    const firstC1 = { x: P0.x + (P1.x - P0.x) / 6, y: P0.y + (P1.y - P0.y) / 6 };
    expect(segments[0].c1).toEqual(firstC1);

    const Plast = points[n - 1];
    const Pprev = points[n - 2];
    const lastC2 = {
      x: Plast.x - (Plast.x - Pprev.x) / 6,
      y: Plast.y - (Plast.y - Pprev.y) / 6,
    };
    expect(segments[segments.length - 1].c2).toEqual(lastC2);
  });

  it('interior segment matches the uniform Catmull-Rom -> Bezier formula computed independently', () => {
    const points = [
      { x: 1, y: 2 },
      { x: 4, y: 8 },
      { x: 9, y: 5 },
      { x: 13, y: 11 },
    ];
    const { segments } = catmullRomToBezier(points);
    // interior segment index 1: P_i = points[1], P_{i+1} = points[2],
    // neighbors P_{i-1} = points[0], P_{i+2} = points[3]
    const Pm1 = points[0];
    const Pi = points[1];
    const Pi1 = points[2];
    const Pi2 = points[3];
    const c1 = { x: Pi.x + (Pi1.x - Pm1.x) / 6, y: Pi.y + (Pi1.y - Pm1.y) / 6 };
    const c2 = { x: Pi1.x - (Pi2.x - Pi.x) / 6, y: Pi1.y - (Pi2.y - Pi.y) / 6 };
    expect(segments[1].c1).toEqual(c1);
    expect(segments[1].c2).toEqual(c2);
    expect(segments[1].end).toEqual(Pi1);
  });

  it('K < 2 edge cases: gracefully returns empty segments', () => {
    const single = catmullRomToBezier([{ x: 5, y: 7 }]);
    expect(single.start).toEqual({ x: 5, y: 7 });
    expect(single.segments).toEqual([]);

    const empty = catmullRomToBezier([]);
    expect(empty.start).toEqual({ x: 0, y: 0 });
    expect(empty.segments).toEqual([]);
  });

  it('is deterministic and does not mutate the input array or its points', () => {
    const points = [
      { x: 0, y: 0 },
      { x: 5, y: 10 },
      { x: 12, y: 4 },
    ];
    const snapshot = JSON.parse(JSON.stringify(points));
    const a = catmullRomToBezier(points);
    const b = catmullRomToBezier(points);
    expect(a).toEqual(b);
    // input untouched
    expect(points).toEqual(snapshot);
    // returned point objects are fresh, not aliases of input
    expect(a.start).not.toBe(points[0]);
    expect(a.segments[0].end).not.toBe(points[1]);
  });
});
