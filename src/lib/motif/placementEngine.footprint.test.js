// THE TIGHT FOOTPRINT LAW (#204, PRD #197) — the packer reserves the glyph's
// minimal enclosing circle, carried into the world, instead of the anchor-centred
// disc `(P, R)`.
//
//     reserve centre  P + R·f̂c    f̂c = Rot(θ)·footprintCenter / viewRadius
//     reserve radius  R·f̂r        f̂r = footprintRadius / viewRadius
//
// ⚠️ UNITS (ruling 7c). `footprintSolve` is homogeneous: hand it glyph-local
// `fc`/`fr` and its root is `s = R/viewRadius`; hand it `fc/viewRadius` and
// `fr/viewRadius` and its root is `R` directly. BOTH compute cleanly and one is
// wrong by a factor of `viewRadius`. The engine normalises AT THE GLYPH, so every
// limit comes back in `R` alongside `naturalTarget`, `hardCap`, `neighbourCap`,
// `min` and `packedRadius`. These tests assert against `R`.
//
// ⚠️ `margin` is SOLVE-THEN-SCALE (decision 6d), never inflate-then-solve. The
// two are pinned apart numerically below — they are different numbers, and the
// wrong one silently falsifies the tangency property the overlay's captor link
// draws (decision 6c).
//
// ⚠️ `placed` receives the OFFSET disc (ruling 6e), not the anchor-centred one.
// Keeping obstacles anchor-centred would size tight discs against root-centred
// ones — the mixed model decision 5b rejects — and would make the whole fix inert
// while every existing test still passed.

import { describe, it, expect } from 'vitest';
import { resolvePlacements } from './placementEngine.js';
import { neighbourLimit, hostLimit } from './footprintSolve.js';
import { MOTIF_GLYPHS } from './glyphs.js';
import { minEnclosingCircle } from './minEnclosingCircle.js';
import { placementMatrix, applyMatrix } from './instancing.js';
import { flattenPathD } from '../plotter/pathOps.js';

const LEAF = MOTIF_GLYPHS.leaf;
const DOT = MOTIF_GLYPHS.dot;

// f̂c / f̂r for the leaf, the glyph §1a measured: root disc / tight circle = 4.00
// exactly, because the root sits ON its own minimal enclosing circle with the
// farthest point antipodal.
const LEAF_FCX = LEAF.footprintCenter.x / LEAF.viewRadius;
const LEAF_FCY = LEAF.footprintCenter.y / LEAF.viewRadius;
const LEAF_FR = LEAF.footprintRadius / LEAF.viewRadius;

const BOUNDARY = { type: 'rect', width: 1000, height: 1000 };

/** Anchor with a PINNED orientation: `policy:'page'` makes rotation 0 + offset. */
function anchor(id, x, y, extra = {}) {
  return { id, role: 'edge', x, y, tangent: 0, normal: Math.PI / 2, s: 0, meta: {}, ...extra };
}

/** Rotation pinned to `offset` degrees; no jitter anywhere. */
const PAGE = { policy: 'page', useNormal: false, offset: 0, perRole: {} };

function place(anchors, sizing, opts = {}) {
  return resolvePlacements(
    anchors,
    { orientation: PAGE, sizing },
    { boundary: BOUNDARY, glyph: LEAF, ...opts }
  );
}

const PROP = { mode: 'proportional', size: 20, min: 0, margin: 0.85 };

describe("the 'root' arm is byte-identical", () => {
  // The headline acceptance criterion. Not "the same to within a tolerance" —
  // the same bits. JSON.stringify emits shortest-round-trip doubles, so a string
  // comparison of two dumps IS a bit comparison.
  const configs = [
    ['plain proportional', [anchor('a', 200, 500), anchor('b', 225, 500), anchor('c', 260, 512)], PROP],
    ['margin 0', [anchor('a', 40, 40), anchor('b', 70, 44)], { ...PROP, margin: 0 }],
    ['margin 1', [anchor('a', 300, 300), anchor('b', 322, 300)], { ...PROP, margin: 1 }],
    ['floor bites', [anchor('a', 100, 100), anchor('b', 118, 100), anchor('c', 132, 100)], { ...PROP, min: 6 }],
    ['host cell', [anchor('a', 200, 200, { hostRadius: 9 }), anchor('b', 260, 200, { hostRadius: 40 })], PROP],
    ['fixed', [anchor('a', 200, 500), anchor('b', 214, 500)], { mode: 'fixed', size: 14, min: 3, margin: 0.85 }],
  ];

  it.each(configs)('%s — absent, "root" and an unknown value all agree bit for bit', (_name, anchors, sizing) => {
    const dump = (footprint) =>
      JSON.stringify(place(anchors, footprint === undefined ? sizing : { ...sizing, footprint }));
    const absent = dump(undefined);
    expect(dump('root')).toBe(absent);
    // Only the exact string 'tight' opts in.
    expect(dump('bogus')).toBe(absent);
    expect(dump('Tight')).toBe(absent);
  });

  it('the legacy arm needs no glyph at all — the tight arm is the only reader', () => {
    const anchors = [anchor('a', 200, 500), anchor('b', 225, 500)];
    const withGlyph = JSON.stringify(place(anchors, { ...PROP, footprint: 'root' }));
    const without = JSON.stringify(
      resolvePlacements(anchors, { orientation: PAGE, sizing: { ...PROP, footprint: 'root' } }, { boundary: BOUNDARY })
    );
    expect(without).toBe(withGlyph);
  });

  it("under 'root' the world footprint centre IS the placement centre, in both sizing modes", () => {
    const anchors = [anchor('a', 200, 500), anchor('b', 225, 500)];
    for (const sizing of [PROP, { mode: 'fixed', size: 14, min: 0, margin: 0.85 }]) {
      const { placements } = place(anchors, sizing);
      expect(placements.length).toBeGreaterThan(0);
      for (const p of placements) {
        expect(p.footprintCenter).toEqual({ x: p.x, y: p.y });
      }
    }
  });

  it('the RNG stream is untouched — x, y, rotation and flip are identical under both laws', () => {
    const anchors = [anchor('a', 200, 500), anchor('b', 240, 500), anchor('c', 280, 505), anchor('d', 320, 495)];
    const cfg = (footprint) => ({
      orientation: { policy: 'path', useNormal: true, offset: 10, perRole: {} },
      flip: true,
      jitter: {
        seed: 9, lateral: 1, along: 1, rotation: 1, scale: 1,
        lateralRange: 4, alongRange: 3, rotationRange: 25, scaleRange: 0.3,
      },
      sizing: { ...PROP, footprint },
    });
    const run = (footprint) =>
      resolvePlacements(anchors, cfg(footprint), { boundary: BOUNDARY, glyph: LEAF });
    const root = run('root');
    const tight = run('tight');
    expect(tight.placements.map((p) => [p.x, p.y, p.rotation, p.flip, p.seqId])).toEqual(
      root.placements.map((p) => [p.x, p.y, p.rotation, p.flip, p.seqId])
    );
  });
});

