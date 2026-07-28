import { describe, it, expect } from 'vitest';
import {
  pointToSegmentDistance,
  largestEmptyCircleRadius,
  largestEmptyCircleParts,
  fitsAt,
} from './emptyCircle.js';

describe('pointToSegmentDistance', () => {
  it('returns the perpendicular distance when the foot falls inside the segment', () => {
    const d = pointToSegmentDistance({ x: 5, y: 3 }, { x: 0, y: 0 }, { x: 10, y: 0 });
    expect(d).toBeCloseTo(3, 9);
  });

  it('clamps to the nearest endpoint when the foot falls beyond it', () => {
    const d = pointToSegmentDistance({ x: 15, y: 3 }, { x: 0, y: 0 }, { x: 10, y: 0 });
    expect(d).toBeCloseTo(Math.sqrt(5 * 5 + 3 * 3), 9);
  });

  it('clamps to the other endpoint when the foot falls beyond it in the opposite direction', () => {
    const d = pointToSegmentDistance({ x: -4, y: 3 }, { x: 0, y: 0 }, { x: 10, y: 0 });
    expect(d).toBeCloseTo(5, 9);
  });

  it('handles a degenerate segment (a === b) by returning distance to the point', () => {
    const a = { x: 2, y: 2 };
    const b = { x: 2, y: 2 };
    const d = pointToSegmentDistance({ x: 5, y: 6 }, a, b);
    expect(d).toBeCloseTo(5, 9);
  });
});

describe('largestEmptyCircleRadius', () => {
  it('no obstacles + rect boundary: returns the distance to the nearest wall', () => {
    const r = largestEmptyCircleRadius({ x: 10, y: 10 }, [], { type: 'rect', width: 100, height: 100 });
    expect(r).toBeCloseTo(10, 9);
  });

  it('single obstacle: returns dist(center,obstacle) - obstacle.r', () => {
    const center = { x: 50, y: 50 };
    const obstacle = { x: 70, y: 50, r: 5 };
    const r = largestEmptyCircleRadius(center, [obstacle], { type: 'rect', width: 100, height: 100 });
    // dist = 20, so obstacle bound = 15; wall bound = 50 → min is 15
    expect(r).toBeCloseTo(15, 9);
  });

  it('two obstacles: returns the min of the two obstacle bounds', () => {
    const center = { x: 50, y: 50 };
    const obstacleA = { x: 70, y: 50, r: 5 }; // bound 15
    const obstacleB = { x: 50, y: 65, r: 3 }; // dist 15, bound 12
    const r = largestEmptyCircleRadius(center, [obstacleA, obstacleB], {
      type: 'rect',
      width: 100,
      height: 100,
    });
    expect(r).toBeCloseTo(12, 9);
  });

  it('center inside an obstacle: returns a value <= 0', () => {
    const center = { x: 50, y: 50 };
    const obstacle = { x: 52, y: 50, r: 10 }; // dist 2, bound -8
    const r = largestEmptyCircleRadius(center, [obstacle], null);
    expect(r).toBeLessThanOrEqual(0);
    expect(r).toBeCloseTo(-8, 9);
  });

  it('center outside the rect boundary: returns a value <= 0', () => {
    const r = largestEmptyCircleRadius({ x: -5, y: 10 }, [], { type: 'rect', width: 100, height: 100 });
    expect(r).toBeLessThanOrEqual(0);
    expect(r).toBeCloseTo(-5, 9);
  });

  it('null boundary + no obstacles: returns Infinity', () => {
    const r = largestEmptyCircleRadius({ x: 0, y: 0 }, [], null);
    expect(r).toBe(Infinity);
  });

  it('polygon boundary: center at centroid of a square returns distance to the nearest edge', () => {
    const square = {
      type: 'polygon',
      points: [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
        { x: 0, y: 10 },
      ],
    };
    const r = largestEmptyCircleRadius({ x: 5, y: 5 }, [], square);
    expect(r).toBeCloseTo(5, 9);
  });

  it('polygon boundary: center outside the polygon returns a negative value', () => {
    const square = {
      type: 'polygon',
      points: [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
        { x: 0, y: 10 },
      ],
    };
    const r = largestEmptyCircleRadius({ x: 15, y: 5 }, [], square);
    expect(r).toBeLessThan(0);
    expect(r).toBeCloseTo(-5, 9);
  });

  it('is deterministic: repeated calls with identical inputs produce equal results', () => {
    const center = { x: 50, y: 50 };
    const obstacles = [
      { x: 70, y: 50, r: 5 },
      { x: 50, y: 65, r: 3 },
    ];
    const boundary = { type: 'rect', width: 100, height: 100 };
    const a = largestEmptyCircleRadius(center, obstacles, boundary);
    const b = largestEmptyCircleRadius(center, obstacles, boundary);
    expect(a).toEqual(b);
  });
});

