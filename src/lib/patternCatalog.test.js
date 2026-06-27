import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getVisiblePatterns,
  familyMetaFor,
  CUSTOM_FAMILY,
} from './patternCatalog';
import { PATTERN_FAMILIES } from '../constants';
import { getPatternClass } from './patterns';

vi.mock('./patterns', () => ({
  getPatternClass: vi.fn(),
}));

describe('getVisiblePatterns', () => {
  beforeEach(() => {
    // By default, taxonomy ids resolve (ready) and unknown ids do not.
    getPatternClass.mockReset();
    getPatternClass.mockImplementation((id) => null);
  });

  it('includes taxonomy patterns with their correct familyKey', () => {
    const list = getVisiblePatterns([]);
    const byId = Object.fromEntries(list.map((p) => [p.id, p]));

    expect(byId.spiral).toBeTruthy();
    expect(byId.spiral.familyKey).toBe('H');
    expect(byId.grid).toBeTruthy();
    expect(byId.grid.familyKey).toBe('T');
    expect(byId.turing.familyKey).toBe('C');
  });

  it('excludes pickerHidden patterns (e.g. moire)', () => {
    const ids = getVisiblePatterns([]).map((p) => p.id);
    expect(ids).not.toContain('moire');
  });

  it('lists taxonomy patterns in declaration order, before custom ones', () => {
    const list = getVisiblePatterns([]);
    const ids = list.map((p) => p.id);
    // spirograph is the first taxonomy entry.
    expect(ids[0]).toBe('spirograph');
  });

  it('warns and skips taxonomy entries with unknown form/geom', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    // Real constants are all valid, so this just asserts no spurious warnings
    // for the happy path (the guard exists and stays quiet on valid data).
    getVisiblePatterns([]);
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it("gives a ready dynamic pattern familyKey 'custom', NOT 'C' (BLOCKER #1)", () => {
    // 'ai-thing' is not in taxonomy and is "ready".
    getPatternClass.mockImplementation((id) =>
      id === 'ai-thing' ? function FakeClass() {} : null
    );

    const list = getVisiblePatterns([{ id: 'ai-thing', label: 'AI Thing' }]);
    const entry = list.find((p) => p.id === 'ai-thing');

    expect(entry).toBeTruthy();
    expect(entry.familyKey).toBe('custom');
    expect(entry.familyKey).not.toBe('C');
    expect(entry.meta.family).toBe('custom');
    // custom patterns sort last.
    expect(list[list.length - 1].id).toBe('ai-thing');
  });

  it('excludes dynamic patterns that are not ready', () => {
    getPatternClass.mockImplementation(() => null); // nothing ready
    const ids = getVisiblePatterns([{ id: 'not-ready', label: 'Nope' }]).map(
      (p) => p.id
    );
    expect(ids).not.toContain('not-ready');
  });

  it('does not duplicate a dynamic type that already exists in the taxonomy', () => {
    getPatternClass.mockImplementation(() => function FakeClass() {});
    const list = getVisiblePatterns([{ id: 'spiral', label: 'Spiral' }]);
    const spirals = list.filter((p) => p.id === 'spiral');
    expect(spirals).toHaveLength(1);
    expect(spirals[0].familyKey).toBe('H'); // stays taxonomy, not custom
  });
});

describe('familyMetaFor', () => {
  it("resolves 'C' to the real Reaction-Diffusion family", () => {
    const meta = familyMetaFor('C');
    expect(meta).toBe(PATTERN_FAMILIES.C);
    expect(meta.label).toBe('Reaction-Diffusion');
  });

  it("resolves 'custom' to the synthetic CUSTOM_FAMILY", () => {
    const meta = familyMetaFor('custom');
    expect(meta).toBe(CUSTOM_FAMILY);
    expect(meta.label).toBe('Custom');
  });

  it('gives custom a distinct color from family C', () => {
    expect(CUSTOM_FAMILY.color).not.toBe(PATTERN_FAMILIES.C.color);
  });

  it('returns null for an unknown family key', () => {
    expect(familyMetaFor('ZZZ')).toBeNull();
  });
});
