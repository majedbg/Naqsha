// Truchet as a CELL + EDGE motif host, END TO END (#153, PRD #143): the real
// pattern stashes its tile centres AND its per-tile drawn paths → resolveMotifHost
// forwards both → getSemanticAnchors turns them into `cell` anchors carrying
// `hostRadius` and `edge` anchors running along each arc → the placement engine
// fits one glyph inside each tile and deals a run along every arc.
//
// EVERY assertion counts ACCEPTED PLACEMENTS (`placements.length` / the
// `placements` array), never `placementStats.placed` — that counter is
// initialised to the post-cap CANDIDATE count, before the no-fit, below-floor and
// rest rejections, so it will happily report glyphs that were rejected.
//
// WHY ANCHOR COUNTS, NOT PLACEMENT COUNTS, FOR SYMMETRY. Radial copies of a
// square tiling overlap heavily near the centre, so the greedy empty-circle test
// legitimately rejects glyphs on the copies. The claim "motifs appear on every
// symmetry copy, with an anchor count scaling by the symmetry factor" is a claim
// about ANCHORS; placement counts would measure the packer, not the extractor.

import { describe, it, expect } from 'vitest';
import Truchet from '../patterns/extras/Truchet.js';
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
  EDGE_MOTIF_HOSTS,
} from './hostKinds.js';

const W = 800;
const H = 600;
const BOUNDARY = { type: 'rect', width: W, height: H };
const TILES = 6;
const PARAMS = { tiles: TILES, tileSet: 'arcs' };
const N_TILES = TILES * TILES;
/** cell = min(W,H)/cols, and the host radius is its inscribed radius. */
const HALF = Math.min(W, H) / TILES / 2;
/** Sample count per arc — the extractor's own fixed run length. */
const PER_ARC = 3;
const TILE_SETS = ['arcs', 'diagonals', 'triangles'];
/** Drawn paths per tile: two quarter-arcs, one diagonal, one triangle outline. */
const PATHS_PER_TILE = { arcs: 2, diagonals: 1, triangles: 1 };

/** Sizing that lets the HOST TILE, not the layer size, decide the glyph radius. */
const HOST_SIZED = {
  placement: { sizing: { mode: 'proportional', size: 1000, min: 0, margin: 0.9 } },
};

/** Run the real pattern and return its whole stash. */
function truchet(params = {}, seed = 11) {
  const inst = new Truchet();
  inst.generate(
    new RecordingContext({ seed: 1 }),
    seed,
    { ...PARAMS, ...params },
    W,
    H,
    '#000000',
    100
  );
  return inst.motifHostGeometry;
}

/** The anchors a motif on this Truchet would actually see. */
function anchorsFor(params = {}, seed = 11) {
  return getSemanticAnchors('truchet', { ...PARAMS, ...params }, W, H, truchet(params, seed));
}

const byRole = (anchors, role) => anchors.filter((a) => a.role === role);

const place = (params = {}, binding = HOST_SIZED, seed = 11) =>
  placeMotifs(anchorsFor(params, seed), { selection: { roles: ['cell'] }, ...binding }, {
    canvasW: W,
    canvasH: H,
    boundary: BOUNDARY,
  }).placements;