describe('the tight law makes glyphs bigger — §1a, leaf, anchors 25 apart', () => {
  // The leaf leans +x at rotation 0. The SECOND anchor sits to the LEFT of the
  // first, so its reserve leans TOWARD the committed one — the pessimistic
  // direction, and still the tight law wins by a wide margin.
  const anchors = [anchor('a', 400, 500), anchor('b', 375, 500)];

  it('the neighbour-capped glyph gets dramatically bigger, and the root arm is not vacuous', () => {
    const root = place(anchors, { ...PROP, footprint: 'root' }).placements;
    const tight = place(anchors, { ...PROP, footprint: 'tight' }).placements;

    expect(root).toHaveLength(2);
    expect(tight).toHaveLength(2);
    // Non-vacuity: the root arm really is neighbour-capped, well below natural.
    expect(root[1].capBy).toBe('neighbour');
    expect(root[1].radius).toBeLessThan(PROP.size);
    expect(root[1].radius).toBeCloseTo(0.85 * (25 - 20), 12);
    // The fix: the same glyph, the same spacing, the same rotation.
    expect(tight[1].radius).toBeGreaterThan(root[1].radius);
    expect(tight[1].radius / root[1].radius).toBeGreaterThan(3);
    // The first glyph was never neighbour-capped, so it must not move at all.
    expect(tight[0].radius).toBe(root[0].radius);
  });

  it('at a spacing where the neighbour binds under BOTH laws, tight is still larger', () => {
    const near = [anchor('a', 400, 500), anchor('b', 378, 500)];
    const root = place(near, { ...PROP, footprint: 'root' }).placements;
    const tight = place(near, { ...PROP, footprint: 'tight' }).placements;
    expect(root[1].capBy).toBe('neighbour');
    expect(tight[1].capBy).toBe('neighbour');
    expect(tight[1].radius).toBeGreaterThan(root[1].radius);
  });

  it('a glyph whose tight disc IS its root disc is unmoved by the law (dot: fc = 0, fr = viewRadius)', () => {
    // `dot` measures fc = (0,0), fr = viewRadius — a coincidence of the shape,
    // not a default. The two laws are then algebraically the same, so the
    // radii agree to floating-point noise (NOT bit-for-bit: decision 7b).
    const root = place(anchors, { ...PROP, footprint: 'root' }, { glyph: DOT }).placements;
    const tight = place(anchors, { ...PROP, footprint: 'tight' }, { glyph: DOT }).placements;
    expect(tight[1].radius).toBeCloseTo(root[1].radius, 10);
    expect(tight[1].capBy).toBe(root[1].capBy);
  });
});

