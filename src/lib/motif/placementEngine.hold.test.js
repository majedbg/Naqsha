import { describe, it, expect } from 'vitest';
import { resolvePlacements } from './placementEngine.js';

// ── `hold` — the per-slot "how much may packing shrink me" weight (#186) ────
//
// The sizing law under test (docs/motif-hold-and-pitch-decisions.md §4b,
// decisions 1–7, 9, 10, 15, 15b):
//
//   naturalTarget = size × scaleFactor × sizeScale
//   neighbourCap  = margin × obstacleTerm            SOFT — `hold` negotiates it
//   hardCap       = min(naturalTarget, margin × boundaryTerm, hostCap)   HARD
//   packedRadius  = min(hardCap, neighbourCap)       === the radius before #186
//   drawnRadius   = min(hardCap, packedRadius + (naturalTarget − packedRadius)·w)
//
// ⚠️ POLARITY (decision 3): `w = 1` is NEVER SHRINK, `w = 0` is today's
// behaviour and the migration default. The original feature request said the
// opposite; it was reversed mid-grill. There is no inversion layer anywhere.

// --- helpers -------------------------------------------------------------
// Anchors on a straight line with tangent/normal 0 so that, with every jitter
// amount at 0, the placement centre is EXACTLY the anchor and all the radii
// below are plain arithmetic rather than measurements.
function at(id, x, y, extra = {}) {
  return {
    id,
    role: 'edge',
    x,
    y,
    tangent: 0,
    normal: 0,
    s: 0,
    meta: { pathIndex: 0 },
    ...extra,
  };
}

const row = (n, x0, gap, y = 200, extra = {}) =>
  Array.from({ length: n }, (_, i) => at(`a${i}`, x0 + i * gap, y, extra));

const NO_JITTER = { seed: 1, lateral: 0, along: 0, rotation: 0, scale: 0 };
const BIG = { type: 'rect', width: 400, height: 400 };

/** A one-slot cycle sequence carrying `hold` (or omitting it when null). */
const holdSeq = (hold) => ({
  type: 'sequence',
  mode: 'cycle',
  seed: 1,
  slots: [hold === null ? { glyphRef: 'g' } : { glyphRef: 'g', hold }],
});

/** A two-slot cycle: slot 0 never held, slot 1 held at `hold`. */
const altHoldSeq = (hold) => ({
  type: 'sequence',
  mode: 'cycle',
  seed: 1,
  slots: [{ glyphRef: 'g' }, { glyphRef: 'g', hold }],
});

const run = (anchors, sizing, sequence, opts = { boundary: BIG }) =>
  resolvePlacements(
    anchors,
    sequence === undefined
      ? { jitter: NO_JITTER, sizing }
      : { jitter: NO_JITTER, sizing, sequence },
    opts,
  );

const byId = (placements, id) => placements.find((p) => p.anchorId === id);

// ---------------------------------------------------------------------------
describe('the migration guarantee — `hold` absent or 0 is today\'s engine', () => {
  // The pre-#186 sizing cascade, measured off the real engine and written into
  // docs/motif-hold-and-pitch-decisions.md §1a BEFORE this feature existed:
  // 4 anchors 25 apart, stock starter-chip sizing. These four numbers are the
  // migration guarantee expressed as data — if any of them moves, an existing
  // document renders differently.
  const STOCK = { mode: 'proportional', size: 18, min: 3, margin: 0.85 };
  const GAP25 = row(4, 100, 25);
  const DOC_1A = [18.0, 5.95, 16.19, 7.49];

  it('reproduces §1a\'s measured cascade with NO sequence at all', () => {
    const { placements } = run(GAP25, STOCK, undefined);
    expect(placements.map((p) => p.radius)).toHaveLength(4);
    placements.forEach((p, i) => expect(p.radius).toBeCloseTo(DOC_1A[i], 2));
  });

  it('a slot that OMITS `hold` produces exactly the same radii', () => {
    const { placements } = run(GAP25, STOCK, holdSeq(null));
    placements.forEach((p, i) => expect(p.radius).toBeCloseTo(DOC_1A[i], 2));
  });

  it('`hold: 0` is byte-identical to omitting the field, placement for placement', () => {
    const absent = run(GAP25, STOCK, holdSeq(null));
    const zero = run(GAP25, STOCK, holdSeq(0));
    expect(zero.placements).toEqual(absent.placements);
    expect(zero.rejected).toEqual(absent.rejected);
  });

  it('at `hold` 0 the drawn radius IS the packed radius IS `radius`', () => {
    for (const seq of [undefined, holdSeq(null), holdSeq(0)]) {
      const { placements } = run(GAP25, STOCK, seq);
      expect(placements.length).toBeGreaterThan(0);
      for (const p of placements) {
        expect(p.drawnRadius).toBe(p.packedRadius);
        expect(p.radius).toBe(p.drawnRadius);
      }
    }
  });

  it('at `hold` 0 nothing is rescued — the rejection list is unchanged', () => {
    // gap 20 is §1b's cliff: half the leaves fall below the floor.
    const cliff = row(8, 100, 20);
    const absent = run(cliff, STOCK, holdSeq(null));
    const zero = run(cliff, STOCK, holdSeq(0));
    const none = run(cliff, STOCK, undefined);
    expect(absent.rejected.some((r) => r.reason === 'below-floor')).toBe(true);
    expect(zero.rejected).toEqual(absent.rejected);
    expect(zero.placements.map((p) => p.radius)).toEqual(none.placements.map((p) => p.radius));
  });
});