describe('Truchet is a motif host', () => {
  it('is registered as a SEMANTIC, STASH-backed host defaulting to the cell role', () => {
    expect(isMotifHost('truchet')).toBe(true);
    expect(isSemanticHost('truchet')).toBe(true);
    expect(isSemanticHost('truchet', PARAMS)).toBe(true);
    expect(isStashHost('truchet')).toBe(true);
    expect(defaultRolesForHost('truchet')).toEqual(['cell']);
  });

  it('is NOT in the edge-host set — that is what keeps its CELL role', () => {
    // The regression guard #144 left in place, and the reason it exists: the
    // geometry probe is a SINGLE BOOLEAN (record the draw stream OR read the
    // stash, never both), so listing Truchet as an edge host would silently cost
    // it cells. Its edges come from the stash instead.
    expect(EDGE_MOTIF_HOSTS.has('truchet')).toBe(false);
    expect(isEdgeHost('truchet')).toBe(false);
    for (const tileSet of TILE_SETS) {
      expect([tileSet, isEdgeHost('truchet', { ...PARAMS, tileSet })]).toEqual([tileSet, false]);
    }
    // …and the host really does emit cells, which is the thing membership would
    // have cost. (Asserted here so the guard above can never pass vacuously.)
    expect(byRole(anchorsFor(), 'cell')).toHaveLength(N_TILES);
  });

  it('the Route block offers Cells and Edges on Truchet', () => {
    expect(rolesForHost('truchet', PARAMS)).toEqual(['edge', 'cell']);
    // By type alone (the pre-render binding writers' single-arg call).
    expect(rolesForHost('truchet')).toEqual(['edge', 'cell']);
    // No params gating: EVERY tile set, in BOTH spellings — the UI slider sends
    // the numeric index while the pattern's destructure default is the string.
    for (const tileSet of [...TILE_SETS, 0, 1, 2]) {
      expect([tileSet, rolesForHost('truchet', { ...PARAMS, tileSet })]).toEqual([
        tileSet,
        ['edge', 'cell'],
      ]);
    }
    // And no crossings or tips: a Truchet has no lattice intersection and no free
    // terminus a glyph could sit on.
    expect(rolesForHost('truchet', PARAMS)).not.toContain('crossing');
    expect(rolesForHost('truchet', PARAMS)).not.toContain('tip');
  });

  it('is AVAILABLE at every params — no blank-plate gate', () => {
    for (const tileSet of TILE_SETS) {
      expect(hostAvailability('truchet', { ...PARAMS, tileSet }).available).toBe(true);
    }
  });

  it('the REAL "+ Add Motif" path routes to cells and semantic anchoring', () => {
    // THE SILENT-FAILURE GUARD (mirrors #146/#151). A fixture that hand-picks
    // roles passes even when DEFAULT_SEMANTIC_ROLE has no entry for this host —
    // the map falls back to 'edge', defaultMotifAddOpts writes that into
    // binding.selection.roles, and the first motif a maker adds would show a run
    // along the arcs rather than the tile fill the host defaults to.
    const opts = defaultMotifAddOpts('truchet', 'leaf');
    expect(opts.anchorMode).toBe('semantic');
    expect(opts.binding.selection.roles).toEqual(['cell']);
    // THE GLYPH RIDES WITH THE BINDING (#207). `defaultMotifAddOpts` now writes
    // `sizing.footprint: 'tight'`, so the packer reads the glyph's measured
    // footprint and throws without one — which is the point of testing the REAL
    // add path rather than a hand-built binding: the real path always has a
    // glyph, because `opts.glyphRef` is what it was called with.
    const { placements } = placeMotifs(anchorsFor(), opts.binding, {
      canvasW: W,
      canvasH: H,
      boundary: BOUNDARY,
      glyph: getGlyph(opts.glyphRef),
    });
    expect(placements).toHaveLength(N_TILES);
  });

  it('resolveMotifHostParams forwards BOTH stash keys to the extractor', () => {
    const host = { id: 'h1', patternType: 'truchet', params: PARAMS, seed: 11 };
    const motif = { id: 'm1', patternType: 'motif', params: { hostLayerId: 'h1' } };
    const resolved = resolveMotifHostParams(motif, [host, motif], { h1: truchet() });
    expect(resolved.hostPatternType).toBe('truchet');
    expect(resolved.cells).toHaveLength(N_TILES);
    expect(resolved.arcs).toHaveLength(N_TILES * PATHS_PER_TILE.arcs);
    // No anchorMode override — this is a SEMANTIC host, not an edge host.
    expect(resolved.anchorMode).toBeUndefined();
    expect(resolved.hostPaths).toBeUndefined();
  });

  it('a host that has not been probed yet degrades to null anchors, not a throw', () => {
    expect(getSemanticAnchors('truchet', PARAMS, W, H, {})).toBeNull();
    expect(getSemanticAnchors('truchet', PARAMS, W, H)).toBeNull();
    // EMPTY stash arrays are an honest empty anchor set, NOT null.
    expect(getSemanticAnchors('truchet', PARAMS, W, H, { cells: [], arcs: [] })).toEqual([]);
    // …and either key ALONE is enough to emit what it describes.
    const { cells, arcs } = truchet();
    expect(byRole(getSemanticAnchors('truchet', PARAMS, W, H, { cells }), 'cell')).toHaveLength(
      N_TILES
    );
    expect(getSemanticAnchors('truchet', PARAMS, W, H, { cells })).toHaveLength(N_TILES);
    expect(byRole(getSemanticAnchors('truchet', PARAMS, W, H, { arcs }), 'edge').length).toBe(
      arcs.length * PER_ARC
    );
    expect(getSemanticAnchors('truchet', PARAMS, W, H, { arcs })).toHaveLength(
      arcs.length * PER_ARC
    );
  });
});

