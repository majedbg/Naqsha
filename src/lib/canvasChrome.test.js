import { describe, it, expect } from 'vitest';
import { cursorToUnit, rulerTicks } from './canvasChrome';
import { PX_PER_MM, PPI } from './units';

// Issue #7 (Lane B / B4): pure px->unit + ruler-tick math, kept out of any
// component so it runs in the default node env (no jsdom). These are the
// load-bearing conversions the status bar's live cursor and the rulers share —
// both must agree with units.js for the cursor to "read correctly against the
// ruler".

describe('cursorToUnit (px screen-space -> real-world unit)', () => {
  // Canvas-local px is the cursor offset from the bed origin, divided by the
  // on-screen scale (fitScale * zoom). At scale=1 the screen offset *is* the
  // canvas px, so the conversion is exactly units.js's pxToUnit.
  it('matches units.js pxToUnit for known points at scale 1 (mm)', () => {
    expect(cursorToUnit(PX_PER_MM, 'mm', 1)).toBeCloseTo(1, 6);
    expect(cursorToUnit(2 * PX_PER_MM, 'mm', 1)).toBeCloseTo(2, 6);
    expect(cursorToUnit(10 * PX_PER_MM, 'mm', 1)).toBeCloseTo(10, 6);
  });

  it('matches units.js pxToUnit for inches at scale 1', () => {
    expect(cursorToUnit(PPI, 'in', 1)).toBeCloseTo(1, 6);
    expect(cursorToUnit(2 * PPI, 'in', 1)).toBeCloseTo(2, 6);
  });

  it('divides the screen offset by scale (zoom) before converting', () => {
    // At zoom 2 a 2mm-wide screen offset covers only 1mm of real bed.
    expect(cursorToUnit(2 * PX_PER_MM, 'mm', 2)).toBeCloseTo(1, 6);
    // At zoom 0.5 a 1mm screen offset covers 2mm of bed.
    expect(cursorToUnit(PX_PER_MM, 'mm', 0.5)).toBeCloseTo(2, 6);
  });

  it('returns raw px when unit is px', () => {
    expect(cursorToUnit(50, 'px', 1)).toBeCloseTo(50, 6);
    expect(cursorToUnit(100, 'px', 2)).toBeCloseTo(50, 6);
  });

  it('guards a zero/invalid scale (no NaN/Infinity leaking to the status bar)', () => {
    expect(Number.isFinite(cursorToUnit(PX_PER_MM, 'mm', 0))).toBe(true);
  });
});

describe('rulerTicks (mm tick positions for a given zoom)', () => {
  // Ticks are returned in *screen* px = value_unit * pxPerUnit * zoom, so a
  // render test can assert positions directly without relying on a CSS scale.
  it('places mm major ticks at 10mm intervals, scaled by zoom=1', () => {
    const { major } = rulerTicks(50 /* mm long */, 'mm', 1);
    const values = major.map((t) => t.value);
    expect(values).toContain(0);
    expect(values).toContain(10);
    expect(values).toContain(50);
    const t10 = major.find((t) => t.value === 10);
    expect(t10.pos).toBeCloseTo(10 * PX_PER_MM * 1, 6);
  });

  it('scales tick screen positions by zoom', () => {
    const { major } = rulerTicks(50, 'mm', 2);
    const t10 = major.find((t) => t.value === 10);
    expect(t10.pos).toBeCloseTo(10 * PX_PER_MM * 2, 6);
  });

  it('emits minor ticks between majors that are not on a major boundary', () => {
    const { minor } = rulerTicks(50, 'mm', 1);
    const values = minor.map((t) => t.value);
    expect(values).toContain(5);
    expect(values).not.toContain(10); // 10 is a major, excluded from minor
  });

  it('uses inch intervals when unit is in', () => {
    const { major } = rulerTicks(3 /* inches */, 'in', 1);
    const values = major.map((t) => t.value);
    expect(values).toContain(1);
    expect(values).toContain(2);
    const t1 = major.find((t) => t.value === 1);
    expect(t1.pos).toBeCloseTo(1 * PPI * 1, 6);
  });
});
