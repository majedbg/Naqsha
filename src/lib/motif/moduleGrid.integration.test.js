// Module Grid as a motif host, END TO END (#151): the real pattern stashes its
// resolved per-cell data → resolveMotifHost forwards it → getSemanticAnchors
// turns it into `cell` anchors carrying `hostRadius` AND the module's rotation →
// the placement engine fits one glyph inside each module, turned with it.
//
// EVERY assertion counts ACCEPTED PLACEMENTS (`placements.length` / the
// `placements` array), never `placementStats.placed` — that counter is
// initialised to the post-cap CANDIDATE count, before the no-fit, below-floor and
// rest rejections, so it will happily report glyphs that were rejected.

import { describe, it, expect } from 'vitest';
import ModuleGrid from '../patterns/ModuleGrid.js';
import { RecordingContext } from '../patterns/drawingContext.js';
import MotifPattern from './MotifPattern.js';
import { getSemanticAnchors } from './semanticAnchors.js';
import { placeMotifs } from './placementEngine.js';
import { resolveMotifHostParams } from './resolveMotifHost.js';
import { resolveHostAnchors } from './hostAnchors.js';
import { defaultMotifAddOpts } from './defaultBinding.js';
import { getGlyph } from './glyphs.js';
import { rolesForHost } from './hostRoles.js';
import { hostAvailability } from './hostCapability.js';
import {
  isMotifHost,
  isSemanticHost,
  isEdgeHost,
  isStashHost,
  defaultRolesForHost,
} from './hostKinds.js';

const W = 800;
const H = 600;
const BOUNDARY = { type: 'rect', width: W, height: H };
const PARAMS = { tilesX: 4, tilesY: 3, lineCount: 4 };
const N_CELLS = PARAMS.tilesX * PARAMS.tilesY;

/** Sizing that lets the HOST CELL, not the layer size, decide the glyph radius. */
const HOST_SIZED = { placement: { sizing: { mode: 'proportional', size: 1000, min: 0, margin: 0.9 } } };

/** Run the real pattern and return its stashed per-cell data. */
function grid(params = {}, seed = 11) {
  const inst = new ModuleGrid();
  inst.generate(
    new RecordingContext({ seed: 1 }),
    seed,
    { ...PARAMS, ...params },
    W,
    H,
    '#000000',
    100
  );
  return inst.motifHostGeometry.cells;
}

/** The anchors a motif on this Module Grid would actually see. */
function anchorsFor(params = {}, seed = 11) {
  return getSemanticAnchors('modulegrid', { ...PARAMS, ...params }, W, H, {
    cells: grid(params, seed),
  });
}

const place = (params = {}, binding = HOST_SIZED, seed = 11) =>
  placeMotifs(anchorsFor(params, seed), binding, {
    canvasW: W,
    canvasH: H,
    boundary: BOUNDARY,
  }).placements;

