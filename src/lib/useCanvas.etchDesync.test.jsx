// Verification-integrity test for the surfaced-bitmap sync (Raster Etch S9, #88
// review fix). The canvas draw + svgExport read the resolved bitmap from
// etchBitmapCacheRef; the 1:1 preview hero reads the separate `etchBitmaps`
// STATE. Those two stores MUST never disagree in a way that lets the hero show a
// pattern that will NOT actually etch. This drives the real useCanvas resolve
// effect through a FAILED / null re-resolve of a previously-surfaced Etch and
// asserts the surfaced state drops to null in lockstep with the cache going
// empty — so the hero falls back to its placeholder, never stale phantom dots.

// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';

const KNOWN_BITMAP = { bits: Uint8Array.from([1, 0, 1, 0]), width: 2, height: 2 };

// p5 stub (mirrors useCanvas.etch.test.jsx) — enough surface for the etch draw
// branch without real DOM/WebGL.
vi.mock('p5', () => ({
  default: class {
    constructor(sketch) { this._sketch = sketch; sketch?.(this); this.setup?.(); }
    createCanvas() {} pixelDensity() {} noLoop() {} clear() {} background() {}
    color() { return { setAlpha() {} }; }
    createImage(w, h) { return { loadPixels() {}, pixels: new Uint8ClampedArray(w * h * 4), updatePixels() {} }; }
    image() {} noSmooth() {} push() {} pop() {} translate() {} rotate() {} scale() {} radians(v) { return v; }
    resizeCanvas() {} remove() {}
    get width() { return 200; } get height() { return 200; }
    TWO_PI = Math.PI * 2; PI = Math.PI; HALF_PI = Math.PI / 2;
    CLOSE = 'close'; CENTER = 'center'; ROUND = 'round';
  },
}));

// Resolve seam — behaviour is driven per-test via the mock fn below. Keep
// etchCacheNeedsResolve real so the effect's liveness/signature logic runs.
vi.mock('./etch/etchSource.js', async (importActual) => {
  const actual = await importActual();
  return { ...actual, resolveEtchBitmap: vi.fn(async () => KNOWN_BITMAP) };
});

import { renderHook, waitFor } from '@testing-library/react';
import { useRef } from 'react';
import useCanvas from './useCanvas.js';
import { resolveEtchBitmap } from './etch/etchSource.js';

function etchLayer(dpi) {
  return {
    id: 'etch-1', name: 'Etch 1', type: 'etch', patternType: 'etch',
    visible: true, opacity: 100, bgOpacity: 0, color: '#000000',
    seed: 0, operationId: 'op-engrave',
    params: { source: 'data:image/png;base64,AAAA', sourceWidth: 2, sourceHeight: 2, dpi },
  };
}

function harness(initialLayers) {
  return renderHook(
    ({ layers }) => {
      const ref = useRef(document.createElement('div'));
      return useCanvas(ref, layers, 200, 200, '#fff');
    },
    { initialProps: { layers: initialLayers } }
  );
}

beforeEach(() => {
  resolveEtchBitmap.mockReset();
});

describe('useCanvas — surfaced etchBitmaps never outlives the exported buffer (#88 review fix)', () => {
  it('drops the surfaced bitmap to null when a re-resolve THROWS (no phantom dots)', async () => {
    // First resolve succeeds (dpi 254); a re-resolve at dpi 999 throws (decode/
    // resample/worker failure) — the cache goes empty, so the hero must too.
    resolveEtchBitmap.mockImplementation(async (layer) => {
      if (layer.params.dpi === 999) throw new Error('decode failure');
      return KNOWN_BITMAP;
    });

    const { result, rerender } = harness([etchLayer(254)]);
    await waitFor(() => expect(result.current.etchBitmaps['etch-1']).toBe(KNOWN_BITMAP));

    rerender({ layers: [etchLayer(999)] });
    await waitFor(() => expect(result.current.etchBitmaps['etch-1']).toBeNull());
  });

  it('drops the surfaced bitmap to null when a re-resolve yields null', async () => {
    resolveEtchBitmap.mockImplementation(async (layer) => {
      if (layer.params.dpi === 998) return null;
      return KNOWN_BITMAP;
    });

    const { result, rerender } = harness([etchLayer(254)]);
    await waitFor(() => expect(result.current.etchBitmaps['etch-1']).toBe(KNOWN_BITMAP));

    rerender({ layers: [etchLayer(998)] });
    await waitFor(() => expect(result.current.etchBitmaps['etch-1']).toBeNull());
  });

  it('clears the surfaced bitmap when the Etch layer is removed (prune)', async () => {
    resolveEtchBitmap.mockImplementation(async () => KNOWN_BITMAP);

    const { result, rerender } = harness([etchLayer(254)]);
    await waitFor(() => expect(result.current.etchBitmaps['etch-1']).toBe(KNOWN_BITMAP));

    rerender({ layers: [] });
    await waitFor(() => expect(result.current.etchBitmaps['etch-1']).toBeUndefined());
  });
});
