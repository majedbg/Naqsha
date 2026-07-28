// Girih as a motif host, END TO END (#152): the real pattern stashes its
// de-duplicated skeleton graph → resolveMotifHost forwards it → getSemanticAnchors
// walks the strands → the placement engine stamps glyphs at crossings, along the
// straps and at the crop-margin tips.
//
// EVERY assertion counts ACCEPTED PLACEMENTS (the `placements` array), never
// `placementStats.placed` — that counter is initialised to the post-cap CANDIDATE
// count, before the no-fit, below-floor and rest rejections.

import { describe, it, expect } from 'vitest';
import IslamicStar from '../patterns/IslamicStar.js';
import { RecordingContext } from '../patterns/drawingContext.js';
import MotifPattern from './MotifPattern.js';
import { getSemanticAnchors } from './semanticAnchors.js';
import { resolveHostAnchors } from './hostAnchors.js';
import { placeMotifs, resolvePlacements } from './placementEngine.js';
import { runSelectionChain } from './chain.js';
import { resolveMotifHostParams } from './resolveMotifHost.js';
import { defaultMotifAddOpts } from './defaultBinding.js';
import { rolesForHost } from './hostRoles.js';
import {
  isMotifHost,
  isSemanticHost,
  isStashHost,
  isEdgeHost,
  defaultRolesForHost,
  hostHasPathStructure,
} from './hostKinds.js';
import { partitionZones } from './zones.js';

const W = 800;
const H = 600;
const BOUNDARY = { type: 'rect', width: W, height: H };
const SIZING = { placement: { sizing: { mode: 'proportional', size: 12, min: 0, margin: 0.9 } } };

/** Run the real pattern and return its stashed skeleton graph. */
function skeleton(params = {}, seed = 7) {
  const inst = new IslamicStar();
  inst.generate(new RecordingContext({ seed: 1 }), seed, params, W, H, '#000000', 100);
  return inst.motifHostGeometry;
}

/** The anchors a motif on this girih would actually see. */
function anchorsFor(params = {}, seed = 7) {
  const g = skeleton(params, seed);
  return getSemanticAnchors('girih', params, W, H, g);
}

const byRole = (anchors, role) => anchors.filter((a) => a.role === role);

function place(anchors, selection = {}) {
  return placeMotifs(
    anchors,
    { selection: { ...selection }, ...SIZING },
    { canvasW: W, canvasH: H, boundary: BOUNDARY }
  );
}

/** Chain-form selection, then placement — the path MotifPattern and the overlay run. */
function placeChain(anchors, chain) {
  const { survivors } = runSelectionChain(anchors, chain);
  return resolvePlacements(survivors, SIZING.placement, { boundary: BOUNDARY });
}

describe('Girih is a motif host', () => {
  it('is registered as a SEMANTIC STASH host defaulting to the crossing role', () => {
    expect(isMotifHost('girih')).toBe(true);
    expect(isSemanticHost('girih')).toBe(true);
    expect(isStashHost('girih')).toBe(true);
    // The probe is a single boolean — a stash host must NOT also be an edge host.
    expect(isEdgeHost('girih')).toBe(false);
    expect(defaultRolesForHost('girih')).toEqual(['crossing']);
  });

  it('the Route block offers Crossings, Edges and Tips, and NOT Cells', () => {
    expect(rolesForHost('girih', {})).toEqual(['crossing', 'edge', 'tip']);
    expect(rolesForHost('girih', { tiling: 'hex12' })).not.toContain('cell');
  });

  it('individual straps are pickable on canvas — girih carries path structure', () => {
    expect(hostHasPathStructure('girih')).toBe(true);
    const anchors = anchorsFor();
    // Pick ONE strand and the Route block keeps exactly that strap's anchors —
    // its edge run AND the crossings it runs into, which is why a crossing
    // carries its full incident strand set.
    const { placements } = placeChain(anchors, [
      { type: 'route', pathScope: 'picked', pickedPaths: [3] },
    ]);
    const kept = new Set(placements.map((p) => p.anchorId));
    expect(kept.size).toBeGreaterThan(0);
    expect(kept.size).toBeLessThan(anchors.length);
    for (const id of kept) {
      const a = anchors.find((x) => x.id === id);
      const strandsOf = a.meta.strands || [a.meta.pathIndex];
      expect(strandsOf).toContain(3);
    }
    // A different strap gives a different set — the pick is really per-strand.
    const other = placeChain(anchors, [
      { type: 'route', pathScope: 'picked', pickedPaths: [11] },
    ]).placements.map((p) => p.anchorId);
    expect(other).not.toEqual([...kept]);
  });

  it('the default "+ Add Motif" binding routes to crossings and semantic anchoring', () => {
    const opts = defaultMotifAddOpts('girih', 'leaf');
    expect(opts.anchorMode).toBe('semantic');
    expect(opts.binding.selection.roles).toEqual(['crossing']);
  });

  it('resolveMotifHostParams forwards the stashed graph to the extractor', () => {
    const host = { id: 'h1', patternType: 'girih', params: {}, seed: 7 };
    const motif = { id: 'm1', patternType: 'motif', params: { hostLayerId: 'h1' } };
    const g = skeleton();
    const resolved = resolveMotifHostParams(motif, [host, motif], { h1: g });
    expect(resolved.hostPatternType).toBe('girih');
    expect(resolved.girihVertices).toHaveLength(g.girihVertices.length);
    expect(resolved.girihEdges).toHaveLength(g.girihEdges.length);
    // No anchorMode override — this is a SEMANTIC host, not an edge host.
    expect(resolved.anchorMode).toBeUndefined();
  });

  it('a host that has not been probed yet degrades to null anchors, not a throw', () => {
    expect(getSemanticAnchors('girih', {}, W, H, {})).toBeNull();
    expect(getSemanticAnchors('girih', {}, W, H)).toBeNull();
    // An empty graph is an honest empty anchor set, NOT null.
    expect(getSemanticAnchors('girih', {}, W, H, { girihVertices: [], girihEdges: [] })).toEqual(
      []
    );
  });
});

