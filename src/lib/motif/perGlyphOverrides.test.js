// Per-glyph scale & angle overrides, applied POST-PLACEMENT (#137).
//
// The contract this suite pins (fixed at charting, wayfinder map #134):
//   • Application is POST-PLACEMENT — after the chain AND after packing. The
//     empty-circle acceptance test (`fitsAt` / the growing `placed` list) has
//     already run against the UN-overridden footprint, so a scaled-up glyph may
//     overlap its neighbours. That is accepted: never evict, never re-pack,
//     never hide.
//   • `scale` is a PURE MULTIPLIER — the 4th cascade level:
//         radius = size × scaleFactor(jitter) × sizeScale(slot) × glyphScale
//     default 1. `placement.scale === placement.radius / size` stays invariant.
//   • `angle` is an ABSOLUTE screen-space bearing that REPLACES the resolved
//     rotation (`baseDeg + offset + jitter + slotRotation`). `angle: 0` is a
//     legitimate bearing — a truthiness check would silently drop it.
//   • Holds on ALL host kinds (the override is indifferent to how `baseDeg` was
//     derived — tangent, normal, or page) and across 2D canvas, SVG export and
//     thumbnails (all three share the ONE per-instance matrix built in
//     MotifPattern.generate, so one dual-emit assertion covers all three).
//   • A record carrying only `hidden` changes NOTHING about size/rotation, and
//     an empty/absent record map is a byte-identical no-op (same array back).

import { describe, it, expect } from 'vitest';
import { applyGlyphOverrides } from './overrides.js';
import { resolvePlacements, selectAnchors, placeMotifs } from './placementEngine.js';
import { runSelectionChain } from './chain.js';
import { resolveSelection } from './compileSelectionToChain.js';
import MotifPattern from './MotifPattern.js';
import { RecordingContext } from '../patterns/drawingContext.js';
import { sampleEdgeAnchors } from './anchors.js';

// ── fixtures ────────────────────────────────────────────────────────────────
// Minimal Anchor, mirroring placementEngine.test.js / overrides.test.js.
const mkAnchor = (id, role, x, y, extra = {}) => ({
  id,
  role,
  x,
  y,
  tangent: 0,
  normal: Math.PI / 2,
  s: 0,
  meta: {},
  ...extra,
});

const SIZE = 10;

// Fixed-mode sizing keeps the cascade arithmetic exact (proportional clamps to
// margin*R, which would mask a multiplication bug).
const fixedConfig = (over = {}) => ({
  sizing: { mode: 'fixed', size: SIZE, min: 0, margin: 1 },
  orientation: { policy: 'path', useNormal: true, offset: 0 },
  jitter: { seed: 7, lateral: 0, along: 0, rotation: 0, scale: 0 },
  ...over,
});

const byAnchor = (entries) => new Map(entries);

const findPlacement = (placements, anchorId) =>
  placements.find((p) => p.anchorId === anchorId);

// ── applyGlyphOverrides — the pure post-placement seam ──────────────────────
describe('applyGlyphOverrides — no-op discipline', () => {
  const placements = [
    {
      anchorId: 'a0', role: 'edge', index: 0, x: 0, y: 0, rotation: 30, scale: 1, radius: 10,
      // #186's sizing diagnostics ride on every Placement, so the fixtures that
      // stand in for engine output carry them too.
      packedRadius: 10, drawnRadius: 10, neighbourCap: Infinity, hardCap: 10,
      capBy: 'natural', saturated: false, capObstacle: null,
      seqId: 'A', flip: false,
    },
  ];

  it('an empty / absent record map returns the SAME array reference', () => {
    expect(applyGlyphOverrides(placements, new Map())).toBe(placements);
    expect(applyGlyphOverrides(placements, undefined)).toBe(placements);
    expect(applyGlyphOverrides(placements, null)).toBe(placements);
  });

  it('a record with ONLY `hidden` changes nothing about size or rotation', () => {
    const out = applyGlyphOverrides(placements, byAnchor([['a0', { ref: 'a0', hidden: true }]]));
    expect(out).toBe(placements); // untouched ⇒ same reference
    expect(out[0].radius).toBe(10);
    expect(out[0].rotation).toBe(30);
    expect(out[0].scale).toBe(1);
  });

  it('a record for an anchor that is not placed is simply ignored', () => {
    const out = applyGlyphOverrides(placements, byAnchor([['zz', { ref: 'zz', scale: 3 }]]));
    expect(out).toBe(placements);
  });

  it('never mutates the input placements', () => {
    const input = placements.map((p) => ({ ...p }));
    // structuredClone, not a JSON round-trip: `neighbourCap` is legitimately
    // Infinity and JSON would turn it into null, comparing the fixture against
    // a corrupted copy of itself.
    const snapshot = structuredClone(input);
    applyGlyphOverrides(input, byAnchor([['a0', { ref: 'a0', scale: 4, angle: 12 }]]));
    expect(input).toEqual(snapshot);
  });
});

