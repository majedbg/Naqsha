// Override dots on TRUCHET (#153, PRD #143) — the two-role stash host.
//
// Truchet is the first stash-backed host that emits BOTH `cell` and `edge`, and
// the only one with a real radial-symmetry control. Everything the overlay needs
// is inherited from module F (#149): it names no host, asks the ONE shared
// resolver (lib/motif/hostAnchors.js) and forwards whatever the host stashed.
// These tests are the proof that the inheritance actually happened — a
// stash-backed host can paint glyphs with NO dots and NO popover, which looks
// right and is uneditable, and no extractor unit test can see it.
//
// They deliberately do NOT live in AnchorGhostOverlay.hiddenHost.test.jsx: that
// file is a known load-sensitive flake under concurrent agent load and these
// cases must not share its blame surface.
//
// `tiles: 6` throughout. The default 16 is 256 tiles and 512 arcs — a dot per
// anchor is a four-figure DOM in jsdom for no extra evidence.

// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';

// Headless p5 stub, matching AnchorGhostOverlay.stashHost.test.jsx. `random` is a
// real deterministic mulberry32 because Truchet's per-tile orientation is a
// single RNG draw per tile: a constant 0.5 would give every tile the same
// orientation and the arcs would stop being a representative field.
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

import { renderHook, waitFor, render, fireEvent } from '@testing-library/react';
import { useRef } from 'react';
// Truchet lives in patterns/extras and self-registers into the DYNAMIC registry
// at boot (main.jsx imports this for its side effect). useCanvas resolves the
// host class through getDynamicPatternClass, so without this import the host is
// simply unknown and nothing renders at all.
import '../../lib/registerBuiltinExtras.js';
import useCanvas from '../../lib/useCanvas.js';
import AnchorGhostOverlay from './AnchorGhostOverlay.jsx';
import { resolveHostAnchors } from '../../lib/motif/hostAnchors.js';
import { defaultMotifAddOpts } from '../../lib/motif/defaultBinding.js';
import { createMotifParams } from '../../lib/motif/motifLayer.js';

const W = 800;
const H = 600;
const TILES = 6;
const N_TILES = TILES * TILES;

const truchetHost = (visible = true, params = {}) => ({
  id: 'th',
  name: 'Truchet',
  type: 'pattern',
  patternType: 'truchet',
  visible,
  opacity: 100,
  bgOpacity: 0,
  color: '#000000',
  seed: 7,
  params: { tiles: TILES, tileSet: 'arcs', symmetry: 1, ...params },
});

