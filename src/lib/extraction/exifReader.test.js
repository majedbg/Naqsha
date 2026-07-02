// ExifReader (S8, issue #57): client-side capture-date + GPS + camera parsing
// from an uploaded photo. Fixtures are hand-rolled EXIF JPEGs (with GPS /
// date-only / corrupt / none) so we exercise real exifr parsing, not a mock.
// Contract: corrupt/absent EXIF resolves to nulls, NEVER throws outward.

import { describe, it, expect } from 'vitest';
import { readExif } from './exifReader';
import {
  makeExifJpeg,
  makePlainJpeg,
  makeCorruptExifJpeg,
} from './__fixtures__/makeExifJpeg';

// exifr accepts an ArrayBuffer/Uint8Array directly; the app passes a File/Blob
// in the browser. A minimal Blob-like polyfill keeps these node-side tests
// aligned with the browser call shape.
function asBlob(bytes) {
  return new Blob([bytes], { type: 'image/jpeg' });
}

describe('readExif', () => {
  it('reads capture date, GPS, and camera from a full EXIF photo', async () => {
    const jpeg = makeExifJpeg({
      dateTime: '2026:06:28 14:32:10',
      lat: 59.8586,
      lng: 17.6389,
      make: 'Apple',
      model: 'iPhone 15 Pro',
    });
    const out = await readExif(asBlob(jpeg));
    expect(out.gps).toEqual({ lat: expect.closeTo(59.8586, 4), lng: expect.closeTo(17.6389, 4) });
    expect(out.date).toMatch(/^2026-06-28T/); // ISO string
    expect(out.camera).toBe('Apple iPhone 15 Pro');
  });

  it('reads a southern/western hemisphere GPS with correct sign', async () => {
    const jpeg = makeExifJpeg({ lat: -33.8688, lng: -151.2093 });
    const out = await readExif(asBlob(jpeg));
    expect(out.gps.lat).toBeCloseTo(-33.8688, 3);
    expect(out.gps.lng).toBeCloseTo(-151.2093, 3);
  });

  it('returns date but null GPS when EXIF has no GPS', async () => {
    const jpeg = makeExifJpeg({ lat: NaN, lng: NaN, dateTime: '2026:01:02 03:04:05' });
    const out = await readExif(asBlob(jpeg));
    expect(out.gps).toBeNull();
    expect(out.date).toMatch(/^2026-01-02T/);
  });

  it('returns all-nulls for a photo with no EXIF at all (zero friction)', async () => {
    const out = await readExif(asBlob(makePlainJpeg()));
    expect(out).toEqual({ date: null, gps: null, camera: null });
  });

  it('never throws on corrupt EXIF — resolves to nulls', async () => {
    const out = await readExif(asBlob(makeCorruptExifJpeg()));
    expect(out).toEqual({ date: null, gps: null, camera: null });
  });

  it('never throws on non-image / garbage input', async () => {
    const out = await readExif(asBlob(Uint8Array.from([1, 2, 3, 4, 5])));
    expect(out).toEqual({ date: null, gps: null, camera: null });
  });

  it('rejects out-of-range GPS (guards a malformed EXIF payload)', async () => {
    // lat 200 is impossible; the reader must null it rather than pass it on.
    const jpeg = makeExifJpeg({ lat: 200, lng: 17 });
    const out = await readExif(asBlob(jpeg));
    expect(out.gps).toBeNull();
  });
});