describe('applyGlyphOverrides — scale', () => {
  // A glyph the packer capped to 8 and `hold` drew at 20 — chosen so the
  // reserved radius and the drawn radius are DIFFERENT numbers, which is what
  // makes "scale moves the drawn radius and leaves the reserve alone"
  // observable at all.
  const base = {
    anchorId: 'a0', role: 'edge', index: 0, x: 0, y: 0, rotation: 30, scale: 2, radius: 20,
    packedRadius: 8, drawnRadius: 20, neighbourCap: 8, hardCap: 25,
    capBy: 'neighbour', saturated: false, capObstacle: { x: 40, y: 0, r: 12 },
    seqId: 'A', flip: false,
  };

  it('multiplies BOTH radius and scale, preserving scale === radius / size', () => {
    const [out] = applyGlyphOverrides([base], byAnchor([['a0', { ref: 'a0', scale: 1.5 }]]));
    expect(out.radius).toBeCloseTo(30, 10);
    expect(out.scale).toBeCloseTo(3, 10);
    // The invariant, asserted as a property: radius / size is unchanged in form.
    expect(out.scale).toBeCloseTo(out.radius / SIZE, 10);
  });

  it('leaves rotation untouched when the record carries no angle', () => {
    const [out] = applyGlyphOverrides([base], byAnchor([['a0', { ref: 'a0', scale: 1.5 }]]));
    expect(out.rotation).toBe(30);
  });

  it('scales `drawnRadius` with `radius` — the drawn ring must not go stale', () => {
    const [out] = applyGlyphOverrides([base], byAnchor([['a0', { ref: 'a0', scale: 1.5 }]]));
    expect(out.drawnRadius).toBeCloseTo(30, 10);
    expect(out.drawnRadius).toBe(out.radius);
    expect(Number.isNaN(out.drawnRadius)).toBe(false);
  });

  it('leaves the RESERVE and every cap alone — the packer genuinely did not move', () => {
    // This pass runs outside the packing loop by design (#137), so an override
    // may legitimately push the drawn radius past `hardCap`. The
    // `drawnRadius <= hardCap` invariant is scoped to `hold`.
    const [out] = applyGlyphOverrides([base], byAnchor([['a0', { ref: 'a0', scale: 1.5 }]]));
    expect(out.packedRadius).toBe(8);
    expect(out.neighbourCap).toBe(8);
    expect(out.hardCap).toBe(25);
    expect(out.capBy).toBe('neighbour');
    expect(out.saturated).toBe(false);
    expect(out.capObstacle).toEqual({ x: 40, y: 0, r: 12 });
    expect(out.drawnRadius).toBeGreaterThan(out.hardCap);
  });

  it('a non-applied scale leaves `drawnRadius` exactly where it was', () => {
    for (const bad of [0, -1, NaN, Infinity, '2', null]) {
      const [out] = applyGlyphOverrides([base], byAnchor([['a0', { ref: 'a0', scale: bad }]]));
      expect(out.drawnRadius).toBe(20);
    }
  });

  it('ignores a non-positive or non-finite scale (never vanish, never invert)', () => {
    for (const bad of [0, -1, NaN, Infinity, '2', null]) {
      const out = applyGlyphOverrides([base], byAnchor([['a0', { ref: 'a0', scale: bad }]]));
      expect(out[0].radius).toBe(20);
      expect(out[0].scale).toBe(2);
    }
  });
});

describe('applyGlyphOverrides — angle', () => {
  const base = {
    anchorId: 'a0', role: 'edge', index: 0, x: 0, y: 0, rotation: 137.5, scale: 1, radius: 10,
    packedRadius: 10, drawnRadius: 10, neighbourCap: Infinity, hardCap: 10,
    capBy: 'natural', saturated: false, capObstacle: null,
    seqId: 'A', flip: false,
  };

  it('REPLACES the resolved rotation with the absolute bearing', () => {
    const [out] = applyGlyphOverrides([base], byAnchor([['a0', { ref: 'a0', angle: 45 }]]));
    expect(out.rotation).toBe(45);
  });

  it('angle: 0 is a legitimate bearing, NOT "absent"', () => {
    const [out] = applyGlyphOverrides([base], byAnchor([['a0', { ref: 'a0', angle: 0 }]]));
    expect(out.rotation).toBe(0);
  });

  it('accepts a negative bearing verbatim (no normalization)', () => {
    const [out] = applyGlyphOverrides([base], byAnchor([['a0', { ref: 'a0', angle: -90 }]]));
    expect(out.rotation).toBe(-90);
  });

  it('leaves radius/scale untouched when the record carries no scale', () => {
    const [out] = applyGlyphOverrides([base], byAnchor([['a0', { ref: 'a0', angle: 45 }]]));
    expect(out.radius).toBe(10);
    expect(out.scale).toBe(1);
  });

  it('ignores a non-finite angle', () => {
    for (const bad of [NaN, Infinity, '45', null]) {
      const out = applyGlyphOverrides([base], byAnchor([['a0', { ref: 'a0', angle: bad }]]));
      expect(out[0].rotation).toBe(137.5);
    }
  });

  it('scale and angle compose on one record', () => {
    const [out] = applyGlyphOverrides([base], byAnchor([['a0', { ref: 'a0', scale: 3, angle: 10 }]]));
    expect(out.radius).toBeCloseTo(30, 10);
    expect(out.scale).toBeCloseTo(3, 10);
    expect(out.rotation).toBe(10);
  });

  it('flip rides through untouched (a separate renderer concern)', () => {
    const flipped = { ...base, flip: true };
    const [out] = applyGlyphOverrides([flipped], byAnchor([['a0', { ref: 'a0', scale: 2, angle: 0 }]]));
    expect(out.flip).toBe(true);
  });
});

