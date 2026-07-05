import { describe, it, expect } from 'vitest';
import {
  pointToSegmentDistance,
  largestEmptyCircleRadius,
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
