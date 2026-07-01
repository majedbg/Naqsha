import { describe, it, expect } from 'vitest';
import { parsePathD } from '../pathOps.js';

// ---------------------------------------------------------------------------
// Cubic-curve flattening in parsePathD
//
// These tests pin the behaviour of C / S command flattening. The parser must
// evaluate cubics in plain JS (no DOM getPointAtLength) and sample each cubic
// into a polyline. The control points must NEVER surface as anchors.
//
// The flattening constant is 16 sub-steps per cubic; a single M + one cubic
// therefore yields 1 (the M anchor) + 16 (curve samples) = 17 points.
// ---------------------------------------------------------------------------

const STEPS = 16; // must match FLATTEN_STEPS in pathOps.js

// Independent analytic cubic evaluator (Bernstein basis) used by the tests to
// cross-check the parser's sampled output.
function cubicAt(p0, c1, c2, p3, t) {
  const mt = 1 - t;
  const a = mt * mt * mt;
  const b = 3 * mt * mt * t;
  const c = 3 * mt * t * t;
  const d = t * t * t;
  return [
    a * p0[0] + b * c1[0] + c * c2[0] + d * p3[0],
    a * p0[1] + b * c1[1] + c * c2[1] + d * p3[1],
  ];
}

describe('parsePathD — cubic C flattening', () => {
  it('flattens a colinear cubic M0,0 C10,0 20,0 30,0', () => {
    const { points, closed } = parsePathD('M0,0 C10,0 20,0 30,0');
    // 1 anchor + STEPS samples
    expect(points.length).toBe(STEPS + 1);
    // start and end pinned exactly
    expect(points[0]).toEqual([0, 0]);
    expect(points[points.length - 1][0]).toBeCloseTo(30, 12);
    expect(points[points.length - 1][1]).toBeCloseTo(0, 12);
    // every sample sits on the x-axis (control pts are colinear on y=0)
    for (const [, y] of points) expect(Math.abs(y)).toBeLessThan(1e-9);
    // control points must not appear verbatim as standalone extra anchors:
    // the point count already proves this (only STEPS+1 points), and the
    // halfway sample equals the analytic B(0.5).
    const halfway = points[STEPS / 2]; // index 8 -> t = 8/16 = 0.5
    const expected = cubicAt([0, 0], [10, 0], [20, 0], [30, 0], 0.5);
    expect(halfway[0]).toBeCloseTo(expected[0], 12); // = 15
    expect(halfway[1]).toBeCloseTo(expected[1], 12); // = 0
    expect(closed).toBe(false);
  });

  it('flattens a curved cubic M0,0 C0,100 100,100 100,0 with correct B(0.5)', () => {
    const { points } = parsePathD('M0,0 C0,100 100,100 100,0');
    expect(points.length).toBe(STEPS + 1);
    expect(points[0]).toEqual([0, 0]);
    expect(points[points.length - 1][0]).toBeCloseTo(100, 12);
    expect(points[points.length - 1][1]).toBeCloseTo(0, 12);
    // analytic B(0.5) = (50, 75)
    const expected = cubicAt([0, 0], [0, 100], [100, 100], [100, 0], 0.5);
    expect(expected).toEqual([50, 75]);
    const halfway = points[STEPS / 2];
    expect(halfway[0]).toBeCloseTo(50, 12);
    expect(halfway[1]).toBeCloseTo(75, 12);
  });

  it('pins first and last flattened points to P0 and end anchor exactly', () => {
    const { points } = parsePathD('M3.5,7.25 C10,20 -5,40 42.5,-13.75');
    expect(points[0][0]).toBe(3.5);
    expect(points[0][1]).toBe(7.25);
    expect(points[points.length - 1][0]).toBe(42.5);
    expect(points[points.length - 1][1]).toBe(-13.75);
  });

  it('never emits the control points of a cubic as vertices', () => {
    const { points } = parsePathD('M0,0 C10,0 20,0 30,0');
    // Neither control point (10,0) nor (20,0) is an on-curve sample here:
    // sample t=1/16 gives a tiny x, none land exactly on a control point.
    const hasC1 = points.some((p) => p[0] === 10 && p[1] === 0);
    const hasC2 = points.some((p) => p[0] === 20 && p[1] === 0);
    expect(hasC1).toBe(false);
    expect(hasC2).toBe(false);
  });
});

describe('parsePathD — smooth cubic S reflection', () => {
  it('reflects the previous C control point about the current point', () => {
    // M0,0 C0,50 50,50 50,0  S100,-50 100,0
    // After the C: current point = (50,0), prev 2nd control = (50,50).
    // S first control = reflection = 2*(50,0) - (50,50) = (50,-50).
    const { points } = parsePathD('M0,0 C0,50 50,50 50,0 S100,-50 100,0');
    // 1 anchor + STEPS (C) + STEPS (S)
    expect(points.length).toBe(1 + STEPS + STEPS);
    // S segment endpoint pinned
    expect(points[points.length - 1][0]).toBeCloseTo(100, 12);
    expect(points[points.length - 1][1]).toBeCloseTo(0, 12);

    // Interior sample of the S cubic at t=0.5.
    // S samples occupy indices [1+STEPS .. 1+2*STEPS]; t=0.5 -> offset STEPS/2.
    const sHalfIdx = 1 + STEPS + STEPS / 2 - 1; // sample j=STEPS/2 within S
    const reflected = cubicAt([50, 0], [50, -50], [100, -50], [100, 0], 0.5);
    expect(reflected).toEqual([75, -37.5]);
    expect(points[sHalfIdx][0]).toBeCloseTo(reflected[0], 12);
    expect(points[sHalfIdx][1]).toBeCloseTo(reflected[1], 12);
  });

  it('treats S with no preceding C/S as first control = P0', () => {
    // A leading S after M: prev control is null, so c1 = P0 = (0,0).
    const { points } = parsePathD('M0,0 S10,10 20,0');
    expect(points.length).toBe(1 + STEPS);
    const expected = cubicAt([0, 0], [0, 0], [10, 10], [20, 0], 0.5);
    const halfway = points[STEPS / 2];
    expect(halfway[0]).toBeCloseTo(expected[0], 12);
    expect(halfway[1]).toBeCloseTo(expected[1], 12);
    expect(points[points.length - 1][0]).toBeCloseTo(20, 12);
    expect(points[points.length - 1][1]).toBeCloseTo(0, 12);
  });
});

describe('parsePathD — implicit polybezier repetition', () => {
  it('handles one C letter followed by two coordinate sets', () => {
    // M0,0 C0,10 10,10 10,0 10,-10 20,-10 20,0
    // First cubic ends at (10,0); second cubic (implicit C) ends at (20,0).
    const { points } = parsePathD('M0,0 C0,10 10,10 10,0 10,-10 20,-10 20,0');
    expect(points.length).toBe(1 + STEPS + STEPS);
    // continuity: the junction sample equals (10,0) exactly (end of cubic 1)
    expect(points[STEPS][0]).toBeCloseTo(10, 12);
    expect(points[STEPS][1]).toBeCloseTo(0, 12);
    // final endpoint
    expect(points[points.length - 1][0]).toBeCloseTo(20, 12);
    expect(points[points.length - 1][1]).toBeCloseTo(0, 12);
  });
});

describe('parsePathD — M/L/Z regression (byte-identical behaviour)', () => {
  it('parses a pure M/L/Z polygon unchanged', () => {
    const { points, closed } = parsePathD('M0,0 L10,0 L10,10 Z');
    expect(points).toEqual([[0, 0], [10, 0], [10, 10]]);
    expect(closed).toBe(true);
  });
});