/**
 * The pre-split implementation of `largestEmptyCircleRadius`, kept verbatim as
 * the byte-identity oracle. The whole safety argument of the boundary/obstacle
 * split is that the shipped function does not move by one ULP against THIS —
 * so it must live here independently, not be expressed in terms of the split.
 *
 * `signedBoundaryDistance` is private, so the seed is sourced through
 * `largestEmptyCircleParts(center, [], boundary).boundary`. With an empty
 * obstacle list that call is exactly `signedBoundaryDistance` and nothing else,
 * which keeps the oracle honest about the accumulation loop below — the part
 * that actually changed.
 */
function fusedReference(center, obstacles = [], boundary = null) {
  let radius = largestEmptyCircleParts(center, [], boundary).boundary;

  for (const obstacle of obstacles) {
    const dist = Math.hypot(center.x - obstacle.x, center.y - obstacle.y);
    const bound = dist - obstacle.r;
    if (bound < radius) radius = bound;
  }

  return radius;
}

describe('largestEmptyCircleParts', () => {
  const rect = { type: 'rect', width: 100, height: 100 };

  describe('the two terms, independently', () => {
    it('reports the boundary term and Infinity for the obstacle term when there are no obstacles', () => {
      const p = largestEmptyCircleParts({ x: 10, y: 10 }, [], rect);
      expect(p.boundary).toBeCloseTo(10, 9);
      expect(p.obstacles).toBe(Infinity);
      expect(p.obstacle).toBe(null);
    });

    it('reports Infinity for the boundary term when the boundary is null', () => {
      const obstacle = { x: 70, y: 50, r: 5 };
      const p = largestEmptyCircleParts({ x: 50, y: 50 }, [obstacle], null);
      expect(p.boundary).toBe(Infinity);
      expect(p.obstacles).toBeCloseTo(15, 9);
      expect(p.obstacle).toBe(obstacle);
    });

    it('reports Infinity for both terms when the boundary is null and the obstacle list is empty', () => {
      const p = largestEmptyCircleParts({ x: 0, y: 0 }, [], null);
      expect(p.boundary).toBe(Infinity);
      expect(p.obstacles).toBe(Infinity);
      expect(p.obstacle).toBe(null);
    });

    it('keeps the terms apart when the boundary binds — the obstacle term stays larger', () => {
      // Wall at 3; the obstacle clearance is 15. The boundary is the binding term.
      const obstacle = { x: 23, y: 3, r: 5 };
      const p = largestEmptyCircleParts({ x: 3, y: 3 }, [obstacle], rect);
      expect(p.boundary).toBeCloseTo(3, 9);
      expect(p.obstacles).toBeCloseTo(15, 9);
      expect(Math.min(p.boundary, p.obstacles)).toBeCloseTo(3, 9);
    });

    it('keeps the terms apart when an obstacle binds — the boundary term stays larger', () => {
      const obstacle = { x: 70, y: 50, r: 5 };
      const p = largestEmptyCircleParts({ x: 50, y: 50 }, [obstacle], rect);
      expect(p.boundary).toBeCloseTo(50, 9);
      expect(p.obstacles).toBeCloseTo(15, 9);
      expect(Math.min(p.boundary, p.obstacles)).toBeCloseTo(15, 9);
    });

    it('reports the boundary term for a polygon boundary independently of the obstacles', () => {
      const square = {
        type: 'polygon',
        points: [
          { x: 0, y: 0 },
          { x: 10, y: 0 },
          { x: 10, y: 10 },
          { x: 0, y: 10 },
        ],
      };
      const obstacle = { x: 5, y: 8, r: 1 }; // dist 3, bound 2
      const p = largestEmptyCircleParts({ x: 5, y: 5 }, [obstacle], square);
      expect(p.boundary).toBeCloseTo(5, 9);
      expect(p.obstacles).toBeCloseTo(2, 9);
      expect(p.obstacle).toBe(obstacle);
    });
  });

  describe('the winning obstacle identity', () => {
    it('names the obstacle that produced the obstacle term', () => {
      const near = { x: 50, y: 65, r: 3 }; // dist 15, bound 12
      const far = { x: 70, y: 50, r: 5 }; // dist 20, bound 15
      const p = largestEmptyCircleParts({ x: 50, y: 50 }, [far, near], rect);
      expect(p.obstacles).toBeCloseTo(12, 9);
      expect(p.obstacle).toBe(near);
    });

    it('is null when the obstacle list is empty', () => {
      expect(largestEmptyCircleParts({ x: 50, y: 50 }, [], rect).obstacle).toBe(null);
    });

    it('selects the FIRST obstacle encountered when two obstacle bounds tie', () => {
      const first = { x: 70, y: 50, r: 5 }; // bound 15
      const second = { x: 50, y: 70, r: 5 }; // bound 15, identical value
      const p = largestEmptyCircleParts({ x: 50, y: 50 }, [first, second], rect);
      expect(p.obstacles).toBeCloseTo(15, 9);
      expect(p.obstacle).toBe(first);
    });

    it('is returned unconditionally — it is NOT nulled out when the boundary term is smaller', () => {
      // Wall at 3 beats the obstacle clearance of 15, but the obstacle that
      // produced the obstacle term is still named. Deriving `capBy` from the
      // two terms is the consumer's job, not this function's.
      const obstacle = { x: 23, y: 3, r: 5 };
      const p = largestEmptyCircleParts({ x: 3, y: 3 }, [obstacle], rect);
      expect(p.boundary).toBeCloseTo(3, 9);
      expect(p.obstacle).toBe(obstacle);
    });

    it('is still returned when the boundary exactly ties the obstacle term', () => {
      // Wall at 15 and obstacle clearance at 15.
      const obstacle = { x: 35, y: 15, r: 5 }; // dist 20, bound 15
      const p = largestEmptyCircleParts({ x: 15, y: 15 }, [obstacle], rect);
      expect(p.boundary).toBe(15);
      expect(p.obstacles).toBe(15);
      expect(p.obstacle).toBe(obstacle);
    });

    it('is null when the list is non-empty but every obstacle bound is NaN', () => {
      // No obstacle ever displaces the seed, so there is no winner to name.
      const p = largestEmptyCircleParts({ x: 50, y: 50 }, [{ x: NaN, y: 50, r: 5 }], rect);
      expect(p.obstacles).toBe(Infinity);
      expect(p.obstacle).toBe(null);
    });

    it('names the finite winner when a NaN obstacle is mixed with a finite one', () => {
      const nan = { x: NaN, y: 50, r: 5 };
      const finite = { x: 70, y: 50, r: 5 }; // bound 15
      const p = largestEmptyCircleParts({ x: 50, y: 50 }, [nan, finite], rect);
      expect(p.obstacles).toBeCloseTo(15, 9);
      expect(p.obstacle).toBe(finite);
    });
  });

  describe('NaN obstacle clearances never displace the boundary distance', () => {
    it('leaves the obstacle term at Infinity so the boundary survives the min', () => {
      const center = { x: 10, y: 10 };
      const p = largestEmptyCircleParts(center, [{ x: NaN, y: 10, r: 5 }], rect);
      // Today's fused loop returns the boundary distance b, because `NaN < b`
      // is false. Math.min(b, Infinity) must reproduce exactly that.
      expect(p.obstacles).toBe(Infinity);
      expect(Object.is(Math.min(p.boundary, p.obstacles), p.boundary)).toBe(true);
      expect(largestEmptyCircleRadius(center, [{ x: NaN, y: 10, r: 5 }], rect)).toBeCloseTo(10, 9);
    });

    it('does not poison a finite winning obstacle', () => {
      const center = { x: 50, y: 50 };
      const obstacles = [{ x: NaN, y: 50, r: 5 }, { x: 70, y: 50, r: 5 }];
      expect(largestEmptyCircleRadius(center, obstacles, rect)).toBeCloseTo(15, 9);
    });

    it('propagates a NaN boundary term, which no obstacle can displace', () => {
      const center = { x: NaN, y: 10 };
      const p = largestEmptyCircleParts(center, [{ x: 70, y: 50, r: 5 }], rect);
      expect(Number.isNaN(p.boundary)).toBe(true);
      expect(Number.isNaN(largestEmptyCircleRadius(center, [{ x: 70, y: 50, r: 5 }], rect))).toBe(true);
    });
  });

  describe('signed-zero behaviour is unreachable through the public interface', () => {
    it('returns +0, not -0, when the boundary sits exactly on a wall alongside a touching obstacle', () => {
      // `Math.hypot` never returns -0, and a finite `a - b` is -0 only when
      // a is -0 and b is +0 — so an obstacle bound of -0 cannot be constructed.
      // If it could, Math.min(+0, -0) would return -0 where the fused loop
      // returned +0. This pins that the case stays unreachable.
      const center = { x: 0, y: 50 };
      const obstacles = [{ x: 10, y: 50, r: 10 }, { x: 20, y: 50, r: -0 }];
      const p = largestEmptyCircleParts(center, obstacles, rect);
      expect(Object.is(p.boundary, 0)).toBe(true); // +0
      expect(Object.is(p.obstacles, -0)).toBe(false);
      expect(Object.is(largestEmptyCircleRadius(center, obstacles, rect), 0)).toBe(true); // +0
    });
  });

  describe('reduces to largestEmptyCircleRadius exactly', () => {
    const square = {
      type: 'polygon',
      points: [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
        { x: 0, y: 10 },
      ],
    };

    // Every input triple the existing suite covers, plus the edge cases the
    // split has to preserve: NaN obstacles, a NaN boundary, exact ties, zeroes.
    const cases = [
      ['no obstacles + rect boundary', { x: 10, y: 10 }, [], rect],
      ['single obstacle', { x: 50, y: 50 }, [{ x: 70, y: 50, r: 5 }], rect],
      [
        'two obstacles',
        { x: 50, y: 50 },
        [{ x: 70, y: 50, r: 5 }, { x: 50, y: 65, r: 3 }],
        rect,
      ],
      ['center inside an obstacle, null boundary', { x: 50, y: 50 }, [{ x: 52, y: 50, r: 10 }], null],
      ['center outside the rect boundary', { x: -5, y: 10 }, [], rect],
      ['null boundary + no obstacles', { x: 0, y: 0 }, [], null],
      ['polygon boundary, center at the centroid', { x: 5, y: 5 }, [], square],
      ['polygon boundary, center outside', { x: 15, y: 5 }, [], square],
      ['fitsAt fixture', { x: 50, y: 50 }, [{ x: 70, y: 50, r: 5 }], rect],
      ['boundary binds over the obstacle', { x: 3, y: 3 }, [{ x: 23, y: 3, r: 5 }], rect],
      ['boundary/obstacle exact tie', { x: 15, y: 15 }, [{ x: 35, y: 15, r: 5 }], rect],
      ['NaN obstacle alone', { x: 10, y: 10 }, [{ x: NaN, y: 10, r: 5 }], rect],
      [
        'NaN obstacle mixed with a finite winner',
        { x: 50, y: 50 },
        [{ x: NaN, y: 50, r: 5 }, { x: 70, y: 50, r: 5 }],
        rect,
      ],
      ['NaN obstacle radius', { x: 50, y: 50 }, [{ x: 70, y: 50, r: NaN }], rect],
      ['NaN boundary term', { x: NaN, y: 10 }, [{ x: 70, y: 50, r: 5 }], rect],
      ['NaN boundary term, no obstacles', { x: NaN, y: 10 }, [], rect],
      ['zero boundary distance on the wall', { x: 0, y: 50 }, [{ x: 10, y: 50, r: 10 }], rect],
      ['negative-zero obstacle radius', { x: 20, y: 50 }, [{ x: 20, y: 50, r: -0 }], rect],
      ['infinite obstacle radius', { x: 50, y: 50 }, [{ x: 70, y: 50, r: Infinity }], rect],
      ['obstacle at the center', { x: 50, y: 50 }, [{ x: 50, y: 50, r: 0 }], rect],
      ['tied obstacle bounds', { x: 50, y: 50 }, [{ x: 70, y: 50, r: 5 }, { x: 50, y: 70, r: 5 }], rect],
      ['degenerate rect boundary', { x: 5, y: 5 }, [], { type: 'rect', width: 0, height: 0 }],
      ['unknown boundary type', { x: 5, y: 5 }, [{ x: 8, y: 5, r: 1 }], { type: 'circle', r: 4 }],
    ];

    it.each(cases)('%s', (_label, center, obstacles, boundary) => {
      const p = largestEmptyCircleParts(center, obstacles, boundary);
      const reduced = Math.min(p.boundary, p.obstacles);
      const actual = largestEmptyCircleRadius(center, obstacles, boundary);
      // Object.is, not toEqual: it distinguishes -0 from +0 and matches NaN.
      expect(Object.is(reduced, actual)).toBe(true);
      // ...and against the pre-split loop, which is the property that matters.
      expect(Object.is(actual, fusedReference(center, obstacles, boundary))).toBe(true);
    });

    it('agrees with fitsAt at exact equality with the reduced radius', () => {
      const center = { x: 50, y: 50 };
      const obstacles = [{ x: 70, y: 50, r: 5 }];
      const p = largestEmptyCircleParts(center, obstacles, rect);
      const reduced = Math.min(p.boundary, p.obstacles);
      expect(fitsAt(center, reduced, obstacles, rect)).toBe(true);
    });

    it('matches the pre-split loop across a deterministic randomized sweep', () => {
      // Converts "byte-identical for any input" from an argument into a check.
      // A fixed-seed LCG keeps this reproducible; the generators deliberately
      // emit -0, NaN and +/-Infinity so the signed-zero and NaN paths — where
      // the seed change from the boundary distance to Infinity could in
      // principle diverge — are actually exercised.
      let seed = 0x2f6e2b1;
      const next = () => {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        return seed / 0x7fffffff;
      };
      const oddValue = (base) => {
        const roll = next();
        if (roll < 0.04) return NaN;
        if (roll < 0.07) return Infinity;
        if (roll < 0.1) return -Infinity;
        if (roll < 0.13) return -0;
        if (roll < 0.16) return 0;
        return base;
      };

      const square = {
        type: 'polygon',
        points: [
          { x: 0, y: 0 },
          { x: 60, y: 0 },
          { x: 60, y: 60 },
          { x: 0, y: 60 },
        ],
      };

      let checked = 0;
      for (let i = 0; i < 4000; i += 1) {
        const boundaryRoll = next();
        const boundary =
          boundaryRoll < 0.34 ? null : boundaryRoll < 0.67 ? rect : square;

        // Centers land both inside and well outside the region.
        const center = {
          x: oddValue(next() * 160 - 30),
          y: oddValue(next() * 160 - 30),
        };

        const count = Math.floor(next() * 6); // 0..5
        const obstacles = [];
        for (let k = 0; k < count; k += 1) {
          obstacles.push({
            x: oddValue(next() * 160 - 30),
            y: oddValue(next() * 160 - 30),
            r: oddValue(next() * 40 - 8), // includes zero and negative radii
          });
        }

        const actual = largestEmptyCircleRadius(center, obstacles, boundary);
        const expected = fusedReference(center, obstacles, boundary);
        if (!Object.is(actual, expected)) {
          throw new Error(
            `byte-identity broke at iteration ${i}: got ${actual}, ` +
              `fused loop gives ${expected}. Input: ` +
              JSON.stringify({ center, obstacles, boundary }),
          );
        }

        // The parts must also reduce to that same value.
        const p = largestEmptyCircleParts(center, obstacles, boundary);
        expect(Object.is(Math.min(p.boundary, p.obstacles), expected)).toBe(true);
        checked += 1;
      }

      expect(checked).toBe(4000);
    });

    it('uses the default arguments identically in both functions', () => {
      const center = { x: 0, y: 0 };
      const p = largestEmptyCircleParts(center);
      expect(Object.is(Math.min(p.boundary, p.obstacles), largestEmptyCircleRadius(center))).toBe(true);
      expect(p.obstacle).toBe(null);
    });
  });
});

describe('fitsAt', () => {
  const center = { x: 50, y: 50 };
  const obstacle = { x: 70, y: 50, r: 5 }; // LEC bound from this obstacle alone = 15
  const boundary = { type: 'rect', width: 100, height: 100 };

  it('returns true when the requested radius is below the LEC radius', () => {
    expect(fitsAt(center, 10, [obstacle], boundary)).toBe(true);
  });

  it('returns false when the requested radius is above the LEC radius', () => {
    expect(fitsAt(center, 20, [obstacle], boundary)).toBe(false);
  });

  it('returns true at exact equality with the LEC radius', () => {
    expect(fitsAt(center, 15, [obstacle], boundary)).toBe(true);
  });
});
