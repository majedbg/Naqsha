import { describe, it, expect } from 'vitest';
import {
  classifySymmetry,
  validateSymmetry,
  WALLPAPER_GROUPS,
  GROUPS_BY_LATTICE,
} from './symmetry';

// Ground-truth-by-construction fixtures. We build a seeded-random N×N field,
// orbit-average it over a wallpaper group's point-group elements (in the same
// fractional coordinates the classifier samples), then render it to an RGBA
// cell raster. The symmetry is then a property of construction, so a correct
// classifier MUST recover the constructed group.

const N = 24;
const HALF = N / 2;
const mod = (x) => ((x % N) + N) % N;

// Deterministic LCG — determinism is a locked invariant; Math.random would make
// the "near-misses score lower" assertions flaky.
function lcg(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// Point-group elements as index permutations (i,j)->(i',j'), given as
// [matrix a,b,c,d, offi, offj]. Applied mod N.
const I = [1, 0, 0, 1, 0, 0];
const R2 = [-1, 0, 0, -1, 0, 0];
const R4 = [0, -1, 1, 0, 0, 0];
const R3 = [0, -1, 1, -1, 0, 0];
const R6 = [1, -1, 1, 0, 0, 0];
const MH = [1, 0, 0, -1, 0, 0]; // mirror about v=0
const GH = [1, 0, 0, -1, HALF, 0]; // glide along u, reflecting v

const applyEl = ([a, b, c, d, oi, oj], i, j) => [mod(a * i + b * j + oi), mod(c * i + d * j + oj)];

// Compose two elements as permutations (build the full index map, compare by key).
function permOf(el) {
  const p = new Int16Array(N * N);
  for (let i = 0; i < N; i++)
    for (let j = 0; j < N; j++) {
      const [ti, tj] = applyEl(el, i, j);
      p[i * N + j] = ti * N + tj;
    }
  return p;
}

// Group closure from generator permutations.
function closure(genPerms) {
  const idP = permOf(I);
  const key = (p) => p.join(',');
  const elems = new Map([[key(idP), idP]]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const g of genPerms) {
      for (const e of [...elems.values()]) {
        const comp = new Int16Array(N * N);
        for (let k = 0; k < comp.length; k++) comp[k] = g[e[k]];
        const kk = key(comp);
        if (!elems.has(kk)) {
          elems.set(kk, comp);
          grew = true;
        }
      }
    }
  }
  return [...elems.values()];
}

// Orbit-average a seeded base field over a group's permutations → G-invariant F.
function symmetrize(seed, genEls) {
  const rnd = lcg(seed);
  const base = new Float64Array(N * N);
  for (let k = 0; k < base.length; k++) base[k] = rnd() * 255;
  const group = closure(genEls.map(permOf));
  const F = new Float64Array(N * N);
  for (let k = 0; k < F.length; k++) {
    let s = 0;
    for (const p of group) s += base[p[k]];
    F[k] = s / group.length;
  }
  return F;
}

// Render an N×N field to an RGBA cell, upscaled by an integer factor via
// nearest-neighbor — exercises the luma + resample path.
function toCell(F, k = 4) {
  const W = N * k;
  const H = N * k;
  const data = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const v = F[Math.floor(x / k) * N + Math.floor(y / k)];
      const o = (y * W + x) * 4;
      data[o] = data[o + 1] = data[o + 2] = v;
      data[o + 3] = 255;
    }
  }
  return { data, width: W, height: H };
}

// Periodic BILINEAR render of the N-periodic field to an M×M raster whose size
// is NOT a multiple of N — so the classifier's own resample genuinely
// interpolates across source samples rather than hitting exact values.
function toCellSmooth(F, M) {
  const data = new Uint8ClampedArray(M * M * 4);
  const at = (i, j) => F[mod(Math.floor(i)) * N + mod(Math.floor(j))];
  for (let y = 0; y < M; y++) {
    for (let x = 0; x < M; x++) {
      const fx = (x / M) * N;
      const fy = (y / M) * N;
      const x0 = Math.floor(fx);
      const y0 = Math.floor(fy);
      const tx = fx - x0;
      const ty = fy - y0;
      const v =
        at(x0, y0) * (1 - tx) * (1 - ty) +
        at(x0 + 1, y0) * tx * (1 - ty) +
        at(x0, y0 + 1) * (1 - tx) * ty +
        at(x0 + 1, y0 + 1) * tx * ty;
      const o = (y * M + x) * 4;
      data[o] = data[o + 1] = data[o + 2] = v;
      data[o + 3] = 255;
    }
  }
  return { data, width: M, height: M };
}

const GENERATORS = {
  p1: [I],
  p2: [R2],
  pm: [MH],
  pg: [GH],
  p4: [R4],
  p4m: [R4, MH],
  p3: [R3],
  p6: [R6],
};

const LATTICE = {
  p1: { type: 'oblique' },
  p2: { type: 'oblique' },
  pm: { type: 'rect' },
  pg: { type: 'rect' },
  p4: { type: 'square' },
  p4m: { type: 'square' },
  p3: { type: 'hex' },
  p6: { type: 'hex' },
};

describe('classifySymmetry — known groups classify to themselves', () => {
  for (const group of Object.keys(GENERATORS)) {
    it(`recovers ${group}`, () => {
      const F = symmetrize(1234 + group.length * 7, GENERATORS[group]);
      const cell = toCell(F);
      const res = classifySymmetry(cell, LATTICE[group]);
      expect(res).not.toBeNull();
      expect(res.group).toBe(group);
      expect(res.source).toBe('auto');
      // A crisp constructed symmetry reads as meaningful confidence.
      if (group === 'p1') {
        expect(res.confidence).toBeGreaterThan(0);
      } else {
        expect(res.confidence).toBeGreaterThan(0.85);
      }
    });
  }
});

