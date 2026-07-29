// footprintScope — which placements a FOOTPRINT REVEAL scope names (#189).
//
// This is the ONE non-presentational step of the footprint overlay, and it is
// tested here rather than through the component on purpose. PRD #184 excludes
// the overlay's rendered SVG from assertion — ring radii, stroke widths, dash
// arrays and element counts are presentation expected to move, and pinning them
// would encode exactly the thing that is meant to change at review. What is NOT
// presentation is "the rings drawn belong to the slot being hovered", and in a
// ZONED sequence that is genuinely load-bearing logic: `slotIndex` is
// zone-local, so Apex slot 1 and Stem slot 1 are different slots sharing an
// index, and a mapping that reads `seqId` alone silently rings both.
//
// Deliberately NOT tested: that `overrideRecords` is threaded into the overlay's
// re-resolution. The only observable consequence is a ring RADIUS, which is the
// presentation the PRD excludes — `applyGlyphOverrides` is already covered where
// it lives (overrides.test.js), and the threading is one argument on one call.

import { describe, it, expect } from 'vitest';
import {
  firstSequenceIndex,
  placementsForScope,
  placementsForSlotScope,
  rejectionsForScope,
  rejectionsForSlotScope,
  captorDisc,
  isTightFootprint,
  normalisedFootprint,
  ringGeometry,
  rejectedRing,
} from './footprintScope';
import { getGlyph } from '../../lib/motif/glyphs';

/** A minimal Anchor. `s` orders samples along a path; `meta.pathIndex` groups. */
const anchor = (id, role, s, pathIndex = 0) => ({
  id,
  role,
  x: 10 * s,
  y: 10,
  tangent: 0,
  normal: 0,
  s,
  meta: { pathIndex },
});

/** A minimal Placement — only `anchorId` is read by the mapper. */
const placement = (anchorId) => ({ anchorId });

// One open path: two tips (Apex) and three interior edge samples (Stem).
const SURVIVORS = [
  anchor('tip:a', 'tip', 0),
  anchor('edge:1', 'edge', 1),
  anchor('edge:2', 'edge', 2),
  anchor('edge:3', 'edge', 3),
  anchor('tip:b', 'tip', 4),
];
const PLACEMENTS = SURVIVORS.map((a) => placement(a.id));

const ZONED = {
  type: 'sequence',
  seed: 7,
  zones: [
    { zone: 'apex', mode: 'cycle', slots: [{ glyphRef: 'A0' }, { glyphRef: 'A1' }] },
    {
      zone: 'stem',
      mode: 'cycle',
      slots: [{ glyphRef: 'S0' }, { glyphRef: 'S1' }, { glyphRef: 'S2' }],
    },
  ],
};

const FLAT = {
  type: 'sequence',
  seed: 7,
  mode: 'cycle',
  slots: [{ glyphRef: 'F0' }, { glyphRef: 'F1' }],
};

/** A minimal sizing-stage Rejection — the shape #191 added geometry to. */
const rejection = (anchorId, reason) => ({ anchorId, reason, x: 0, y: 0, wantedRadius: 7 });
// Every survivor rejected, so "which slot does this one belong to" is the only
// question left — exactly the all-rejected slot the overlay must still draw.
const REJECTED = SURVIVORS.map((a) => rejection(a.id, 'below-floor'));

const ctx = (sequence) => ({
  motifId: 'motif-1',
  seqIndex: 1,
  survivors: SURVIVORS,
  sequence,
  placements: PLACEMENTS,
  rejected: REJECTED,
});

const slotScope = (over = {}) => ({
  kind: 'slot',
  layerId: 'motif-1',
  seqIndex: 1,
  zoneId: null,
  slotIndex: 0,
  ...over,
});

const ids = (list) => (list == null ? null : list.map((p) => p.anchorId));

describe('firstSequenceIndex', () => {
  it('finds the sequence block the engine will actually use', () => {
    expect(firstSequenceIndex([{ type: 'route' }, { type: 'sequence' }])).toBe(1);
  });

  it('reports -1 for a chain with no sequence, and for a non-array', () => {
    expect(firstSequenceIndex([{ type: 'route' }])).toBe(-1);
    expect(firstSequenceIndex(null)).toBe(-1);
  });

  it('names the FIRST sequence block — the engine ignores any later one', () => {
    // chain.js partitions "at-most-one; first wins", while the rack renders a
    // slot card for every sequence block. A scope naming the second addresses
    // slots that never reach the canvas.
    const chain = [{ type: 'route' }, { type: 'sequence' }, { type: 'sequence' }];
    expect(firstSequenceIndex(chain)).toBe(1);
  });
});