describe('`hold` never yields NaN, whatever the document says', () => {
  const STOCK = { mode: 'proportional', size: 18, min: 3, margin: 0.85 };
  const GAP25 = row(4, 100, 25);

  it('an assignment whose slot omits `hold` resolves to 0, not NaN', () => {
    const { placements } = run(GAP25, STOCK, holdSeq(null));
    for (const p of placements) {
      expect(Number.isNaN(p.radius)).toBe(false);
      expect(Number.isNaN(p.drawnRadius)).toBe(false);
      expect(Number.isNaN(p.scale)).toBe(false);
      expect(p.drawnRadius).toBe(p.packedRadius);
    }
  });

  it('a Rest\'s neighbours are unaffected and no Rest ever emits a radius', () => {
    const withRest = {
      type: 'sequence',
      mode: 'cycle',
      seed: 1,
      slots: [{ glyphRef: 'g', hold: 1 }, { rest: true }],
    };
    const { placements, rejected } = run(GAP25, STOCK, withRest);
    expect(rejected.filter((r) => r.reason === 'rest')).toHaveLength(2);
    for (const p of placements) expect(Number.isNaN(p.drawnRadius)).toBe(false);
  });

  it('a hand-edited `hold` outside 0…1 is clamped, never inflated past natural', () => {
    const anchors = row(2, 100, 70);
    const sizing = { mode: 'proportional', size: 50, min: 0, margin: 1 };
    const one = byId(run(anchors, sizing, holdSeq(1)).placements, 'a1');
    for (const bad of [5, 1e9, 1.0000001]) {
      const p = byId(run(anchors, sizing, holdSeq(bad)).placements, 'a1');
      expect(p.drawnRadius).toBe(one.drawnRadius);
    }
    // Anything that is not a usable number reads as ABSENT, i.e. 0 — the same
    // "non-finite ⇒ the channel is off" rule `hostRadius` and the per-glyph
    // override scale already follow.
    const zero = byId(run(anchors, sizing, holdSeq(0)).placements, 'a1');
    for (const bad of [-3, Infinity, -Infinity, NaN, null, 'lots', undefined]) {
      const p = byId(run(anchors, sizing, holdSeq(bad)).placements, 'a1');
      expect(p.drawnRadius).toBe(zero.drawnRadius);
      expect(Number.isNaN(p.drawnRadius)).toBe(false);
    }
  });
});

