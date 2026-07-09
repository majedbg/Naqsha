import { describe, it, expect } from 'vitest';
import { runEstimate } from './runEstimate.js';
import { pathStats } from './pathOps.js';
import {
  DRAW_SPEED,
  TRAVEL_SPEED,
  LASER_RAPID_SPEED,
  PEN_SWAP_SEC,
} from './constants.js';

// ---------------------------------------------------------------------------
// runEstimate — the profile-aware Run Plan time model (ADR-0002).
//
// Test idiom mirrors pathOps.test.js. We never hardcode mm figures: every
// expectation is derived from pathStats() so the test tracks the same geometry
// the model consumes. Laser math cases use SINGLE-path groups on purpose —
// pathStats only accrues travel BETWEEN paths, so a one-path group has
// travelMm=0 and sec === drawSec exactly, making the speed/passes ratios exact.
// ---------------------------------------------------------------------------

// One path = one horizontal segment; length is pure draw (no travel).
const line = (x0, y0, x1, y1) => ({ points: [[x0, y0], [x1, y1]], closed: false });

// A group in machine EXECUTION order: { opId, operation, paths }. The Operation
// carries machineParams (speed/passes for laser, penSlot for plotter, passes for
// drag). paths are post-Optimization polylines in px.
const group = (opId, machineParams, paths, process = 'cut') => ({
  opId,
  operation: { id: opId, name: opId, process, machineParams },
  paths,
});

describe('runEstimate — Laser Machine Profile', () => {
  it('halving an Operation speed roughly doubles its seconds', () => {
    const paths = [line(0, 0, 100, 0)];
    const fast = runEstimate([group('a', { speed: 100, passes: 1 }, paths)], 'laser');
    const slow = runEstimate([group('a', { speed: 50, passes: 1 }, paths)], 'laser');
    expect(slow.totalSec).toBeCloseTo(fast.totalSec * 2, 6);
  });

  it('doubling an Operation passes doubles its draw seconds', () => {
    const paths = [line(0, 0, 100, 0)]; // single path → travelMm=0 → sec === drawSec
    const one = runEstimate([group('a', { speed: 100, passes: 1 }, paths)], 'laser');
    const two = runEstimate([group('a', { speed: 100, passes: 2 }, paths)], 'laser');
    expect(two.perOp[0].sec).toBeCloseTo(one.perOp[0].sec * 2, 6);
    expect(two.perOp[0].passes).toBe(2);
  });

  it('travels at LASER_RAPID_SPEED, not the AxiDraw TRAVEL_SPEED', () => {
    const paths = [line(0, 0, 100, 0), line(0, 200, 100, 200)]; // gap → travelMm>0
    const { drawMm, travelMm } = pathStats(paths);
    const r = runEstimate([group('x', { speed: 200, passes: 2 }, paths)], 'laser');
    const expected = (drawMm * 2) / 200 + travelMm / LASER_RAPID_SPEED;
    expect(r.perOp[0].sec).toBeCloseTo(expected, 6);
    // A wrong impl reusing TRAVEL_SPEED would land elsewhere (constants differ).
    expect(r.perOp[0].sec).not.toBeCloseTo((drawMm * 2) / 200 + travelMm / TRAVEL_SPEED, 6);
  });

  it('guards a missing/zero Operation speed against NaN/Infinity', () => {
    const paths = [line(0, 0, 100, 0)];
    const missing = runEstimate([group('a', {}, paths)], 'laser');
    const zero = runEstimate([group('a', { speed: 0, passes: 1 }, paths)], 'laser');
    expect(Number.isFinite(missing.totalSec)).toBe(true);
    expect(Number.isFinite(zero.totalSec)).toBe(true);
    expect(missing.totalSec).toBeGreaterThan(0);
  });

  it('counts no Pen Swaps for a laser plan', () => {
    const paths = [line(0, 0, 100, 0)];
    const r = runEstimate(
      [group('a', { speed: 100, passes: 1 }, paths), group('b', { speed: 100, passes: 1 }, paths)],
      'laser'
    );
    expect(r.penSwaps).toBe(0);
  });
});

