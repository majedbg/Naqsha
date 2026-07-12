import { describe, it, expect } from 'vitest';
import { bitmapToRGBA, encodeEtchPNG } from './etchBitmap.js';
import { decodeEtchPNG } from './etchTestKit.js';

function bmp(bitsArr, width, height) {
  return { bits: Uint8Array.from(bitsArr), width, height };
}

describe('bitmapToRGBA — the canvas materialization', () => {
  it('etched dot → engrave colour opaque; paper → transparent', () => {
    const rgba = bitmapToRGBA(bmp([1, 0], 2, 1), '#ff0000');
    expect(Array.from(rgba.slice(0, 4))).toEqual([255, 0, 0, 255]); // ink
    expect(Array.from(rgba.slice(4, 8))).toEqual([0, 0, 0, 0]); // paper transparent
  });

  it('parses shorthand hex', () => {
    const rgba = bitmapToRGBA(bmp([1], 1, 1), '#0f0');
    expect(Array.from(rgba.slice(0, 4))).toEqual([0, 255, 0, 255]);
  });
});

describe('encodeEtchPNG — embedded 1-bit bitmap data-URI', () => {
  it('produces a PNG data-URI', () => {
    const uri = encodeEtchPNG(bmp([1, 0, 0, 1], 2, 2), '#000000');
    expect(uri.startsWith('data:image/png;base64,')).toBe(true);
  });

  it('round-trips the exact bits and dimensions', () => {
    const bits = [1, 0, 1, 1, 0, 0, 1, 0, 1]; // 3x3
    const uri = encodeEtchPNG(bmp(bits, 3, 3), '#123456');
    const decoded = decodeEtchPNG(uri);
    expect(decoded.width).toBe(3);
    expect(decoded.height).toBe(3);
    expect(Array.from(decoded.bits)).toEqual(bits);
  });

  it('embeds the engrave colour in the palette (index 1 = ink)', () => {
    const decoded = decodeEtchPNG(encodeEtchPNG(bmp([1], 1, 1), '#abcdef'));
    expect(decoded.palette[1]).toEqual([0xab, 0xcd, 0xef]);
    expect(decoded.palette[0]).toEqual([255, 255, 255]); // paper white
  });

  it('handles non-byte-aligned widths (bit packing padded per row)', () => {
    // width 5 → each row spills into a second byte with 3 pad bits.
    const bits = [1, 0, 1, 0, 1, 0, 1, 0, 1, 0]; // 5x2
    const decoded = decodeEtchPNG(encodeEtchPNG(bmp(bits, 5, 2), '#000000'));
    expect(Array.from(decoded.bits)).toEqual(bits);
  });
});