describe('Truchet places one glyph per tile', () => {
  it('selecting Truchet as a host places one glyph per tile', () => {
    expect(byRole(anchorsFor(), 'cell')).toHaveLength(N_TILES);
    expect(place()).toHaveLength(N_TILES);
    // Scales with the tiling, not a coincidence of 6×6.
    expect(byRole(anchorsFor({ tiles: 10 }), 'cell')).toHaveLength(100);
    expect(place({ tiles: 10 })).toHaveLength(100);
  });

  it('one anchor at each tile CENTRE, on the pattern\'s own lattice', () => {
    const { cells } = truchet();
    const anchors = byRole(anchorsFor(), 'cell');
    anchors.forEach((a, i) => {
      expect(a.x).toBeCloseTo(cells[i].x, 9);
      expect(a.y).toBeCloseTo(cells[i].y, 9);
      expect(a.hostRadius).toBeCloseTo(HALF, 9);
    });
    // And they really are the tile centres of a 6×6 block centred on the canvas.
    expect(new Set(anchors.map((a) => a.x.toFixed(6))).size).toBe(TILES);
    expect(new Set(anchors.map((a) => a.y.toFixed(6))).size).toBe(TILES);
  });

  it('THE TRIANGLE TILE SET hosts cells and edges like the others', () => {
    // PRD #143 records this mistake as already made once: triangles paint through
    // ctx.triangle, which the record-mode capture ignores — but that is a CAPTURE
    // concern, and Truchet is a STASH host. On the stash channel the three
    // vertices are known. Asserted as stash EQUALITY across every tile set, not as
    // a non-empty check: the tile set is a look, not a capability, so the cells
    // must be literally the same.
    const reference = byRole(anchorsFor({ tileSet: 'arcs' }), 'cell');
    for (const tileSet of TILE_SETS) {
      const cells = byRole(anchorsFor({ tileSet }), 'cell');
      expect([tileSet, cells.length]).toEqual([tileSet, N_TILES]);
      expect([tileSet, cells]).toEqual([tileSet, reference]);
      // …and every tile set carries an edge run too.
      const edges = byRole(anchorsFor({ tileSet }), 'edge');
      expect([tileSet, edges.length]).toEqual([
        tileSet,
        N_TILES * PATHS_PER_TILE[tileSet] * PER_ARC,
      ]);
      // …and the glyphs really land: cells place one per tile whatever the set.
      expect([tileSet, place({ tileSet }).length]).toEqual([tileSet, N_TILES]);
    }
  });

  it('the RENDERER stamps one glyph per tile — MotifPattern threads the stash through', () => {
    // The last link, and the only one the other tests skip: a typo in the key
    // MotifPattern forwards would leave the suite green while nothing rendered.
    const geometry = truchet();
    const opts = defaultMotifAddOpts('truchet', 'leaf');
    const inst = new MotifPattern();
    inst.generateWithContext(
      new RecordingContext({ seed: 1 }),
      11,
      {
        glyphRef: 'leaf',
        anchorMode: 'semantic',
        hostPatternType: 'truchet',
        hostParams: { ...PARAMS },
        ...geometry,
        binding: opts.binding,
      },
      W,
      H,
      '#123456',
      100
    );
    expect(inst.lastPlacementPositions).toHaveLength(N_TILES);
    expect(inst.svgElements).toHaveLength(N_TILES);
    inst.lastPlacementPositions.forEach((pos, i) => {
      expect(pos.x).toBeCloseTo(geometry.cells[i].x, 9);
      expect(pos.y).toBeCloseTo(geometry.cells[i].y, 9);
    });
  });
});

