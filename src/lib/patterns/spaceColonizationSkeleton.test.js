import { describe, it, expect } from 'vitest';
import {
  buildSkeleton,
  strahlerFromParents,
  decomposeMainBranches,
  SKELETON_DEFAULTS,
} from './spaceColonizationSkeleton.js';
import { DEFAULT_PARAMS } from '../../constants.js';
import { makeP5Random } from './rng.js';

const W = 1152;
const H = 1152;

/** A zero-arg [0,1) rng seeded exactly as the pattern/extractor pair seeds it. */
const rngFor = (seed) => {
  const r = makeP5Random(seed);
  return () => r();
};

/** Every consecutive (a,b) node pair across every path — the drawn EDGE set. */
const edgePairs = (skel) => {
  const out = [];
  for (const path of skel.paths) {
    for (let i = 0; i < path.nodeIds.length - 1; i++) {
      out.push(`${path.nodeIds[i]}->${path.nodeIds[i + 1]}`);
    }
  }
  return out;
};

describe('spaceColonizationSkeleton — buildSkeleton contract', () => {
  it('returns exactly the frozen shape (T3 CONTRACT, vine-scaffolds-PLAN.md)', () => {
    const skel = buildSkeleton({}, W, H, rngFor(7));

    expect(Array.isArray(skel.nodes)).toBe(true);
    expect(skel.nodes.length).toBeGreaterThan(1);
    for (const n of skel.nodes) {
      expect(Number.isFinite(n.x)).toBe(true);
      expect(Number.isFinite(n.y)).toBe(true);
    }
    expect(skel.parent).toBeInstanceOf(Int32Array);
    expect(skel.order).toBeInstanceOf(Int32Array);
    expect(skel.parent.length).toBe(skel.nodes.length);
    expect(skel.order.length).toBe(skel.nodes.length);
    expect(Array.isArray(skel.tips)).toBe(true);
    expect(Array.isArray(skel.junctions)).toBe(true);
    expect(Array.isArray(skel.paths)).toBe(true);
    expect(skel.bbox).toEqual({
      minX: expect.any(Number),
      minY: expect.any(Number),
      maxX: expect.any(Number),
      maxY: expect.any(Number),
    });
    for (const p of skel.paths) {
      expect(Array.isArray(p.points)).toBe(true);
      expect(Array.isArray(p.nodeIds)).toBe(true);
      expect(p.points.length).toBe(p.nodeIds.length);
      expect(typeof p.tipNode).toBe('number');
    }
  });

  it('has exactly one root (parent -1) and every parent precedes its child', () => {
    const skel = buildSkeleton({}, W, H, rngFor(7));
    let roots = 0;
    for (let i = 0; i < skel.parent.length; i++) {
      if (skel.parent[i] === -1) roots++;
      else expect(skel.parent[i]).toBeLessThan(i);
    }
    expect(roots).toBe(1);
    expect(skel.parent[0]).toBe(-1);
  });

  it('is deterministic: same params + same-seeded rng ⇒ identical skeleton', () => {
    const a = buildSkeleton({}, W, H, rngFor(99));
    const b = buildSkeleton({}, W, H, rngFor(99));
    expect(b.nodes).toEqual(a.nodes);
    expect(Array.from(b.parent)).toEqual(Array.from(a.parent));
    expect(Array.from(b.order)).toEqual(Array.from(a.order));
    expect(b.tips).toEqual(a.tips);
    expect(b.junctions).toEqual(a.junctions);
    expect(b.paths).toEqual(a.paths);
    expect(b.bbox).toEqual(a.bbox);
  });

  it('responds to the seed: a different rng stream ⇒ different geometry', () => {
    const a = buildSkeleton({}, W, H, rngFor(1));
    const b = buildSkeleton({}, W, H, rngFor(2));
    expect(b.nodes).not.toEqual(a.nodes);
  });

  it('respects the maxNodes perf cap', () => {
    const skel = buildSkeleton({ maxNodes: 120 }, W, H, rngFor(3));
    expect(skel.nodes.length).toBeLessThanOrEqual(120);
  });

  it('degenerates honestly: no attractors ⇒ no drawable paths', () => {
    const skel = buildSkeleton({ attractorCount: 0 }, W, H, rngFor(3));
    expect(skel.paths).toEqual([]);
    expect(skel.tips).toEqual([]);
    expect(skel.junctions).toEqual([]);
  });

  it('stays inside the canvas at default params', () => {
    const skel = buildSkeleton({}, W, H, rngFor(11));
    // Centred frame: |x| <= W/2, |y| <= H/2.
    expect(skel.bbox.minX).toBeGreaterThan(-W / 2);
    expect(skel.bbox.maxX).toBeLessThan(W / 2);
    expect(skel.bbox.minY).toBeGreaterThan(-H / 2);
    expect(skel.bbox.maxY).toBeLessThan(H / 2);
  });

  it('COVERAGE — default params fill a meaningful fraction of a 1152² sheet', () => {
    // T0 rejected a scaffold whose bbox covered 2% of the canvas. envelopeScale
    // is the lever; this is the regression guard on the default.
    const skel = buildSkeleton({}, W, H, rngFor(11));
    const area = (skel.bbox.maxX - skel.bbox.minX) * (skel.bbox.maxY - skel.bbox.minY);
    expect(area / (W * H)).toBeGreaterThan(0.4);
  });

  it('produces MANY termini from ONE connected structure (the T0 amended test)', () => {
    const skel = buildSkeleton({}, W, H, rngFor(11));
    expect(skel.tips.length).toBeGreaterThan(20);
    expect(skel.junctions.length).toBeGreaterThan(10);
  });
});

