import { describe, it, expect } from 'vitest';
import {
  applyHighlightHold,
  isMirrorMaterial,
  resolveHold,
  createHoldParams,
  DEFAULT_HOLD_CUTOFF,
  MIRROR_MATERIAL_IDS,
} from './etchHold.js';
import { etchSourceToBitmap } from './etchProcess.js';
import { toGrayField } from '../extraction/preprocess.js';
import { encodeEtchPNG } from './etchBitmap.js';
import { createDitherStage, createHalftoneStage } from './etchStage.js';
import {
  DITHER_FS,
  DITHER_BAYER_2,
  DITHER_BAYER_4,
  DITHER_BAYER_8,
} from './etchDither.js';
import { HALFTONE_ROUND, HALFTONE_DIAMOND } from './etchHalftone.js';

// A flat RGBA image of one gray value, every pixel opaque. Near-white sources are
// the mirror-danger case: a Dither Stage renders any sub-255 luma as proportional
// dot density (luma 245 → ~4% ink), so WITHOUT the Hold, dots scatter into the
// highlight band — exactly what scars a mirror.
function flatGrayImage(value, width, height) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let j = 0; j < width * height; j++) {
    const i = j * 4;
    data[i] = value;
    data[i + 1] = value;
    data[i + 2] = value;
    data[i + 3] = 255;
  }
  return { data, width, height };
}

// A vertical luma ramp 0..255 (left dark → right light) so a single fixture spans
// both sides of any cutoff: pixels ≥ cutoff must be held, pixels below untouched.
function rampImage(width, height) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const v = Math.round((x / (width - 1)) * 255);
      const i = (y * width + x) * 4;
      data[i] = v;
      data[i + 1] = v;
      data[i + 2] = v;
      data[i + 3] = 255;
    }
  }
  return { data, width, height };
}

const ALL_DITHER_MODES = [DITHER_FS, DITHER_BAYER_2, DITHER_BAYER_4, DITHER_BAYER_8];

describe('Highlight Hold — the post-screening white guarantee (decision 5)', () => {
  // THE headline test. For EVERY screening path, first prove the THREAT is real
  // (hold OFF places dots above the cutoff), then prove the GUARANTEE (hold ON
  // forces every one of them to paper). The hold-OFF precondition also validates
  // the fixture — if it shows zero dots the fixture proves nothing.
  // A bright highlight (luma 210) held at cutoff 205. 210 is chosen below the
  // COARSEST Bayer-2 threshold (~223) so even the 4-level ordered screen still
  // inks a quarter of its cells here — otherwise the "threat is real" precondition
  // would be vacuous for Bayer-2 (which can place no dot above ~223). Every pixel
  // is ≥ cutoff, so the whole image is held territory.
  const CUTOFF = 205;

  for (const mode of ALL_DITHER_MODES) {
    it(`mode ${mode}: dots land in the highlight band with Hold OFF, ZERO with Hold ON`, () => {
      const img = flatGrayImage(210, 24, 24);
      const gray = toGrayField(img);
      const stack = [{ ...createDitherStage(), params: { mode, size: 1 } }];

      // (a) THREAT: Hold OFF must scatter at least one ink dot above the cutoff.
      const off = etchSourceToBitmap(img, { stack, hold: { enabled: false, cutoff: CUTOFF } });
      const dotsOff = off.bits.reduce((n, b) => n + b, 0);
      expect(dotsOff).toBeGreaterThan(0);

      // (b) GUARANTEE: Hold ON forces ZERO ink anywhere source luma ≥ cutoff.
      const on = etchSourceToBitmap(img, { stack, hold: { enabled: true, cutoff: CUTOFF } });
      for (let i = 0; i < on.bits.length; i++) {
        if (gray.gray[i] >= CUTOFF) expect(on.bits[i]).toBe(0);
      }
    });
  }

  // The Hold clamp is generic + terminal, so it must guarantee the held band above
  // an AM Halftone screen exactly as it does above Dither (S5, #84). Same recipe:
  // prove the threat (Hold OFF scatters dots into the highlight) then the guarantee
  // (Hold ON → zero dots above the cutoff). A dot screen renders sub-255 luma as a
  // proportional-radius dot, so luma 210 places small dots even in a highlight.
  for (const shape of [HALFTONE_ROUND, HALFTONE_DIAMOND]) {
    it(`Halftone ${shape}: dots land above the cutoff with Hold OFF, ZERO with Hold ON`, () => {
      const img = flatGrayImage(210, 32, 32);
      const gray = toGrayField(img);
      const stage = createHalftoneStage();
      stage.params = { frequency: 96, angle: 45, shape }; // fine screen → many dot centres
      const stack = [stage];

      // (a) THREAT: Hold OFF must place at least one ink dot above the cutoff.
      const off = etchSourceToBitmap(img, { stack, dpi: 254, hold: { enabled: false, cutoff: CUTOFF } });
      expect(off.bits.reduce((n, b) => n + b, 0)).toBeGreaterThan(0);

      // (b) GUARANTEE: Hold ON forces ZERO ink anywhere source luma ≥ cutoff.
      const on = etchSourceToBitmap(img, { stack, dpi: 254, hold: { enabled: true, cutoff: CUTOFF } });
      for (let i = 0; i < on.bits.length; i++) {
        if (gray.gray[i] >= CUTOFF) expect(on.bits[i]).toBe(0);
      }
    });
  }

  it('plain-threshold fallback (no screening Stage), inverted so highlights WOULD ink', () => {
    // dark=ink means a bright non-inverted field is already paper — vacuous. With
    // invert:true the LIGHT end etches, so the fallback would ink the highlight
    // band; the Hold must still clamp it. Proves the guarantee holds after the
    // plain cut too, not only after dithering.
    const img = flatGrayImage(245, 16, 16);
    const gray = toGrayField(img);

    const off = etchSourceToBitmap(img, { invert: true, hold: { enabled: false, cutoff: CUTOFF } });
    expect(off.bits.reduce((n, b) => n + b, 0)).toBeGreaterThan(0); // threat real

    const on = etchSourceToBitmap(img, { invert: true, hold: { enabled: true, cutoff: CUTOFF } });
    for (let i = 0; i < on.bits.length; i++) {
      if (gray.gray[i] >= CUTOFF) expect(on.bits[i]).toBe(0);
    }
  });
});