describe('Truchet glyphs are sized to the tile', () => {
  it('raising the tile count shrinks the glyphs to match', () => {
    const coarse = place({ tiles: 6 });
    const dense = place({ tiles: 12 });
    expect(coarse).toHaveLength(36);
    expect(dense).toHaveLength(144);
    const maxR = (ps) => Math.max(...ps.map((p) => p.radius));
    expect(maxR(dense)).toBeLessThan(maxR(coarse));
    // Tile half-extent scales as 1/tiles, and so does the glyph.
    expect(maxR(coarse) / maxR(dense)).toBeCloseTo(2, 6);
    // Hand-authored from the pattern's own rule: margin × min(W,H)/tiles/2.
    for (const p of coarse) expect(p.radius).toBeCloseTo(0.9 * 50, 9);
    for (const p of dense) expect(p.radius).toBeCloseTo(0.9 * 25, 9);
  });

  it('the hostRadius channel really is what does it', () => {
    const anchors = byRole(anchorsFor({ tiles: 12 }), 'cell');
    expect(anchors).toHaveLength(144);
    for (const a of anchors) expect(a.hostRadius).toBeCloseTo(25, 9);
    // EDGE anchors declare NO container — nothing is painted around them.
    for (const a of byRole(anchorsFor(), 'edge')) expect(a.hostRadius).toBeUndefined();
  });

  it('each glyph is contained by the tile it occupies', () => {
    const { cells } = truchet();
    for (const p of place()) {
      const c = cells[Number(p.anchorId.split(':')[1])];
      const d = Math.hypot(p.x - c.x, p.y - c.y);
      expect(p.radius + d).toBeLessThanOrEqual(HALF + 1e-9);
    }
  });

  it('the layer size stays a CEILING — host sizing never grows a glyph', () => {
    const small = placeMotifs(
      anchorsFor(),
      {
        selection: { roles: ['cell'] },
        placement: { sizing: { mode: 'proportional', size: 12, min: 0, margin: 0.9 } },
      },
      { canvasW: W, canvasH: H, boundary: BOUNDARY }
    ).placements;
    expect(small).toHaveLength(N_TILES);
    for (const p of small) expect(p.radius).toBeLessThanOrEqual(12 + 1e-9);
  });
});

describe('Truchet glyphs run along the arcs', () => {
  const edges = (params = {}) => byRole(anchorsFor(params), 'edge');

  it('glyphs run along the arcs', () => {
    const e = edges();
    expect(e).toHaveLength(N_TILES * PATHS_PER_TILE.arcs * PER_ARC);
    const placed = placeMotifs(
      anchorsFor(),
      { selection: { roles: ['edge'] }, placement: { sizing: { mode: 'fixed', size: 3 } } },
      { canvasW: W, canvasH: H, boundary: BOUNDARY }
    ).placements;
    expect(placed).toHaveLength(e.length);
  });

  it('every edge anchor sits ON its stashed arc', () => {
    // Exact-to-paint by construction: an anchor is an arc-length sample of the
    // very polyline the pattern painted. Verified against the stash rather than
    // asserted — a sample that drifted off the arc is the whole failure mode.
    const { arcs } = truchet();
    for (const a of edges()) {
      const pts = arcs[a.meta.pathIndex].points;
      let best = Infinity;
      for (let i = 0; i < pts.length - 1; i++) {
        best = Math.min(best, distToSegment(a, pts[i], pts[i + 1]));
      }
      expect(best).toBeLessThan(1e-6);
    }
  });

  it('each quarter-arc carries its OWN run, with even spacing WITHIN the arc', () => {
    const e = edges();
    // One path per quarter-arc — the runs restart at every tile boundary, which
    // is what "each arc is its own path" means for the Chain and for Zones.
    const paths = new Set(e.map((a) => a.meta.pathIndex));
    expect(paths.size).toBe(N_TILES * PATHS_PER_TILE.arcs);
    const { arcs } = truchet();
    for (const pathIndex of paths) {
      const run = e.filter((a) => a.meta.pathIndex === pathIndex);
      expect(run).toHaveLength(PER_ARC);
      // Even spacing WITHIN the arc: consecutive arc-length gaps are equal.
      const gaps = run.slice(1).map((a, i) => a.s - run[i].s);
      for (const g of gaps) expect(g).toBeCloseTo(gaps[0], 9);
      expect(gaps[0]).toBeGreaterThan(0);
      // …and the run is inset from the arc's ends, so two arcs meeting at a tile
      // edge never stack coincident anchors on the shared endpoint.
      const pts = arcs[pathIndex].points;
      const ends = [pts[0], pts[pts.length - 1]];
      for (const a of run) {
        for (const end of ends) expect(Math.hypot(a.x - end.x, a.y - end.y)).toBeGreaterThan(1e-6);
      }
    }
    // No two edge anchors coincide anywhere in the field.
    expect(new Set(e.map((a) => `${a.x.toFixed(6)},${a.y.toFixed(6)}`)).size).toBe(e.length);
  });

  it('the tangent follows the arc', () => {
    const { arcs } = truchet();
    for (const a of edges()) {
      const pts = arcs[a.meta.pathIndex].points;
      // The arc's overall direction and the anchor's tangent agree to within the
      // curvature of a quarter circle sampled in 16 steps.
      const chord = Math.atan2(pts[pts.length - 1].y - pts[0].y, pts[pts.length - 1].x - pts[0].x);
      const d = Math.abs(((a.tangent - chord + Math.PI) % (2 * Math.PI)) - Math.PI);
      expect(d).toBeLessThan(Math.PI / 3);
    }
  });
});

