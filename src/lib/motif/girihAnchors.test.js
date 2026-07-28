// Module C of PRD #143 (#152) — girih strand decomposition + graph anchors.
//
// GEOMETRY-IN throughout: every case below builds its vertex graph LITERALLY, so
// a change to how IslamicStar paints can never break these. The one place the
// real pattern is run is IslamicStar.motif.test.js (the stash) and
// girihHost.integration.test.js (the seam), where running it is the point.

import { describe, it, expect } from 'vitest';
import { girihGraphAnchors } from './girihAnchors.js';
import { runSelectionChain } from './chain.js';
import { partitionZones } from './zones.js';

/** A straight open chain of `n` edges along +x at 10px spacing. */
function straightChain(n, x0 = 0, y0 = 0) {
  const vertices = [];
  const edges = [];
  for (let i = 0; i <= n; i++) vertices.push({ x: x0 + i * 10, y: y0 });
  for (let i = 0; i < n; i++) edges.push([i, i + 1]);
  return { vertices, edges };
}

const byRole = (anchors, role) => anchors.filter((a) => a.role === role);

describe('girihGraphAnchors — vertex degree has THREE cases', () => {
  it('degree one becomes a TIP', () => {
    const { vertices, edges } = straightChain(2); // v0 —— v1 —— v2
    const anchors = girihGraphAnchors(vertices, edges);
    const tips = byRole(anchors, 'tip');
    expect(tips).toHaveLength(2);
    expect(tips.map((t) => [t.x, t.y]).sort()).toEqual(
      [
        [0, 0],
        [20, 0],
      ].sort()
    );
  });

  it('degree three-or-more becomes a CROSSING', () => {
    //        v3
    //        |
    // v1 —— v0 —— v2      (v0 has degree 3)
    const vertices = [
      { x: 0, y: 0 },
      { x: -10, y: 0 },
      { x: 10, y: 0 },
      { x: 0, y: -10 },
    ];
    const edges = [
      [0, 1],
      [0, 2],
      [0, 3],
    ];
    const anchors = girihGraphAnchors(vertices, edges);
    const crossings = byRole(anchors, 'crossing');
    expect(crossings).toHaveLength(1);
    expect(crossings[0].x).toBe(0);
    expect(crossings[0].y).toBe(0);
    expect(crossings[0].meta.degree).toBe(3);
    expect(crossings[0].meta.junction).toBe(true);
    // The three arm ends are degree 1 → tips, not crossings.
    expect(byRole(anchors, 'tip')).toHaveLength(3);
  });

  it('a degree-FOUR vertex is a crossing too (real girih straps cross 4-way)', () => {
    const vertices = [
      { x: 0, y: 0 },
      { x: -10, y: 0 },
      { x: 10, y: 0 },
      { x: 0, y: -10 },
      { x: 0, y: 10 },
    ];
    const edges = [
      [0, 1],
      [0, 2],
      [0, 3],
      [0, 4],
    ];
    const anchors = girihGraphAnchors(vertices, edges);
    expect(byRole(anchors, 'crossing')).toHaveLength(1);
    expect(byRole(anchors, 'crossing')[0].meta.degree).toBe(4);
  });

  it('a degree-TWO vertex becomes NEITHER tip NOR crossing', () => {
    // THE case an implementation is most likely to mis-file. v1 is a strap BEND:
    // interior to its strand, covered by the edge role, and never its own anchor.
    const vertices = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 20, y: 10 }, // a real bend, not a colinear point
    ];
    const edges = [
      [0, 1],
      [1, 2],
    ];
    const anchors = girihGraphAnchors(vertices, edges);
    const at = (x, y) => anchors.filter((a) => a.x === x && a.y === y);
    expect(at(10, 0).filter((a) => a.role === 'tip')).toHaveLength(0);
    expect(at(10, 0).filter((a) => a.role === 'crossing')).toHaveLength(0);
    // The two tips are the degree-1 ends, and nothing else.
    expect(byRole(anchors, 'tip').map((t) => [t.x, t.y])).toEqual([
      [0, 0],
      [20, 10],
    ]);
    expect(byRole(anchors, 'crossing')).toHaveLength(0);
  });

  it('a degree-ZERO vertex yields no anchor at all', () => {
    // The pattern's crop drops EDGES, not vertices; an orphaned endpoint is on no
    // strand and must be silently ignored rather than becoming a stray tip.
    const { vertices, edges } = straightChain(1);
    vertices.push({ x: 999, y: 999 }); // referenced by nothing
    const anchors = girihGraphAnchors(vertices, edges);
    expect(anchors.some((a) => a.x === 999)).toBe(false);
    expect(byRole(anchors, 'tip')).toHaveLength(2);
  });
});

