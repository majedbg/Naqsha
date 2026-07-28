// Override dots on STASH-BACKED hosts (#149, module F of PRD #143).
//
// THE INVARIANT. A host whose anchors come from a generate()-time STASH — the
// geometry-in hosts, of which Voronoi was the first and Circle Packing (#146) is
// the second — gets editable per-glyph dots and the glyph popover on exactly the
// same terms as a formula host. Before this ticket the overlay resolved host
// anchors itself and named `voronoi` in a hardcoded branch, so Circle Packing
// painted glyphs with NO dots and NO popover: the ornament looked right and was
// uneditable. That branch is gone; both call sites now ask the ONE shared
// resolver (lib/motif/hostAnchors.js).
//
// These tests drive the REAL useCanvas (real CirclePacking, stubbed p5) into the
// REAL AnchorGhostOverlay. They deliberately do NOT live in
// AnchorGhostOverlay.hiddenHost.test.jsx: that file is a known load-sensitive
// flake under concurrent agent load, and these cases must not share its blame
// surface.
//
// WHY THE PLACED-STATE ASSERTIONS MATTER. "Dots exist" is not the criterion —
// hollow candidate dots over a canvas full of glyphs is precisely the #141 bug
// class, and on a packing it is a LIVE failure mode: `hostRadius` below the size
// floor REJECTS an anchor by design (PRD #143), so an overlay that disagreed with
// the render about sizing would show the wrong state on every dot. Every dot
// assertion below therefore carries `data-state`.

// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Headless p5 stub. Same shape as useCanvas.motif.test.jsx / hiddenHost.test.jsx,
// with ONE deliberate difference: `random` is a real deterministic mulberry32
// honouring p5's (), (max), (min,max) semantics instead of a constant 0.5. A
// constant random collapses a Circle Packing to a single accepted circle (every
// candidate lands on the same point), which would make "dots appear" pass on a
// one-anchor packing and prove nothing. Reseeded by randomSeed, so the prepass
// probe and the painted run reproduce byte-identical packings.
const mulberry32 = (a) => () => {
  a |= 0;
  a = (a + 0x6d2b79f5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

vi.mock('p5', () => ({
  default: class {
    constructor(sketch) {
      this._rand = mulberry32(1);
      this._sketch = sketch;
      sketch?.(this);
      this.setup?.();
    }
    createCanvas() {} pixelDensity() {} noLoop() {} clear() {} background() {}
    resizeCanvas() {} remove() {}
    randomSeed(s) { this._rand = mulberry32((s | 0) || 1); }
    noiseSeed() {}
    random(a, b) {
      const u = this._rand();
      if (a === undefined) return u;
      if (b === undefined) return u * a;
      return a + u * (b - a);
    }
    noise() { return 0.5; }
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

import { renderHook, waitFor, render, fireEvent, screen, within } from '@testing-library/react';
import { useRef } from 'react';
import useCanvas from '../../lib/useCanvas.js';
import AnchorGhostOverlay from './AnchorGhostOverlay.jsx';
import { resolveHostAnchors } from '../../lib/motif/hostAnchors.js';
import { defaultMotifAddOpts } from '../../lib/motif/defaultBinding.js';
import { createMotifParams } from '../../lib/motif/motifLayer.js';
import { clearGlyphClipboard, readGlyphClipboard } from '../../lib/motif/glyphClipboard.js';

const W = 800;
const H = 600;

const packingHost = (visible = true, extra = {}) => ({
  id: 'ph',
  name: 'Packing',
  type: 'pattern',
  patternType: 'circlepacking',
  visible,
  opacity: 100,
  bgOpacity: 0,
  color: '#000000',
  seed: 7,
  params: { attempts: 400, minRadius: 8, maxRadius: 45, render: 'outlines' },
  ...extra,
});

// A motif routed to CELLS — the only role Circle Packing emits (hostRoles.js).
// A fixture asking for 'crossing' would be filtered out by the overlay's
// role-focus filter and read as "the resolver failed".
const packingMotif = (overrides) => ({
  id: 'mo',
  name: 'Leaf',
  type: 'motif',
  patternType: 'motif',
  visible: true,
  opacity: 100,
  bgOpacity: 0,
  color: '#123456',
  seed: 7,
  params: {
    glyphRef: 'leaf',
    hostLayerId: 'ph',
    anchorMode: 'semantic',
    edgeOpts: { spacing: 24 },
    binding: {
      selection: {
        roles: ['cell'],
        ...(overrides ? { overrides } : {}),
      },
      // Proportional sizing with a low floor, so most containers are adorned
      // rather than rejected — the floor's rejection behaviour is #146's test.
      placement: { sizing: { mode: 'proportional', size: 40, min: 2, margin: 0.85 } },
    },
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

const dotMap = (container) => {
  const dots = {};
  for (const c of container.querySelectorAll('[data-anchor-id]')) {
    dots[c.getAttribute('data-anchor-id')] =
      `${c.getAttribute('cx')},${c.getAttribute('cy')}:${c.getAttribute('data-state') || ''}`;
  }
  return dots;
};

async function renderOverlay(layers, overlayProps = {}) {
  const hook = harness(layers);
  await waitFor(() => expect(hook.result.current.patternInstances[layers[0].id]).toBeTruthy());
  const view = render(
    <AnchorGhostOverlay
      layers={layers}
      selectedLayerId="mo"
      canvasW={W}
      canvasH={H}
      patternInstances={hook.result.current.patternInstances}
      {...overlayProps}
    />
  );
  return { hook, view, container: view.container, dots: dotMap(view.container) };
}

const popover = () => document.querySelector('[data-testid="glyph-popover"]');
const placedStates = (dots) => Object.values(dots).filter((v) => v.endsWith(':placed'));

beforeEach(() => {
  clearGlyphClipboard();
});

describe('AnchorGhostOverlay — Circle Packing (a stash host) gets editable dots (#149)', () => {
  it('the packing stashes circles and the overlay draws PLACED dots on them', async () => {
    const layers = [packingHost(), packingMotif()];
    const { hook, dots } = await renderOverlay(layers);

    const circles = hook.result.current.patternInstances.ph.motifHostGeometry?.circles;
    expect(circles?.length).toBeGreaterThan(1); // a real packing, not a 1-circle degenerate

    // A dot per container, ids from the normative `cell:<index>` scheme.
    expect(Object.keys(dots).length).toBe(circles.length);
    expect(Object.keys(dots)).toContain('cell:0');
    // …and they are GLYPHS, not a field of hollow candidates.
    expect(placedStates(dots).length).toBeGreaterThan(0);
  });

  it('the glyph popover opens on a Circle Packing dot', async () => {
    const layers = [packingHost(), packingMotif()];
    const { container } = await renderOverlay(layers);
    const dot = container.querySelector('circle[data-state="placed"]');
    expect(dot).toBeTruthy();
    expect(popover()).toBeNull();
    fireEvent.click(dot);
    expect(popover()).not.toBeNull();
  });

  it('the motif a maker ACTUALLY gets from "+ Add Motif" shows placed dots', async () => {
    // Adversarial pass: the fixtures above hand-pick a sizing block, so they
    // could pass while the real default (proportional size 18, min 3, margin
    // 0.85 — defaultBinding.js) placed nothing. This runs the genuine
    // add-a-motif options through the genuine params builder.
    const opts = defaultMotifAddOpts('circlepacking', 'leaf');
    expect(opts.anchorMode).toBe('semantic');
    expect(opts.binding.selection.roles).toEqual(['cell']);
    const layers = [
      packingHost(),
      {
        ...packingMotif(),
        params: createMotifParams({ ...opts, hostLayerId: 'ph' }),
      },
    ];
    const { dots } = await renderOverlay(layers);
    expect(placedStates(dots).length).toBeGreaterThan(0);
  });

  it('a double-click writes a per-glyph hide record for the clicked container', async () => {
    const onUpdateLayer = vi.fn();
    const layers = [packingHost(), packingMotif()];
    const { container } = await renderOverlay(layers, { onUpdateLayer });
    const dot = container.querySelector('circle[data-state="placed"]');
    const anchorId = dot.getAttribute('data-anchor-id');
    fireEvent.doubleClick(dot);
    expect(onUpdateLayer).toHaveBeenCalledTimes(1);
    const [id, patch] = onUpdateLayer.mock.calls[0];
    expect(id).toBe('mo');
    expect(patch.params.binding.selection.overrides.records).toEqual([
      { ref: anchorId, hidden: true },
    ]);
  });
});

describe('AnchorGhostOverlay — the resolver agrees with what the renderer places', () => {
  it('circlepacking: every PLACED dot sits on a real render placement, one for one', async () => {
    const layers = [packingHost(), packingMotif()];
    const { hook, dots } = await renderOverlay(layers);

    // The RENDER's own accepted placements, straight off useCanvas (read from
    // MotifPattern's lastPlacementPositions — accepted placements, never the
    // placement-statistics counter).
    const placements = hook.result.current.motifPlacements.mo;
    expect(placements?.length).toBeGreaterThan(0);

    const placedDots = Object.entries(dots)
      .filter(([, v]) => v.endsWith(':placed'))
      .map(([, v]) => v.slice(0, v.lastIndexOf(':')));
    expect(placedDots.length).toBe(placements.length);
    const renderKeys = new Set(placements.map((p) => `${p.x},${p.y}`));
    for (const key of placedDots) expect(renderKeys.has(key)).toBe(true);
  });

  it('the anchors the overlay resolves ARE the anchors the shared resolver returns', async () => {
    // Belt on the braces: the dots are not a lookalike set computed elsewhere.
    const layers = [packingHost(), packingMotif()];
    const { hook, dots } = await renderOverlay(layers);
    const anchors = resolveHostAnchors({
      patternType: 'circlepacking',
      params: layers[0].params,
      canvasW: W,
      canvasH: H,
      geometry: hook.result.current.patternInstances.ph.motifHostGeometry,
      hostSeed: layers[0].seed,
    });
    expect(anchors.map((a) => a.id).sort()).toEqual(Object.keys(dots).sort());
    // hostRadius rode all the way through — the #146 channel is not stripped.
    expect(anchors.every((a) => Number.isFinite(a.hostRadius) && a.hostRadius > 0)).toBe(true);
  });

  it('the useCanvas prepass really does harvest circlepacking through the noDraw probe', async () => {
    // #146 verified by CODE READING that the prepass needed no change, because
    // isEdgeHost('circlepacking') is false so the host takes the noDraw-probe
    // branch and the harvest reads `probe.motifHostGeometry`. This is that claim
    // as a test. The discriminator is Z-ORDER: the motif is listed BEFORE its
    // host, so it renders FIRST — only an order-independent prepass can have the
    // circles ready in time. Without it, zero placements.
    const layers = [packingMotif(), packingHost()];
    const hook = harness(layers);
    await waitFor(() => expect(hook.result.current.patternInstances.ph).toBeTruthy());
    await waitFor(() =>
      expect(hook.result.current.motifPlacements.mo?.length).toBeGreaterThan(0)
    );
    // And the harvest is the STASH, not a recorded draw stream: an edge-host
    // capture would have produced hostPaths instead.
    const geo = hook.result.current.patternInstances.ph.motifHostGeometry;
    expect(geo.circles.length).toBeGreaterThan(1);
    expect(geo.hostPaths).toBeUndefined();
  });
});

describe('AnchorGhostOverlay — a hidden stash host still resolves (#140/#149)', () => {
  it('circlepacking: dot ids, coords AND placed/candidate states agree, hidden vs visible', async () => {
    const shown = await renderOverlay([packingHost(true), packingMotif()]);
    const hidden = await renderOverlay([packingHost(false), packingMotif()]);
    expect(Object.keys(shown.dots).length).toBeGreaterThan(0);
    expect(hidden.dots).toEqual(shown.dots);
    expect(placedStates(hidden.dots).length).toBeGreaterThan(0);
  });
});

describe('AnchorGhostOverlay — a host not yet probed resolves to nothing, not a throw', () => {
  const layers = [packingHost(), packingMotif()];
  const bare = (patternInstances) =>
    render(
      <AnchorGhostOverlay
        layers={layers}
        selectedLayerId="mo"
        canvasW={W}
        canvasH={H}
        patternInstances={patternInstances}
      />
    );

  it('no patternInstances at all → no overlay, no throw', () => {
    expect(() => bare({})).not.toThrow();
    expect(document.querySelector('[data-testid="anchor-ghost-overlay"]')).toBeNull();
  });

  it('an instance with no stashed geometry → no overlay, no throw', () => {
    expect(() => bare({ ph: {} })).not.toThrow();
    expect(document.querySelector('[data-testid="anchor-ghost-overlay"]')).toBeNull();
  });

  it('an instance whose stash carries no key this host understands → no overlay', () => {
    expect(() => bare({ ph: { motifHostGeometry: {} } })).not.toThrow();
    expect(document.querySelector('[data-testid="anchor-ghost-overlay"]')).toBeNull();
  });

  it('an EMPTY stash is not the unprobed case — the overlay renders, with no dots', () => {
    // The null-vs-[] contract, held all the way from pointHostAnchors through the
    // resolver to the overlay: "no circles key" (unprobed) and "a packing that
    // genuinely placed nothing" are different answers and must stay different.
    const { container } = bare({ ph: { motifHostGeometry: { circles: [] } } });
    expect(container.querySelector('[data-testid="anchor-ghost-overlay"]')).not.toBeNull();
    expect(container.querySelectorAll('[data-anchor-id]')).toHaveLength(0);
  });
});

describe('AnchorGhostOverlay — per-glyph overrides on a stash host survive a re-render', () => {
  it('an override record still reads as excluded after the host re-renders', async () => {
    // The host is re-rendered with a NEW layer object and a changed non-geometry
    // param (colour) — the "adjusting an unrelated parameter" case of story 62.
    // Geometry-relevant params are untouched on purpose: `cell:<index>` ids are
    // POSITIONAL (pointHostAnchors), so changing which containers exist would
    // legitimately renumber them and the record would correctly fall through to
    // spatial rebinding, which is a different behaviour and not what this locks.
    const overrides = { records: [{ ref: 'cell:0', hidden: true }] };
    const first = await renderOverlay([packingHost(), packingMotif(overrides)]);
    expect(first.dots['cell:0']).toMatch(/:excluded$/);
    const before = { ...first.dots };

    const layers2 = [packingHost(true, { color: '#ff0000' }), packingMotif(overrides)];
    const hook2 = harness(layers2);
    await waitFor(() => expect(hook2.result.current.patternInstances.ph).toBeTruthy());
    const { container } = render(
      <AnchorGhostOverlay
        layers={layers2}
        selectedLayerId="mo"
        canvasW={W}
        canvasH={H}
        patternInstances={hook2.result.current.patternInstances}
      />
    );
    const after = dotMap(container);
    expect(after['cell:0']).toMatch(/:excluded$/);
    expect(after).toEqual(before);
  });
});

describe('AnchorGhostOverlay — copy and reset behave as on the existing hosts', () => {
  const openMenu = () => fireEvent.click(screen.getByTestId('glyph-popover-more'));

  it('copy puts the glyph’s effective settings in the session buffer', async () => {
    const layers = [packingHost(), packingMotif({ records: [{ ref: 'cell:0', scale: 2, angle: 45 }] })];
    const { container } = await renderOverlay(layers);
    fireEvent.click(container.querySelector('circle[data-anchor-id="cell:0"]'));
    expect(readGlyphClipboard()).toBeNull();
    openMenu();
    fireEvent.click(within(screen.getByRole('menu')).getByRole('menuitem', { name: /copy/i }));
    expect(readGlyphClipboard()).toEqual({ scale: 2, angle: 45 });
  });

  it('reset clears the WHOLE record for that container', async () => {
    const onUpdateLayer = vi.fn();
    const layers = [
      packingHost(),
      packingMotif({
        records: [
          { ref: 'cell:0', scale: 2, angle: 45 },
          { ref: 'cell:1', scale: 3 },
        ],
      }),
    ];
    const { container } = await renderOverlay(layers, { onUpdateLayer });
    fireEvent.click(container.querySelector('circle[data-anchor-id="cell:0"]'));
    openMenu();
    fireEvent.click(within(screen.getByRole('menu')).getByRole('menuitem', { name: /reset/i }));
    expect(onUpdateLayer).toHaveBeenCalledTimes(1);
    // Only the selected container's record goes; its neighbour is untouched.
    expect(onUpdateLayer.mock.calls[0][1].params.binding.selection.overrides.records).toEqual([
      { ref: 'cell:1', scale: 3 },
    ]);
  });

  it('paste writes scale + angle onto another container', async () => {
    const layers = [packingHost(), packingMotif({ records: [{ ref: 'cell:0', scale: 2, angle: 45 }] })];
    const onUpdateLayer = vi.fn();
    const { container } = await renderOverlay(layers, { onUpdateLayer });
    fireEvent.click(container.querySelector('circle[data-anchor-id="cell:0"]'));
    openMenu();
    fireEvent.click(within(screen.getByRole('menu')).getByRole('menuitem', { name: /copy/i }));
    fireEvent.keyDown(document, { key: 'Escape' });

    fireEvent.click(container.querySelector('circle[data-anchor-id="cell:1"]'));
    openMenu();
    fireEvent.click(within(screen.getByRole('menu')).getByRole('menuitem', { name: /paste/i }));
    expect(onUpdateLayer).toHaveBeenCalledTimes(1);
    const records = onUpdateLayer.mock.calls[0][1].params.binding.selection.overrides.records;
    expect(records).toContainEqual({ ref: 'cell:1', scale: 2, angle: 45 });
  });
});
