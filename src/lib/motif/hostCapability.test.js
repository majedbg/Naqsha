// hostCapability — the params-aware host-capability seam (#145, PRD #143 §5a).
//
// Two layers of test, deliberately:
//   1. PREDICATE tests — boundary params, never defaults-only. A defaults-only
//      test (m=4, n=3, blend=0) sails straight past every blank state.
//   2. GROUND-TRUTH tie — run the REAL Chladni pattern through the REAL edge
//      capture path and assert `capturePolylines(...).length === 0` if and only
//      if `hostAvailability(...).available === false`. Without this the
//      predicate is only a restatement of the ticket; with it, the gate is
//      pinned to what the pattern actually draws.

import { describe, it, expect } from 'vitest';
import { hostAvailability } from './hostCapability.js';
import { MOTIF_HOSTS } from './hostKinds.js';
import { capturePolylines } from './capturePolylines.js';
import { P5Adapter } from '../patterns/drawingContext.js';
import Chladni from '../patterns/extras/Chladni.js';

// Chladni's own inline destructuring defaults (Chladni.js:40-52 / DEFAULTS).
const CHLADNI_DEFAULTS = { m: 4, n: 3, blend: 0, m2: 5, n2: 2 };

// A minimal record-mode p5. Chladni's field is pure trig, so random/noise are
// never consulted for geometry — a constant stub is sufficient here (the
// reseed-bite lives in hostCapture.test.js's deterministic p5).
function fakeP5() {
  const noop = () => () => {};
  return {
    TWO_PI: Math.PI * 2, PI: Math.PI, HALF_PI: Math.PI / 2,
    CLOSE: 'P5_CLOSE', CENTER: 'P5_CENTER', ROUND: 'P5_ROUND',
    randomSeed() {}, noiseSeed() {}, random: () => 0.5, noise: () => 0.5,
    color: () => ({ setAlpha() {} }),
    push: noop(), pop: noop(), translate: noop(), rotate: noop(), scale: noop(),
    stroke: noop(), noStroke: noop(), fill: noop(), noFill: noop(),
    strokeWeight: noop(), strokeCap: noop(), rectMode: noop(),
    line: noop(), ellipse: noop(), rect: noop(), triangle: noop(),
    beginShape: noop(), vertex: noop(), endShape: noop(),
  };
}

// Captured nodal-line polylines for a given Chladni param set. `resolution: 60`
// keeps the marching-squares grid cheap; a blank field is blank at any
// resolution, and a non-blank one emits contours at 60 just as at the default 180.
function capturedPathCount(params) {
  const ctx = new P5Adapter(fakeP5(), { draw: false, record: true });
  new Chladni().generate(
    ctx, 7, { ...CHLADNI_DEFAULTS, resolution: 60, ...params }, 400, 300, '#000000', 100
  );
  return capturePolylines(ctx.calls).length;
}

describe('hostAvailability — default (ungated) hosts', () => {
  it('every non-chladni motif host is available at any params', () => {
    for (const type of MOTIF_HOSTS) {
      if (type === 'chladni') continue;
      for (const params of [undefined, {}, { m: 4, n: 4 }, { blend: 1, m2: 5, n2: 5 }]) {
        const a = hostAvailability(type, params);
        expect(a.available, `${type} should be available`).toBe(true);
        expect(a.reason).toBe(null);
      }
    }
  });

  it('an unknown / non-host pattern type is reported available (the seam gates, it does not classify)', () => {
    expect(hostAvailability('text', {}).available).toBe(true);
    expect(hostAvailability('phyllotaxis', {}).available).toBe(true);
  });
});

