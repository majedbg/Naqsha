import { describe, it, expect } from 'vitest';
import {
  HALFTONE_ROUND,
  HALFTONE_DIAMOND,
  HALFTONE_SHAPES,
  DEFAULT_HALFTONE_SHAPE,
  DEFAULT_HALFTONE_FREQUENCY,
  DEFAULT_HALFTONE_ANGLE,
  halftoneField,
} from './etchHalftone.js';

// A flat { gray, alpha, width, height } field at one luma, fully opaque unless an
// alpha grid is supplied. Halftone reads own-luma + (x,y), so a flat field's ink
// fraction is a pure function of darkness — the ideal probe for the AM mapping.
function flat(v, w, h) {
  const gray = new Float64Array(w * h).fill(v);
  const alpha = new Uint8ClampedArray(w * h).fill(255);
  return { gray, alpha, width: w, height: h };
}

function inkFraction(bits) {
  let n = 0;
  for (let j = 0; j < bits.length; j++) n += bits[j];
  return n / bits.length;
}

// Count 0→1 transitions along a single device row — a proxy for dot density /
// screen coarseness (more, smaller cells per row ⇒ more edges).
function rowTransitions(bits, w, y) {
  let t = 0;
  for (let x = 1; x < w; x++) if (bits[y * w + x] !== bits[y * w + x - 1]) t += 1;
  return t;
}

// Count 4-connected ink components (flood fill). A COHERENT dot screen makes a few
// multi-pixel blobs (≈ one per cell); a degenerate per-pixel threshold scatters
// isolated specks (components ≈ ink pixels). The ratio ink/components is therefore
// a robust coherence proxy that a non-clustering refactor would drive red.
function inkComponents(bits, w, h) {
  const seen = new Uint8Array(bits.length);
  const stack = [];
  let comps = 0;
  for (let s = 0; s < bits.length; s++) {
    if (!bits[s] || seen[s]) continue;
    comps += 1;
    stack.push(s);
    seen[s] = 1;
    while (stack.length) {
      const j = stack.pop();
      const x = j % w;
      const y = (j / w) | 0;
      const nb = [];
      if (x > 0) nb.push(j - 1);
      if (x < w - 1) nb.push(j + 1);
      if (y > 0) nb.push(j - w);
      if (y < h - 1) nb.push(j + w);
      for (const k of nb) if (bits[k] && !seen[k]) { seen[k] = 1; stack.push(k); }
    }
  }
  return comps;
}

// A horizontal darkness gradient (left dark → right light), fully opaque.
function gradientField(w, h) {
  const gray = new Float64Array(w * h);
  const alpha = new Uint8ClampedArray(w * h).fill(255);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) gray[y * w + x] = (x / (w - 1)) * 255;
  return { gray, alpha, width: w, height: h };
}

describe('halftone constants', () => {
  it('exposes the two shapes with sensible neutral defaults', () => {
    expect(HALFTONE_ROUND).toBe('round');
    expect(HALFTONE_DIAMOND).toBe('diamond');
    expect(DEFAULT_HALFTONE_SHAPE).toBe(HALFTONE_ROUND);
    expect(HALFTONE_SHAPES.map((s) => s.value)).toEqual([HALFTONE_ROUND, HALFTONE_DIAMOND]);
    expect(DEFAULT_HALFTONE_FREQUENCY).toBeGreaterThan(0);
    // 45° is the classic single-screen halftone angle (hides the grid best).
    expect(DEFAULT_HALFTONE_ANGLE).toBe(45);
  });
});