describe('Module Grid is a motif host', () => {
  it('is registered as a SEMANTIC, STASH-backed host defaulting to the cell role', () => {
    expect(isMotifHost('modulegrid')).toBe(true);
    expect(isSemanticHost('modulegrid')).toBe(true);
    expect(isStashHost('modulegrid')).toBe(true);
    // The probe is a single boolean — a stash host must NOT also be an edge host.
    expect(isEdgeHost('modulegrid', PARAMS)).toBe(false);
    expect(defaultRolesForHost('modulegrid')).toEqual(['cell']);
  });

  it('the Route block offers Cells and no other role', () => {
    expect(rolesForHost('modulegrid', PARAMS)).toEqual(['cell']);
    // Params-independent: no gating on module shape, and NO crossings — Module
    // Grid's lattice is never painted, so a glyph at an intersection would sit on
    // nothing visible.
    for (const module of ['sideSweep', 'fan', 'rings', 'chevron', 'diamond']) {
      expect([module, rolesForHost('modulegrid', { ...PARAMS, module })]).toEqual([
        module,
        ['cell'],
      ]);
    }
    // And by type alone (the pre-render binding writers' single-arg call).
    expect(rolesForHost('modulegrid')).toEqual(['cell']);
  });

  it('is AVAILABLE at every params — no blank-plate gate', () => {
    expect(hostAvailability('modulegrid', PARAMS).available).toBe(true);
    expect(hostAvailability('modulegrid', { ...PARAMS, module: 'rings' }).available).toBe(true);
  });

  it('the REAL "+ Add Motif" path routes to cells and semantic anchoring', () => {
    // THE SILENT-FAILURE GUARD. A fixture that hand-picks roles passes even when
    // DEFAULT_SEMANTIC_ROLE has no entry for this host — the map falls back to
    // 'edge', defaultMotifAddOpts writes that into binding.selection.roles, the
    // Route filter drops every cell anchor, and the first motif a maker adds shows
    // no glyphs AND no dots while every unit test stays green. So go through the
    // real add path, and place with the binding it actually produces.
    const opts = defaultMotifAddOpts('modulegrid', 'leaf');
    expect(opts.anchorMode).toBe('semantic');
    expect(opts.binding.selection.roles).toEqual(['cell']);
    const { placements } = placeMotifs(anchorsFor(), opts.binding, {
      canvasW: W,
      canvasH: H,
      boundary: BOUNDARY,
      // #207: the default add-path binding packs by the TIGHT law, which reads
      // the glyph's measured footprint and throws without one. The real add path
      // always has it — `opts.glyphRef` is what it was called with.
      glyph: getGlyph(opts.glyphRef),
    });
    expect(placements).toHaveLength(N_CELLS);
  });

  it('resolveMotifHostParams forwards the host\'s stashed cells to the extractor', () => {
    const host = { id: 'h1', patternType: 'modulegrid', params: PARAMS, seed: 11 };
    const motif = { id: 'm1', patternType: 'motif', params: { hostLayerId: 'h1' } };
    const resolved = resolveMotifHostParams(motif, [host, motif], { h1: { cells: grid() } });
    expect(resolved.hostPatternType).toBe('modulegrid');
    expect(resolved.cells).toHaveLength(N_CELLS);
    // No anchorMode override — this is a SEMANTIC host, not an edge host.
    expect(resolved.anchorMode).toBeUndefined();
  });

  it('a host that has not been probed yet degrades to null anchors, not a throw', () => {
    expect(getSemanticAnchors('modulegrid', PARAMS, W, H, {})).toBeNull();
    expect(getSemanticAnchors('modulegrid', PARAMS, W, H)).toBeNull();
    // An EMPTY cells array is an honest empty anchor set, NOT null.
    expect(getSemanticAnchors('modulegrid', PARAMS, W, H, { cells: [] })).toEqual([]);
  });
});

describe('Module Grid places one glyph per module', () => {
  it('selecting Module Grid as a host places one glyph per module', () => {
    const anchors = anchorsFor();
    expect(anchors).toHaveLength(N_CELLS);
    expect(place()).toHaveLength(N_CELLS);
    // Scales with the grid, not a coincidence of 4×3.
    expect(anchorsFor({ tilesX: 7, tilesY: 5 })).toHaveLength(35);
    expect(place({ tilesX: 7, tilesY: 5 })).toHaveLength(35);
  });

  it('EVERY module shape hosts cells, RING MODULES INCLUDED', () => {
    // PRD #143 records the mistake of gating ring modules out on the belief that
    // they draw with operations the capture ignores. That is a CAPTURE-channel
    // concern; on the STASH channel the centre, rotation and half are all known.
    for (const module of ['sideSweep', 'fan', 'rings', 'chevron', 'diamond']) {
      expect([module, place({ module }).length]).toEqual([module, N_CELLS]);
    }
    // Both ring draw paths.
    expect(place({ module: 'rings', ringEccentricity: 0 })).toHaveLength(N_CELLS);
    expect(place({ module: 'rings', ringEccentricity: 0.6 })).toHaveLength(N_CELLS);
    // …and the placements are IDENTICAL whatever the module: the module is a
    // look, not a capability.
    const reference = place({ module: 'sideSweep' });
    expect(place({ module: 'rings' })).toEqual(reference);
    expect(place({ module: 'diamond' })).toEqual(reference);
  });

  it('the RENDERER stamps one glyph per module — MotifPattern threads `cells` through', () => {
    // The last link in the chain, and the only one the other tests skip: every
    // module either side of MotifPattern is exercised directly, so a typo in the
    // key it forwards to getSemanticAnchors would leave the suite green while the
    // feature rendered nothing.
    const cells = grid();
    const opts = defaultMotifAddOpts('modulegrid', 'leaf');
    const inst = new MotifPattern();
    inst.generateWithContext(
      new RecordingContext({ seed: 1 }),
      11,
      {
        glyphRef: 'leaf',
        anchorMode: 'semantic',
        hostPatternType: 'modulegrid',
        hostParams: { ...PARAMS },
        cells,
        binding: opts.binding,
      },
      W,
      H,
      '#123456',
      100
    );
    // lastPlacementPositions IS the accepted, post-cap placement list.
    expect(inst.lastPlacementPositions).toHaveLength(N_CELLS);
    expect(inst.svgElements).toHaveLength(N_CELLS);
    inst.lastPlacementPositions.forEach((pos, i) => {
      expect(pos.x).toBeCloseTo(cells[i].x, 9);
      expect(pos.y).toBeCloseTo(cells[i].y, 9);
    });
  });
});

