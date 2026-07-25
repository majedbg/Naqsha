// glyphEntries — the shared set-tagged picker list (motif-shell D).
import { describe, it, expect } from 'vitest';
import { buildGlyphEntries } from './glyphEntries';
import { MOTIF_GLYPHS } from './glyphs';

const g = (id, name) => ({ id, name, paths: [{ d: 'M0,0 L1,1', closed: false }], viewRadius: 5 });

describe('buildGlyphEntries', () => {
  it('lists all built-ins with empty stores', () => {
    const entries = buildGlyphEntries({});
    expect(entries).toHaveLength(Object.keys(MOTIF_GLYPHS).length);
    expect(entries.every((e) => e.set === 'builtin')).toBe(true);
  });

  it('tags custom and library entries by set', () => {
    const entries = buildGlyphEntries({
      customGlyphs: { 'cg-1': g('cg-1', 'Fern') },
      libraryMotifs: [{ id: 'lib-1', name: 'Vine', glyph: g('lib-1', 'Vine') }],
    });
    expect(entries.find((e) => e.glyphId === 'cg-1').set).toBe('custom');
    expect(entries.find((e) => e.glyphId === 'lib-1').set).toBe('library');
  });

  it('dedupes a placed library motif out of the custom set (copied-by-uuid rule)', () => {
    const glyph = g('lib-2', 'Knot');
    const entries = buildGlyphEntries({
      customGlyphs: { 'lib-2': glyph, 'cg-1': g('cg-1', 'Fern') },
      libraryMotifs: [{ id: 'lib-2', name: 'Knot', glyph }],
    });
    const matches = entries.filter((e) => e.glyphId === 'lib-2');
    expect(matches).toHaveLength(1);
    expect(matches[0].set).toBe('library');
  });

  it('payload carries kind + glyph for the apply path', () => {
    const entries = buildGlyphEntries({ customGlyphs: { 'cg-1': g('cg-1', 'Fern') } });
    const custom = entries.find((e) => e.glyphId === 'cg-1');
    expect(custom.payload).toEqual({ kind: 'custom', glyphId: 'cg-1', glyph: custom.glyph });
  });
});