// ── the world footprint centre follows the dial (#205, decision 1b) ─────────
//
// The reserve's world centre was computed at PACK TIME from the pack-time
// rotation. An angle override is the last thing that decides that rotation, so
// leaving `footprintCenter` where the packer put it misreports the glyph the
// moment the dial is dragged — the same argument the file already records for
// `drawnRadius` under a scale override.
//
// THE COMPOSITION, and why it needs no glyph. The engine emits
//     footprintCenter = P + packedRadius · u
//     u = R(θ − φ)·f̂c            unflipped
//     u = R(θ + φ)·(−f̂c.x, f̂c.y)  flipped,   φ = root.angle
// (`placementEngine.js:790`, ruling 7g). Replacing θ with θ′ gives
// `R(θ′ ∓ φ)·… = R(θ′ − θ)·u` in BOTH cases — φ and the mirror are already baked
// into the emitted vector and cancel out of the delta. So the recompute is a
// plain rotation of a world vector about `(x, y)` by `angle − rotation`, not a
// second copy of the 7g composition.
describe('applyGlyphOverrides — an angle override recomputes the world footprint centre', () => {
  // The reserve leans +x/−y off the anchor by (3, 4) — |offset| = 5, so a
  // direction change is observable and a magnitude change would be too.
  const base = {
    anchorId: 'a0', role: 'edge', index: 0, x: 100, y: 200, rotation: 0, scale: 1, radius: 10,
    packedRadius: 10, drawnRadius: 10, neighbourCap: 40, hardCap: 25,
    capBy: 'neighbour', saturated: false, capObstacle: { x: 140, y: 200, r: 12 },
    footprintCenter: { x: 103, y: 204 },
    seqId: 'A', flip: false,
  };

  it('rotates the emitted vector about (x, y) by `angle − rotation`', () => {
    const [out] = applyGlyphOverrides([base], byAnchor([['a0', { ref: 'a0', angle: 90 }]]));
    // (3, 4) turned +90° in the engine's own convention
    // (`x·cos − y·sin`, `x·sin + y·cos`) is (−4, 3).
    expect(out.footprintCenter.x).toBeCloseTo(96, 10);
    expect(out.footprintCenter.y).toBeCloseTo(203, 10);
  });

  it('the delta is `angle − rotation`, not the absolute bearing', () => {
    // Pack-time rotation 30, dial to 120 ⇒ a +90° turn of the SAME offset.
    const at30 = { ...base, rotation: 30, footprintCenter: { x: 103, y: 204 } };
    const [out] = applyGlyphOverrides([at30], byAnchor([['a0', { ref: 'a0', angle: 120 }]]));
    expect(out.footprintCenter.x).toBeCloseTo(96, 10);
    expect(out.footprintCenter.y).toBeCloseTo(203, 10);
  });

  it('an angle changes DIRECTION only — the magnitude is preserved', () => {
    const mag = (p) => Math.hypot(p.footprintCenter.x - p.x, p.footprintCenter.y - p.y);
    for (const angle of [-137.5, -1, 0, 17, 90, 233.75, 360]) {
      const [out] = applyGlyphOverrides([base], byAnchor([['a0', { ref: 'a0', angle }]]));
      expect(mag(out)).toBeCloseTo(5, 10);
    }
  });

  it('an angle equal to the pack-time rotation is a BIT-IDENTICAL no-op', () => {
    const at30 = { ...base, rotation: 30 };
    const [out] = applyGlyphOverrides([at30], byAnchor([['a0', { ref: 'a0', angle: 30 }]]));
    // Not `toEqual` — the same object, so there is no float round-trip at all.
    expect(out.footprintCenter).toBe(at30.footprintCenter);
    expect(out.rotation).toBe(30);
  });

  it('leaves `packedRadius` and EVERY cap untouched — the reserve genuinely did not move', () => {
    const [out] = applyGlyphOverrides([base], byAnchor([['a0', { ref: 'a0', angle: 90 }]]));
    expect(out.packedRadius).toBe(10);
    expect(out.neighbourCap).toBe(40);
    expect(out.hardCap).toBe(25);
    expect(out.capBy).toBe('neighbour');
    expect(out.saturated).toBe(false);
    expect(out.capObstacle).toEqual({ x: 140, y: 200, r: 12 });
  });

  it('a SCALE override does not move the centre — it is stated at `packedRadius`', () => {
    // `placementEngine.js:220` rules this outright: a scale override leaves
    // `packedRadius` alone, "so this key needs no rescale there, only the angle
    // recompute #205 adds". The drawn ring is one homothety away
    // (`P + (R/packedRadius)·(footprintCenter − P)`), so it tracks scale without
    // the stored centre moving.
    const [out] = applyGlyphOverrides([base], byAnchor([['a0', { ref: 'a0', scale: 2 }]]));
    expect(out.footprintCenter).toBe(base.footprintCenter);
    expect(out.drawnRadius).toBe(20);
  });

  it('a non-applied angle leaves the centre exactly where it was', () => {
    for (const bad of [NaN, Infinity, '45', null]) {
      const [out] = applyGlyphOverrides([base], byAnchor([['a0', { ref: 'a0', angle: bad }]]));
      expect(out.footprintCenter).toBe(base.footprintCenter);
    }
  });

  it('an ABSENT `footprintCenter` stays absent — no key is invented, nothing throws', () => {
    // The engine always emits the key, but `applyGlyphOverrides` is also called
    // with hand-built placements (the overlay's fixtures, footprintScope's).
    // Adding `{x: NaN, y: NaN}` would break the same key-presence discipline the
    // module already states for `glyphRef`.
    const { footprintCenter: _omitted, ...bare } = base;
    const [out] = applyGlyphOverrides([bare], byAnchor([['a0', { ref: 'a0', angle: 90, scale: 2 }]]));
    expect('footprintCenter' in out).toBe(false);
    expect(out.rotation).toBe(90);
    expect(out.radius).toBe(20);
  });

  it('never mutates the input placement’s centre object', () => {
    const input = [{ ...base, footprintCenter: { ...base.footprintCenter } }];
    const snapshot = structuredClone(input);
    applyGlyphOverrides(input, byAnchor([['a0', { ref: 'a0', angle: 90 }]]));
    expect(input).toEqual(snapshot);
  });
});