describe('Module Grid glyphs inherit their module\'s rotation', () => {
  it('each glyph turns by exactly its module\'s rotation', () => {
    // 'gradient' rotation is closed-form — rot = (col/tilesX + row/tilesY)·π — so
    // the expectation is hand-authored rather than an RNG replay. Compare against
    // the SAME grid drawn 'aligned' (rotation 0 everywhere): rotation does not
    // move a cell centre, so glyph i corresponds to glyph i.
    const flat = place({ rotateMode: 'aligned' });
    const turned = place({ rotateMode: 'gradient' });
    expect(turned).toHaveLength(N_CELLS);
    const { tilesX, tilesY } = PARAMS;
    turned.forEach((p, i) => {
      const col = i % tilesX;
      const row = Math.floor(i / tilesX);
      const expected = ((col / tilesX + row / tilesY) * Math.PI * 180) / Math.PI;
      const delta = ((p.rotation - flat[i].rotation) % 360 + 360) % 360;
      expect([i, Number(delta.toFixed(6))]).toEqual([i, Number((expected % 360).toFixed(6))]);
      // Rotation changes orientation only, never position or size.
      expect(p.x).toBeCloseTo(flat[i].x, 9);
      expect(p.y).toBeCloseTo(flat[i].y, 9);
      expect(p.radius).toBeCloseTo(flat[i].radius, 9);
    });
  });

  it('a SEEDED grid gives a spread of distinct glyph rotations', () => {
    const rotations = place().map((p) => p.rotation);
    expect(new Set(rotations.map((r) => r.toFixed(6))).size).toBeGreaterThan(1);
    // …and an ALIGNED grid gives one shared rotation, proving the spread above
    // comes from the host and not from the engine.
    expect(new Set(place({ rotateMode: 'aligned' }).map((p) => p.rotation)).size).toBe(1);
  });

  it('the anchors themselves carry the rotation as tangent/normal', () => {
    const anchors = anchorsFor({ rotateMode: 'gradient' });
    const cells = grid({ rotateMode: 'gradient' });
    anchors.forEach((a, i) => {
      expect(a.tangent).toBeCloseTo(cells[i].rotation, 12);
      expect(a.normal).toBeCloseTo(cells[i].rotation + Math.PI / 2, 12);
    });
  });
});

