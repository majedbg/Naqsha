// WI-4 Naqsha Panels: effective visibility wired into useCanvas. A layer whose
// PANEL is hidden must take the SAME no-draw path as a `visible:false` layer —
// without mutating `layer.visible`. With no panels (the plotter/dragCutter
// degrade case) behaviour is byte-identical to today: only `layer.visible`
// governs.
//
// Detection mechanism (spec-sanctioned): we register a tiny test PatternClass
// whose generate() records the `_draw` flag of the DrawingContext it received.
// useCanvas passes the draw-mode adapter (draw:true) for a layer it paints and
// the no-draw adapter (draw:false) for a layer it skips — so the recorded flag
// distinguishes draw from no-draw exactly the way the production code branches.

// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// p5 touches the real DOM/WebGL; stub it so useCanvas's render loop runs
// headlessly. The VISIBLE branch calls p.push()/p.pop() (and may translate)
// directly on the instance, so the mock must stub those — otherwise a visible
// layer crashes before reaching our assertion.
vi.mock('p5', () => ({
  default: class {
    constructor(sketch) { this._sketch = sketch; sketch?.(this); this.setup?.(); }
    createCanvas() {} pixelDensity() {} noLoop() {} clear() {} background() {}
    color() { return { setAlpha() {} }; }
    resizeCanvas() {} remove() {}
    push() {} pop() {} translate() {} rotate() {} scale() {}
    fill() {} noFill() {} stroke() {} noStroke() {} strokeWeight() {}
    rect() {} rectMode() {} circle() {} line() {} radians(d) { return d; }
    get width() { return 384; } get height() { return 384; }
    TWO_PI = Math.PI * 2; PI = Math.PI; HALF_PI = Math.PI / 2;
    CLOSE = 'close'; CENTER = 'center'; ROUND = 'round';
  },
}));

import { renderHook, waitFor } from '@testing-library/react';
import { useRef } from 'react';
import useCanvas from './useCanvas.js';
import { Pattern } from './patterns/drawingContext.js';
import { registerPattern, unregisterPattern } from './patternRegistry.js';

const TEST_PATTERN_ID = 'wi4-draw-probe';

// Records the draw flag of the ctx it last received. No real drawing — its only
// job is to report whether useCanvas handed it the draw or no-draw adapter.
class DrawProbe extends Pattern {
  generate(ctx) {
    DrawProbe.lastReceivedDraw = ctx._draw;
    DrawProbe.generateCount += 1;
  }
}
DrawProbe.lastReceivedDraw = undefined;
DrawProbe.generateCount = 0;

const probeLayer = (overrides = {}) => ({
  id: 'probe-1', name: 'Probe', type: 'pattern', patternType: TEST_PATTERN_ID,
  visible: true, opacity: 100, bgOpacity: 0, color: '#123456',
  seed: 0, params: {}, ...overrides,
});

// panels is the 12th positional arg; pass the 11 args before it explicitly.
function harness(layers, panels) {
  return renderHook(
    ({ layers, panels }) => {
      const ref = useRef(document.createElement('div'));
      return useCanvas(ref, layers, 384, 384, '#fff', {}, null, null, [], null, null, panels);
    },
    { initialProps: { layers, panels } }
  );
}

beforeEach(() => {
  DrawProbe.lastReceivedDraw = undefined;
  DrawProbe.generateCount = 0;
  registerPattern(TEST_PATTERN_ID, DrawProbe, 'WI4 Draw Probe', {}, [], { isAI: false });
});

afterEach(() => {
  unregisterPattern(TEST_PATTERN_ID);
});

describe('useCanvas — effective visibility via panels', () => {
  it('a visible layer whose panel is HIDDEN takes the no-draw path (and layer.visible is NOT mutated)', async () => {
    const layer = probeLayer({ panelId: 'p1', visible: true });
    const panels = [{ id: 'p1', visible: false }];
    const { result } = harness([layer], panels);

    await waitFor(() => {
      expect(result.current.patternInstances['probe-1']).toBeTruthy();
    });
    await waitFor(() => {
      expect(DrawProbe.lastReceivedDraw).toBe(false); // no-draw adapter
    });
    // layer.visible itself is never mutated.
    expect(layer.visible).toBe(true);
  });

  it('setting that panel back to VISIBLE makes the layer draw again', async () => {
    const layer = probeLayer({ panelId: 'p1', visible: true });
    const { result, rerender } = harness([layer], [{ id: 'p1', visible: false }]);

    await waitFor(() => {
      expect(DrawProbe.lastReceivedDraw).toBe(false);
    });

    // New panels array identity (panel now visible) → renderAll re-fires.
    rerender({ layers: [layer], panels: [{ id: 'p1', visible: true }] });

    await waitFor(() => {
      expect(DrawProbe.lastReceivedDraw).toBe(true); // draw adapter
    });
    expect(result.current.patternInstances['probe-1']).toBeTruthy();
  });

  it('no-panels path: a VISIBLE layer draws (panels omitted/[])', async () => {
    const layer = probeLayer({ panelId: 'p1', visible: true });
    harness([layer], []);

    await waitFor(() => {
      expect(DrawProbe.lastReceivedDraw).toBe(true);
    });
  });

  it('no-panels path: a visible:false layer takes the no-draw path', async () => {
    const layer = probeLayer({ panelId: 'p1', visible: false });
    harness([layer], []);

    await waitFor(() => {
      expect(DrawProbe.lastReceivedDraw).toBe(false);
    });
  });

  it('dangling panelId with empty panels degrades to layer.visible (draws)', async () => {
    const layer = probeLayer({ panelId: 'ghost', visible: true });
    harness([layer], []);

    await waitFor(() => {
      expect(DrawProbe.lastReceivedDraw).toBe(true);
    });
  });
});
