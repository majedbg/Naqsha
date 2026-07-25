// glyphEntries — one flat, set-tagged view of every pickable glyph
// (motif-shell, D). Pure, no React. Shared by the library panel and the
// device's glyph-picker chip so the two surfaces always agree on the same
// dedupe rule: a placed library motif is COPIED into customGlyphs under its
// uuid, so it must appear ONCE, under "My library", never also under
// "In document" (same rule the old MotifDevice optgroups applied).
import { MOTIF_GLYPHS } from './glyphs';

/**
 * @param {{customGlyphs?: Object, libraryMotifs?: Array}} stores
 * @returns {Array<{key:string,set:'builtin'|'custom'|'library',glyphId:string,
 *                  glyph:Object,name:string,payload:Object}>}
 */
export function buildGlyphEntries({ customGlyphs, libraryMotifs } = {}) {
  const library = libraryMotifs || [];
  const libraryIds = new Set(library.map((m) => m.id));
  return [
    ...Object.values(MOTIF_GLYPHS).map((g) => ({
      key: `builtin:${g.id}`,
      set: 'builtin',
      glyphId: g.id,
      glyph: g,
      name: g.name,
      payload: { kind: 'builtin', glyphId: g.id, glyph: g },
    })),
    ...Object.values(customGlyphs || {})
      .filter((g) => !libraryIds.has(g.id))
      .map((g) => ({
        key: `custom:${g.id}`,
        set: 'custom',
        glyphId: g.id,
        glyph: g,
        name: g.name || 'Custom',
        payload: { kind: 'custom', glyphId: g.id, glyph: g },
      })),
    ...library.map((m) => ({
      key: `library:${m.id}`,
      set: 'library',
      glyphId: m.id,
      glyph: m.glyph,
      name: m.name || m.glyph?.name || 'Motif',
      payload: { kind: 'library', glyphId: m.id, glyph: m.glyph },
    })),
  ];
}