describe('spaceColonizationSkeleton — main-branch path decomposition', () => {
  it('partitions the EDGE set: every edge in exactly one path', () => {
    const skel = buildSkeleton({}, W, H, rngFor(5));
    const pairs = edgePairs(skel);
    expect(new Set(pairs).size).toBe(pairs.length); // no duplicates
    expect(pairs.length).toBe(skel.nodes.length - 1); // a tree has n-1 edges
  });

  it('covers every node and every path ends at a REAL tip', () => {
    const skel = buildSkeleton({}, W, H, rngFor(5));
    const seen = new Set();
    for (const p of skel.paths) for (const id of p.nodeIds) seen.add(id);
    expect(seen.size).toBe(skel.nodes.length);

    const tipSet = new Set(skel.tips);
    for (const p of skel.paths) {
      expect(p.nodeIds[p.nodeIds.length - 1]).toBe(p.tipNode);
      expect(tipSet.has(p.tipNode)).toBe(true);
    }
    expect(skel.paths.length).toBe(skel.tips.length);
    expect(new Set(skel.paths.map((p) => p.tipNode)).size).toBe(skel.paths.length);
  });

  it('the TRUNK appears exactly once — only path 0 starts at the root', () => {
    const skel = buildSkeleton({}, W, H, rngFor(5));
    const startingAtRoot = skel.paths.filter((p) => p.nodeIds[0] === 0);
    expect(startingAtRoot.length).toBe(1);
    expect(skel.paths[0].nodeIds[0]).toBe(0);
  });

  it('points mirror nodeIds (the drawn polyline IS the walked node chain)', () => {
    const skel = buildSkeleton({}, W, H, rngFor(5));
    for (const p of skel.paths) {
      p.nodeIds.forEach((id, i) => {
        expect(p.points[i]).toEqual(skel.nodes[id]);
      });
    }
  });

  describe('decomposeMainBranches (pure, on a hand-built tree)', () => {
    // 0─1─2─3        (trunk, continues through the higher-order child)
    //     └4─5
    const nodes = [
      { x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 0 },
      { x: 2, y: 1 }, { x: 2, y: 2 },
    ];
    const parent = Int32Array.from([-1, 0, 1, 2, 2, 4]);

    it('continues through the highest-order child; siblings start a new path AT the junction', () => {
      const order = strahlerFromParents(parent);
      const paths = decomposeMainBranches(nodes, parent, order, [3, 5]);
      expect(paths.map((p) => p.nodeIds)).toEqual([
        [0, 1, 2, 3],
        [2, 4, 5],
      ]);
      // The side path INCLUDES the junction node so the drawing stays connected,
      // while the edge 2→4 still belongs to exactly one path.
      expect(paths[1].nodeIds[0]).toBe(2);
    });

    it('breaks an order tie on the LOWEST child node index (fixed tie-break)', () => {
      //   0─1─2   and   0─1─3 : children 2 and 3 are both order 1.
      const tieNodes = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 1 }];
      const tieParent = Int32Array.from([-1, 0, 1, 1]);
      const order = strahlerFromParents(tieParent);
      const paths = decomposeMainBranches(tieNodes, tieParent, order, [2, 3]);
      expect(paths[0].nodeIds).toEqual([0, 1, 2]); // 2 < 3 continues
      expect(paths[1].nodeIds).toEqual([1, 3]);
    });
  });
});