describe('splitting the two caps must not manufacture a NaN', () => {
  // REGRESSION GUARD for the `capOf` guard in the proportional branch. Before
  // #186 the engine multiplied `margin` by the FUSED `min(boundary, obstacles)`,
  // so the finite term won the min and `0 * Infinity` was never evaluated.
  // Splitting the terms exposes it: `margin: 0` makes the ABSENT side's product
  // NaN, and `Math.min` propagates NaN into the radius. §4b's code sketch has
  // exactly that bug. If someone "simplifies" `capOf` back to `margin * term`,
  // these two cases go NaN — and a NaN radius does not reject (`NaN < min` is
  // false), so it would ship silently.
  const zeroMargin = { mode: 'proportional', size: 18, min: 0, margin: 0 };
  const anchors = [at('a0', 100, 200), at('a1', 180, 200)];

  it('margin 0 with a boundary and NOTHING placed yet is radius 0, not NaN', () => {
    const { placements } = run(anchors, zeroMargin, holdSeq(null));
    expect(placements.map((p) => p.radius)).toEqual([0, 0]);
    expect(placements.map((p) => p.packedRadius)).toEqual([0, 0]);
  });

  it('margin 0 with NO boundary never yields a NaN radius either', () => {
    const { placements } = run(anchors, zeroMargin, holdSeq(null), { boundary: null });
    for (const p of placements) {
      expect(Number.isNaN(p.radius)).toBe(false);
      expect(Number.isNaN(p.packedRadius)).toBe(false);
      expect(Number.isNaN(p.drawnRadius)).toBe(false);
    }
  });
});

describe('the sizing law — a neighbour-capped glyph grows with `hold`', () => {
  // a0 at (100,100) grows to its natural 50. a1, 70 away, is capped by it to
  // 70 − 50 = 20. The boundary is 100 away, so the hard cap is `naturalTarget`.
  const anchors = [at('a0', 100, 100), at('a1', 170, 100)];
  const sizing = { mode: 'proportional', size: 50, min: 0, margin: 1 };
  const a1at = (w) => byId(run(anchors, sizing, holdSeq(w)).placements, 'a1');

  it('is LINEAR IN RADIUS between the packed radius and the natural target', () => {
    expect(a1at(0).drawnRadius).toBeCloseTo(20, 9);
    expect(a1at(0.25).drawnRadius).toBeCloseTo(27.5, 9);
    expect(a1at(0.5).drawnRadius).toBeCloseTo(35, 9);
    expect(a1at(0.75).drawnRadius).toBeCloseTo(42.5, 9);
    expect(a1at(1).drawnRadius).toBeCloseTo(50, 9);
  });

  it('`radius` and `scale` are computed from the DRAWN radius', () => {
    const p = a1at(0.5);
    expect(p.radius).toBe(p.drawnRadius);
    expect(p.scale).toBe(p.drawnRadius / 50);
  });

  it('the PACKED radius never moves, at any `hold`', () => {
    for (const w of [0, 0.25, 0.5, 0.75, 1]) expect(a1at(w).packedRadius).toBeCloseTo(20, 9);
  });

  it('`placed` never receives the drawn radius — a third glyph sizes around 20', () => {
    // a2 sits 70 beyond a1. If a1 had RESERVED its drawn 50 rather than its
    // packed 20, a2's clearance would collapse from 50 to 20.
    const three = [at('a0', 100, 100), at('a1', 170, 100), at('a2', 240, 100)];
    const held = byId(run(three, sizing, holdSeq(1)).placements, 'a2');
    const free = byId(run(three, sizing, holdSeq(0)).placements, 'a2');
    expect(held.packedRadius).toBe(free.packedRadius);
    expect(held.packedRadius).toBeCloseTo(50, 9); // 70 − 20, clipped at natural
  });

  it('drawnRadius >= packedRadius and <= hardCap at every weight', () => {
    for (const w of [0, 0.1, 0.33, 0.5, 0.9, 1]) {
      const p = a1at(w);
      expect(p.drawnRadius).toBeGreaterThanOrEqual(p.packedRadius);
      expect(p.drawnRadius).toBeLessThanOrEqual(p.hardCap);
    }
  });

  it('`sizeScale` is INSIDE naturalTarget, so Scale and `hold` compose', () => {
    // Scale 1.5 on a1 ⇒ its naturalTarget is 75. Its packed radius is still the
    // 20 the neighbour allows (sizeScale grows only the natural target), so
    // hold 1 must reach 75, not 50.
    const scaled = {
      type: 'sequence',
      mode: 'cycle',
      seed: 1,
      slots: [{ glyphRef: 'g' }, { glyphRef: 'g', sizeScale: 1.5, hold: 1 }],
    };
    const p = byId(run(anchors, sizing, scaled).placements, 'a1');
    expect(p.packedRadius).toBeCloseTo(20, 9);
    expect(p.drawnRadius).toBeCloseTo(75, 9);
    expect(p.capBy).toBe('natural');
  });
});

