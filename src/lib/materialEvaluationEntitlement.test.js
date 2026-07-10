// materialEvaluationEntitlement.test.js — material-evaluation slice 1
//
// The premium scaffold ships OFF (everyone entitled), mirroring
// motifLibraryEntitlement exactly. The LOGIN gate is separate and enforced in
// the UI — this module must never encode it, which is what these tests pin.

import { describe, it, expect } from 'vitest';
import { canSubmitEvaluation } from './materialEvaluationEntitlement';

describe('canSubmitEvaluation — premium scaffold (ships OFF → free for all)', () => {
  it('is entitled with no context at all', () => {
    expect(canSubmitEvaluation()).toBe(true);
  });

  it('is entitled for a guest (login is a SEPARATE gate, enforced in UI)', () => {
    expect(canSubmitEvaluation({ user: null, tier: 'guest' })).toBe(true);
  });

  it('is entitled for free and pro tiers alike', () => {
    expect(canSubmitEvaluation({ user: { id: 'u1' }, tier: 'free' })).toBe(true);
    expect(canSubmitEvaluation({ user: { id: 'u1' }, tier: 'pro' })).toBe(true);
  });
});