describe('Module Grid glyphs are sized to their module cell', () => {
  it('a DENSER grid produces smaller glyphs', () => {
    const coarse = place({ tilesX: 4, tilesY: 3 });
    const dense = place({ tilesX: 12, tilesY: 9 });
    expect(coarse).toHaveLength(12);
    expect(dense).toHaveLength(108);
    const maxR = (ps) => Math.max(...ps.map((p) => p.radius));
    expect(maxR(dense)).toBeLessThan(maxR(coarse));
    // Cell half-extent scales as 1/density, and so does the glyph: 12×9 is 3×
    // denser than 4×3 on this canvas.
    expect(maxR(coarse) / maxR(dense)).toBeCloseTo(3, 6);
  });

  it('no two glyphs overlap, at any density', () => {
    for (const tiles of [[4, 3], [8, 6], [12, 9]]) {
      const ps = place({ tilesX: tiles[0], tilesY: tiles[1] });
      for (let i = 0; i < ps.length; i++) {
        for (let j = i + 1; j < ps.length; j++) {
          const d = Math.hypot(ps[i].x - ps[j].x, ps[i].y - ps[j].y);
          expect([tiles.join('x'), i, j, d >= ps[i].radius + ps[j].radius - 1e-9]).toEqual([
            tiles.join('x'),
            i,
            j,
            true,
          ]);
        }
      }
    }
  });

  it('each glyph is contained by the module cell it occupies', () => {
    const cells = grid({ rotateMode: 'gradient' });
    for (const p of place({ rotateMode: 'gradient' })) {
      const c = cells[Number(p.anchorId.split(':')[1])];
      const d = Math.hypot(p.x - c.x, p.y - c.y);
      expect(p.radius + d).toBeLessThanOrEqual(c.half + 1e-9);
    }
  });

  it('the layer size stays a CEILING — host sizing never grows a glyph', () => {
    const small = placeMotifs(
      anchorsFor(),
      { placement: { sizing: { mode: 'proportional', size: 12, min: 0, margin: 0.9 } } },
      { canvasW: W, canvasH: H, boundary: BOUNDARY }
    ).placements;
    expect(small).toHaveLength(N_CELLS);
    for (const p of small) expect(p.radius).toBeLessThanOrEqual(12 + 1e-9);
  });
});

describe('Module Grid per-cell jitter and scale move and resize the anchors', () => {
  it('per-cell SCALE resizes the anchors with their modules', () => {
    const base = anchorsFor({ rotateMode: 'aligned' });
    const big = anchorsFor({ rotateMode: 'aligned', scale: 1.4 });
    base.forEach((a, i) => {
      expect(big[i].hostRadius).toBeCloseTo(a.hostRadius * 1.4, 9);
      expect(big[i].x).toBeCloseTo(a.x, 9); // spacing stays on the TRUE half
    });
    // And the glyphs really are resized by it. Scale DOWN to read the host cap:
    // at scale >= 1 on this grid the binding constraint is the empty-circle /
    // boundary term (margin × 100), not the container, so a scale-up would prove
    // nothing about the channel under test.
    const rSmall = place({ rotateMode: 'aligned', scale: 0.5 }).map((p) => p.radius);
    const rMid = place({ rotateMode: 'aligned', scale: 0.8 }).map((p) => p.radius);
    const rFull = place({ rotateMode: 'aligned' }).map((p) => p.radius);
    rSmall.forEach((r, i) => {
      expect([i, r < rMid[i], rMid[i] < rFull[i]]).toEqual([i, true, true]);
      // 0.9 × (100 × scale) — hand-authored from the pattern's own rule.
      expect(r).toBeCloseTo(0.9 * 50, 9);
      expect(rMid[i]).toBeCloseTo(0.9 * 80, 9);
    });
  });

  it('a GRADIENT scale gives per-cell radii, not one shared value', () => {
    const anchors = anchorsFor({ rotateMode: 'aligned', scaleMode: 'gradient' });
    expect(new Set(anchors.map((a) => a.hostRadius.toFixed(9))).size).toBeGreaterThan(1);
    const radii = place({ rotateMode: 'aligned', scaleMode: 'gradient' }).map((p) => p.radius);
    expect(new Set(radii.map((r) => r.toFixed(6))).size).toBeGreaterThan(1);
  });

  it('per-cell JITTER moves the anchors with their modules', () => {
    const base = anchorsFor({ rotateMode: 'aligned' });
    const jittered = anchorsFor({ rotateMode: 'aligned', jitter: 0.5 });
    expect(jittered).toHaveLength(base.length);
    let moved = 0;
    base.forEach((a, i) => {
      if (Math.hypot(jittered[i].x - a.x, jittered[i].y - a.y) > 1e-9) moved += 1;
      // Jitter never changes the container size.
      expect(jittered[i].hostRadius).toBeCloseTo(a.hostRadius, 9);
    });
    expect(moved).toBe(N_CELLS);
    // And the glyphs land on the jittered centres.
    const cells = grid({ rotateMode: 'aligned', jitter: 0.5 });
    place({ rotateMode: 'aligned', jitter: 0.5 }).forEach((p) => {
      const c = cells[Number(p.anchorId.split(':')[1])];
      expect(p.x).toBeCloseTo(c.x, 9);
      expect(p.y).toBeCloseTo(c.y, 9);
    });
  });
});

