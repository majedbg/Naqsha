// hostAnchors — the SHARED host-anchor resolver (module F, #149).
//
// One question, one answer: "given a host layer and its harvested geometry, what
// are its anchors?" Before this module the render path (MotifPattern) and the
// canvas overlay (AnchorGhostOverlay) each answered it separately, and the
// overlay's copy hardcoded Voronoi as the only stash-backed host — so Circle
// Packing (and every stash host after it) painted glyphs with no editable dots.
//
// Geometry here is constructed LITERALLY (brief §4): these are extractor-routing
// tests, not capture regressions. The capture path is exercised end-to-end in
// AnchorGhostOverlay.stashHost.test.jsx, which drives the real useCanvas.

import { describe, it, expect } from 'vitest';
import { resolveHostAnchors } from './hostAnchors.js';
import { getSemanticAnchors } from './semanticAnchors.js';
import { sampleEdgeAnchors } from './anchors.js';
import { resolveMotifHostParams } from './resolveMotifHost.js';

const W = 800;
const H = 600;

// A literal packing: three well-separated containers of different radii.
const CIRCLES = [
  { x: 120, y: 140, r: 40 },
  { x: 300, y: 220, r: 25 },
  { x: 520, y: 400, r: 60 },
];

// A literal voronoi stash: two shared edges + their sites. Shape mirrors what
// VoronoiCells stashes (drawnEdges + sites).
const VORONOI_GEO = {
  drawnEdges: [
    { x1: 100, y1: 100, x2: 300, y2: 100 },
    { x1: 300, y1: 100, x2: 300, y2: 300 },
    { x1: 300, y1: 100, x2: 500, y2: 100 },
  ],
  sites: [
    { x: 100, y: 200 },
    { x: 300, y: 200 },
    { x: 500, y: 200 },
  ],
};

const HOST_PATHS = [
  { points: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 200, y: 0 }], closed: false },
  { points: [{ x: 0, y: 50 }, { x: 100, y: 50 }], closed: false },
];

describe('resolveHostAnchors — stash-backed hosts', () => {
  it('circlepacking resolves its stashed circles to cell anchors', () => {
    const anchors = resolveHostAnchors({
      patternType: 'circlepacking',
      params: {},
      canvasW: W,
      canvasH: H,
      geometry: { circles: CIRCLES },
    });
    expect(anchors).toHaveLength(3);
    expect(anchors.map((a) => a.id)).toEqual(['cell:0', 'cell:1', 'cell:2']);
    expect(anchors.every((a) => a.role === 'cell')).toBe(true);
    // The #146 sizing channel rides through the resolver untouched.
    expect(anchors.map((a) => a.hostRadius)).toEqual([40, 25, 60]);
    expect(anchors.map((a) => [a.x, a.y])).toEqual([
      [120, 140],
      [300, 220],
      [520, 400],
    ]);
  });

  it('voronoi resolves through the SAME path — no host-specific branch survives', () => {
    const anchors = resolveHostAnchors({
      patternType: 'voronoi',
      params: {},
      canvasW: W,
      canvasH: H,
      geometry: VORONOI_GEO,
      hostSeed: 42,
    });
    // Byte-identical to what the pre-#149 overlay produced: it passed the whole
    // stash object straight to getSemanticAnchors. hostSeed is now threaded for
    // every host uniformly; only the grid extractor reads it, so voronoi's
    // anchors are unchanged.
    expect(anchors).toEqual(getSemanticAnchors('voronoi', {}, W, H, VORONOI_GEO));
    expect(anchors.length).toBeGreaterThan(0);
  });

  it('forwards EVERY declared stash key, so a new stash host needs no branch here', () => {
    // `drawnCells` is the legacy voronoi key. If the resolver forwarded a
    // hardcoded subset instead of STASH_GEOMETRY_KEYS, this would resolve to null.
    const drawnCells = [
      { site: { x: 100, y: 100 }, vertices: [{ x: 0, y: 0 }, { x: 200, y: 0 }, { x: 200, y: 200 }] },
      { site: { x: 300, y: 100 }, vertices: [{ x: 200, y: 0 }, { x: 400, y: 0 }, { x: 400, y: 200 }] },
    ];
    const anchors = resolveHostAnchors({
      patternType: 'voronoi',
      params: {},
      canvasW: W,
      canvasH: H,
      geometry: { drawnCells },
    });
    expect(anchors).toEqual(getSemanticAnchors('voronoi', {}, W, H, { drawnCells }));
    expect(anchors.length).toBeGreaterThan(0);
  });

  it('an EMPTY stash is an honest empty anchor set, not "not probed"', () => {
    expect(
      resolveHostAnchors({
        patternType: 'circlepacking',
        params: {},
        canvasW: W,
        canvasH: H,
        geometry: { circles: [] },
      })
    ).toEqual([]);
  });
});

