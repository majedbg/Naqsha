// Unit tests for the PURE parts of the font registry: catalog lookups and the
// memoization contract via the injectable loader core. The real fetch is
// browser-only and intentionally NOT exercised here (no jsdom ttf fetch).

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  FONT_CATALOG,
  DEFAULT_FONT_ID,
  listFonts,
  getFontMeta,
  _loadWithParser,
  _resetFontCache,
} from './fontRegistry.js';

beforeEach(() => {
  _resetFontCache();
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
