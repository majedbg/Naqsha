// @vitest-environment jsdom
// ADR 0008 regression — the ZONED sequence Block must survive the useCanvas
// glyph-resolution seam.
//
// WHY THIS EXISTS: the zoned Vine was proven headless (sequencer.test.js deals
// zones, chain.e2e.test.js runs chain→dealSlots→MotifPattern), but the `glyphs`
// MAP that MotifPattern stamps from is assembled ONLY in useCanvas, and every
// pre-existing useCanvas test used legacy `binding.selection` — so no test ever
// pushed a zoned block through this seam. The seam walked `block.slots`
// unguarded, and a zoned block carries `zones` and NO flat `slots`: the loop
// threw `block.slots is not iterable` BEFORE the per-layer try/catch (which
// starts well below it), aborting the whole `renderAll` after p.clear() +
// p.background() had already run — the live "clicking Vine blanks the entire
// canvas" report.
//
// The test drives the REAL chip through the REAL render, and asserts LEAF
// geometry lands in svgElements. That single assertion discriminates all three
// states: pre-fix it throws (no instances at all), a merely DEFENSIVE guard
// would un-blank the canvas but leave `leaf` out of the map (zero geometry),
// and only reading the zones' slots gets leaves stamped.

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

import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useRef } from 'react';
import useCanvas from './useCanvas.js';
import { STARTER_CHIPS } from './motif/starterChips.js';

const W = 800;
const H = 600;

// A GRID host: semantic 'crossing' anchors derive purely from its params (no live
// draw geometry needed), so placements are deterministic and z-order-independent.
// Grid emits no `tip`, so every survivor partitions into STEM — which is exactly
// the zone whose slots the broken seam never read.
const gridHost = {
  id: 'gh', name: 'Grid', type: 'pattern', patternType: 'grid',
  visible: true, opacity: 100, bgOpacity: 0, color: '#000000', seed: 3,
  params: { cols: 4, rows: 4, spacing: 60, margin: 20 },
};

// Built from the REAL chip factory (not a hand-copied literal) so this test can
// never drift from the chain the Vine button actually creates.
function vineMotif() {
  const built = STARTER_CHIPS.find((c) => c.id === 'vine').build('grid');
  return {
    id: 'mo', name: 'Vine', type: 'motif', patternType: 'motif',
    visible: true, opacity: 100, bgOpacity: 0, color: '#123456', seed: 7,
    params: { ...built, hostLayerId: 'gh' },
  };
}

function harness(layers) {
  return renderHook(
    ({ layers }) => {
      const ref = useRef(document.createElement('div'));
      return useCanvas(ref, layers, W, H, '#fff', {}, null, null, [], null, null, [], {});
    },
    { initialProps: { layers } }
  );
}

describe('useCanvas — ZONED sequence Block at the glyph-resolution seam (ADR 0008)', () => {
  it('the Vine chip renders: the frame completes AND the Stem zone’s leaf reaches svgElements', async () => {
    const { result } = harness([gridHost, vineMotif()]);
    // The motif renders FIRST in the reverse-order loop, so a throw in its glyph
    // resolution takes the HOST down with it — the host instance existing is the
    // "canvas is not blank" assertion.
    await waitFor(() => expect(result.current.patternInstances.gh).toBeTruthy());
    await waitFor(() => {
      const els = result.current.patternInstances.mo.svgElements;
      expect(els.length).toBeGreaterThan(0);
      // 'M0,0 L6,-6' is the base-at-origin leaf's distinctive opening (glyphs.js).
      // A slot glyph that never made it into the injected map would be skipped,
      // so its presence proves the ZONE's slots were collected.
      expect(els.some((el) => el.includes('M0,0 L6,-6'))).toBe(true);
    });
  });
});