describe('Truchet anchors land in the painted frame', () => {
  it('a start angle and offsets carry the anchors with the paint', () => {
    const A = 25;
    const D = 30;
    const E = -12;
    const a = (A * Math.PI) / 180;
    const base = anchorsFor();
    const moved = anchorsFor({ startAngle: A, offsetX: D, offsetY: E });
    expect(moved).toHaveLength(base.length);
    // world = R(a)·centred + (W/2 + offsetX, H/2 + offsetY) — hand-authored.
    base.forEach((anchor, i) => {
      const px = anchor.x - W / 2;
      const py = anchor.y - H / 2;
      expect(moved[i].x).toBeCloseTo(px * Math.cos(a) - py * Math.sin(a) + W / 2 + D, 6);
      expect(moved[i].y).toBeCloseTo(px * Math.sin(a) + py * Math.cos(a) + H / 2 + E, 6);
      // ORIENTATION rides the start angle too — the whole paint is rotated.
      expect(moved[i].tangent).toBeCloseTo(anchor.tangent + a, 6);
      expect(moved[i].normal).toBeCloseTo(anchor.normal + a, 6);
      if (anchor.role === 'cell') expect(moved[i].hostRadius).toBeCloseTo(anchor.hostRadius, 12);
    });
    // …and the GLYPHS turn with it. Matched by anchorId, not by index — a rotated
    // and offset tiling pushes some tiles past the canvas edge.
    const flat = place();
    const turned = place({ startAngle: A, offsetX: D, offsetY: E });
    const byId = new Map(flat.map((p) => [p.anchorId, p]));
    expect(turned.length).toBeGreaterThan(0);
    for (const p of turned) {
      const before = byId.get(p.anchorId);
      expect(before).toBeDefined();
      const delta = (((p.rotation - before.rotation) % 360) + 360) % 360;
      expect([p.anchorId, Number(delta.toFixed(6))]).toEqual([p.anchorId, A]);
    }
  });

  it('motifs appear on EVERY radial symmetry copy, with the count scaling by the factor', () => {
    // The regression guard for the base-copy-only bug the studio has already
    // shipped once. Voronoi is the counterexample here, not the precedent.
    for (const n of [1, 2, 3, 5, 7]) {
      const anchors = anchorsFor({ symmetry: n });
      expect([n, byRole(anchors, 'cell').length]).toEqual([n, N_TILES * n]);
      expect([n, byRole(anchors, 'edge').length]).toEqual([
        n,
        N_TILES * PATHS_PER_TILE.arcs * PER_ARC * n,
      ]);
      // Every copy is really THERE, and each is a rigid rotation of the base one.
      const cells = byRole(anchors, 'cell');
      for (let k = 0; k < n; k++) {
        const copy = cells.filter((c) => c.meta.copy === k);
        expect([n, k, copy.length]).toEqual([n, k, N_TILES]);
        const theta = (2 * Math.PI * k) / n;
        copy.forEach((c, i) => {
          const px = cells[i].x - W / 2;
          const py = cells[i].y - H / 2;
          expect(c.x).toBeCloseTo(px * Math.cos(theta) - py * Math.sin(theta) + W / 2, 6);
          expect(c.y).toBeCloseTo(px * Math.sin(theta) + py * Math.cos(theta) + H / 2, 6);
          expect(c.tangent).toBeCloseTo(theta, 9);
        });
      }
    }
  });

  it('glyphs really are stamped on the copies, not only on the base one', () => {
    // ODD symmetries only, and deliberately so. A square tiling centred on the
    // canvas is INVARIANT under a 90° or 180° turn: at symmetry 2 and 4 the
    // copies' tile centres land exactly ON the base copy's, the pattern
    // overdraws itself, and the placement engine's empty-circle test correctly
    // collapses each coincident pair to one glyph. That is the geometry, not a
    // replication failure — which is why the count claim above is asserted on
    // ANCHORS. Fixed sizing so the packer's greedy rejection cannot mask a copy
    // that is genuinely present but crowded.
    const tiny = { placement: { sizing: { mode: 'fixed', size: 2 } } };
    for (const n of [3, 5, 7]) {
      const placed = place({ symmetry: n }, tiny);
      expect([n, new Set(placed.map((p) => anchorCopy(p.anchorId, n))).size]).toEqual([n, n]);
    }
  });

  it('anchor ids follow the normative scheme, suffixed by copy ONLY when n > 1', () => {
    // Ids are what override records match on and what randomised Slots hash, so
    // the scheme is normative. At symmetry 1 there is NO suffix, so a single-copy
    // Truchet keeps override-stable ids.
    const one = anchorsFor();
    expect(byRole(one, 'cell').map((a) => a.id).slice(0, 3)).toEqual(['cell:0', 'cell:1', 'cell:2']);
    expect(byRole(one, 'edge').map((a) => a.id).slice(0, 4)).toEqual([
      'edge:0:0',
      'edge:0:1',
      'edge:0:2',
      'edge:1:0',
    ]);
    const three = anchorsFor({ symmetry: 3 });
    expect(byRole(three, 'cell').map((a) => a.id)).toContain('cell:0:0');
    expect(byRole(three, 'cell').map((a) => a.id)).toContain('cell:35:2');
    expect(byRole(three, 'edge').map((a) => a.id)).toContain('edge:71:2:2');
    // Ids are unique across the whole field.
    expect(new Set(three.map((a) => a.id)).size).toBe(three.length);
    // meta.pathIndex stays GLOBAL so the Chain treats every arc of every copy as
    // its own path, even though the id's arc index is copy-local.
    expect(new Set(byRole(three, 'edge').map((a) => a.meta.pathIndex)).size).toBe(
      N_TILES * PATHS_PER_TILE.arcs * 3
    );
  });

  it('the same host and seed produce the same anchors every render', () => {
    expect(anchorsFor()).toEqual(anchorsFor());
    expect(place()).toEqual(place());
    // A different seed re-rolls the per-tile orientations, so the ARCS move…
    const a11 = byRole(anchorsFor({}, 11), 'edge');
    const a12 = byRole(anchorsFor({}, 12), 'edge');
    expect(a12).not.toEqual(a11);
    // …while the tile centres, which are param-determined, do not.
    expect(byRole(anchorsFor({}, 12), 'cell')).toEqual(byRole(anchorsFor({}, 11), 'cell'));
  });
});

