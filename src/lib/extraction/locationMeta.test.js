// locationMeta (S8, issue #57): the optional capture-metadata normalizer.
// Unlike tile/lattice validation (which throws → row skipped), location is
// validate-and-null: bad pieces drop, the entry survives — location is fully
// optional and must never block.

import { describe, it, expect } from 'vitest';
import {
  normalizeLocation,
  normalizeCaptureDate,
  normalizeExif,
  sanitizeText,
  LOCATION_SOURCES,
} from './locationMeta';

describe('normalizeLocation', () => {
  it('keeps a full valid EXIF-sourced location', () => {
    const loc = {
      lat: 59.8586,
      lng: 17.6389,
      placeName: 'Uppsala, Sweden',
      address: 'Uppsala Cathedral, Sweden',
      source: 'exif',
    };
    expect(normalizeLocation(loc)).toEqual(loc);
  });

  it('accepts a place-only manual location with no coordinates', () => {
    const out = normalizeLocation({ placeName: 'Grandma attic', source: 'manual' });
    expect(out).toEqual({
      lat: null,
      lng: null,
      placeName: 'Grandma attic',
      address: null,
      source: 'manual',
    });
  });

  it('nulls out-of-range coordinates but keeps the place text', () => {
    const out = normalizeLocation({ lat: 200, lng: 17, placeName: 'Somewhere' });
    expect(out.lat).toBeNull();
    expect(out.lng).toBeNull();
    expect(out.placeName).toBe('Somewhere');
  });

  it('drops a lone coordinate axis (needs the pair)', () => {
    const out = normalizeLocation({ lat: 59.8, placeName: 'X' });
    expect(out.lat).toBeNull();
    expect(out.lng).toBeNull();
  });

  it('returns null when nothing meaningful survives', () => {
    expect(normalizeLocation({})).toBeNull();
    expect(normalizeLocation({ lat: 999, lng: 999 })).toBeNull();
    expect(normalizeLocation(null)).toBeNull();
    expect(normalizeLocation('nope')).toBeNull();
  });

  it('defaults an unknown source to manual, but keeps PRD-vocabulary values', () => {
    expect(normalizeLocation({ placeName: 'X', source: 'laser' }).source).toBe('manual');
    expect(normalizeLocation({ placeName: 'X', source: 'geocoded' }).source).toBe('geocoded');
    // Tolerant read of the PRD/#57 vocabulary — kept, not coerced to manual.
    expect(normalizeLocation({ placeName: 'X', source: 'pin' }).source).toBe('pin');
    expect(normalizeLocation({ placeName: 'X', source: 'address' }).source).toBe('address');
  });

  it('strips control chars and keeps angle-bracket text (React escapes it)', () => {
    const out = normalizeLocation({
      placeName: 'Upp\x00sala\x1b[31m',
      address: '<img src=x onerror=alert(1)>',
      lat: 1,
      lng: 2,
    });
    expect(out.placeName).toBe('Uppsala[31m'); // NUL + ESC stripped
    expect(out.address).toBe('<img src=x onerror=alert(1)>');
    // eslint-disable-next-line no-control-regex
    expect(JSON.stringify(out)).not.toMatch(/[\x00-\x1F\x7F]/);
  });

  it('caps absurdly long strings', () => {
    const out = normalizeLocation({ placeName: 'a'.repeat(5000), lat: 1, lng: 2 });
    expect(out.placeName.length).toBeLessThanOrEqual(200);
  });

  it('exposes the three write-side source values', () => {
    expect(LOCATION_SOURCES).toEqual(['exif', 'manual', 'geocoded']);
  });
});

describe('normalizeCaptureDate', () => {
  it('canonicalizes an ISO string', () => {
    expect(normalizeCaptureDate('2026-06-28T12:32:10.000Z')).toBe('2026-06-28T12:32:10.000Z');
  });
  it('accepts a Date', () => {
    expect(normalizeCaptureDate(new Date('2026-06-28T00:00:00Z'))).toBe('2026-06-28T00:00:00.000Z');
  });
  it('returns null for garbage / absent', () => {
    expect(normalizeCaptureDate('not a date')).toBeNull();
    expect(normalizeCaptureDate(null)).toBeNull();
    expect(normalizeCaptureDate(undefined)).toBeNull();
  });
});

describe('normalizeExif', () => {
  it('keeps a camera label', () => {
    expect(normalizeExif({ camera: 'Apple iPhone 15 Pro' })).toEqual({ camera: 'Apple iPhone 15 Pro' });
  });
  it('returns null when no camera', () => {
    expect(normalizeExif({})).toBeNull();
    expect(normalizeExif(null)).toBeNull();
    expect(normalizeExif({ camera: '   ' })).toBeNull();
  });
});

describe('sanitizeText', () => {
  it('returns null for non-strings and empties', () => {
    expect(sanitizeText(42, 10)).toBeNull();
    expect(sanitizeText('', 10)).toBeNull();
    expect(sanitizeText('   ', 10)).toBeNull();
  });
});
