// Mobile first-paint race (Fix #1). `new p5(sketch, el)` RETURNS before
// `p.setup` runs, so p5Ref.current can be set while the renderer isn't built
// yet. renderAll must (a) be a no-op — never throw — while the renderer is not
// ready, and (b) fire the first paint the instant setup COMPLETES, without
// depending on the 50ms first-paint timeout (which slow/WebKit devices lose).
//
// The p5 mock defers setup like real p5: the constructor assigns p.setup and
// returns WITHOUT running it (so p5Ref.current is populated), and the test runs
// setup manually via `h.pendingSetup()`. `clear()` THROWS unless createCanvas
// has run (renderer built) — that throw is what turns a guard regression red.

// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const h = vi.hoisted(() => ({ instances: [], pendingSetup: null }));

vi.mock('p5', () => ({
  default: class {
    constructor(sketch) {
      sketch?.(this); // assigns p.setup / p.draw — but does NOT run setup yet
      h.instances.push(this);
      // Defer setup exactly like real p5 (runs on a later frame). The mock
      // constructor returning here lets useCanvas assign p5Ref.current before
      // setup fires — reproducing the race the fix targets.
      h.pendingSetup = () => this.setup?.();
    }
    createCanvas() { this._hasCanvas = true; }
    pixelDensity() {}
    noLoop() {}
    clear() {
      if (!this._hasCanvas) throw new Error('renderer not ready — clear() before setup');
      this.clears = (this.clears || 0) + 1;
    }
    background() {}
    color() { return { setAlpha() {} }; }
    push() {} pop() {} translate() {} rotate() {} scale() {} radians(v) { return v; }
    rect() {} noFill() {} noStroke() {} stroke() {} strokeWeight() {} fill() {} line() {} circle() {} rectMode() {}
    resizeCanvas() {} remove() {}
    get width() { return 200; } get height() { return 200; }
    TWO_PI = Math.PI * 2; PI = Math.PI; HALF_PI = Math.PI / 2;
    CLOSE = 'close'; CENTER = 'center'; CORNER = 'corner'; ROUND = 'round';
  },
}));

import { renderHook } from '@testing-library/react';
import { useRef } from 'react';
import useCanvas from './useCanvas.js';

function harness() {
  return renderHook(() => {
    const ref = useRef(document.createElement('div'));
    return useCanvas(ref, [], 200, 200, '#fff');
  });
}

describe('useCanvas mobile first-paint race (Fix #1)', () => {
  beforeEach(() => {
    h.instances.length = 0;
    h.pendingSetup = null;
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('renderAll is a no-op (does not throw / does not draw) before setup runs', () => {
    harness();
    const p = h.instances[0];
    expect(p).toBeTruthy();
    // Setup has NOT run → renderer not ready → _naqshaReady is unset.
    expect(p._naqshaReady).toBeUndefined();
    // Fire every scheduled first-paint path (50ms init timeout, 150ms debounce,
    // any mount rAF). If the guard were only `if (!p5Ref.current)`, renderAll
    // would reach p.clear() and THROW (renderer not ready). It must bail instead.
    expect(() => vi.runOnlyPendingTimers()).not.toThrow();
    expect(() => vi.advanceTimersByTime(200)).not.toThrow();
    // No draw happened while not ready.
    expect(p.clears).toBeUndefined();
  });

  it('setup completion triggers the first render (independent of the 50ms timeout)', () => {
    harness();
    const p = h.instances[0];
    expect(p.clears).toBeUndefined(); // nothing painted yet
    // Run setup WITHOUT advancing any timer: the setup-completion trigger alone
    // must produce the first paint.
    h.pendingSetup();
    expect(p._naqshaReady).toBe(true);
    expect(p.clears).toBeGreaterThanOrEqual(1);
  });
});