describe('Truchet at the boundaries, not just at the fixture', () => {
  // The extractor replays the pattern's layout rule (cols = max(1, round(tiles)),
  // cell = min(W,H)/cols) to derive the shared half-extent. Anything that made the
  // two disagree would be invisible at the fixture's tidy integer tile count.
  it('DEFAULT params (no tiles at all) still size the glyphs to the tile', () => {
    const stash = (() => {
      const inst = new Truchet();
      inst.generate(new RecordingContext({ seed: 1 }), 11, {}, W, H, '#000', 100);
      return inst.motifHostGeometry;
    })();
    const anchors = getSemanticAnchors('truchet', {}, W, H, stash);
    const cells = byRole(anchors, 'cell');
    expect(cells).toHaveLength(16 * 16); // the pattern's own `tiles = 16` default
    for (const a of cells) expect(a.hostRadius).toBeCloseTo(Math.min(W, H) / 16 / 2, 9);
  });

  it('a tile count below the slider minimum, and a fractional one, both hold', () => {
    for (const tiles of [1, 2, 6.4, 39.5]) {
      const cols = Math.max(1, Math.round(tiles));
      const cells = byRole(anchorsFor({ tiles }), 'cell');
      expect([tiles, cells.length]).toEqual([tiles, cols * cols]);
      expect([tiles, Number(cells[0].hostRadius.toFixed(9))]).toEqual([
        tiles,
        Number((Math.min(W, H) / cols / 2).toFixed(9)),
      ]);
    }
  });

  it('the arc run length is overridable, and a degenerate value falls back', () => {
    const perArc = (edgeSamplesPerArc) =>
      byRole(anchorsFor({ edgeSamplesPerArc }), 'edge').length / (N_TILES * PATHS_PER_TILE.arcs);
    expect(perArc(1)).toBe(1);
    expect(perArc(6)).toBe(6);
    // Degenerate values degrade to the default rather than emitting nothing or
    // throwing — the same shape of guard the rest of the extractors use.
    for (const bad of [0, -3, NaN, null, 'lots']) expect([bad, perArc(bad)]).toEqual([bad, PER_ARC]);
  });
});