describe('Girih anchors sit on the real skeleton', () => {
  it('places glyphs at strap CROSSINGS', () => {
    const g = skeleton();
    const anchors = anchorsFor();
    const crossings = byRole(anchors, 'crossing');
    expect(crossings.length).toBeGreaterThan(50);
    // Every crossing anchor is a real degree->=3 skeleton vertex, to the exact
    // coordinate.
    const deg = new Map();
    for (const [a, b] of g.girihEdges) {
      deg.set(a, (deg.get(a) || 0) + 1);
      deg.set(b, (deg.get(b) || 0) + 1);
    }
    const junctions = new Set(
      [...deg.entries()]
        .filter(([, d]) => d >= 3)
        .map(([i]) => `${g.girihVertices[i].x},${g.girihVertices[i].y}`)
    );
    expect(crossings).toHaveLength(junctions.size);
    for (const c of crossings) expect(junctions.has(`${c.x},${c.y}`)).toBe(true);
    // …and they really do receive glyphs.
    const { placements } = place(anchors, { roles: ['crossing'] });
    expect(placements.length).toBeGreaterThan(50);
  });

  it('glyphs ride ALONG the straps between crossings', () => {
    const g = skeleton();
    const anchors = anchorsFor();
    const edges = byRole(anchors, 'edge');
    // One anchor per skeleton edge, each at that edge's midpoint.
    expect(edges).toHaveLength(g.girihEdges.length);
    const midpoints = new Set(
      g.girihEdges.map(([a, b]) => {
        const p = g.girihVertices[a];
        const q = g.girihVertices[b];
        return `${(p.x + q.x) / 2},${(p.y + q.y) / 2}`;
      })
    );
    for (const e of edges) expect(midpoints.has(`${e.x},${e.y}`)).toBe(true);
    const { placements } = place(anchors, { roles: ['edge'] });
    expect(placements.length).toBeGreaterThan(50);
  });

  it('TIPS appear where a strap is cut at the crop margin', () => {
    const g = skeleton();
    const anchors = anchorsFor();
    const tips = byRole(anchors, 'tip');
    const deg = new Map();
    for (const [a, b] of g.girihEdges) {
      deg.set(a, (deg.get(a) || 0) + 1);
      deg.set(b, (deg.get(b) || 0) + 1);
    }
    const loose = [...deg.entries()].filter(([, d]) => d === 1).map(([i]) => g.girihVertices[i]);
    expect(loose.length).toBeGreaterThan(0);
    expect(tips).toHaveLength(loose.length);
    const looseKeys = new Set(loose.map((v) => `${v.x},${v.y}`));
    for (const t of tips) expect(looseKeys.has(`${t.x},${t.y}`)).toBe(true);
  });

  it('every tip lies OUTSIDE the crop margin — a ragged ring, not a designed border', () => {
    // MEASURED, and pinned here because it is the thing that surprises. The
    // skeleton is built from a tiling that overruns the canvas and is filtered to
    // a margin 10% WIDER than the canvas (IslamicStar: mx = canvasW*0.55), so a
    // loose end is a cut edge just beyond that margin — never a feature of the
    // tiling, and never inside the visible area. Consequence, asserted below: at
    // the canvas-rect placement boundary a tip anchor is rejected as no-fit, so
    // the Tips role emits honest anchors that place no glyph. Reported against
    // PRD #143 rather than worked around: fixing it would mean changing what the
    // pattern PAINTS, which is out of scope for this ticket.
    const tips = byRole(anchorsFor(), 'tip');
    expect(tips.length).toBeGreaterThan(0);
    for (const t of tips) {
      const outside = t.x < 0 || t.x > W || t.y < 0 || t.y > H;
      expect(outside).toBe(true);
    }
    const { placements, rejected } = place(anchorsFor(), { roles: ['tip'] });
    expect(placements).toHaveLength(0);
    expect(rejected.every((r) => r.reason === 'no-fit')).toBe(true);
  });

  it('SKELETON-render and INTERLACE-render girih host motifs identically', () => {
    const a = place(anchorsFor({ render: 'skeleton' })).placements;
    const b = place(anchorsFor({ render: 'interlaced' })).placements;
    expect(a.length).toBeGreaterThan(0);
    expect(b).toEqual(a);
  });

  it('anchors survive the IRREGULARITY setting', () => {
    const plain = anchorsFor({ irregularity: 0 });
    const jittered = anchorsFor({ irregularity: 0.6 });
    expect(byRole(jittered, 'crossing').length).toBe(byRole(plain, 'crossing').length);
    expect(byRole(jittered, 'edge').length).toBe(byRole(plain, 'edge').length);
    // The anchors MOVED with the jittered paint rather than staying on the ideal
    // tiling — the point of stashing rather than re-deriving from params.
    expect(jittered.map((a) => [a.x, a.y])).not.toEqual(plain.map((a) => [a.x, a.y]));
    const { placements } = place(jittered, { roles: ['crossing'] });
    expect(placements.length).toBeGreaterThan(50);
    // Every jittered crossing anchor is still ON a stashed skeleton vertex.
    const verts = new Set(skeleton({ irregularity: 0.6 }).girihVertices.map((v) => `${v.x},${v.y}`));
    for (const c of byRole(jittered, 'crossing')) expect(verts.has(`${c.x},${c.y}`)).toBe(true);
  });

  it('a start angle and offsets carry the anchors with the paint', () => {
    const A = 25;
    const D = 30;
    const E = -12;
    const a = (A * Math.PI) / 180;
    const base = anchorsFor();
    const moved = anchorsFor({ startAngle: A, offsetX: D, offsetY: E });
    expect(moved).toHaveLength(base.length);
    // Compared as SETS, not index-by-index: strand ordering is a stable sort of
    // the graph BY POSITION, so rotating the whole skeleton legitimately renumbers
    // the strands. What must hold is that every anchor moved with the paint.
    //   world = R(a)·centred + (W/2 + offsetX, H/2 + offsetY) — hand-authored.
    const key = (x, y) => `${x.toFixed(4)},${y.toFixed(4)}`;
    const expected = new Set(
      base
        .filter((n) => n.role === 'crossing')
        .map((n) => {
          const px = n.x - W / 2;
          const py = n.y - H / 2;
          return key(
            px * Math.cos(a) - py * Math.sin(a) + W / 2 + D,
            px * Math.sin(a) + py * Math.cos(a) + H / 2 + E
          );
        })
    );
    const got = moved.filter((n) => n.role === 'crossing').map((n) => key(n.x, n.y));
    expect(got).toHaveLength(expected.size);
    for (const k of got) expect(expected.has(k)).toBe(true);
  });

  it('the same host and seed produce the same anchors every render', () => {
    expect(anchorsFor({ irregularity: 0.6 }, 7)).toEqual(anchorsFor({ irregularity: 0.6 }, 7));
    // Strand INDICES are stable at the same seed, not merely the coordinates.
    const ids = (s) => anchorsFor({ irregularity: 0.6 }, s).map((x) => x.id);
    expect(ids(7)).toEqual(ids(7));
  });
});