describe('spaceColonizationSkeleton — Horton–Strahler order', () => {
  it('a bare chain is order 1 everywhere', () => {
    const order = strahlerFromParents(Int32Array.from([-1, 0, 1, 2]));
    expect(Array.from(order)).toEqual([1, 1, 1, 1]);
  });

  it('two order-1 children promote their parent to order 2', () => {
    //     0
    //    / \
    //   1   2
    const order = strahlerFromParents(Int32Array.from([-1, 0, 0]));
    expect(Array.from(order)).toEqual([2, 1, 1]);
  });

  it('an order-2 and an order-1 child leave the parent at order 2 (no promotion)', () => {
    //   0 ─┬ 1 ─┬ 3
    //      │    └ 4
    //      └ 2
    // node1 carries two leaves ⇒ order 2; node0's children are order 2 and
    // order 1, so the max occurs ONCE ⇒ node0 inherits 2 rather than promoting.
    const order = strahlerFromParents(Int32Array.from([-1, 0, 0, 1, 1]));
    expect(Array.from(order)).toEqual([2, 2, 1, 1, 1]);
  });

  it('TWO order-2 children DO promote the parent to order 3', () => {
    //   0 ─┬ 1 ─┬ 2
    //      │    └ 3
    //      └ 4 ─┬ 5
    //           └ 6
    const order = strahlerFromParents(Int32Array.from([-1, 0, 1, 1, 0, 4, 4]));
    expect(Array.from(order)).toEqual([3, 2, 1, 1, 2, 1, 1]);
  });

  it('on a real skeleton every tip is order 1 and the root carries the maximum', () => {
    const skel = buildSkeleton({}, W, H, rngFor(5));
    for (const t of skel.tips) expect(skel.order[t]).toBe(1);
    const max = Math.max(...Array.from(skel.order));
    expect(skel.order[0]).toBe(max);
    expect(max).toBeGreaterThan(2);
  });
});

describe('spaceColonizationSkeleton — envelope shapes', () => {
  for (const envelopeShape of ['circle', 'lozenge', 'rect', 'ring']) {
    it(`grows a connected tree inside the ${envelopeShape} envelope`, () => {
      const skel = buildSkeleton({ envelopeShape }, W, H, rngFor(13));
      expect(skel.nodes.length).toBeGreaterThan(50);
      expect(skel.tips.length).toBeGreaterThan(5);
      const pairs = edgePairs(skel);
      expect(pairs.length).toBe(skel.nodes.length - 1);
    });
  }

  it('envelopeScale scales the footprint', () => {
    const small = buildSkeleton({ envelopeScale: 0.3 }, W, H, rngFor(13));
    const big = buildSkeleton({ envelopeScale: 0.9 }, W, H, rngFor(13));
    const span = (s) => s.bbox.maxX - s.bbox.minX;
    expect(span(big)).toBeGreaterThan(span(small) * 1.5);
  });
});

describe('spaceColonizationSkeleton — the two defaults tables agree', () => {
  it('SKELETON_DEFAULTS matches DEFAULT_PARAMS.branch key for key', () => {
    // Two sources of truth (the core owns the algorithm defaults; constants.js
    // owns the layer defaults the UI writes). This pins them together so a
    // params-less buildSkeleton call can never model a different plant than the
    // one the app renders.
    for (const [key, value] of Object.entries(SKELETON_DEFAULTS)) {
      expect(DEFAULT_PARAMS.branch[key], `SKELETON_DEFAULTS.${key}`).toBe(value);
    }
  });

  it('growth survives the LOW end of the attractionRadius slider', () => {
    // Regression: attractionRadius below the kill distance / attractor spacing
    // used to stall the plant at ~8 nodes with 99% of the attractors unused.
    // The `reach` floor repairs it (see buildSkeleton).
    const low = buildSkeleton({ attractionRadius: 30 }, W, H, rngFor(1234));
    expect(low.nodes.length).toBeGreaterThan(500);
    expect(low.tips.length).toBeGreaterThan(20);

    const fine = buildSkeleton(
      { attractorCount: 2000, killDistance: 8, stepLength: 4, attractionRadius: 30, maxNodes: 4000, envelopeScale: 1 },
      W, H, rngFor(1234)
    );
    expect(fine.nodes.length).toBeGreaterThan(500);
  });

  it('the reach floor NEVER perturbs the default plant', () => {
    // At defaults both floors sit far below attractionRadius, so the floor is
    // inert there — the byte-identical-defaults discipline.
    const a = buildSkeleton({}, W, H, rngFor(1234));
    const b = buildSkeleton({ attractionRadius: 110 }, W, H, rngFor(1234));
    expect(b.nodes).toEqual(a.nodes);
  });
});