describe('`placed` receives the OFFSET disc (ruling 6e)', () => {
  it("the committed obstacle is the tight disc, not the anchor-centred one", () => {
    const anchors = [anchor('a', 400, 500), anchor('b', 378, 500)];
    const { placements } = place(anchors, { ...PROP, footprint: 'tight' });
    const first = placements[0];
    // The disc the packer committed for the first glyph.
    const c = {
      x: first.x + first.packedRadius * LEAF_FCX,
      y: first.y + first.packedRadius * LEAF_FCY,
    };
    const rj = first.packedRadius * LEAF_FR;
    // Solve the SECOND glyph's neighbour cap by hand against that disc and
    // against the anchor-centred one; the engine must ship the former.
    const second = placements[1];
    const a = { x: second.x - c.x, y: second.y - c.y };
    const u = { x: LEAF_FCX, y: LEAF_FCY };
    const offsetCap = 0.85 * neighbourLimit(a, u, LEAF_FR, rj);
    const rootCentred =
      0.85 *
      neighbourLimit(
        { x: second.x - first.x, y: second.y - first.y },
        u,
        LEAF_FR,
        first.packedRadius
      );
    expect(offsetCap).not.toBeCloseTo(rootCentred, 6);
    expect(second.neighbourCap).toBeCloseTo(offsetCap, 12);
  });

  it('the emitted `footprintCenter` IS the committed disc centre (stated at packedRadius)', () => {
    const anchors = [anchor('a', 400, 500), anchor('b', 378, 500)];
    const { placements } = place(anchors, { ...PROP, footprint: 'tight' });
    for (const p of placements) {
      expect(p.footprintCenter.x).toBeCloseTo(p.x + p.packedRadius * LEAF_FCX, 12);
      expect(p.footprintCenter.y).toBeCloseTo(p.y + p.packedRadius * LEAF_FCY, 12);
      // …and it is genuinely off the anchor for a glyph that leans.
      expect(p.footprintCenter.x).not.toBe(p.x);
    }
  });

  it('the reserve turns with the glyph (decision 1) — rotation moves the footprint centre', () => {
    const anchors = [anchor('a', 400, 500)];
    const at = (deg) =>
      resolvePlacements(
        anchors,
        { orientation: { ...PAGE, offset: deg }, sizing: { ...PROP, footprint: 'tight' } },
        { boundary: BOUNDARY, glyph: LEAF }
      ).placements[0];
    const p0 = at(0);
    const p90 = at(90);
    const R = p0.packedRadius;
    expect(p0.footprintCenter.x - p0.x).toBeCloseTo(R * LEAF_FCX, 12);
    // Rot(90°) in the SVG convention (y down): (x,y) → (−y, x).
    expect(p90.footprintCenter.x - p90.x).toBeCloseTo(-R * LEAF_FCY, 12);
    expect(p90.footprintCenter.y - p90.y).toBeCloseTo(R * LEAF_FCX, 12);
  });

  it('`flip` mirrors the reserve, because the renderer mirrors the art', () => {
    // `placementMatrix` folds flip into `sx` (instancing.js:78), so a flipped
    // glyph's ink sits at Rot(θ)·(−fc.x, fc.y). Reserving the UNMIRRORED disc
    // would put the art outside the space the packer cleared for it — and
    // containment is inviolable (#146, PRD story 8).
    const anchors = [anchor('a', 400, 500), anchor('b', 440, 500)];
    const { placements } = resolvePlacements(
      anchors,
      { orientation: PAGE, flip: true, sizing: { ...PROP, footprint: 'tight' } },
      { boundary: BOUNDARY, glyph: LEAF }
    );
    // flip is the legacy 2-cycle: false on i=0, true on i=1.
    expect(placements[0].flip).toBe(false);
    expect(placements[1].flip).toBe(true);
    expect(placements[0].footprintCenter.x - placements[0].x).toBeCloseTo(
      placements[0].packedRadius * LEAF_FCX,
      12
    );
    expect(placements[1].footprintCenter.x - placements[1].x).toBeCloseTo(
      -placements[1].packedRadius * LEAF_FCX,
      12
    );
  });
});

describe('`margin` is SOLVE-THEN-SCALE (decision 6d)', () => {
  it('the two applications are numerically different, and the engine ships solve-then-scale', () => {
    const anchors = [anchor('a', 400, 500), anchor('b', 378, 500)];
    const margin = 0.85;
    const { placements } = place(anchors, { ...PROP, margin, footprint: 'tight' });
    const first = placements[0];
    const second = placements[1];
    const c = {
      x: first.x + first.packedRadius * LEAF_FCX,
      y: first.y + first.packedRadius * LEAF_FCY,
    };
    const rj = first.packedRadius * LEAF_FR;
    const a = { x: second.x - c.x, y: second.y - c.y };
    const u = { x: LEAF_FCX, y: LEAF_FCY };

    const solveThenScale = margin * neighbourLimit(a, u, LEAF_FR, rj);
    const inflateThenSolve = neighbourLimit(a, u, LEAF_FR / margin, rj);
    // They are DIFFERENT NUMBERS — an inflated reserve also sits further out.
    expect(Math.abs(solveThenScale - inflateThenSolve)).toBeGreaterThan(1e-6);
    expect(second.neighbourCap).toBeCloseTo(solveThenScale, 12);
    expect(second.neighbourCap).not.toBeCloseTo(inflateThenSolve, 6);
  });

  it('at margin 1 the reserve is EXACTLY tangent to the captor (decision 6c)', () => {
    const anchors = [anchor('a', 400, 500), anchor('b', 382, 500)];
    const { placements } = place(anchors, { ...PROP, margin: 1, footprint: 'tight' });
    const second = placements[1];
    // The tangency claim is vacuous unless the captor actually bound the radius.
    expect(second.capBy).toBe('neighbour');
    expect(second.capObstacle).not.toBeNull();
    const R = second.packedRadius;
    const centre = { x: second.footprintCenter.x, y: second.footprintCenter.y };
    const captor = second.capObstacle;
    const d = Math.hypot(centre.x - captor.x, centre.y - captor.y);
    // Distance between centres === sum of radii, which IS external tangency.
    expect(d).toBeCloseTo(R * LEAF_FR + captor.r, 9);
  });
});

describe("`capBy`'s winner is the smallest max-R, not the nearest disc (decision 6b)", () => {
  it('the captor is the disc that binds hardest, even when a nearer one exists', () => {
    // Two committed leaves, both leaning +x at rotation 0:
    //   • `near`  sits close but BEHIND the probe's lean direction — its reserve
    //             and the probe's grow apart, so it never binds at all
    //   • `far`   sits further away but IN it, and binds hard
    // Under `d − r` the nearer wins; under the offset law the further one does.
    const anchors = [
      anchor('near', 335, 500),
      anchor('far', 380, 500),
      anchor('probe', 360, 500),
    ];
    const { placements } = place(anchors, { ...PROP, footprint: 'tight' });
    expect(placements).toHaveLength(3);
    const probe = placements[2];
    expect(probe.capBy).toBe('neighbour');
    expect(probe.capObstacle).not.toBeNull();

    const discOf = (p) => ({
      x: p.x + p.packedRadius * LEAF_FCX,
      y: p.y + p.packedRadius * LEAF_FCY,
      r: p.packedRadius * LEAF_FR,
    });
    const near = discOf(placements[0]);
    const far = discOf(placements[1]);
    const u = { x: LEAF_FCX, y: LEAF_FCY };
    const limOf = (o) => neighbourLimit({ x: probe.x - o.x, y: probe.y - o.y }, u, LEAF_FR, o.r);
    const dMinusR = (o) => Math.hypot(probe.x - o.x, probe.y - o.y) - o.r;

    // The two orderings DISAGREE on this configuration — that is the point.
    expect(dMinusR(near)).toBeLessThan(dMinusR(far));
    expect(limOf(far)).toBeLessThan(limOf(near));
    // …and the engine records the smallest-max-R winner.
    expect(probe.capObstacle.x).toBeCloseTo(far.x, 12);
    expect(probe.capObstacle.y).toBeCloseTo(far.y, 12);
    expect(probe.capObstacle.r).toBeCloseTo(far.r, 12);
    expect(probe.neighbourCap).toBeCloseTo(0.85 * limOf(far), 12);
  });

  it('`capObstacle` is a COPY, never a reference into the packer obstacle list', () => {
    const anchors = [anchor('a', 400, 500), anchor('b', 378, 500)];
    const { placements } = place(anchors, { ...PROP, footprint: 'tight' });
    const captor = placements[1].capObstacle;
    expect(captor).not.toBeNull();
    expect(Object.keys(captor).sort()).toEqual(['r', 'x', 'y']);
  });
});