const truchetMotif = (roles = ['cell'], extra = {}) => ({
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
    hostLayerId: 'th',
    anchorMode: 'semantic',
    edgeOpts: { spacing: 24 },
    binding: {
      selection: { roles, ...(extra.overrides ? { overrides: extra.overrides } : {}) },
      // A low floor and a small size, so most anchors are adorned rather than
      // rejected — the floor's rejection behaviour is #146's test, not this one.
      placement: { sizing: { mode: 'proportional', size: 20, min: 2, margin: 0.85 } },
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

describe('AnchorGhostOverlay — Truchet (a two-role stash host) gets editable dots', () => {
  it('the tiling stashes cells AND arcs, and the overlay draws a PLACED dot per tile', async () => {
    const layers = [truchetHost(), truchetMotif(['cell'])];
    const { hook, dots } = await renderOverlay(layers);

    const geo = hook.result.current.patternInstances.th.motifHostGeometry;
    expect(geo.cells).toHaveLength(N_TILES);
    expect(geo.arcs).toHaveLength(N_TILES * 2);
    // The harvest is the STASH, not a recorded draw stream — an edge-host capture
    // would have produced hostPaths instead, and would have cost the cell role.
    expect(geo.hostPaths).toBeUndefined();

    expect(Object.keys(dots)).toHaveLength(N_TILES);
    expect(Object.keys(dots)).toContain('cell:0');
    // …and they are GLYPHS, not a field of hollow candidates.
    expect(placedStates(dots)).toHaveLength(N_TILES);
  });

  it('the glyph popover opens on a Truchet dot', async () => {
    const layers = [truchetHost(), truchetMotif(['cell'])];
    const { container } = await renderOverlay(layers);
    const dot = container.querySelector('circle[data-state="placed"]');
    expect(dot).toBeTruthy();
    expect(popover()).toBeNull();
    fireEvent.click(dot);
    expect(popover()).not.toBeNull();
  });

  it('an EDGE-routed motif gets a dot per arc sample, one run per quarter-arc', async () => {
    const layers = [truchetHost(), truchetMotif(['edge'])];
    const { dots } = await renderOverlay(layers);
    const ids = Object.keys(dots);
    expect(ids).toHaveLength(N_TILES * 2 * 3);
    expect(ids).toContain('edge:0:0');
    expect(placedStates(dots).length).toBeGreaterThan(0);
    // One run per arc: every arc index carries exactly three samples.
    const runs = new Map();
    for (const id of ids) {
      const arc = id.split(':')[1];
      runs.set(arc, (runs.get(arc) || 0) + 1);
    }
    expect(runs.size).toBe(N_TILES * 2);
    for (const n of runs.values()) expect(n).toBe(3);
  });

  it('the motif a maker ACTUALLY gets from "+ Add Motif" shows placed dots', async () => {
    // The fixtures above hand-pick a sizing block and a role, so they could pass
    // while the real default placed nothing. This runs the genuine add options
    // through the genuine params builder.
    const opts = defaultMotifAddOpts('truchet', 'leaf');
    expect(opts.anchorMode).toBe('semantic');
    expect(opts.binding.selection.roles).toEqual(['cell']);
    const layers = [
      truchetHost(),
      { ...truchetMotif(['cell']), params: createMotifParams({ ...opts, hostLayerId: 'th' }) },
    ];
    const { dots } = await renderOverlay(layers);
    expect(placedStates(dots).length).toBeGreaterThan(0);
  });

  it('a double-click writes a per-glyph hide record for the clicked tile', async () => {
    const onUpdateLayer = vi.fn();
    const layers = [truchetHost(), truchetMotif(['cell'])];
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

describe('AnchorGhostOverlay — Truchet: the resolver agrees with what the renderer places', () => {
  it('every PLACED dot sits on a real render placement, one for one', async () => {
    const layers = [truchetHost(), truchetMotif(['cell'])];
    const { hook, dots } = await renderOverlay(layers);
    // The RENDER's own accepted placements, straight off useCanvas (from
    // MotifPattern's lastPlacementPositions — accepted placements, never the
    // placement-statistics counter).
    const placements = hook.result.current.motifPlacements.mo;
    expect(placements?.length).toBeGreaterThan(0);
    const placedDots = Object.entries(dots)
      .filter(([, v]) => v.endsWith(':placed'))
      .map(([, v]) => v.slice(0, v.lastIndexOf(':')));
    expect(placedDots).toHaveLength(placements.length);
    const renderKeys = new Set(placements.map((p) => `${p.x},${p.y}`));
    for (const key of placedDots) expect(renderKeys.has(key)).toBe(true);
  });

  it('the anchors the overlay resolves ARE the anchors the shared resolver returns', async () => {
    const layers = [truchetHost(), truchetMotif(['cell'])];
    const { hook, dots } = await renderOverlay(layers);
    const anchors = resolveHostAnchors({
      patternType: 'truchet',
      params: layers[0].params,
      canvasW: W,
      canvasH: H,
      geometry: hook.result.current.patternInstances.th.motifHostGeometry,
      hostSeed: layers[0].seed,
    });
    const cells = anchors.filter((a) => a.role === 'cell');
    expect(cells.map((a) => a.id).sort()).toEqual(Object.keys(dots).sort());
    // hostRadius rode all the way through — the #146 channel is not stripped, and
    // the edge anchors correctly declare no container.
    expect(cells.every((a) => Number.isFinite(a.hostRadius) && a.hostRadius > 0)).toBe(true);
    expect(anchors.filter((a) => a.role === 'edge').every((a) => a.hostRadius === undefined)).toBe(
      true
    );
  });

  it('the useCanvas prepass harvests truchet through the noDraw probe, z-order independently', async () => {
    // The motif is listed BEFORE its host, so it renders FIRST — only an
    // order-independent prepass can have the stash ready in time.
    const layers = [truchetMotif(['cell']), truchetHost()];
    const hook = harness(layers);
    await waitFor(() => expect(hook.result.current.patternInstances.th).toBeTruthy());
    await waitFor(() => expect(hook.result.current.motifPlacements.mo?.length).toBeGreaterThan(0));
    expect(hook.result.current.patternInstances.th.motifHostGeometry.cells).toHaveLength(N_TILES);
  });
});

describe('AnchorGhostOverlay — Truchet dots survive symmetry, hiding and a re-render', () => {
  it('a SYMMETRIC host draws a dot on every copy', async () => {
    const layers = [truchetHost(true, { symmetry: 3 }), truchetMotif(['cell'])];
    const { hook, dots } = await renderOverlay(layers);
    expect(hook.result.current.patternInstances.th.motifHostGeometry.cells).toHaveLength(
      N_TILES * 3
    );
    expect(Object.keys(dots)).toHaveLength(N_TILES * 3);
    // Ids gain the copy suffix ONLY above one copy, so every copy is reachable.
    for (const k of [0, 1, 2]) {
      expect(Object.keys(dots).filter((id) => id.endsWith(`:${k}`)).length).toBe(N_TILES);
    }
  });

  it('a HIDDEN host still resolves — hide the scaffold, keep the ornament editable', async () => {
    const shown = await renderOverlay([truchetHost(true), truchetMotif(['cell'])]);
    const hidden = await renderOverlay([truchetHost(false), truchetMotif(['cell'])]);
    expect(Object.keys(shown.dots).length).toBeGreaterThan(0);
    expect(hidden.dots).toEqual(shown.dots);
    expect(placedStates(hidden.dots).length).toBeGreaterThan(0);
  });

  it('an override record still reads as excluded after the host re-renders', async () => {
    // A NEW layer object with a changed NON-geometry param (colour) — the
    // "adjusting an unrelated parameter" case. `cell:<tile>` ids are POSITIONAL,
    // so changing the tile count would legitimately renumber them.
    const overrides = { records: [{ ref: 'cell:0', hidden: true }] };
    const first = await renderOverlay([truchetHost(), truchetMotif(['cell'], { overrides })]);
    expect(first.dots['cell:0']).toMatch(/:excluded$/);
    const before = { ...first.dots };

    const layers2 = [
      { ...truchetHost(), color: '#ff0000' },
      truchetMotif(['cell'], { overrides }),
    ];
    const hook2 = harness(layers2);
    await waitFor(() => expect(hook2.result.current.patternInstances.th).toBeTruthy());
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

  it('a truchet host not yet probed renders nothing rather than throwing', () => {
    const layers = [truchetHost(), truchetMotif(['cell'])];
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
    expect(() => bare({})).not.toThrow();
    expect(document.querySelector('[data-testid="anchor-ghost-overlay"]')).toBeNull();
    expect(() => bare({ th: { motifHostGeometry: {} } })).not.toThrow();
    expect(document.querySelector('[data-testid="anchor-ghost-overlay"]')).toBeNull();
    // An EMPTY stash is not the unprobed case: the overlay renders, with no dots.
    const { container } = bare({ th: { motifHostGeometry: { cells: [], arcs: [] } } });
    expect(container.querySelector('[data-testid="anchor-ghost-overlay"]')).not.toBeNull();
    expect(container.querySelectorAll('[data-anchor-id]')).toHaveLength(0);
  });
});
