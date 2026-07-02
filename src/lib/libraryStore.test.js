// libraryStore (S1, issue #50) — the entity index behind the Library view.
// One entity, two surfaces (PRD #48 locked decision 6): registration through
// registerExtractedPattern must populate BOTH the picker registry and this
// store, and deletion must clear both.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  addLibraryEntry,
  removeLibraryEntry,
  getLibraryEntries,
  getLibraryEntry,
  subscribeLibrary,
  clearLibraryEntries,
} from './libraryStore';
import { makeExtractedPattern } from './extraction/extractedPattern';
import {
  registerExtractedPattern,
  clearExtractedPatterns,
} from './patterns/ExtractedPatternGenerator';
import {
  registerPattern,
  getDynamicPatternClass,
  getDynamicTypes,
  unregisterPattern,
} from './patternRegistry';

const entity = (patternId, title = 'Tile') =>
  makeExtractedPattern({
    patternId,
    title,
    tile: {
      width: 20,
      height: 20,
      fills: [{ d: 'M2 2 L18 2 L18 18 L2 18 Z', role: 'engrave' }],
      strokes: [],
    },
  });

beforeEach(() => clearLibraryEntries());
afterEach(() => {
  clearLibraryEntries();
  ['extracted-s1-a', 'extracted-s1-b', 'extracted-s1-c'].forEach(unregisterPattern);
});

describe('libraryStore', () => {
  it('starts empty and lists added entries', () => {
    expect(getLibraryEntries()).toEqual([]);
    addLibraryEntry(entity('extracted-s1-a'));
    const list = getLibraryEntries();
    expect(list).toHaveLength(1);
    expect(list[0].entity.patternId).toBe('extracted-s1-a');
  });

  it('orders newest first by createdAt, insertion-sequence tiebreak', () => {
    addLibraryEntry(entity('extracted-s1-a'), { createdAt: '2026-06-01T00:00:00Z' });
    addLibraryEntry(entity('extracted-s1-b'), { createdAt: '2026-07-01T00:00:00Z' });
    addLibraryEntry(entity('extracted-s1-c')); // fresh session save → now → newest
    expect(getLibraryEntries().map((e) => e.entity.patternId)).toEqual([
      'extracted-s1-c',
      'extracted-s1-b',
      'extracted-s1-a',
    ]);
  });

  it('replaces on re-add of the same patternId (idempotent registration)', () => {
    addLibraryEntry(entity('extracted-s1-a', 'First'));
    addLibraryEntry(entity('extracted-s1-a', 'Second'));
    const list = getLibraryEntries();
    expect(list).toHaveLength(1);
    expect(list[0].entity.title).toBe('Second');
  });

  it('keeps the transient photoURL alongside the entity', () => {
    addLibraryEntry(entity('extracted-s1-a'), { photoURL: 'data:image/png;base64,x' });
    expect(getLibraryEntry('extracted-s1-a').photoURL).toBe('data:image/png;base64,x');
  });

  it('removes entries and notifies subscribers on every mutation', () => {
    let calls = 0;
    const unsub = subscribeLibrary(() => calls++);
    addLibraryEntry(entity('extracted-s1-a'));
    removeLibraryEntry('extracted-s1-a');
    expect(getLibraryEntries()).toEqual([]);
    expect(calls).toBe(2);
    unsub();
    addLibraryEntry(entity('extracted-s1-b'));
    expect(calls).toBe(2);
  });

  it('returns a stable array identity until the store mutates', () => {
    addLibraryEntry(entity('extracted-s1-a'));
    const first = getLibraryEntries();
    expect(getLibraryEntries()).toBe(first);
    addLibraryEntry(entity('extracted-s1-b'));
    expect(getLibraryEntries()).not.toBe(first);
  });
});

describe('clearExtractedPatterns (sign-out hygiene)', () => {
  class FakeDynamic {}

  afterEach(() => {
    unregisterPattern('ai-keep');
    unregisterPattern('builtin-keep');
  });

  it('removes ONLY extracted-origin patterns from the registry and empties the store', () => {
    registerExtractedPattern(entity('extracted-s1-a'));
    registerExtractedPattern(entity('extracted-s1-b'));
    registerPattern('ai-keep', FakeDynamic, 'AI Keep', {}, []); // isAI default
    registerPattern('builtin-keep', FakeDynamic, 'Extra', {}, [], { isAI: false });

    clearExtractedPatterns();

    // Both surfaces emptied of extracted patterns…
    expect(getDynamicPatternClass('extracted-s1-a')).toBeNull();
    expect(getDynamicPatternClass('extracted-s1-b')).toBeNull();
    expect(getLibraryEntries()).toEqual([]);
    // …while AI and builtin dynamic registrations are untouched.
    expect(getDynamicPatternClass('ai-keep')).toBeTruthy();
    expect(getDynamicPatternClass('builtin-keep')).toBeTruthy();
    expect(getDynamicTypes().some((t) => t.origin === 'extracted')).toBe(false);
  });

  it('lets the next account load a clean slate (re-register after clear)', () => {
    registerExtractedPattern(entity('extracted-s1-a', 'User A tile'));
    clearExtractedPatterns();
    registerExtractedPattern(entity('extracted-s1-b', 'User B tile'));
    const list = getLibraryEntries();
    expect(list).toHaveLength(1);
    expect(list[0].entity.title).toBe('User B tile');
  });
});

describe('one entity, two surfaces', () => {
  it('registerExtractedPattern populates the picker registry AND the library store', () => {
    const e = entity('extracted-s1-a');
    registerExtractedPattern(e, { photoURL: 'data:image/png;base64,p' });
    // Surface 1: picker custom family (registry).
    expect(getDynamicPatternClass('extracted-s1-a')).toBeTruthy();
    expect(getDynamicTypes().find((t) => t.id === 'extracted-s1-a')?.origin).toBe('extracted');
    // Surface 2: library view (store) — the SAME entity object.
    expect(getLibraryEntry('extracted-s1-a').entity).toBe(e);
    expect(getLibraryEntry('extracted-s1-a').photoURL).toBe('data:image/png;base64,p');
  });
});