// ── the differential test: the recompute AGREES WITH THE ENGINE ─────────────
//
// A hand-written rotation test passes just as happily with an inverted sine,
// because the fixture encodes the same sign the implementation does. So run the
// engine's tight arm at θ, run it again at θ′, and assert the override of the
// θ-run reproduces the θ′-run's emitted centre. A non-zero `root.angle` and a
// flipped placement make it prove the φ/mirror cancellation empirically.
describe('an angle override reproduces the engine’s own tight-arm centre', () => {
  // Synthetic — every shipped glyph is `root.angle: 0`, which cannot exercise φ.
  const SYNTH = {
    id: 'synthHook',
    name: 'synth hook',
    tradition: 'test',
    paths: [{ d: 'M 0 0 L 1 0', op: 'engrave' }],
    viewRadius: 12,
    footprintCenter: { x: 5, y: -3 },
    footprintRadius: 8,
    root: { x: 0, y: 0, angle: 37 },
  };

  const BOUNDARY = { type: 'rect', width: 1000, height: 1000 };
  const PAGE = (offset) => ({ policy: 'page', useNormal: false, offset, perRole: {} });
  const TIGHT = { mode: 'proportional', size: 20, min: 0, margin: 0.85, footprint: 'tight' };

  // Two anchors 600 apart in a 1000×1000 boundary: neither the boundary nor the
  // neighbour binds, so `packedRadius === naturalTarget` and is ROTATION-FREE.
  // That matters — under the tight law the reserve turns, so a binding cap would
  // itself move with θ and confound the comparison.
  const anchors = [mkAnchor('a0', 'edge', 200, 500), mkAnchor('a1', 'edge', 800, 500)];

  const runAt = (offset) =>
    resolvePlacements(
      anchors,
      { orientation: PAGE(offset), sizing: TIGHT, flip: true, jitter: { seed: 1, lateral: 0, along: 0, rotation: 0, scale: 0 } },
      { boundary: BOUNDARY, glyph: SYNTH },
    ).placements;

  it.each([
    ['unflipped', 'a0', false],
    ['flipped', 'a1', true],
  ])('%s — overriding θ→θ′ lands on the engine’s θ′ centre', (_name, anchorId, expectFlip) => {
    const from = runAt(0);
    const to = runAt(55);
    const p0 = findPlacement(from, anchorId);
    const p1 = findPlacement(to, anchorId);

    // Guard the scenario: the offset is real, flip is what the case claims, and
    // the reserve did NOT resize between the two runs.
    expect(p0.flip).toBe(expectFlip);
    expect(p0.packedRadius).toBeCloseTo(p1.packedRadius, 12);
    expect(Math.hypot(p0.footprintCenter.x - p0.x, p0.footprintCenter.y - p0.y)).toBeGreaterThan(1);

    const [out] = applyGlyphOverrides([p0], byAnchor([[anchorId, { ref: anchorId, angle: 55 }]]));
    expect(out.footprintCenter.x).toBeCloseTo(p1.footprintCenter.x, 10);
    expect(out.footprintCenter.y).toBeCloseTo(p1.footprintCenter.y, 10);
  });

  it('the glyph’s growth turn is genuinely engaged (φ ≠ 0 changes the emitted centre)', () => {
    // Without this, the differential above would pass on an implementation that
    // silently ignored `root.angle` — because the recompute ignores it too.
    const straight = resolvePlacements(
      anchors,
      { orientation: PAGE(0), sizing: TIGHT, jitter: { seed: 1, lateral: 0, along: 0, rotation: 0, scale: 0 } },
      { boundary: BOUNDARY, glyph: { ...SYNTH, root: { x: 0, y: 0, angle: 0 } } },
    ).placements;
    const turned = findPlacement(runAt(0), 'a0');
    const flat = findPlacement(straight, 'a0');
    expect(turned.footprintCenter.x).not.toBeCloseTo(flat.footprintCenter.x, 3);
  });
});