describe('placementsForSlotScope — zoned sequences', () => {
  // THE CASE THE WHOLE MODULE EXISTS FOR. Apex slot 0 and Stem slot 0 share an
  // index; only `zoneId` tells them apart.
  it('Apex slot 0 rings only the Apex anchors dealt that slot', () => {
    const got = ids(placementsForSlotScope(slotScope({ zoneId: 'apex', slotIndex: 0 }), ctx(ZONED)));
    expect(got).toEqual(['tip:a']);
  });

  it('Apex slot 1 is a different slot from Apex slot 0', () => {
    const got = ids(placementsForSlotScope(slotScope({ zoneId: 'apex', slotIndex: 1 }), ctx(ZONED)));
    expect(got).toEqual(['tip:b']);
  });

  it('Stem slot 0 shares the index with Apex slot 0 and rings different glyphs', () => {
    const got = ids(placementsForSlotScope(slotScope({ zoneId: 'stem', slotIndex: 0 }), ctx(ZONED)));
    expect(got).toEqual(['edge:1']);
    // The disambiguation is the point: no anchor is in both answers.
    const apex = ids(placementsForSlotScope(slotScope({ zoneId: 'apex', slotIndex: 0 }), ctx(ZONED)));
    expect(apex.some((id) => got.includes(id))).toBe(false);
  });

  it('a cycling stem slot rings every anchor that landed on it', () => {
    // 3 stem anchors over 3 slots ⇒ one each; slot 2 is the third.
    expect(ids(placementsForSlotScope(slotScope({ zoneId: 'stem', slotIndex: 2 }), ctx(ZONED))))
      .toEqual(['edge:3']);
  });

  it('a FLAT scope over a zoned sequence rings nothing', () => {
    // `zoneId: null` against zoned assignments must not fall back to "any zone".
    expect(placementsForSlotScope(slotScope({ zoneId: null, slotIndex: 0 }), ctx(ZONED))).toEqual([]);
  });
});

describe('placementsForSlotScope — flat sequences', () => {
  it('deals positionally and rings every anchor on that slot', () => {
    // cycle restarts per path group; one path here ⇒ 0,1,0,1,0.
    expect(ids(placementsForSlotScope(slotScope({ slotIndex: 0 }), ctx(FLAT))))
      .toEqual(['tip:a', 'edge:2', 'tip:b']);
    expect(ids(placementsForSlotScope(slotScope({ slotIndex: 1 }), ctx(FLAT))))
      .toEqual(['edge:1', 'edge:3']);
  });

  it('an omitted zoneId reads as flat, not as a mismatch', () => {
    const scope = slotScope({ slotIndex: 1 });
    delete scope.zoneId;
    expect(ids(placementsForSlotScope(scope, ctx(FLAT)))).toEqual(['edge:1', 'edge:3']);
  });

  it('a slot that exists but places nothing rings nothing, and says so as []', () => {
    // [] (that slot is empty) is deliberately distinct from null (this scope
    // names nothing on this layer) — the overlay draws neither, but only the
    // second means "do not even resolve".
    expect(placementsForSlotScope(slotScope({ slotIndex: 5 }), ctx(FLAT))).toEqual([]);
  });
});

describe('placementsForSlotScope — scopes that name nothing here', () => {
  it('returns null for a scope on a different layer', () => {
    expect(placementsForSlotScope(slotScope({ layerId: 'motif-2' }), ctx(FLAT))).toBeNull();
  });

  it('returns null for a non-slot scope', () => {
    // Layer-wide and per-glyph reveals (#192) share the context and must not be
    // mistaken for a slot.
    expect(placementsForSlotScope({ kind: 'layer', layerId: 'motif-1' }, ctx(FLAT))).toBeNull();
    expect(
      placementsForSlotScope({ kind: 'glyph', layerId: 'motif-1', anchorId: 'edge:1' }, ctx(FLAT))
    ).toBeNull();
  });

  it('returns null when nothing is revealed', () => {
    expect(placementsForSlotScope(null, ctx(FLAT))).toBeNull();
  });

  it('returns null for a scope naming a sequence block the engine ignores', () => {
    expect(placementsForSlotScope(slotScope({ seqIndex: 2 }), ctx(FLAT))).toBeNull();
  });

  it('returns null when the motif has no sequence block at all', () => {
    expect(placementsForSlotScope(slotScope(), { ...ctx(FLAT), seqIndex: -1 })).toBeNull();
    expect(placementsForSlotScope(slotScope(), { ...ctx(null), seqIndex: 1 })).toBeNull();
  });

  it('returns null for a degenerate sequence block with no slots', () => {
    expect(placementsForSlotScope(slotScope(), ctx({ type: 'sequence', slots: [] }))).toBeNull();
  });
});

