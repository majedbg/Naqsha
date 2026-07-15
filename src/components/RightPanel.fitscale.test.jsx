// @vitest-environment jsdom
//
// Fit-scale hardening (Fix #2). On iOS the dvh flex wrapper can momentarily
// report a 0 client size, making the raw fit math ((0 - padding) / canvasW) go
// NEGATIVE → transform: scale(negative) collapses the canvas with no resize
// event to recover. In jsdom every element's clientWidth/clientHeight is 0, so
// mounting RightPanel exercises exactly that transient-0 path: without the
// clamp the scaled box would carry a negative scale; with it, a positive floor.
// We also verify the ResizeObserver (the recovery mechanism) is wired.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';

// useCanvas is mocked away — this test is about the DOM/layout math only, not
// the p5 render loop (mirrors RightPanel.threed.test.jsx).
vi.mock('../lib/useCanvas', () => ({
  default: () => ({ patternInstances: {}, etchBitmaps: {} }),
}));

const { default: RightPanel } = await import('./RightPanel.jsx');

function baseProps(overrides = {}) {
  return { layers: [], canvasW: 384, canvasH: 384, bgColor: '#ffffff', ...overrides };
}

// Parse the numeric scale() factor out of a transform string like "scale(0.05)"
// or "translate(...) scale(0.05)".
function scaleOf(transform) {
  const m = /scale\(([-\d.eE]+)\)/.exec(transform || '');
  return m ? Number(m[1]) : NaN;
}

describe('RightPanel fit-scale clamp (Fix #2)', () => {
  it('never applies a negative/zero scale when the container measures 0 (jsdom)', () => {
    render(<RightPanel {...baseProps()} />);
    const box = screen.getByTestId('canvas-scaled-box');
    const s = scaleOf(box.style.transform);
    // Clamp floor (MIN_FIT_SCALE) is 0.05; finalScale = fitScale * zoom(1).
    expect(Number.isFinite(s)).toBe(true);
    expect(s).toBeGreaterThan(0);
    expect(s).toBeCloseTo(0.05, 5);
  });

  describe('with a ResizeObserver available', () => {
    let observed;
    let disconnected;
    beforeEach(() => {
      observed = [];
      disconnected = 0;
      globalThis.ResizeObserver = class {
        constructor(cb) { this._cb = cb; }
        observe(el) { observed.push(el); }
        unobserve() {}
        disconnect() { disconnected += 1; }
      };
    });
    afterEach(() => {
      delete globalThis.ResizeObserver;
    });

    it('observes the wrapper and disconnects on unmount', () => {
      const { unmount } = render(<RightPanel {...baseProps()} />);
      expect(observed.length).toBeGreaterThanOrEqual(1);
      unmount();
      expect(disconnected).toBeGreaterThanOrEqual(1);
    });
  });
});
