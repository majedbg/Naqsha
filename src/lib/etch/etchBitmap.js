// etchBitmap — materialize the canonical 1-bit Etch buffer into pixels (Raster
// Etch S1, issue #80). Two consumers, ONE buffer (grilled decision 4, the
// WYSIWYG single-source invariant):
//
//   • bitmapToRGBA(bitmap, color) — the RGBA the p5 canvas paints.
//   • encodeEtchPNG(bitmap, color) — the base64 data-URI the SVG embeds.
//
// Both read the SAME `bitmap.bits` (etchProcess' single source); neither
// re-thresholds. What renders is bit-for-bit what exports.
//
// The exported PNG is a genuinely 1-bit image: an INDEXED-colour PNG at bit
// depth 1, a 2-entry palette [paper, engrave-colour], paper made transparent via
// tRNS so the Etch composites over the layers beneath it (and over the white
// export background). We hand-roll the encoder — no deflate/PNG dependency
// exists in the tree (checked: only jszip/jimp, neither a clean 1-bit-palette
// path) — using STORED (uncompressed) DEFLATE blocks, which are pure JS and
// deterministic in node, the browser, and a Web Worker alike. Stored deflate
// trades file size for zero-dependency portability; real compression is a later
// optimization, not a spine concern (a full-resolution Etch data-URI is large —
// a known S1 limitation shared with the ≤1024px source cap, resolved by the S7
// bucket). "at the engrave colour" comes from the caller's resolved colour.