// ── resolvePlacements — the cascade, packing, and key-shape discipline ──────
describe('resolvePlacements — per-glyph scale multiplies the FULL cascade', () => {
  const anchors = [mkAnchor('a0', 'edge', 0, 0), mkAnchor('a1', 'edge', 200, 0)];
  // Jitter scale ON (so scaleFactor !== 1) and a Sequencer slot with sizeScale
  // 2 — all three cascade levels present before the per-glyph 4th.
  const config = fixedConfig({
    jitter: { seed: 11, lateral: 0, along: 0, rotation: 20, rotationRange: 3, scale: 1, scaleRange: 0.4 },
    sequence: {
      type: 'sequence',
      mode: 'cycle',
      continuous: true,
      seed: 5,
      slots: [{ glyphRef: 'leaf', sizeScale: 2, rotationOffset: 15 }],
    },
  });

  it('radius = size × scaleFactor × sizeScale × glyphScale (4th level, pure multiplier)', () => {
    const { placements: baseline } = resolvePlacements(anchors, config, {});
    const { placements: scaled } = resolvePlacements(anchors, config, {
      overrideRecords: byAnchor([['a0', { ref: 'a0', scale: 1.5 }]]),
    });

    const b0 = findPlacement(baseline, 'a0');
    const s0 = findPlacement(scaled, 'a0');

    // Guard the scenario: jitter AND the slot sizeScale genuinely engaged, so
    // the multiplication is layered on top of a non-trivial cascade.
    expect(b0.radius).toBeGreaterThan(0);
    expect(b0.radius).not.toBeCloseTo(SIZE * 2, 6); // jitter moved it off size×sizeScale
    expect(b0.radius).toBeGreaterThan(SIZE); // sizeScale=2 engaged

    // Pin the THIRD cascade level independently of the fourth: the ratio
    // assertions below are baseline-relative, so if `sizeScale` silently stopped
    // being applied they would ALL still pass. Re-run the identical config with
    // sizeScale 1 and assert the slot factor is genuinely a 2× on the radius.
    const noSlotScale = {
      ...config,
      sequence: { ...config.sequence, slots: [{ glyphRef: 'leaf', sizeScale: 1, rotationOffset: 15 }] },
    };
    const { placements: flat } = resolvePlacements(anchors, noSlotScale, {});
    expect(b0.radius).toBeCloseTo(findPlacement(flat, 'a0').radius * 2, 10);

    expect(s0.radius).toBeCloseTo(b0.radius * 1.5, 10);
    expect(s0.scale).toBeCloseTo(b0.scale * 1.5, 10);
    expect(s0.scale).toBeCloseTo(s0.radius / SIZE, 10);
  });

  it('an un-overridden neighbour is byte-identical to the baseline run', () => {
    const { placements: baseline } = resolvePlacements(anchors, config, {});
    const { placements: scaled } = resolvePlacements(anchors, config, {
      overrideRecords: byAnchor([['a0', { ref: 'a0', scale: 1.5 }]]),
    });
    expect(findPlacement(scaled, 'a1')).toEqual(findPlacement(baseline, 'a1'));
  });

  it('no overrideRecords ⇒ output deep-equals the pre-override pipeline (incl. glyphRef presence)', () => {
    const { placements: withOpt } = resolvePlacements(anchors, config, { overrideRecords: new Map() });
    const { placements: without } = resolvePlacements(anchors, config, {});
    expect(withOpt).toEqual(without);
    // `glyphRef` is present IFF sequenced — the key-presence discipline must
    // survive the override pass (an accidental `glyphRef: undefined` leak on an
    // unsequenced placement would break per-instance glyph resolution).
    expect('glyphRef' in without[0]).toBe(true);

    const unseqConfig = fixedConfig();
    const { placements: unseq } = resolvePlacements(anchors, unseqConfig, {
      overrideRecords: byAnchor([['a0', { ref: 'a0', scale: 2, angle: 5 }]]),
    });
    expect('glyphRef' in unseq[0]).toBe(false);
    expect(Object.keys(unseq[0]).sort()).toEqual(
      Object.keys(resolvePlacements(anchors, unseqConfig, {}).placements[0]).sort(),
    );
  });
});

