import { describe, it, expect } from 'vitest';
import { globalMask } from '../extraction/preprocess.js';
import {
  STAGE_TONE,
  STAGE_DITHER,
  createToneStage,
  createDitherStage,
  createStage,
  applyStage,
  applyFieldStages,
  isScreeningStage,
  activeScreeningStage,
  activeScreeningIndex,
  screenStage,
} from './etchStage.js';
import { applyToneField, NEUTRAL_LEVELS } from './etchTone.js';
import { DITHER_FS, DITHER_BAYER_4, orderedBayerBits, BAYER_4 } from './etchDither.js';

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
});