describe('Truchet inherits the shared host-anchor resolver (#149)', () => {
  it('the OVERLAY resolves exactly the anchors the renderer places', () => {
    const geometry = truchet();
    const viaResolver = resolveHostAnchors({
      patternType: 'truchet',
      params: PARAMS,
      canvasW: W,
      canvasH: H,
      geometry, // the shape the overlay reads off patternInstances
    });
    expect(viaResolver).toEqual(anchorsFor());
    expect(viaResolver).toHaveLength(N_TILES + N_TILES * PATHS_PER_TILE.arcs * PER_ARC);
  });

  it('an unprobed host resolves to nothing rather than throwing', () => {
    expect(
      resolveHostAnchors({ patternType: 'truchet', params: PARAMS, canvasW: W, canvasH: H })
    ).toBeNull();
    expect(
      resolveHostAnchors({
        patternType: 'truchet',
        params: PARAMS,
        canvasW: W,
        canvasH: H,
        geometry: { cells: [], arcs: [] },
      })
    ).toEqual([]);
  });
});

describe('the shared stash-key contract', () => {
  // `arcs` joins STASH_GEOMETRY_KEYS, which resolveMotifHost and pickStashGeometry
  // both forward for EVERY stash host — so each host now receives keys it does not
  // own. Blindness is pinned in BOTH directions rather than left to a grep.
  const EDGES = [
    { x1: 100, y1: 100, x2: 300, y2: 100 },
    { x1: 300, y1: 100, x2: 300, y2: 300 },
    { x1: 300, y1: 300, x2: 100, y2: 300 },
    { x1: 100, y1: 300, x2: 100, y2: 100 },
  ];
  const SITES = [{ x: 200, y: 200 }];

  const GIRIH_VERTS = [{ x: 100, y: 100 }, { x: 300, y: 100 }, { x: 300, y: 300 }];
  const GIRIH_EDGES = [[0, 1], [1, 2]];

  it('truchet IGNORES stash keys it does not own', () => {
    const geometry = truchet();
    expect(
      getSemanticAnchors('truchet', PARAMS, W, H, {
        ...geometry,
        circles: [{ x: 1, y: 2, r: 3 }],
        drawnEdges: EDGES,
        sites: SITES,
        girihVertices: GIRIH_VERTS,
        girihEdges: GIRIH_EDGES,
      })
    ).toEqual(getSemanticAnchors('truchet', PARAMS, W, H, geometry));
    // A host given ONLY someone else's key is unprobed, not empty.
    expect(getSemanticAnchors('truchet', PARAMS, W, H, { circles: [{ x: 1, y: 2, r: 3 }] })).toBeNull();
    expect(getSemanticAnchors('truchet', PARAMS, W, H, { drawnEdges: EDGES })).toBeNull();
    expect(
      getSemanticAnchors('truchet', PARAMS, W, H, {
        girihVertices: GIRIH_VERTS,
        girihEdges: GIRIH_EDGES,
      })
    ).toBeNull();
  });

  it('the OTHER stash hosts ignore `arcs`', () => {
    const { arcs } = truchet();
    const voronoiOwn = getSemanticAnchors('voronoi', {}, W, H, { drawnEdges: EDGES, sites: SITES });
    expect(voronoiOwn.length).toBeGreaterThan(0);
    expect(
      getSemanticAnchors('voronoi', {}, W, H, { drawnEdges: EDGES, sites: SITES, arcs })
    ).toEqual(voronoiOwn);
    expect(getSemanticAnchors('voronoi', {}, W, H, { arcs })).toBeNull();
    // circlepacking too.
    const circles = [{ x: 200, y: 200, r: 40 }];
    expect(getSemanticAnchors('circlepacking', {}, W, H, { circles, arcs })).toEqual(
      getSemanticAnchors('circlepacking', {}, W, H, { circles })
    );
    expect(getSemanticAnchors('circlepacking', {}, W, H, { arcs })).toBeNull();
    // …and girih (#152), which landed on the same list.
    const girihOwn = getSemanticAnchors('girih', {}, W, H, {
      girihVertices: GIRIH_VERTS,
      girihEdges: GIRIH_EDGES,
    });
    expect(girihOwn.length).toBeGreaterThan(0);
    expect(
      getSemanticAnchors('girih', {}, W, H, {
        girihVertices: GIRIH_VERTS,
        girihEdges: GIRIH_EDGES,
        arcs,
        cells: truchet().cells,
      })
    ).toEqual(girihOwn);
    expect(getSemanticAnchors('girih', {}, W, H, { arcs })).toBeNull();
  });
});

