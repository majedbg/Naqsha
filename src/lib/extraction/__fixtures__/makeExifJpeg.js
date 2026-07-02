// Test/verification fixture builder: assemble a minimal but VALID JPEG carrying
// a known EXIF APP1 segment (DateTimeOriginal + GPS lat/lng + Make/Model), so
// ExifReader tests (and the browser walk-through) exercise real parsing rather
// than a mock. Dependency-free: a hand-rolled little-endian TIFF/EXIF encoder
// spliced ahead of a real baseline-JPEG body, so the result both decodes as an
// image AND round-trips through exifr.
//
// Not shipped — lives under __fixtures__, imported only by tests and the
// verification script.

// A real 2x2 baseline JPEG (everything AFTER the SOI marker). Generated once
// with canvas.toBlob and inlined so node tests need no canvas. We splice our
// EXIF APP1 between SOI and this body.
const BASE_JPEG_BODY_B64 =
  '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0a' +
  'HBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAACAAIBAREA/8QAHwAAAQUBAQEB' +
  'AQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1Fh' +
  'ByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZ' +
  'WmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXG' +
  'x8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/9oACAEBAAA/APn+iiigD//Z';

const SOI = [0xff, 0xd8];

function asciiBytes(str) {
  const nul = str.endsWith('\0') ? str : str + '\0';
  return Array.from(nul, (c) => c.charCodeAt(0) & 0xff);
}

// One IFD entry descriptor. `type`: 2=ASCII, 3=SHORT, 4=LONG, 5=RATIONAL.
// `value` is a string (ASCII), a number (SHORT/LONG), or an array of
// [num,den] pairs (RATIONAL).
function entrySize(type, value) {
  if (type === 2) return asciiBytes(value).length;
  if (type === 5) return value.length * 8;
  return 4; // SHORT/LONG count 1
}

// Encode one IFD at absolute TIFF offset `ifdOffset`. Values wider than 4 bytes
// land in a data area right after the entry table; smaller ones sit inline.
// Returns { bytes, size } — bytes is a plain array of octets (little-endian).
function encodeIFD(entries, ifdOffset) {
  const n = entries.length;
  const tableSize = 2 + n * 12 + 4; // count + entries + nextIFD
  const out = [];
  const push16 = (v) => out.push(v & 0xff, (v >> 8) & 0xff);
  const push32 = (v) =>
    out.push(v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff, (v >> 24) & 0xff);

  push16(n);
  let dataOffset = ifdOffset + tableSize;
  const dataArea = [];

  for (const e of entries) {
    const size = entrySize(e.type, e.value);
    const count =
      e.type === 2 ? asciiBytes(e.value).length : e.type === 5 ? e.value.length : 1;
    push16(e.tag);
    push16(e.type);
    push32(count);
    if (size <= 4) {
      // Inline value, left-justified, zero-padded to 4 bytes.
      if (e.type === 2) {
        const b = asciiBytes(e.value);
        for (let i = 0; i < 4; i++) out.push(b[i] ?? 0);
      } else {
        push32(e.value);
      }
    } else {
      push32(dataOffset);
      if (e.type === 2) {
        dataArea.push(...asciiBytes(e.value));
      } else if (e.type === 5) {
        for (const [num, den] of e.value) {
          dataArea.push(
            num & 0xff, (num >> 8) & 0xff, (num >> 16) & 0xff, (num >> 24) & 0xff,
            den & 0xff, (den >> 8) & 0xff, (den >> 16) & 0xff, (den >> 24) & 0xff
          );
        }
      }
      dataOffset += size;
    }
  }
  push32(0); // no next IFD
  out.push(...dataArea);
  return { bytes: out, size: out.length };
}

// GPS coordinate → EXIF deg/min/sec RATIONAL triplet (abs value; ref carries
// the sign).
function toDMS(coord) {
  const abs = Math.abs(coord);
  const deg = Math.floor(abs);
  const minFloat = (abs - deg) * 60;
  const min = Math.floor(minFloat);
  const secFloat = (minFloat - min) * 60;
  // Encode seconds at 1/1000 precision — plenty for a fixture.
  return [
    [deg, 1],
    [min, 1],
    [Math.round(secFloat * 1000), 1000],
  ];
}

/**
 * Build a JPEG (Uint8Array) with an EXIF APP1 segment.
 * @param {object} opts
 * @param {string} [opts.dateTime] EXIF DateTimeOriginal ("YYYY:MM:DD HH:MM:SS").
 * @param {number} [opts.lat] decimal latitude (signed).
 * @param {number} [opts.lng] decimal longitude (signed).
 * @param {string} [opts.make]
 * @param {string} [opts.model]
 */