describe('halftoneField — AM dot screen: radius ∝ local darkness (the mapping pin)', () => {
  // THE headline correctness bar: sweep a darkness ramp and assert the ink
  // fraction is MONOTONICALLY NON-DECREASING — the dot radius grows with darkness
  // — with ~no ink at pure white (darkness 0) and ~full ink at pure black
  // (darkness 1). cell = dpi/frequency ≈ 4px here (32×32 spans ~8 cells/axis) so
  // the average is stable.
  it('ink fraction is non-decreasing across a darkness ramp; 0→~none, full→~all (round)', () => {
    const opts = { dpi: 254, invert: false };
    const params = { frequency: 64, angle: 45, shape: HALFTONE_ROUND };
    const lumas = [255, 224, 192, 160, 128, 96, 64, 32, 0];
    const fracs = lumas.map((v) => inkFraction(halftoneField(flat(v, 32, 32), params, opts)));
    for (let i = 1; i < fracs.length; i++) {
      expect(fracs[i]).toBeGreaterThanOrEqual(fracs[i - 1] - 1e-9); // darker ⇒ ≥ ink
    }
    expect(fracs[0]).toBeLessThan(0.05); // white → essentially no dots
    expect(fracs[fracs.length - 1]).toBeGreaterThan(0.98); // black → dots merge to full ink
  });

  it('the diamond shape is ALSO monotonic 0→~none, full→~all', () => {
    const opts = { dpi: 254, invert: false };
    const params = { frequency: 64, angle: 45, shape: HALFTONE_DIAMOND };
    const light = inkFraction(halftoneField(flat(255, 32, 32), params, opts));
    const mid = inkFraction(halftoneField(flat(128, 32, 32), params, opts));
    const dark = inkFraction(halftoneField(flat(0, 32, 32), params, opts));
    expect(light).toBeLessThan(0.05);
    expect(dark).toBeGreaterThan(0.98);
    expect(mid).toBeGreaterThan(light);
    expect(mid).toBeLessThan(dark);
  });
});

describe('halftoneField — a tiny cell must NOT collapse to solid ink (FIX 1)', () => {
  // When cell → 1 at an axis angle, EVERY pixel lands on a lattice node (r = 0), so
  // a naive `r ≤ darkness·rMax` inks the whole field for any darkness > 0 — a
  // mid-gray would render SOLID BLACK, not a fine screen. The kernel floors the
  // cell above that collapse. This forces a sub-1 raw cell (dpi 100 / freq 120 ≈
  // 0.83) at angle 0 and asserts a mid-gray stays a tone-tracking screen.
  it('a sub-pixel raw cell at angle 0 keeps a mid-gray tone-tracking (not ~solid)', () => {
    const opts = { dpi: 100, invert: false }; // dpi/freq = 100/120 ≈ 0.83 → clamped
    const p = { frequency: 120, angle: 0, shape: HALFTONE_ROUND };
    const mid = inkFraction(halftoneField(flat(128, 32, 32), p, opts));
    expect(mid).toBeGreaterThan(0.02); // still a real screen, not blank
    expect(mid).toBeLessThan(0.6); // and NOT the solid-ink collapse
    // Tone still tracks: a darker field inks strictly more than the mid-gray.
    const dark = inkFraction(halftoneField(flat(48, 32, 32), p, opts));
    expect(dark).toBeGreaterThan(mid);
  });
});