describe('classifySymmetry — near-misses score lower / gating', () => {
  it('a p4 tile classifies p4, and NOT as p2 (higher order wins)', () => {
    const res = classifySymmetry(toCell(symmetrize(42, GENERATORS.p4)), { type: 'square' });
    expect(res.group).toBe('p4');
  });

  it('a chiral p4 tile is not misread as mirror-bearing p4m', () => {
    // The constrained-offset scorer must keep the (absent) mirror below
    // threshold — the classic p4→p4m leak.
    const res = classifySymmetry(toCell(symmetrize(7, GENERATORS.p4)), { type: 'square' });
    expect(res.group).toBe('p4');
  });

  it('square-lattice gating still yields p2 for a 2-fold-only tile', () => {
    const res = classifySymmetry(toCell(symmetrize(99, GENERATORS.p2)), { type: 'square' });
    expect(res.group).toBe('p2'); // rot4/mirror absent → falls to p2
  });

  it('ambiguous (noise-dominated) input surfaces low confidence as p1', () => {
    const rnd = lcg(2024);
    const F = new Float64Array(N * N);
    for (let k = 0; k < F.length; k++) F[k] = rnd() * 255;
    const res = classifySymmetry(toCell(F), { type: 'square' });
    expect(res.group).toBe('p1');
    expect(res.confidence).toBeLessThan(0.5);
  });

  it('a strong p4 reads higher confidence than a noise-blended near-miss', () => {
    const clean = classifySymmetry(toCell(symmetrize(3, GENERATORS.p4)), { type: 'square' });
    // 60% signal / 40% noise — degrades the 4-fold correlation.
    const F = symmetrize(3, GENERATORS.p4);
    const rnd = lcg(555);
    const noisy = new Float64Array(N * N);
    for (let k = 0; k < F.length; k++) noisy[k] = 0.6 * F[k] + 0.4 * rnd() * 255;
    const near = classifySymmetry(toCell(noisy), { type: 'square' });
    expect(clean.confidence).toBeGreaterThan(near.confidence);
  });
});

describe('classifySymmetry — real resample path (non-aligned raster)', () => {
  it('still classifies p4m when rendered at an unaligned size (genuine bilinear)', () => {
    const F = symmetrize(11, GENERATORS.p4m);
    // 90×90 is not a multiple of 24, so the classifier's resample interpolates.
    const cell = toCellSmooth(F, 90);
    const res = classifySymmetry(cell, { type: 'square' });
    expect(res.group).toBe('p4m');
    expect(res.confidence).toBeGreaterThan(0.7);
  });
});

describe('classifySymmetry — no lattice / degenerate', () => {
  it('returns null with no lattice (no periodic group without a lattice)', () => {
    expect(classifySymmetry(toCell(symmetrize(1, GENERATORS.p4)), null)).toBeNull();
  });

  it('returns null for a flat (structureless) cell', () => {
    const data = new Uint8ClampedArray(16 * 16 * 4).fill(200);
    for (let i = 3; i < data.length; i += 4) data[i] = 255;
    expect(classifySymmetry({ data, width: 16, height: 16 }, { type: 'square' })).toBeNull();
  });

  it('returns null for a too-small cell', () => {
    expect(
      classifySymmetry({ data: new Uint8ClampedArray(4), width: 1, height: 1 }, { type: 'square' })
    ).toBeNull();
  });
});

describe('validateSymmetry — whitelist + validate-and-null', () => {
  it('accepts a canonical group with clamped confidence + source', () => {
    expect(validateSymmetry({ group: 'p4m', confidence: 0.9, source: 'auto' })).toEqual({
      group: 'p4m',
      confidence: 0.9,
      source: 'auto',
    });
  });

  it('all 17 canonical names pass', () => {
    for (const g of WALLPAPER_GROUPS) {
      expect(validateSymmetry({ group: g, confidence: 0.5, source: 'auto' })?.group).toBe(g);
    }
    expect(WALLPAPER_GROUPS).toHaveLength(17);
  });

  it('drops a non-whitelisted / crafted group string', () => {
    expect(validateSymmetry({ group: '<script>', confidence: 1, source: 'auto' })).toBeNull();
    expect(validateSymmetry({ group: 'p7', confidence: 1 })).toBeNull();
    expect(validateSymmetry({ group: 'P4M', confidence: 1 })).toBeNull(); // case-sensitive
  });

  it('clamps out-of-range confidence and defaults source to auto', () => {
    expect(validateSymmetry({ group: 'p2', confidence: 5 })).toEqual({
      group: 'p2',
      confidence: 1,
      source: 'auto',
    });
    expect(validateSymmetry({ group: 'p2', confidence: -3, source: 'manual' })).toEqual({
      group: 'p2',
      confidence: 0,
      source: 'manual',
    });
  });

  it('null / non-object → null', () => {
    expect(validateSymmetry(null)).toBeNull();
    expect(validateSymmetry(undefined)).toBeNull();
    expect(validateSymmetry('p4')).toBeNull();
  });

  it('exposes lattice-type candidate groups', () => {
    expect(GROUPS_BY_LATTICE.oblique).toEqual(['p1', 'p2']);
    expect(GROUPS_BY_LATTICE.hex).toContain('p6m');
    expect(GROUPS_BY_LATTICE.square).toContain('p4g');
  });
});
