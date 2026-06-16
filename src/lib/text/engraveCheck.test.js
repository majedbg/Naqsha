import { describe, it, expect } from 'vitest';
import { textEngraveWarnings, MIN_CAP_HEIGHT_MM } from './engraveCheck.js';
import { loadWorkSans } from '../../test/loadWorkSans.js';

const font = loadWorkSans();

function node(overrides = {}) {
  return {
    text: 'Hi', fontSize: 48, lineMode: 'single', box: { w: 0, h: 0 },
    renderMode: 'fill', ...overrides,
  };
}

describe('textEngraveWarnings', () => {
  it('returns no warnings for comfortably large text', () => {
    expect(textEngraveWarnings(node({ fontSize: 200 }), font)).toEqual([]);
  });

  it('warns that the text is too small to engrave cleanly when cap-height is below the floor', () => {
    // ~4px font → cap-height ≈ 4*0.7/3.78 ≈ 0.74mm, well under the 1.5mm floor.
    const warnings = textEngraveWarnings(node({ fontSize: 4 }), font);
    expect(warnings.length).toBe(1);
    expect(warnings[0].code).toBe('min-size');
    expect(warnings[0].level).toBe('warn');
    expect(warnings[0].message).toMatch(/mm/);
  });

  it('uses the EFFECTIVE size — a single line shrunk by the width-fit cap can trip the warning', () => {
    // Big stored size, but a tiny area-box width shrinks the line below the floor.
    const shrunk = node({ text: 'WIDEWIDEWIDEWIDE', fontSize: 300, lineMode: 'single', box: { w: 10, h: 300 } });
    const warnings = textEngraveWarnings(shrunk, font);
    expect(warnings.some((w) => w.code === 'min-size')).toBe(true);
  });

  it('returns no warnings without a font or text (cannot measure)', () => {
    expect(textEngraveWarnings(node(), null)).toEqual([]);
    expect(textEngraveWarnings(node({ text: '' }), font)).toEqual([]);
  });

  it('respects a custom minCapHeightMm threshold', () => {
    // At fontSize 48 (~8.9mm cap) a 12mm floor should warn; the default would not.
    expect(textEngraveWarnings(node({ fontSize: 48 }), font)).toEqual([]);
    const strict = textEngraveWarnings(node({ fontSize: 48 }), font, { minCapHeightMm: 12 });
    expect(strict.some((w) => w.code === 'min-size')).toBe(true);
  });

  it('exposes the default floor constant', () => {
    expect(typeof MIN_CAP_HEIGHT_MM).toBe('number');
    expect(MIN_CAP_HEIGHT_MM).toBeGreaterThan(0);
  });
});