describe('halftoneField — coherent AM dots on a gradient (FIX 2)', () => {
  // Flat fields can't tell a coherent dot from a degenerate per-pixel threshold —
  // both give the same ink fraction. These pin COHERENCE: regional darkness sets
  // regional dot SIZE (ink fraction tracks the gradient), and each dot is a
  // connected cluster (few multi-pixel blobs), not a scatter of specks.
  it('ink fraction tracks REGIONAL darkness across gradient bands (bigger dots where darker)', () => {
    const w = 48;
    const h = 48;
    const bits = halftoneField(gradientField(w, h), { frequency: 42, angle: 0, shape: HALFTONE_ROUND }, { dpi: 254 });
    // Four vertical bands, left (dark) → right (light). Ink must strictly decrease.
    const band = (x0, x1) => {
      let n = 0;
      let ink = 0;
      for (let y = 0; y < h; y++) for (let x = x0; x < x1; x++) { n += 1; ink += bits[y * w + x]; }
      return ink / n;
    };
    const b = [band(0, 12), band(12, 24), band(24, 36), band(36, 48)];
    expect(b[0]).toBeGreaterThan(b[1]);
    expect(b[1]).toBeGreaterThan(b[2]);
    expect(b[2]).toBeGreaterThan(b[3]);
  });

  it('inked pixels form CLUSTERED dots, not scattered specks (coherence proxy)', () => {
    // A flat mid-gray at a ~6px cell: ink is a lattice of separate dots, so ink
    // components ≈ cell count and the mean dot spans several pixels. A per-pixel
    // scatter of the same ink fraction would have components ≈ ink pixels (mean ≈1).
    const w = 48;
    const h = 48;
    const bits = halftoneField(flat(128, w, h), { frequency: 42, angle: 0, shape: HALFTONE_ROUND }, { dpi: 254 });
    let ink = 0;
    for (let j = 0; j < bits.length; j++) ink += bits[j];
    const comps = inkComponents(bits, w, h);
    expect(ink).toBeGreaterThan(0);
    expect(comps).toBeGreaterThan(0);
    // Each dot is a multi-pixel blob → mean component size well above a speck.
    expect(ink / comps).toBeGreaterThan(3);
    // And there are far fewer blobs than inked pixels (clustered, not scattered).
    expect(comps).toBeLessThan(ink / 2);
  });
});

describe('halftoneField — round vs diamond dot shape', () => {
  it('round and diamond both dot a mid field but produce DIFFERENT bits', () => {
    const opts = { dpi: 254, invert: false };
    const base = { frequency: 48, angle: 0 };
    const f = flat(128, 24, 24);
    const round = halftoneField(f, { ...base, shape: HALFTONE_ROUND }, opts);
    const diamond = halftoneField(f, { ...base, shape: HALFTONE_DIAMOND }, opts);
    // Both are genuine dot fields (a mix of ink and paper), not a solid block.
    for (const bits of [round, diamond]) {
      expect(inkFraction(bits)).toBeGreaterThan(0);
      expect(inkFraction(bits)).toBeLessThan(1);
    }
    // The two distance metrics (Euclidean vs Manhattan) place different edges.
    expect(Array.from(round)).not.toEqual(Array.from(diamond));
  });
});

describe('halftoneField — screen angle rotates the dot lattice', () => {
  it('0° and 45° screens of the same field produce DIFFERENT (rotated) patterns', () => {
    const opts = { dpi: 254, invert: false };
    const f = flat(128, 24, 24);
    const a0 = halftoneField(f, { frequency: 48, angle: 0, shape: HALFTONE_ROUND }, opts);
    const a45 = halftoneField(f, { frequency: 48, angle: 45, shape: HALFTONE_ROUND }, opts);
    expect(Array.from(a0)).not.toEqual(Array.from(a45));
  });

  it('is deterministic — the same config screens byte-identically', () => {
    const opts = { dpi: 254, invert: false };
    const f = flat(140, 20, 20);
    const p = { frequency: 40, angle: 30, shape: HALFTONE_ROUND };
    expect(Array.from(halftoneField(f, p, opts))).toEqual(Array.from(halftoneField(f, p, opts)));
  });
});