describe('resolveHostAnchors — a host not yet probed resolves to nothing, never throws', () => {
  for (const patternType of ['circlepacking', 'voronoi']) {
    it(`${patternType}: geometry absent → null`, () => {
      const call = (geometry) =>
        resolveHostAnchors({ patternType, params: {}, canvasW: W, canvasH: H, geometry });
      expect(call(undefined)).toBeNull();
      expect(call(null)).toBeNull();
      // Probed, but the stash carries no key this host understands (e.g. only
      // hostPaths from a previous edge-host frame).
      expect(call({})).toBeNull();
      expect(call({ hostPaths: HOST_PATHS })).toBeNull();
    });
  }

  it('edge host: no captured hostPaths → null', () => {
    const call = (geometry) =>
      resolveHostAnchors({
        patternType: 'flowfield',
        params: {},
        canvasW: W,
        canvasH: H,
        geometry,
        edgeOpts: { spacing: 24 },
      });
    expect(call(undefined)).toBeNull();
    expect(call({})).toBeNull();
    expect(call({ hostPaths: [] })).toBeNull();
  });

  it('a pattern that is not a motif host at all → null, no throw', () => {
    expect(() =>
      resolveHostAnchors({ patternType: 'chladni', params: {}, canvasW: W, canvasH: H })
    ).not.toThrow();
    expect(
      resolveHostAnchors({ patternType: 'chladni', params: {}, canvasW: W, canvasH: H })
    ).toBeNull();
    expect(
      resolveHostAnchors({ patternType: 'nope', params: {}, canvasW: W, canvasH: H })
    ).toBeNull();
    // No host at all (a dangling motif) must not throw either.
    expect(() => resolveHostAnchors({ canvasW: W, canvasH: H })).not.toThrow();
  });
});

describe('resolveHostAnchors — formula and edge hosts are unchanged', () => {
  it('grid re-derives from params + hostSeed and ignores any geometry', () => {
    const params = { cols: 5, rows: 4, drawVertical: 1, drawHorizontal: 1 };
    const expected = getSemanticAnchors('grid', params, W, H, { hostSeed: 11 });
    expect(
      resolveHostAnchors({
        patternType: 'grid',
        params,
        canvasW: W,
        canvasH: H,
        hostSeed: 11,
        geometry: { circles: CIRCLES, hostPaths: HOST_PATHS },
      })
    ).toEqual(expected);
    expect(expected.length).toBeGreaterThan(0);
  });

  it('a native edge host samples the captured polylines with the motif edgeOpts', () => {
    const anchors = resolveHostAnchors({
      patternType: 'flowfield',
      params: {},
      canvasW: W,
      canvasH: H,
      geometry: { hostPaths: HOST_PATHS },
      edgeOpts: { spacing: 24 },
    });
    expect(anchors).toEqual(sampleEdgeAnchors(HOST_PATHS, { spacing: 24 }));
    expect(anchors.length).toBeGreaterThan(0);
  });

  it('a SINGLE-AXIS grid is params-aware routed to the edge branch', () => {
    const params = { cols: 6, rows: 6, drawVertical: 1, drawHorizontal: 0 };
    const anchors = resolveHostAnchors({
      patternType: 'grid',
      params,
      canvasW: W,
      canvasH: H,
      geometry: { hostPaths: HOST_PATHS },
      edgeOpts: { spacing: 24 },
      hostSeed: 3,
    });
    expect(anchors).toEqual(sampleEdgeAnchors(HOST_PATHS, { spacing: 24 }));
  });

  it('an absent edgeOpts samples NOTHING — the render’s own fallback, not a friendlier one', () => {
    // MotifPattern falls back to `{}`, which sampleEdgeAnchors treats as "no
    // spacing, no count" ⇒ no samples. A friendlier default here would draw dots
    // claiming "placed" over a canvas where no glyph drew (#141).
    expect(
      resolveHostAnchors({
        patternType: 'flowfield',
        params: {},
        canvasW: W,
        canvasH: H,
        geometry: { hostPaths: HOST_PATHS },
      })
    ).toEqual(sampleEdgeAnchors(HOST_PATHS, {}));
  });
});

