import { describe, it, expect } from 'vitest';
import {
  DITHER_FS,
  DITHER_BAYER_2,
  DITHER_BAYER_4,
  DITHER_BAYER_8,
  BAYER_2,
  BAYER_4,
  BAYER_8,
  bayerMatrixForMode,
  floydSteinbergBits,
  orderedBayerBits,
  ditherField,
} from './etchDither.js';

// Build a { gray, alpha, width, height } field from a 2D array of luma values.
// Fully opaque unless an alpha grid is given (so the goldens are alpha-free).
function field(rows, alphaRows) {
  const height = rows.length;
  const width = rows[0].length;
  const gray = new Float64Array(width * height);
  const alpha = new Uint8ClampedArray(width * height).fill(255);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      gray[y * width + x] = rows[y][x];
      if (alphaRows) alpha[y * width + x] = alphaRows[y][x];
    }
  }
  return { gray, alpha, width, height };
}

function inkFraction(bits) {
  let n = 0;
  for (let j = 0; j < bits.length; j++) n += bits[j];
  return n / bits.length;
}

describe('Floyd–Steinberg error diffusion — golden pins (raster order, 7/16 3/16 5/16 1/16)', () => {
  // A one-row field diffuses ONLY the 7/16 right term (the 3/16·5/16·1/16 terms
  // fall on the non-existent row below and are dropped), so it is fully
  // hand-computable. threshold 128, dark<128 = ink(1):
  //   x0: 128        → 128<128? no  → paper(0), quant 255, err −127 → +7/16·−127=−55.5625 → x1
  //   x1: 72.4375    → <128       → ink(1),   quant   0, err  72.4375 → +31.6914 → x2
  //   x2: 159.6914   → no          → paper(0), quant 255, err −95.309 → −41.697  → x3
  //   x3:  86.303    → <128       → ink(1)
  it('a single row is the pure horizontal 7/16 case → [0,1,0,1]', () => {
    const bits = floydSteinbergBits(field([[128, 128, 128, 128]]), { threshold: 128, invert: false });
    expect(Array.from(bits)).toEqual([0, 1, 0, 1]);
  });

  // 2×2 exercises ALL four coefficients (BL 3/16, B 5/16, BR 1/16):
  //   (0,0) 128 → paper, err −127 → (0,1)+=−55.5625, (1,0)+=−39.6875, (1,1)+=−7.9375
  //   (0,1) 72.4375 → ink,  err  72.4375 → (1,0)+=13.582, (1,1)+=22.637
  //   (1,0) 101.894 → ink
  //   (1,1) 142.699 → paper
  it('a 2×2 exercises the BL/B/BR terms → [0,1,1,0]', () => {
    const bits = floydSteinbergBits(field([[128, 128], [128, 128]]), { threshold: 128, invert: false });
    expect(Array.from(bits)).toEqual([0, 1, 1, 0]);
  });

  // A serpentine (boustrophedon) FS reference: even rows L→R, odd rows R→L, with
  // the below-row terms mirrored to the row's travel direction. Used ONLY to
  // prove the 3×3 golden below genuinely discriminates scan order — if the module
  // ever switched to serpentine, the golden would flip red instead of passing.
  function serpentineFS(rows, threshold = 128) {
    const h = rows.length;
    const w = rows[0].length;
    const buf = new Float64Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) buf[y * w + x] = rows[y][x];
    const bits = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) {
      const dir = y % 2 === 0 ? 1 : -1; // travel direction this row
      for (let step = 0; step < w; step++) {
        const x = dir === 1 ? step : w - 1 - step;
        const j = y * w + x;
        const old = buf[j];
        const ink = old < threshold;
        bits[j] = ink ? 1 : 0;
        const err = old - (ink ? 0 : 255);
        if (x + dir >= 0 && x + dir < w) buf[j + dir] += (err * 7) / 16;
        if (y + 1 < h) {
          const below = j + w;
          if (x - dir >= 0 && x - dir < w) buf[below - dir] += (err * 3) / 16;
          buf[below] += (err * 5) / 16;
          if (x + dir >= 0 && x + dir < w) buf[below + dir] += (err * 1) / 16;
        }
      }
    }
    return bits;
  }

  // An ASYMMETRIC 3×3 (a flat field is scan-symmetric — raster == serpentine — so
  // it can't discriminate order; this one can). It genuinely exercises the
  // below-row terms (3/16 BL, 5/16 B, 1/16 BR) AND the L→R direction.
  // Row-0 raster derivation (threshold 128, quant 0/255, err = old−quant):
  //   (0,0)200 ≥128 → PAPER(0), err −55 → (0,1)−24.06, (1,0)−17.19, (1,1)−3.44
  //   (0,1)103.94 <128 → INK(1),  err 103.94 → (0,2)+45.47,(1,0)+19.49,(1,1)+32.48,(1,2)+6.50
  //   (0,2)105.47 <128 → INK(1)                                          ⇒ row0 [0,1,1]
  // Rows 1–2 continue the same raster recurrence (buffer carried DOWNWARD and
  // rightward); the full expected field is the golden below. Because the scan is
  // raster, a SERPENTINE scan of the SAME input accumulates a different buffer and
  // lands different bits (proven by the reference guard) — so this golden goes red
  // under any scan-order OR coefficient-position regression, unlike the flat cases.
  it('an asymmetric 3×3 golden pins RASTER order + the below-row terms (serpentine differs)', () => {
    const rows = [[200, 128, 60], [128, 128, 128], [60, 128, 200]];
    const golden = [0, 1, 1, 0, 1, 0, 1, 0, 0];
    const bits = floydSteinbergBits(field(rows), { threshold: 128, invert: false });
    expect(Array.from(bits)).toEqual(golden);
    // Prove the golden truly depends on scan order (not vacuously invariant): a
    // serpentine scan of the same input yields a DIFFERENT field.
    expect(Array.from(serpentineFS(rows))).not.toEqual(golden);
  });

  it('does NOT mutate the input field (diffuses into a private copy)', () => {
    const f = field([[100, 140], [90, 200]]);
    const before = Array.from(f.gray);
    floydSteinbergBits(f, { threshold: 128, invert: false });
    expect(Array.from(f.gray)).toEqual(before);
  });

  it('preserves average tone: ink fraction ≈ mean darkness of a flat mid field', () => {
    // A large flat field at luma 96 → darkness 159/255 ≈ 0.6235 of the range as ink.
    const w = 32;
    const h = 32;
    const gray = new Float64Array(w * h).fill(96);
    const alpha = new Uint8ClampedArray(w * h).fill(255);
    const bits = floydSteinbergBits({ gray, alpha, width: w, height: h }, { threshold: 128, invert: false });
    expect(inkFraction(bits)).toBeCloseTo((255 - 96) / 255, 1);
  });

  it('invert flips polarity: light becomes ink', () => {
    // Bright field 200: non-invert → mostly paper; invert → mostly ink.
    const w = 16;
    const h = 16;
    const gray = new Float64Array(w * h).fill(200);
    const alpha = new Uint8ClampedArray(w * h).fill(255);
    const plain = floydSteinbergBits({ gray, alpha, width: w, height: h }, { threshold: 128, invert: false });
    const inv = floydSteinbergBits({ gray, alpha, width: w, height: h }, { threshold: 128, invert: true });
    expect(inkFraction(plain)).toBeLessThan(0.5);
    expect(inkFraction(inv)).toBeGreaterThan(0.5);
  });

  it('transparent pixels (alpha<128) are always paper', () => {
    const bits = floydSteinbergBits(
      field([[0, 0]], [[0, 255]]), // both black, but first is transparent
      { threshold: 128, invert: false },
    );
    expect(bits[0]).toBe(0); // transparent → paper despite luma 0
    expect(bits[1]).toBe(1); // opaque black → ink
  });

  it('FS carries neighbour state: a bottom sub-tile differs from the full image', () => {
    // Rows below r0 lost the error diffused from the rows above them, so screening
    // a bottom slice on its own is NOT equal to the corresponding rows of the full
    // screen — the discriminator that proves FS is sequential (contrast Bayer).
    const rows = Array.from({ length: 16 }, (_, y) => Array.from({ length: 8 }, () => 100 + (y % 5) * 10));
    const full = floydSteinbergBits(field(rows), { threshold: 128, invert: false });
    const r0 = 8;
    const bottom = floydSteinbergBits(field(rows.slice(r0)), { threshold: 128, invert: false });
    const fullBottom = full.slice(r0 * 8);
    expect(Array.from(bottom)).not.toEqual(Array.from(fullBottom));
  });
});