describe('halftoneField — frequency (LPI) sets cell size via DPI', () => {
  it('higher LPI ⇒ smaller, denser cells ⇒ more dot edges per row', () => {
    const opts = { dpi: 254, invert: false };
    const f = flat(128, 48, 48);
    const coarse = halftoneField(f, { frequency: 24, angle: 0, shape: HALFTONE_ROUND }, opts);
    const fine = halftoneField(f, { frequency: 96, angle: 0, shape: HALFTONE_ROUND }, opts);
    const y = 24;
    expect(rowTransitions(fine, 48, y)).toBeGreaterThan(rowTransitions(coarse, 48, y));
  });

  it('cell size depends ONLY on the dpi/frequency ratio (the LPI→device-px law)', () => {
    // cell = dpi / frequency, so halving BOTH dpi and frequency leaves the cell —
    // hence every screened bit — unchanged. This pins the LPI→device-px conversion.
    const f = flat(120, 24, 24);
    const p = (frequency) => ({ frequency, angle: 20, shape: HALFTONE_ROUND });
    const a = halftoneField(f, p(64), { dpi: 254, invert: false });
    const b = halftoneField(f, p(32), { dpi: 127, invert: false });
    expect(Array.from(a)).toEqual(Array.from(b));
  });

  it('defaults dpi to 254 when opts omits it (worker-safe fallback)', () => {
    const f = flat(120, 24, 24);
    const p = { frequency: 40, angle: 20, shape: HALFTONE_ROUND };
    expect(Array.from(halftoneField(f, p, { invert: false })))
      .toEqual(Array.from(halftoneField(f, p, { dpi: 254, invert: false })));
  });
});

describe('halftoneField — polarity, transparency, pixel-independence', () => {
  it('dark = ink: a dark field inks more than a light field (non-inverted)', () => {
    const opts = { dpi: 254, invert: false };
    const p = { frequency: 48, angle: 45, shape: HALFTONE_ROUND };
    const dark = inkFraction(halftoneField(flat(48, 24, 24), p, opts));
    const light = inkFraction(halftoneField(flat(208, 24, 24), p, opts));
    expect(dark).toBeGreaterThan(light);
  });

  it('invert flips polarity: the LIGHT end etches instead', () => {
    const p = { frequency: 48, angle: 45, shape: HALFTONE_ROUND };
    const f = flat(208, 24, 24); // bright field
    const plain = inkFraction(halftoneField(f, p, { dpi: 254, invert: false }));
    const inv = inkFraction(halftoneField(f, p, { dpi: 254, invert: true }));
    expect(inv).toBeGreaterThan(plain);
  });

  it('transparent pixels (alpha<128) are ALWAYS paper, whatever the dot decides', () => {
    // Two black pixels (darkness 1 → maximal dot), first transparent. The dot would
    // ink both; the per-pixel opacity guard forces the transparent one to paper.
    const gray = new Float64Array([0, 0]);
    const alpha = new Uint8ClampedArray([0, 255]);
    const bits = halftoneField({ gray, alpha, width: 2, height: 1 }, { frequency: 48, angle: 0, shape: HALFTONE_ROUND }, { dpi: 254 });
    expect(bits[0]).toBe(0); // transparent → paper despite luma 0
    expect(bits[1]).toBe(1); // opaque black → ink
  });

  it('pixel-independence: changing one pixel never flips ANOTHER (parallel, sub-tile stable)', () => {
    const w = 16;
    const h = 16;
    const gray = new Float64Array(w * h);
    for (let j = 0; j < gray.length; j++) gray[j] = 100 + ((j * 7) % 60);
    const alpha = new Uint8ClampedArray(w * h).fill(255);
    const p = { frequency: 48, angle: 15, shape: HALFTONE_ROUND };
    const a = halftoneField({ gray, alpha, width: w, height: h }, p, { dpi: 254 });
    const gray2 = Float64Array.from(gray);
    gray2[7 * w + 7] = gray2[7 * w + 7] > 127 ? 0 : 255; // flip one pixel hard
    const b = halftoneField({ gray: gray2, alpha, width: w, height: h }, p, { dpi: 254 });
    for (let j = 0; j < a.length; j++) {
      if (j === 7 * w + 7) continue; // the changed pixel may differ
      expect(b[j]).toBe(a[j]); // every OTHER pixel untouched → no neighbour bleed
    }
  });

  it('output length always equals the full device-pixel count', () => {
    const f = flat(128, 13, 7);
    expect(halftoneField(f, { frequency: 40 }, { dpi: 254 }).length).toBe(13 * 7);
  });
});