describe('Module Grid anchors land in the painted frame', () => {
  it('a start angle and offsets carry the anchors with the paint', () => {
    const A = 25;
    const D = 30;
    const E = -12;
    const a = (A * Math.PI) / 180;
    const base = anchorsFor({ rotateMode: 'gradient' });
    const moved = anchorsFor({ rotateMode: 'gradient', startAngle: A, offsetX: D, offsetY: E });
    expect(moved).toHaveLength(base.length);
    // world = R(a)·centred + (W/2 + offsetX, H/2 + offsetY) — hand-authored.
    base.forEach((anchor, i) => {
      const px = anchor.x - W / 2;
      const py = anchor.y - H / 2;
      expect(moved[i].x).toBeCloseTo(px * Math.cos(a) - py * Math.sin(a) + W / 2 + D, 6);
      expect(moved[i].y).toBeCloseTo(px * Math.sin(a) + py * Math.cos(a) + H / 2 + E, 6);
      expect(moved[i].hostRadius).toBeCloseTo(anchor.hostRadius, 12);
      // ORIENTATION rides the start angle too — the whole paint is rotated.
      expect(moved[i].tangent).toBeCloseTo(anchor.tangent + a, 9);
      expect(moved[i].normal).toBeCloseTo(anchor.normal + a, 9);
    });
    // …and the GLYPHS turn with it: every placement gains the same start angle.
    // Matched by anchorId, not by index — a rotated + offset grid pushes some
    // cells past the canvas edge, so the two placement lists differ in length.
    const flat = place({ rotateMode: 'gradient' });
    const turned = place({ rotateMode: 'gradient', startAngle: A, offsetX: D, offsetY: E });
    const byId = new Map(flat.map((p) => [p.anchorId, p]));
    expect(turned.length).toBeGreaterThan(0);
    for (const p of turned) {
      const before = byId.get(p.anchorId);
      expect(before).toBeDefined();
      const delta = (((p.rotation - before.rotation) % 360) + 360) % 360;
      expect([p.anchorId, Number(delta.toFixed(6))]).toEqual([p.anchorId, A]);
    }
  });

  it('the same host and seed produce the same anchors every render', () => {
    expect(anchorsFor()).toEqual(anchorsFor());
    expect(place()).toEqual(place());
    // A different seed re-rolls the seeded rotations.
    expect(place({}, HOST_SIZED, 12)).not.toEqual(place({}, HOST_SIZED, 11));
  });
});

describe('Module Grid inherits the shared host-anchor resolver (#149)', () => {
  it('the OVERLAY resolves exactly the anchors the renderer places', () => {
    // Editable override dots + the glyph popover come from resolveHostAnchors,
    // the one module both the overlay and the render router call. It must answer
    // identically for a stash-backed host it has never heard of by name.
    const cells = grid();
    const viaResolver = resolveHostAnchors({
      patternType: 'modulegrid',
      params: PARAMS,
      canvasW: W,
      canvasH: H,
      geometry: { cells }, // the shape the overlay reads off patternInstances
    });
    expect(viaResolver).toEqual(anchorsFor());
    expect(viaResolver).toHaveLength(N_CELLS);
    // Every dot has an id the override records can match.
    expect(viaResolver.map((a) => a.id)).toEqual(
      Array.from({ length: N_CELLS }, (_, i) => `cell:${i}`)
    );
  });

  it('an unprobed host resolves to nothing rather than throwing', () => {
    expect(
      resolveHostAnchors({ patternType: 'modulegrid', params: PARAMS, canvasW: W, canvasH: H })
    ).toBeNull();
    expect(
      resolveHostAnchors({
        patternType: 'modulegrid',
        params: PARAMS,
        canvasW: W,
        canvasH: H,
        geometry: { cells: [] },
      })
    ).toEqual([]);
  });
});

