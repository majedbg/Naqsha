// DOTS == GLYPHS when a stored Route asks for a role its host cannot serve
// (#154, amendment A2 — the one user-facing hole the adversarial review found).
//
// THE BUG THIS LOCKS OUT. #154 makes the render intersect a Route block's stored
// roles with what the host actually emits, so a Voronoi motif stored as
// `roles:['tip']` — a role a tessellation never produces, and one the Route card
// still offered until this ticket — stops rendering blank and starts placing
// glyphs at the host's default role instead. The overlay computed its PLACEMENTS
// from the coerced binding but its role-focus DISPLAY filter from the RAW one, so
// those glyphs would have appeared on canvas with NO dot on any of them. No dot
// means no popover, which means the whole per-glyph override surface (#136/#137)
// would be unreachable for exactly the placements this change creates — the same
// class of silent divergence `edgeRoles.js`'s own header says the module was
// extracted to prevent.
//
// So the coercion is applied ONCE, at a seam BOTH consumers read, and these tests
// compare the PLACED dot set against `motifPlacements` — the render's own ACCEPTED
// placements, never the placement-statistics counter.
//
// A separate file on purpose: AnchorGhostOverlay.hiddenHost.test.jsx is a known
// load-sensitive flake and these cases must not share its blame surface.

// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { vi } from 'vitest';

// Headless p5 stub — the hiddenHost/useCanvas.motif shape. Constant random is
// fine here: every host below is driven at deterministic params (voronoi with
// jitter 0 / no relaxation; spiral is a pure formula host).
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

import { renderHook, waitFor, render, fireEvent } from '@testing-library/react';
import { useRef } from 'react';
import useCanvas from '../../lib/useCanvas.js';
import AnchorGhostOverlay from './AnchorGhostOverlay.jsx';

const W = 800;
const H = 600;

const voronoiHost = () => ({
  id: 'vh', name: 'Voronoi', type: 'pattern', patternType: 'voronoi',
  visible: true, opacity: 100, bgOpacity: 0, color: '#000000', seed: 42,
  params: { cellCount: 12, jitter: 0, relaxationSteps: 0, symmetry: 'none' },
});

const spiralHost = () => ({
  id: 'sh', name: 'Spiral', type: 'pattern', patternType: 'spiral',
  visible: true, opacity: 100, bgOpacity: 0, color: '#000000', seed: 3,
  params: { armCount: 3, turns: 8, innerRadius: 5 },
});

/** A motif whose stored Route names `roles`, chain-form. */
const motifOn = (hostId, roles) => ({
  id: 'mo', name: 'Leaf', type: 'motif', patternType: 'motif',
  visible: true, opacity: 100, bgOpacity: 0, color: '#123456', seed: 7,
  params: {
    glyphRef: 'leaf', hostLayerId: hostId, anchorMode: 'semantic',
    edgeOpts: { spacing: 24 },
    binding: { chain: [{ type: 'route', roles, pathScope: 'all' }] },
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

/** Render the overlay over a settled canvas and return dots + the render's placements. */
async function overlayFor(layers, overlayProps = {}) {
  const hook = harness(layers);
  await waitFor(() => expect(hook.result.current.patternInstances[layers[0].id]).toBeTruthy());
  const { container } = render(
    <AnchorGhostOverlay
      layers={layers}
      selectedLayerId="mo"
      canvasW={W}
      canvasH={H}
      patternInstances={hook.result.current.patternInstances}
      {...overlayProps}
    />
  );
  const dots = [...container.querySelectorAll('[data-anchor-id]')].map((c) => ({
    id: c.getAttribute('data-anchor-id'),
    key: `${c.getAttribute('cx')},${c.getAttribute('cy')}`,
    state: c.getAttribute('data-state'),
  }));
  return { dots, container, placements: hook.result.current.motifPlacements.mo || [] };
}

/** One dot per accepted placement, sitting on it — the whole invariant. */
function expectDotsMatchGlyphs({ dots, placements }) {
  expect(placements.length).toBeGreaterThan(0);
  const placed = dots.filter((d) => d.state === 'placed');
  expect(placed.length).toBe(placements.length);
  const renderKeys = new Set(placements.map((p) => `${p.x},${p.y}`));
  for (const d of placed) expect(renderKeys.has(d.key)).toBe(true);
}

describe('AnchorGhostOverlay — a Route asking for a DEAD role still gets editable dots (#154)', () => {
  it('voronoi stored roles:["tip"] — glyphs appear AND every one of them has a dot', async () => {
    // Voronoi emits no `tip` at any seed. Before #154 this motif rendered blank;
    // after it, the render falls back to the host's default role. If the overlay
    // read the RAW binding for its role-focus filter it would draw ZERO dots over
    // a canvas full of glyphs.
    const result = await overlayFor([voronoiHost(), motifOn('vh', ['tip'])]);
    expect(result.dots.length).toBeGreaterThan(0);
    expectDotsMatchGlyphs(result);
  });

  it('spiral stored roles:["cell"] — same story on a FORMULA host', async () => {
    // An open arm encloses no region, so `cell` is dead on a spiral at every
    // params set. This is the other reachable class of PRD #143's accepted cost.
    const result = await overlayFor([spiralHost(), motifOn('sh', ['cell'])]);
    expect(result.dots.length).toBeGreaterThan(0);
    expectDotsMatchGlyphs(result);
  });

  it('a LIVE role is unchanged — the control', async () => {
    const result = await overlayFor([voronoiHost(), motifOn('vh', ['crossing'])]);
    expectDotsMatchGlyphs(result);
  });

  it('the stored Route is NEVER rewritten — opening a document mutates nothing', async () => {
    // Criterion 11. Availability is DERIVED at render; the document keeps the
    // maker's stored intent, dead role and all, so turning the host back into one
    // that emits it brings the original behaviour back with no write at any point.
    const layers = [voronoiHost(), motifOn('vh', ['tip'])];
    const stored = layers[1].params.binding;
    await overlayFor(layers);
    expect(stored.chain[0].roles).toEqual(['tip']);
    expect(layers[1].params.binding).toBe(stored);
  });

  it('a per-glyph WRITE carries the stored roles, not the coerced ones', async () => {
    // The coerced binding is READ-ONLY. Hiding one glyph patches the overrides of
    // the RAW stored binding, so an unrelated gesture can never launder a derived
    // role into the document — where it would then survive the maker changing the
    // host back, and would show up in an undo entry they never asked for.
    const onUpdateLayer = vi.fn();
    const layers = [voronoiHost(), motifOn('vh', ['tip'])];
    const { container } = await overlayFor(layers, { onUpdateLayer });
    const dot = container.querySelector('circle[data-state="placed"]');
    expect(dot).toBeTruthy();
    fireEvent.doubleClick(dot);
    expect(onUpdateLayer).toHaveBeenCalledTimes(1);
    const written = onUpdateLayer.mock.calls[0][1].params.binding;
    expect(written.chain[0].roles).toEqual(['tip']);
    expect(written.overrides.records).toEqual([
      { ref: dot.getAttribute('data-anchor-id'), hidden: true },
    ]);
  });
});
