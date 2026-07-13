import { describe, it, expect } from 'vitest';
import {
  ETCH_TYPE,
  DEFAULT_ETCH_DPI,
  isEtchLayer,
  etchPixelDims,
  createEtchParams,
} from './etchLayer.js';
import { migrateConfig } from '../migration.js';

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
  it('carries the source data-URI, its size, and defaults DPI to 254 with an empty Etch Stack', () => {
    const params = createEtchParams({ source: 'data:image/png;base64,AAA', sourceWidth: 800, sourceHeight: 600 });
    expect(params).toEqual({
      source: 'data:image/png;base64,AAA',
      sourcePath: null,
      sourceWidth: 800,
      sourceHeight: 600,
      dpi: 254,
      stack: [],
      // Highlight Hold (S4, #83): AUTO by default so the material-aware default
      // resolves at use-time (mirror → on) — not baked at creation.
      hold: { enabled: null, cutoff: 235 },
    });
  });

  it('carries a signed-in sourcePath instead of inline base64 (S7, #86)', () => {
    // The signed-in path: the source lives in the private bucket, the layer holds
    // only the pointer. No `source` data-URI is inlined into the saved design.
    const params = createEtchParams({ sourcePath: 'user-1/src-1/source.jpg', sourceWidth: 4000, sourceHeight: 3000 });
    expect(params.sourcePath).toBe('user-1/src-1/source.jpg');
    expect(params.source).toBeNull();
    expect(params.sourceWidth).toBe(4000);
    expect(params.sourceHeight).toBe(3000);
  });

  it('sourcePath defaults to null (guest layers hold their source inline)', () => {
    expect(createEtchParams({ source: 'x' }).sourcePath).toBeNull();
    expect(createEtchParams().sourcePath).toBeNull();
  });

  it('a new Etch starts with an empty Etch Stack (screens at the plain S1 cut)', () => {
    expect(createEtchParams({ source: 'x' }).stack).toEqual([]);
  });

  it('carries a supplied Etch Stack and its order round-trips through JSON save/load', () => {
    const stack = [
      { id: 'tone-1', type: 'tone', bypassed: false, params: { exposure: 30, brightness: 0, contrast: 0, levels: { blackPoint: 12, whitePoint: 240, gamma: 1.6 } } },
      { id: 'tone-2', type: 'tone', bypassed: true, params: { exposure: 0, brightness: 10, contrast: 5, levels: { blackPoint: 0, whitePoint: 255, gamma: 1 } } },
    ];
    const params = createEtchParams({ source: 'x', stack });
    // Simulate the document save→load boundary: serialize then parse.
    const reloaded = JSON.parse(JSON.stringify(params));
    expect(reloaded.stack).toEqual(stack);
    // Order is document state: the second Stage stays second after round-trip.
    expect(reloaded.stack.map((s) => s.id)).toEqual(['tone-1', 'tone-2']);
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

describe('Etch Stack persistence — order survives the real document load funnel', () => {
  it('migrateConfig preserves a reordered Etch Stack losslessly', () => {
    const stack = [
      { id: 'tone-a', type: 'tone', bypassed: false, params: { exposure: 0, brightness: 0, contrast: 0, levels: { blackPoint: 20, whitePoint: 230, gamma: 1.4 } } },
      { id: 'tone-b', type: 'tone', bypassed: true, params: { exposure: 15, brightness: 0, contrast: 0, levels: { blackPoint: 0, whitePoint: 255, gamma: 1 } } },
    ];
    const layer = {
      id: 'e1', type: ETCH_TYPE, role: 'engrave', operationId: 'op-engrave',
      params: createEtchParams({ source: 'x', stack }),
    };
    const cfg = { schemaVersion: 1, operations: [{ id: 'op-engrave', role: 'engrave' }], layers: [layer] };
    // Round-trip through serialize → migrate (the load boundary spreads ...layer).
    const reloaded = migrateConfig(JSON.parse(JSON.stringify(cfg)));
    const out = reloaded.layers.find((l) => l.id === 'e1');
    expect(out.params.stack).toEqual(stack);
    expect(out.params.stack.map((s) => s.id)).toEqual(['tone-a', 'tone-b']);
  });
});