// ⚠️ SUPERSEDED IN PART BY 5-rev. These cases all use `leaf`, whose reach
// |f̂c| + f̂r is 0.9963 — the ONE glyph in the library below 1 — so its tight
// bound wins the max even at an undisplaced centre and every expectation below
// still reads the same under 5-rev. They no longer establish that the tier is
// tight-only; the `max(R_root, R_tight)` describe further down does that, on
// `slice100`, the glyph that reaches furthest.
describe('the HARD tier binds against the tight disc where the tight disc is tighter', () => {
  it('a glyph on a CENTRED cell anchor gains almost nothing — and that is structural', () => {
    // ⚠️ A FINDING, and the measurement that overturned decision 5. At an
    // UNDISPLACED centre no glyph in the library gains more than 1.004×, and the
    // reason is the same construction §1 rests on: `viewRadius` is measured from
    // the root to the farthest point, and the root sits ON the minimal enclosing
    // circle, so |f̂c| + f̂r ≈ 1 for all 62 — and ≥ 1 for 61 of them. Containment
    // about the anchor is `R(|f̂c| + f̂r) ≤ H`, i.e. ≈ `R ≤ H`, which is the root
    // law's answer, and WORSE than it whenever the reach exceeds 1. The 2× is
    // real but needs a DISPLACED centre (the next test) or a lean that points
    // back into the cell.
    const anchors = [anchor('a', 500, 500, { hostRadius: 12 })];
    const root = place(anchors, { ...PROP, margin: 1, footprint: 'root' }).placements[0];
    const tight = place(anchors, { ...PROP, margin: 1, footprint: 'tight' }).placements[0];
    expect(root.capBy).toBe('host');
    expect(tight.capBy).toBe('host');
    expect(tight.radius).toBeGreaterThan(root.radius);
    expect(tight.radius / root.radius).toBeLessThan(1.01);
    // CONTAINMENT IS INVIOLABLE: the tight disc lies inside the cell.
    const dx = tight.footprintCenter.x - 500;
    const dy = tight.footprintCenter.y - 500;
    expect(Math.hypot(dx, dy) + tight.packedRadius * LEAF_FR).toBeLessThanOrEqual(12 + 1e-9);
  });

  it('a DISPLACED centre leaning back into its cell gets the 2× decision 5 promises', () => {
    // Jitter has pushed the centre 5.86 off the anchor and the glyph leans back
    // across the cell, so the root law reserves a disc that is nearly all empty
    // on the far side. This is where the containment restatement pays.
    const anchors = [anchor('a', 500, 500, { hostRadius: 12 })];
    const jitter = {
      seed: 7, lateral: 1, along: 0, rotation: 0, scale: 0,
      lateralRange: 6, alongRange: 0, rotationRange: 0, scaleRange: 0,
    };
    const run = (footprint) =>
      resolvePlacements(
        anchors,
        { orientation: { ...PAGE, offset: 90 }, jitter, sizing: { ...PROP, margin: 1, footprint } },
        { boundary: BOUNDARY, glyph: LEAF }
      ).placements[0];
    const root = run('root');
    const tight = run('tight');
    expect(root.capBy).toBe('host');
    expect(tight.capBy).toBe('host');
    expect(tight.radius / root.radius).toBeGreaterThan(2);
    // …and it is still inside the cell, which is the whole permission for it.
    const dx = tight.footprintCenter.x - 500;
    const dy = tight.footprintCenter.y - 500;
    expect(Math.hypot(dx, dy) + tight.packedRadius * LEAF_FR).toBeLessThanOrEqual(12 + 1e-9);
  });

  it('a centre displaced clean out of its container is rejected `no-fit` (decision 5c)', () => {
    const anchors = [anchor('a', 500, 500, { hostRadius: 3 })];
    const { placements, rejected } = resolvePlacements(
      anchors,
      {
        orientation: PAGE,
        jitter: { seed: 3, lateral: 1, along: 0, rotation: 0, scale: 0, lateralRange: 40, alongRange: 0, rotationRange: 0, scaleRange: 0 },
        sizing: { ...PROP, footprint: 'tight' },
      },
      { boundary: BOUNDARY, glyph: LEAF }
    );
    expect(placements).toHaveLength(0);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toBe('no-fit');
    expect(rejected[0].wantedRadius).toBe(20);
    expect(rejected[0]).toHaveProperty('rotation');
  });

  it('the boundary term is solved against the tight disc, and containment holds', () => {
    // An anchor 30 from the RIGHT edge, with the glyph leaning AWAY from it: the
    // root law reserves a disc that overhangs the edge on a side the ink never
    // reaches, so it caps at 30. The tight law knows where the ink is.
    const anchors = [anchor('a', 970, 500)];
    const away = (footprint) =>
      resolvePlacements(
        anchors,
        { orientation: { ...PAGE, offset: 180 }, sizing: { ...PROP, size: 200, margin: 1, footprint } },
        { boundary: BOUNDARY, glyph: LEAF }
      ).placements[0];
    const root = away('root');
    const tight = away('tight');
    expect(root.capBy).toBe('boundary');
    expect(root.radius).toBeCloseTo(30, 12);
    expect(tight.radius).toBeGreaterThan(root.radius);
    // The tight disc stays inside the region on every side.
    const cx = tight.footprintCenter.x;
    const cy = tight.footprintCenter.y;
    const rr = tight.packedRadius * LEAF_FR;
    expect(cx + rr).toBeLessThanOrEqual(1000 + 1e-9);
    expect(cx - rr).toBeGreaterThanOrEqual(-1e-9);
    expect(cy + rr).toBeLessThanOrEqual(1000 + 1e-9);
    expect(cy - rr).toBeGreaterThanOrEqual(-1e-9);
  });

  it('a glyph leaning INTO the edge is still capped by it, at essentially the same radius', () => {
    // The mirror of the test above, and the reason the boundary gain is modest
    // in general: |f̂c| + f̂r ≈ 1 for every glyph in the library, so a reserve
    // leaning straight at an edge reaches as far as the root disc did.
    const anchors = [anchor('a', 970, 500)];
    const root = place(anchors, { ...PROP, size: 200, margin: 1, footprint: 'root' }).placements[0];
    const tight = place(anchors, { ...PROP, size: 200, margin: 1, footprint: 'tight' }).placements[0];
    expect(root.capBy).toBe('boundary');
    expect(tight.capBy).toBe('boundary');
    expect(tight.radius).toBeGreaterThan(root.radius);
    expect(tight.radius / root.radius).toBeLessThan(1.01);
  });

  it('a null boundary still falls back to the natural size — no Infinity leaks out', () => {
    const { placements } = resolvePlacements(
      [anchor('a', 400, 500)],
      { orientation: PAGE, sizing: { ...PROP, footprint: 'tight' } },
      { glyph: LEAF }
    );
    expect(placements[0].radius).toBe(20);
    expect(Number.isFinite(placements[0].packedRadius)).toBe(true);
    expect(placements[0].neighbourCap).toBe(Infinity);
  });
});