describe('Girih strands compose with the Chain and Zones', () => {
  it('an every-Nth rhythm runs the LENGTH of a strap, not restarting at every bend', () => {
    const anchors = anchorsFor();
    const edges = byRole(anchors, 'edge');
    // The real skeleton genuinely has multi-edge straps — otherwise this
    // criterion would be vacuous.
    const perPath = new Map();
    for (const e of edges) perPath.set(e.meta.pathIndex, (perPath.get(e.meta.pathIndex) || 0) + 1);
    expect(Math.max(...perPath.values())).toBeGreaterThan(1);

    const all = place(anchors, { roles: ['edge'] }).placements;
    const everyOther = place(anchors, { roles: ['edge'], rate: { n: 2, offset: 0 } }).placements;
    // The per-path positional counter runs in ARC order along each strap, so the
    // survivors are exactly the even-`edgeIndex` anchors of each strand. Under the
    // one-path-per-edge bug every counter restarts at 0, every anchor is index 0,
    // and NOTHING is thinned — so the count would equal `all`.
    expect(everyOther.length).toBeGreaterThan(0);
    expect(everyOther.length).toBeLessThan(all.length);
    const byId = new Map(anchors.map((x) => [x.id, x]));
    for (const p of everyOther) expect(byId.get(p.anchorId).meta.edgeIndex % 2).toBe(0);
    // And the thinning is real per-STRAND, not a global stride: every strap of
    // 2+ edges keeps its first edge and drops its second.
    const kept = new Set(everyOther.map((p) => p.anchorId));
    const multi = [...perPath.entries()].filter(([, n]) => n >= 2).map(([p]) => p);
    expect(multi.length).toBeGreaterThan(0);
    for (const p of multi.slice(0, 20)) {
      const second = anchors.find(
        (x) => x.role === 'edge' && x.meta.pathIndex === p && x.meta.edgeIndex === 1
      );
      expect(kept.has(second.id)).toBe(false);
    }
  });

  it('Zones treat tips as Apex and strap interiors as Stem', () => {
    const anchors = anchorsFor();
    const { apex, stem } = partitionZones(anchors);
    const tips = byRole(anchors, 'tip');
    expect(tips.length).toBeGreaterThan(0);
    const apexIds = new Set(apex.map((a) => a.id));
    for (const t of tips) expect(apexIds.has(t.id)).toBe(true);
    // Crossings are interior body — Stem, never Apex.
    const stemIds = new Set(stem.map((a) => a.id));
    for (const c of byRole(anchors, 'crossing')) expect(stemIds.has(c.id)).toBe(true);
    // On a strap that carries a tip, the strap's own edge anchors are Stem.
    const tipPath = tips[0].meta.pathIndex;
    const interior = byRole(anchors, 'edge').filter((e) => e.meta.pathIndex === tipPath);
    expect(interior.length).toBeGreaterThan(0);
    for (const e of interior) expect(stemIds.has(e.id)).toBe(true);
  });
});

