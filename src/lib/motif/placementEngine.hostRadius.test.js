// The HOST-SIZE CHANNEL (#146, PRD #143) — `hostRadius` containment.
//
// NORMATIVE SHAPE. An anchor may carry an optional TOP-LEVEL `hostRadius`
// declaring the radius of the container it occupies. Not `meta.hostRadius`; not a
// new sizing mode; never in the document. Absent (null/undefined/non-finite) ⇒
// the engine behaves EXACTLY as it did before this ticket.
//
// NORMATIVE RULE. Containment is a DISTANCE rule, not a radius cap. Jitter moves
// the placement centre along the anchor's normal and tangent BEFORE sizing, so a
// glyph clamped to `margin × hostRadius` still crosses its container whenever the
// centre has moved. The rule is stated against the DISPLACED centre:
//
//     radius ≤ margin × max(0, hostRadius − d),  d = |placementCentre − anchor|
//
// `d` is the GEOMETRIC distance from the anchor to the displaced centre (not
// hypot(lateralDisp, alongDisp) — the two agree only when tangent ⊥ normal).
// This composes as a THIRD argument to the existing minimum alongside the
// natural target and the empty-circle term, so the no-overlap invariant is
// untouched. `sizeScale` (Slot modifier) grows only the NATURAL target — never
// the empty-circle cap and never the host cap — so a Slot cannot break
// containment.
//
// Proportional mode only. The fixed sizing mode ignores host radius entirely.

import { describe, it, expect } from 'vitest';
import { resolvePlacements, placeMotifs } from './placementEngine.js';

const HALF_PI = Math.PI / 2;

/** A cell-role anchor at (x,y) with the fixed cell convention (tangent 0, normal π/2). */
function cellAnchor(id, x, y, hostRadius) {
  const a = { id, role: 'cell', x, y, tangent: 0, normal: HALF_PI, s: 0, meta: {} };
  if (hostRadius !== undefined) a.hostRadius = hostRadius;
  return a;
}

const BOUNDARY = { type: 'rect', width: 1000, height: 1000 };