// REJECTION SELECTION (#191) — the third non-presentational step, and the same
// posture again: WHICH rejections the hovered slot has to answer for is logic;
// how a dotted ring is drawn is presentation the PRD excludes. Nothing here
// touches a radius. Two things ARE load-bearing: the zone-local `slotIndex`
// disambiguation (inherited from the placement mapper), and the reason filter —
// `junction-skip` and `rest` are dispositions the user asked for, not the silent
// deletion this feature exists to explain.
describe('rejectionsForSlotScope — the dotted rings a slot has to answer for', () => {
  it('names its own slot\'s rejections and NOT another slot\'s', () => {
    const first = ids(rejectionsForSlotScope(slotScope({ slotIndex: 0 }), ctx(FLAT)));
    const second = ids(rejectionsForSlotScope(slotScope({ slotIndex: 1 }), ctx(FLAT)));
    expect(first).toEqual(['tip:a', 'edge:2', 'tip:b']);
    expect(second).toEqual(['edge:1', 'edge:3']);
    expect(first.some((id) => second.includes(id))).toBe(false);
  });

  it('disambiguates zones exactly as the placement mapper does', () => {
    // Apex slot 0 and Stem slot 0 share an index; only `zoneId` tells them apart.
    expect(ids(rejectionsForSlotScope(slotScope({ zoneId: 'apex', slotIndex: 0 }), ctx(ZONED))))
      .toEqual(['tip:a']);
    expect(ids(rejectionsForSlotScope(slotScope({ zoneId: 'stem', slotIndex: 0 }), ctx(ZONED))))
      .toEqual(['edge:1']);
  });

  it('draws nothing for `rest` or `junction-skip` — only the two SIZING reasons', () => {
    // A Rest is a gap the user composed and a skipped junction is a rule they
    // set; neither is a glyph that vanished without saying so. They also carry
    // no geometry at all (placementEngine.js), so there is no ring to draw.
    const mixed = {
      ...ctx(FLAT),
      rejected: [
        rejection('tip:a', 'rest'),
        rejection('edge:2', 'junction-skip'),
        rejection('tip:b', 'no-fit'),
      ],
    };
    expect(ids(rejectionsForSlotScope(slotScope({ slotIndex: 0 }), mixed))).toEqual(['tip:b']);
  });

  it('keeps both sizing reasons — below-floor AND no-fit', () => {
    const mixed = {
      ...ctx(FLAT),
      rejected: [rejection('tip:a', 'below-floor'), rejection('edge:2', 'no-fit')],
    };
    expect(ids(rejectionsForSlotScope(slotScope({ slotIndex: 0 }), mixed))).toEqual([
      'tip:a',
      'edge:2',
    ]);
  });

  it('a slot whose rejections are all another slot\'s says so as [], not null', () => {
    // Same null-vs-[] contract as the placement mapper: [] means "this slot has
    // nothing to answer for", null means "this scope names nothing here".
    const only = { ...ctx(FLAT), rejected: [rejection('edge:1', 'no-fit')] };
    expect(rejectionsForSlotScope(slotScope({ slotIndex: 0 }), only)).toEqual([]);
  });

  it('returns null for every scope that names nothing on this layer', () => {
    expect(rejectionsForSlotScope(slotScope({ layerId: 'motif-2' }), ctx(FLAT))).toBeNull();
    expect(rejectionsForSlotScope({ kind: 'layer', layerId: 'motif-1' }, ctx(FLAT))).toBeNull();
    expect(rejectionsForSlotScope(null, ctx(FLAT))).toBeNull();
    expect(rejectionsForSlotScope(slotScope({ seqIndex: 2 }), ctx(FLAT))).toBeNull();
    expect(rejectionsForSlotScope(slotScope(), { ...ctx(null), seqIndex: 1 })).toBeNull();
    expect(rejectionsForSlotScope(slotScope(), ctx({ type: 'sequence', slots: [] }))).toBeNull();
  });

  it('returns null when the run rejected nothing at all', () => {
    expect(rejectionsForSlotScope(slotScope(), { ...ctx(FLAT), rejected: [] })).toBeNull();
    expect(rejectionsForSlotScope(slotScope(), { ...ctx(FLAT), rejected: undefined })).toBeNull();
  });

  // PER-GLYPH OVERRIDE SCALE (#137/#191). `applyGlyphOverrides` multiplies a
  // placement's `drawnRadius` by an override record's scale AFTER packing, which
  // is why #189 threaded `overrideRecords` into the overlay at all ("the rings
  // are the rings on screen"). `wantedRadius` is pre-override by construction —
  // the engine reports what the glyph asked for before any post-placement step —
  // so the same multiply has to happen HERE, or the dotted ring and the dashed
  // ring that replaces it when `hold` rescues the glyph sit in different radius
  // spaces: a ×2 anchor would be promised at 18 and delivered at 36.
  describe('the override scale rides the dotted ring too', () => {
    const recs = (map) => ({ ...ctx(FLAT), overrideRecords: new Map(Object.entries(map)) });

    it('scales `wantedRadius` by a valid record scale, and clones rather than mutating', () => {
      const source = ctx(FLAT).rejected;
      const got = rejectionsForSlotScope(slotScope({ slotIndex: 0 }), recs({ 'tip:a': { scale: 2 } }));
      expect(got.find((r) => r.anchorId === 'tip:a').wantedRadius).toBe(14); // 7 × 2
      // Untouched anchors come back on the same slot unchanged…
      expect(got.find((r) => r.anchorId === 'tip:b').wantedRadius).toBe(7);
      // …and the engine's own array never moved.
      expect(source.find((r) => r.anchorId === 'tip:a').wantedRadius).toBe(7);
    });

    it('ignores anything `applyGlyphOverrides` ignores — same rule, verbatim', () => {
      // Deliberately the SAME validity test, so the dotted ring and the dashed
      // ring can never disagree about what an override means.
      for (const scale of [0, -2, NaN, Infinity, '2', null, undefined]) {
        const got = rejectionsForSlotScope(slotScope({ slotIndex: 0 }), recs({ 'tip:a': { scale } }));
        expect(got.find((r) => r.anchorId === 'tip:a').wantedRadius).toBe(7);
      }
    });

    it('behaves exactly as before with no records at all', () => {
      const none = rejectionsForSlotScope(slotScope({ slotIndex: 0 }), ctx(FLAT));
      for (const map of [new Map(), null, undefined]) {
        const got = rejectionsForSlotScope(slotScope({ slotIndex: 0 }), {
          ...ctx(FLAT),
          overrideRecords: map,
        });
        expect(got).toEqual(none);
      }
      // A record for an anchor with no rejection changes nothing either.
      expect(rejectionsForSlotScope(slotScope({ slotIndex: 0 }), recs({ 'edge:1': { scale: 3 } })))
        .toEqual(none);
    });
  });

  it('drops a rejection with no usable radius rather than drawing NaN', () => {
    // A hand-edited/imported document can carry a non-finite `sizeScale`, which
    // the engine honestly propagates into `wantedRadius` (it clamps `hold`, not
    // `sizeScale`). "Anything not a finite positive number reads as absent" is
    // the engine's own `hasHostRadius` idiom; here it means no ring at all,
    // instead of `r={NaN}` and a React warning for a circle that never paints.
    const broken = {
      ...ctx(FLAT),
      rejected: [
        { anchorId: 'tip:a', reason: 'no-fit', x: 0, y: 0, wantedRadius: NaN },
        { anchorId: 'edge:2', reason: 'no-fit', x: 0, y: 0, wantedRadius: 0 },
        { anchorId: 'tip:b', reason: 'no-fit', x: 0, y: 0, wantedRadius: 5 },
      ],
    };
    expect(ids(rejectionsForSlotScope(slotScope({ slotIndex: 0 }), broken))).toEqual(['tip:b']);
  });

  it('answers even when the slot placed NOTHING — the whole point of the ticket', () => {
    // §1b's gap-20 case at its limit: a slot with zero placements and four
    // rejections. `placementsForSlotScope` returns null here (no placements at
    // all), so a selector that shared that guard would silently draw nothing.
    const allRejected = { ...ctx(FLAT), placements: [] };
    expect(placementsForSlotScope(slotScope({ slotIndex: 0 }), allRejected)).toBeNull();
    expect(ids(rejectionsForSlotScope(slotScope({ slotIndex: 0 }), allRejected))).toEqual([
      'tip:a',
      'edge:2',
      'tip:b',
    ]);
  });
});

