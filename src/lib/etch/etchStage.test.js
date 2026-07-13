import { describe, it, expect } from 'vitest';
import { globalMask } from '../extraction/preprocess.js';
import {
  STAGE_TONE,
  STAGE_DITHER,
  STAGE_HALFTONE,
  STAGE_PAPER,
  createToneStage,
  createDitherStage,
  createHalftoneStage,
  createPaperStage,
  createStage,
  applyStage,
  applyFieldStages,
  isScreeningStage,
  activeScreeningStage,
  activeScreeningIndex,
  screenStage,
} from './etchStage.js';
import { applyToneField, NEUTRAL_LEVELS } from './etchTone.js';
import { applyPaperField, DEFAULT_PAPER_SCALE } from './etchPaper.js';
import { DITHER_FS, DITHER_BAYER_4, orderedBayerBits, BAYER_4 } from './etchDither.js';
import {
  HALFTONE_ROUND,
  DEFAULT_HALFTONE_FREQUENCY,
  DEFAULT_HALFTONE_ANGLE,
  DEFAULT_HALFTONE_SHAPE,
  halftoneField,
} from './etchHalftone.js';

function field(rows) {
  const height = rows.length;
  const width = rows[0].length;
  const gray = new Float64Array(width * height);
  const alpha = new Uint8ClampedArray(width * height).fill(255);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) gray[y * width + x] = rows[y][x];
  }
  return { gray, alpha, width, height };
}

describe('createToneStage / createStage — the Stage model', () => {
  it('a fresh Tone Stage is a non-bypassed tone Stage with neutral (identity) params', () => {
    const s = createToneStage();
    expect(s.type).toBe(STAGE_TONE);
    expect(s.bypassed).toBe(false);
    expect(typeof s.id).toBe('string');
    expect(s.params).toMatchObject({ exposure: 0, brightness: 0, contrast: 0 });
    expect(s.params.levels).toEqual({ ...NEUTRAL_LEVELS });
  });

  it('gives every Stage a unique id', () => {
    expect(createToneStage().id).not.toBe(createToneStage().id);
  });

  it('createStage(type) dispatches to the tone builder', () => {
    expect(createStage(STAGE_TONE).type).toBe(STAGE_TONE);
  });
});

describe('applyStage — dispatch by Stage type', () => {
  it('a tone Stage runs the Tone field math', () => {
    const f = field([[100, 100]]);
    const stage = { type: STAGE_TONE, params: { exposure: 50, brightness: 0, contrast: 0, levels: NEUTRAL_LEVELS } };
    const out = applyStage(f, stage);
    expect(Array.from(out.gray)).toEqual(Array.from(applyToneField(f, stage.params).gray));
  });

  it('an unknown Stage type passes the field through unchanged (forward-compat seam)', () => {
    const f = field([[10, 20]]);
    expect(applyStage(f, { type: 'not-yet-built', params: {} })).toBe(f);
  });
});

describe('applyFieldStages — ordered field application with bypass', () => {
  it('an empty / missing stack is an EXACT identity (same field object)', () => {
    const f = field([[10, 200]]);
    expect(applyFieldStages(f, [])).toBe(f);
    expect(applyFieldStages(f, undefined)).toBe(f);
    expect(applyFieldStages(f, null)).toBe(f);
  });

  it('a BYPASSED Stage is a pixel-exact no-op even with non-neutral params', () => {
    const f = field([[100, 100, 100]]);
    const loud = createToneStage();
    loud.bypassed = true;
    loud.params = { exposure: 80, brightness: 40, contrast: 60, levels: { blackPoint: 30, whitePoint: 210, gamma: 2.2 } };
    const out = applyFieldStages(f, [loud]);
    // Same object AND same bytes as the untouched field.
    expect(out).toBe(f);
    expect(Array.from(out.gray)).toEqual(Array.from(f.gray));
  });

  it('applies non-bypassed Stages in order', () => {
    const f = field([[100]]);
    const a = { type: STAGE_TONE, bypassed: false, params: { exposure: 50, brightness: 0, contrast: 0, levels: NEUTRAL_LEVELS } };
    const b = { type: STAGE_TONE, bypassed: false, params: { exposure: 50, brightness: 0, contrast: 0, levels: NEUTRAL_LEVELS } };
    // ×2 then ×2 → ×4 → 400 clamped to 255
    expect(applyFieldStages(f, [a, b]).gray[0]).toBe(255);
    // one ×2 alone → 200
    expect(applyFieldStages(f, [a]).gray[0]).toBeCloseTo(200, 6);
  });

  it('order is part of the document: reordering changes the result', () => {
    const f = field([[120]]);
    const gain = { type: STAGE_TONE, bypassed: false, params: { exposure: 40, brightness: 0, contrast: 0, levels: NEUTRAL_LEVELS } };
    const crush = { type: STAGE_TONE, bypassed: false, params: { exposure: 0, brightness: 0, contrast: 0, levels: { blackPoint: 100, whitePoint: 200, gamma: 1 } } };
    const ab = applyFieldStages(f, [gain, crush]).gray[0];
    const ba = applyFieldStages(f, [crush, gain]).gray[0];
    expect(ab).not.toBeCloseTo(ba, 3);
  });

  it('a neutral (default) non-bypassed Tone Stage does not flip a near-threshold bit', () => {
    // A pixel at exactly the cut must screen identically with and without a
    // default Tone Stage in the stack — the default-params identity guard.
    const f = field([[127, 128, 129]]);
    const bare = globalMask(f, 128, false);
    const withDefault = globalMask(applyFieldStages(f, [createToneStage()]), 128, false);
    expect(Array.from(withDefault)).toEqual(Array.from(bare));
  });
});

