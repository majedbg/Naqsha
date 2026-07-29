import { describe, it, expect } from 'vitest';
import { resolvePlacements, PLACEMENT_DEFAULTS } from './placementEngine.js';
import { dealSlots } from './sequencer.js';
import { MOTIF_GLYPHS } from './glyphs.js';

// ── T1 — the POSITIONAL normal offset + the independent SIDE 2-cycle ────────
//
// `orientation.offset` has always been rotation DEGREES; nothing in the engine
// could push a glyph OFF the host spine. `orientation.normalOffset` (canvas px)
// does, along `anchor.normal`, and `side` (+1 / -1 / 0) picks which way.
//
// THE DESIGN UNDER TEST (docs/vine-scaffolds-PLAN.md T1):
//   • `side` is NOT derived from `flip`. `flip` mirrors the glyph TEMPLATE;
//     `side` picks which side of the spine it is DISPLACED to. Both
//     "alternating sides, same orientation" and "same side, mirrored glyphs"
//     must be expressible — the four-combination block below is that claim.
//   • Each has its OWN legacy 2-cycle (`cfg.flip` / `cfg.sideAlternate`) and its
//     OWN per-slot override (`slot.flip` / `slot.side`), gated by its OWN
//     `*Specified` flag. A slot stating one must NOT suppress the other's cycle.
//   • Offset 0 / absent is byte-identical to the pre-T1 engine.

// --- helpers -------------------------------------------------------------
// A row of anchors whose normal points along +y (normal = 90°) and tangent
// along +x, so a positive `normalOffset` moves the glyph DOWN the canvas by
// exactly that many pixels and every expectation below is plain arithmetic.
const HALF_PI = Math.PI / 2;

function at(id, x, y, extra = {}) {
  return {
    id,
    role: 'edge',
    x,
    y,
    tangent: 0,
    normal: HALF_PI,
    s: 0,
    meta: { pathIndex: 0 },
    ...extra,
  };
}

// Far apart so the greedy empty-circle packer never caps anything — this suite
// is about POSITION, and a neighbour cap would confound it.
const row = (n, gap = 400) => Array.from({ length: n }, (_, i) => at(`a${i}`, 100 + i * gap, 500));

const NO_JITTER = { seed: 1, lateral: 0, along: 0, rotation: 0, scale: 0 };
const FIXED = { mode: 'fixed', size: 10, min: 0, margin: 1 };

const base = (extra = {}) => ({ jitter: NO_JITTER, sizing: FIXED, ...extra });

// `y` is the only coordinate the offset can move here (normal = +y).
const ys = (placements) => placements.map((p) => p.y);
const xs = (placements) => placements.map((p) => p.x);

// A sequence block whose slots are dealt in strict positional order.
const seq = (slots) => ({ type: 'sequence', mode: 'cycle', continuous: true, seed: 1, slots });

