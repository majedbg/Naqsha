import { describe, it, expect } from 'vitest';
import { selectAnchors } from './placementEngine.js';

// --- helpers -------------------------------------------------------------
// Minimal Anchor factory matching the anchors.js shape. We only populate the
// fields the placement engine reads (id, role, x, y); tangent/normal/s/meta
// are carried through untouched so a survivor is `===` its input anchor.
let uid = 0;
function mkAnchor(role, x, y, id) {
  uid += 1;
  return {
    id: id ?? `${role}:${uid}`,
    role,
    x,
    y,
    tangent: 0,
    normal: 0,
    s: 0,
    meta: { pathIndex: 0, sampleIndex: uid, closed: false },
  };
}

// A row of anchors evenly spaced along y=0, ids a0..a{n-1}, all role 'edge'.
function edgeRow(n) {
  return Array.from({ length: n }, (_, i) => mkAnchor('edge', i * 10, 0, `a${i}`));
}

const ids = (arr) => arr.map((a) => a.id);

// ------------------------------------------------------------------------
describe('selectAnchors — role filter', () => {
  it('null/undefined roles passes all', () => {
    const anchors = [mkAnchor('edge', 0, 0, 'e'), mkAnchor('tip', 1, 1, 't')];
    expect(ids(selectAnchors(anchors, {}).survivors)).toEqual(['e', 't']);
    expect(ids(selectAnchors(anchors, { roles: null }).survivors)).toEqual(['e', 't']);
  });

  it("['edge'] keeps only edge anchors", () => {
    const anchors = [
      mkAnchor('edge', 0, 0, 'e0'),
      mkAnchor('tip', 1, 1, 't0'),
      mkAnchor('edge', 2, 2, 'e1'),
    ];
    expect(ids(selectAnchors(anchors, { roles: ['edge'] }).survivors)).toEqual(['e0', 'e1']);
  });

  it('[] keeps none', () => {
    const anchors = [mkAnchor('edge', 0, 0, 'e'), mkAnchor('tip', 1, 1, 't')];
    expect(selectAnchors(anchors, { roles: [] }).survivors).toEqual([]);
  });
});

describe('selectAnchors — rate (every-Nth)', () => {
  it('n=2 offset=0 keeps even indices of the eligible list', () => {
    const anchors = edgeRow(6); // a0..a5
    const { survivors } = selectAnchors(anchors, { rate: { n: 2, offset: 0 } });
    expect(ids(survivors)).toEqual(['a0', 'a2', 'a4']);
  });

  it('offset=1 shifts the kept set', () => {
    const anchors = edgeRow(6);
    const { survivors } = selectAnchors(anchors, { rate: { n: 2, offset: 1 } });
    expect(ids(survivors)).toEqual(['a1', 'a3', 'a5']);
  });

  it('rate indexes on the role-eligible list, not the original index', () => {
    // Interleave a non-eligible role so eligible indices differ from originals.
    const anchors = [
      mkAnchor('tip', 0, 0, 't0'),
      mkAnchor('edge', 10, 0, 'e0'),
      mkAnchor('tip', 20, 0, 't1'),
      mkAnchor('edge', 30, 0, 'e1'),
      mkAnchor('edge', 40, 0, 'e2'),
    ];
    // eligible = [e0, e1, e2]; n=2 offset=0 → e0(0), e2(2).
    const { survivors } = selectAnchors(anchors, { roles: ['edge'], rate: { n: 2, offset: 0 } });
    expect(ids(survivors)).toEqual(['e0', 'e2']);
  });
});

describe('selectAnchors — skip mask', () => {
  it('cycles the boolean mask over the rate survivors; true = drop', () => {
    const anchors = edgeRow(6); // a0..a5, all survive rate n=1
    const { survivors } = selectAnchors(anchors, { skip: [false, true] });
    // mask cycles: a0 keep, a1 drop, a2 keep, a3 drop, a4 keep, a5 drop
    expect(ids(survivors)).toEqual(['a0', 'a2', 'a4']);
  });

  it('null skip drops nothing', () => {
    const anchors = edgeRow(3);
    expect(ids(selectAnchors(anchors, { skip: null }).survivors)).toEqual(['a0', 'a1', 'a2']);
  });
});

