// Unit tests for the PURE parts of the font registry: catalog lookups and the
// memoization contract via the injectable loader core. The real fetch is
// browser-only and intentionally NOT exercised here (no jsdom ttf fetch).

import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  FONT_CATALOG,
  DEFAULT_FONT_ID,
  listFonts,
  listFontsDetailed,
  groupFontOptions,
  getFontMeta,
  asResolver,
  registerFont,
  registerUploadedFont,
  loadFont,
  _loadWithParser,
  _resetFontCache,
  _resetRuntimeFonts,
} from './fontRegistry.js';

// A minimal File-like: registerUploadedFont only needs `name` + `arrayBuffer()`.
function fakeFile(name, bytes) {
  const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  return { name, arrayBuffer: async () => ab };
}

beforeEach(() => {
  _resetFontCache();
  _resetRuntimeFonts();
});

describe('FONT_CATALOG / DEFAULT_FONT_ID', () => {
  it('contains the work-sans entry with id, label, and a url string', () => {
    const entry = FONT_CATALOG.find((f) => f.id === 'work-sans');
    expect(entry).toBeTruthy();
    expect(entry.label).toBe('Work Sans');
    expect(typeof entry.url).toBe('string');
    expect(entry.url.length).toBeGreaterThan(0);
  });

  it('defaults to work-sans, which exists in the catalog', () => {
    expect(DEFAULT_FONT_ID).toBe('work-sans');
    expect(FONT_CATALOG.some((f) => f.id === DEFAULT_FONT_ID)).toBe(true);
  });
});

describe('expanded OFL catalog', () => {
  it('ships a curated multi-font catalog (default + lazy /public fonts)', () => {
    expect(FONT_CATALOG.length).toBeGreaterThanOrEqual(10);
    // work-sans stays the bundled default; the rest are lazy /fonts/ urls.
    const ws = FONT_CATALOG.find((f) => f.id === 'work-sans');
    expect(ws.category).toBe('Sans');
    const lazy = FONT_CATALOG.filter((f) => f.id !== 'work-sans');
    expect(lazy.every((f) => f.url.includes('/fonts/') && f.url.endsWith('.ttf'))).toBe(true);
    // Every entry is a normal outline font with a display category.
    expect(FONT_CATALOG.every((f) => f.kind === 'outline' && typeof f.category === 'string')).toBe(true);
  });
});

describe('groupFontOptions', () => {
  it('groups by category into optgroup-shaped options, ordered Sans→Serif→Display…', () => {
    const groups = groupFontOptions([
      { id: 'a', label: 'A', category: 'Mono' },
      { id: 'b', label: 'B', category: 'Sans' },
      { id: 'c', label: 'C', category: 'Serif' },
      { id: 'd', label: 'D', category: 'Sans' },
    ]);
    expect(groups.map((g) => g.label)).toEqual(['Sans', 'Serif', 'Mono']);
    // Grouped option shape { label, options:[{value,label}] } — Select renders <optgroup>.
    expect(groups[0]).toEqual({ label: 'Sans', options: [
      { value: 'b', label: 'B' }, { value: 'd', label: 'D' },
    ] });
  });

  it('places unknown categories after the known ones', () => {
    const groups = groupFontOptions([
      { id: 'x', label: 'X', category: 'Zzz' },
      { id: 'y', label: 'Y', category: 'Sans' },
    ]);
    expect(groups.map((g) => g.label)).toEqual(['Sans', 'Zzz']);
  });
});

describe('listFonts', () => {
  it('returns one {id,label} per catalog entry with NO url key', () => {
    const list = listFonts();
    expect(list).toHaveLength(FONT_CATALOG.length);
    for (const item of list) {
      expect(Object.keys(item).sort()).toEqual(['id', 'label']);
      expect('url' in item).toBe(false);
    }
    expect(list[0]).toEqual({ id: 'work-sans', label: 'Work Sans' });
  });
});

describe('getFontMeta', () => {
  it('returns a full {id,label,url} for a known id', () => {
    const meta = getFontMeta('work-sans');
    expect(meta).toMatchObject({ id: 'work-sans', label: 'Work Sans' });
    expect(typeof meta.url).toBe('string');
  });

  it('returns a copy, not the catalog entry itself', () => {
    expect(getFontMeta('work-sans')).not.toBe(
      FONT_CATALOG.find((f) => f.id === 'work-sans'),
    );
  });

  it('returns null for an unknown id', () => {
    expect(getFontMeta('nope')).toBeNull();
  });
});