// THE OTHER TWO SCOPE KINDS (#192). `hold` was the first trigger; layer Size,
// slot Scale and the per-glyph override scale are the rest. Slot Scale reuses
// the slot scope above verbatim, but the other two publish kinds nothing
// classified until now — and an unclassified kind is not a harmless no-op, it is
// a reveal that RAISES and draws NOTHING, which is indistinguishable from the
// feature never having been wired.
//
// Tested through the DISPATCHER, which is the module's public interface for a
// consumer that does not care which kind it holds: the overlay hands one list to
// one renderer, whatever raised it.
describe('placementsForScope / rejectionsForScope — the dispatcher', () => {
  it('delegates a slot scope to the slot selector, unchanged', () => {
    const scope = slotScope({ slotIndex: 1 });
    expect(placementsForScope(scope, ctx(FLAT))).toEqual(
      placementsForSlotScope(scope, ctx(FLAT))
    );
    expect(rejectionsForScope(scope, ctx(FLAT))).toEqual(
      rejectionsForSlotScope(scope, ctx(FLAT))
    );
  });

  it('names nothing for a scope with no kind it knows, and for no scope at all', () => {
    // A kind this module has never seen (PR 2's spacing/density, say) must ring
    // nothing rather than ring everything — the reveal context stays opaque and
    // will happily carry a shape that lands here.
    for (const scope of [null, undefined, {}, { kind: 'pitch', layerId: 'motif-1' }]) {
      expect(placementsForScope(scope, ctx(FLAT))).toBeNull();
      expect(rejectionsForScope(scope, ctx(FLAT))).toBeNull();
    }
  });
});