describe('selectAnchors — density (seeded)', () => {
  it('density=1 keeps all and consumes no RNG', () => {
    const anchors = edgeRow(4);
    expect(ids(selectAnchors(anchors, { density: 1, seed: 1 }).survivors))
      .toEqual(['a0', 'a1', 'a2', 'a3']);
  });

  it('density<1 keeps the deterministic subset for seed=1', () => {
    // mulberry32(1) draws: .6271 .0027 .5274 .9811 .9684 .2811 .6128 .7207 .4258 .9948
    // keep where draw < 0.5 → indices 1,5,8 → a1,a5,a8
    const anchors = edgeRow(10);
    const { survivors } = selectAnchors(anchors, { density: 0.5, seed: 1 });
    expect(ids(survivors)).toEqual(['a1', 'a5', 'a8']);
  });

  it('two calls with the same seed give identical survivors', () => {
    const anchors = edgeRow(10);
    const a = selectAnchors(anchors, { density: 0.5, seed: 1 });
    const b = selectAnchors(anchors, { density: 0.5, seed: 1 });
    expect(ids(a.survivors)).toEqual(ids(b.survivors));
  });

  it('a different seed produces a different subset', () => {
    // seed=2 draws → keep indices 1,2,6,7,9 (differs from seed=1's 1,5,8)
    const anchors = edgeRow(10);
    const s1 = selectAnchors(anchors, { density: 0.5, seed: 1 });
    const s2 = selectAnchors(anchors, { density: 0.5, seed: 2 });
    expect(ids(s2.survivors)).toEqual(['a1', 'a2', 'a6', 'a7', 'a9']);
    expect(ids(s2.survivors)).not.toEqual(ids(s1.survivors));
  });
});

describe('selectAnchors — field mask', () => {
  it('keeps when sampleNorm >= threshold', () => {
    const anchors = edgeRow(3);
    const field = { sampleNorm: () => 0.7 };
    const { survivors } = selectAnchors(anchors, { field, fieldThreshold: 0.5 }, { canvasW: 100, canvasH: 100 });
    expect(ids(survivors)).toEqual(['a0', 'a1', 'a2']);
  });

  it('drops when sampleNorm < threshold', () => {
    const anchors = edgeRow(3);
    const field = { sampleNorm: () => 0.7 };
    const { survivors } = selectAnchors(anchors, { field, fieldThreshold: 0.9 }, { canvasW: 100, canvasH: 100 });
    expect(survivors).toEqual([]);
  });

  it('invert flips the comparison', () => {
    const anchors = edgeRow(3);
    const field = { sampleNorm: () => 0.7 };
    const { survivors } = selectAnchors(
      anchors,
      { field, fieldThreshold: 0.9, fieldInvert: true },
      { canvasW: 100, canvasH: 100 },
    );
    expect(ids(survivors)).toEqual(['a0', 'a1', 'a2']); // 0.7 < 0.9 → kept under invert
  });

  it('maps x,y → u,v (u=x/canvasW) in the correct argument order', () => {
    // x values 0,10,20,...; canvasW=50 → u = 0,0.2,0.4,0.6,0.8. sampleNorm=(u)=>u.
    // threshold 0.5 keeps u>=0.5 → a3(0.6), a4(0.8).
    const anchors = edgeRow(5);
    const field = { sampleNorm: (u) => u };
    const { survivors } = selectAnchors(
      anchors,
      { field, fieldThreshold: 0.5 },
      { canvasW: 50, canvasH: 100 },
    );
    expect(ids(survivors)).toEqual(['a3', 'a4']);
  });

  it('is skipped when canvas dims are missing', () => {
    const anchors = edgeRow(3);
    const field = { sampleNorm: () => 0 }; // would drop everything if applied
    const { survivors } = selectAnchors(anchors, { field, fieldThreshold: 0.5 });
    expect(ids(survivors)).toEqual(['a0', 'a1', 'a2']);
  });
});