describe('T1 — positional normal offset', () => {
  describe('acceptance 1: zero/absent offset is the pre-T1 engine', () => {
    it('absent normalOffset leaves every placement at the anchor', () => {
      const { placements } = resolvePlacements(row(4), base());
      expect(ys(placements)).toEqual([500, 500, 500, 500]);
      expect(xs(placements)).toEqual([100, 500, 900, 1300]);
    });

    it('normalOffset 0 is byte-identical to absent — including the sign of zero', () => {
      const anchors = row(4);
      const without = resolvePlacements(anchors, base()).placements;
      const with0 = resolvePlacements(
        anchors,
        base({ orientation: { policy: 'path', useNormal: true, normalOffset: 0 } })
      ).placements;
      // toEqual is not enough: `-0` and `0` are toEqual-equal but not the same
      // double, and the whole `lateralTotal` ternary exists to protect that.
      without.forEach((p, i) => {
        expect(Object.is(with0[i].x, p.x)).toBe(true);
        expect(Object.is(with0[i].y, p.y)).toBe(true);
      });
      expect(with0).toEqual(without);
    });

    it('sideAlternate alone (no offset) changes nothing at all', () => {
      const anchors = row(6);
      const off = resolvePlacements(anchors, base()).placements;
      const on = resolvePlacements(anchors, base({ sideAlternate: true })).placements;
      on.forEach((p, i) => {
        expect(Object.is(p.x, off[i].x)).toBe(true);
        expect(Object.is(p.y, off[i].y)).toBe(true);
      });
    });

    it('a non-finite normalOffset reads as 0 rather than poisoning x/y with NaN', () => {
      for (const bad of [null, NaN, Infinity, '12', undefined]) {
        const { placements } = resolvePlacements(
          row(2),
          base({ orientation: { policy: 'path', useNormal: true, normalOffset: bad } })
        );
        expect(ys(placements)).toEqual([500, 500]);
      }
    });

    it('the Placement shape gains no `side` key — side is baked into x/y', () => {
      const { placements } = resolvePlacements(
        row(2),
        base({ sideAlternate: true, orientation: { normalOffset: 30 } })
      );
      expect('side' in placements[0]).toBe(false);
      expect('flip' in placements[0]).toBe(true);
    });

    it('PLACEMENT_DEFAULTS documents the new fields at their inert values', () => {
      expect(PLACEMENT_DEFAULTS.sideAlternate).toBe(false);
      expect(PLACEMENT_DEFAULTS.orientation.normalOffset).toBe(0);
    });
  });

  describe('acceptance 2: a non-zero offset displaces along anchor.normal', () => {
    it('pushes every glyph one offset along the normal', () => {
      const { placements } = resolvePlacements(
        row(3),
        base({ orientation: { policy: 'path', useNormal: true, normalOffset: 40 } })
      );
      expect(ys(placements)).toEqual([540, 540, 540]);
      // The TANGENT coordinate is untouched — this is a normal displacement.
      expect(xs(placements)).toEqual([100, 500, 900]);
    });

    it('a negative offset displaces the other way', () => {
      const { placements } = resolvePlacements(
        row(2),
        base({ orientation: { normalOffset: -25 } })
      );
      expect(ys(placements)).toEqual([475, 475]);
    });

    it('follows a rotated normal, not the y-axis', () => {
      // normal = 0 ⇒ the offset rides +x instead.
      const anchors = [{ ...at('a0', 100, 500), normal: 0 }];
      const { placements } = resolvePlacements(anchors, base({ orientation: { normalOffset: 40 } }));
      expect(placements[0].x).toBeCloseTo(140, 9);
      expect(placements[0].y).toBeCloseTo(500, 9);
    });

    it('composes ADDITIVELY with the lateral jitter — one shared coefficient', () => {
      const anchors = row(3);
      const cfg = (extra) => ({
        sizing: FIXED,
        jitter: { seed: 7, lateral: 1, along: 0, rotation: 0, scale: 0, lateralRange: 12 },
        ...extra,
      });
      const jittered = resolvePlacements(anchors, cfg()).placements;
      const both = resolvePlacements(anchors, cfg({ orientation: { normalOffset: 40 } })).placements;
      // Same RNG stream (the offset draws nothing), so the difference is exactly
      // the offset on every glyph.
      both.forEach((p, i) => expect(p.y - jittered[i].y).toBeCloseTo(40, 9));
    });

    it('is per-role overridable through orientation.perRole', () => {
      const anchors = [at('t0', 100, 500, { role: 'tip' }), at('e0', 500, 500)];
      const { placements } = resolvePlacements(
        anchors,
        base({
          orientation: { normalOffset: 10, perRole: { tip: { normalOffset: 60 } } },
        })
      );
      expect(ys(placements)).toEqual([560, 510]);
    });
  });

  describe('acceptance 2b: downstream consumers see the displaced position', () => {
    it('the packer reserves at the DISPLACED centre, not the anchor', () => {
      // Two anchors 400px apart along the NORMAL, far enough that neither caps
      // the other. Turning `sideAlternate` on with a +100 offset walks them
      // TOWARDS each other to 200px — and the second glyph must shrink. It only
      // can if the packer solved against the DISPLACED centre; an anchor-centred
      // reserve would leave both at their natural size.
      const anchors = [at('a0', 100, 500), at('a1', 100, 900)];
      const cfg = (normalOffset, alternate) => ({
        jitter: NO_JITTER,
        sizing: { mode: 'proportional', size: 150, min: 0, margin: 1 },
        sideAlternate: alternate,
        orientation: { normalOffset },
      });
      const apart = resolvePlacements(anchors, cfg(0, false)).placements;
      expect(apart.map((p) => p.radius)).toEqual([150, 150]);

      const near = resolvePlacements(anchors, cfg(100, true)).placements;
      expect(near[0].y).toBe(600);
      expect(near[1].y).toBe(800);
      expect(near[0].radius).toBe(150);
      // 200px between the displaced centres, minus the first glyph's reserve.
      expect(near[1].radius).toBe(50);
    });

    it('footprintCenter tracks the displaced position under the root law', () => {
      const { placements } = resolvePlacements(row(1), base({ orientation: { normalOffset: 40 } }));
      expect(placements[0].footprintCenter).toEqual({ x: 100, y: 540 });
    });

    it('a hostRadius container sizes against the displaced centre', () => {
      // The `hostRadius` cap is a DISTANCE rule (`hostRadius - |centre - anchor|`),
      // so displacing the glyph must shrink it exactly as jitter already does.
      const anchors = [at('a0', 100, 500, { hostRadius: 100 })];
      const cfg = (normalOffset) => ({
        jitter: NO_JITTER,
        sizing: { mode: 'proportional', size: 500, min: 0, margin: 1 },
        orientation: { normalOffset },
      });
      expect(resolvePlacements(anchors, cfg(0)).placements[0].radius).toBe(100);
      expect(resolvePlacements(anchors, cfg(40)).placements[0].radius).toBe(60);
      // Displaced clean out of its container ⇒ a rejection, not a negative radius.
      const out = resolvePlacements(anchors, cfg(150));
      expect(out.placements).toEqual([]);
      expect(out.rejected[0]).toMatchObject({ anchorId: 'a0', reason: 'no-fit', y: 650 });
    });
  });

  // ── THE TIGHT ARM (#204) — the footprint law every NEW layer is born with ──
  //
  // The block above runs the LEGACY root law, where the reserve is trivially
  // `(P, R)` and "the packer saw the displaced centre" is nearly tautological.
  // `sizing.footprint: 'tight'` is what `starterChips.js` / `defaultBinding.js` /
  // `motifLayer.js` all stamp, and there the reserve is an OFFSET disc built from
  // the placement centre — so the offset has to reach it through a second seam.
  describe('acceptance 2c: the TIGHT footprint solve sees the displaced position', () => {
    const LEAF = MOTIF_GLYPHS.leaf;
    const FCX = LEAF.footprintCenter.x / LEAF.viewRadius;
    const FCY = LEAF.footprintCenter.y / LEAF.viewRadius;
    const BOUNDARY = { type: 'rect', width: 2000, height: 2000 };
    // `policy:'page'` pins rotation to 0, so `u = f̂c` with no cos/sin to model.
    const PAGE = { policy: 'page', useNormal: false, offset: 0, perRole: {} };
    const TIGHT = { mode: 'proportional', size: 120, min: 0, margin: 1, footprint: 'tight' };

    const tight = (anchors, { orientation, ...extra } = {}) =>
      resolvePlacements(
        anchors,
        { jitter: NO_JITTER, sizing: TIGHT, ...extra, orientation: { ...PAGE, ...orientation } },
        { boundary: BOUNDARY, glyph: LEAF }
      );

    it('builds the reserve from the DISPLACED centre, not from the anchor', () => {
      const anchors = [at('a0', 600, 600)];
      const { placements } = tight(anchors, { orientation: { normalOffset: 40 } });
      const p = placements[0];
      expect(p.y).toBe(640);
      // Ruling 6e: the committed disc is `P + packedRadius·f̂c`, and `P` is the
      // MOVED point. Anchoring it at 600 instead of 640 would be exactly the
      // "silent and green" failure #204's own header warns about.
      expect(p.footprintCenter.x).toBeCloseTo(p.x + p.packedRadius * FCX, 12);
      expect(p.footprintCenter.y).toBeCloseTo(p.y + p.packedRadius * FCY, 12);
      expect(p.footprintCenter.y).not.toBeCloseTo(600 + p.packedRadius * FCY, 6);
    });

    it('the tight NEIGHBOUR cap moves with the offset', () => {
      // `neighbourLimit(a, u, f̂r, rⱼ)` takes `a = {x − obstacle.x, …}` — the
      // displaced centre minus the committed disc. Walking two glyphs together
      // with `sideAlternate` must therefore bind harder here too.
      const anchors = [at('a0', 600, 400), at('a1', 600, 800)];
      const apart = tight(anchors).placements;
      const near = tight(anchors, {
        sideAlternate: true,
        orientation: { normalOffset: 170 },
      }).placements;
      expect(near[0].y).toBe(570);
      expect(near[1].y).toBe(630);
      expect(near[0].radius).toBe(apart[0].radius); // the first is never capped
      expect(near[1].radius).toBeLessThan(apart[1].radius);
    });

    it('offset 0 is byte-identical on the tight arm too', () => {
      const anchors = [at('a0', 600, 400), at('a1', 600, 800)];
      const without = tight(anchors).placements;
      const with0 = tight(anchors, { orientation: { normalOffset: 0 } }).placements;
      expect(with0).toEqual(without);
      with0.forEach((p, i) => {
        expect(Object.is(p.x, without[i].x)).toBe(true);
        expect(Object.is(p.y, without[i].y)).toBe(true);
        expect(Object.is(p.packedRadius, without[i].packedRadius)).toBe(true);
      });
    });
  });

  describe('acceptance 3: side and flip are independent — all four combinations', () => {
    // The layer-level 2-cycles. `normalOffset: 50`, normal along +y, so side +1
    // is y=550 and side -1 is y=450.
    const four = (flip, sideAlternate) =>
      resolvePlacements(
        row(4),
        base({ flip, sideAlternate, orientation: { normalOffset: 50 } })
      ).placements;

    it('neither: one side, one orientation', () => {
      const p = four(false, false);
      expect(ys(p)).toEqual([550, 550, 550, 550]);
      expect(p.map((q) => q.flip)).toEqual([false, false, false, false]);
    });

    it('ALTERNATING SIDES, SAME ORIENTATION — inexpressible if side came from flip', () => {
      const p = four(false, true);
      expect(ys(p)).toEqual([550, 450, 550, 450]);
      expect(p.map((q) => q.flip)).toEqual([false, false, false, false]);
    });

    it('SAME SIDE, MIRRORED GLYPHS — the other half of the claim', () => {
      const p = four(true, false);
      expect(ys(p)).toEqual([550, 550, 550, 550]);
      expect(p.map((q) => q.flip)).toEqual([false, true, false, true]);
    });

    it('both: the rinceau reading — alternating sides AND mirrored templates', () => {
      const p = four(true, true);
      expect(ys(p)).toEqual([550, 450, 550, 450]);
      expect(p.map((q) => q.flip)).toEqual([false, true, false, true]);
    });
  });

  describe('acceptance 3b: the per-slot channels are independently gated', () => {
    const withSlots = (slots, extra = {}) =>
      resolvePlacements(
        row(4),
        base({ sequence: seq(slots), orientation: { normalOffset: 50 }, ...extra })
      ).placements;

    it('slot `side` REPLACES the side 2-cycle', () => {
      // sideAlternate would give +,-,+,- ; the slots say -,-,+,+ .
      const p = withSlots([{ side: -1 }, { side: -1 }, { side: 1 }, { side: 1 }], {
        sideAlternate: true,
      });
      expect(ys(p)).toEqual([450, 450, 550, 550]);
    });

    it('slot `side: 0` parks a glyph ON the spine while its neighbours swing off', () => {
      const p = withSlots([{ side: 1 }, { side: 0 }, { side: -1 }, { side: 0 }]);
      expect(ys(p)).toEqual([550, 500, 450, 500]);
    });

    it('a slot specifying FLIP ONLY leaves the side 2-cycle running', () => {
      // THE REGRESSION THE PLAN PREDICTS: a 2-slot rinceau sequence stating
      // `flip:false` on both slots would silently kill alternation if side were
      // derived from flip.
      const p = withSlots([{ flip: false }, { flip: false }], { sideAlternate: true });
      expect(ys(p)).toEqual([550, 450, 550, 450]);
      expect(p.map((q) => q.flip)).toEqual([false, false, false, false]);
    });

    it('a slot specifying SIDE ONLY leaves the flip 2-cycle running', () => {
      const p = withSlots([{ side: -1 }, { side: -1 }], { flip: true });
      expect(ys(p)).toEqual([450, 450, 450, 450]);
      expect(p.map((q) => q.flip)).toEqual([false, true, false, true]);
    });

    it('an unspecified slot side falls back to the layer 2-cycle', () => {
      const p = withSlots([{ glyphRef: 'leaf' }, { glyphRef: 'bud' }], { sideAlternate: true });
      expect(ys(p)).toEqual([550, 450, 550, 450]);
    });

    it('a non-finite slot side is UNSPECIFIED, not side 0', () => {
      const p = withSlots([{ side: null }, { side: 'left' }], { sideAlternate: true });
      expect(ys(p)).toEqual([550, 450, 550, 450]);
    });

    it('a Rest neutralises side and stamps nothing', () => {
      const p = withSlots([{ side: -1 }, { rest: true }], { sideAlternate: true });
      expect(ys(p)).toEqual([450, 450]);
      expect(p.map((q) => q.anchorId)).toEqual(['a0', 'a2']);
    });
  });

  describe('acceptance 4: it works for edge anchors on any host', () => {
    it('rides each anchor’s own normal around a closed ring', () => {
      // Eight edge anchors on a circle of radius 200 with outward normals — the
      // shape every closed edge host emits. A uniform offset must grow the ring
      // to radius 240, not translate it.
      const R = 200;
      const anchors = Array.from({ length: 8 }, (_, i) => {
        const t = (i / 8) * Math.PI * 2;
        return {
          id: `e${i}`,
          role: 'edge',
          x: 600 + R * Math.cos(t),
          y: 600 + R * Math.sin(t),
          tangent: t + HALF_PI,
          normal: t,
          s: i,
          meta: { pathIndex: 0 },
        };
      });
      const { placements } = resolvePlacements(
        anchors,
        base({ orientation: { normalOffset: 40 } })
      );
      for (const p of placements) {
        expect(Math.hypot(p.x - 600, p.y - 600)).toBeCloseTo(240, 9);
      }
    });

    it('alternates inside/outside the ring under sideAlternate', () => {
      const R = 200;
      const anchors = Array.from({ length: 4 }, (_, i) => {
        const t = (i / 4) * Math.PI * 2;
        return {
          id: `e${i}`,
          role: 'edge',
          x: 600 + R * Math.cos(t),
          y: 600 + R * Math.sin(t),
          tangent: t + HALF_PI,
          normal: t,
          s: i,
          meta: { pathIndex: 0 },
        };
      });
      const { placements } = resolvePlacements(
        anchors,
        base({ sideAlternate: true, orientation: { normalOffset: 40 } })
      );
      const radii = placements.map((p) => Math.hypot(p.x - 600, p.y - 600));
      radii.forEach((r, i) => expect(r).toBeCloseTo(i % 2 === 1 ? 160 : 240, 9));
    });
  });

  describe('the RNG stream is untouched (ADR-0005)', () => {
    it('the offset draws nothing — jittered radii are identical with and without it', () => {
      const anchors = row(6, 60);
      const cfg = (extra) => ({
        sizing: { mode: 'proportional', size: 40, min: 0, margin: 1 },
        jitter: { seed: 3, lateral: 1, along: 1, rotation: 1, scale: 1, lateralRange: 5, alongRange: 5, rotationRange: 20, scaleRange: 0.3 },
        ...extra,
      });
      const a = resolvePlacements(anchors, cfg()).placements;
      const b = resolvePlacements(
        anchors,
        cfg({ sideAlternate: true, orientation: { normalOffset: 15 } })
      ).placements;
      // Rotation is a pure function of the stream + orientation; the offset is
      // positional only, so every rotation must match to the bit.
      a.forEach((p, i) => expect(b[i].rotation).toBe(p.rotation));
    });

    it('side never reaches the sequencer’s slot deal', () => {
      const anchors = row(4);
      const block = seq([{ glyphRef: 'a', side: 1 }, { glyphRef: 'b', side: -1 }]);
      const dealt = dealSlots(anchors, block);
      expect(dealt.map((d) => d.glyphRef)).toEqual(['a', 'b', 'a', 'b']);
      expect(dealt.map((d) => d.side)).toEqual([1, -1, 1, -1]);
      expect(dealt.map((d) => d.sideSpecified)).toEqual([true, true, true, true]);
    });
  });
});