describe('hostRadius — containment on the displaced centre', () => {
  it('a glyph on a SMALL circle stays inside it; the same glyph on a LARGE circle grows to fill', () => {
    // size 100 is a ceiling neither container reaches, and the two circles are
    // 400 apart so the empty-circle term never binds. The HOST term is the
    // binding one in both placements — which is the point of the test.
    const anchors = [cellAnchor('a', 200, 500, 10), cellAnchor('b', 600, 500, 60)];
    const { placements } = resolvePlacements(
      anchors,
      { sizing: { mode: 'proportional', size: 100, min: 0, margin: 0.9 } },
      { boundary: BOUNDARY }
    );
    expect(placements).toHaveLength(2);
    expect(placements[0].radius).toBeCloseTo(0.9 * 10, 12);
    expect(placements[1].radius).toBeCloseTo(0.9 * 60, 12);
    // Containment, stated as the maker sees it: the glyph's disc lies inside the
    // circle it occupies.
    expect(placements[0].radius).toBeLessThanOrEqual(10);
    expect(placements[1].radius).toBeLessThanOrEqual(60);
  });

  it('glyph AREA scales with circle AREA', () => {
    // Host term binding for both (size ceiling far above, containers far apart).
    const anchors = [cellAnchor('a', 200, 500, 10), cellAnchor('b', 700, 500, 40)];
    const { placements } = resolvePlacements(
      anchors,
      { sizing: { mode: 'proportional', size: 500, min: 0, margin: 0.8 } },
      { boundary: BOUNDARY }
    );
    const areaRatio =
      (placements[1].radius * placements[1].radius) / (placements[0].radius * placements[0].radius);
    const circleAreaRatio = (40 * 40) / (10 * 10);
    expect(areaRatio).toBeCloseTo(circleAreaRatio, 10);
  });

  it('containment holds when JITTER has displaced the glyph off its circle centre', () => {
    // A pure-lateral jitter with lateralRange 6 moves the centre by up to 6px.
    // Whatever the draw, radius + d must stay within the container.
    const anchors = [];
    for (let i = 0; i < 12; i++) anchors.push(cellAnchor(`c${i}`, 100 + i * 300, 500, 20));
    const { placements } = resolvePlacements(
      anchors,
      {
        sizing: { mode: 'proportional', size: 1000, min: 0, margin: 1 },
        jitter: { seed: 5, lateral: 1, lateralRange: 6, along: 1, alongRange: 6 },
      },
      { boundary: { type: 'rect', width: 100000, height: 1000 } }
    );
    expect(placements.length).toBeGreaterThan(0);
    for (const pl of placements) {
      const anchor = anchors.find((a) => a.id === pl.anchorId);
      const d = Math.hypot(pl.x - anchor.x, pl.y - anchor.y);
      expect(d).toBeGreaterThan(0); // jitter really moved it
      expect(pl.radius + d).toBeLessThanOrEqual(anchor.hostRadius + 1e-12);
    }
  });

  it('a glyph nudged toward the rim SHRINKS rather than crossing it', () => {
    // Same anchor, same everything, twice: once at rest, once displaced. The
    // displaced one must be strictly smaller by the displacement.
    const at = (jitter) =>
      resolvePlacements(
        [cellAnchor('a', 500, 500, 30)],
        { sizing: { mode: 'proportional', size: 1000, min: 0, margin: 1 }, jitter },
        { boundary: BOUNDARY }
      ).placements[0];
    const rest = at({ seed: 1 });
    const nudged = at({ seed: 1, lateral: 1, lateralRange: 12 });
    const d = Math.hypot(nudged.x - 500, nudged.y - 500);
    expect(d).toBeGreaterThan(0);
    expect(rest.radius).toBeCloseTo(30, 12);
    expect(nudged.radius).toBeCloseTo(30 - d, 12);
    expect(nudged.radius).toBeLessThan(rest.radius);
  });

  it('a displacement EXCEEDING the container yields rejection, never a negative radius', () => {
    // min is 0, so the pre-existing below-floor path cannot be what rejects this.
    const { placements, rejected } = resolvePlacements(
      [cellAnchor('a', 500, 500, 3)],
      {
        sizing: { mode: 'proportional', size: 1000, min: 0, margin: 1 },
        jitter: { seed: 3, lateral: 1, lateralRange: 200 },
      },
      { boundary: BOUNDARY }
    );
    expect(placements).toHaveLength(0);
    expect(rejected).toEqual([{ anchorId: 'a', reason: 'no-fit' }]);
  });

  it('the LAYER SIZE is still a ceiling — host radius never raises a glyph above it', () => {
    // size 5 is far below margin × hostRadius, so the NATURAL target binds.
    const { placements } = resolvePlacements(
      [cellAnchor('a', 500, 500, 200)],
      { sizing: { mode: 'proportional', size: 5, min: 0, margin: 1 } },
      { boundary: BOUNDARY }
    );
    expect(placements[0].radius).toBeCloseTo(5, 12);
  });

  it('the empty-circle term still binds when it is the smallest — no-overlap is untouched', () => {
    // Two tangent containers of very different radii. The big glyph is placed
    // first and claims its footprint; the small one must be pushed down by the
    // empty-circle term, not merely by its own container.
    const anchors = [cellAnchor('big', 500, 500, 120), cellAnchor('small', 640, 500, 100)];
    const { placements } = resolvePlacements(
      anchors,
      { sizing: { mode: 'proportional', size: 1000, min: 0, margin: 1 } },
      { boundary: BOUNDARY }
    );
    expect(placements).toHaveLength(2);
    // Accepted footprints do not overlap.
    const [p, q] = placements;
    expect(Math.hypot(p.x - q.x, p.y - q.y)).toBeGreaterThanOrEqual(p.radius + q.radius - 1e-9);
    // The second one was clamped by the neighbour (140 − 120 = 20), not by its
    // own 100-radius container.
    expect(q.radius).toBeCloseTo(20, 9);
  });

  it('a container whose clamped radius falls BELOW THE SIZE FLOOR is rejected — and no override resurrects it', () => {
    // margin × hostRadius = 0.9 × 4 = 3.6 < min 5 ⇒ below-floor. Per-glyph
    // overrides apply only to ACCEPTED placements, so there is nothing to rescue.
    const anchors = [cellAnchor('tiny', 200, 500, 4), cellAnchor('roomy', 700, 500, 40)];
    const binding = {
      selection: {},
      placement: { sizing: { mode: 'proportional', size: 1000, min: 5, margin: 0.9 } },
    };
    const bare = placeMotifs(anchors, binding, { boundary: BOUNDARY });
    expect(bare.placements.map((p) => p.anchorId)).toEqual(['roomy']);
    expect(bare.rejected).toEqual([{ anchorId: 'tiny', reason: 'below-floor' }]);

    // Same run, now with a per-glyph scale override pinned on the rejected anchor.
    const withOverride = placeMotifs(
      anchors,
      {
        ...binding,
        selection: { overrides: { records: [{ ref: 'tiny', scale: 8 }] } },
      },
      { boundary: BOUNDARY }
    );
    expect(withOverride.placements.map((p) => p.anchorId)).toEqual(['roomy']);
    expect(withOverride.rejected).toEqual([{ anchorId: 'tiny', reason: 'below-floor' }]);
  });

  it('the FIXED sizing mode ignores host radius entirely', () => {
    // A container far smaller than the fixed size: fixed stamps the literal size.
    const anchors = [cellAnchor('a', 500, 500, 2)];
    const fixedNoHost = resolvePlacements(
      [cellAnchor('a', 500, 500)],
      { sizing: { mode: 'fixed', size: 25, min: 0 } },
      { boundary: BOUNDARY }
    );
    const fixedWithHost = resolvePlacements(
      anchors,
      { sizing: { mode: 'fixed', size: 25, min: 0 } },
      { boundary: BOUNDARY }
    );
    expect(fixedWithHost.placements).toEqual(fixedNoHost.placements);
    expect(fixedWithHost.placements[0].radius).toBe(25);
  });
});

