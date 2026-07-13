import { describe, it, expect } from 'vitest';
import { etchHeroRGBA } from './etchHeroRGBA.js';
import { etchSourceToBitmap } from './etchProcess.js';
import { bitmapToRGBA, encodeEtchPNG } from './etchBitmap.js';
import { decodeEtchPNG } from './etchTestKit.js';

// The 1:1 "what etches" hero (Raster Etch S9, #88) MUST show bit-for-bit what
// exports (grilled decision 4, the WYSIWYG single-source invariant). These tests
// pin the hero materialization against the SVG export's embedded bitmap — same
// buffer, no drift.

function grayImage(rows) {
  const height = rows.length;
  const width = rows[0].length;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = rows[y][x];
      data[i + 3] = 255;
    }
  }
  return { data, width, height };
}

const bitmap = () => etchSourceToBitmap(grayImage([[0, 255], [200, 40]]));
const heldBitmap = () =>
  etchSourceToBitmap(grayImage([[10, 250], [250, 20]]), { hold: { enabled: true, cutoff: 200 } });

describe('etchHeroRGBA — the hero materialization (no drift from what exports)', () => {
  it('the base RGBA is EXACTLY bitmapToRGBA — the same buffer the canvas paints', () => {
    const bmp = bitmap();
    const { base } = etchHeroRGBA(bmp, '#000000');
    expect(Array.from(base)).toEqual(Array.from(bitmapToRGBA(bmp, '#000000')));
  });

  it('the hero pixels reconstruct the SAME bits the SVG export embeds (WYSIWYG, no drift)', () => {
    const bmp = bitmap();
    const color = '#112233';
    // What the hero shows (the composited display buffer).
    const { data, width, height } = etchHeroRGBA(bmp, color);
    // What the export embeds — decoded back to bits (same color, so exact).
    const exported = decodeEtchPNG(encodeEtchPNG(bmp, color));
    // Reconstruct the etched-dot bits from the hero's pixels: a dot is an OPAQUE
    // pixel (held wash is alpha < 255, paper is transparent), so alpha===255 ⇒ dot.
    const heroBits = new Uint8Array(width * height);
    for (let j = 0; j < heroBits.length; j++) heroBits[j] = data[j * 4 + 3] === 255 ? 1 : 0;
    expect(Array.from(heroBits)).toEqual(Array.from(exported.bits));
  });

  it('composites the held wash on top WITHOUT touching any dot pixel', () => {
    const bmp = heldBitmap();
    const { base, data, heldCount } = etchHeroRGBA(bmp, '#000000');
    expect(heldCount).toBeGreaterThan(0);
    // Every opaque (dot) pixel is byte-identical to the base — the wash only lands
    // on held paper, so the exported dot pattern is never altered.
    for (let j = 0; j < bmp.bits.length; j++) {
      if (bmp.bits[j] === 1) {
        const i = j * 4;
        expect([data[i], data[i + 1], data[i + 2], data[i + 3]]).toEqual([
          base[i], base[i + 1], base[i + 2], base[i + 3],
        ]);
      }
    }
  });
});