describe('Girih through the SHARED host-anchor resolver (module F)', () => {
  it('the resolver returns exactly what the renderer places', () => {
    // The overlay that draws the editable per-glyph dots and the render router
    // must never diverge — that divergence is what #149's module F exists to
    // remove, and a new stash host is the case that would reintroduce it.
    const g = skeleton();
    const viaResolver = resolveHostAnchors({
      patternType: 'girih',
      params: {},
      canvasW: W,
      canvasH: H,
      geometry: g, // the shape the OVERLAY reads (instance.motifHostGeometry)
    });
    const viaRender = getSemanticAnchors('girih', {}, W, H, g);
    expect(viaResolver).toEqual(viaRender);
    expect(viaResolver.length).toBeGreaterThan(0);
  });

  it('a HIDDEN host still resolves — hide the scaffold, keep the ornament editable', () => {
    // A hidden layer is still generated through the no-draw adapter, so its stash
    // is present exactly as on a drawn frame. Nothing in the resolver is
    // visibility-aware; this pins that the stash shape it reads is the same one.
    const g = skeleton();
    const anchors = resolveHostAnchors({
      patternType: 'girih',
      params: {},
      canvasW: W,
      canvasH: H,
      geometry: { ...g },
    });
    expect(anchors.length).toBeGreaterThan(0);
  });

  it('a host not yet probed resolves to nothing rather than throwing', () => {
    expect(
      resolveHostAnchors({ patternType: 'girih', params: {}, canvasW: W, canvasH: H })
    ).toBeNull();
  });

  it('the RENDERER stamps the glyphs — MotifPattern threads the graph through', () => {
    // The last link, and the only one the other tests skip: a typo in the key
    // MotifPattern forwards would leave the suite green and render nothing.
    const g = skeleton();
    const inst = new MotifPattern();
    inst.generateWithContext(
      new RecordingContext({ seed: 1 }),
      7,
      {
        glyphRef: 'leaf',
        anchorMode: 'semantic',
        hostPatternType: 'girih',
        hostParams: {},
        girihVertices: g.girihVertices,
        girihEdges: g.girihEdges,
        binding: { selection: { roles: ['crossing'] }, ...SIZING },
      },
      W,
      H,
      '#123456',
      100
    );
    expect(inst.lastPlacementPositions.length).toBeGreaterThan(50);
    expect(inst.svgElements.length).toBe(inst.lastPlacementPositions.length);
  });
});