describe('runEstimate — Pen Plotter Machine Profile', () => {
  it('uses the AxiDraw DRAW_SPEED / TRAVEL_SPEED constants', () => {
    const paths = [line(0, 0, 100, 0), line(0, 200, 100, 200)];
    const { drawMm, travelMm } = pathStats(paths);
    const r = runEstimate([group('a', { penSlot: 1 }, paths, 'pen')], 'plotter');
    expect(r.perOp[0].sec).toBeCloseTo(drawMm / DRAW_SPEED + travelMm / TRAVEL_SPEED, 6);
    expect(r.perOp[0].passes).toBe(1); // plotter has no passes param → treated as 1
  });

  it('counts a Pen Swap between adjacent Operations with a different Pen', () => {
    const paths = [line(0, 0, 100, 0)];
    const r = runEstimate(
      [
        group('a', { penSlot: 1 }, paths, 'pen'),
        group('b', { penSlot: 2 }, paths, 'pen'),
        group('c', { penSlot: 2 }, paths, 'pen'),
      ],
      'plotter'
    );
    expect(r.penSwaps).toBe(1); // 1→2 swaps, 2→2 does not
    const sumSec = r.perOp.reduce((s, o) => s + o.sec, 0);
    expect(r.totalSec).toBeCloseTo(sumSec + PEN_SWAP_SEC * 1, 6);
  });

  it('counts zero Pen Swaps when every Operation shares one Pen', () => {
    const paths = [line(0, 0, 100, 0)];
    const r = runEstimate(
      [
        group('a', { penSlot: 3 }, paths, 'pen'),
        group('b', { penSlot: 3 }, paths, 'pen'),
        group('c', { penSlot: 3 }, paths, 'pen'),
      ],
      'plotter'
    );
    expect(r.penSwaps).toBe(0);
    const sumSec = r.perOp.reduce((s, o) => s + o.sec, 0);
    expect(r.totalSec).toBeCloseTo(sumSec, 6);
  });
});

describe('runEstimate — Drag Cutter Machine Profile', () => {
  it('honors the drag passes param (symmetric with laser), no Pen Swaps', () => {
    const paths = [line(0, 0, 100, 0)];
    const one = runEstimate([group('a', { force: 10, passes: 1 }, paths)], 'dragCutter');
    const three = runEstimate([group('a', { force: 10, passes: 3 }, paths)], 'dragCutter');
    expect(three.perOp[0].sec).toBeCloseTo(one.perOp[0].sec * 3, 6);
    expect(three.perOp[0].passes).toBe(3);
    expect(three.penSwaps).toBe(0);
  });
});

describe('runEstimate — unknown / absent Machine Profile', () => {
  it('falls back to AxiDraw constants without throwing, no Pen Swaps', () => {
    const paths = [line(0, 0, 100, 0)]; // single path → travelMm=0
    const { drawMm } = pathStats(paths);
    let r;
    expect(() => {
      r = runEstimate([group('a', {}, paths)], 'bogus-profile');
    }).not.toThrow();
    // Discriminating assertion: it actually uses DRAW_SPEED (not laser math).
    expect(r.perOp[0].sec).toBeCloseTo(drawMm / DRAW_SPEED, 6);
    expect(r.perOp[0].passes).toBe(1);
    expect(r.penSwaps).toBe(0);
  });

  it('treats absent profileId the same as unknown', () => {
    const paths = [line(0, 0, 100, 0)];
    const { drawMm } = pathStats(paths);
    const r = runEstimate([group('a', {}, paths)]);
    expect(r.perOp[0].sec).toBeCloseTo(drawMm / DRAW_SPEED, 6);
    expect(r.penSwaps).toBe(0);
  });
});

describe('runEstimate — output shape & invariants', () => {
  it('perOp carries { opId, drawMm, travelMm, passes, sec } and totalSec sums them + Pen Swaps', () => {
    const paths = [line(0, 0, 100, 0), line(0, 200, 100, 200)];
    const r = runEstimate(
      [group('a', { penSlot: 1 }, paths, 'pen'), group('b', { penSlot: 2 }, paths, 'pen')],
      'plotter'
    );
    for (const o of r.perOp) {
      expect(Object.keys(o).sort()).toEqual(['drawMm', 'opId', 'passes', 'sec', 'travelMm']);
      expect(Number.isFinite(o.sec)).toBe(true);
    }
    const sumSec = r.perOp.reduce((s, o) => s + o.sec, 0);
    expect(r.totalSec).toBeCloseTo(sumSec + PEN_SWAP_SEC * r.penSwaps, 6);
  });

  it('returns an empty estimate for a non-array / empty opGroups', () => {
    expect(runEstimate(null, 'laser')).toEqual({ totalSec: 0, perOp: [], penSwaps: 0 });
    expect(runEstimate([], 'plotter')).toEqual({ totalSec: 0, perOp: [], penSwaps: 0 });
  });
});