describe('_loadWithParser memoization contract', () => {
  const fakeFont = { __fake: 'font' };

  it('fetches + parses once and resolves to the parsed font', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new ArrayBuffer(8));
    const parseImpl = vi.fn().mockReturnValue(fakeFont);

    const font = await _loadWithParser('work-sans', fetchImpl, parseImpl);

    expect(font).toBe(fakeFont);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(parseImpl).toHaveBeenCalledTimes(1);
  });

  it('does not re-fetch on a sequential repeat call (memoized)', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new ArrayBuffer(8));
    const parseImpl = vi.fn().mockReturnValue(fakeFont);

    const a = await _loadWithParser('work-sans', fetchImpl, parseImpl);
    const b = await _loadWithParser('work-sans', fetchImpl, parseImpl);

    expect(b).toBe(a);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(parseImpl).toHaveBeenCalledTimes(1);
  });

  it('dedupes CONCURRENT calls to a single fetch (promise is cached)', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new ArrayBuffer(8));
    const parseImpl = vi.fn().mockReturnValue(fakeFont);

    // Fire both before awaiting either — proves we cache the promise, not the
    // resolved Font.
    const p1 = _loadWithParser('work-sans', fetchImpl, parseImpl);
    const p2 = _loadWithParser('work-sans', fetchImpl, parseImpl);
    expect(p1).toBe(p2);

    await Promise.all([p1, p2]);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('rejects with a clear error for an unknown id (and does not fetch)', async () => {
    const fetchImpl = vi.fn();
    const parseImpl = vi.fn();

    await expect(
      _loadWithParser('does-not-exist', fetchImpl, parseImpl),
    ).rejects.toThrow(/Unknown font id/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('drops the cache entry on failure so a retry can re-fetch', async () => {
    const failing = vi.fn().mockRejectedValueOnce(new Error('boom'));
    const parseImpl = vi.fn().mockReturnValue(fakeFont);

    await expect(
      _loadWithParser('work-sans', failing, parseImpl),
    ).rejects.toThrow('boom');

    // Retry with a working fetch should succeed (entry was not poisoned).
    const ok = vi.fn().mockResolvedValue(new ArrayBuffer(8));
    const font = await _loadWithParser('work-sans', ok, parseImpl);
    expect(font).toBe(fakeFont);
    expect(ok).toHaveBeenCalledTimes(1);
  });
});

describe('asResolver', () => {
  const fakeFont = { __fake: 'font' };

  it('passes a resolver function through unchanged (per-node fonts)', () => {
    const fn = (id) => (id === 'x' ? fakeFont : null);
    expect(asResolver(fn)).toBe(fn);
  });

  it('wraps a single Font as a constant resolver (legacy single-font)', () => {
    const resolve = asResolver(fakeFont);
    expect(resolve('anything')).toBe(fakeFont);
    expect(resolve()).toBe(fakeFont);
  });

  it('wraps null as a resolver that always returns null', () => {
    const resolve = asResolver(null);
    expect(resolve('anything')).toBe(null);
  });
});

describe('runtime font registration', () => {
  const fakeFont = { __fake: 'uploaded' };

  it('registerFont adds a kind-tagged entry to the detailed list and getFontMeta', () => {
    registerFont({ id: 'my-upload', label: 'My Upload', font: fakeFont, kind: 'outline' });
    expect(getFontMeta('my-upload')).toMatchObject({ id: 'my-upload', label: 'My Upload', kind: 'outline' });
    const detailed = listFontsDetailed();
    // Uploads default to the 'Uploaded' category.
    expect(detailed).toContainEqual({ id: 'my-upload', label: 'My Upload', kind: 'outline', category: 'Uploaded' });
    // Static listFonts is unchanged (still catalog-only, id+label).
    expect(listFonts().some((f) => f.id === 'my-upload')).toBe(false);
  });

  it('loadFont resolves a registered font from the seeded cache (no fetch)', async () => {
    registerFont({ id: 'seeded', label: 'Seeded', font: fakeFont });
    // Injected fetch must NOT be called — the cache was seeded by registerFont.
    const fetchImpl = vi.fn();
    const parseImpl = vi.fn();
    const font = await _loadWithParser('seeded', fetchImpl, parseImpl);
    expect(font).toBe(fakeFont);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('_resetRuntimeFonts forgets registered fonts', () => {
    registerFont({ id: 'temp', label: 'Temp', font: fakeFont });
    expect(getFontMeta('temp')).toBeTruthy();
    _resetRuntimeFonts();
    expect(getFontMeta('temp')).toBeNull();
  });
});

describe('registerUploadedFont', () => {
  const wsPath = fileURLToPath(new URL('../../assets/fonts/WorkSans-Regular.ttf', import.meta.url));

  it('parses a real .ttf upload, registers it (Uploaded/outline), and loadFont resolves it', async () => {
    const file = fakeFile('My Font.ttf', fs.readFileSync(wsPath));
    const { id, label } = await registerUploadedFont(file);
    expect(label).toBe('My Font'); // extension stripped
    const meta = getFontMeta(id);
    expect(meta).toMatchObject({ kind: 'outline', category: 'Uploaded' });
    // Registered → the loader resolves it from the seeded cache (no fetch).
    const font = await loadFont(id);
    expect(typeof font.getPath).toBe('function');
  });

  it('rejects a WOFF2 file with an actionable message (opentype.js can’t parse it)', async () => {
    const woff2 = new Uint8Array([0x77, 0x4f, 0x46, 0x32, 0, 0, 0, 0]); // 'wOF2'…
    await expect(registerUploadedFont(fakeFile('x.woff2', woff2))).rejects.toThrow(/WOFF2/i);
  });

  it('rejects an unreadable file rather than registering garbage', async () => {
    const junk = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
    await expect(registerUploadedFont(fakeFile('junk.ttf', junk))).rejects.toThrow(/Could not read/i);
  });
});