describe('selectAnchors — overrides', () => {
  it('exact-id include re-adds a rate-dropped anchor', () => {
    const anchors = edgeRow(6);
    // rate n=2 → a0,a2,a4 survive; force-include a1.
    const { survivors } = selectAnchors(anchors, {
      rate: { n: 2, offset: 0 },
      overrides: { include: ['a1'] },
    });
    expect(ids(survivors)).toEqual(['a0', 'a1', 'a2', 'a4']);
  });

  it('exact-id exclude removes a survivor', () => {
    const anchors = edgeRow(4);
    const { survivors } = selectAnchors(anchors, { overrides: { exclude: ['a2'] } });
    expect(ids(survivors)).toEqual(['a0', 'a1', 'a3']);
  });

  it('spatial re-bind include binds to the nearest anchor within tolerance', () => {
    const anchors = edgeRow(6); // a1 at x=10
    const { survivors, orphans } = selectAnchors(anchors, {
      rate: { n: 2, offset: 0 }, // a0,a2,a4
      overrides: { include: [{ x: 12, y: 1 }], tolerance: 8 },
    });
    expect(ids(survivors)).toEqual(['a0', 'a1', 'a2', 'a4']); // rebinds to a1
    expect(orphans).toEqual([]);
  });

  it('out-of-tolerance include becomes an orphan and is not a survivor', () => {
    const anchors = edgeRow(3); // xs 0,10,20
    const ref = { x: 100, y: 100 };
    const { survivors, orphans } = selectAnchors(anchors, {
      overrides: { include: [ref], tolerance: 8 },
    });
    expect(ids(survivors)).toEqual(['a0', 'a1', 'a2']); // unchanged
    expect(orphans).toEqual([ref]); // verbatim ref
  });

  it('restricts spatial rebind to the ref role when specified', () => {
    const anchors = [
      mkAnchor('tip', 10, 0, 't0'),
      mkAnchor('edge', 12, 0, 'e0'), // slightly farther but role matches
    ];
    const { survivors } = selectAnchors(anchors, {
      roles: ['nonexistent'], // nothing survives rules
      overrides: { include: [{ x: 10, y: 0, role: 'edge' }], tolerance: 8 },
    });
    // nearest overall is t0, but role filter forces e0
    expect(ids(survivors)).toEqual(['e0']);
  });

  it('exclude wins when include and exclude target the same anchor', () => {
    const anchors = edgeRow(4);
    const { survivors } = selectAnchors(anchors, {
      overrides: { include: ['a2'], exclude: ['a2'] },
    });
    expect(ids(survivors)).toEqual(['a0', 'a1', 'a3']);
  });

  it('exclude wins when both spatially rebind to the same anchor', () => {
    const anchors = edgeRow(4); // a1 at x=10
    const { survivors } = selectAnchors(anchors, {
      overrides: {
        include: [{ x: 11, y: 0 }],
        exclude: [{ x: 9, y: 0 }],
        tolerance: 8,
      },
    });
    expect(ids(survivors)).toEqual(['a0', 'a2', 'a3']); // a1 excluded
  });

  it('exclude miss is silently ignored (no orphan)', () => {
    const anchors = edgeRow(3);
    const { survivors, orphans } = selectAnchors(anchors, {
      overrides: { exclude: [{ x: 999, y: 999 }], tolerance: 8 },
    });
    expect(ids(survivors)).toEqual(['a0', 'a1', 'a2']);
    expect(orphans).toEqual([]);
  });
});

describe('selectAnchors — master determinism', () => {
  it('rate+density+field+overrides run twice is byte-identical (survivors and orphans)', () => {
    const anchors = edgeRow(10); // xs 0..90
    const field = { sampleNorm: (u) => (u < 0.85 ? 1 : 0) }; // keep almost all
    const rules = {
      roles: ['edge'],
      rate: { n: 1, offset: 0 },
      skip: [false, false, true],
      density: 0.7,
      seed: 42,
      field,
      fieldThreshold: 0.5,
      overrides: {
        include: [{ x: 55, y: 1 }], // spatial rebind → a5 (or nearest)
        exclude: ['a0'],
        tolerance: 8,
      },
    };
    const opts = { canvasW: 100, canvasH: 100 };
    const a = selectAnchors(anchors, rules, opts);
    const b = selectAnchors(anchors, rules, opts);
    expect(ids(a.survivors)).toEqual(ids(b.survivors));
    expect(a.orphans).toEqual(b.orphans);
    // survivors returned in original input order
    const originalOrder = ids(a.survivors);
    const sorted = [...originalOrder].sort(
      (x, y) => Number(x.slice(1)) - Number(y.slice(1)),
    );
    expect(originalOrder).toEqual(sorted);
  });

  it('master path with an unresolvable include yields a stable orphan', () => {
    const anchors = edgeRow(5);
    const rules = {
      rate: { n: 2, offset: 0 },
      overrides: { include: [{ x: 500, y: 500 }, 'a1'], tolerance: 8 },
    };
    const a = selectAnchors(anchors, rules);
    const b = selectAnchors(anchors, rules);
    expect(a.orphans).toEqual([{ x: 500, y: 500 }]);
    expect(a.orphans).toEqual(b.orphans);
    expect(ids(a.survivors)).toEqual(['a0', 'a1', 'a2', 'a4']); // a1 re-added
  });
});
