import { describe, it, expect } from 'vitest';
import { makeP5Random } from '../rng.js';

// makeP5Random is a byte-exact port of p5.js's seeded LCG. We DERIVE the
// expected sequence here from the recurrence (no hardcoded magic numbers) and
// assert makeP5Random reproduces it, then check the three range-mapping forms.
//   state ∈ [0, 2^32);  state ← (a·state + c) mod m;  rand = state / m
const M = 4294967296; // 2^32
const A = 1664525;
const C = 1013904223;

/** Derive the first `count` raw rand values in [0,1) for a seed, from scratch. */
function expectedRands(seed, count) {
  let state = seed >>> 0;
  const out = [];
  for (let i = 0; i < count; i++) {
    state = (A * state + C) % M;
    out.push(state / M);
  }
  return out;
}

describe('makeP5Random — LCG byte-exact sequence', () => {
  for (const seed of [0, 1, 42, 123456]) {
    it(`reproduces the hand-computed LCG sequence for seed ${seed}`, () => {
      const rng = makeP5Random(seed);
      const expected = expectedRands(seed, 8);
      const actual = Array.from({ length: 8 }, () => rng());
      expect(actual).toEqual(expected);
      // Every value lands in [0, 1).
      for (const v of actual) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThan(1);
      }
    });
  }

  it('advances state on every call (successive values differ)', () => {
    const rng = makeP5Random(7);
    const a = rng();
    const b = rng();
    expect(a).not.toBe(b);
  });

  it('seeds via >>> 0 so null/undefined behaves as seed 0', () => {
    const seq0 = expectedRands(0, 4);
    expect(Array.from({ length: 4 }, makeP5Random(0))).toEqual(seq0);
    expect(Array.from({ length: 4 }, makeP5Random(undefined))).toEqual(seq0);
    expect(Array.from({ length: 4 }, makeP5Random(null))).toEqual(seq0);
  });
});

describe('makeP5Random — range-mapping forms', () => {
  const SEED = 99;
  // A fresh generator per form (each call advances state), all identically
  // seeded, so form N's value == the raw rand at the SAME position.
  it('random() → rand in [0,1)', () => {
    const rng = makeP5Random(SEED);
    const rands = expectedRands(SEED, 5);
    for (let i = 0; i < 5; i++) expect(rng()).toBe(rands[i]);
  });

  it('random(max) → rand * max', () => {
    const rng = makeP5Random(SEED);
    const rands = expectedRands(SEED, 5);
    const max = 40;
    for (let i = 0; i < 5; i++) expect(rng(max)).toBe(rands[i] * max);
  });

  it('random(min, max) → rand * (max - min) + min', () => {
    const rng = makeP5Random(SEED);
    const rands = expectedRands(SEED, 5);
    const min = -3;
    const max = 7;
    for (let i = 0; i < 5; i++) {
      expect(rng(min, max)).toBe(rands[i] * (max - min) + min);
    }
  });

  it('random(min, max) with min > max swaps the bounds', () => {
    const swapped = makeP5Random(SEED);
    const ordered = makeP5Random(SEED);
    const lo = 2;
    const hi = 9;
    for (let i = 0; i < 5; i++) {
      // Passing (hi, lo) must equal passing (lo, hi).
      expect(swapped(hi, lo)).toBe(ordered(lo, hi));
    }
  });

  it('random(min, max) with equal bounds always returns that bound', () => {
    const rng = makeP5Random(SEED);
    for (let i = 0; i < 5; i++) expect(rng(5, 5)).toBe(5);
  });
});
