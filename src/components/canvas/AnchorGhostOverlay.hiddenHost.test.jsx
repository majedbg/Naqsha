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
import { sampleEdgeAnchors } from '../../lib/motif/anchors.js';

const W = 800;
const H = 600;

// jitter:0 + relaxationSteps:0 → deterministic cells (independent of the
// stub's constant random), same seed for the visible and hidden runs.
const voronoiHost = (visible) => ({
  id: 'vh', name: 'Voronoi', type: 'pattern', patternType: 'voronoi',
  visible, opacity: 100, bgOpacity: 0, color: '#000000', seed: 42,
  params: { cellCount: 12, jitter: 0, relaxationSteps: 0, symmetry: 'none' },
});

// particleCount 40, not FlowField's default 800 (#170). Under the p5 stub above
// `random()` returns a constant 0.5 for every call, so every particle starts at
// the SAME point and — `noise()` being constant too — traces the SAME straight
// line. 800 particles therefore buy 800 IDENTICAL trails, not coverage: the
// hidden-vs-visible invariant these tests lock is particle-count-independent.
// What the 800 did buy was cost — the record-mode prepass captured ~65k draw
// calls per probe, which is what made this file flake under load (see the
// waitFor note in overlayDots). 40 keeps the assertions discriminating (the
// unarmed case still samples ~680 anchors and places 17, so "placed ⊊ sampled"
// is a real constraint) at ~1/20th the work.
const flowHost = (visible) => ({
  id: 'fh', name: 'Flow', type: 'pattern', patternType: 'flowfield',
  visible, opacity: 100, bgOpacity: 0, color: '#000000', seed: 9,
  params: { particleCount: 40 },
});

// edgeOpts mirrors createMotifParams' default (motifLayer.js): the overlay
// samples edge anchors with the motif's OWN edgeOpts, exactly as the render
// does, and BOTH treat an absent edgeOpts as "sample nothing". A fixture
// without it would therefore describe a motif that draws no glyphs at all.
const motifOn = (hostId) => ({
  id: 'mo', name: 'Leaf', type: 'motif', patternType: 'motif',
  visible: true, opacity: 100, bgOpacity: 0, color: '#123456', seed: 7,
  params: {
    glyphRef: 'leaf', hostLayerId: hostId, anchorMode: 'semantic',
    edgeOpts: { spacing: 24 },
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
  // EXPLICIT waitFor timeout (#170). Testing Library's `asyncUtilTimeout`
  // defaults to 1000ms and is NOT vitest's `testTimeout` — the 15000 in
  // vitest.config.js never applied here. That 1000ms was the real budget this
  // file kept blowing under load, while the raised testTimeout made it look
  // like there was 15s of headroom. Stated here so the two budgets are visible
  // together; the flowfield cost itself is fixed at the fixture (flowHost).
  await waitFor(() => expect(result.current.patternInstances[layers[0].id]).toBeTruthy(), {
    timeout: 15000,
  });
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

  // #141 — the UNARMED edge path (per-glyph override dots on an edge host). The
  // pick-armed test above only proves the anchors survive hiding; this proves
  // the EDIT affordance does, through the same prepass geometry.
  it('edge host (flowfield), UNARMED: per-glyph override dots render and agree dot-for-dot, hidden vs visible', async () => {
    const shown = await overlayDots([flowHost(true), motifOn('fh')]);
    const hidden = await overlayDots([flowHost(false), motifOn('fh')]);
    expect(Object.keys(shown.dots).length).toBeGreaterThan(0);
    expect(hidden.dots).toEqual(shown.dots);
    // The discriminating assertion: PLACED dots exist. The fixture binding still
    // says roles ['crossing','cell'] — roles a native edge host never emits — so
    // without the render's own edge-role coercion (coerceEdgeRoles) the chain
    // filters every anchor out and the overlay would draw an empty svg while the
    // canvas is full of glyphs.
    expect(Object.values(hidden.dots).some((v) => v.endsWith(':placed'))).toBe(true);
    // Placed-ONLY: strictly fewer dots than the sampler emits (packing rejects
    // overlapping footprints), so the dots read as "my glyphs", not "the grid".
    const anchors = sampleEdgeAnchors(hidden.instances.fh.motifHostGeometry.hostPaths, {
      spacing: 24,
    });
    expect(Object.keys(hidden.dots).length).toBeLessThan(anchors.length);
  });
});
