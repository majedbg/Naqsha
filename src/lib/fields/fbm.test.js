import { describe, it, expect } from 'vitest';
import { fbm } from './fbm.js';
import { makeSimplex } from './simplexNoise.js';

// fbm(noise2D, wx, wy, opts) replicates TopographicContours' octave loop AND
// domain-warp math, but takes an injected noise2D(x,y) instead of ctx.noise.
// Pure: same noise + same coords + same opts → identical value.

const OPTS = { baseFreq: 2.5 / 800, octaves: 3, warp: 0, longest: 800 };

describe('fbm', () => {
  it('is deterministic for the same noise source, coords and opts', () => {
    const n = makeSimplex(7);
    expect(fbm(n, 12.3, -45.6, OPTS)).toBe(fbm(n, 12.3, -45.6, OPTS));
  });

  it('varies across space', () => {
    const n = makeSimplex(7);
    let anyDiff = false;
    const a = fbm(n, 0, 0, OPTS);
    for (let i = 1; i < 30 && !anyDiff; i++) {
      if (fbm(n, i * 40, i * 17, OPTS) !== a) anyDiff = true;
    }
    expect(anyDiff).toBe(true);
  });

  it('depends on the injected noise source (different seeds → different field)', () => {
    const a = makeSimplex(1);
    const b = makeSimplex(2);
    let anyDiff = false;
    for (let i = 0; i < 30 && !anyDiff; i++) {
      const x = i * 30 + 5;
      const y = i * 11 - 3;
      if (fbm(a, x, y, OPTS) !== fbm(b, x, y, OPTS)) anyDiff = true;
    }
    expect(anyDiff).toBe(true);
  });

  it('domain warp (warp>0) displaces the sampled value', () => {
    const n = makeSimplex(7);
    let anyDiff = false;
    for (let i = 0; i < 40 && !anyDiff; i++) {
      const x = i * 25 - 400;
      const y = i * 9 - 300;
      const flat = fbm(n, x, y, { ...OPTS, warp: 0 });
      const warped = fbm(n, x, y, { ...OPTS, warp: 0.6 });
      if (flat !== warped) anyDiff = true;
    }
    expect(anyDiff).toBe(true);
  });

  it('octave count changes the summed value', () => {
    const n = makeSimplex(7);
    let anyDiff = false;
    for (let i = 0; i < 40 && !anyDiff; i++) {
      const x = i * 25 - 400;
      const y = i * 9 - 300;
      if (fbm(n, x, y, { ...OPTS, octaves: 1 }) !== fbm(n, x, y, { ...OPTS, octaves: 4 })) {
        anyDiff = true;
      }
    }
    expect(anyDiff).toBe(true);
  });
});
