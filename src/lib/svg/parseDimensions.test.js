import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parseDimensions, SvgDimensionError } from './parseDimensions.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixture = (name) =>
  readFileSync(join(__dirname, '../../test/fixtures/svg', name), 'utf8');

describe('parseDimensions', () => {
  it('parses explicit mm width/height (tracer)', () => {
    const result = parseDimensions(fixture('units-mm.svg'));
    expect(result.widthMm).toBe(80);
    expect(result.heightMm).toBe(60);
    expect(result.ambiguous).toBe(false);
    expect(result.source).toBe('mm');
  });

  it('converts px to mm at 96dpi', () => {
    const result = parseDimensions(fixture('units-px.svg'));
    // 300 / 96 * 25.4 = 79.375 ; 150 / 96 * 25.4 = 39.6875
    expect(result.widthMm).toBeCloseTo(79.375, 4);
    expect(result.heightMm).toBeCloseTo(39.6875, 4);
    expect(result.ambiguous).toBe(false);
    expect(result.source).toBe('px');
  });

  it('converts pt to mm (Illustrator export)', () => {
    const result = parseDimensions(fixture('illustrator-pt.svg'));
    // 226.772 / 72 * 25.4 = 80.0001 ; 170.079 / 72 * 25.4 = 60.0001
    expect(result.widthMm).toBeCloseTo(80, 3);
    expect(result.heightMm).toBeCloseTo(60, 3);
    expect(result.ambiguous).toBe(false);
    expect(result.source).toBe('pt');
  });

  it('falls back to viewBox as ambiguous (user units = px@96)', () => {
    const result = parseDimensions(fixture('viewbox-only.svg'));
    // viewBox 0 0 120 90, treated as px@96: 120/96*25.4=31.75 ; 90/96*25.4=23.8125
    expect(result.widthMm).toBeCloseTo(31.75, 4);
    expect(result.heightMm).toBeCloseTo(23.8125, 4);
    expect(result.ambiguous).toBe(true);
    expect(result.source).toBe('viewbox');
  });

  it('parses Inkscape mm export despite inkscape namespaces (mm is absolute)', () => {
    const result = parseDimensions(fixture('inkscape-96.svg'));
    // width/height are 100mm — mm is absolute, dpi is irrelevant.
    expect(result.widthMm).toBe(100);
    expect(result.heightMm).toBe(100);
    expect(result.ambiguous).toBe(false);
    expect(result.source).toBe('mm');
  });

  it('uses 90dpi for px units when an old Inkscape (<0.92) authored the file', () => {
    const svg = `<?xml version="1.0"?>
<svg xmlns="http://www.w3.org/2000/svg"
     xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape"
     width="90px" height="180px" viewBox="0 0 90 180"
     inkscape:version="0.91 r13725">
  <rect width="90" height="180"/>
</svg>`;
    // Old Inkscape: 90px @ 90dpi = 25.4mm ; 180px @ 90dpi = 50.8mm
    const result = parseDimensions(svg);
    expect(result.widthMm).toBeCloseTo(25.4, 4);
    expect(result.heightMm).toBeCloseTo(50.8, 4);
    expect(result.source).toBe('px');
  });

  it('uses 96dpi for px units when a modern Inkscape (>=0.92) authored the file', () => {
    const svg = `<?xml version="1.0"?>
<svg xmlns="http://www.w3.org/2000/svg"
     xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape"
     width="96px" height="192px" viewBox="0 0 96 192"
     inkscape:version="1.3 (96dpi)">
  <rect width="96" height="192"/>
</svg>`;
    // Modern Inkscape: 96px @ 96dpi = 25.4mm ; 192px @ 96dpi = 50.8mm
    const result = parseDimensions(svg);
    expect(result.widthMm).toBeCloseTo(25.4, 4);
    expect(result.heightMm).toBeCloseTo(50.8, 4);
    expect(result.source).toBe('px');
  });

  it('throws a typed error when there are no dimensions and no viewBox', () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>`;
    expect(() => parseDimensions(svg)).toThrow(SvgDimensionError);
    try {
      parseDimensions(svg);
    } catch (err) {
      expect(err.code).toBe('NO_DIMENSIONS');
    }
  });

  it('A0: ignores a child element width/height and falls back to viewBox', () => {
    const svg = `<svg viewBox="0 0 24 24"><rect width="10" height="20"/></svg>`;
    // viewBox 24x24 as px@96: 24/96*25.4 = 6.35
    const result = parseDimensions(svg);
    expect(result.widthMm).toBeCloseTo(6.35, 4);
    expect(result.heightMm).toBeCloseTo(6.35, 4);
    expect(result.ambiguous).toBe(true);
    expect(result.source).toBe('viewbox');
  });

  it('A6: reads single-quoted root attributes', () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width='80mm' height='60mm'/>`;
    const result = parseDimensions(svg);
    expect(result.widthMm).toBe(80);
    expect(result.heightMm).toBe(60);
    expect(result.source).toBe('mm');
  });

  it('A1: converts cm to mm (8cm -> 80mm)', () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="8cm" height="6cm"/>`;
    const result = parseDimensions(svg);
    expect(result.widthMm).toBeCloseTo(80, 6);
    expect(result.heightMm).toBeCloseTo(60, 6);
    expect(result.ambiguous).toBe(false);
    expect(result.source).toBe('cm');
  });

  it('A1: converts in to mm (2in -> 50.8mm)', () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="2in" height="1in"/>`;
    const result = parseDimensions(svg);
    expect(result.widthMm).toBeCloseTo(50.8, 6);
    expect(result.heightMm).toBeCloseTo(25.4, 6);
    expect(result.source).toBe('in');
  });

  it('A3: parses scientific notation (3e2px -> 200px)', () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="3e2px" height="150px"/>`;
    const result = parseDimensions(svg);
    // 300 / 96 * 25.4 = 79.375
    expect(result.widthMm).toBeCloseTo(79.375, 4);
    expect(result.heightMm).toBeCloseTo(39.6875, 4);
    expect(result.source).toBe('px');
  });

  it('A2: zero width with a viewBox falls back to viewBox (ambiguous)', () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="0" height="60" viewBox="0 0 24 24"/>`;
    const result = parseDimensions(svg);
    expect(result.widthMm).toBeCloseTo(6.35, 4);
    expect(result.heightMm).toBeCloseTo(6.35, 4);
    expect(result.ambiguous).toBe(true);
    expect(result.source).toBe('viewbox');
  });

  it('A2: negative width with a viewBox falls back to viewBox (ambiguous)', () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="-100" height="60" viewBox="0 0 24 24"/>`;
    const result = parseDimensions(svg);
    expect(result.widthMm).toBeCloseTo(6.35, 4);
    expect(result.ambiguous).toBe(true);
    expect(result.source).toBe('viewbox');
  });

  it('A2: percentage width with a good viewBox falls back to viewBox (ambiguous)', () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" viewBox="0 0 24 24"/>`;
    const result = parseDimensions(svg);
    expect(result.widthMm).toBeCloseTo(6.35, 4);
    expect(result.heightMm).toBeCloseTo(6.35, 4);
    expect(result.ambiguous).toBe(true);
    expect(result.source).toBe('viewbox');
  });

  it('A2: non-positive dimension with no viewBox throws a typed error', () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="0" height="60"/>`;
    expect(() => parseDimensions(svg)).toThrow(SvgDimensionError);
    try {
      parseDimensions(svg);
    } catch (err) {
      expect(err.code).toBe('INVALID_DIMENSION');
    }
  });

  it('throws a typed error when a dimension is unparseable garbage', () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="abc" height="60mm" viewBox="0 0 80 60"/>`;
    expect(() => parseDimensions(svg)).toThrow(SvgDimensionError);
    try {
      parseDimensions(svg);
    } catch (err) {
      expect(err.code).toBe('INVALID_DIMENSION');
    }
  });
});
