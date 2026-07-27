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
    { anchorId: 'a0', role: 'edge', index: 0, x: 0, y: 0, rotation: 30, scale: 1, radius: 10, seqId: 'A', flip: false },
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
    const snapshot = JSON.parse(JSON.stringify(input));
    applyGlyphOverrides(input, byAnchor([['a0', { ref: 'a0', scale: 4, angle: 12 }]]));
    expect(input).toEqual(snapshot);
  });
});

describe('applyGlyphOverrides — scale', () => {
  const base = { anchorId: 'a0', role: 'edge', index: 0, x: 0, y: 0, rotation: 30, scale: 2, radius: 20, seqId: 'A', flip: false };

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

  it('ignores a non-positive or non-finite scale (never vanish, never invert)', () => {
    for (const bad of [0, -1, NaN, Infinity, '2', null]) {
      const out = applyGlyphOverrides([base], byAnchor([['a0', { ref: 'a0', scale: bad }]]));
      expect(out[0].radius).toBe(20);
      expect(out[0].scale).toBe(2);
    }
  });
});

describe('applyGlyphOverrides — angle', () => {
  const base = { anchorId: 'a0', role: 'edge', index: 0, x: 0, y: 0, rotation: 137.5, scale: 1, radius: 10, seqId: 'A', flip: false };

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