describe('applyHighlightHold — pure terminal clamp', () => {
  it('zeroes bits and marks held exactly where SOURCE luma ≥ cutoff', () => {
    const img = rampImage(8, 1);
    const gray = toGrayField(img);
    const bits = new Uint8Array(8).fill(1); // pretend screening inked every pixel
    const { bits: out, held } = applyHighlightHold(bits, gray, { enabled: true, cutoff: 128 });
    for (let i = 0; i < 8; i++) {
      const shouldHold = gray.gray[i] >= 128;
      expect(held[i]).toBe(shouldHold ? 1 : 0);
      expect(out[i]).toBe(shouldHold ? 0 : 1); // held → paper; below cutoff → untouched
    }
  });

  it('the cutoff moves the held boundary — higher cutoff holds fewer pixels', () => {
    const img = rampImage(256, 1);
    const gray = toGrayField(img);
    const heldCount = (cutoff) => {
      const bits = new Uint8Array(256).fill(1);
      return applyHighlightHold(bits, gray, { enabled: true, cutoff }).held.reduce((n, b) => n + b, 0);
    };
    expect(heldCount(200)).toBeGreaterThan(heldCount(240));
    expect(heldCount(240)).toBeGreaterThan(heldCount(254));
  });

  it('disabled → bits untouched and NO held region', () => {
    const img = rampImage(8, 1);
    const gray = toGrayField(img);
    const bits = new Uint8Array(8).fill(1);
    const { bits: out, held } = applyHighlightHold(bits, gray, { enabled: false, cutoff: 128 });
    expect(Array.from(out)).toEqual(Array(8).fill(1)); // nothing forced to paper
    expect(held.reduce((n, b) => n + b, 0)).toBe(0);
  });

  it('only ever clamps toward paper — never turns paper into ink', () => {
    const img = rampImage(8, 1);
    const gray = toGrayField(img);
    const bits = new Uint8Array(8).fill(0); // all paper already
    const { bits: out } = applyHighlightHold(bits, gray, { enabled: true, cutoff: 0 });
    expect(Array.from(out)).toEqual(Array(8).fill(0));
  });
});

