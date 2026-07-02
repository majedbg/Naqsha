// PaletteExtractor tests (S9, issue #58). External behavior over deterministic
// fixtures: a two-tone image must yield two swatches at the expected coverages,
// output must be identical across runs (determinism), and degenerate inputs
// must fail soft.

import { describe, it, expect } from 'vitest';
import { extractPalette, rgbToHex } from './palette';

// Build an ImageData-like buffer (jsdom has no ImageData constructor by
// default, and the extractor only reads {data,width,height}).
function makeImage(width, height, colorAt) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b, a = 255] = colorAt(x, y);
      const i = (y * width + x) * 4;
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = a;
    }
  }
  return { data, width, height };
}

const RED = [255, 0, 0];
const BLUE = [0, 0, 255];

describe('rgbToHex', () => {
  it('formats and clamps to 6-hex', () => {
    expect(rgbToHex(255, 0, 0)).toBe('#ff0000');
    expect(rgbToHex(0, 0, 255)).toBe('#0000ff');
    expect(rgbToHex(300, -5, 15.6)).toBe('#ff0010'); // clamp + round
  });
});

describe('extractPalette', () => {
  it('recovers two dominant colors from a two-tone image at equal coverage', () => {
    // Left half red, right half blue.
    const img = makeImage(20, 20, (x) => (x < 10 ? RED : BLUE));
    const palette = extractPalette(img, { maxColors: 6 });
    expect(palette).toHaveLength(2);
    const hexes = palette.map((p) => p.hex).sort();
    expect(hexes).toEqual(['#0000ff', '#ff0000']);
    palette.forEach((p) => expect(p.coverage).toBeCloseTo(0.5, 5));
  });

  it('recovers an uneven split at the right coverages', () => {
    // 3/4 red, 1/4 blue.
    const img = makeImage(20, 20, (x) => (x < 15 ? RED : BLUE));
    const palette = extractPalette(img, { maxColors: 6 });
    expect(palette).toHaveLength(2);
    expect(palette[0].hex).toBe('#ff0000'); // dominant first
    expect(palette[0].coverage).toBeCloseTo(0.75, 5);
    expect(palette[1].hex).toBe('#0000ff');
    expect(palette[1].coverage).toBeCloseTo(0.25, 5);
  });

  it('collapses a solid image to a single swatch even when more are requested', () => {
    const img = makeImage(16, 16, () => RED);
    const palette = extractPalette(img, { maxColors: 6 });
    expect(palette).toHaveLength(1);
    expect(palette[0].hex).toBe('#ff0000');
    expect(palette[0].coverage).toBeCloseTo(1, 5);
  });

  it('is deterministic across runs (same input → identical output)', () => {
    const colors = [RED, BLUE, [0, 255, 0], [255, 255, 0]];
    const img = makeImage(24, 24, (x, y) => colors[(x + y) % colors.length]);
    const a = extractPalette(img, { maxColors: 4 });
    const b = extractPalette(img, { maxColors: 4 });
    expect(a).toEqual(b);
  });

  it('caps the number of swatches at maxColors', () => {
    const colors = [RED, BLUE, [0, 255, 0], [255, 255, 0], [255, 0, 255], [0, 255, 255]];
    const img = makeImage(24, 24, (x, y) => colors[(x + y) % colors.length]);
    const palette = extractPalette(img, { maxColors: 3 });
    expect(palette.length).toBeLessThanOrEqual(3);
  });

  it('coverage fractions sum to ~1', () => {
    const colors = [RED, BLUE, [0, 255, 0]];
    const img = makeImage(21, 21, (x, y) => colors[(x + y) % colors.length]);
    const palette = extractPalette(img, { maxColors: 6 });
    const sum = palette.reduce((s, p) => s + p.coverage, 0);
    expect(sum).toBeCloseTo(1, 5);
  });

  it('ignores near-transparent pixels', () => {
    // Half red opaque, half blue transparent → blue must not appear.
    const img = makeImage(20, 20, (x) => (x < 10 ? [...RED, 255] : [...BLUE, 0]));
    const palette = extractPalette(img);
    expect(palette).toHaveLength(1);
    expect(palette[0].hex).toBe('#ff0000');
  });

  it('fails soft on empty / missing input', () => {
    expect(extractPalette(null)).toEqual([]);
    expect(extractPalette({ data: new Uint8ClampedArray(0), width: 0, height: 0 })).toEqual([]);
    // fully transparent → nothing to sample
    const clear = makeImage(8, 8, () => [10, 20, 30, 0]);
    expect(extractPalette(clear)).toEqual([]);
  });
});