describe('ordered Bayer — pure per-pixel threshold matrix (no neighbour state)', () => {
  it('the recursive matrices have the classic values and dimensions', () => {
    expect(BAYER_2).toEqual([[0, 2], [3, 1]]);
    expect(BAYER_4.length).toBe(4);
    expect(BAYER_4[0]).toEqual([0, 8, 2, 10]);
    expect(BAYER_8.length).toBe(8);
    // Every Bayer NxN is a permutation of 0..N²−1.
    const flat8 = BAYER_8.flat().slice().sort((a, b) => a - b);
    expect(flat8).toEqual(Array.from({ length: 64 }, (_, i) => i));
  });

  it('bayerMatrixForMode maps the three modes to their matrices', () => {
    expect(bayerMatrixForMode(DITHER_BAYER_2)).toBe(BAYER_2);
    expect(bayerMatrixForMode(DITHER_BAYER_4)).toBe(BAYER_4);
    expect(bayerMatrixForMode(DITHER_BAYER_8)).toBe(BAYER_8);
  });

  it('pixel-independence (neighbour-flip): changing one pixel never flips ANOTHER pixel', () => {
    const rows = Array.from({ length: 8 }, (_, y) => Array.from({ length: 8 }, (_, x) => 100 + ((x + y) % 7) * 8));
    const a = orderedBayerBits(field(rows), { matrix: BAYER_4, invert: false });
    const rows2 = rows.map((r) => r.slice());
    rows2[3][3] = rows2[3][3] === 0 ? 255 : 0; // flip one pixel hard
    const b = orderedBayerBits(field(rows2), { matrix: BAYER_4, invert: false });
    for (let j = 0; j < a.length; j++) {
      if (j === 3 * 8 + 3) continue; // the changed pixel may differ
      expect(b[j]).toBe(a[j]); // every OTHER pixel is untouched → no neighbour bleed
    }
  });

  it('pixel-independence (aligned sub-tile): a bottom slice equals the full screen for those rows', () => {
    // Bayer reads only its own coord+luma, so an 8-aligned bottom slice (matrix
    // phase preserved) screens identically to the full image's matching rows.
    const rows = Array.from({ length: 16 }, (_, y) => Array.from({ length: 8 }, (_, x) => 90 + ((x * y) % 9) * 12));
    for (const matrix of [BAYER_2, BAYER_4, BAYER_8]) {
      const full = orderedBayerBits(field(rows), { matrix, invert: false });
      const r0 = 8; // multiple of 8 → aligned for N = 2, 4, 8
      const bottom = orderedBayerBits(field(rows.slice(r0)), { matrix, invert: false });
      expect(Array.from(bottom)).toEqual(Array.from(full.slice(r0 * 8)));
    }
  });

  it('all three matrix sizes screen a flat mid field near 50% and preserve tone monotonically', () => {
    const mk = (v) => {
      const g = new Float64Array(16 * 16).fill(v);
      const a = new Uint8ClampedArray(16 * 16).fill(255);
      return { gray: g, alpha: a, width: 16, height: 16 };
    };
    for (const matrix of [BAYER_2, BAYER_4, BAYER_8]) {
      const dark = inkFraction(orderedBayerBits(mk(64), { matrix, invert: false }));
      const mid = inkFraction(orderedBayerBits(mk(128), { matrix, invert: false }));
      const light = inkFraction(orderedBayerBits(mk(192), { matrix, invert: false }));
      expect(mid).toBeGreaterThan(0.35);
      expect(mid).toBeLessThan(0.65);
      expect(dark).toBeGreaterThan(mid); // darker source → more ink
      expect(light).toBeLessThan(mid);
    }
  });

  it('transparent pixels are paper regardless of the matrix cell', () => {
    const bits = orderedBayerBits(field([[0, 0]], [[0, 255]]), { matrix: BAYER_2, invert: false });
    expect(bits[0]).toBe(0);
  });
});

