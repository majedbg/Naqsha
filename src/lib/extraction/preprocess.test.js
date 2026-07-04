// preprocess — the optional CV cleanup chain before binarization (issue #70;
// refs #62 #48). Tests assert REAL behavior, not merely that code runs:
//   - the discriminating test builds an image where a single GLOBAL threshold
//     provably fails (a constant-contrast shape under a brightness ramp) and
//     asserts adaptive RECOVERS the shape where global loses/merges it — it
//     fails if adaptive were a no-op;
//   - brightness/contrast/blur assert known numeric outputs;
//   - min-area drops small components and keeps large ones;
//   - defaults are byte-identical to the legacy global binarizer;
//   - options thread end-to-end through vectorize.

import { describe, it, expect } from 'vitest';
import {
  toGrayImage,
  toGrayField,
  adjustBrightnessContrast,
  gaussianBlur,
  adaptiveThreshold,
  connectedComponents,
  suppressSmallRegions,
  preprocess,
  binarize,
} from './preprocess';
import { thresholdImage, vectorize } from './vectorizer';

// --- fixtures ---------------------------------------------------------------

// RGBA image from a per-pixel luma function (opaque). Values clamp on assign.
function lumaImage(width, height, lumaAt) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const v = lumaAt(x, y);
      const i = (y * width + x) * 4;
      data[i] = v;
      data[i + 1] = v;
      data[i + 2] = v;
      data[i + 3] = 255;
    }
  }
  return { data, width, height };
}

// ink test on a binary RGBA image (ink = black).
function inkAt(image, x, y) {
  const i = (y * image.width + x) * 4;
  const luma = 0.299 * image.data[i] + 0.587 * image.data[i + 1] + 0.114 * image.data[i + 2];
  return image.data[i + 3] >= 128 && luma < 128;
}

// --- THE DISCRIMINATING TEST -----------------------------------------------

describe('adaptive vs global threshold — the discriminator', () => {
  // A horizontal brightness RAMP (dark left → bright right) with vertical bars
  // that are a CONSTANT 90 luma DARKER than their local background. Because the
  // ramp spans the global cut, no single threshold separates the bars
  // everywhere: a rightmost bar (luma ~137) is LIGHTER than the left background
  // (luma ~125), so any global cut either loses the right bars or floods the
  // left background. Sauvola, judging each pixel against its neighborhood,
  // recovers every bar.
  const W = 120;
  const H = 60;
  const DIP = 90;
  const ramp = (x) => 110 + (x / (W - 1)) * 135; // 110 .. 245
  const isBar = (x) => x % 20 < 6; // 6 bars: x∈[0,6),[20,26),…,[100,106)
  const img = lumaImage(W, H, (x) => (isBar(x) ? ramp(x) - DIP : ramp(x)));

  it('global (t=128) loses the right bars and floods the left background', () => {
    const bw = binarize(img); // default = global 128
    // Rightmost bar (x≈103, luma ~137 > 128) is LOST — not ink.
    expect(inkAt(bw, 103, 30)).toBe(false);
    // Left background (x=13, luma ~125 < 128) is FLOODED — wrongly ink.
    expect(inkAt(bw, 13, 30)).toBe(true);
  });

  it('adaptive recovers the same bars global gets wrong', () => {
    const bw = adaptiveThreshold(img, { window: 25, k: 0.2 });
    // Rightmost bar RECOVERED where global lost it.
    expect(inkAt(bw, 103, 30)).toBe(true);
    // Left background NOT flooded where global was wrong.
    expect(inkAt(bw, 13, 30)).toBe(false);
  });

  it('adaptive separates all 6 bars; global cannot', () => {
    const adaptive = adaptiveThreshold(img, { window: 25, k: 0.2 });
    const global = binarize(img);
    const aCC = connectedComponents(adaptive);
    const gCC = connectedComponents(global);
    // Adaptive resolves the six distinct vertical bars.
    expect(aCC.count).toBe(6);
    // Global merges/loses them into far fewer blobs — structurally wrong.
    expect(gCC.count).toBeLessThan(6);
  });
});

// --- brightness / contrast --------------------------------------------------

