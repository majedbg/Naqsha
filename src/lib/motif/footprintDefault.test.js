import { describe, it, expect } from 'vitest';
import { STARTER_CHIPS } from './starterChips.js';
import { defaultMotifAddOpts } from './defaultBinding.js';
import { createMotifParams } from './motifLayer.js';
import { PLACEMENT_DEFAULTS, resolvePlacements } from './placementEngine.js';
import { isTightFootprint } from '../../components/canvas/footprintScope.js';
import { migrateLayer, SCHEMA_VERSION } from '../migration.js';
import { MOTIF_TYPE } from './motifLayer.js';

// THE TWO DIRECTIONS OF DECISION 3, IN ONE FILE — deliberately (#207).
//
// A freshly created motif layer packs by the TIGHT law; a layer arriving from a
// pre-v2 document stays pinned to `'root'` and renders byte-identically. Those
// are not two features, they are the two halves of one rule, and split across
// two files they can drift apart without either one going red.
//
// The byte-identity half is asserted against the ENGINE, not against a stored
// string: "still says 'root'" is worth nothing if the engine's `'root'` arm has
// moved. What is proven here is that the config a v1 document arrives with, the
// config migration hands back, and the config the engine defaults to all produce
// the same placements, key for key and float for float.

const footprintOf = (placement) => placement?.sizing?.footprint;

function mkAnchor(role, x, y, id) {
  return {
    id,
    role,
    x,
    y,
    tangent: 0,
    normal: 0,
    s: 0,
    meta: { pathIndex: 0, sampleIndex: 0, closed: false },
  };
}

// A row dense enough that neighbours actually bind — the packing law has to be
// doing something for the identity claim to mean anything.
const ROW = Array.from({ length: 8 }, (_, i) => mkAnchor('edge', i * 22, 60, `a${i}`));
const BOUNDARY = { type: 'rect', width: 400, height: 200 };

// The placement tail a v1 document carries: a `sizing` object with NO
// `footprint` key, because the field did not exist when it was written.
const V1_PLACEMENT = {
  sizing: { mode: 'proportional', size: 18, min: 3, margin: 0.85 },
  orientation: { policy: 'path', useNormal: true },
  flip: false,
};

function v1MotifLayer() {
  return {
    id: 'm1',
    type: MOTIF_TYPE,
    patternType: MOTIF_TYPE,
    role: 'engrave',
    params: {
      glyphRef: 'leaf',
      hostLayerId: 'h1',
      anchorMode: 'semantic',
      binding: { selection: { roles: ['crossing'] }, placement: V1_PLACEMENT },
    },
  };
}

describe('#207 — a NEW motif layer defaults to the tight footprint', () => {
  it('every starter chip writes footprint: tight', () => {
    for (const chip of STARTER_CHIPS) {
      for (const hostType of ['grid', 'flowfield']) {
        const built = chip.build(hostType);
        expect(footprintOf(built.binding.placement)).toBe('tight');
      }
    }
  });

  it("defaultMotifAddOpts — the '+ Add Motif' default — writes footprint: tight", () => {
    expect(footprintOf(defaultMotifAddOpts('grid', 'leaf').binding.placement)).toBe('tight');
    expect(footprintOf(defaultMotifAddOpts('flowfield', 'leaf').binding.placement)).toBe('tight');
  });

  it('createMotifParams stamps tight on a binding that carries no sizing at all', () => {
    expect(footprintOf(createMotifParams().binding.placement)).toBe('tight');
    expect(footprintOf(createMotifParams({ binding: { chain: [] } }).binding.placement)).toBe(
      'tight'
    );
  });

  it('createMotifParams preserves an EXPLICIT footprint rather than restamping it', () => {
    const pinned = createMotifParams({
      binding: { placement: { sizing: { mode: 'proportional', footprint: 'root' } } },
    });
    expect(footprintOf(pinned.binding.placement)).toBe('root');
  });

  it('a chip-created motif and a "+ Add Motif" one still agree', () => {
    const chip = createMotifParams({ binding: STARTER_CHIPS[0].build('grid').binding });
    const added = createMotifParams({ binding: defaultMotifAddOpts('grid', 'leaf').binding });
    expect(footprintOf(chip.binding.placement)).toBe(footprintOf(added.binding.placement));
  });
});

describe('#207 — a MIGRATED motif layer stays on the root footprint', () => {
  it('a v1 layer comes back root, and so does a version-less one', () => {
    expect(footprintOf(migrateLayer(v1MotifLayer(), null, 1).params.binding.placement)).toBe(
      'root'
    );
    expect(footprintOf(migrateLayer(v1MotifLayer()).params.binding.placement)).toBe('root');
  });

  it('a v2 layer is not re-stamped', () => {
    const current = v1MotifLayer();
    const migrated = migrateLayer(current, null, SCHEMA_VERSION);
    expect(footprintOf(migrated.params.binding.placement)).toBeUndefined();
  });

  it('the migrated layer renders byte-identically to the v1 one', () => {
    const before = resolvePlacements(ROW, V1_PLACEMENT, { boundary: BOUNDARY });
    const migrated = migrateLayer(v1MotifLayer(), null, 1).params.binding.placement;
    const after = resolvePlacements(ROW, migrated, { boundary: BOUNDARY });
    expect(after).toEqual(before);
    expect(after.placements.length).toBeGreaterThan(0);
  });
});

describe("#207 — the engine's own default stays 'root', and the overlay reads it", () => {
  // The flip belongs to the LAYER CONSTRUCTORS, not to the engine. An absent
  // `footprint` is exactly what a v1 document that never carried a `sizing`
  // object arrives with, and `pinFootprint` deliberately leaves that case alone
  // (migration.js:77) — so absent has to keep meaning root, or those documents
  // repack on load through the one hole the pin cannot cover.
  it('PLACEMENT_DEFAULTS is exported and defaults footprint to root', () => {
    expect(PLACEMENT_DEFAULTS.sizing.footprint).toBe('root');
  });

  it('an absent footprint places identically to an explicit root', () => {
    const absent = resolvePlacements(ROW, V1_PLACEMENT, { boundary: BOUNDARY });
    const explicit = resolvePlacements(
      ROW,
      { ...V1_PLACEMENT, sizing: { ...V1_PLACEMENT.sizing, footprint: 'root' } },
      { boundary: BOUNDARY }
    );
    expect(explicit).toEqual(absent);
  });

  it('isTightFootprint answers the engine, not a copy of it', () => {
    // Absent reads whatever the engine's default is — one source, so the rings
    // and the packer can never describe different laws (footprintScope.js:447).
    expect(isTightFootprint({ sizing: { mode: 'proportional' } })).toBe(
      PLACEMENT_DEFAULTS.sizing.footprint === 'tight'
    );
    expect(isTightFootprint({})).toBe(PLACEMENT_DEFAULTS.sizing.footprint === 'tight');
    expect(isTightFootprint({ sizing: { mode: 'proportional', footprint: 'tight' } })).toBe(true);
    expect(isTightFootprint({ sizing: { mode: 'fixed', footprint: 'tight' } })).toBe(false);
  });
});
