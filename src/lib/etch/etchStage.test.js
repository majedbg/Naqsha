import { describe, it, expect } from 'vitest';
import { globalMask } from '../extraction/preprocess.js';
import {
  STAGE_TONE,
  createToneStage,
  createStage,
  applyStage,
  applyStack,
} from './etchStage.js';
import { applyToneField, NEUTRAL_LEVELS } from './etchTone.js';

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

describe('applyStack — ordered application with bypass', () => {
  it('an empty / missing stack is an EXACT identity (same field object)', () => {
    const f = field([[10, 200]]);
    expect(applyStack(f, [])).toBe(f);
    expect(applyStack(f, undefined)).toBe(f);
    expect(applyStack(f, null)).toBe(f);
  });

  it('a BYPASSED Stage is a pixel-exact no-op even with non-neutral params', () => {
    const f = field([[100, 100, 100]]);
    const loud = createToneStage();
    loud.bypassed = true;
    loud.params = { exposure: 80, brightness: 40, contrast: 60, levels: { blackPoint: 30, whitePoint: 210, gamma: 2.2 } };
    const out = applyStack(f, [loud]);
    // Same object AND same bytes as the untouched field.
    expect(out).toBe(f);
    expect(Array.from(out.gray)).toEqual(Array.from(f.gray));
  });

  it('applies non-bypassed Stages in order', () => {
    const f = field([[100]]);
    const a = { type: STAGE_TONE, bypassed: false, params: { exposure: 50, brightness: 0, contrast: 0, levels: NEUTRAL_LEVELS } };
    const b = { type: STAGE_TONE, bypassed: false, params: { exposure: 50, brightness: 0, contrast: 0, levels: NEUTRAL_LEVELS } };
    // ×2 then ×2 → ×4 → 400 clamped to 255
    expect(applyStack(f, [a, b]).gray[0]).toBe(255);
    // one ×2 alone → 200
    expect(applyStack(f, [a]).gray[0]).toBeCloseTo(200, 6);
  });

  it('order is part of the document: reordering changes the result', () => {
    const f = field([[120]]);
    const gain = { type: STAGE_TONE, bypassed: false, params: { exposure: 40, brightness: 0, contrast: 0, levels: NEUTRAL_LEVELS } };
    const crush = { type: STAGE_TONE, bypassed: false, params: { exposure: 0, brightness: 0, contrast: 0, levels: { blackPoint: 100, whitePoint: 200, gamma: 1 } } };
    const ab = applyStack(f, [gain, crush]).gray[0];
    const ba = applyStack(f, [crush, gain]).gray[0];
    expect(ab).not.toBeCloseTo(ba, 3);
  });

  it('a neutral (default) non-bypassed Tone Stage does not flip a near-threshold bit', () => {
    // A pixel at exactly the cut must screen identically with and without a
    // default Tone Stage in the stack — the default-params identity guard.
    const f = field([[127, 128, 129]]);
    const bare = globalMask(f, 128, false);
    const withDefault = globalMask(applyStack(f, [createToneStage()]), 128, false);
    expect(Array.from(withDefault)).toEqual(Array.from(bare));
  });
});