describe('`fixed` mode is untouched in both footprint modes (§5e)', () => {
  it('a fixed layer sizes identically under both laws', () => {
    const anchors = [anchor('a', 200, 500), anchor('b', 214, 500), anchor('c', 260, 500)];
    const fixed = { mode: 'fixed', size: 14, min: 3, margin: 0.85 };
    const root = JSON.stringify(place(anchors, { ...fixed, footprint: 'root' }));
    const tight = JSON.stringify(place(anchors, { ...fixed, footprint: 'tight' }));
    expect(tight).toBe(root);
  });
});

describe('a tight layer without a usable glyph fails LOUDLY (ruling 7d)', () => {
  const anchors = [anchor('a', 400, 500)];
  const tight = { ...PROP, footprint: 'tight' };

  it('throws when no glyph is supplied at all', () => {
    expect(() =>
      resolvePlacements(anchors, { orientation: PAGE, sizing: tight }, { boundary: BOUNDARY })
    ).toThrow(/glyph/i);
  });

  it('throws when the glyph is missing its measured footprint', () => {
    expect(() =>
      resolvePlacements(anchors, { orientation: PAGE, sizing: tight }, {
        boundary: BOUNDARY,
        glyph: { id: 'x', viewRadius: 10, paths: [] },
      })
    ).toThrow(/footprint/i);
  });

  it('throws on a non-finite footprint radius rather than sizing to NaN', () => {
    expect(() =>
      resolvePlacements(anchors, { orientation: PAGE, sizing: tight }, {
        boundary: BOUNDARY,
        glyph: { id: 'x', viewRadius: 10, footprintCenter: { x: 1, y: 1 }, footprintRadius: NaN },
      })
    ).toThrow(/footprint/i);
  });

  it('a SEQUENCED slot resolves its own glyph through `glyphMap`', () => {
    const seq = {
      type: 'sequence',
      mode: 'cycle',
      continuous: false,
      seed: 1,
      slots: [{ glyphRef: 'leaf' }, { glyphRef: 'dot' }],
    };
    const twoAnchors = [anchor('a', 400, 500), anchor('b', 460, 500)];
    const { placements } = resolvePlacements(
      twoAnchors,
      { orientation: PAGE, sequence: seq, sizing: tight },
      { boundary: BOUNDARY, glyph: LEAF, glyphMap: { leaf: LEAF, dot: DOT } }
    );
    expect(placements[0].glyphRef).toBe('leaf');
    expect(placements[1].glyphRef).toBe('dot');
    // The leaf leans; the dot is centred on its own ink (fc = 0).
    expect(placements[0].footprintCenter.x).not.toBe(placements[0].x);
    expect(placements[1].footprintCenter).toEqual({ x: placements[1].x, y: placements[1].y });
  });
});