// ── Screening semantics (S3, #82; decision 8) ────────────────────────────────
// A Tone Stage transforms the field (field→field); a Dither Stage SCREENS it
// (field→1-bit bits) and is the terminal producer. The whole subsystem obeys
// ONE rule pinned below: exactly one screening Stage is active — the FIRST
// non-bypassed screening Stage in Stack order — and with none present the plain
// globalMask fallback runs. Field Stages BELOW the active screen are post-screen
// (the S6 Paper seam) and are NOT run as field ops today.

describe('the Dither Stage model', () => {
  it('createDitherStage is a non-bypassed screening Stage with a default mode+size', () => {
    const s = createDitherStage();
    expect(s.type).toBe(STAGE_DITHER);
    expect(s.bypassed).toBe(false);
    expect(typeof s.id).toBe('string');
    expect(s.params.mode).toBe(DITHER_FS);
    expect(s.params.size).toBe(1);
  });

  it('createStage dispatches to the dither builder', () => {
    expect(createStage(STAGE_DITHER).type).toBe(STAGE_DITHER);
  });

  it('a Dither Stage passed to applyStage is a field no-op (screening runs at the terminal)', () => {
    const f = field([[10, 200]]);
    expect(applyStage(f, createDitherStage())).toBe(f);
  });

  it('isScreeningStage is true for dither, false for tone', () => {
    expect(isScreeningStage(createDitherStage())).toBe(true);
    expect(isScreeningStage(createToneStage())).toBe(false);
  });
});

describe('activeScreeningStage — exactly one active screen (first non-bypassed wins)', () => {
  it('none present → null (the globalMask fallback path)', () => {
    expect(activeScreeningStage([])).toBe(null);
    expect(activeScreeningStage([createToneStage()])).toBe(null);
    expect(activeScreeningIndex([createToneStage()])).toBe(-1);
  });

  it('one present → that Stage, at its index', () => {
    const d = createDitherStage();
    const stack = [createToneStage(), d];
    expect(activeScreeningStage(stack)).toBe(d);
    expect(activeScreeningIndex(stack)).toBe(1);
  });

  it('a BYPASSED screening Stage is not active → fallback', () => {
    const d = createDitherStage();
    d.bypassed = true;
    expect(activeScreeningStage([d])).toBe(null);
    expect(activeScreeningIndex([d])).toBe(-1);
  });

  it('TWO screening Stages → the FIRST non-bypassed one deterministically wins', () => {
    const first = createDitherStage();
    const second = createDitherStage();
    expect(activeScreeningStage([first, second])).toBe(first);
    // Bypass the first → the second becomes the deterministic winner.
    first.bypassed = true;
    expect(activeScreeningStage([first, second])).toBe(second);
  });
});

describe('applyFieldStages — field Stages ABOVE the active screen only', () => {
  it('with no screen, runs every non-bypassed field Stage (tone-only field pass)', () => {
    const f = field([[100]]);
    const gain = { type: STAGE_TONE, bypassed: false, params: { exposure: 50, brightness: 0, contrast: 0, levels: NEUTRAL_LEVELS } };
    // exposure 50 → ×2 gain → 100 becomes 200.
    expect(applyFieldStages(f, [gain]).gray[0]).toBeCloseTo(200, 6);
  });

  it('runs field Stages ABOVE the screen but NOT those below it (S6 post-screen seam)', () => {
    const f = field([[100]]);
    const above = { type: STAGE_TONE, bypassed: false, params: { exposure: 50, brightness: 0, contrast: 0, levels: NEUTRAL_LEVELS } };
    const below = { type: STAGE_TONE, bypassed: false, params: { exposure: 50, brightness: 0, contrast: 0, levels: NEUTRAL_LEVELS } };
    const stack = [above, createDitherStage(), below];
    // Only `above` runs (100 → ×2 = 200); `below` is post-screen and skipped.
    expect(applyFieldStages(f, stack).gray[0]).toBeCloseTo(200, 6);
  });

  it('an empty stack returns the same field object', () => {
    const f = field([[10, 200]]);
    expect(applyFieldStages(f, [])).toBe(f);
  });
});

