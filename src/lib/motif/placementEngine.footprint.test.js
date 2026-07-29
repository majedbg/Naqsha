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
import { neighbourLimit } from './footprintSolve.js';
import { MOTIF_GLYPHS } from './glyphs.js';

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

describe('the HARD tier restates against the tight disc (decision 5)', () => {
  it('a glyph on a CENTRED cell anchor gains almost nothing — and that is structural', () => {
    // ⚠️ A FINDING, recorded here because decision 5 claims "glyphs inside cells
    // get up to 2× bigger in radius". At an UNDISPLACED centre no glyph in the
    // library gains more than 1.004×, and the reason is the same construction §1
    // rests on: `viewRadius` is measured from the root to the farthest point, and
    // the root sits ON the minimal enclosing circle, so |f̂c| + f̂r ≈ 1 for all 62.
    // Containment about the anchor is `R(|f̂c| + f̂r) ≤ H` — i.e. ≈ `R ≤ H`, which
    // is the root law's answer. The 2× is real but needs a DISPLACED centre (the
    // next test) or a lean that points back into the cell; the tier still had to
    // restate, because leaving it root-centred is the mixed model 5b rejects.
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
