import { describe, it, expect } from 'vitest';
import { visibilityById, withVisibilityOverride, sameVisibilityMap } from './liveVisibility.js';

describe('visibilityById — live id→visible map', () => {
  it('maps each id to its boolean visible flag', () => {
    expect(
      visibilityById([
        { id: 'a', visible: true },
        { id: 'b', visible: false },
        { id: 'c' }, // absent flag → false
      ]),
    ).toEqual({ a: true, b: false, c: false });
  });

  it('is safe on junk input', () => {
    expect(visibilityById(null)).toEqual({});
    expect(visibilityById([null, {}, { visible: true }])).toEqual({});
  });
});

describe('withVisibilityOverride — live flags over snapshot entities', () => {
  const snap = [
    { id: 'a', visible: true, keep: 1 },
    { id: 'b', visible: false },
  ];

  it('flips only entities whose live flag differs, copying (never mutating)', () => {
    const out = withVisibilityOverride(snap, { a: false, b: false });
    expect(out[0]).toEqual({ id: 'a', visible: false, keep: 1 });
    expect(snap[0].visible).toBe(true); // input untouched (snapshot is frozen)
    expect(out[1]).toBe(snap[1]); // unchanged flag → same identity, no copy churn
  });

  it('entities without an entry (deleted live) keep their snapshot flag', () => {
    const out = withVisibilityOverride(snap, { zzz: true });
    expect(out[0]).toBe(snap[0]);
    expect(out[1]).toBe(snap[1]);
  });

  it('null/absent override map is a pass-through', () => {
    expect(withVisibilityOverride(snap, null)).toBe(snap);
  });

  it('can UNHIDE an entity hidden at snapshot time', () => {
    const out = withVisibilityOverride(snap, { b: true });
    expect(out[1]).toEqual({ id: 'b', visible: true });
  });
});

describe('sameVisibilityMap — stable-identity equality', () => {
  it('true for equal content, false on any flag/key difference', () => {
    expect(sameVisibilityMap({ a: true, b: false }, { b: false, a: true })).toBe(true);
    expect(sameVisibilityMap({ a: true }, { a: false })).toBe(false);
    expect(sameVisibilityMap({ a: true }, { a: true, b: true })).toBe(false);
    expect(sameVisibilityMap(null, {})).toBe(false);
    expect(sameVisibilityMap(null, null)).toBe(true);
  });
});