describe('the hard tier — `hold` can never cross it', () => {
  const sizing = { mode: 'proportional', size: 50, min: 0, margin: 1 };

  it('a BOUNDARY-capped glyph does not grow at any `hold`', () => {
    // y = 30 in a 400×400 rect ⇒ boundary term 30 < naturalTarget 50.
    const anchors = [at('b0', 100, 30)];
    for (const w of [0, 0.5, 1]) {
      const p = byId(run(anchors, sizing, holdSeq(w)).placements, 'b0');
      expect(p.drawnRadius).toBeCloseTo(30, 9);
      expect(p.hardCap).toBeCloseTo(30, 9);
      expect(p.capBy).toBe('boundary');
    }
  });

  it('a hostRadius-capped glyph does not grow at any `hold`', () => {
    const anchors = [at('h0', 200, 200, { hostRadius: 10 })];
    for (const w of [0, 0.5, 1]) {
      const p = byId(run(anchors, sizing, holdSeq(w)).placements, 'h0');
      expect(p.drawnRadius).toBeCloseTo(10, 9);
      expect(p.hardCap).toBeCloseTo(10, 9);
      expect(p.capBy).toBe('host');
    }
  });

  it('containment survives the whole weight range on a crowded host', () => {
    const anchors = row(6, 60, 60, 150).map((a, i) => ({ ...a, hostRadius: 6 + i * 5 }));
    for (const w of [0, 0.25, 0.5, 0.75, 1]) {
      for (const p of run(anchors, sizing, holdSeq(w)).placements) {
        expect(p.drawnRadius).toBeLessThanOrEqual(p.hardCap);
      }
    }
  });
});

describe('saturation (decision 2b) — the drag stops at the hard cap', () => {
  // neighbourCap 20 < hardCap 30 < naturalTarget 50.
  //   s0 at (100,30): boundary term 30 ⇒ radius 30.
  //   s1 at (150,30): clearance 50 − 30 = 20; its own boundary term is 30.
  const anchors = [at('s0', 100, 30), at('s1', 150, 30)];
  const sizing = { mode: 'proportional', size: 50, min: 0, margin: 1 };
  const s1at = (w) => byId(run(anchors, sizing, altHoldSeq(w)).placements, 's1');

  it('is set up as decision 2b describes: neighbourCap < hardCap < naturalTarget', () => {
    const p = s1at(0);
    expect(p.neighbourCap).toBeCloseTo(20, 9);
    expect(p.hardCap).toBeCloseTo(30, 9);
    expect(p.packedRadius).toBeCloseTo(20, 9);
  });

  it('is strictly increasing until the hard cap, then exactly constant', () => {
    const rising = [0, 0.1, 0.2, 0.3].map((w) => s1at(w).drawnRadius);
    expect(rising).toEqual([...rising].sort((a, b) => a - b));
    expect(new Set(rising).size).toBe(4);
    expect(rising[3]).toBeCloseTo(29, 9);
    for (const w of [0.4, 0.6, 0.8, 1]) expect(s1at(w).drawnRadius).toBeCloseTo(30, 9);
  });

  it('at `hold` 1 it equals the HARD CAP, not the natural target', () => {
    const p = s1at(1);
    expect(p.drawnRadius).toBe(p.hardCap);
    expect(p.drawnRadius).not.toBeCloseTo(50, 9);
  });

  it('`saturated` is true exactly when the lerp overshot the hard cap', () => {
    expect(s1at(0).saturated).toBe(false);
    expect(s1at(0.3).saturated).toBe(false); // 29 < 30
    expect(s1at(0.5).saturated).toBe(true); // 35 > 30
    expect(s1at(1).saturated).toBe(true);
  });

  it('`capBy` names the HARD constraint that stopped the drag, not the neighbour', () => {
    expect(s1at(0).capBy).toBe('neighbour');
    expect(s1at(0.3).capBy).toBe('neighbour');
    expect(s1at(0.5).capBy).toBe('boundary');
    expect(s1at(1).capBy).toBe('boundary');
  });
});