export function makeExifJpeg({
  dateTime = '2026:06:28 14:32:10',
  lat = 59.8586,
  lng = 17.6389,
  make = 'Apple',
  model = 'iPhone 15 Pro',
} = {}) {
  // TIFF offsets are relative to the start of the TIFF header ("II..").
  // Layout order: IFD0 (@8) → EXIF SubIFD → GPS IFD.
  const ifd0Offset = 8;

  // Pre-size IFD0 so we know where the sub-IFDs begin.
  const ifd0Entries = [
    { tag: 0x010f, type: 2, value: make }, // Make
    { tag: 0x0110, type: 2, value: model }, // Model
    { tag: 0x8769, type: 4, value: 0 }, // ExifIFDPointer (patched below)
    { tag: 0x8825, type: 4, value: 0 }, // GPSInfoIFDPointer (patched below)
  ];
  const hasGps = Number.isFinite(lat) && Number.isFinite(lng);
  if (!hasGps) ifd0Entries.pop(); // drop GPS pointer → a GPS-less fixture

  // Provisional encode to learn IFD0's real size (data area depends on strings).
  const ifd0Probe = encodeIFD(ifd0Entries, ifd0Offset);
  const exifOffset = ifd0Offset + ifd0Probe.size;

  const exifEntries = [{ tag: 0x9003, type: 2, value: dateTime }]; // DateTimeOriginal
  const exifProbe = encodeIFD(exifEntries, exifOffset);
  const gpsOffset = exifOffset + exifProbe.size;

  // Patch pointers now that offsets are known.
  ifd0Entries[2].value = exifOffset; // ExifIFDPointer
  if (hasGps) ifd0Entries[3].value = gpsOffset;

  const ifd0 = encodeIFD(ifd0Entries, ifd0Offset);
  const exifIFD = encodeIFD(exifEntries, exifOffset);

  let gps = { bytes: [], size: 0 };
  if (hasGps) {
    const gpsEntries = [
      { tag: 0x0001, type: 2, value: lat >= 0 ? 'N' : 'S' },
      { tag: 0x0002, type: 5, value: toDMS(lat) },
      { tag: 0x0003, type: 2, value: lng >= 0 ? 'E' : 'W' },
      { tag: 0x0004, type: 5, value: toDMS(lng) },
    ];
    gps = encodeIFD(gpsEntries, gpsOffset);
  }

  // TIFF header + IFDs.
  const tiff = [
    0x49, 0x49, // "II" little-endian
    0x2a, 0x00, // 42
    0x08, 0x00, 0x00, 0x00, // IFD0 @ offset 8
    ...ifd0.bytes,
    ...exifIFD.bytes,
    ...gps.bytes,
  ];

  // APP1 segment: marker + length + "Exif\0\0" + TIFF.
  const exifHeader = [0x45, 0x78, 0x69, 0x66, 0x00, 0x00]; // "Exif\0\0"
  const app1Payload = [...exifHeader, ...tiff];
  const app1Len = app1Payload.length + 2; // length field includes itself
  const app1 = [0xff, 0xe1, (app1Len >> 8) & 0xff, app1Len & 0xff, ...app1Payload];

  const body = Uint8Array.from(atobBytes(BASE_JPEG_BODY_B64));
  // BASE body already starts with its own SOI (FFD8); drop it, we prepend ours.
  const bodyNoSoi = body.subarray(2);

  const bytes = new Uint8Array(SOI.length + app1.length + bodyNoSoi.length);
  bytes.set(SOI, 0);
  bytes.set(app1, SOI.length);
  bytes.set(bodyNoSoi, SOI.length + app1.length);
  return bytes;
}

/** A JPEG with NO EXIF at all (the base body, unmodified). */
export function makePlainJpeg() {
  return Uint8Array.from(atobBytes(BASE_JPEG_BODY_B64));
}

/** Deliberately corrupt EXIF: a truncated APP1 that must parse to nulls, not throw. */
export function makeCorruptExifJpeg() {
  // Valid SOI + APP1 marker claiming a long length but no payload.
  const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 0x00, 0x40, 0x45, 0x78, 0x69, 0x66, 0x00, 0x00, 0x49, 0x49]);
  return bytes;
}

// Minimal base64 → byte array (node & browser both have atob; keep explicit
// for clarity and to avoid Buffer coupling).
function atobBytes(b64) {
  const bin =
    typeof atob === 'function'
      ? atob(b64)
      : globalThis.Buffer.from(b64, 'base64').toString('binary');
  return Array.from(bin, (c) => c.charCodeAt(0) & 0xff);
}