describe('screenStage — dispatch a screening Stage to its kernel', () => {
  it('a Dither Stage produces the Bayer bits its mode+params imply', () => {
    const f = field([[64, 128, 192, 255]]);
    const stage = createDitherStage();
    stage.params = { mode: DITHER_BAYER_4, size: 1 };
    const bits = screenStage(f, stage, { threshold: 128, invert: false });
    expect(Array.from(bits)).toEqual(Array.from(orderedBayerBits(f, { matrix: BAYER_4, invert: false })));
  });

  it('a Halftone Stage produces the AM-dot bits its params imply, threading DPI from opts', () => {
    const rows = Array.from({ length: 16 }, (_, y) => Array.from({ length: 16 }, (_, x) => (x * 16 + y) % 256));
    const f = field(rows);
    const stage = createHalftoneStage();
    stage.params = { frequency: 48, angle: 30, shape: HALFTONE_ROUND };
    const bits = screenStage(f, stage, { threshold: 128, invert: false, dpi: 254 });
    expect(Array.from(bits)).toEqual(Array.from(halftoneField(f, stage.params, { threshold: 128, invert: false, dpi: 254 })));
  });
});

// ── Halftone Stage (S5, #84) — the AM screening alternative to Dither ─────────
// A Halftone Stage screens the field into 1-bit dots too, so it is a SCREENING
// Stage under the identical S3 rule: exactly one active at a time. These pin that
// the seam treats Halftone as a screen and that a Dither↔Halftone swap is a clean
// single-active-screen switch (no code beyond the type set + a screenStage case).
describe('the Halftone Stage model', () => {
  it('createHalftoneStage is a non-bypassed screening Stage with neutral defaults', () => {
    const s = createHalftoneStage();
    expect(s.type).toBe(STAGE_HALFTONE);
    expect(s.bypassed).toBe(false);
    expect(typeof s.id).toBe('string');
    expect(s.params.frequency).toBe(DEFAULT_HALFTONE_FREQUENCY);
    expect(s.params.angle).toBe(DEFAULT_HALFTONE_ANGLE);
    expect(s.params.shape).toBe(DEFAULT_HALFTONE_SHAPE);
  });

  it('createStage dispatches to the halftone builder', () => {
    expect(createStage(STAGE_HALFTONE).type).toBe(STAGE_HALFTONE);
  });

  it('a Halftone Stage passed to applyStage is a field no-op (screening runs at the terminal)', () => {
    const f = field([[10, 200]]);
    expect(applyStage(f, createHalftoneStage())).toBe(f);
  });

  it('isScreeningStage is true for halftone (it screens the field into bits)', () => {
    expect(isScreeningStage(createHalftoneStage())).toBe(true);
  });
});

describe('Dither ↔ Halftone — exactly ONE active screen (clean swap)', () => {
  it('a Halftone before a Dither is the active screen; the Dither is inactive', () => {
    const halftone = createHalftoneStage();
    const dither = createDitherStage();
    const stack = [halftone, dither];
    expect(activeScreeningStage(stack)).toBe(halftone); // first non-bypassed wins
    expect(activeScreeningIndex(stack)).toBe(0);
  });

  it('bypassing the winning Halftone hands the screen to the Dither below it (swap)', () => {
    const halftone = createHalftoneStage();
    const dither = createDitherStage();
    const stack = [halftone, dither];
    halftone.bypassed = true;
    expect(activeScreeningStage(stack)).toBe(dither);
    expect(activeScreeningIndex(stack)).toBe(1);
  });

  it('with a Dither AND a Halftone present, exactly one screens — never both', () => {
    const dither = createDitherStage();
    const halftone = createHalftoneStage();
    // Whichever is first non-bypassed is THE screen; the other is inactive.
    expect(activeScreeningStage([dither, halftone])).toBe(dither);
    expect(activeScreeningStage([halftone, dither])).toBe(halftone);
  });
});

// ── Paper Stage (S6, #85) — the seeded grain FIELD Stage before screening ─────
// A Paper Stage textures the luma field (field→field, gray→gray) BEFORE the cut,
// exactly like Tone — it is NOT a screen (it never produces bits). These pin that
// the seam treats Paper as a field Stage (not in SCREENING_STAGE_TYPES), that its
// seed makes it deterministic, and — the acceptance-criterion heart — that placing
// Paper ABOVE vs BELOW the active screen produces DIFFERENT, correct output.

