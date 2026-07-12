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

  // Legacy base-copy fallback: before the grid-geometry-core refactor, a
  // symmetry>1 grid host emitted anchors for the BASE COPY ONLY, keyed by an
  // un-suffixed id (e.g. 'crossing:1:1'). The core now suffixes the symmetry
  // copy index, so that base copy is 'crossing:1:1:0'. An override string saved
  // against the old id must still resolve — to copy 0.
  it('legacy base-copy id rebinds to the :0 copy of a symmetry>1 grid host', () => {
    const anchors = [
      mkAnchor('crossing', 0, 0, 'crossing:1:1:0'), // copy 0 — the intended bind
      mkAnchor('crossing', 100, 100, 'crossing:1:1:1'), // copy 1 — must NOT be chosen
      mkAnchor('crossing', 5, 5, 'crossing:2:2:0'),
    ];
    // Drop everything via a role that matches nothing, then force-include the
    // legacy (un-suffixed) ref: only its :0 copy comes back.
    const { survivors, orphans } = selectAnchors(anchors, {
      roles: ['edge'],
      overrides: { include: ['crossing:1:1'] },
    });
    expect(ids(survivors)).toEqual(['crossing:1:1:0']);
    expect(orphans).toEqual([]);
  });

  it('legacy exclude id removes the :0 copy of a symmetry>1 grid host', () => {
    const anchors = [
      mkAnchor('crossing', 0, 0, 'crossing:1:1:0'),
      mkAnchor('crossing', 5, 5, 'crossing:2:2:0'),
    ];
    const { survivors } = selectAnchors(anchors, {
      overrides: { exclude: ['crossing:1:1'] },
    });
    expect(ids(survivors)).toEqual(['crossing:2:2:0']); // legacy exclude hit copy 0
  });

  it('does NOT consult the :0 fallback when an exact id match exists (sym=1)', () => {
    // sym=1 ids are un-suffixed, so the exact match wins and the fallback never
    // fires — a bare 'crossing:1:1' must bind to the un-suffixed anchor, not a
    // stray ':0' sibling.
    const anchors = [
      mkAnchor('crossing', 0, 0, 'crossing:1:1'), // exact (sym=1)
      mkAnchor('crossing', 9, 9, 'crossing:1:1:0'), // a would-be fallback target
    ];
    const { survivors } = selectAnchors(anchors, {
      roles: ['edge'],
      overrides: { include: ['crossing:1:1'] },
    });
    expect(ids(survivors)).toEqual(['crossing:1:1']);
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

// ========================================================================
// resolvePlacements + placeMotifs — TRANSFORM + ACCEPTANCE half.
// ========================================================================
import { resolvePlacements, placeMotifs } from './placementEngine.js';
import { mulberry32 } from '../patterns/rng.js';

// Anchor factory that lets us set tangent/normal/junction explicitly.
function mkA(id, x, y, { role = 'edge', tangent = 0, normal = 0, junction = false } = {}) {
  return {
    id,
    role,
    x,
    y,
    tangent,
    normal,
    s: 0,
    meta: junction ? { junction: true } : {},
  };
}

const toDeg = (rad) => (rad * 180) / Math.PI;
const byAnchorId = (placements, id) => placements.find((p) => p.anchorId === id);

describe('resolvePlacements — sequence + flip', () => {
  it('sequence cycles A/B/C and flip alternates INDEPENDENTLY (odd i only)', () => {
    // 6 anchors, far apart so fixed footprints never collide.
    const anchors = Array.from({ length: 6 }, (_, i) => mkA(`a${i}`, i * 100, 0));
    const { placements, rejected } = resolvePlacements(anchors, {
      sequence: ['A', 'B', 'C'],
      flip: true,
      sizing: { mode: 'fixed', size: 1 },
    });
    expect(rejected).toEqual([]);
    expect(placements.map((p) => p.seqId)).toEqual(['A', 'B', 'C', 'A', 'B', 'C']);
    expect(placements.map((p) => p.flip)).toEqual([false, true, false, true, false, true]);
    // seqId is independent of flip (3-cycle vs 2-cycle prove decoupling).
    expect(placements.map((p) => p.index)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('flip:false disables flip entirely', () => {
    const anchors = Array.from({ length: 3 }, (_, i) => mkA(`a${i}`, i * 100, 0));
    const { placements } = resolvePlacements(anchors, { sizing: { mode: 'fixed', size: 1 } });
    expect(placements.map((p) => p.flip)).toEqual([false, false, false]);
    expect(placements.map((p) => p.seqId)).toEqual(['A', 'A', 'A']); // default identity cycle
  });
});

describe('resolvePlacements — orientation', () => {
  const base = { sizing: { mode: 'fixed', size: 1 } };

  it('path policy uses normal (rotation = deg(normal) + offset)', () => {
    const anchors = [mkA('a0', 0, 0, { normal: Math.PI / 2, tangent: 0 })];
    const { placements } = resolvePlacements(anchors, {
      ...base,
      orientation: { policy: 'path', useNormal: true, offset: 10 },
    });
    expect(placements[0].rotation).toBeCloseTo(toDeg(Math.PI / 2) + 10, 9);
  });

  it('path policy useNormal:false uses tangent', () => {
    const anchors = [mkA('a0', 0, 0, { normal: Math.PI / 2, tangent: Math.PI })];
    const { placements } = resolvePlacements(anchors, {
      ...base,
      orientation: { policy: 'path', useNormal: false, offset: 0 },
    });
    expect(placements[0].rotation).toBeCloseTo(toDeg(Math.PI), 9);
  });

  it('page policy uses a fixed page angle (baseDeg 0 → rotation = offset)', () => {
    const anchors = [mkA('a0', 0, 0, { normal: Math.PI / 2, tangent: Math.PI })];
    const { placements } = resolvePlacements(anchors, {
      ...base,
      orientation: { policy: 'page', offset: 25 },
    });
    expect(placements[0].rotation).toBeCloseTo(25, 9);
  });

  it('perRole override wins over the base orientation', () => {
    const anchors = [
      mkA('e0', 0, 0, { role: 'edge', normal: Math.PI / 2 }),
      mkA('c0', 100, 0, { role: 'crossing', normal: Math.PI / 2 }),
    ];
    const { placements } = resolvePlacements(anchors, {
      ...base,
      orientation: {
        policy: 'path',
        useNormal: true,
        offset: 0,
        perRole: { crossing: { policy: 'page', offset: 5 } },
      },
    });
    // edge follows base path/normal; crossing follows page override.
    expect(byAnchorId(placements, 'e0').rotation).toBeCloseTo(toDeg(Math.PI / 2), 9);
    expect(byAnchorId(placements, 'c0').rotation).toBeCloseTo(5, 9);
  });
});

describe('resolvePlacements — jitter', () => {
  it('amount 0 ⇒ no displacement / no rotation jitter / scale 1', () => {
    const anchors = [mkA('a0', 5, 7, { normal: Math.PI / 2, tangent: 0 })];
    const { placements } = resolvePlacements(anchors, {
      sizing: { mode: 'fixed', size: 1 },
      orientation: { policy: 'page', offset: 3 },
      jitter: {
        seed: 99,
        lateral: 0, along: 0, rotation: 0, scale: 0,
        lateralRange: 50, alongRange: 50, rotationRange: 90, scaleRange: 2,
      },
    });
    expect(placements[0].x).toBeCloseTo(5, 9);
    expect(placements[0].y).toBeCloseTo(7, 9);
    expect(placements[0].rotation).toBeCloseTo(3, 9);
    expect(placements[0].scale).toBeCloseTo(1, 9);
  });

  it('lateral moves along the NORMAL, along moves along the TANGENT', () => {
    // tangent=+x, normal=+y so the two axes are orthogonal and separable.
    const anchor = () => mkA('a0', 0, 0, { normal: Math.PI / 2, tangent: 0 });
    const SEED = 12345;

    // lateral-only: expect motion purely in +y (normal), x unchanged.
    const latRun = resolvePlacements([anchor()], {
      sizing: { mode: 'fixed', size: 1 },
      jitter: { seed: SEED, lateral: 1, lateralRange: 10 },
    });
    const r1 = mulberry32(SEED);
    const dLat = r1();
    const expectedLatDisp = (dLat * 2 - 1) * 10;
    expect(latRun.placements[0].x).toBeCloseTo(0, 9); // cos(π/2) ≈ 0
    expect(latRun.placements[0].y).toBeCloseTo(expectedLatDisp, 9);

    // along-only: expect motion purely in +x (tangent), y unchanged.
    const alongRun = resolvePlacements([anchor()], {
      sizing: { mode: 'fixed', size: 1 },
      jitter: { seed: SEED, along: 1, alongRange: 10 },
    });
    const r2 = mulberry32(SEED);
    r2(); // burn the lateral draw (always drawn, in order)
    const dAlong = r2();
    const expectedAlongDisp = (dAlong * 2 - 1) * 10;
    expect(alongRun.placements[0].x).toBeCloseTo(expectedAlongDisp, 9);
    expect(alongRun.placements[0].y).toBeCloseTo(0, 9);
  });

  it('always draws 4 per survivor in order: a later property is invariant to an earlier amount', () => {
    // Fixed mode ⇒ scale output == scaleFactor, independent of position, so
    // the scale (4th) draw is observable in isolation. Toggling the lateral
    // (1st) amount must NOT change the scale draw.
    const anchor = () => mkA('a0', 0, 0, { normal: Math.PI / 2, tangent: 0 });
    const common = {
      sizing: { mode: 'fixed', size: 4 },
      jitter: { seed: 555, lateralRange: 10, scale: 1, scaleRange: 0.5 },
    };
    const A = resolvePlacements([anchor()], { ...common, jitter: { ...common.jitter, lateral: 0 } });
    const B = resolvePlacements([anchor()], { ...common, jitter: { ...common.jitter, lateral: 1 } });
    // Scale draw identical regardless of lateral amount.
    expect(A.placements[0].scale).toBe(B.placements[0].scale);
    // ...but B actually moved (proves lateral consumed its own draw, not scale's).
    expect(A.placements[0].y).toBeCloseTo(0, 9);
    expect(B.placements[0].y).not.toBeCloseTo(0, 6);
  });
});

describe('resolvePlacements — sizing fixed', () => {
  it('fits when empty: radius = size, scale = 1', () => {
    const { placements, rejected } = resolvePlacements([mkA('a0', 0, 0)], {
      sizing: { mode: 'fixed', size: 5 },
    });
    expect(rejected).toEqual([]);
    expect(placements[0].radius).toBe(5);
    expect(placements[0].scale).toBe(1);
  });

  it("rejects 'no-fit' when a big prior obstacle blocks the anchor", () => {
    const anchors = [mkA('a0', 0, 0), mkA('a1', 3, 0)];
    const { placements, rejected } = resolvePlacements(anchors, {
      sizing: { mode: 'fixed', size: 5 },
    });
    expect(placements.map((p) => p.anchorId)).toEqual(['a0']);
    expect(rejected).toEqual([{ anchorId: 'a1', reason: 'no-fit' }]);
  });

  it("rejects 'below-floor' when radius < min", () => {
    const { placements, rejected } = resolvePlacements([mkA('a0', 0, 0)], {
      sizing: { mode: 'fixed', size: 2, min: 5 },
    });
    expect(placements).toEqual([]);
    expect(rejected).toEqual([{ anchorId: 'a0', reason: 'below-floor' }]);
  });
});

describe('resolvePlacements — sizing proportional', () => {
  const boundary = { type: 'rect', width: 100, height: 100 };

  it('radius scales DOWN to the empty circle (margin*R), capped at the natural size', () => {
    // Contract (refined after adversarial review): proportional = natural size
    // (size*scaleFactor), shrunk to fit context, never exceeding it. Here the
    // context (margin*R) is the binding constraint and shrinks the motif below
    // its natural size of 50.
    const { placements } = resolvePlacements(
      [mkA('a0', 50, 50)],
      { sizing: { mode: 'proportional', size: 50, margin: 0.4 } },
      { boundary },
    );
    // R = min(50,50,50,50) = 50 ⇒ margin*R = 0.4*50 = 20 < natural 50 ⇒ radius 20, scale = 20/50 = 0.4.
    expect(placements[0].radius).toBeCloseTo(20, 9);
    expect(placements[0].scale).toBeCloseTo(0.4, 9);
  });

  it('proportional caps at the natural size when the empty circle is larger', () => {
    // Spacious context: margin*R (0.9*50=45) exceeds natural size (10) ⇒ the
    // motif stays at its natural size, it does not balloon to fill the room.
    const { placements } = resolvePlacements(
      [mkA('a0', 50, 50)],
      { sizing: { mode: 'proportional', size: 10, margin: 0.9 } },
      { boundary },
    );
    expect(placements[0].radius).toBeCloseTo(10, 9);
    expect(placements[0].scale).toBeCloseTo(1, 9);
  });

  it('greedy obstacle accumulation: a near neighbour gets a smaller radius than if alone', () => {
    const cfg = { sizing: { mode: 'proportional', size: 10, margin: 0.3 } };
    // a1 alone.
    const alone = resolvePlacements([mkA('a1', 60, 50)], cfg, { boundary });
    // a0 then a1 — a0's footprint shrinks a1.
    const together = resolvePlacements(
      [mkA('a0', 30, 50), mkA('a1', 60, 50)],
      cfg,
      { boundary },
    );
    const a1Alone = alone.placements[0].radius;
    const a1After = byAnchorId(together.placements, 'a1').radius;
    expect(a1After).toBeLessThan(a1Alone);
  });
});

describe('resolvePlacements — junction policy', () => {
  const jitterCfg = {
    sizing: { mode: 'fixed', size: 1 },
    jitter: {
      seed: 2024,
      lateral: 1, lateralRange: 5,
      rotation: 1, rotationRange: 20,
      scale: 1, scaleRange: 0.3,
    },
  };

  it("'skip' rejects junction anchors but leaves other anchors' jitter UNCHANGED (RNG independence)", () => {
    const anchors = [
      mkA('a0', 0, 0, { normal: Math.PI / 2 }),
      mkA('a1', 1000, 0, { normal: Math.PI / 2, junction: true }),
      mkA('a2', 2000, 0, { normal: Math.PI / 2 }),
    ];
    const skipRun = resolvePlacements(anchors, { ...jitterCfg, junction: 'skip' });
    const centerRun = resolvePlacements(anchors, { ...jitterCfg, junction: 'center' });

    expect(skipRun.rejected).toEqual([{ anchorId: 'a1', reason: 'junction-skip' }]);
    expect(skipRun.placements.map((p) => p.anchorId)).toEqual(['a0', 'a2']);
    // 'center' keeps the junction anchor.
    expect(centerRun.placements.map((p) => p.anchorId)).toEqual(['a0', 'a1', 'a2']);

    // a2 (index 2) draws d8..d11 in BOTH runs because the skipped junction
    // still consumed d4..d7. Its full placement must be byte-identical.
    const a2Skip = byAnchorId(skipRun.placements, 'a2');
    const a2Center = byAnchorId(centerRun.placements, 'a2');
    expect(a2Skip).toEqual(a2Center);
  });
});

describe('resolvePlacements / placeMotifs — MASTER DETERMINISM', () => {
  function scene() {
    // 8 anchors in a 200x200 region, mixed roles/normals; one junction; some
    // packed close so proportional sizing produces real rejections too.
    return [
      mkA('a0', 30, 30, { role: 'edge', normal: 0.2, tangent: 1.3 }),
      mkA('a1', 40, 35, { role: 'crossing', normal: 1.1, tangent: 0.4, junction: true }),
      mkA('a2', 100, 60, { role: 'edge', normal: 2.0, tangent: 0.9 }),
      mkA('a3', 105, 62, { role: 'edge', normal: 0.7, tangent: 2.6 }),
      mkA('a4', 160, 40, { role: 'crossing', normal: 1.5, tangent: 0.1 }),
      mkA('a5', 60, 150, { role: 'edge', normal: 2.7, tangent: 1.9 }),
      mkA('a6', 150, 160, { role: 'edge', normal: 0.9, tangent: 3.0 }),
      mkA('a7', 155, 165, { role: 'crossing', normal: 1.8, tangent: 2.2 }),
    ];
  }
  const boundary = { type: 'rect', width: 200, height: 200 };
  const placement = {
    sequence: ['A', 'B', 'C'],
    flip: true,
    orientation: {
      policy: 'path',
      useNormal: true,
      offset: 15,
      perRole: { crossing: { policy: 'page', offset: 90 } },
    },
    jitter: {
      seed: 7,
      lateral: 0.6, along: 0.4, rotation: 0.5, scale: 0.5,
      lateralRange: 8, alongRange: 6, rotationRange: 30, scaleRange: 0.4,
    },
    sizing: { mode: 'proportional', size: 10, min: 1, margin: 0.4 },
    junction: 'skip',
  };

  it('resolvePlacements twice ⇒ byte-identical placements AND rejected', () => {
    const a = resolvePlacements(scene(), placement, { boundary });
    const b = resolvePlacements(scene(), placement, { boundary });
    expect(a.placements).toEqual(b.placements);
    expect(a.rejected).toEqual(b.rejected);
    // Sanity: the config actually exercises acceptance AND rejection.
    expect(a.placements.length).toBeGreaterThan(0);
    expect(a.rejected.length).toBeGreaterThan(0);
    // The junction anchor was skipped.
    expect(a.rejected).toContainEqual({ anchorId: 'a1', reason: 'junction-skip' });
  });

  it('placeMotifs end-to-end twice ⇒ identical placements, orphans, rejected', () => {
    const binding = {
      selection: { roles: ['edge', 'crossing'] },
      placement,
    };
    const opts = { boundary, canvasW: 200, canvasH: 200 };
    const a = placeMotifs(scene(), binding, opts);
    const b = placeMotifs(scene(), binding, opts);
    expect(a.placements).toEqual(b.placements);
    expect(a.orphans).toEqual(b.orphans);
    expect(a.rejected).toEqual(b.rejected);
  });
});

// --- review-driven acceptance-contract tests (the no-overlap invariant that
//     the original suite failed to assert; plus the proportional Infinity /
//     margin>1 fixes and the rate.n=0 clamp) ------------------------------
describe('acceptance contract (no-overlap invariant + review fixes)', () => {
  // Assert every accepted pair of footprints is non-overlapping: for centers
  // pᵢ,pⱼ with radii rᵢ,rⱼ, dist(pᵢ,pⱼ) ≥ rᵢ+rⱼ. This is the load-bearing
  // Wong test-before-place guarantee — the whole point of empty-circle sizing.
  function assertNoOverlap(placements) {
    for (let a = 0; a < placements.length; a++) {
      for (let b = a + 1; b < placements.length; b++) {
        const pa = placements[a];
        const pb = placements[b];
        const dist = Math.hypot(pa.x - pb.x, pa.y - pb.y);
        // small epsilon for float noise; tangency (dist === r1+r2) is allowed.
        expect(dist + 1e-6).toBeGreaterThanOrEqual(pa.radius + pb.radius);
      }
    }
  }

  const boundary = { type: 'rect', width: 200, height: 200 };

  it('proportional sizing never accepts overlapping footprints (graded shrink)', () => {
    // First anchor grows to natural size 50; the second, 70px away, must be
    // capped to 20 so the two are exactly tangent (margin=1) — not overlapping.
    const anchors = [mkAnchor('edge', 100, 100, 'p0'), mkAnchor('edge', 170, 100, 'p1')];
    const { placements } = resolvePlacements(anchors, {
      sizing: { mode: 'proportional', size: 50, min: 0, margin: 1 },
    }, { boundary });
    expect(placements.length).toBe(2);
    expect(placements[0].radius).toBeCloseTo(50, 6);
    expect(placements[1].radius).toBeCloseTo(20, 6); // capped by the empty circle
    assertNoOverlap(placements);
  });

  it('margin > 1 is clamped to 1 — cannot force overlap', () => {
    const anchors = [mkAnchor('edge', 100, 100, 'q0'), mkAnchor('edge', 170, 100, 'q1')];
    const { placements } = resolvePlacements(anchors, {
      sizing: { mode: 'proportional', size: 50, min: 0, margin: 2 }, // abusive margin
    }, { boundary });
    expect(placements.length).toBe(2);
    // Clamped: identical to margin=1, still tangent, still non-overlapping.
    expect(placements[1].radius).toBeCloseTo(20, 6);
    assertNoOverlap(placements);
  });

  it('proportional + null boundary falls back to natural size — no Infinity, no obstacle poisoning', () => {
    const anchors = [mkAnchor('edge', 100, 100, 'z0'), mkAnchor('edge', 300, 100, 'z1')];
    const { placements, rejected } = resolvePlacements(anchors, {
      sizing: { mode: 'proportional', size: 10, min: 0, margin: 1 },
    }, {}); // no boundary → empty-circle radius is Infinity
    expect(rejected).toEqual([]);
    expect(placements.length).toBe(2);
    for (const p of placements) {
      expect(Number.isFinite(p.radius)).toBe(true);
      expect(Number.isFinite(p.scale)).toBe(true);
      expect(p.radius).toBeCloseTo(10, 6); // natural size, not Infinity
    }
  });

  it('rate.n = 0 with a non-zero offset deterministically keeps all (clamped to 1)', () => {
    const anchors = [mkAnchor('edge', 0, 0, 'r0'), mkAnchor('edge', 1, 0, 'r1'), mkAnchor('edge', 2, 0, 'r2')];
    const { survivors } = selectAnchors(anchors, { rate: { n: 0, offset: 3 } });
    expect(survivors.map((a) => a.id)).toEqual(['r0', 'r1', 'r2']);
  });
});

// ========================================================================
// resolvePlacements — SEQUENCER (A4): object-form `config.sequence` deals Slots
// to survivors and folds per-slot modifiers into each placement.
// ========================================================================
describe('resolvePlacements — Sequencer back-compat (no key leaks)', () => {
  it('no sequence: NO glyphRef key on placements (byte-identical shape)', () => {
    const anchors = Array.from({ length: 3 }, (_, i) => mkA(`a${i}`, i * 100, 0));
    const { placements } = resolvePlacements(anchors, { sizing: { mode: 'fixed', size: 1 } });
    for (const p of placements) {
      expect('glyphRef' in p).toBe(false);
    }
  });

  it('legacy string-array sequence stays byte-identical (still no glyphRef key)', () => {
    const anchors = Array.from({ length: 4 }, (_, i) => mkA(`a${i}`, i * 100, 0));
    const cfg = { sequence: ['A', 'B'], flip: true, sizing: { mode: 'fixed', size: 1 } };
    const { placements } = resolvePlacements(anchors, cfg);
    expect(placements.map((p) => p.seqId)).toEqual(['A', 'B', 'A', 'B']);
    for (const p of placements) {
      expect('glyphRef' in p).toBe(false);
    }
  });

  it('an object-form block with empty slots is treated as no sequence', () => {
    const anchors = Array.from({ length: 2 }, (_, i) => mkA(`a${i}`, i * 100, 0));
    const { placements } = resolvePlacements(anchors, {
      sequence: { type: 'sequence', mode: 'cycle', slots: [] },
      sizing: { mode: 'fixed', size: 1 },
    });
    for (const p of placements) expect('glyphRef' in p).toBe(false);
  });
});

describe('resolvePlacements — Sequencer glyphRef + cycle deal', () => {
  it('sequenced placements carry the per-slot glyphRef (cycle x-o-x-o)', () => {
    const anchors = Array.from({ length: 4 }, (_, i) => mkA(`a${i}`, i * 100, 0));
    const { placements } = resolvePlacements(anchors, {
      sequence: {
        type: 'sequence',
        mode: 'cycle',
        slots: [{ glyphRef: 'flower' }, { glyphRef: 'leaf' }],
      },
      sizing: { mode: 'fixed', size: 1 },
    });
    expect(placements.map((p) => p.glyphRef)).toEqual(['flower', 'leaf', 'flower', 'leaf']);
    expect(placements.map((p) => p.seqId)).toEqual([0, 1, 0, 1]); // slot index
  });
});

describe('resolvePlacements — Sequencer Rest reserves no footprint', () => {
  // Three anchors far enough that a glyph at a1 blocks a2, but a rest at a1
  // frees a2. A distant a3 always places and proves the 4-draw jitter stream is
  // preserved across the rest (identical rotation ⇒ stream not shifted).
  const anchors = () => [
    mkA('a0', 0, 0, { normal: 0 }),
    mkA('a1', 6, 0, { normal: 0 }),
    mkA('a2', 9, 0, { normal: 0 }),
    mkA('a3', 100, 0, { normal: 0 }),
  ];
  // rotation-only jitter (position untouched) so acceptance is deterministic but
  // a3.rotation still depends on the RNG stream position.
  const jitter = { seed: 42, rotation: 1, rotationRange: 45, lateral: 0, along: 0, scale: 0 };
  const sizing = { mode: 'fixed', size: 2.5 };

  it('rest at a1 frees space for a2, and a distant a3 stays byte-identical', () => {
    const allGlyph = resolvePlacements(anchors(), {
      sequence: { type: 'sequence', mode: 'cycle', slots: [{ glyphRef: 'g' }] },
      jitter,
      sizing,
    });
    const withRest = resolvePlacements(anchors(), {
      sequence: {
        type: 'sequence',
        mode: 'cycle',
        // pattern A,rest,A,A ⇒ only a1 is a rest.
        slots: [{ glyphRef: 'g' }, { rest: true }, { glyphRef: 'g' }, { glyphRef: 'g' }],
      },
      jitter,
      sizing,
    });

    // a2 is REJECTED when a1 is a glyph (footprint blocks it)...
    expect(byAnchorId(allGlyph.placements, 'a2')).toBeUndefined();
    expect(allGlyph.rejected).toContainEqual({ anchorId: 'a2', reason: 'no-fit' });
    // ...but ACCEPTED when a1 is a rest (rest reserved no footprint).
    expect(byAnchorId(withRest.placements, 'a2')).toBeDefined();
    // The rest is surfaced as a disposition, not silently dropped.
    expect(withRest.rejected).toContainEqual({ anchorId: 'a1', reason: 'rest' });

    // a3 (index 3) draws the SAME jitter block in both runs because the rest at
    // a1 still consumed its 4 draws — proof the stream is rest-independent.
    const a3Glyph = byAnchorId(allGlyph.placements, 'a3');
    const a3Rest = byAnchorId(withRest.placements, 'a3');
    expect(a3Rest.x).toBe(a3Glyph.x);
    expect(a3Rest.y).toBe(a3Glyph.y);
    expect(a3Rest.rotation).toBe(a3Glyph.rotation);
  });
});

describe('resolvePlacements — Sequencer sizeScale drives acceptance packing', () => {
  it('a bigger slot (sizeScale) rejects a neighbor that fit at scale 1', () => {
    const anchors = () => [mkA('a0', 0, 0, { normal: 0 }), mkA('a1', 2.5, 0, { normal: 0 })];
    // scale-1 baseline: both radius 1, distance 2.5 ≥ 2 ⇒ both fit.
    const baseline = resolvePlacements(anchors(), {
      sequence: { type: 'sequence', mode: 'cycle', slots: [{ glyphRef: 'a' }, { glyphRef: 'b' }] },
      sizing: { mode: 'fixed', size: 1 },
    });
    expect(baseline.placements.map((p) => p.anchorId)).toEqual(['a0', 'a1']);

    // a0's slot claims sizeScale 2 ⇒ radius 2; a1 (radius 1) now needs 3 > 2.5 ⇒ no-fit.
    const bigger = resolvePlacements(anchors(), {
      sequence: {
        type: 'sequence',
        mode: 'cycle',
        slots: [{ glyphRef: 'a', sizeScale: 2 }, { glyphRef: 'b' }],
      },
      sizing: { mode: 'fixed', size: 1 },
    });
    expect(byAnchorId(bigger.placements, 'a0').radius).toBe(2);
    expect(bigger.placements.map((p) => p.anchorId)).toEqual(['a0']);
    expect(bigger.rejected).toContainEqual({ anchorId: 'a1', reason: 'no-fit' });
  });
});

describe('resolvePlacements — Sequencer rotationOffset + flip precedence', () => {
  it('rotationOffset is additive on the placement rotation', () => {
    const anchors = [mkA('a0', 0, 0, { normal: 0 })];
    const base = resolvePlacements(anchors, {
      sequence: { type: 'sequence', mode: 'cycle', slots: [{ glyphRef: 'a' }] },
      orientation: { policy: 'page', offset: 10 },
      sizing: { mode: 'fixed', size: 1 },
    });
    const offset = resolvePlacements(anchors, {
      sequence: { type: 'sequence', mode: 'cycle', slots: [{ glyphRef: 'a', rotationOffset: 30 }] },
      orientation: { policy: 'page', offset: 10 },
      sizing: { mode: 'fixed', size: 1 },
    });
    expect(base.placements[0].rotation).toBeCloseTo(10, 9);
    expect(offset.placements[0].rotation).toBeCloseTo(40, 9);
  });

  it('slot flip (when specified) REPLACES the legacy 2-cycle; absent falls back', () => {
    const anchors = Array.from({ length: 3 }, (_, i) => mkA(`a${i}`, i * 100, 0));
    // legacy flip:true ⇒ 2-cycle [false,true,false]. Slot 1 forces flip:true on
    // even index 0; slot 0 leaves it to the 2-cycle (absent ⇒ fall back).
    const { placements } = resolvePlacements(anchors, {
      flip: true,
      sequence: {
        type: 'sequence',
        mode: 'cycle',
        slots: [{ glyphRef: 'a', flip: true }, { glyphRef: 'b' }],
      },
      sizing: { mode: 'fixed', size: 1 },
    });
    // idx0 slot0 flip:true (specified, replaces 2-cycle's false) ⇒ true
    // idx1 slot1 (absent) ⇒ 2-cycle at odd i ⇒ true
    // idx2 slot0 flip:true (specified) ⇒ true
    expect(placements.map((p) => p.flip)).toEqual([true, true, true]);
  });

  it('slot flip:false (specified) overrides the legacy 2-cycle true', () => {
    const anchors = Array.from({ length: 2 }, (_, i) => mkA(`a${i}`, i * 100, 0));
    const { placements } = resolvePlacements(anchors, {
      flip: true, // legacy 2-cycle would be [false, true]
      sequence: {
        type: 'sequence',
        mode: 'cycle',
        // both slots force flip:false ⇒ legacy 2-cycle suppressed entirely.
        slots: [{ glyphRef: 'a', flip: false }, { glyphRef: 'b', flip: false }],
      },
      sizing: { mode: 'fixed', size: 1 },
    });
    expect(placements.map((p) => p.flip)).toEqual([false, false]);
  });
});

describe('resolvePlacements — Sequencer determinism + rotationRandom fold', () => {
  it('sequenced run is byte-identical across two calls', () => {
    const anchors = () => Array.from({ length: 6 }, (_, i) => mkA(`edge:0:${i}`, i * 30, 0, { normal: 0.3 }));
    const cfg = {
      sequence: {
        type: 'sequence',
        mode: 'random',
        seed: 13,
        slots: [
          { glyphRef: 'a', sizeScale: 1.2, rotationRandom: { range: 20, spread: 'bell' } },
          { glyphRef: 'b', weight: 2 },
          { rest: true },
        ],
      },
      jitter: { seed: 5, lateral: 0.5, lateralRange: 4, rotation: 0.5, rotationRange: 15 },
      sizing: { mode: 'fixed', size: 3 },
    };
    const a = resolvePlacements(anchors(), cfg);
    const b = resolvePlacements(anchors(), cfg);
    expect(a.placements).toEqual(b.placements);
    expect(a.rejected).toEqual(b.rejected);
  });

  it('rotationRandom folds into rotation (deterministic, per-anchor stable)', () => {
    const anchors = [mkA('edge:0:7', 0, 0, { normal: 0 })];
    const plain = resolvePlacements(anchors, {
      sequence: { type: 'sequence', mode: 'cycle', seed: 2, slots: [{ glyphRef: 'a' }] },
      orientation: { policy: 'page', offset: 0 },
      sizing: { mode: 'fixed', size: 1 },
    });
    const randomized = resolvePlacements(anchors, {
      sequence: {
        type: 'sequence',
        mode: 'cycle',
        seed: 2,
        slots: [{ glyphRef: 'a', rotationRandom: { range: 40, spread: 'flat' } }],
      },
      orientation: { policy: 'page', offset: 0 },
      sizing: { mode: 'fixed', size: 1 },
    });
    // Base rotation is 0; the randomized run adds a nonzero hash-driven delta.
    expect(plain.placements[0].rotation).toBeCloseTo(0, 9);
    expect(randomized.placements[0].rotation).not.toBeCloseTo(0, 6);
    expect(Math.abs(randomized.placements[0].rotation)).toBeLessThanOrEqual(40);
  });
});
