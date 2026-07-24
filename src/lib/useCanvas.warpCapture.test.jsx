// useCanvas warp-aware CAPTURE probe integration test (ticket #110, Option-A / D1).
//
// The motif capture probe historically injected the guide-resolved warp modulation
// into the probe params ONLY for grid. A warp-modulated flowfield / topographic host
// therefore PAINTED warped geometry (the paint pass injects modulation for every
// pattern) but CAPTURED its motif anchors from the STALE, unwarped probe geometry —
// so motifs landed ~24px off the drawn flow lines / contours (the D1 fail-unsafe
// bug from #103). This drives the REAL useCanvas render with a REAL flowfield /
// topographic host + a REAL chladni warp GUIDE + a REAL edge motif, and asserts the
// motif's surfaced placements MOVE onto the warped geometry. It goes RED if the
// probe injection is scoped back to grid-only — verified by reverting the fix.

// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { vi } from 'vitest';

// A headless p5 stub. Two properties matter for THIS test beyond the usual no-ops:
//   • noise(x,y) is SPATIALLY VARYING (not the flat 0.5 stub some tests use) so
//     TopographicContours extracts real iso-contours and FlowField traces a real
//     flow — otherwise both emit nothing and there are no anchors to move.
//   • random() advances a per-instance LCG reseeded by randomSeed(), so FlowField
//     particles spread out AND a capture probe that reseeds reproduces geometry
//     byte-identically (the same reseed-safety the real p5 gives).
// Warp displacement comes from the chladni ScalarField gradient, independent of
// this noise, so the drift is real regardless of the stub's field shape.
vi.mock('p5', () => ({
  default: class {
    constructor(sketch) {
      this._r = 123456789;
      this._sketch = sketch;
      sketch?.(this);
      this.setup?.();
    }
    createCanvas() {} pixelDensity() {} noLoop() {} clear() {} background() {}
    resizeCanvas() {} remove() {}
    randomSeed(s) { this._r = (s >>> 0) || 1; }
    noiseSeed() {}
    random(a, b) {
      this._r = (this._r * 1664525 + 1013904223) >>> 0;
      const u = this._r / 4294967296;
      if (a === undefined) return u;
      if (b === undefined) return u * a;
      return a + u * (b - a);
    }
    noise(x = 0, y = 0) {
      return Math.min(1, Math.max(0, 0.5 + 0.25 * Math.sin(x * 3.1 + 1) + 0.2 * Math.cos(y * 2.7 + 0.5)));
    }
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

// --- layer fixtures ---------------------------------------------------------
const FLOW_PARAMS = {
  particleCount: 30, stepLength: 6, noiseScale: 0.01, curlStrength: 90,
  patternScale: 1, strokeWeight: 1, symmetry: 'none', startAngle: 0, offsetX: 0, offsetY: 0,
};
const TOPO_PARAMS = {
  levels: 6, noiseScale: 2.5, octaves: 2, warp: 0, levelBias: 0, resolution: 48,
  strokeWeight: 0.6, symmetry: 'none', startAngle: 0, offsetX: 0, offsetY: 0,
};

const host = (patternType, params) => ({
  id: 'host', name: patternType, type: 'pattern', patternType,
  visible: true, opacity: 100, bgOpacity: 0, color: '#000000', seed: 5, params,
});

// An EDGE motif (defaultRolesForHost('flowfield'|'topographic') === ['edge']) — a
// semantic role would place nothing on these hosts (false green).
const motif = () => ({
  id: 'mo', name: 'Leaf', type: 'motif', patternType: 'motif',
  visible: true, opacity: 100, bgOpacity: 0, color: '#123456', seed: 7,
  params: {
    glyphRef: 'leaf', hostLayerId: 'host', anchorMode: 'semantic',
    edgeOpts: { spacing: 24 }, // arc-length sample the flow lines / contours
    binding: { selection: { roles: ['edge'] } },
  },
});

// A chladni GUIDE layer (a real field producer) whose modulator maps `channel`
// onto the host. chladni is not a rendered PatternClass, so it only feeds
// resolveModulationsForTarget — exactly the guide→target warp wiring the paint
// pass and the capture probe both read.
const guide = (channel, amount = 3) => ({
  id: 'guide', name: 'Field', type: 'pattern', patternType: 'chladni',
  visible: true, opacity: 100, bgOpacity: 0, color: '#000000', seed: 1,
  params: { m: 3, n: 2 },
  modulator: { maps: [{ targetLayerId: 'host', channel, amount }] },
});

function harness(layers) {
  return renderHook(
    ({ layers }) => {
      const ref = useRef(document.createElement('div'));
      return useCanvas(ref, layers, W, H, '#fff', {}, null, null, [], null, null, []);
    },
    { initialProps: { layers } }
  );
}

async function placements(layers) {
  const { result } = harness(layers);
  // Generous timeout: a full-canvas flowfield/topographic render + capture prepass
  // can exceed the 1000ms waitFor default under contended parallel workers.
  await waitFor(
    () => {
      expect(result.current.motifPlacements.mo?.length).toBeGreaterThan(0);
    },
    { timeout: 8000 }
  );
  return result.current.motifPlacements.mo.map((p) => ({ x: p.x, y: p.y }));
}

describe.each([
  ['flowfield', FLOW_PARAMS],
  ['topographic', TOPO_PARAMS],
])('useCanvas — warp-aware capture probe for %s host', (patternType, params) => {
  it('a warp guide moves motif anchors onto the warped geometry (D1 fix)', async () => {
    const base = await placements([host(patternType, params), motif()]);
    const warped = await placements([guide('warp'), host(patternType, params), motif()]);
    // Without the probe fix, the prepass captures UNWARPED geometry → the warp
    // guide never reaches the anchors → placements identical to baseline. With the
    // fix the probe injects the same warp the paint pass applies → anchors shift.
    expect(warped).not.toEqual(base);
  });

  it('no warp channel present → anchor output byte-identical (a density guide is a no-op)', async () => {
    // The fix injects the WHOLE composed modulation into the probe. flowfield /
    // topographic branch only on channel==='warp', so a density-only guide must
    // leave captured anchors byte-identical to the no-guide baseline.
    const base = await placements([host(patternType, params), motif()]);
    const withDensity = await placements([guide('density'), host(patternType, params), motif()]);
    expect(withDensity).toEqual(base);
  });
});