describe('girihGraphAnchors — strand decomposition', () => {
  it('a chain through degree-two bends is ONE path, not one per edge', () => {
    const { vertices, edges } = straightChain(6);
    const anchors = girihGraphAnchors(vertices, edges);
    const eAnchors = byRole(anchors, 'edge');
    expect(eAnchors).toHaveLength(6); // one per skeleton edge
    expect(new Set(eAnchors.map((a) => a.meta.pathIndex)).size).toBe(1);
  });

  it('cuts at a degree-three vertex — three edges, three paths', () => {
    const vertices = [
      { x: 0, y: 0 },
      { x: -10, y: 0 },
      { x: 10, y: 0 },
      { x: 0, y: -10 },
    ];
    const edges = [
      [0, 1],
      [0, 2],
      [0, 3],
    ];
    const anchors = girihGraphAnchors(vertices, edges);
    expect(new Set(byRole(anchors, 'edge').map((a) => a.meta.pathIndex)).size).toBe(3);
  });

  it('an every-Nth rhythm runs the LENGTH of a strap, not restarting at each bend', () => {
    // One strand of 6 edges through 5 degree-2 bends. everyN n=2 over one path
    // keeps 3. The one-path-per-edge bug restarts every counter at 0 and keeps
    // all 6 — a visibly different number, which is the point of this fixture.
    const { vertices, edges } = straightChain(6);
    const anchors = girihGraphAnchors(vertices, edges);
    const { survivors } = runSelectionChain(anchors, [
      { type: 'route', roles: ['edge'] },
      { type: 'everyN', n: 2 },
    ]);
    expect(survivors).toHaveLength(3);
  });

  it('arc position runs ALONG the strand — edge anchors ascend in s', () => {
    const { vertices, edges } = straightChain(4);
    const eAnchors = byRole(girihGraphAnchors(vertices, edges), 'edge');
    expect(eAnchors.map((a) => a.s)).toEqual([5, 15, 25, 35]);
    // …and they are emitted in that order, so a positional rhythm is arc-ordered.
    expect(eAnchors.map((a) => a.meta.edgeIndex)).toEqual([0, 1, 2, 3]);
  });

  it('edge anchors land ON their edge, with a tangent along it', () => {
    const vertices = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
    ];
    const edges = [
      [0, 1],
      [1, 2],
    ];
    const eAnchors = byRole(girihGraphAnchors(vertices, edges), 'edge');
    expect(eAnchors).toHaveLength(2);
    expect([eAnchors[0].x, eAnchors[0].y]).toEqual([5, 0]);
    expect([eAnchors[1].x, eAnchors[1].y]).toEqual([10, 5]);
    expect(eAnchors[0].tangent).toBeCloseTo(0, 12);
    expect(eAnchors[1].tangent).toBeCloseTo(Math.PI / 2, 12);
    expect(eAnchors[0].normal).toBeCloseTo(Math.PI / 2, 12);
  });

  it('a chain returning to its start is flagged CLOSED and produces no tips', () => {
    // A pure degree-2 cycle: four vertices round a square.
    const vertices = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ];
    const edges = [
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 0],
    ];
    const anchors = girihGraphAnchors(vertices, edges);
    expect(byRole(anchors, 'tip')).toHaveLength(0);
    expect(byRole(anchors, 'crossing')).toHaveLength(0);
    const eAnchors = byRole(anchors, 'edge');
    expect(eAnchors).toHaveLength(4);
    expect(eAnchors.every((a) => a.meta.closed === true)).toBe(true);
    expect(new Set(eAnchors.map((a) => a.meta.pathIndex)).size).toBe(1);
    // Route's 'closed' scope must see it.
    const { survivors } = runSelectionChain(anchors, [
      { type: 'route', roles: ['edge'], pathScope: 'closed' },
    ]);
    expect(survivors).toHaveLength(4);
  });

  it('an OPEN strand is not flagged closed', () => {
    const { vertices, edges } = straightChain(3);
    const eAnchors = byRole(girihGraphAnchors(vertices, edges), 'edge');
    expect(eAnchors.every((a) => a.meta.closed === false)).toBe(true);
  });

  it('a chain that leaves a junction and returns to it is closed, and has no tips', () => {
    // v0 is degree 3: two of its edges form a loop through degree-2 bends, the
    // third is a stub. The loop returns to its start, so it is closed.
    const vertices = [
      { x: 0, y: 0 }, // v0 (degree 3)
      { x: 10, y: -10 }, // v1 bend
      { x: 10, y: 10 }, // v2 bend
      { x: -20, y: 0 }, // v3 stub end
    ];
    const edges = [
      [0, 1],
      [1, 2],
      [2, 0],
      [0, 3],
    ];
    const anchors = girihGraphAnchors(vertices, edges);
    const loopEdges = byRole(anchors, 'edge').filter((a) => a.meta.closed === true);
    expect(loopEdges).toHaveLength(3);
    expect(new Set(loopEdges.map((a) => a.meta.pathIndex)).size).toBe(1);
    // Only the stub end is a tip; the junction is a crossing.
    expect(byRole(anchors, 'tip')).toHaveLength(1);
    expect(byRole(anchors, 'tip')[0].x).toBe(-20);
  });
});

