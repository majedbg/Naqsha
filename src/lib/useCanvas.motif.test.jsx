// useCanvas motif host-geometry INTEGRATION test — the render-level fail-first
// guard for the Voronoi seam order-independence fix.
//
// WHY THIS EXISTS: the pure `collectMotifHostGeometry` helper is a two-pass and is
// therefore STRUCTURALLY incapable of the ordering bug — a helper-only test can't
// discriminate the defect, which lived in the harvest-vs-resolve INTERLEAVING
// inside useCanvas (the original 767f6ce harvest ran in the reverse-order render
// loop, so a motif appended AFTER its host resolved its host-params BEFORE the
// host generated → empty drawnCells → zero placements). This test drives the REAL
// useCanvas render with the REAL VoronoiCells host + REAL MotifPattern and asserts
// the motif gets placements in the DEFAULT "+ Add Motif" APPEND order
// (`[host, motif]`). It goes RED if the pre-pass is removed / reverted to the
// in-loop harvest — verified by sabotage during the fix.

// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { vi } from 'vitest';

// A headless p5 stub rich enough for the P5Adapter members VoronoiCells and
// MotifPattern touch: random/randomSeed (delegated even in no-draw), color
// (returns a setAlpha stub), plus no-op transform/style/draw + the constants and
// width/height getters useCanvas reads. jitter:0 on the host makes the (constant)
// random value irrelevant to the computed cells, so geometry is deterministic.
vi.mock('p5', () => ({
  default: class {
    constructor(sketch) { this._sketch = sketch; sketch?.(this); this.setup?.(); }
    createCanvas() {} pixelDensity() {} noLoop() {} clear() {} background() {}
    resizeCanvas() {} remove() {}
    randomSeed() {} noiseSeed() {} random() { return 0.5; } noise() { return 0.5; }
    color() { return { setAlpha() {}, _rgb: [0, 0, 0] }; }
    red() { return 0; } green() { return 0; } blue() { return 0; }
    map(v, a, b, c, d) { return c + ((v - a) / (b - a)) * (d - c); }
    push() {} pop() {} translate() {} rotate() {} scale() {}
    fill() {} noFill() {} stroke() {} noStroke() {} strokeWeight() {} strokeCap() {}
    rect() {} rectMode() {} circle() {} line() {} triangle() {} ellipse() {}
    beginShape() {} vertex() {} bezierVertex() {} endShape() {}
    radians(d) { return d; }
    get width() { return 800; } get height() { return 600; }
    TWO_PI = Math.PI * 2; PI = Math.PI; HALF_PI = Math.PI / 2;
    CLOSE = 'close'; CENTER = 'center'; ROUND = 'round';
  },
}));

import { renderHook, waitFor } from '@testing-library/react';
import { useRef } from 'react';
import useCanvas from './useCanvas.js';

const W = 800;
const H = 600;

const voronoiHost = {
  id: 'vh', name: 'Voronoi', type: 'pattern', patternType: 'voronoi',
  visible: true, opacity: 100, bgOpacity: 0, color: '#000000', seed: 42,
  // jitter:0 + relaxationSteps:0 → sites on an exact grid → deterministic cells,
  // independent of the stub's constant random(); interior cells share vertices.
  params: { cellCount: 12, jitter: 0, relaxationSteps: 0, symmetry: 'none' },
};

const motif = {
  id: 'mo', name: 'Leaf on Voronoi', type: 'motif', patternType: 'motif',
  visible: true, opacity: 100, bgOpacity: 0, color: '#123456', seed: 7,
  params: {
    glyphRef: 'leaf',
    hostLayerId: 'vh',
    anchorMode: 'semantic',
    // 'cell' role = center of every Voronoi polygon → one anchor per cell,
    // always inside the canvas → robust, guaranteed placements when drawnCells
    // are threaded (and exactly [] when they are not — the defect signature).
    binding: { selection: { roles: ['cell'] } },
  },
};

function harness(layers) {
  return renderHook(
    ({ layers }) => {
      const ref = useRef(document.createElement('div'));
      return useCanvas(ref, layers, W, H, '#fff', {}, null, null, [], null, null, []);
    },
    { initialProps: { layers } }
  );
}

describe('useCanvas — Voronoi motif placement is order-independent (seam fix)', () => {
  it('a motif APPENDED after its Voronoi host (default add order) still gets placements', async () => {
    // `[host, motif]`: motif LAST in the array → FIRST in the reverse-order render
    // loop. The order-independent pre-pass harvests the host geometry BEFORE the
    // loop, so the motif resolves drawnCells regardless. This is the exact case
    // that rendered NOTHING under the old in-loop harvest.
    const { result } = harness([voronoiHost, motif]);
    await waitFor(() => {
      expect(result.current.patternInstances.mo).toBeTruthy();
    });
    await waitFor(() => {
      expect(result.current.patternInstances.mo.svgElements.length).toBeGreaterThan(0);
    });
  });

  it('a motif placed BEFORE its Voronoi host in the array also gets placements', async () => {
    const { result } = harness([motif, voronoiHost]);
    await waitFor(() => {
      expect(result.current.patternInstances.mo).toBeTruthy();
    });
    await waitFor(() => {
      expect(result.current.patternInstances.mo.svgElements.length).toBeGreaterThan(0);
    });
  });
});