describe('a LAYER scope — every placement on the layer', () => {
  const layerScope = (over = {}) => ({ kind: 'layer', layerId: 'motif-1', ...over });

  it('names every placement, across every slot', () => {
    // Nothing narrows a layer-wide control to a subset. Decision 16 scoped a
    // SLOT hover to that slot's glyphs; it did not answer a layer trigger, and
    // the union of the two flat slots is the whole layer.
    expect(ids(placementsForScope(layerScope(), ctx(FLAT)))).toEqual(
      PLACEMENTS.map((p) => p.anchorId)
    );
  });

  it('needs no sequence at all — a layer is not addressed through one', () => {
    // `seqIndex: -1` (no sequence block) and a null sequence both kill a SLOT
    // scope. A layer scope is not addressed through the deal, so neither may
    // silently switch it off.
    expect(ids(placementsForScope(layerScope(), { ...ctx(null), seqIndex: -1 }))).toEqual(
      PLACEMENTS.map((p) => p.anchorId)
    );
  });

  it('names nothing on a different layer', () => {
    expect(placementsForScope(layerScope({ layerId: 'motif-2' }), ctx(FLAT))).toBeNull();
    expect(rejectionsForScope(layerScope({ layerId: 'motif-2' }), ctx(FLAT))).toBeNull();
  });

  it('names every DRAWABLE rejection on the layer, and only those', () => {
    const mixed = {
      ...ctx(FLAT),
      rejected: [
        rejection('tip:a', 'rest'),
        rejection('edge:1', 'junction-skip'),
        rejection('edge:2', 'below-floor'),
        rejection('tip:b', 'no-fit'),
      ],
    };
    // Both sizing reasons, from BOTH slots — the two dispositions the user asked
    // for still draw nothing.
    expect(ids(rejectionsForScope(layerScope(), mixed))).toEqual(['edge:2', 'tip:b']);
  });

  it('answers the rejections even when the layer placed nothing', () => {
    // The §1b limit case, layer-wide: `placements` is empty, so the placement
    // side is null and the rejection side is the entire content of the overlay.
    const allRejected = { ...ctx(FLAT), placements: [] };
    expect(placementsForScope(layerScope(), allRejected)).toBeNull();
    expect(ids(rejectionsForScope(layerScope(), allRejected))).toEqual(
      SURVIVORS.map((a) => a.id)
    );
  });

  it('drops a rejection with no usable radius rather than drawing NaN', () => {
    const broken = {
      ...ctx(FLAT),
      rejected: [
        { anchorId: 'tip:a', reason: 'no-fit', x: 0, y: 0, wantedRadius: NaN },
        { anchorId: 'edge:1', reason: 'no-fit', x: 0, y: 0, wantedRadius: 5 },
      ],
    };
    expect(ids(rejectionsForScope(layerScope(), broken))).toEqual(['edge:1']);
  });

  it('rides the per-glyph override scale, cloning rather than mutating', () => {
    const source = ctx(FLAT).rejected;
    const got = rejectionsForScope(layerScope(), {
      ...ctx(FLAT),
      overrideRecords: new Map([['tip:a', { scale: 2 }]]),
    });
    expect(got.find((r) => r.anchorId === 'tip:a').wantedRadius).toBe(14);
    expect(got.find((r) => r.anchorId === 'tip:b').wantedRadius).toBe(7);
    expect(source.find((r) => r.anchorId === 'tip:a').wantedRadius).toBe(7);
  });
});

describe('a GLYPH scope — the one anchor being overridden', () => {
  const glyphScope = (anchorId, over = {}) => ({
    kind: 'glyph',
    layerId: 'motif-1',
    anchorId,
    ...over,
  });

  it('names exactly one placement', () => {
    expect(ids(placementsForScope(glyphScope('edge:2'), ctx(FLAT)))).toEqual(['edge:2']);
  });

  it('names nothing on a different layer', () => {
    expect(placementsForScope(glyphScope('edge:2', { layerId: 'motif-2' }), ctx(FLAT)))
      .toBeNull();
    expect(rejectionsForScope(glyphScope('edge:2', { layerId: 'motif-2' }), ctx(FLAT)))
      .toBeNull();
  });

  it('names nothing for a scope carrying no anchor', () => {
    expect(placementsForScope(glyphScope(undefined), ctx(FLAT))).toBeNull();
    expect(rejectionsForScope(glyphScope(undefined), ctx(FLAT))).toBeNull();
  });

  it('says [] — not null — for an anchor this layer did not place', () => {
    // Reachable and important: a REJECTED anchor keeps a clickable dot and a
    // popover, so its scale control is a live trigger. [] is "that glyph is not
    // among the placements", which is exactly what the rejection side answers.
    const scope = glyphScope('tip:a');
    const onlyOne = { ...ctx(FLAT), placements: [{ anchorId: 'edge:1' }] };
    expect(placementsForScope(scope, onlyOne)).toEqual([]);
    expect(ids(rejectionsForScope(scope, onlyOne))).toEqual(['tip:a']);
  });

  it('names that anchor\'s rejection and no other slot\'s', () => {
    expect(ids(rejectionsForScope(glyphScope('edge:3'), ctx(FLAT)))).toEqual(['edge:3']);
  });

  it('draws nothing for a `rest` or a `junction-skip` on that anchor', () => {
    const mixed = {
      ...ctx(FLAT),
      rejected: [rejection('tip:a', 'rest'), rejection('edge:1', 'junction-skip')],
    };
    expect(rejectionsForScope(glyphScope('tip:a'), mixed)).toEqual([]);
    expect(rejectionsForScope(glyphScope('edge:1'), mixed)).toEqual([]);
  });

  // THE RINGS MUST MOVE AS THE OVERRIDE SCALE IS DRAGGED (#192's third
  // acceptance criterion). For a PLACED glyph the link is `applyGlyphOverrides`
  // scaling `drawnRadius` alongside `radius`, proven in
  // perGlyphOverrides.test.js ("scales `drawnRadius` with `radius`") and NOT
  // re-tested here. For a REJECTED one the multiply lives in this module, and
  // this is the only new link #192 creates.
  it('rides the override scale on the anchor being dragged', () => {
    const source = ctx(FLAT).rejected;
    const got = rejectionsForScope(glyphScope('tip:a'), {
      ...ctx(FLAT),
      overrideRecords: new Map([['tip:a', { scale: 2 }]]),
    });
    expect(got.map((r) => r.wantedRadius)).toEqual([14]);
    // The engine's array never moved — the drag re-reads it every frame.
    expect(source.find((r) => r.anchorId === 'tip:a').wantedRadius).toBe(7);
  });

  it('ignores anything `applyGlyphOverrides` ignores — same rule, verbatim', () => {
    for (const scale of [0, -2, NaN, Infinity, '2', null, undefined]) {
      const got = rejectionsForScope(glyphScope('tip:a'), {
        ...ctx(FLAT),
        overrideRecords: new Map([['tip:a', { scale }]]),
      });
      expect(got.map((r) => r.wantedRadius)).toEqual([7]);
    }
  });
});