describe('hostRadius — composition with the documented order', () => {
  it('a Slot sizeScale grows the natural target but NEVER breaks containment', () => {
    // Slot 0 has sizeScale 3. On a roomy container the scaled target still fits;
    // on a tight one the container clamps it. Containment is the invariant.
    const anchors = [cellAnchor('a', 200, 500, 8), cellAnchor('b', 800, 500, 200)];
    const sequence = {
      type: 'sequence',
      mode: 'cycle',
      slots: [{ glyphRef: 'g', sizeScale: 3 }],
    };
    const { placements } = resolvePlacements(
      anchors,
      { sequence, sizing: { mode: 'proportional', size: 20, min: 0, margin: 1 } },
      { boundary: BOUNDARY }
    );
    expect(placements).toHaveLength(2);
    // Tight container: clamped to the container, NOT 20×3 = 60.
    expect(placements[0].radius).toBeCloseTo(8, 12);
    // Roomy container: the natural target × sizeScale binds.
    expect(placements[1].radius).toBeCloseTo(60, 12);
  });

  it('scale jitter still varies size under a host cap, and stays contained', () => {
    const anchors = [];
    for (let i = 0; i < 8; i++) anchors.push(cellAnchor(`c${i}`, 200 + i * 400, 500, 30));
    const { placements } = resolvePlacements(
      anchors,
      {
        sizing: { mode: 'proportional', size: 20, min: 0, margin: 1 },
        jitter: { seed: 11, scale: 1, scaleRange: 0.5 },
      },
      { boundary: { type: 'rect', width: 100000, height: 1000 } }
    );
    const radii = new Set(placements.map((p) => p.radius));
    expect(radii.size).toBeGreaterThan(1); // jitter really varied it
    for (const pl of placements) expect(pl.radius).toBeLessThanOrEqual(30 + 1e-12);
  });

  it('a per-glyph override applies AFTER containment and may deliberately exceed the container', () => {
    // Containment is a PRE-override invariant (applyGlyphOverrides is documented
    // to run post-packing and may overlap neighbours). Story 10: the maker can
    // break one PLACED glyph out of its circle on purpose.
    const anchors = [cellAnchor('a', 500, 500, 30)];
    const binding = {
      selection: { overrides: { records: [{ ref: 'a', scale: 2 }] } },
      placement: { sizing: { mode: 'proportional', size: 1000, min: 0, margin: 1 } },
    };
    const { placements } = placeMotifs(anchors, binding, { boundary: BOUNDARY });
    expect(placements).toHaveLength(1);
    expect(placements[0].radius).toBeCloseTo(60, 12);
  });
});