// Mid-gray fixtures clustered near the 128 cut so grain genuinely FLIPS bits (a
// field of pure blacks/whites would never cross the threshold — the reorder tests
// would pass vacuously). 8×8 to hold several grain cells.
function midImageField(v = 128) {
  const rows = Array.from({ length: 8 }, () => Array.from({ length: 8 }, () => v));
  return field(rows);
}

const LOUD_PAPER = { grain: 90, scale: 3, seed: 4242 };

describe('the Paper Stage model', () => {
  it('createPaperStage is a non-bypassed FIELD Stage with neutral grain + a stable seed', () => {
    const s = createPaperStage();
    expect(s.type).toBe(STAGE_PAPER);
    expect(s.bypassed).toBe(false);
    expect(typeof s.id).toBe('string');
    expect(s.params.grain).toBe(0); // neutral: added but changes nothing
    expect(s.params.scale).toBe(DEFAULT_PAPER_SCALE);
    expect(Number.isFinite(s.params.seed)).toBe(true); // seeded off the layer
  });

  it('gives every Paper Stage its own seed (per-layer grain)', () => {
    expect(createPaperStage().params.seed).not.toBe(createPaperStage().params.seed);
  });

  it('createStage dispatches to the paper builder', () => {
    expect(createStage(STAGE_PAPER).type).toBe(STAGE_PAPER);
  });

  it('is NOT a screening Stage — it textures the field, it does not screen', () => {
    expect(isScreeningStage(createPaperStage())).toBe(false);
    // With only a Paper Stage present, no screen is active (plain-cut fallback).
    expect(activeScreeningStage([createPaperStage()])).toBe(null);
  });

  it('applyStage runs the Paper field math (equals applyPaperField)', () => {
    const f = midImageField();
    const stage = { type: STAGE_PAPER, params: LOUD_PAPER };
    const out = applyStage(f, stage);
    expect(Array.from(out.gray)).toEqual(Array.from(applyPaperField(f, LOUD_PAPER).gray));
  });

  it('a neutral (grain 0) Paper Stage is a pixel-exact field no-op', () => {
    const f = midImageField();
    expect(applyStage(f, createPaperStage())).toBe(f);
  });
});

describe('Paper Stage — placement relative to the screen is meaningful (#85)', () => {
  it('Paper ABOVE the screen textures the dithered field; BELOW it is inert', () => {
    const f = midImageField();
    const paper = { type: STAGE_PAPER, bypassed: false, params: LOUD_PAPER };
    const above = applyFieldStages(f, [paper, createDitherStage()]);
    const below = applyFieldStages(f, [createDitherStage(), paper]);
    // Above: the grain runs and transforms the field feeding the screen.
    expect(Array.from(above.gray)).not.toEqual(Array.from(f.gray));
    // Below: post-screen, NOT run as a field op → the field reaches the screen bare.
    expect(below).toBe(f);
  });

  it('BELOW-screen Paper leaves the SCREENED bits untouched; ABOVE changes them', () => {
    // This is the acceptance criterion at the bits level: a real Dither present,
    // Paper before vs after it yields different, correct output.
    const f = midImageField();
    const paper = { type: STAGE_PAPER, bypassed: false, params: LOUD_PAPER };
    const dither = createDitherStage();
    const bare = globalMaskAfterScreen(f, [dither]);
    const below = globalMaskAfterScreen(f, [dither, paper]);
    const above = globalMaskAfterScreen(f, [paper, dither]);
    expect(Array.from(below)).toEqual(Array.from(bare)); // below-screen = inert
    expect(Array.from(above)).not.toEqual(Array.from(bare)); // above-screen = meaningful
  });

  it('Paper-then-Tone ≠ Tone-then-Paper (field order matters)', () => {
    const f = midImageField();
    const paper = { type: STAGE_PAPER, bypassed: false, params: LOUD_PAPER };
    const tone = { type: STAGE_TONE, bypassed: false, params: { exposure: 40, brightness: 0, contrast: 0, levels: NEUTRAL_LEVELS } };
    const paperThenTone = applyFieldStages(f, [paper, tone]);
    const toneThenPaper = applyFieldStages(f, [tone, paper]);
    expect(Array.from(paperThenTone.gray)).not.toEqual(Array.from(toneThenPaper.gray));
  });

  it('a BYPASSED Paper Stage is a pixel-exact identity (same field object)', () => {
    const f = midImageField();
    const paper = { type: STAGE_PAPER, bypassed: true, params: LOUD_PAPER };
    expect(applyFieldStages(f, [paper])).toBe(f);
  });
});

// Screen a field through the active Dither Stage in the stack, applying the field
// Stages above it first — the etchProcess seam in miniature, for a bits-level
// reorder assertion without decoding a PNG.
function globalMaskAfterScreen(f, stack) {
  const shaped = applyFieldStages(f, stack);
  const screen = activeScreeningStage(stack);
  return screenStage(shaped, screen, { threshold: 128, invert: false });
}
