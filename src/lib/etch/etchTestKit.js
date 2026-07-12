// etchTestKit — TEST-ONLY support for the Etch suites (Raster Etch S1, #80).
// Decodes the 1-bit indexed / stored-deflate PNG that etchBitmap.encodeEtchPNG
// produces, back to { bits, width, height, palette }. Deliberately kept OUT of
// the production encoder module (etchBitmap): no app code imports this, so it is
// never bundled — it exists only so tests can round-trip and, more importantly,
// so the buffer-identity invariant test can prove the EXPORTED pixels equal the
// canonical buffer. Handles ONLY the exact subset encodeEtchPNG emits.

function base64ToBytes(b64) {
  const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const lut = new Int16Array(128).fill(-1);
  for (let i = 0; i < B64.length; i++) lut[B64.charCodeAt(i)] = i;
  const clean = b64.replace(/=+$/, '');
  const out = new Uint8Array(Math.floor((clean.length * 6) / 8));
  let acc = 0;
  let bitsN = 0;
  let o = 0;
  for (let i = 0; i < clean.length; i++) {
    acc = (acc << 6) | lut[clean.charCodeAt(i)];
    bitsN += 6;
    if (bitsN >= 8) {
      bitsN -= 8;
      out[o++] = (acc >> bitsN) & 0xff;
    }
  }
  return out;
}

// Inflate a zlib stream of STORED (BTYPE=00) blocks — the only kind
// encodeEtchPNG emits. Skips the 2-byte zlib header and 4-byte adler trailer.
function inflateStored(zlib) {
  let p = 2; // skip zlib header
  const parts = [];
  let final = false;
  while (!final && p < zlib.length - 4) {
    const header = zlib[p++];
    final = (header & 1) === 1;
    const len = zlib[p] | (zlib[p + 1] << 8);
    p += 4; // LEN + NLEN
    parts.push(zlib.subarray(p, p + len));
    p += len;
  }
  let total = 0;
  for (const part of parts) total += part.length;
  const out = new Uint8Array(total);
  let o = 0;
  for (const part of parts) {
    out.set(part, o);
    o += part.length;
  }
  return out;
}

function readU32(bytes, off) {
  return ((bytes[off] << 24) | (bytes[off + 1] << 16) | (bytes[off + 2] << 8) | bytes[off + 3]) >>> 0;
}

/**
 * Decode a `data:image/png;base64,…` produced by encodeEtchPNG.
 * @returns {{ bits: Uint8Array, width: number, height: number, palette: number[][] }}
 */
export function decodeEtchPNG(dataUri) {
  const b64 = dataUri.replace(/^data:image\/png;base64,/, '');
  const png = base64ToBytes(b64);
  let p = 8; // skip signature
  let width = 0;
  let height = 0;
  const palette = [];
  let idat = null;
  while (p < png.length) {
    const len = readU32(png, p);
    const type = String.fromCharCode(png[p + 4], png[p + 5], png[p + 6], png[p + 7]);
    const data = png.subarray(p + 8, p + 8 + len);
    if (type === 'IHDR') {
      width = readU32(data, 0);
      height = readU32(data, 4);
    } else if (type === 'PLTE') {
      for (let i = 0; i + 2 < data.length; i += 3) palette.push([data[i], data[i + 1], data[i + 2]]);
    } else if (type === 'IDAT') {
      idat = data;
    } else if (type === 'IEND') {
      break;
    }
    p += 12 + len; // len + type + data + crc
  }
  const raw = inflateStored(idat);
  const rowBytes = Math.ceil(width / 8);
  const bits = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    const rowStart = y * (rowBytes + 1) + 1; // skip filter byte
    for (let x = 0; x < width; x++) {
      bits[y * width + x] = (raw[rowStart + (x >> 3)] >> (7 - (x & 7))) & 1;
    }
  }
  return { bits, width, height, palette };
}