describe('hostRadius — the regression guard for every existing document', () => {
  // An anchor declaring NO hostRadius must produce output IDENTICAL to the
  // current engine, asserted on EXACT values.
  const plain = (id, x, y, role = 'edge') => ({
    id,
    role,
    x,
    y,
    tangent: 0.3,
    normal: 0.3 + HALF_PI,
    s: 0.5,
    meta: {},
  });

  it('proportional placement without hostRadius is EXACT and unchanged', () => {
    const anchors = [plain('a', 100, 100), plain('b', 160, 130), plain('c', 300, 220)];
    const { placements, rejected, placementStats } = resolvePlacements(
      anchors,
      {
        sizing: { mode: 'proportional', size: 18, min: 3, margin: 0.85 },
        jitter: { seed: 4, lateral: 1, lateralRange: 5, rotation: 1, rotationRange: 20, scale: 1, scaleRange: 0.3 },
        orientation: { policy: 'path', useNormal: true, offset: 0 },
      },
      { boundary: { type: 'rect', width: 400, height: 400 } }
    );
    // Exact values, captured from the engine on main @ 170f5a7 BEFORE the
    // hostRadius channel existed. Any drift here means an existing document
    // renders differently.
    expect(placements).toEqual([
      {
        anchorId: 'a',
        role: 'edge',
        index: 0,
        x: 98.7480694348009,
        y: 104.0471511721598,
        rotation: 96.05544989049775,
        scale: 0.7491046119481326,
        radius: 13.483883015066386,
        seqId: 'A',
        flip: false,
      },
      {
        anchorId: 'b',
        role: 'edge',
        index: 1,
        x: 160.78609189792627,
        y: 127.45877859798745,
        rotation: 90.28439339302821,
        scale: 1.2843171523883938,
        radius: 23.117708742991088,
        seqId: 'A',
        flip: false,
      },
      {
        anchorId: 'c',
        role: 'edge',
        index: 2,
        x: 299.63935459136263,
        y: 221.16586856242188,
        rotation: 117.9145779465918,
        scale: 0.9214892063289882,
        radius: 16.586805713921787,
        seqId: 'A',
        flip: false,
      },
    ]);
    expect(rejected).toEqual([]);
    // Pinned here only as part of the byte-identity claim (nothing about this
    // run was rejected). It is NEVER the count of glyphs — `placed` is the
    // post-cap CANDIDATE count, before no-fit / below-floor / rest rejections.
    expect(placementStats).toEqual({ total: 3, placed: 3 });
  });

  it('a margin of 0 with no hostRadius still yields the accepted zero-radius placement it does today', () => {
    // margin is clamped to [0,1] (NOT (0,1]), so margin 0 makes radius 0 and,
    // with min 0, that placement is ACCEPTED today. The new zero-cap rejection
    // must live strictly inside the hostRadius branch or this document changes.
    const { placements, rejected } = resolvePlacements(
      [plain('a', 100, 100)],
      { sizing: { mode: 'proportional', size: 18, min: 0, margin: 0 } },
      { boundary: { type: 'rect', width: 400, height: 400 } }
    );
    expect(rejected).toEqual([]);
    expect(placements).toHaveLength(1);
    expect(placements[0].radius).toBe(0);
    expect(placements[0].scale).toBe(0);
  });

  it('a non-finite or non-positive hostRadius is treated as ABSENT (never as a zero container)', () => {
    const base = resolvePlacements(
      [plain('a', 100, 100)],
      { sizing: { mode: 'proportional', size: 18, min: 0, margin: 0.85 } },
      { boundary: { type: 'rect', width: 400, height: 400 } }
    ).placements;
    for (const bad of [null, undefined, NaN, Infinity, -5, 'big']) {
      const a = plain('a', 100, 100);
      a.hostRadius = bad;
      const got = resolvePlacements(
        [a],
        { sizing: { mode: 'proportional', size: 18, min: 0, margin: 0.85 } },
        { boundary: { type: 'rect', width: 400, height: 400 } }
      ).placements;
      expect(got).toEqual(base);
    }
  });

  it('the RNG stream is unchanged by the presence of hostRadius', () => {
    // Four draws per survivor, before any early return. A host-capped rejection
    // must not reshuffle a later anchor's jitter.
    const withHost = [cellAnchor('a', 200, 500, 1), cellAnchor('b', 900, 500, 500)];
    const without = [cellAnchor('a', 200, 500), cellAnchor('b', 900, 500)];
    const cfg = {
      sizing: { mode: 'proportional', size: 10, min: 2, margin: 1 },
      jitter: { seed: 9, rotation: 1, rotationRange: 30 },
    };
    const A = resolvePlacements(withHost, cfg, { boundary: BOUNDARY });
    const B = resolvePlacements(without, cfg, { boundary: BOUNDARY });
    // 'a' is rejected in A (container 1 < floor 2) and placed in B, yet 'b'
    // receives the SAME jittered rotation in both.
    expect(A.placements.map((p) => p.anchorId)).toEqual(['b']);
    expect(B.placements.map((p) => p.anchorId)).toEqual(['a', 'b']);
    const bA = A.placements.find((p) => p.anchorId === 'b');
    const bB = B.placements.find((p) => p.anchorId === 'b');
    expect(bA.rotation).toBe(bB.rotation);
  });
});