describe('the shared stash-key contract', () => {
  // `cells` joins STASH_GEOMETRY_KEYS, which resolveMotifHost and
  // pickStashGeometry both forward for EVERY stash host — so from here on each
  // host receives keys it does not own. Nothing renders wrong today (no other
  // host publishes `cells`), but #152 and #153 are about to add keys to the same
  // list, so the blindness is pinned rather than left to a grep.
  const EDGES = [
    { x1: 100, y1: 100, x2: 300, y2: 100 },
    { x1: 300, y1: 100, x2: 300, y2: 300 },
    { x1: 300, y1: 300, x2: 100, y2: 300 },
    { x1: 100, y1: 300, x2: 100, y2: 100 },
  ];
  const SITES = [{ x: 200, y: 200 }];
  // #153 added `arcs` (Truchet's per-tile drawn paths) to the same list, so it is
  // now forwarded to these hosts too and belongs in the bag.
  const ARCS = [{ points: [{ x: 10, y: 10 }, { x: 90, y: 10 }], closed: false, copy: 0, tile: 0 }];

  it('a host IGNORES stash keys it does not own', () => {
    // voronoi must not see `cells` or `arcs`…
    const voronoiOwn = getSemanticAnchors('voronoi', {}, W, H, {
      drawnEdges: EDGES,
      sites: SITES,
    });
    expect(voronoiOwn.length).toBeGreaterThan(0);
    expect(
      getSemanticAnchors('voronoi', {}, W, H, {
        drawnEdges: EDGES,
        sites: SITES,
        cells: grid(),
        arcs: ARCS,
      })
    ).toEqual(voronoiOwn);

    // …and modulegrid must not see `circles`, `drawnEdges` or `arcs`.
    const cells = grid();
    expect(
      getSemanticAnchors('modulegrid', PARAMS, W, H, {
        cells,
        circles: [{ x: 1, y: 2, r: 3 }],
        drawnEdges: EDGES,
        sites: SITES,
        arcs: ARCS,
      })
    ).toEqual(getSemanticAnchors('modulegrid', PARAMS, W, H, { cells }));

    // A host given ONLY someone else's key is unprobed, not empty.
    expect(getSemanticAnchors('modulegrid', PARAMS, W, H, { circles: [{ x: 1, y: 2, r: 3 }] }))
      .toBeNull();
    expect(getSemanticAnchors('modulegrid', PARAMS, W, H, { arcs: ARCS })).toBeNull();
    expect(getSemanticAnchors('voronoi', {}, W, H, { cells })).toBeNull();
    expect(getSemanticAnchors('voronoi', {}, W, H, { arcs: ARCS })).toBeNull();
  });
});

describe('Module Grid composes with the Chain', () => {
  const chain = (selection) =>
    placeMotifs(
      anchorsFor(),
      { selection: { roles: ['cell'], ...selection }, ...HOST_SIZED },
      { canvasW: W, canvasH: H, boundary: BOUNDARY }
    ).placements;

  it('the RATE (every-Nth) block thins the grid\'s anchors', () => {
    expect(chain({ rate: { n: 3, offset: 0 } })).toHaveLength(Math.ceil(N_CELLS / 3));
  });

  it('the SKIP block thins the grid\'s anchors', () => {
    expect(chain({ skip: [false, true] })).toHaveLength(Math.ceil(N_CELLS / 2));
  });

  it('the DENSITY block thins the grid\'s anchors, reproducibly', () => {
    const sparse = chain({ density: 0.4, seed: 3 });
    expect(sparse.length).toBeGreaterThan(0);
    expect(sparse.length).toBeLessThan(N_CELLS);
    expect(chain({ density: 0.4, seed: 3 })).toEqual(sparse);
  });

  it('a cell below the size floor receives NO placement', () => {
    const { placements, rejected } = placeMotifs(
      anchorsFor({ tilesX: 20, tilesY: 15 }),
      {
        selection: { roles: ['cell'] },
        placement: { sizing: { mode: 'proportional', size: 1000, min: 30, margin: 0.9 } },
      },
      { canvasW: W, canvasH: H, boundary: BOUNDARY }
    );
    // half = min(800/20, 600/15)/2 = 20 ⇒ 0.9 × 20 = 18 < the floor of 30.
    expect(placements).toEqual([]);
    expect(rejected.filter((r) => r.reason === 'below-floor')).toHaveLength(300);
  });
});
