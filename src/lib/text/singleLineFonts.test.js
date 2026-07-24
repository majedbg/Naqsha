import { describe, it, expect, beforeEach } from 'vitest';
import {
  registerBuiltInSingleLineFonts,
  _resetSingleLineRegistration,
} from './singleLineFonts.js';
import {
  getFontMeta,
  loadFont,
  listFontsDetailed,
  groupFontOptions,
  _resetRuntimeFonts,
} from './fontRegistry.js';

beforeEach(() => {
  _resetRuntimeFonts();
  _resetSingleLineRegistration();
});

describe('registerBuiltInSingleLineFonts', () => {
  it('registers the engraving fonts as single-line / Engraving category', () => {
    const ids = registerBuiltInSingleLineFonts();
    expect(ids).toContain('engrave-sans');
    const meta = getFontMeta('engrave-sans');
    expect(meta).toMatchObject({ kind: 'single-line', category: 'Engraving' });
    expect(typeof meta.label).toBe('string');
  });

  it('makes them resolvable through the normal loader (seeded, no fetch)', async () => {
    registerBuiltInSingleLineFonts();
    const font = await loadFont('engrave-sans');
    expect(font.isSingleLine).toBe(true);
    expect(typeof font.getPath).toBe('function');
  });

  it('is idempotent (second call registers nothing new)', () => {
    expect(registerBuiltInSingleLineFonts().length).toBeGreaterThan(0);
    expect(registerBuiltInSingleLineFonts()).toEqual([]);
  });

  it('surfaces an "Engraving" optgroup in the picker after registration', () => {
    registerBuiltInSingleLineFonts();
    const groups = groupFontOptions(listFontsDetailed());
    const engraving = groups.find((g) => g.label === 'Engraving');
    expect(engraving).toBeTruthy();
    expect(engraving.options.some((o) => o.value === 'engrave-sans')).toBe(true);
  });
});
