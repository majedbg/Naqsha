// creditModel.test.js — AR-1E
// Pure node environment (no DOM needed); uses vitest globals.

import { creditCost, STARTING_CREDITS, canGenerate, displayBalance } from './creditModel';

describe('creditCost', () => {
  it('returns the revision cost', () => {
    expect(creditCost('revision')).toBe(4);
  });

  it('returns the new-pattern cost', () => {
    expect(creditCost('new')).toBe(12);
  });
});

describe('STARTING_CREDITS', () => {
  it('equals 24 — the Supabase free allowance default', () => {
    expect(STARTING_CREDITS).toBe(24);
  });
});

describe('canGenerate', () => {
  it('allows generation when credits exactly equal the cost', () => {
    expect(canGenerate(4, 'revision')).toBe(true);
  });

  it('allows generation when credits exceed the cost', () => {
    expect(canGenerate(12, 'new')).toBe(true);
  });

  it('blocks generation when credits fall below the cost', () => {
    expect(canGenerate(3, 'revision')).toBe(false);
  });

  it('blocks generation when credits fall below cost for new', () => {
    expect(canGenerate(11, 'new')).toBe(false);
  });
});

describe('displayBalance', () => {
  it('formats balance as "credits / STARTING_CREDITS"', () => {
    expect(displayBalance(18)).toBe('18 / 24');
  });

  it('formats zero balance', () => {
    expect(displayBalance(0)).toBe('0 / 24');
  });

  it('formats full starting balance', () => {
    expect(displayBalance(24)).toBe('24 / 24');
  });
});
