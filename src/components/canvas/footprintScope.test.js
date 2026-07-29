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
import { firstSequenceIndex, placementsForSlotScope } from './footprintScope';

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

const ctx = (sequence) => ({
  motifId: 'motif-1',
  seqIndex: 1,
  survivors: SURVIVORS,
  sequence,
  placements: PLACEMENTS,
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