describe('hostAvailability — Chladni blank plate', () => {
  it('is available at default params (the case a defaults-only test would stop at)', () => {
    const a = hostAvailability('chladni', CHLADNI_DEFAULTS);
    expect(a.available).toBe(true);
    expect(a.reason).toBe(null);
    expect(capturedPathCount({})).toBeGreaterThan(0);
  });

  it('is available with NO params at all (falls back to the pattern defaults)', () => {
    expect(hostAvailability('chladni').available).toBe(true);
    expect(hostAvailability('chladni', {}).available).toBe(true);
  });

  // --- Criterion: unavailable when the FIRST mode pair is equal ---------------
  it('reports unavailable when m === n and Blend is 0 (the first pair is the whole field)', () => {
    const a = hostAvailability('chladni', { m: 4, n: 4, blend: 0 });
    expect(a.available).toBe(false);
    expect(a.reason).toMatch(/blank plate/i);
    expect(a.reason).toMatch(/\bm\b/i);
    expect(a.reason).toMatch(/\bn\b/i);
  });

  it('reports unavailable for m === n at every equal value the slider allows', () => {
    for (let k = 1; k <= 12; k++) {
      expect(hostAvailability('chladni', { m: k, n: k }).available, `m=n=${k}`).toBe(false);
    }
  });

  it('a Blend below full does NOT rescue an equal first pair on its own — the second pair must carry it', () => {
    // 0 < w < 1 and BOTH pairs equal ⇒ still identically zero.
    expect(hostAvailability('chladni', { m: 4, n: 4, blend: 0.5, m2: 5, n2: 5 }).available).toBe(false);
    // 0 < w < 1 with a LIVE second pair ⇒ the plate is not blank.
    expect(hostAvailability('chladni', { m: 4, n: 4, blend: 0.5, m2: 5, n2: 2 }).available).toBe(true);
  });

  // --- Criterion: unavailable at full blend when the SECOND pair is equal -----
  it('reports unavailable when Blend is at full and m2 === n2', () => {
    const a = hostAvailability('chladni', { m: 4, n: 3, blend: 1, m2: 5, n2: 5 });
    expect(a.available).toBe(false);
    expect(a.reason).toMatch(/blank plate/i);
    expect(a.reason).toMatch(/blend/i);
  });

  it('one step below full Blend with an equal second pair is AVAILABLE (the boundary is exactly 1)', () => {
    // blend 0.99 leaves a 0.01 share of the live first pair — contours survive.
    expect(hostAvailability('chladni', { m: 4, n: 3, blend: 0.99, m2: 5, n2: 5 }).available).toBe(true);
  });

  // --- The over-broadness boundary: m === n is NOT blank at full blend --------
  it('m === n at FULL blend is AVAILABLE — the first pair has coefficient 0 there', () => {
    // Chladni computes (1-w)*f1 + w*f2; at w === 1 the first pair contributes
    // nothing at all, so an equal m/n is irrelevant. A gate that read the first
    // criterion literally ("unavailable when the first mode pair is equal")
    // would wrongly black out this perfectly good plate.
    const a = hostAvailability('chladni', { m: 4, n: 4, blend: 1, m2: 5, n2: 2 });
    expect(a.available).toBe(true);
    expect(capturedPathCount({ m: 4, n: 4, blend: 1, m2: 5, n2: 2 })).toBeGreaterThan(0);
  });

  it('an equal SECOND pair at Blend 0 is AVAILABLE — the second pair is not in the field there', () => {
    expect(hostAvailability('chladni', { m: 4, n: 3, blend: 0, m2: 5, n2: 5 }).available).toBe(true);
  });

  it('an out-of-range Blend behaves exactly as the pattern treats it (clamped to [0,1])', () => {
    // Chladni clamps blend to [0,1] before use, so blend 2 behaves as 1…
    expect(hostAvailability('chladni', { m: 4, n: 3, blend: 2, m2: 5, n2: 5 }).available).toBe(false);
    expect(capturedPathCount({ m: 4, n: 3, blend: 2, m2: 5, n2: 5 })).toBe(0);
    // …and blend -1 behaves as 0.
    expect(hostAvailability('chladni', { m: 4, n: 4, blend: -1 }).available).toBe(false);
    expect(capturedPathCount({ m: 4, n: 4, blend: -1 })).toBe(0);
    expect(hostAvailability('chladni', { m: 4, n: 3, blend: -1, m2: 5, n2: 5 }).available).toBe(true);
    expect(capturedPathCount({ m: 4, n: 3, blend: -1, m2: 5, n2: 5 })).toBeGreaterThan(0);
  });

  it('a NaN Blend is reported unavailable — and the pattern really does draw nothing', () => {
    // NaN propagates through (1-w)·f1 + w·f2, every field sample is NaN, every
    // `corner > iso` comparison is false, so every marching-square cell scores
    // code 0 and no contour is emitted. The gate must agree rather than promise
    // a plate that is not there.
    expect(hostAvailability('chladni', { m: 4, n: 3, blend: NaN }).available).toBe(false);
    expect(capturedPathCount({ m: 4, n: 3, blend: NaN })).toBe(0);
  });

  it('a reason is always a non-empty string when unavailable, and null when available', () => {
    const blank = hostAvailability('chladni', { m: 3, n: 3 });
    expect(typeof blank.reason).toBe('string');
    expect(blank.reason.length).toBeGreaterThan(0);
    expect(hostAvailability('chladni', { m: 4, n: 3 }).reason).toBe(null);
  });
});

// The tie that makes the gate honest rather than a paraphrase of the ticket:
// for every case below, run the REAL pattern through the REAL capture path and
// require the predicate and the drawn geometry to agree.
describe('Chladni gate vs the geometry the pattern actually draws', () => {
  const CASES = [
    ['defaults (m 4, n 3, blend 0)', {}],
    ['first pair equal, blend 0', { m: 4, n: 4, blend: 0 }],
    ['first pair equal, blend 1, live second pair', { m: 4, n: 4, blend: 1, m2: 5, n2: 2 }],
    ['second pair equal, blend 1', { m: 4, n: 3, blend: 1, m2: 5, n2: 5 }],
    ['second pair equal, blend 0.99', { m: 4, n: 3, blend: 0.99, m2: 5, n2: 5 }],
    ['both pairs equal, blend 0.5', { m: 4, n: 4, blend: 0.5, m2: 5, n2: 5 }],
    ['first pair equal, blend 0.5, live second pair', { m: 4, n: 4, blend: 0.5, m2: 5, n2: 2 }],
    ['second pair equal, blend 0', { m: 4, n: 3, blend: 0, m2: 5, n2: 5 }],
    ['high modes m 11, n 12', { m: 11, n: 12 }],
    ['low modes m 1, n 2', { m: 1, n: 2 }],
  ];

  for (const [label, params] of CASES) {
    it(`${label}: availability matches captured-path emptiness`, () => {
      const { available } = hostAvailability('chladni', { ...CHLADNI_DEFAULTS, ...params });
      const count = capturedPathCount(params);
      expect(count > 0, `${label}: expected available=${available}, captured ${count} paths`)
        .toBe(available);
    });
  }
});