describe('girihGraphAnchors — crossings carry every incident strand', () => {
  it('a crossing carries the full incident set and the LOWEST index as its path', () => {
    const vertices = [
      { x: 0, y: 0 },
      { x: -10, y: 0 },
      { x: 10, y: 0 },
      { x: 0, y: -10 },
      { x: 0, y: 10 },
    ];
    const edges = [
      [0, 1],
      [0, 2],
      [0, 3],
      [0, 4],
    ];
    const anchors = girihGraphAnchors(vertices, edges);
    const c = byRole(anchors, 'crossing')[0];
    const strandIndices = [...new Set(byRole(anchors, 'edge').map((a) => a.meta.pathIndex))].sort(
      (p, q) => p - q
    );
    expect(strandIndices).toHaveLength(4);
    expect(c.meta.strands).toEqual(strandIndices);
    expect(c.meta.pathIndex).toBe(Math.min(...strandIndices));
  });

  it('canvas path-picking finds a crossing from ANY of its straps', () => {
    // A crossing must survive `picked` scope for every strand it belongs to, so a
    // maker who clicks one strap gets its crossings too.
    const vertices = [
      { x: 0, y: 0 },
      { x: -10, y: 0 },
      { x: 10, y: 0 },
      { x: 0, y: -10 },
    ];
    const edges = [
      [0, 1],
      [0, 2],
      [0, 3],
    ];
    const anchors = girihGraphAnchors(vertices, edges);
    const c = byRole(anchors, 'crossing')[0];
    expect(c.meta.strands).toHaveLength(3);
    for (const p of c.meta.strands) {
      expect(pickable(anchors, p).some((a) => a.role === 'crossing')).toBe(true);
    }
  });
});

/** Anchors surviving a Route block scoped to picked path `p` (any role). */
function pickable(anchors, p) {
  return runSelectionChain(anchors, [{ type: 'route', pathScope: 'picked', pickedPaths: [p] }])
    .survivors;
}

describe('girihGraphAnchors — deterministic strand ordering', () => {
  it('is stable under a PERMUTED vertex and edge input order', () => {
    // Running twice proves nothing (any deterministic function passes). The real
    // guard is that strand indices come from a stable sort of the GRAPH, not from
    // iteration order: permute the inputs and every anchor must be identical.
    const base = {
      vertices: [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 20, y: 0 },
        { x: 20, y: 10 },
        { x: 30, y: 0 },
        { x: 20, y: -10 },
      ],
      edges: [
        [0, 1],
        [1, 2],
        [2, 3],
        [2, 4],
        [2, 5],
      ],
    };
    const a = girihGraphAnchors(base.vertices, base.edges);

    // Permutation: reverse the vertex array and remap every edge accordingly,
    // then reverse the edge array and flip each pair's orientation.
    const n = base.vertices.length;
    const permVerts = [...base.vertices].reverse();
    const map = (i) => n - 1 - i;
    const permEdges = [...base.edges].reverse().map(([p, q]) => [map(q), map(p)]);
    const b = girihGraphAnchors(permVerts, permEdges);

    expect(b).toEqual(a);
  });

  it('is stable across repeated calls', () => {
    const { vertices, edges } = straightChain(5);
    expect(girihGraphAnchors(vertices, edges)).toEqual(girihGraphAnchors(vertices, edges));
  });

  it('anchor ids are unique and follow the documented format', () => {
    const vertices = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 20, y: 0 },
      { x: 20, y: 10 },
      { x: 20, y: -10 },
    ];
    const edges = [
      [0, 1],
      [1, 2],
      [2, 3],
      [2, 4],
    ];
    const anchors = girihGraphAnchors(vertices, edges);
    expect(new Set(anchors.map((a) => a.id)).size).toBe(anchors.length);
    for (const a of anchors) {
      if (a.role === 'crossing') expect(a.id).toMatch(/^crossing:\d+$/);
      if (a.role === 'tip') expect(a.id).toMatch(/^tip:\d+:(start|end)$/);
      if (a.role === 'edge') expect(a.id).toMatch(/^edge:\d+:\d+$/);
    }
  });
});