describe('resolvePlacements — per-glyph angle is an ABSOLUTE bearing', () => {
  const anchors = [mkAnchor('a0', 'edge', 0, 0), mkAnchor('a1', 'edge', 200, 0)];
  const config = fixedConfig({
    orientation: { policy: 'path', useNormal: true, offset: 37 },
    jitter: { seed: 3, lateral: 0, along: 0, rotation: 10, rotationRange: 5, scale: 0 },
  });

  it('replaces the resolved baseDeg + offset (+ jitter) wholesale', () => {
    const { placements: baseline } = resolvePlacements(anchors, config, {});
    const b0 = findPlacement(baseline, 'a0');
    // Guard: the resolved rotation is genuinely non-zero and non-trivial.
    expect(b0.rotation).not.toBeCloseTo(0, 6);
    expect(b0.rotation).not.toBeCloseTo(90, 6);

    const { placements } = resolvePlacements(anchors, config, {
      overrideRecords: byAnchor([['a0', { ref: 'a0', angle: 90 }]]),
    });
    expect(findPlacement(placements, 'a0').rotation).toBe(90);
    // An anchor with no record at all keeps its resolved rotation.
    expect(findPlacement(placements, 'a1').rotation).toBe(findPlacement(baseline, 'a1').rotation);
  });

  it('a scale-only record leaves the resolved rotation exactly as placed', () => {
    const { placements: baseline } = resolvePlacements(anchors, config, {});
    const { placements } = resolvePlacements(anchors, config, {
      overrideRecords: byAnchor([['a0', { ref: 'a0', scale: 2 }]]),
    });
    expect(findPlacement(placements, 'a0').rotation).toBe(findPlacement(baseline, 'a0').rotation);
  });
});

describe('resolvePlacements — packing and survivorship are UNTOUCHED', () => {
  // Two anchors 25px apart, fixed radius 10 each: both fit (25 >= 10+10).
  const anchors = [mkAnchor('a0', 'edge', 0, 0), mkAnchor('a1', 'edge', 25, 0)];
  const config = fixedConfig();

  it('a scaled-up glyph overlaps its neighbour — accepted, never evicted or re-packed', () => {
    const { placements: baseline } = resolvePlacements(anchors, config, {});
    expect(baseline).toHaveLength(2);

    const { placements, rejected } = resolvePlacements(anchors, config, {
      overrideRecords: byAnchor([['a0', { ref: 'a0', scale: 3 }]]),
    });

    expect(placements).toHaveLength(2);
    expect(rejected).toHaveLength(0);
    // a0 grew to 30 — its footprint now swallows a1's centre.
    expect(findPlacement(placements, 'a0').radius).toBeCloseTo(30, 10);
    // a1 is exactly where the un-overridden packing put it: packing ran against
    // the ORIGINAL footprint and was not re-run.
    expect(findPlacement(placements, 'a1')).toEqual(findPlacement(baseline, 'a1'));
    const gap = Math.hypot(
      findPlacement(placements, 'a0').x - findPlacement(placements, 'a1').x,
      findPlacement(placements, 'a0').y - findPlacement(placements, 'a1').y,
    );
    expect(gap).toBeLessThan(
      findPlacement(placements, 'a0').radius + findPlacement(placements, 'a1').radius,
    ); // genuinely overlapping ⇒ the scenario has teeth
  });

  it('the below-floor rejection is decided on the UN-overridden radius', () => {
    // size 10 < min 12 ⇒ rejected. A scale-5 override must not resurrect it.
    const tooSmall = fixedConfig({ sizing: { mode: 'fixed', size: SIZE, min: 12, margin: 1 } });
    const { placements, rejected } = resolvePlacements(anchors, tooSmall, {
      overrideRecords: byAnchor([
        ['a0', { ref: 'a0', scale: 5 }],
        ['a1', { ref: 'a1', scale: 5 }],
      ]),
    });
    expect(placements).toHaveLength(0);
    expect(rejected.map((r) => r.reason)).toEqual(['below-floor', 'below-floor']);
  });

  it('a shrinking override never drops a placement below the floor', () => {
    const withFloor = fixedConfig({ sizing: { mode: 'fixed', size: SIZE, min: 8, margin: 1 } });
    const { placements } = resolvePlacements(anchors, withFloor, {
      overrideRecords: byAnchor([['a0', { ref: 'a0', scale: 0.1 }]]),
    });
    expect(placements).toHaveLength(2);
    expect(findPlacement(placements, 'a0').radius).toBeCloseTo(1, 10); // below min, still placed
  });

  it('an override never resurrects a hidden glyph nor hides a visible one', () => {
    // `hidden` is survivorship — settled in #136 and applied during SELECTION.
    // The post-placement pass must be blind to it.
    const { placements } = resolvePlacements(anchors, config, {
      overrideRecords: byAnchor([
        ['a0', { ref: 'a0', hidden: true, scale: 2 }],
        ['a1', { ref: 'a1', hidden: false }],
      ]),
    });
    expect(placements.map((p) => p.anchorId)).toEqual(['a0', 'a1']);
    expect(findPlacement(placements, 'a0').radius).toBeCloseTo(20, 10);
  });
});