/** '#rgb' | '#rrggbb' → [r,g,b] 0..255. Unknown input → black. */
function parseHexColor(hex) {
  if (typeof hex !== 'string') return [0, 0, 0];
  let h = hex.trim().replace(/^#/, '');
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  if (h.length !== 6 || /[^0-9a-fA-F]/.test(h)) return [0, 0, 0];
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

/**
 * Canonical 1-bit buffer → RGBA the canvas paints. Etched dot (bit 1) → the
 * engrave colour, opaque; paper (bit 0) → fully transparent (composites over
 * whatever is beneath). This is the ONLY render materialization — the p5 layer
 * draw builds its image from exactly this.
 *
 * @param {{bits: Uint8Array, width: number, height: number}} bitmap
 * @param {string} color engrave colour hex
 * @returns {Uint8ClampedArray} length width*height*4
 */
export function bitmapToRGBA(bitmap, color) {
  const { bits, width, height } = bitmap;
  const [r, g, b] = parseHexColor(color);
  const out = new Uint8ClampedArray(width * height * 4);
  for (let j = 0; j < bits.length; j++) {
    const i = j * 4;
    if (bits[j] === 1) {
      out[i] = r;
      out[i + 1] = g;
      out[i + 2] = b;
      out[i + 3] = 255;
    }
    // paper stays 0,0,0,0 (transparent) — the zero-initialized default.
  }
  return out;
}

// ── minimal 1-bit indexed PNG encoder (stored deflate) ──────────────────────

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// Adler-32 over the RAW (pre-deflate) bytes, per the zlib trailer.
function adler32(bytes) {
  let a = 1;
  let b = 0;
  for (let i = 0; i < bytes.length; i++) {
    a = (a + bytes[i]) % 65521;
    b = (b + a) % 65521;
  }
  return ((b << 16) | a) >>> 0;
}

// Wrap RAW bytes in a zlib stream of STORED (BTYPE=00) deflate blocks — no
// compression, so the encoder is pure arithmetic with no LZ/Huffman machinery.
function zlibStore(raw) {
  const blocks = [];
  const MAX = 65535;
  for (let off = 0; off < raw.length || off === 0; off += MAX) {
    const chunk = raw.subarray(off, Math.min(off + MAX, raw.length));
    const last = off + MAX >= raw.length ? 1 : 0;
    const len = chunk.length;
    const nlen = ~len & 0xffff;
    blocks.push(Uint8Array.of(last, len & 0xff, (len >> 8) & 0xff, nlen & 0xff, (nlen >> 8) & 0xff));
    blocks.push(chunk);
    if (raw.length === 0) break; // single empty stored block
  }
  const adler = adler32(raw);
  const header = Uint8Array.of(0x78, 0x01); // CM=deflate, no preset dict; %31==0
  const trailer = Uint8Array.of((adler >>> 24) & 0xff, (adler >>> 16) & 0xff, (adler >>> 8) & 0xff, adler & 0xff);
  return concatBytes([header, ...blocks, trailer]);
}

function concatBytes(arrays) {
  let total = 0;
  for (const a of arrays) total += a.length;
  const out = new Uint8Array(total);
  let o = 0;
  for (const a of arrays) {
    out.set(a, o);
    o += a.length;
  }
  return out;
}

function pngChunk(type, data) {
  const typeBytes = Uint8Array.of(type.charCodeAt(0), type.charCodeAt(1), type.charCodeAt(2), type.charCodeAt(3));
  const body = concatBytes([typeBytes, data]);
  const len = data.length;
  const lenBytes = Uint8Array.of((len >>> 24) & 0xff, (len >>> 16) & 0xff, (len >>> 8) & 0xff, len & 0xff);
  const crc = crc32(body);
  const crcBytes = Uint8Array.of((crc >>> 24) & 0xff, (crc >>> 16) & 0xff, (crc >>> 8) & 0xff, crc & 0xff);
  return concatBytes([lenBytes, body, crcBytes]);
}

// Pack the 1-bit buffer into PNG scanlines: each row is a filter byte (0 = None)
// followed by ceil(width/8) bytes, one bit per pixel, MSB first, rows byte-
// padded. Pixel value == palette index (0 = paper, 1 = engrave colour).
function packScanlines(bits, width, height) {
  const rowBytes = Math.ceil(width / 8);
  const raw = new Uint8Array((rowBytes + 1) * height);
  for (let y = 0; y < height; y++) {
    const rowStart = y * (rowBytes + 1); // leading filter byte stays 0
    for (let x = 0; x < width; x++) {
      if (bits[y * width + x] === 1) {
        raw[rowStart + 1 + (x >> 3)] |= 0x80 >> (x & 7);
      }
    }
  }
  return raw;
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

// Deterministic base64 of raw bytes (no btoa/Buffer dependency, so the encoder
// is identical in node, jsdom, and a Web Worker).
function bytesToBase64(bytes) {
  let out = '';
  let i = 0;
  for (; i + 2 < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + B64[(n >> 6) & 63] + B64[n & 63];
  }
  const rem = bytes.length - i;
  if (rem === 1) {
    const n = bytes[i] << 16;
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + '==';
  } else if (rem === 2) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8);
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + B64[(n >> 6) & 63] + '=';
  }
  return out;
}

const PNG_SIG = Uint8Array.of(137, 80, 78, 71, 13, 10, 26, 10);

/**
 * Encode the canonical 1-bit buffer as a base64 PNG data-URI at the engrave
 * colour. Indexed 1-bit PNG: palette[0] = white paper (transparent via tRNS),
 * palette[1] = engrave colour (opaque). Reads `bitmap.bits` directly — the same
 * buffer bitmapToRGBA renders — so the embedded image is the on-screen image.
 *
 * @param {{bits: Uint8Array, width: number, height: number}} bitmap
 * @param {string} color engrave colour hex
 * @returns {string} `data:image/png;base64,…`
 */
export function encodeEtchPNG(bitmap, color) {
  const { bits, width, height } = bitmap;
  const [r, g, b] = parseHexColor(color);

  const ihdr = Uint8Array.of(
    (width >>> 24) & 0xff, (width >>> 16) & 0xff, (width >>> 8) & 0xff, width & 0xff,
    (height >>> 24) & 0xff, (height >>> 16) & 0xff, (height >>> 8) & 0xff, height & 0xff,
    1, // bit depth
    3, // colour type: indexed
    0, 0, 0 // compression, filter, interlace
  );
  // palette: index 0 = paper (white), index 1 = engrave colour.
  const plte = Uint8Array.of(255, 255, 255, r, g, b);
  // tRNS: alpha for palette entries in order — paper transparent, ink opaque.
  const trns = Uint8Array.of(0, 255);
  const idat = zlibStore(packScanlines(bits, width, height));

  const png = concatBytes([
    PNG_SIG,
    pngChunk('IHDR', ihdr),
    pngChunk('PLTE', plte),
    pngChunk('tRNS', trns),
    pngChunk('IDAT', idat),
    pngChunk('IEND', new Uint8Array(0)),
  ]);
  return `data:image/png;base64,${bytesToBase64(png)}`;
}
