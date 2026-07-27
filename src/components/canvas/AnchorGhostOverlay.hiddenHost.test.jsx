// Hidden-host anchor ghosts (#140) — the INVARIANT these tests lock: a motif's
// per-glyph dots (and therefore the glyph popover) must NOT depend on the host
// layer being visible. "Hide the scaffold, keep the ornament" is a first-class
// workflow, and per-glyph editing has to keep working through it.
//
// Issue #140 claimed the opposite ("hidden host never draws → no
// motifHostGeometry → no dots"), reasoning from a stale comment in
// AnchorGhostOverlay. The investigation (jsdom matrix over every host kind +
// real-browser repro on 2026-07-27) found the claim does NOT hold: useCanvas
// generates hidden layers through the no-draw adapter (useCanvas.js "Still
// generate for SVG export"), which is where voronoi self-stashes its
// motifHostGeometry, and the edge-host prepass probe runs "regardless of
// visibility". So dots render identically either way — for SEMANTIC hosts.
// (EDGE hosts show no override dots even when VISIBLE: the overlay's edge
// branch is the pick-armed path picker by design. Pattern KIND gates the
// affordance; visibility gates nothing.)
//
// These tests drive the REAL useCanvas (real VoronoiCells / FlowField, stubbed
// p5) into the REAL AnchorGhostOverlay, hidden vs visible, and assert the dots
// agree dot-for-dot. They go RED if the hidden/no-draw generate path or the
// visibility-blind prepass is ever "optimized" away — the regression #140
// worried about, now impossible to reintroduce silently.

// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';

// Headless p5 stub — copied from useCanvas.motif.test.jsx (see there for why
// each member exists). Deterministic: constant random + fixed dims.
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

import { renderHook, waitFor, render } from '@testing-library/react';
import { useRef } from 'react';
import useCanvas from '../../lib/useCanvas.js';
import AnchorGhostOverlay from './AnchorGhostOverlay.jsx';

const W = 800;
const H = 600;

// jitter:0 + relaxationSteps:0 → deterministic cells (independent of the
// stub's constant random), same seed for the visible and hidden runs.
const voronoiHost = (visible) => ({
  id: 'vh', name: 'Voronoi', type: 'pattern', patternType: 'voronoi',
  visible, opacity: 100, bgOpacity: 0, color: '#000000', seed: 42,
  params: { cellCount: 12, jitter: 0, relaxationSteps: 0, symmetry: 'none' },
});

const flowHost = (visible) => ({
  id: 'fh', name: 'Flow', type: 'pattern', patternType: 'flowfield',
  visible, opacity: 100, bgOpacity: 0, color: '#000000', seed: 9,
  params: {},
});

const motifOn = (hostId) => ({
  id: 'mo', name: 'Leaf', type: 'motif', patternType: 'motif',
  visible: true, opacity: 100, bgOpacity: 0, color: '#123456', seed: 7,
  params: {
    glyphRef: 'leaf', hostLayerId: hostId, anchorMode: 'semantic',
    binding: { selection: { roles: ['crossing', 'cell'] } },
  },
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

// One (id → "cx,cy") map per overlay render, for dot-for-dot comparison.
async function overlayDots(layers, overlayProps = {}) {
  const { result } = harness(layers);
  await waitFor(() => expect(result.current.patternInstances[layers[0].id]).toBeTruthy());
  const { container } = render(
    <AnchorGhostOverlay
      layers={layers}
      selectedLayerId="mo"
      canvasW={W}
      canvasH={H}
      patternInstances={result.current.patternInstances}
      {...overlayProps}
    />
  );
  const dots = {};
  for (const c of container.querySelectorAll('[data-anchor-id]')) {
    dots[c.getAttribute('data-anchor-id')] =
      `${c.getAttribute('cx')},${c.getAttribute('cy')}:${c.getAttribute('data-state') || ''}`;
  }
  return { dots, instances: result.current.patternInstances, container };
}

describe('AnchorGhostOverlay — hidden host renders the SAME dots as a visible host (#140)', () => {
  it('voronoi: hidden host still stashes motifHostGeometry via the no-draw generate', async () => {
    const layers = [voronoiHost(false), motifOn('vh')];
    const { instances } = await overlayDots(layers);
    const geo = instances.vh.motifHostGeometry;
    expect(geo).toBeTruthy();
    expect(geo.drawnEdges.length).toBeGreaterThan(0);
    expect(geo.sites.length).toBeGreaterThan(0);
  });

  it('voronoi: dot ids, coords AND placed/candidate states agree dot-for-dot, hidden vs visible', async () => {
    const shown = await overlayDots([voronoiHost(true), motifOn('vh')]);
    const hidden = await overlayDots([voronoiHost(false), motifOn('vh')]);
    expect(Object.keys(shown.dots).length).toBeGreaterThan(0);
    // Same seed + params ⇒ same drawnEdges/sites ⇒ same anchors ⇒ same
    // placements — visibility must not perturb ANY of it.
    expect(hidden.dots).toEqual(shown.dots);
    // And the placement chain genuinely ran (some dots are PLACED, not all
    // candidates) — guards against a silently-empty resolveSelection.
    expect(Object.values(hidden.dots).some((v) => v.endsWith(':placed'))).toBe(true);
  });

  it('edge host (flowfield): hidden host still carries prepass hostPaths, and the pick-armed picker agrees dot-for-dot', async () => {
    const pick = { motifPick: { layerId: 'mo', blockIndex: 0 } };
    const shown = await overlayDots([flowHost(true), motifOn('fh')], pick);
    const hidden = await overlayDots([flowHost(false), motifOn('fh')], pick);
    expect(hidden.instances.fh.motifHostGeometry?.hostPaths?.length).toBeGreaterThan(0);
    expect(Object.keys(shown.dots).length).toBeGreaterThan(0);
    expect(hidden.dots).toEqual(shown.dots);
  });
});