// ── the resolution seam reaches the placement stage on BOTH binding shapes ──
describe('override records reach the placement stage', () => {
  const anchors = [mkAnchor('a0', 'edge', 0, 0), mkAnchor('a1', 'edge', 200, 0)];

  it('runSelectionChain surfaces the resolved records keyed by anchor id', () => {
    const res = runSelectionChain(anchors, [], {
      overrides: { records: [{ ref: 'a1', scale: 2, angle: 15 }] },
    });
    expect(res.overrideRecords).toBeInstanceOf(Map);
    expect(res.overrideRecords.get('a1')).toEqual({ ref: 'a1', scale: 2, angle: 15 });
    expect(res.overrideRecords.has('a0')).toBe(false);
  });

  it('runSelectionChain resolves a SPATIAL ref through the same rebind rule', () => {
    const res = runSelectionChain(anchors, [], {
      overrides: { records: [{ ref: { x: 3, y: 0, role: 'edge' }, scale: 2 }] },
    });
    expect(res.overrideRecords.get('a0')).toBeTruthy();
  });

  it('selectAnchors surfaces the same map (legacy fixed-pipeline path)', () => {
    const res = selectAnchors(anchors, { overrides: { records: [{ ref: 'a0', angle: 42 }] } });
    expect(res.overrideRecords.get('a0')).toEqual({ ref: 'a0', angle: 42 });
  });

  it('resolveSelection surfaces records compiled out of a LEGACY binding.selection', () => {
    const binding = { selection: { overrides: { records: [{ ref: 'a0', scale: 3 }] } } };
    const res = resolveSelection(binding, anchors, {});
    expect(res.overrideRecords.get('a0')).toEqual({ ref: 'a0', scale: 3 });
  });

  it('placeMotifs applies them end-to-end without any caller wiring', () => {
    const binding = {
      selection: { overrides: { records: [{ ref: 'a0', scale: 2, angle: 0 }] } },
      placement: fixedConfig(),
    };
    const { placements } = placeMotifs(anchors, binding, {});
    expect(findPlacement(placements, 'a0').radius).toBeCloseTo(20, 10);
    expect(findPlacement(placements, 'a0').rotation).toBe(0);
    expect(findPlacement(placements, 'a1').radius).toBeCloseTo(10, 10);
  });
});

// ── host-kind indifference ──────────────────────────────────────────────────
// The override is indifferent to HOW baseDeg was derived. Two fixtures standing
// in for two host families: a semantic GRID host (role 'crossing', normal-derived
// bearing) and a VINE/Branch host (role 'tip', tangent-derived bearing).
describe('per-glyph overrides hold across host kinds', () => {
  const gridAnchors = [
    mkAnchor('crossing:1:1', 'crossing', 40, 40, { tangent: 0, normal: Math.PI / 3 }),
    mkAnchor('crossing:2:1', 'crossing', 140, 40, { tangent: 0, normal: Math.PI / 3 }),
  ];
  const vineAnchors = [
    mkAnchor('tip:0', 'tip', 10, 10, { tangent: Math.PI / 4, normal: Math.PI / 4 + Math.PI / 2 }),
    mkAnchor('tip:1', 'tip', 110, 10, { tangent: -Math.PI / 6, normal: -Math.PI / 6 + Math.PI / 2 }),
  ];

  const cases = [
    { name: 'grid (semantic crossing, normal-derived bearing)', anchors: gridAnchors, useNormal: true, id: 'crossing:1:1' },
    { name: 'vine / Branch (tip, tangent-derived bearing)', anchors: vineAnchors, useNormal: false, id: 'tip:0' },
  ];

  for (const { name, anchors, useNormal, id } of cases) {
    it(`${name}: absolute angle wins and scale multiplies`, () => {
      const binding = {
        selection: { overrides: { records: [{ ref: id, scale: 2.5, angle: 12 }] } },
        placement: fixedConfig({ orientation: { policy: 'path', useNormal, offset: 0 } }),
      };
      const baselineBinding = { placement: binding.placement };

      const base = placeMotifs(anchors, baselineBinding, {}).placements;
      const overridden = placeMotifs(anchors, binding, {}).placements;

      const b = findPlacement(base, id);
      const o = findPlacement(overridden, id);
      // Guard: the host's own bearing is non-zero, so replacing it is observable.
      expect(b.rotation).not.toBeCloseTo(12, 6);
      expect(o.rotation).toBe(12);
      expect(o.radius).toBeCloseTo(b.radius * 2.5, 10);
      expect(o.scale).toBeCloseTo(b.scale * 2.5, 10);
      // The other anchor on the same host is untouched.
      expect(overridden[1]).toEqual(base[1]);
    });
  }
});

// ── MotifPattern: canvas, SVG export and thumbnails share ONE matrix ────────
const W = 800;
const H = 600;
const DIAGONAL_HOST = [{ points: [{ x: 100, y: 100 }, { x: 300, y: 300 }], closed: false }];

const svgMatrices = (svgElements) =>
  svgElements.map((el) => el.match(/matrix\(([^)]+)\)/)[1].trim().split(/\s+/).map(Number));

// Reconstruct one polyline per beginShape/endShape span from recorded vertices.
function canvasPolylines(calls) {
  const polys = [];
  let cur = null;
  for (const { op, args } of calls) {
    if (op === 'beginShape') cur = [];
    else if (op === 'vertex' && cur) cur.push([args[0], args[1]]);
    else if (op === 'endShape') {
      if (cur) polys.push(cur);
      cur = null;
    }
  }
  return polys;
}