// CAPTOR SELECTION (#190) — the second non-presentational step. Same posture as
// above: WHICH placements yield a captor and OF WHICH KIND is logic; how dim it
// is drawn, in what order, and whether it reads as a container are presentation
// the PRD excludes and Majed judges by eye. So there is nothing here about
// opacity, stroke or element counts — only the selection, and in particular the
// two `null` answers that are DESIGN rather than absence of data:
// 'boundary' (decision 17 — the page edge is already on screen) and 'natural'
// (nothing capped that glyph at all).
describe('captorDisc — the one thing capping a glyph', () => {
  /** A cell anchor declaring a container. */
  const cell = (hostRadius) => ({ id: 'cell:0', role: 'cell', x: 100, y: 200, hostRadius });

  it("reads the neighbour's disc STRAIGHT off `capObstacle`, all three numbers", () => {
    // The point of the field: the engine recorded the disc it actually lost to.
    // Nothing here may be recomputed from the placement's own geometry.
    const p = { anchorId: 'a', x: 5, y: 5, capBy: 'neighbour', capObstacle: { x: 40, y: 7, r: 12 } };
    expect(captorDisc(p, null)).toEqual({ kind: 'neighbour', x: 40, y: 7, r: 12 });
  });

  it('draws NOTHING for a boundary cap — decision 17, the canvas rect stays undrawn', () => {
    expect(captorDisc({ capBy: 'boundary', capObstacle: null }, cell(30))).toBeNull();
  });

  it('draws nothing for an uncapped glyph', () => {
    expect(captorDisc({ capBy: 'natural', capObstacle: null }, cell(30))).toBeNull();
  });

  it("draws the host container at the ANCHOR's centre, not the glyph's", () => {
    // The container never moved; the jitter draws displaced the glyph INSIDE
    // it, which is why the engine's host rule is a distance rule.
    const p = { anchorId: 'cell:0', x: 104, y: 197, capBy: 'host', capObstacle: null };
    expect(captorDisc(p, cell(30))).toEqual({ kind: 'host', x: 100, y: 200, r: 30 });
  });

  it('draws no host ring when the anchor declares no usable container', () => {
    // The engine's own `hasHostRadius` gate, replicated: an overlay that
    // disagrees rings a container the engine never capped against.
    const p = { anchorId: 'cell:0', capBy: 'host', capObstacle: null };
    expect(captorDisc(p, { id: 'cell:0', x: 1, y: 2 })).toBeNull();
    expect(captorDisc(p, cell(0))).toBeNull();
    expect(captorDisc(p, cell(-4))).toBeNull();
    expect(captorDisc(p, cell(Infinity))).toBeNull();
    expect(captorDisc(p, cell(NaN))).toBeNull();
    expect(captorDisc(p, undefined)).toBeNull();
  });

  it('survives a neighbour cap with no obstacle recorded rather than throwing', () => {
    // Unreachable from the engine, which populates the two together. One
    // condition, and it degrades to "no captor" inside a render that has no
    // error boundary of its own.
    expect(captorDisc({ capBy: 'neighbour', capObstacle: null }, null)).toBeNull();
  });

  it('is null-safe on a missing placement', () => {
    expect(captorDisc(null, cell(30))).toBeNull();
  });
});

/* ------------------------------------------------ the rings, as geometry */
// #206. The rings move to the OFFSET centre, and that is arithmetic over the
// engine's emitted record — so it is asserted here, headlessly, rather than off
// rendered SVG attributes the PRD excludes. §4a's nesting/tangency property is
// a claim about this function's output, not about the DOM.