describe('the diagnostic record', () => {
  const sizing = { mode: 'proportional', size: 50, min: 0, margin: 1 };

  it('every placement carries all seven keys, sequenced or not', () => {
    const seven = ['capBy', 'capObstacle', 'drawnRadius', 'hardCap', 'neighbourCap', 'packedRadius', 'saturated'];
    for (const seq of [undefined, holdSeq(null), holdSeq(0.5)]) {
      for (const mode of ['proportional', 'fixed']) {
        const { placements } = run(row(3, 100, 70), { ...sizing, mode }, seq);
        expect(placements.length).toBeGreaterThan(0);
        for (const p of placements) for (const k of seven) expect(k in p).toBe(true);
      }
    }
  });

  it('`capBy` is `natural` when the glyph got the size it asked for', () => {
    const p = byId(run([at('n0', 200, 200)], sizing, holdSeq(0)).placements, 'n0');
    expect(p.capBy).toBe('natural');
    expect(p.drawnRadius).toBeCloseTo(50, 9);
    expect(p.capObstacle).toBe(null);
    expect(p.saturated).toBe(false);
  });

  it('`capObstacle` is populated for a neighbour cap and null otherwise', () => {
    const anchors = [at('c0', 100, 100), at('c1', 170, 100)];
    const { placements } = run(anchors, sizing, holdSeq(0));
    expect(byId(placements, 'c0').capObstacle).toBe(null);
    const capped = byId(placements, 'c1');
    expect(capped.capBy).toBe('neighbour');
    expect(capped.capObstacle).toEqual({ x: 100, y: 100, r: 50 });
  });

  it('`capObstacle` reports the RESERVED disc, not the drawn one', () => {
    // c1 is neighbour-capped to 20 and held to 50; c2 must then be capped by
    // the 20 c1 reserved, not by the 50 it drew.
    const anchors = [at('c0', 100, 100), at('c1', 170, 100), at('c2', 210, 100)];
    const held = run(anchors, sizing, altHoldSeq(1)).placements;
    const c1 = byId(held, 'c1');
    const c2 = byId(held, 'c2');
    expect(c1.drawnRadius).not.toBe(c1.packedRadius); // c1 really did grow
    expect(c2.capObstacle.r).toBe(c1.packedRadius);
    expect(c2.capObstacle.r).not.toBe(c1.drawnRadius);
  });

  it('`capObstacle` is a COPY — never a shared reference into the packer', () => {
    // Two glyphs capped by the SAME neighbour must not share one object.
    const anchors = [at('c0', 200, 200), at('c1', 200, 270), at('c2', 130, 200)];
    const { placements } = run(anchors, sizing, holdSeq(0));
    const capped = placements.filter((p) => p.capBy === 'neighbour');
    expect(capped.length).toBeGreaterThanOrEqual(2);
    for (const p of capped) expect(Object.keys(p.capObstacle).sort()).toEqual(['r', 'x', 'y']);
    expect(capped[0].capObstacle).not.toBe(capped[1].capObstacle);
  });

  it('`fixed` mode reports itself honestly inert', () => {
    const { placements } = run(row(2, 100, 200), { mode: 'fixed', size: 12, min: 0, margin: 1 }, holdSeq(1));
    for (const p of placements) {
      expect(p.radius).toBe(12);
      expect(p.packedRadius).toBe(12);
      expect(p.drawnRadius).toBe(12);
      expect(p.hardCap).toBe(12);
      expect(p.neighbourCap).toBe(Infinity);
      expect(p.capBy).toBe('natural');
      expect(p.saturated).toBe(false);
      expect(p.capObstacle).toBe(null);
    }
  });

  it('`fixed` mode is unaffected by `hold`', () => {
    const fixed = { mode: 'fixed', size: 12, min: 0, margin: 1 };
    const a = run(row(4, 100, 40), fixed, holdSeq(0));
    const b = run(row(4, 100, 40), fixed, holdSeq(1));
    expect(b.placements).toEqual(a.placements);
    expect(b.rejected).toEqual(a.rejected);
  });
});

