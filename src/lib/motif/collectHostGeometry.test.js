// Unit tests for collectMotifHostGeometry — the order-INDEPENDENT host-geometry
// pre-pass that fixes the Voronoi seam bug (motif placement must not depend on
// z-order / array position).
//
// FAIL-FIRST CONTRACT: a motif gets its host's drawnCells regardless of its array
// position — motif BEFORE the host AND motif AFTER the host must BOTH resolve
// drawnCells. The `oldCollect` model below reproduces the ORIGINAL in-loop harvest
// (interleaved with the reverse-order render loop) and is used to prove the bug is
// genuinely order-DEPENDENT: `[host, motif]` (the default "+ Add Motif" append
// order) goes RED under the old model, GREEN under the fix.

import { describe, it, expect } from 'vitest';
import { collectMotifHostGeometry } from './collectHostGeometry.js';
import { resolveMotifHostParams } from './resolveMotifHost.js';
import { MOTIF_TYPE } from './motifLayer.js';

const voronoiHost = { id: 'vh', patternType: 'voronoi', params: { cellCount: 40 } };
const cells = [{ vertices: [{ x: 1, y: 2 }, { x: 3, y: 4 }, { x: 5, y: 6 }], site: { x: 3, y: 4 } }];
const motif = {
  id: 'm',
  type: MOTIF_TYPE,
  patternType: MOTIF_TYPE,
  params: { glyphRef: 'leaf', hostLayerId: 'vh', anchorMode: 'semantic' },
};

// Fake generate: returns canned voronoi geometry for the voronoi host, null else.
function fakeGenerate(host) {
  if (host.patternType === 'voronoi') return { drawnCells: cells };
  return null;
}

// Model of the ORIGINAL (buggy) 767f6ce in-loop harvest: geometry is captured
// only as each host is ENCOUNTERED while iterating renderOrder (= reversed
// layers), and a motif's host params are resolved at the moment IT is encountered
// — so a motif encountered before its host sees an empty map. Returns, per motif
// id, the resolveMotifHostParams output computed with the geometry available then.
function oldCollectResolved(layers) {
  const hostGeometry = {};
  const resolvedByMotif = {};
  for (const layer of [...layers].reverse()) {
    // A motif resolves its host params using whatever geometry is captured so far.
    if (layer.type === MOTIF_TYPE || layer.patternType === MOTIF_TYPE) {
      resolvedByMotif[layer.id] = resolveMotifHostParams(layer, layers, hostGeometry);
    }
    // A host captures its geometry when encountered.
    const geom = fakeGenerate(layer);
    if (geom) hostGeometry[layer.id] = geom;
  }
  return resolvedByMotif;
}

describe('collectMotifHostGeometry — order independence (seam fix)', () => {
  it('populates host geometry for BOTH orderings (motif before AND after host)', () => {
    const before = [motif, voronoiHost]; // motif BEFORE host
    const after = [voronoiHost, motif]; // motif AFTER host (default append order)

    const gBefore = collectMotifHostGeometry(before, fakeGenerate);
    const gAfter = collectMotifHostGeometry(after, fakeGenerate);

    expect(gBefore.vh.drawnCells).toBe(cells);
    expect(gAfter.vh.drawnCells).toBe(cells);
  });

  it('resolveMotifHostParams returns drawnCells in BOTH orderings after the pre-pass', () => {
    for (const layers of [[motif, voronoiHost], [voronoiHost, motif]]) {
      const hostGeometry = collectMotifHostGeometry(layers, fakeGenerate);
      const out = resolveMotifHostParams(motif, layers, hostGeometry);
      expect(out.hostPatternType).toBe('voronoi');
      expect(out.drawnCells).toBe(cells);
    }
  });

  it('FAIL-FIRST GUARD: the old in-loop harvest is order-DEPENDENT (this fix removes it)', () => {
    // `[motif, host]`: reversed → host first → geometry present when motif resolves → OK.
    const okOrder = oldCollectResolved([motif, voronoiHost]);
    expect(okOrder.m.drawnCells).toBe(cells);

    // `[host, motif]` (default "+ Add Motif" append order): reversed → motif FIRST
    // → resolves BEFORE the host generated → NO drawnCells. This is the bug.
    const brokenOrder = oldCollectResolved([voronoiHost, motif]);
    expect(brokenOrder.m).not.toHaveProperty('drawnCells');

    // The fix makes THIS SAME broken ordering resolve drawnCells.
    const fixedGeom = collectMotifHostGeometry([voronoiHost, motif], fakeGenerate);
    expect(resolveMotifHostParams(motif, [voronoiHost, motif], fixedGeom).drawnCells).toBe(cells);
  });

  it('generates each distinct host only ONCE even with multiple motifs on it', () => {
    let calls = 0;
    const gen = (h) => {
      calls += 1;
      return fakeGenerate(h);
    };
    const m2 = { ...motif, id: 'm2' };
    collectMotifHostGeometry([voronoiHost, motif, m2], gen);
    expect(calls).toBe(1);
  });

  it('tolerates a dangling host id (no crash, host absent from result)', () => {
    const dangling = { ...motif, params: { ...motif.params, hostLayerId: 'nope' } };
    const g = collectMotifHostGeometry([dangling], fakeGenerate);
    expect(g).toEqual({});
  });

  it('stores nothing when generate returns falsy (formula host with no geometry)', () => {
    const gridHost = { id: 'gh', patternType: 'grid', params: {} };
    const gm = { ...motif, params: { ...motif.params, hostLayerId: 'gh' } };
    const g = collectMotifHostGeometry([gridHost, gm], fakeGenerate);
    expect(g).toEqual({});
  });

  it('ignores non-motif layers when building the host-id set', () => {
    const stray = { id: 'x', patternType: 'voronoi', params: {} };
    const g = collectMotifHostGeometry([stray], fakeGenerate);
    expect(g).toEqual({}); // no motif references it → not generated
  });
});