describe('isTightFootprint — which packing law the rings describe', () => {
  it('reads root whenever the layer does not opt in explicitly', () => {
    expect(isTightFootprint(undefined)).toBe(false);
    expect(isTightFootprint({})).toBe(false);
    expect(isTightFootprint({ sizing: {} })).toBe(false);
    expect(isTightFootprint({ sizing: { footprint: 'root' } })).toBe(false);
    // Only the exact string opts in — the engine's own dispatch rule.
    expect(isTightFootprint({ sizing: { footprint: 'TIGHT' } })).toBe(false);
  });

  it('reads tight only in PROPORTIONAL mode — `fixed` keeps the anchored disc', () => {
    expect(isTightFootprint({ sizing: { footprint: 'tight' } })).toBe(true);
    expect(isTightFootprint({ sizing: { mode: 'proportional', footprint: 'tight' } })).toBe(true);
    // §5e leaves `fixed` untouched in BOTH footprint modes, so its reserve is
    // still `(P, R)` and the rings must stay anchor-centred at full radius.
    expect(isTightFootprint({ sizing: { mode: 'fixed', footprint: 'tight' } })).toBe(false);
  });
});

describe('normalisedFootprint — `f̂c` and `f̂r`, in units of R', () => {
  it('divides the measured footprint by viewRadius, as the engine does', () => {
    const f = normalisedFootprint({ footprintCenter: { x: 5, y: -2 }, footprintRadius: 8, viewRadius: 10 });
    expect(f).toEqual({ cx: 0.5, cy: -0.2, r: 0.8, angle: 0 });
  });

  it('carries `root.angle`, the frame `fc` was measured in', () => {
    const f = normalisedFootprint({
      footprintCenter: { x: 0, y: 4 },
      footprintRadius: 4,
      viewRadius: 4,
      root: { x: 0, y: 0, angle: 30 },
    });
    expect(f.angle).toBe(30);
  });

  it('returns null rather than throwing on an unmeasured glyph', () => {
    // The ENGINE throws here (ruling 7d) because it is about to pack material.
    // This overlay is a hover diagnostic: it degrades to "no offset" instead of
    // taking the canvas down with it.
    expect(normalisedFootprint(null)).toBeNull();
    expect(normalisedFootprint({ viewRadius: 10 })).toBeNull();
    expect(normalisedFootprint({ footprintCenter: { x: 1, y: 1 }, footprintRadius: 2 })).toBeNull();
    expect(
      normalisedFootprint({ footprintCenter: { x: 1, y: 1 }, footprintRadius: 2, viewRadius: 0 })
    ).toBeNull();
    expect(
      normalisedFootprint({ footprintCenter: { x: NaN, y: 1 }, footprintRadius: 2, viewRadius: 4 })
    ).toBeNull();
  });
});