describe('ditherField — mode dispatch + size (device-pixels per dither cell)', () => {
  const gradient = () => {
    const w = 16;
    const h = 16;
    const gray = new Float64Array(w * h);
    const alpha = new Uint8ClampedArray(w * h).fill(255);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) gray[y * w + x] = (x / (w - 1)) * 255;
    return { gray, alpha, width: w, height: h };
  };

  it('mode floyd-steinberg matches the FS kernel at size 1', () => {
    const f = gradient();
    expect(Array.from(ditherField(f, { mode: DITHER_FS, size: 1 }, { threshold: 128, invert: false })))
      .toEqual(Array.from(floydSteinbergBits(f, { threshold: 128, invert: false })));
  });

  it('mode bayer-4 matches the Bayer kernel at size 1', () => {
    const f = gradient();
    expect(Array.from(ditherField(f, { mode: DITHER_BAYER_4, size: 1 }, { threshold: 128, invert: false })))
      .toEqual(Array.from(orderedBayerBits(f, { matrix: BAYER_4, invert: false })));
  });

  it('size coarsens dots: at size 4 every 4×4 device cell is a single uniform dot', () => {
    const f = gradient();
    const size = 4;
    const bits = ditherField(f, { mode: DITHER_BAYER_4, size }, { threshold: 128, invert: false });
    const w = f.width;
    for (let cy = 0; cy < f.height; cy += size) {
      for (let cx = 0; cx < w; cx += size) {
        const v = bits[cy * w + cx];
        for (let dy = 0; dy < size && cy + dy < f.height; dy++) {
          for (let dx = 0; dx < size && cx + dx < w; dx++) {
            expect(bits[(cy + dy) * w + (cx + dx)]).toBe(v); // whole cell shares one bit
          }
        }
      }
    }
  });

  it('size is deterministic (same input → same bits) and different from size 1', () => {
    const f = gradient();
    const a = ditherField(f, { mode: DITHER_FS, size: 3 }, { threshold: 128, invert: false });
    const b = ditherField(f, { mode: DITHER_FS, size: 3 }, { threshold: 128, invert: false });
    const one = ditherField(f, { mode: DITHER_FS, size: 1 }, { threshold: 128, invert: false });
    expect(Array.from(a)).toEqual(Array.from(b));
    expect(Array.from(a)).not.toEqual(Array.from(one));
  });

  it('coerces a string size and guards size<1 (no divide-by-zero)', () => {
    const f = gradient();
    const asStr = ditherField(f, { mode: DITHER_BAYER_2, size: '2' }, { threshold: 128, invert: false });
    const asNum = ditherField(f, { mode: DITHER_BAYER_2, size: 2 }, { threshold: 128, invert: false });
    expect(Array.from(asStr)).toEqual(Array.from(asNum));
    // size 0 / fractional < 1 clamps to full-res (size 1), never throws.
    const zero = ditherField(f, { mode: DITHER_BAYER_2, size: 0 }, { threshold: 128, invert: false });
    const one = ditherField(f, { mode: DITHER_BAYER_2, size: 1 }, { threshold: 128, invert: false });
    expect(Array.from(zero)).toEqual(Array.from(one));
  });

  it('output length always equals the full device-pixel count', () => {
    const f = gradient();
    expect(ditherField(f, { mode: DITHER_FS, size: 5 }, {}).length).toBe(f.width * f.height);
  });

  it('size>1: transparent pixels do NOT pollute the block mean (no dark fringe)', () => {
    // A majority-opaque WHITE cell (luma 255) that also contains some transparent
    // pixels (cleared-canvas RGB≈0) must stay PAPER. Averaging the transparent
    // luma into the mean would drag it toward ink (12·255 + 4·0)/16 = 191 < 255
    // and, at a low enough matrix threshold, produce a spurious ink fringe.
    const w = 4;
    const h = 4; // one 4×4 cell at size 4
    const gray = new Float64Array(w * h).fill(255); // opaque region is white
    const alpha = new Uint8ClampedArray(w * h).fill(255);
    // Punch four transparent pixels (still luma 0 underneath) — cell is majority opaque.
    for (const j of [0, 5, 10, 15]) {
      gray[j] = 0;
      alpha[j] = 0;
    }
    const bits = ditherField({ gray, alpha, width: w, height: h }, { mode: DITHER_BAYER_2, size: 4 }, { threshold: 128, invert: false });
    // The opaque-white cell means to 255 (opaque pixels only) → paper everywhere.
    for (let j = 0; j < bits.length; j++) expect(bits[j]).toBe(0);
  });

  it('size>1: a fully-transparent cell stays paper', () => {
    const w = 2;
    const h = 2;
    const gray = new Float64Array(w * h).fill(0); // black underneath
    const alpha = new Uint8ClampedArray(w * h).fill(0); // all transparent
    const bits = ditherField({ gray, alpha, width: w, height: h }, { mode: DITHER_FS, size: 2 }, { threshold: 128, invert: false });
    for (let j = 0; j < bits.length; j++) expect(bits[j]).toBe(0);
  });
});