describe('resolveHostAnchors — the explicit mode override', () => {
  it("mode:'semantic' keeps the render's anchorMode authoritative over isEdgeHost", () => {
    // MotifPattern keys off the resolved `anchorMode` its router handed it, not
    // off isEdgeHost. Forcing the mode must therefore run the semantic extractor
    // even on a pattern the by-type test calls an edge host.
    const params = { cols: 6, rows: 6, drawVertical: 1, drawHorizontal: 0 };
    const anchors = resolveHostAnchors({
      patternType: 'grid',
      params,
      canvasW: W,
      canvasH: H,
      geometry: { hostPaths: HOST_PATHS },
      hostSeed: 3,
      mode: 'semantic',
    });
    expect(anchors).toEqual(getSemanticAnchors('grid', params, W, H, { hostSeed: 3 }));
  });

  it("mode:'edge' forces edge sampling on a semantic host", () => {
    const anchors = resolveHostAnchors({
      patternType: 'voronoi',
      params: {},
      canvasW: W,
      canvasH: H,
      geometry: { hostPaths: HOST_PATHS, ...VORONOI_GEO },
      edgeOpts: { spacing: 24 },
      mode: 'edge',
    });
    expect(anchors).toEqual(sampleEdgeAnchors(HOST_PATHS, { spacing: 24 }));
  });
});

describe('resolveHostAnchors — the resolver and the render router agree', () => {
  // The render router (resolveMotifHost) flattens a stash host's geometry onto
  // the motif's render params by STASH_GEOMETRY_KEYS; MotifPattern then feeds
  // those very params back through this resolver. Both directions must land on
  // the same anchors as the overlay's nested-geometry call.
  const host = (patternType, params) => ({
    id: 'h',
    type: 'pattern',
    patternType,
    params,
    seed: 42,
  });
  const motif = {
    id: 'm',
    type: 'motif',
    patternType: 'motif',
    params: { hostLayerId: 'h', anchorMode: 'semantic', binding: {} },
  };

  it('circlepacking: router-flattened params resolve to the overlay’s anchors', () => {
    const layers = [host('circlepacking', { attempts: 400 }), motif];
    const p = resolveMotifHostParams(motif, layers, { h: { circles: CIRCLES } });
    const viaRouter = resolveHostAnchors({
      patternType: p.hostPatternType,
      params: p.hostParams,
      canvasW: W,
      canvasH: H,
      geometry: p, // stash keys ride flattened on the render params
      hostSeed: p.hostSeed,
      mode: 'semantic',
    });
    const viaOverlay = resolveHostAnchors({
      patternType: 'circlepacking',
      params: { attempts: 400 },
      canvasW: W,
      canvasH: H,
      geometry: { circles: CIRCLES },
      hostSeed: 42,
    });
    expect(viaRouter).toEqual(viaOverlay);
    expect(viaRouter).toHaveLength(3);
  });

  it('voronoi: router-flattened params resolve to the overlay’s anchors', () => {
    const layers = [host('voronoi', { cellCount: 12 }), motif];
    const p = resolveMotifHostParams(motif, layers, { h: VORONOI_GEO });
    const viaRouter = resolveHostAnchors({
      patternType: p.hostPatternType,
      params: p.hostParams,
      canvasW: W,
      canvasH: H,
      geometry: p,
      hostSeed: p.hostSeed,
      mode: 'semantic',
    });
    const viaOverlay = resolveHostAnchors({
      patternType: 'voronoi',
      params: { cellCount: 12 },
      canvasW: W,
      canvasH: H,
      geometry: VORONOI_GEO,
      hostSeed: 42,
    });
    expect(viaRouter).toEqual(viaOverlay);
    expect(viaRouter.length).toBeGreaterThan(0);
  });

  it('an unprobed host through the router also resolves to nothing', () => {
    const layers = [host('circlepacking', {}), motif];
    const p = resolveMotifHostParams(motif, layers, {}); // no geometry harvested
    expect(
      resolveHostAnchors({
        patternType: p.hostPatternType,
        params: p.hostParams,
        canvasW: W,
        canvasH: H,
        geometry: p,
        hostSeed: p.hostSeed,
        mode: 'semantic',
      })
    ).toBeNull();
  });
});