describe('Truchet composes with the Chain', () => {
  const chain = (selection, roles = ['cell']) =>
    placeMotifs(
      anchorsFor(),
      { selection: { roles, ...selection }, ...HOST_SIZED },
      { canvasW: W, canvasH: H, boundary: BOUNDARY }
    ).placements;

  it('the RATE (every-Nth) block thins the tiling\'s anchors', () => {
    expect(chain({ rate: { n: 3, offset: 0 } })).toHaveLength(Math.ceil(N_TILES / 3));
  });

  it('the SKIP block thins the tiling\'s anchors', () => {
    expect(chain({ skip: [false, true] })).toHaveLength(Math.ceil(N_TILES / 2));
  });

  it('the DENSITY block thins the tiling\'s anchors, reproducibly', () => {
    const sparse = chain({ density: 0.4, seed: 3 });
    expect(sparse.length).toBeGreaterThan(0);
    expect(sparse.length).toBeLessThan(N_TILES);
    expect(chain({ density: 0.4, seed: 3 })).toEqual(sparse);
  });

  it('a tile below the size floor receives NO placement', () => {
    const { placements, rejected } = placeMotifs(
      anchorsFor({ tiles: 24 }),
      {
        selection: { roles: ['cell'] },
        placement: { sizing: { mode: 'proportional', size: 1000, min: 30, margin: 0.9 } },
      },
      { canvasW: W, canvasH: H, boundary: BOUNDARY }
    );
    // half = min(800,600)/24/2 = 12.5 ⇒ 0.9 × 12.5 = 11.25 < the floor of 30.
    expect(placements).toEqual([]);
    expect(rejected.filter((r) => r.reason === 'below-floor')).toHaveLength(24 * 24);
  });

  it('a Route asking for BOTH roles fills the tiles and runs the arcs at once', () => {
    const both = placeMotifs(
      anchorsFor(),
      {
        selection: { roles: ['edge', 'cell'] },
        placement: { sizing: { mode: 'fixed', size: 3 } },
      },
      { canvasW: W, canvasH: H, boundary: BOUNDARY }
    ).placements;
    expect(both.filter((p) => p.anchorId.startsWith('cell:'))).toHaveLength(N_TILES);
    expect(both.filter((p) => p.anchorId.startsWith('edge:')).length).toBe(
      N_TILES * PATHS_PER_TILE.arcs * PER_ARC
    );
  });
});

/** Perpendicular distance from a point to a segment. */
function distToSegment(p, a, b) {
  const vx = b.x - a.x;
  const vy = b.y - a.y;
  const len2 = vx * vx + vy * vy;
  if (len2 === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * vx + (p.y - a.y) * vy) / len2));
  return Math.hypot(p.x - (a.x + t * vx), p.y - (a.y + t * vy));
}

/** The copy index encoded in an anchor id, per the normative scheme. */
function anchorCopy(id, n) {
  return n > 1 ? id.split(':').pop() : '0';
}