describe('rejection — what `hold` may and may not rescue', () => {
  const STOCK = { mode: 'proportional', size: 18, min: 3, margin: 0.85 };

  it('rescues a below-floor glyph, and the rescued glyph commits its PACKED disc', () => {
    // §5, gap 20: leaf 1 reserves 0.85 × (20 − 18) = 1.70, below the floor of 3.
    const anchors = row(4, 100, 20);
    const free = run(anchors, STOCK, altHoldSeq(0));
    expect(free.rejected.map((r) => r.reason)).toContain('below-floor');

    const held = run(anchors, STOCK, altHoldSeq(1));
    const leaf1 = byId(held.placements, 'a1');
    expect(leaf1).toBeDefined();
    expect(leaf1.packedRadius).toBeCloseTo(1.7, 2); // the doc's 1.70
    expect(leaf1.drawnRadius).toBeCloseTo(18, 9); // rescued to natural
  });

  it('pins §5\'s non-local consequence: the rescue RESIZES the glyph after it', () => {
    const anchors = row(4, 100, 20);
    const free = byId(run(anchors, STOCK, altHoldSeq(0)).placements, 'a2');
    const held = byId(run(anchors, STOCK, altHoldSeq(1)).placements, 'a2');
    expect(free.drawnRadius).toBeCloseTo(18.0, 2); // §5: "instead of 18.00"
    expect(held.drawnRadius).toBeCloseTo(15.55, 2); // §5: "draws at 15.55"
    // …and it is the rescued disc, not the drawn one, that did the resizing.
    expect(held.capObstacle.r).toBeCloseTo(1.7, 2);
  });

  it('`no-fit` stays a hard drop at every value of `hold`', () => {
    // a1's centre sits INSIDE a0's committed disc ⇒ R <= 0.
    const anchors = [at('a0', 100, 200), at('a1', 105, 200)];
    for (const w of [0, 0.5, 1]) {
      const { placements, rejected } = run(anchors, STOCK, holdSeq(w));
      expect(placements.map((p) => p.anchorId)).toEqual(['a0']);
      expect(rejected).toEqual([{ anchorId: 'a1', reason: 'no-fit' }]);
    }
  });

  it('a centre displaced clean out of its host is `no-fit`, not rescued', () => {
    // hostRadius far smaller than the lateral jitter ⇒ hostCap <= 0, which is
    // decided BEFORE any drawn radius exists.
    const anchors = [at('h0', 200, 200, { hostRadius: 1e-6 })];
    const jitter = { seed: 3, lateral: 1, lateralRange: 40, along: 0, rotation: 0, scale: 0 };
    for (const w of [0, 1]) {
      const { placements, rejected } = resolvePlacements(
        anchors,
        { jitter, sizing: { mode: 'proportional', size: 50, min: 0, margin: 1 }, sequence: holdSeq(w) },
        { boundary: BIG },
      );
      expect(placements).toEqual([]);
      expect(rejected).toEqual([{ anchorId: 'h0', reason: 'no-fit' }]);
    }
  });
});

describe('determinism — `hold` draws no RNG', () => {
  const STOCK = { mode: 'proportional', size: 18, min: 3, margin: 0.85 };
  const anchors = row(6, 100, 20);
  const jitter = {
    seed: 11,
    lateral: 1, lateralRange: 4, along: 1, alongRange: 3,
    rotation: 1, rotationRange: 25, scale: 1, scaleRange: 0.2,
  };
  const go = (w) =>
    resolvePlacements(anchors, { jitter, sizing: STOCK, sequence: holdSeq(w) }, { boundary: BIG });

  it('changing `hold` never reshuffles another survivor\'s jitter draws', () => {
    const free = go(0);
    const held = go(1);
    // `hold` changes WHICH anchors survive here (it rescues some), so compare
    // the jitter-derived quantities on the anchors present in both runs. All
    // four draws are covered: lateral+along land in x/y, rotation in rotation,
    // and scale in `hardCap` — which, well clear of the boundary, IS
    // `size × scaleFactor` and depends on no obstacle.
    let compared = 0;
    for (const p of free.placements) {
      const q = byId(held.placements, p.anchorId);
      if (!q) continue;
      compared += 1;
      expect(q.x).toBe(p.x);
      expect(q.y).toBe(p.y);
      expect(q.rotation).toBe(p.rotation);
      expect(q.hardCap).toBe(p.hardCap);
    }
    expect(compared).toBeGreaterThan(0);
    expect(held.placements.length).toBeGreaterThanOrEqual(free.placements.length);
  });

  it('is byte-identical run to run at any weight', () => {
    for (const w of [0, 0.37, 1]) {
      expect(go(w).placements).toEqual(go(w).placements);
      expect(go(w).rejected).toEqual(go(w).rejected);
    }
  });
});
