import { describe, it, expect } from 'vitest';
import {
  ETCH_TYPE,
  DEFAULT_ETCH_DPI,
  isEtchLayer,
  etchPixelDims,
  createEtchParams,
} from './etchLayer.js';

describe('etchLayer — type discriminator', () => {
  it('ETCH_TYPE is the persistent "etch" tag', () => {
    expect(ETCH_TYPE).toBe('etch');
  });

  it('isEtchLayer is true only for type:"etch"', () => {
    expect(isEtchLayer({ type: 'etch' })).toBe(true);
    expect(isEtchLayer({ type: 'import' })).toBe(false);
    expect(isEtchLayer({ type: 'text' })).toBe(false);
    expect(isEtchLayer(null)).toBe(false);
    expect(isEtchLayer(undefined)).toBe(false);
  });
});

describe('etchPixelDims — DPI drives exported bitmap dimensions', () => {
  it('defaults to 254 DPI (10 dots/mm)', () => {
    expect(DEFAULT_ETCH_DPI).toBe(254);
  });

  it('100 mm at 254 DPI → 1000 px', () => {
    expect(etchPixelDims(100, 254)).toBe(1000);
  });

  it('uses DEFAULT_ETCH_DPI when dpi omitted', () => {
    expect(etchPixelDims(100)).toBe(1000);
  });

  it('scales linearly with DPI: doubling DPI doubles pixels', () => {
    expect(etchPixelDims(50, 508)).toBe(etchPixelDims(50, 254) * 2);
  });

  it('rounds to an integer and never drops below 1 for positive input', () => {
    expect(Number.isInteger(etchPixelDims(33.7, 254))).toBe(true);
    expect(etchPixelDims(0.001, 1)).toBe(1);
  });

  it('returns 0 for non-positive extent or DPI', () => {
    expect(etchPixelDims(0, 254)).toBe(0);
    expect(etchPixelDims(100, 0)).toBe(0);
    expect(etchPixelDims(-5, 254)).toBe(0);
  });
});

describe('createEtchParams', () => {
  it('carries the source data-URI, its size, and defaults DPI to 254', () => {
    const params = createEtchParams({ source: 'data:image/png;base64,AAA', sourceWidth: 800, sourceHeight: 600 });
    expect(params).toEqual({
      source: 'data:image/png;base64,AAA',
      sourceWidth: 800,
      sourceHeight: 600,
      dpi: 254,
    });
  });

  it('honors an explicit DPI and falls back to default for invalid DPI', () => {
    expect(createEtchParams({ source: 'x', dpi: 300 }).dpi).toBe(300);
    expect(createEtchParams({ source: 'x', dpi: 0 }).dpi).toBe(254);
    expect(createEtchParams({ source: 'x', dpi: -1 }).dpi).toBe(254);
  });

  it('null source when none supplied', () => {
    expect(createEtchParams().source).toBeNull();
  });
});