const bboxDiag = (poly) => {
  const xs = poly.map((p) => p[0]);
  const ys = poly.map((p) => p[1]);
  return Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
};

function runMotif(params) {
  const inst = new MotifPattern();
  const ctx = new RecordingContext({ seed: 1 });
  inst.generateWithContext(ctx, 7, params, W, H, '#123456', 100);
  return { inst, ctx };
}

describe('MotifPattern — overrides reach canvas, SVG export and thumbnails alike', () => {
  const edgeOpts = { count: 2 };
  const hostAnchors = sampleEdgeAnchors(DIAGONAL_HOST, edgeOpts);

  const params = (binding) => ({
    glyphRef: 'leaf',
    hostPaths: DIAGONAL_HOST,
    binding,
    anchorMode: 'edge',
    edgeOpts,
  });

  it('a chain-form binding.overrides scale reaches the single per-instance matrix', () => {
    expect(hostAnchors.length).toBe(2);
    const targetId = hostAnchors[0].id;

    const baseline = runMotif(params({ chain: [] }));
    const scaled = runMotif(
      params({ chain: [], overrides: { records: [{ ref: targetId, scale: 2 }] } }),
    );

    expect(baseline.inst.svgElements).toHaveLength(2);
    expect(scaled.inst.svgElements).toHaveLength(2);

    const mB = svgMatrices(baseline.inst.svgElements);
    const mS = svgMatrices(scaled.inst.svgElements);
    // |scale| of an SVG matrix's linear part = hypot of its first column.
    // Tolerance is 4dp because matrixToSVG serialises at 6 decimal places —
    // this compares SERIALISED matrices, so it can't be tighter than that.
    const mag = (m) => Math.hypot(m[0], m[1]);
    expect(mag(mS[0]) / mag(mB[0])).toBeCloseTo(2, 4);
    expect(mag(mS[1]) / mag(mB[1])).toBeCloseTo(1, 4); // neighbour untouched

    // Canvas: the pre-transformed absolute vertices grew by the same factor.
    const cB = canvasPolylines(baseline.ctx.calls);
    const cS = canvasPolylines(scaled.ctx.calls);
    expect(cS.length).toBe(cB.length);
    expect(bboxDiag(cS[0]) / bboxDiag(cB[0])).toBeCloseTo(2, 4);
    expect(bboxDiag(cS[cS.length - 1]) / bboxDiag(cB[cB.length - 1])).toBeCloseTo(1, 4);

    // SVG export re-runs nothing: toSVGGroup emits the same overridden matrices,
    // which is also exactly what the thumbnail path serialises.
    const group = scaled.inst.toSVGGroup('layer-1', '#000000', 100);
    for (const el of scaled.inst.svgElements) expect(group).toContain(el);
    expect(svgMatrices(scaled.inst.svgElements)).toEqual(mS);
  });

  it('an absolute angle override rotates the instance to that bearing', () => {
    const targetId = hostAnchors[0].id;
    const at0 = runMotif(
      params({ chain: [], overrides: { records: [{ ref: targetId, angle: 0 }] } }),
    );
    const at90 = runMotif(
      params({ chain: [], overrides: { records: [{ ref: targetId, angle: 90 }] } }),
    );

    const [a0] = svgMatrices(at0.inst.svgElements);
    const [a90] = svgMatrices(at90.inst.svgElements);
    const bearing = (m) => (Math.atan2(m[1], m[0]) * 180) / Math.PI;
    let delta = bearing(a90) - bearing(a0);
    delta = ((delta % 360) + 360) % 360;
    expect(delta).toBeCloseTo(90, 4);
  });

  it('a LEGACY binding.selection.overrides record reaches the same seam', () => {
    const targetId = hostAnchors[0].id;
    const baseline = runMotif(params({}));
    const scaled = runMotif(
      params({ selection: { overrides: { records: [{ ref: targetId, scale: 3 }] } } }),
    );
    const mag = (m) => Math.hypot(m[0], m[1]);
    expect(mag(svgMatrices(scaled.inst.svgElements)[0]) / mag(svgMatrices(baseline.inst.svgElements)[0]))
      .toBeCloseTo(3, 4); // 4dp: matrixToSVG serialises at 6 decimal places
  });

  it('the Trace overlay positions carry the overridden radius', () => {
    const targetId = hostAnchors[0].id;
    const baseline = runMotif(params({ chain: [] }));
    const scaled = runMotif(
      params({ chain: [], overrides: { records: [{ ref: targetId, scale: 2 }] } }),
    );
    expect(scaled.inst.lastPlacementPositions[0].radius).toBeCloseTo(
      baseline.inst.lastPlacementPositions[0].radius * 2,
      10,
    );
  });

  it('no overrides ⇒ svgElements byte-identical to the pre-override pipeline', () => {
    const a = runMotif(params({ chain: [] }));
    const b = runMotif(params({ chain: [], overrides: { records: [] } }));
    expect(b.inst.svgElements).toEqual(a.inst.svgElements);
  });
});