describe('ringGeometry — the two live rings', () => {
  // A tight-law placement: the engine emitted `footprintCenter` AT packedRadius.
  const fp = { cx: 0.6, cy: 0, r: 0.5, angle: 0 };
  const tight = {
    x: 100,
    y: 200,
    packedRadius: 10,
    drawnRadius: 20,
    // P + packedRadius·f̂c
    footprintCenter: { x: 106, y: 200 },
  };

  it('is byte-identical to the anchored ring under the root law', () => {
    // Root emits `footprintCenter === {x, y}` and reserves the full radius, so
    // passing no footprint must reproduce exactly what the overlay drew before.
    const p = { x: 100, y: 200, packedRadius: 10, drawnRadius: 20, footprintCenter: { x: 100, y: 200 } };
    expect(ringGeometry(p, p.packedRadius, null)).toEqual({ cx: 100, cy: 200, r: 10 });
    expect(ringGeometry(p, p.drawnRadius, null)).toEqual({ cx: 100, cy: 200, r: 20 });
  });

  it('takes the emitted centre verbatim at packedRadius — never re-derived', () => {
    expect(ringGeometry(tight, tight.packedRadius, fp)).toEqual({ cx: 106, cy: 200, r: 5 });
  });

  it('puts the drawn ring one HOMOTHETY out from the anchor', () => {
    // P + (drawn/packed)·(footprintCenter − P), radius scaling from the same
    // point — which is what makes the pair nest instead of being concentric.
    expect(ringGeometry(tight, tight.drawnRadius, fp)).toEqual({ cx: 112, cy: 200, r: 10 });
  });

  it('coincides EXACTLY at `hold 0`, where drawnRadius === packedRadius', () => {
    // Decision 14's core property, and the migration guarantee: absent hold, the
    // two rings are one ring — same centre AND same radius, to the last bit.
    const packed = ringGeometry(tight, tight.packedRadius, fp);
    const drawn = ringGeometry(tight, tight.packedRadius, fp);
    expect(drawn).toEqual(packed);
  });

  it('tracks an override SCALE through `drawnRadius`, not through the centre', () => {
    // THE CONTRACT WITH `overrides.js`, pinned from this side. A per-glyph scale
    // multiplies `drawnRadius` and deliberately leaves `packedRadius` alone —
    // the reserve genuinely did not move, packing never saw the override — and
    // an ANGLE override recomputes `footprintCenter` AT `packedRadius` (#205).
    // Both make this homothety correct only while the stored centre stays
    // stated at the packed radius: a centre restated at `drawnRadius` would be
    // scaled a second time here and the ring would fly off the glyph.
    const scaled = { ...tight, drawnRadius: tight.packedRadius * 2 };
    const ring = ringGeometry(scaled, scaled.drawnRadius, fp);
    // Offset doubles with the radius, because the art really did grow that far
    // out from the anchor.
    expect(ring.cx - scaled.x).toBe(2 * (tight.footprintCenter.x - tight.x));
    expect(ring.r).toBe(scaled.drawnRadius * fp.r);
  });

  it('falls back to the anchor at packedRadius 0, reachable at `margin: 0`', () => {
    // The homothety divides by packedRadius. At 0 the engine's own reserve is
    // `(P, 0)` and `footprintCenter` IS the anchor, so the anchor is not a
    // defensive guess — it is the same answer, without the division.
    const p = { x: 100, y: 200, packedRadius: 0, drawnRadius: 6, footprintCenter: { x: 100, y: 200 } };
    expect(ringGeometry(p, 0, fp)).toEqual({ cx: 100, cy: 200, r: 0 });
    expect(ringGeometry(p, 6, fp)).toEqual({ cx: 100, cy: 200, r: 3 });
  });

  it('nests the packed ring inside the drawn one whenever |f̂c| <= f̂r', () => {
    // §4a, as a property rather than a number. 60 of the 62 built-ins.
    const f = { cx: 0.3, cy: 0, r: 0.5, angle: 0 };
    const p = { ...tight, footprintCenter: { x: tight.x + tight.packedRadius * f.cx, y: tight.y } };
    const inner = ringGeometry(p, p.packedRadius, f);
    const outer = ringGeometry(p, p.drawnRadius, f);
    const d = Math.hypot(outer.cx - inner.cx, outer.cy - inner.cy);
    expect(d).toBeLessThanOrEqual(outer.r - inner.r + 1e-12);
  });

  it('passes BOTH rings through the anchor for `leaf`, a degenerate glyph', () => {
    // |f̂c| === f̂r: the two circles are internally tangent AT the anchor and
    // grow away from the line the glyph is rooted on. The by-eye acceptance
    // criterion, stated as arithmetic.
    const leaf = normalisedFootprint(getGlyph('leaf'));
    expect(Math.hypot(leaf.cx, leaf.cy)).toBeCloseTo(leaf.r, 12);
    const P = { x: 100, y: 200 };
    const R = 30;
    const p = {
      ...P,
      packedRadius: R,
      drawnRadius: R * 2,
      footprintCenter: { x: P.x + R * leaf.cx, y: P.y + R * leaf.cy },
    };
    for (const radius of [p.packedRadius, p.drawnRadius]) {
      const ring = ringGeometry(p, radius, leaf);
      expect(Math.hypot(ring.cx - P.x, ring.cy - P.y)).toBeCloseTo(ring.r, 9);
    }
  });

  it('degrades to the anchor when the engine emitted no centre', () => {
    const p = { x: 7, y: 9, packedRadius: 4, drawnRadius: 4 };
    expect(ringGeometry(p, 4, null)).toEqual({ cx: 7, cy: 9, r: 4 });
    expect(ringGeometry(null, 4, null)).toBeNull();
  });
});

describe('rejectedRing — the ring for a glyph that never drew', () => {
  const rejection = { anchorId: 'a1', reason: 'below-floor', x: 50, y: 60, rotation: 0, wantedRadius: 10 };

  it('stays anchor-centred under the root law', () => {
    expect(rejectedRing(rejection, null)).toEqual({ cx: 50, cy: 60, r: 10 });
  });

  it('offsets by the ROTATED footprint centre, at the size it wanted', () => {
    // Decision 8 / story 11: the mark that exists to explain a mystery must not
    // be the one ring on screen still drawn where the glyph was not.
    const fp = { cx: 0.5, cy: 0, r: 0.5, angle: 0 };
    expect(rejectedRing(rejection, fp)).toEqual({ cx: 55, cy: 60, r: 5 });
    const turned = rejectedRing({ ...rejection, rotation: 90 }, fp);
    expect(turned.cx).toBeCloseTo(50, 9);
    expect(turned.cy).toBeCloseTo(65, 9);
    expect(turned.r).toBe(5);
  });

  it("de-rotates by the glyph's own growth turn, as the reserve does", () => {
    // `placementMatrix` de-rotates by `root.angle` BEFORE the placement's own
    // rotation, so the reserve offset is `Rot(θ − φ)·f̂c`.
    const fp = { cx: 0.5, cy: 0, r: 0.5, angle: 90 };
    const ring = rejectedRing({ ...rejection, rotation: 90 }, fp);
    expect(ring.cx).toBeCloseTo(55, 9);
    expect(ring.cy).toBeCloseTo(60, 9);
  });

  it('reads a missing rotation as 0 rather than emitting NaN', () => {
    const fp = { cx: 0.5, cy: 0, r: 0.5, angle: 0 };
    expect(rejectedRing({ ...rejection, rotation: undefined }, fp)).toEqual({ cx: 55, cy: 60, r: 5 });
  });

  it('is null-safe', () => {
    expect(rejectedRing(null, null)).toBeNull();
  });
});