describe('brightness / contrast', () => {
  it('is identity at 0/0', () => {
    const img = lumaImage(4, 1, (x) => 40 + x * 50); // 40,90,140,190
    const out = adjustBrightnessContrast(img, { brightness: 0, contrast: 0 });
    for (let x = 0; x < 4; x++) {
      const i = x * 4;
      expect(out.data[i]).toBe(40 + x * 50);
    }
  });

  it('brightness shifts luma by brightness*2.55, clamped', () => {
    const img = lumaImage(2, 1, (x) => (x === 0 ? 100 : 250));
    const out = adjustBrightnessContrast(img, { brightness: 10 }); // +25.5
    expect(out.data[0]).toBe(Math.round(100 + 25.5)); // 126
    expect(out.data[4]).toBe(255); // 250+25.5 → clamp
  });

  it('positive contrast pushes above/below 128 apart', () => {
    const img = lumaImage(2, 1, (x) => (x === 0 ? 108 : 148)); // ±20 about 128
    const out = adjustBrightnessContrast(img, { contrast: 50 });
    // F(50) = 259*(50*2.55+255)/(255*(259-50*2.55)) ≈ 2.11
    const F = (259 * (50 * 2.55 + 255)) / (255 * (259 - 50 * 2.55));
    expect(out.data[0]).toBe(Math.round(F * (108 - 128) + 128));
    expect(out.data[4]).toBe(Math.round(F * (148 - 128) + 128));
    expect(out.data[0]).toBeLessThan(108); // darker got darker
    expect(out.data[4]).toBeGreaterThan(148); // lighter got lighter
  });
});

// --- Gaussian blur ----------------------------------------------------------

describe('gaussian blur', () => {
  it('spreads an impulse to its neighborhood, center stays the max', () => {
    const W = 9;
    const H = 9;
    const img = lumaImage(W, H, (x, y) => (x === 4 && y === 4 ? 255 : 0));
    const out = gaussianBlur(img, { sigma: 1 });
    const at = (x, y) => out.data[(y * W + x) * 4];
    expect(at(4, 4)).toBeGreaterThan(0); // impulse spread here
    expect(at(3, 4)).toBeGreaterThan(0); // ...and to neighbors
    expect(at(5, 4)).toBeGreaterThan(0);
    expect(at(4, 3)).toBeGreaterThan(0);
    // Center remains the brightest (peak of a Gaussian).
    expect(at(4, 4)).toBeGreaterThanOrEqual(at(3, 4));
    expect(at(4, 4)).toBeGreaterThanOrEqual(at(4, 3));
    // Symmetric.
    expect(at(3, 4)).toBe(at(5, 4));
    expect(at(4, 3)).toBe(at(4, 5));
  });

  it('preserves mean (normalized kernel) on a flat field', () => {
    const img = lumaImage(16, 16, () => 120);
    const out = gaussianBlur(img, { sigma: 2 });
    for (let j = 0; j < 16 * 16; j++) expect(out.data[j * 4]).toBe(120);
  });

  // #70b guard: blur:0 must mean "no blur" and NEVER build a sigma-0 kernel
  // (gaussianKernel(0) divides by zero → NaN weights). The Refine UI passes 0
  // for "off"; runChain must short-circuit it. Asserts the whole chain is
  // finite and byte-identical to the no-blur path.
  it('blur:0 is a no-op — no divide-by-zero, identical to the unblurred chain', () => {
    const img = lumaImage(20, 12, (x) => 40 + x * 8);
    expect(() => preprocess(img, { blur: 0 })).not.toThrow();
    const withZero = preprocess(img, { blur: 0 });
    const without = preprocess(img, {});
    for (const key of ['gray', 'adjusted', 'denoised', 'binary']) {
      for (let j = 0; j < withZero[key].data.length; j++) {
        expect(Number.isFinite(withZero[key].data[j])).toBe(true);
        expect(withZero[key].data[j]).toBe(without[key].data[j]);
      }
    }
    // The mask the trace binarizes is likewise unaffected + finite.
    expect(() => binarize(img, { blur: 0 })).not.toThrow();
    expect(Array.from(binarize(img, { blur: 0 }).data)).toEqual(
      Array.from(binarize(img, {}).data)
    );
  });
});

// --- min-area suppression ---------------------------------------------------

describe('min-area suppression', () => {
  // A big 10×10 ink block and a lone 1px speckle on white.
  const img = lumaImage(40, 20, (x, y) => {
    const big = x >= 2 && x < 12 && y >= 2 && y < 12; // area 100
    const speck = x === 30 && y === 10; // area 1
    return big || speck ? 0 : 255;
  });

  it('finds both components before suppression', () => {
    expect(connectedComponents(img).count).toBe(2);
  });

  it('drops components below minArea, keeps those above', () => {
    const cleaned = suppressSmallRegions(img, { minArea: 10 });
    expect(inkAt(cleaned, 6, 6)).toBe(true); // big block survives
    expect(inkAt(cleaned, 30, 10)).toBe(false); // speckle removed
    expect(connectedComponents(cleaned).count).toBe(1);
  });
});

