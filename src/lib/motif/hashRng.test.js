import { describe, it, expect } from 'vitest';
import { hashRng, hashRand01 } from './hashRng.js';

describe('hashRng — determinism (ADR-0005 contract)', () => {
  it('same (seed, anchorId, channel) yields the identical sequence across two independently constructed generators', () => {
    const a = hashRng(42, 'edge:0:7', 'slot');
    const b = hashRng(42, 'edge:0:7', 'slot');
    const seqA = [a(), a(), a(), a()];
    const seqB = [b(), b(), b(), b()];
    expect(seqB).toEqual(seqA);
  });

  it('same triple yields the identical sequence across calls made later / interleaved with unrelated draws', () => {
    const gen1 = hashRng(7, 'crossing:1:1:0', 'rot');
    const first = gen1();
    // Draw from unrelated generators in between — must not perturb gen1's key.
    hashRng(999, 'edge:9:9', 'slot')();
    hashRng(1, 'edge:0:0', 'rot')();
    const gen2 = hashRng(7, 'crossing:1:1:0', 'rot');
    expect(gen2()).toBe(first);
  });

  it('hashRand01 matches the first draw of hashRng for the same triple', () => {
    const gen = hashRng(3, 'edge:2:5', 'slot');
    expect(hashRand01(3, 'edge:2:5', 'slot')).toBe(gen());
  });
});

describe('hashRng — decorrelation across inputs', () => {
  it('changing ONLY channel changes the first draw', () => {
    const slot = hashRng(42, 'edge:0:7', 'slot')();
    const rot = hashRng(42, 'edge:0:7', 'rot')();
    expect(slot).not.toBe(rot);
  });

  it('changing ONLY anchorId changes the first draw', () => {
    const a = hashRng(42, 'edge:0:7', 'slot')();
    const b = hashRng(42, 'edge:0:8', 'slot')();
    expect(a).not.toBe(b);
  });

  it('changing ONLY seed changes the first draw', () => {
    const a = hashRng(42, 'edge:0:7', 'slot')();
    const b = hashRng(43, 'edge:0:7', 'slot')();
    expect(a).not.toBe(b);
  });

  it('a handful of concrete channel/anchorId/seed variants all decorrelate (no accidental equal pairs)', () => {
    const cases = [
      [1, 'edge:0:0', 'slot'],
      [1, 'edge:0:0', 'rot'],
      [1, 'edge:0:1', 'slot'],
      [2, 'edge:0:0', 'slot'],
      [1, 'crossing:0:0:0', 'slot'],
    ];
    const draws = cases.map(([s, id, ch]) => hashRand01(s, id, ch));
    const unique = new Set(draws.map((d) => d.toFixed(12)));
    expect(unique.size).toBe(draws.length);
  });

  it('distribution sanity: 1000 anchor ids give a first-draw mean within [0.4, 0.6] and no obvious collision cluster', () => {
    const draws = [];
    for (let i = 0; i < 1000; i++) {
      draws.push(hashRand01(42, `edge:0:${i}`, 'slot'));
    }
    const mean = draws.reduce((sum, v) => sum + v, 0) / draws.length;
    expect(mean).toBeGreaterThan(0.4);
    expect(mean).toBeLessThan(0.6);

    // Bucket into deciles — a broken hash would pile draws into one or two
    // buckets instead of spreading roughly evenly (uniform-expected ~100/bucket).
    const buckets = new Array(10).fill(0);
    draws.forEach((v) => {
      const idx = Math.min(9, Math.floor(v * 10));
      buckets[idx]++;
    });
    buckets.forEach((count) => {
      expect(count).toBeGreaterThan(20);
      expect(count).toBeLessThan(200);
    });

    // No exact-duplicate draws among 1000 distinct anchor ids (would indicate
    // a hash collision or generator degeneracy).
    const unique = new Set(draws.map((d) => d.toFixed(12)));
    expect(unique.size).toBe(draws.length);
  });
});

describe('hashRng — order independence (locality; the whole point of ADR-0005)', () => {
  it("a given anchorId's value does not depend on what other anchorIds are queried, or in what order", () => {
    const ids = ['edge:0:0', 'edge:0:1', 'edge:0:2', 'crossing:1:1:0', 'edge:1:0'];
    const seed = 17;
    const channel = 'slot';

    const forward = {};
    ids.forEach((id) => { forward[id] = hashRand01(seed, id, channel); });

    const reversed = {};
    [...ids].reverse().forEach((id) => { reversed[id] = hashRand01(seed, id, channel); });

    ids.forEach((id) => {
      expect(reversed[id]).toBe(forward[id]);
    });
  });

  it('querying only a subset of ids (as if an upstream filter dropped some anchors) does not change the survivors\' values', () => {
    const seed = 5;
    const channel = 'rot';
    const allIds = ['edge:0:0', 'edge:0:1', 'edge:0:2', 'edge:0:3', 'edge:0:4'];
    const before = {};
    allIds.forEach((id) => { before[id] = hashRand01(seed, id, channel); });

    // Simulate an upstream edit that removes some anchors (survivor-stability,
    // ADR-0005): only query the survivors, in a different grouping/order.
    const survivors = ['edge:0:4', 'edge:0:0', 'edge:0:2'];
    survivors.forEach((id) => {
      expect(hashRand01(seed, id, channel)).toBe(before[id]);
    });
  });
});

describe('hashRng — input shapes', () => {
  it('accepts a numeric seed and string anchorId in the documented shapes without throwing', () => {
    expect(() => hashRng(0, 'edge:0:7', 'slot')).not.toThrow();
    expect(() => hashRng(123456, 'crossing:1:1:0', 'rot')).not.toThrow();
  });

  it('returned generator yields floats in [0, 1)', () => {
    const gen = hashRng(0, 'edge:0:7', 'slot');
    const v = gen();
    expect(typeof v).toBe('number');
    expect(v).toBeGreaterThanOrEqual(0);
    expect(v).toBeLessThan(1);
  });
});