describe('girihGraphAnchors — Zones', () => {
  it('treats tips as Apex and strap interiors as Stem', () => {
    // A strand with a tip at one end and a crossing at the other.
    const vertices = [
      { x: 0, y: 0 }, // tip
      { x: 10, y: 0 },
      { x: 20, y: 0 },
      { x: 30, y: 0 }, // crossing (degree 3)
      { x: 30, y: 10 },
      { x: 30, y: -10 },
    ];
    const edges = [
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 4],
      [3, 5],
    ];
    const anchors = girihGraphAnchors(vertices, edges);
    const tipAnchor = anchors.find((a) => a.role === 'tip' && a.x === 0);
    const { apex, stem } = partitionZones(anchors);
    expect(apex.map((a) => a.id)).toContain(tipAnchor.id);
    // The interior edge anchors of that tip's strand are Stem, never Apex.
    const p = tipAnchor.meta.pathIndex;
    const interior = anchors.filter((a) => a.role === 'edge' && a.meta.pathIndex === p);
    expect(interior.length).toBeGreaterThan(0);
    for (const e of interior) expect(stem.map((s) => s.id)).toContain(e.id);
    // Crossings are Stem.
    expect(stem.some((s) => s.role === 'crossing')).toBe(true);
  });

  it('a closed strand has no Apex at all', () => {
    const vertices = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ];
    const edges = [
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 0],
    ];
    const { apex, stem } = partitionZones(girihGraphAnchors(vertices, edges));
    expect(apex).toHaveLength(0);
    expect(stem).toHaveLength(4);
  });
});

describe('girihGraphAnchors — degenerate input', () => {
  it('empty input yields an empty result rather than throwing', () => {
    expect(girihGraphAnchors([], [])).toEqual([]);
    expect(girihGraphAnchors(undefined, undefined)).toEqual([]);
    expect(girihGraphAnchors([{ x: 0, y: 0 }], [])).toEqual([]);
  });

  it('self-loops and duplicate edges are ignored', () => {
    const { vertices, edges } = straightChain(2);
    const anchors = girihGraphAnchors(vertices, [...edges, [0, 0], [1, 0], [0, 1]]);
    expect(byRole(anchors, 'edge')).toHaveLength(2);
    expect(byRole(anchors, 'tip')).toHaveLength(2);
    expect(byRole(anchors, 'crossing')).toHaveLength(0);
  });

  it('out-of-range edge indices are ignored', () => {
    const { vertices, edges } = straightChain(2);
    const anchors = girihGraphAnchors(vertices, [...edges, [0, 99], [-1, 1]]);
    expect(byRole(anchors, 'edge')).toHaveLength(2);
  });

  it('two disjoint strands are two paths, ordered stably by position', () => {
    const a = straightChain(2, 0, 0);
    const b = straightChain(2, 100, 0);
    const vertices = [...a.vertices, ...b.vertices];
    const edges = [
      ...a.edges,
      ...b.edges.map(([p, q]) => [p + a.vertices.length, q + a.vertices.length]),
    ];
    const anchors = girihGraphAnchors(vertices, edges);
    const eAnchors = byRole(anchors, 'edge');
    expect(new Set(eAnchors.map((x) => x.meta.pathIndex)).size).toBe(2);
    // Path 0 is the left-most strand (lowest x): a stable sort of the graph.
    const path0 = eAnchors.filter((x) => x.meta.pathIndex === 0);
    expect(Math.max(...path0.map((x) => x.x))).toBeLessThan(100);
  });
});