describe('no degenerate radius ever reaches a placement or the obstacle list', () => {
  it('a dense run emits only finite, positive radii under the tight law', () => {
    const anchors = [];
    for (let i = 0; i < 40; i++) {
      anchors.push(anchor(`a${i}`, 100 + (i % 8) * 9, 100 + Math.floor(i / 8) * 9));
    }
    const { placements, rejected } = place(anchors, { ...PROP, min: 0, footprint: 'tight' });
    for (const p of placements) {
      expect(Number.isFinite(p.packedRadius)).toBe(true);
      expect(p.packedRadius).toBeGreaterThan(0);
      expect(Number.isFinite(p.drawnRadius)).toBe(true);
      expect(Number.isFinite(p.hardCap)).toBe(true);
      expect(Number.isFinite(p.footprintCenter.x)).toBe(true);
      expect(Number.isFinite(p.footprintCenter.y)).toBe(true);
    }
    // The rejections are the honest ones, not NaN escaping as a "fit".
    for (const r of rejected) {
      expect(['no-fit', 'below-floor']).toContain(r.reason);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// DECISION 5-rev — THE HARD TIER TAKES `max(R_root, R_tight)`.
//
// Decision 5 restated host and boundary containment against the TIGHT disc
// alone. Measurement overturned it: by the triangle inequality `|f̂c| + f̂r ≥ 1`
// always, so at an undisplaced centre the tight bound is `H/(|f̂c| + f̂r) ≤ H` —
// never better than the root bound, and 61 of 62 glyphs shrank (`slice100`, the
// worst reach at 1.2058, to 0.829×). Both bounds are INDEPENDENTLY SOUND
// containment certificates — art inside the root disc guarantees art inside the
// container, and so does art inside the tight disc — so the tier takes whichever
// permits the LARGER radius. The NEIGHBOUR term is untouched: it is genuinely
// disc-vs-disc, the tight disc is correct there, and the whole 4× lives in it.
//
// ⚠️ WHAT SURVIVES 5-rev IS *ART* INSIDE THE CONTAINER, NOT *TIGHT DISC* INSIDE
// THE CONTAINER. When the root bound wins, the tight disc may legitimately poke
// out — it bulges past the ink on the far side. The containment assertions below
// are therefore made against the FLATTENED ART, pushed through the very matrix
// the renderer uses, not against the reserve disc.
// ─────────────────────────────────────────────────────────────────────────────

const SLICE100 = MOTIF_GLYPHS.slice100;
const S_FR = SLICE100.footprintRadius / SLICE100.viewRadius;
const S_REACH =
  (Math.hypot(SLICE100.footprintCenter.x, SLICE100.footprintCenter.y) +
    SLICE100.footprintRadius) /
  SLICE100.viewRadius;

/** Every flattened art point of `glyph`, through the matrix the renderer builds. */
function inkPoints(placement, glyph, radius = placement.radius) {
  const m = placementMatrix(
    {
      x: placement.x,
      y: placement.y,
      rotation: placement.rotation,
      radius,
      flip: !!placement.flip,
    },
    glyph.viewRadius,
    glyph.root || { x: 0, y: 0, angle: 0 }
  );
  const out = [];
  for (const p of glyph.paths || []) {
    for (const [px, py] of flattenPathD(p.d, 0.05).points) {
      out.push(applyMatrix({ x: px, y: py }, m));
    }
  }
  return out;
}

describe('the HARD tier takes max(R_root, R_tight) — decision 5-rev', () => {
  const HOST = 12;
  const cellRun = (footprint, glyph, extra = {}) =>
    resolvePlacements(
      [anchor('a', 500, 500, { hostRadius: HOST })],
      { orientation: PAGE, sizing: { ...PROP, margin: 1, footprint }, ...extra },
      { boundary: BOUNDARY, glyph }
    ).placements[0];

  it('slice100 at an UNDISPLACED cell centre is back to 1.000× — the ROOT bound wins', () => {
    const root = cellRun('root', SLICE100);
    const tight = cellRun('tight', SLICE100);
    expect(root.capBy).toBe('host');
    expect(tight.capBy).toBe('host');
    expect(root.radius).toBe(HOST);
    // Bit-identical, not merely close: the tight arm evaluates the same root
    // expression on the same inputs and that value wins the max.
    expect(tight.radius).toBe(root.radius);

    // NON-VACUITY — the tight bound really is the smaller one here, by exactly
    // the reach factor. This is the 0.829× regression 5-rev exists to undo.
    const tightOnly = hostLimit({ x: 0, y: 0 }, { x: 0, y: -S_FR * 0 }, S_FR, HOST);
    expect(tightOnly).toBeGreaterThan(0);
    const leaning = hostLimit(
      { x: 0, y: 0 },
      {
        x: SLICE100.footprintCenter.x / SLICE100.viewRadius,
        y: SLICE100.footprintCenter.y / SLICE100.viewRadius,
      },
      S_FR,
      HOST
    );
    expect(leaning / HOST).toBeCloseTo(1 / S_REACH, 12);
    expect(leaning / HOST).toBeCloseTo(0.829, 3);

    // CONTAINMENT — stated against the ART, which is what is inviolable.
    for (const q of inkPoints(tight, SLICE100)) {
      expect(Math.hypot(q.x - 500, q.y - 500)).toBeLessThanOrEqual(HOST + 1e-6);
    }
    // …and the tight disc DOES poke outside the cell, which is fine and is why
    // the assertion above is about ink and not about the reserve.
    const dx = tight.footprintCenter.x - 500;
    const dy = tight.footprintCenter.y - 500;
    expect(Math.hypot(dx, dy) + tight.packedRadius * S_FR).toBeGreaterThan(HOST);
  });

  it('slice100 leaning straight INTO an edge is back to 1.000× too', () => {
    // 30 from the top edge, fc pointing −y: the reserve reaches the edge at the
    // same moment the root disc does, times the 1.2058 reach.
    const at = (footprint) =>
      resolvePlacements(
        [anchor('a', 500, 30)],
        { orientation: PAGE, sizing: { ...PROP, size: 200, margin: 1, footprint } },
        { boundary: BOUNDARY, glyph: SLICE100 }
      ).placements[0];
    const root = at('root');
    const tight = at('tight');
    expect(root.capBy).toBe('boundary');
    expect(root.radius).toBeCloseTo(30, 12);
    expect(tight.radius).toBe(root.radius);
    for (const q of inkPoints(tight, SLICE100)) {
      expect(q.y).toBeGreaterThanOrEqual(-1e-6);
    }
  });

  it('a DISPLACED centre leaning back across its cell — the TIGHT bound wins the max', () => {
    // Jitter pushes the centre 5.86 UP the normal; rotation 180 turns slice100 so
    // it leans back DOWN across the anchor. The root law can only offer
    // `H − d = 6.14`; the tight law knows the ink comes back into the cell.
    const jitter = {
      seed: 7, lateral: 1, along: 0, rotation: 0, scale: 0,
      lateralRange: 6, alongRange: 0, rotationRange: 0, scaleRange: 0,
    };
    const run = (footprint) =>
      resolvePlacements(
        [anchor('a', 500, 500, { hostRadius: HOST })],
        {
          orientation: { ...PAGE, offset: 180 },
          jitter,
          sizing: { ...PROP, margin: 1, footprint },
        },
        { boundary: BOUNDARY, glyph: SLICE100 }
      ).placements[0];
    const root = run('root');
    const tight = run('tight');
    expect(root.capBy).toBe('host');
    expect(tight.capBy).toBe('host');
    expect(root.radius).toBeCloseTo(HOST - 5.8595, 3);
    expect(tight.radius).toBeGreaterThan(root.radius);
    expect(tight.radius / root.radius).toBeGreaterThan(2);
    // The tight bound won, so here the DISC is inside the cell as well.
    const dx = tight.footprintCenter.x - 500;
    const dy = tight.footprintCenter.y - 500;
    expect(Math.hypot(dx, dy) + tight.packedRadius * S_FR).toBeLessThanOrEqual(HOST + 1e-9);
    for (const q of inkPoints(tight, SLICE100)) {
      expect(Math.hypot(q.x - 500, q.y - 500)).toBeLessThanOrEqual(HOST + 1e-6);
    }
  });

  it('NO glyph in the library shrinks under the tight law — all 62, cell and edge', () => {
    // The population statement 5-rev makes. A single anchor, so greedy
    // redistribution (§7z 5e-obs) cannot confound it: per glyph the hard tier is
    // now a max over two bounds and can only be ≥ either.
    const all = Object.values(MOTIF_GLYPHS);
    expect(all.length).toBe(62);
    let tightEverWins = 0;
    for (const glyph of all) {
      const rootCell = cellRun('root', glyph);
      const tightCell = cellRun('tight', glyph);
      expect(tightCell.radius).toBeGreaterThanOrEqual(rootCell.radius);
      if (tightCell.radius > rootCell.radius) tightEverWins += 1;

      const edge = (footprint) =>
        resolvePlacements(
          [anchor('e', 500, 30)],
          { orientation: PAGE, sizing: { ...PROP, size: 200, margin: 1, footprint } },
          { boundary: BOUNDARY, glyph }
        ).placements[0];
      expect(edge('tight').radius).toBeGreaterThanOrEqual(edge('root').radius);
    }
    // …and the max is live, not a dressed-up root law: some glyphs do win on the
    // tight side even undisplaced (every glyph whose reach is below 1).
    expect(tightEverWins).toBeGreaterThan(0);
  });

  it('neither bound permitting a positive R is still `no-fit` (decision 5c)', () => {
    // Displaced clean out of the container: the root bound is `max(0, H − d) = 0`
    // and `hostLimit` reports −1. A max over two rejections is still a rejection.
    const { placements, rejected } = resolvePlacements(
      [anchor('a', 500, 500, { hostRadius: 3 })],
      {
        orientation: PAGE,
        jitter: { seed: 3, lateral: 1, along: 0, rotation: 0, scale: 0, lateralRange: 40, alongRange: 0, rotationRange: 0, scaleRange: 0 },
        sizing: { ...PROP, footprint: 'tight' },
      },
      { boundary: BOUNDARY, glyph: SLICE100 }
    );
    expect(placements).toHaveLength(0);
    expect(rejected[0].reason).toBe('no-fit');
  });

  it('the §1a leaf neighbour result is UNTOUCHED — 4.25 → 20.00 at anchors 25 apart', () => {
    // The 4× recovery lives entirely in the neighbour term, which 5-rev does not
    // touch. Pinned to the exact numbers, not to a ratio: if either moves, the
    // neighbour term was edited.
    const anchors = [anchor('a', 400, 500), anchor('b', 375, 500)];
    const root = place(anchors, { ...PROP, footprint: 'root' }).placements;
    const tight = place(anchors, { ...PROP, footprint: 'tight' }).placements;
    expect(root[1].capBy).toBe('neighbour');
    expect(root[1].radius).toBeCloseTo(4.25, 12);
    expect(tight[1].radius).toBeCloseTo(20.0, 12);
    expect(tight[1].capBy).toBe('natural');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// `root.angle` — THE GROWTH TURN. `placementMatrix` composes
//
//     M = T(P) · R(θ) · S(sx,sy) · R(−φ) · T(−root),   φ = root.angle
//
// so a root-relative art point `q` lands at `P + R(θ)·diag(σ,1)·s·R(−φ)·q` with
// `σ = −1` when flipped. `R(θ)·R(−φ) = R(θ−φ)`, and since
// `diag(−1,1)·R(−φ) = R(φ)·diag(−1,1)`, the flipped case is
// `R(θ+φ)·(−f̂c.x, f̂c.y)`. The engine reserved `R(θ)·f̂c` — correct only at φ = 0,
// which every one of the 62 built-ins happens to be, so the bug shipped latent.
// `PenCanvas.jsx:433-435` lets the user drag that angle.
//
// These tests use SYNTHETIC glyphs, because shipped data cannot exercise it.
// ─────────────────────────────────────────────────────────────────────────────

/** A synthetic glyph: real flattened geometry, a root the pen editor could drag. */
function synthGlyph(id, d, root) {
  const pts = flattenPathD(d, 0.05).points.map(([x, y]) => ({ x, y }));
  const mec = minEnclosingCircle(pts);
  return {
    id,
    name: id,
    tradition: 'test',
    paths: [{ d, closed: true }],
    root,
    viewRadius: Math.max(...pts.map((p) => Math.hypot(p.x - root.x, p.y - root.y))),
    footprintCenter: { x: mec.x - root.x, y: mec.y - root.y },
    footprintRadius: mec.r,
  };
}

const HOOK_D = 'M 0 0 C 20 -30 60 -20 70 10 L 40 25 Z';

describe('the reserve honours `root.angle` (the growth turn)', () => {
  const THETAS = [0, 37, 90, 180, 270];

  /** Worst ink excursion outside the committed reserve, as a fraction of it. */
  function worstExcursion(glyph) {
    const fr = glyph.footprintRadius / glyph.viewRadius;
    let worst = 0;
    for (const theta of THETAS) {
      for (const flipEnabled of [false, true]) {
        const { placements } = resolvePlacements(
          [anchor('a', 500, 500), anchor('b', 545, 500)],
          {
            orientation: { ...PAGE, offset: theta },
            flip: flipEnabled,
            sizing: { ...PROP, footprint: 'tight' },
          },
          { boundary: BOUNDARY, glyph }
        );
        for (const p of placements) {
          expect(p.radius).toBe(p.packedRadius);
          const r = p.packedRadius * fr;
          for (const q of inkPoints(p, glyph)) {
            const out =
              (Math.hypot(q.x - p.footprintCenter.x, q.y - p.footprintCenter.y) - r) / r;
            if (out > worst) worst = out;
          }
        }
      }
    }
    return worst;
  }

  it.each([0, 30, 90, -45, 137, 180])(
    'root.angle %d° — every ink point lies inside the committed reserve, at every rotation and both flips',
    (phi) => {
      expect(worstExcursion(synthGlyph('hook', HOOK_D, { x: 5, y: -3, angle: phi }))).toBeLessThan(
        1e-9
      );
    }
  );

  it('the PROVED case: slice100 given a 90° growth turn keeps its ink inside the disc', () => {
    // The adversarial pass constructed exactly this and measured ink 74.9% of the
    // reserve radius OUTSIDE the committed disc — a cut outside the material.
    const turned = { ...SLICE100, root: { ...SLICE100.root, angle: 90 } };
    expect(worstExcursion(turned)).toBeLessThan(1e-9);
  });

  it('the offset is Rot(θ−φ)·f̂c, and Rot(θ+φ)·(−f̂c.x, f̂c.y) when flipped', () => {
    const phi = 55;
    const glyph = synthGlyph('hook', HOOK_D, { x: 5, y: -3, angle: phi });
    const fcx = glyph.footprintCenter.x / glyph.viewRadius;
    const fcy = glyph.footprintCenter.y / glyph.viewRadius;
    const rot = (v, deg) => {
      const t = (deg * Math.PI) / 180;
      return { x: v.x * Math.cos(t) - v.y * Math.sin(t), y: v.x * Math.sin(t) + v.y * Math.cos(t) };
    };
    const theta = 37;
    const { placements } = resolvePlacements(
      [anchor('a', 500, 500), anchor('b', 545, 500)],
      {
        orientation: { ...PAGE, offset: theta },
        flip: true,
        sizing: { ...PROP, footprint: 'tight' },
      },
      { boundary: BOUNDARY, glyph }
    );
    const [unflipped, flipped] = placements;
    expect(unflipped.flip).toBe(false);
    expect(flipped.flip).toBe(true);

    const eU = rot({ x: fcx, y: fcy }, theta - phi);
    expect(unflipped.footprintCenter.x - unflipped.x).toBeCloseTo(unflipped.packedRadius * eU.x, 10);
    expect(unflipped.footprintCenter.y - unflipped.y).toBeCloseTo(unflipped.packedRadius * eU.y, 10);

    const eF = rot({ x: -fcx, y: fcy }, theta + phi);
    expect(flipped.footprintCenter.x - flipped.x).toBeCloseTo(flipped.packedRadius * eF.x, 10);
    expect(flipped.footprintCenter.y - flipped.y).toBeCloseTo(flipped.packedRadius * eF.y, 10);

    // The sign matters: θ+φ and θ−φ are not interchangeable, so a flipped/
    // unflipped mix-up cannot pass by symmetry.
    expect(eU.x).not.toBeCloseTo(eF.x, 3);
  });

  it('at root.angle 0 the reserve is EXACTLY the pre-fix `Rot(θ)·f̂c` — no churn', () => {
    // The short-circuit that keeps all 62 built-ins bit-identical.
    const glyph = synthGlyph('hook', HOOK_D, { x: 5, y: -3, angle: 0 });
    const fcx = glyph.footprintCenter.x / glyph.viewRadius;
    const fcy = glyph.footprintCenter.y / glyph.viewRadius;
    const theta = 37;
    const t = (theta * Math.PI) / 180;
    const p = resolvePlacements(
      [anchor('a', 500, 500)],
      { orientation: { ...PAGE, offset: theta }, sizing: { ...PROP, footprint: 'tight' } },
      { boundary: BOUNDARY, glyph }
    ).placements[0];
    // Compared UNSUBTRACTED: `footprintCenter.x − x` cancels 500 against 500 and
    // loses the low bits, so a difference there would be the test's arithmetic,
    // not the engine's.
    expect(p.footprintCenter.x).toBe(p.x + p.packedRadius * (fcx * Math.cos(t) - fcy * Math.sin(t)));
    expect(p.footprintCenter.y).toBe(p.y + p.packedRadius * (fcx * Math.sin(t) + fcy * Math.cos(t)));
  });
});
