// Render-seam test for the Etch WYSIWYG single-source invariant (FIX 5,
// strengthening etchInvariant.test.js). etchInvariant proves the two pure
// functions share a buffer; THIS drives the real useCanvas render loop and
// asserts the object handed to the CANVAS DRAW (bitmapToRGBA) is the SAME
// etchBitmap object registered in patternInstances for EXPORT. A future
// divergence at that seam (e.g. the draw path cloning or recomputing) fails red.

// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';

// The single-source bitmap the mocked worker/decode seam resolves to. Both the
// draw and the export registration must reference THIS exact object.
const KNOWN_BITMAP = { bits: Uint8Array.from([1, 0, 1, 0]), width: 2, height: 2 };

// p5 stub: no real DOM/WebGL, but enough surface for the etch draw branch
// (createImage/loadPixels/pixels/updatePixels/noSmooth/image + push/pop).
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

// Decode/resample/worker seam → resolve the KNOWN bitmap synchronously (no
// canvas/Image needed). Keep etchCacheNeedsResolve real so the effect's liveness
// logic is exercised, not stubbed.
vi.mock('./etch/etchSource.js', async (importActual) => {
  const actual = await importActual();
  return { ...actual, resolveEtchBitmap: vi.fn(async () => KNOWN_BITMAP) };
});

// Spy on the canvas materialization to capture the bitmap the DRAW path uses.
const drawArgs = [];
vi.mock('./etch/etchBitmap.js', async (importActual) => {
  const actual = await importActual();
  return {
    ...actual,
    bitmapToRGBA: vi.fn((bitmap, color) => {
      drawArgs.push(bitmap);
      return actual.bitmapToRGBA(bitmap, color);
    }),
  };
});

import { renderHook, waitFor } from '@testing-library/react';
import { useRef } from 'react';
import useCanvas from './useCanvas.js';

function harness(layers) {
  return renderHook(() => {
    const ref = useRef(document.createElement('div'));
    return useCanvas(ref, layers, 200, 200, '#fff');
  });
}

describe('useCanvas Etch render seam — draw buffer === exported buffer (single-source)', () => {
  it('registers the SAME etchBitmap object it draws with', async () => {
    const layers = [
      {
        id: 'etch-1', name: 'Etch 1', type: 'etch', patternType: 'etch',
        visible: true, opacity: 100, bgOpacity: 0, color: '#000000',
        seed: 0, operationId: 'op-engrave',
        params: { source: 'data:image/png;base64,AAAA', sourceWidth: 2, sourceHeight: 2, dpi: 254 },
      },
    ];
    const { result } = harness(layers);

    // The export instance appears once the async bitmap resolves and repaints.
    await waitFor(() => {
      expect(result.current.patternInstances['etch-1']?.etchBitmap).toBeTruthy();
    });

    const instance = result.current.patternInstances['etch-1'];
    // Export seam: the registered instance carries the resolved single-source buffer.
    expect(instance.supportsEtchExport).toBe(true);
    expect(instance.etchBitmap).toBe(KNOWN_BITMAP);

    // Draw seam: the canvas materialization was called with that SAME object.
    expect(drawArgs.length).toBeGreaterThan(0);
    expect(drawArgs[drawArgs.length - 1]).toBe(KNOWN_BITMAP);
    // Structural identity: draw buffer === export buffer.
    expect(drawArgs[drawArgs.length - 1]).toBe(instance.etchBitmap);
  });
});
