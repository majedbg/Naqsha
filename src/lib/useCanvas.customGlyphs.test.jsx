// @vitest-environment jsdom
// WI-3 — useCanvas glyph-resolution seam. useCanvas resolves each motif layer's
// `glyphRef` against the built-in library AND the document custom-glyph store
// (13th positional arg), injecting the resolved glyph object into renderParams so
// MotifPattern (and the export path that reuses its baked svgElements) renders it
// without knowing about the store. Proven at the REAL render level:
//   1. a motif referencing a CUSTOM glyph resolves + places (svgElements > 0);
//   2. a motif referencing a MISSING glyph degrades gracefully (no crash, no
//      geometry) — the "shared doc with a stripped glyph" failure mode;
//   3. a BUILT-IN glyph still resolves unchanged with a custom map present.

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

const W = 800;
const H = 600;

// A GRID host: semantic 'crossing' anchors derive purely from its params (no live
// draw geometry needed), so placements are deterministic and z-order-independent.
const gridHost = {
  id: 'gh', name: 'Grid', type: 'pattern', patternType: 'grid',
  visible: true, opacity: 100, bgOpacity: 0, color: '#000000', seed: 3,
  params: { cols: 4, rows: 4, spacing: 60, margin: 20 },
};

function motifWith(glyphRef) {
  return {
    id: 'mo', name: 'Motif', type: 'motif', patternType: 'motif',
    visible: true, opacity: 100, bgOpacity: 0, color: '#123456', seed: 7,
    params: {
      glyphRef,
      hostLayerId: 'gh',
      anchorMode: 'semantic',
      binding: { selection: { roles: ['crossing'] } },
    },
  };
}

// A custom glyph absent from MOTIF_GLYPHS — its presence in svgElements proves the
// custom-store resolution path was taken (not a built-in lookup).
const CUSTOM_GLYPHS = {
  'cg-1': {
    id: 'cg-1', name: 'Imported',
    paths: [{ d: 'M0,-4 L4,0 L0,4 L-4,0 Z', closed: true }],
    viewRadius: 4, root: { x: 0, y: 0, angle: 0 },
  },
};

function harness(layers, customGlyphs) {
  return renderHook(
    ({ layers, customGlyphs }) => {
      const ref = useRef(document.createElement('div'));
      return useCanvas(ref, layers, W, H, '#fff', {}, null, null, [], null, null, [], customGlyphs);
    },
    { initialProps: { layers, customGlyphs } }
  );
}

describe('useCanvas — custom-glyph resolution seam (WI-3)', () => {
  it('a motif referencing a CUSTOM glyph resolves it from the store and places geometry', async () => {
    const { result } = harness([gridHost, motifWith('cg-1')], CUSTOM_GLYPHS);
    await waitFor(() => expect(result.current.patternInstances.mo).toBeTruthy());
    await waitFor(() => {
      const els = result.current.patternInstances.mo.svgElements;
      expect(els.length).toBeGreaterThan(0);
      // The custom glyph's verbatim path reached the baked SVG instances.
      expect(els.every((el) => el.includes('M0,-4 L4,0 L0,4 L-4,0 Z'))).toBe(true);
    });
  });

  it('a motif referencing a MISSING glyph degrades gracefully — no crash, no geometry', async () => {
    // Custom glyph stripped (empty store) + not a built-in id → renders nothing.
    const { result } = harness([gridHost, motifWith('cg-gone')], {});
    await waitFor(() => expect(result.current.patternInstances.mo).toBeTruthy());
    // The instance exists but resolved to zero geometry (the stripped-glyph mode).
    expect(result.current.patternInstances.mo.svgElements).toEqual([]);
  });

  it('a BUILT-IN glyph still resolves unchanged with a custom map present', async () => {
    const { result } = harness([gridHost, motifWith('leaf')], CUSTOM_GLYPHS);
    await waitFor(() => expect(result.current.patternInstances.mo).toBeTruthy());
    await waitFor(() => {
      const els = result.current.patternInstances.mo.svgElements;
      expect(els.length).toBeGreaterThan(0);
      // The built-in leaf path — NOT the custom one — rendered.
      expect(els.every((el) => el.includes('M0,-10'))).toBe(true);
    });
  });
});