// --- default equivalence (no regression to the 3234) ------------------------

describe('defaults collapse to the legacy global binarizer', () => {
  const img = lumaImage(32, 24, (x, y) => (x + y) % 7 < 3 ? 60 : 200);

  it('binarize() with no options is byte-identical to thresholdImage(128)', () => {
    const a = binarize(img).data;
    const b = thresholdImage(img, 128).data;
    expect(Array.from(a)).toEqual(Array.from(b));
  });

  it('binarize({invert}) matches thresholdImage(128,{invert})', () => {
    const a = binarize(img, { invert: true }).data;
    const b = thresholdImage(img, 128, { invert: true }).data;
    expect(Array.from(a)).toEqual(Array.from(b));
  });

  it('preprocess().binary at defaults also equals thresholdImage(128)', () => {
    const a = preprocess(img).binary.data;
    const b = thresholdImage(img, 128).data;
    expect(Array.from(a)).toEqual(Array.from(b));
  });
});

// --- intermediate-buffer API (the #70b filmstrip contract) ------------------

describe('intermediate buffers', () => {
  const img = lumaImage(20, 12, (x) => 40 + x * 8);

  it('preprocess exposes gray/adjusted/denoised/binary as sized RGBA buffers', () => {
    const p = preprocess(img, { brightness: 10, blur: 1, adaptive: true, minArea: 2 });
    for (const key of ['gray', 'adjusted', 'denoised', 'binary']) {
      expect(p[key].width).toBe(20);
      expect(p[key].height).toBe(12);
      expect(p[key].data).toBeInstanceOf(Uint8ClampedArray);
      expect(p[key].data.length).toBe(20 * 12 * 4);
    }
    // binary is opaque black/white; gray carries real luma.
    for (let j = 0; j < 20 * 12; j++) {
      const v = p.binary.data[j * 4];
      expect(v === 0 || v === 255).toBe(true);
      expect(p.binary.data[j * 4 + 3]).toBe(255);
    }
  });

  it('toGrayImage/toGrayField agree on luma', () => {
    const gi = toGrayImage(img);
    const gf = toGrayField(img);
    expect(gi.data.length).toBe(20 * 12 * 4);
    expect(gi.data[0]).toBe(Math.round(gf.gray[0]));
  });
});

// --- end-to-end threading through vectorize ---------------------------------

describe('options thread through vectorize', () => {
  // Light bars on a dark ramped ground → needs invert + adaptive to trace as
  // members. We only assert the option CHANGES the geometry (adaptive ≠ global),
  // proving the keys flow options.trace → vectorize → binarize.
  const W = 96;
  const H = 48;
  const img = lumaImage(W, H, (x) => {
    const bar = x % 16 < 5;
    const base = 30 + (x / (W - 1)) * 40; // dark ramp 30..70
    return bar ? base + 120 : base; // light bars on dark
  });

  it('adaptive option produces different geometry than the global default', async () => {
    const global = await vectorize(img, { invert: true });
    const adaptive = await vectorize(img, { invert: true, adaptive: true, window: 21, k: 0.2 });
    const count = (r) => r.components.length;
    // The adaptive local cut recovers more members than a single global cut on
    // the ramped ground — a strictly different (richer) trace.
    expect(count(adaptive)).not.toBe(count(global));
    expect(count(adaptive)).toBeGreaterThan(count(global));
  });

  it('minArea drops speckle components in the trace output', async () => {
    // solid shape + isolated speckles
    const dotted = lumaImage(60, 40, (x, y) => {
      const block = x >= 5 && x < 20 && y >= 5 && y < 20;
      const speck = (x === 40 && y === 10) || (x === 45 && y === 30) || (x === 50 && y === 8);
      return block || speck ? 0 : 255;
    });
    const withSpeck = await vectorize(dotted, { minArea: 0, turdsize: 0 });
    const cleaned = await vectorize(dotted, { minArea: 5, turdsize: 0 });
    expect(cleaned.components.length).toBeLessThan(withSpeck.components.length);
  });
});
