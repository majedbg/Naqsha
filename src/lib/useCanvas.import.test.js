// Seam test (issue #12): an imported-path layer must get a synthetic instance in
// the patternInstances map so it renders on canvas AND exports via
// buildAllLayersSVG. useCanvas rebuilds the map every render from layer data;
// this verifies it handles `type:'import'` (which has no PatternClass).

// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';

// p5 touches the real DOM/WebGL; stub it to a no-op so useCanvas's render loop
// runs headlessly. We only care that the import branch builds an instance.
vi.mock('p5', () => ({
  default: class {
    constructor(sketch) { this._sketch = sketch; sketch?.(this); this.setup?.(); }
    createCanvas() {} pixelDensity() {} noLoop() {} clear() {} background() {}
    color() { return { setAlpha() {} }; }
    resizeCanvas() {} remove() {}
    get width() { return 384; } get height() { return 384; }
    TWO_PI = Math.PI * 2; PI = Math.PI; HALF_PI = Math.PI / 2;
    CLOSE = 'close'; CENTER = 'center'; ROUND = 'round';
  },
}));

import { renderHook, waitFor } from '@testing-library/react';
import { useRef } from 'react';
import useCanvas from './useCanvas.js';

function harness(layers) {
  return renderHook(() => {
    const ref = useRef(document.createElement('div'));
    return useCanvas(ref, layers, 384, 384, '#fff');
  });
}

describe('useCanvas builds a synthetic instance for imported layers', () => {
  it('registers an ImportedPath-style instance (with toSVGGroup) for type:import', async () => {
    const layers = [
      {
        // visible:false exercises the no-draw context (draw calls are no-ops,
        // RNG/color still delegate) — the instance is still built and generated
        // for export, which is exactly what the export seam needs.
        id: 'imp-1', name: 'Imported', type: 'import', patternType: 'import',
        visible: false, opacity: 100, bgOpacity: 0, color: '#123456',
        seed: 0, params: { pathData: ['M10,10 L90,90 Z'] }, operationId: 'op-cut',
      },
    ];
    const { result } = harness(layers);

    await waitFor(() => {
      expect(result.current.patternInstances['imp-1']).toBeTruthy();
    });

    const inst = result.current.patternInstances['imp-1'];
    expect(typeof inst.toSVGGroup).toBe('function');
    expect(inst.toSVGGroup('imp-1', '#FF0000', 100)).toContain('d="M10,10 L90,90 Z"');
  });
});