describe('material-aware default predicate', () => {
  it('gold-mirror is a mirror material (opt-in set)', () => {
    expect(isMirrorMaterial('gold-mirror')).toBe(true);
    expect(MIRROR_MATERIAL_IDS.has('gold-mirror')).toBe(true);
  });

  it('forgiving stock and unknown/empty ids are NOT mirrors', () => {
    expect(isMirrorMaterial('clear')).toBe(false);
    expect(isMirrorMaterial('plywood')).toBe(false);
    expect(isMirrorMaterial(null)).toBe(false);
    expect(isMirrorMaterial(undefined)).toBe(false);
    expect(isMirrorMaterial('')).toBe(false);
  });

  it('resolveHold: auto (enabled null) follows the material — mirror ON, else OFF', () => {
    const auto = createHoldParams(); // { enabled: null, cutoff }
    expect(resolveHold(auto, 'gold-mirror').enabled).toBe(true);
    expect(resolveHold(auto, 'clear').enabled).toBe(false);
    expect(resolveHold(auto, 'plywood').enabled).toBe(false);
    expect(resolveHold(auto, null).enabled).toBe(false); // no panel / unknown
    expect(resolveHold(undefined, 'gold-mirror').enabled).toBe(true); // missing params → auto
  });

  it('resolveHold: an explicit user choice OVERRIDES the material default', () => {
    expect(resolveHold({ enabled: false, cutoff: 235 }, 'gold-mirror').enabled).toBe(false); // off on mirror
    expect(resolveHold({ enabled: true, cutoff: 235 }, 'clear').enabled).toBe(true); // on for forgiving stock
  });

  it('resolveHold carries the cutoff through, defaulting when absent', () => {
    expect(resolveHold({ enabled: true, cutoff: 200 }, 'clear').cutoff).toBe(200);
    expect(resolveHold({ enabled: true }, 'clear').cutoff).toBe(DEFAULT_HOLD_CUTOFF);
    expect(resolveHold(undefined, 'clear').cutoff).toBe(DEFAULT_HOLD_CUTOFF);
  });

  it('createHoldParams is AUTO (enabled null) so a fresh Etch defers to its panel material', () => {
    // Panel-assignment timing: a fresh Etch has panelId null until the normalizer
    // assigns it. Because enabled stays null (auto), the mirror default only kicks
    // in once the panel — hence its material — is known. No concrete boolean is
    // baked at creation.
    expect(createHoldParams().enabled).toBeNull();
    expect(createHoldParams().cutoff).toBe(DEFAULT_HOLD_CUTOFF);
  });
});

describe('Highlight Hold is NOT a Stage (decision 5)', () => {
  it('a stray {type:"hold"} injected into the Stack is an unknown field no-op, never screens or holds', () => {
    // It cannot exist as a Stack entry: etchStage treats an unknown type as a
    // field identity and it is NOT a screening type, so the plain cut still runs
    // and the injected "stage" changes nothing.
    const img = flatGrayImage(245, 8, 8);
    const stray = [{ id: 'x', type: 'hold', bypassed: false, params: { cutoff: 128 } }];
    const withStray = etchSourceToBitmap(img, { stack: stray, invert: true });
    const noStack = etchSourceToBitmap(img, { invert: true });
    expect(Array.from(withStray.bits)).toEqual(Array.from(noStack.bits)); // no-op
  });

  it('the clamp is TERMINAL, not Stack-gated: it runs with an EMPTY stack', () => {
    const img = flatGrayImage(245, 8, 8);
    const gray = toGrayField(img);
    const out = etchSourceToBitmap(img, { stack: [], invert: true, hold: { enabled: true, cutoff: 235 } });
    for (let i = 0; i < out.bits.length; i++) {
      if (gray.gray[i] >= 235) expect(out.bits[i]).toBe(0);
    }
  });
});

describe('single-source WYSIWYG + export-neutral shading (decision 4)', () => {
  it('the held mask IS the set of pixels the clamp zeroed (preview band == clamp)', () => {
    const img = rampImage(64, 4);
    const stack = [{ ...createDitherStage(), params: { mode: DITHER_FS, size: 1 } }];
    const { bits, held } = etchSourceToBitmap(img, { stack, hold: { enabled: true, cutoff: 235 } });
    // Every held pixel is paper in the exported bits — the shaded band is exactly
    // the guaranteed-safe band. (Not every paper pixel is held: dither leaves many
    // paper.) So: held ⊆ paper, with no held pixel inked.
    for (let i = 0; i < bits.length; i++) {
      if (held[i] === 1) expect(bits[i]).toBe(0);
    }
    expect(held.reduce((n, b) => n + b, 0)).toBeGreaterThan(0); // some band exists
  });

  it('the preview held mask does NOT change the exported bytes — export reads only .bits', () => {
    // Strongest export-neutrality form: the same bits encode byte-identically
    // whether or not a held mask rides alongside. Export dereferences .bits, never
    // .held, so the preview overlay cannot leak into the file.
    const bits = new Uint8Array([1, 0, 1, 1, 0, 0, 1, 0]);
    const width = 4;
    const height = 2;
    const withHeld = encodeEtchPNG({ bits, width, height, held: new Uint8Array(8).fill(1) }, '#000000');
    const withoutHeld = encodeEtchPNG({ bits, width, height }, '#000000');
    expect(withHeld).toBe(withoutHeld);
  });
});
