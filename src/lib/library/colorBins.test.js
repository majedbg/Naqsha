// colorBins (S10, issue #59) — deterministic hex → named colour-bin clustering
// for the Library colour facet. Known hexes → expected bins; achromatic gates
// resolve before hue; boundary hues land on the documented side.

import { describe, it, expect } from 'vitest';
import {
  binColor,
  entryColorBins,
  colorBin,
  COLOR_BINS,
} from './colorBins';

describe('binColor — canonical colours', () => {
  const cases = [
    ['#ff0000', 'red'],
    ['#e07b39', 'orange'],
    ['#ffd700', 'yellow'],
    ['#00c000', 'green'],
    ['#00b3b3', 'teal'],
    ['#1e5fbf', 'blue'],
    ['#8a2be2', 'purple'],
    ['#e0329e', 'pink'],
  ];
  it.each(cases)('%s → %s', (hex, bin) => {
    expect(binColor(hex)).toBe(bin);
  });
});

describe('binColor — achromatic gates run before hue', () => {
  it('pure black → black', () => expect(binColor('#000000')).toBe('black'));
  it('pure white → white', () => expect(binColor('#ffffff')).toBe('white'));
  it('mid gray → gray', () => expect(binColor('#808080')).toBe('gray'));
  it('near-black WITH residual hue → black (does not leak to a colour)', () => {
    // l ≈ 0.06, a red-ish tint — must still be black.
    expect(binColor('#180a0a')).toBe('black');
  });
  it('near-white low-saturation → white', () => {
    expect(binColor('#f7f6f4')).toBe('white');
  });
  it('a pale but SATURATED tint is a colour, not white', () => {
    // very light yellow: high lightness but saturation well above the white cap.
    expect(binColor('#fbf37a')).toBe('yellow');
  });
  it('desaturated non-dark colour → gray', () => {
    expect(binColor('#8a8078')).toBe('gray');
  });
});

describe('binColor — brown carve-out (dark saturated orange/red)', () => {
  it('dark saturated orange → brown', () => {
    expect(binColor('#7a5230')).toBe('brown');
  });
  it('a BRIGHT orange of the same hue stays orange', () => {
    expect(binColor('#e8913f')).toBe('orange');
  });
});

describe('binColor — boundary hues land on the documented side', () => {
  // Half-open bands: orange [15,45), yellow [45,70). Build hexes at exact hues
  // with clearly-chromatic S/L so only the hue seam is under test.
  const atHue = (h) => {
    // HSL h, s=0.7, l=0.5 → hex, so we can probe the exact boundary.
    const s = 0.7;
    const l = 0.5;
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = l - c / 2;
    let rp = 0;
    let gp = 0;
    let bp = 0;
    if (h < 60) [rp, gp, bp] = [c, x, 0];
    else if (h < 120) [rp, gp, bp] = [x, c, 0];
    else if (h < 180) [rp, gp, bp] = [0, c, x];
    else if (h < 240) [rp, gp, bp] = [0, x, c];
    else if (h < 300) [rp, gp, bp] = [x, 0, c];
    else [rp, gp, bp] = [c, 0, x];
    const to = (v) =>
      Math.round((v + m) * 255)
        .toString(16)
        .padStart(2, '0');
    return `#${to(rp)}${to(gp)}${to(bp)}`;
  };
  it('h=16 → orange (just inside the orange band; l high enough to escape brown)', () => {
    expect(binColor(atHue(16))).toBe('orange');
  });
  // The orange|yellow seam is 45 (orange [15,45), yellow [45,70)). Probe just
  // either side — an exact-45 fixture is ambiguous once quantised to 8-bit hex.
  it('h=44 → orange (below the 45 seam)', () => {
    expect(binColor(atHue(44))).toBe('orange');
  });
  it('h=46 → yellow (above the 45 seam)', () => {
    expect(binColor(atHue(46))).toBe('yellow');
  });
  it('h=0 → red', () => expect(binColor(atHue(0))).toBe('red'));
  it('h=350 → red (wrap-around)', () => expect(binColor(atHue(350))).toBe('red'));
});

describe('binColor — defensive', () => {
  it('unparseable hex → null (dropped, never mis-binned)', () => {
    expect(binColor('not-a-color')).toBeNull();
    expect(binColor('#fff')).toBeNull();
    expect(binColor(null)).toBeNull();
    expect(binColor(undefined)).toBeNull();
  });
});

describe('entryColorBins', () => {
  it('maps a palette to its distinct bins, in catalogue order', () => {
    const entity = {
      palette: [
        { hex: '#1e5fbf', coverage: 0.5 }, // blue
        { hex: '#ff0000', coverage: 0.3 }, // red
        { hex: '#2158b8', coverage: 0.2 }, // blue again → deduped
      ],
    };
    // COLOR_BINS order: red before blue.
    expect(entryColorBins(entity)).toEqual(['red', 'blue']);
  });
  it('empty / missing palette → []', () => {
    expect(entryColorBins({ palette: [] })).toEqual([]);
    expect(entryColorBins({})).toEqual([]);
    expect(entryColorBins(null)).toEqual([]);
  });
  it('drops unparseable swatches without crashing', () => {
    expect(entryColorBins({ palette: [{ hex: 'bad' }, { hex: '#00c000' }] })).toEqual(['green']);
  });
});

describe('colorBin lookup', () => {
  it('resolves a known id to its label + swatch', () => {
    expect(colorBin('red')).toMatchObject({ id: 'red', label: 'Red' });
  });
  it('unknown id → null', () => expect(colorBin('chartreuse')).toBeNull());
  it('catalogue has 12 bins', () => expect(COLOR_BINS).toHaveLength(12));
});
