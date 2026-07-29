// Motif Sequencer — deal Slots to survivors + resolve per-slot placement
// modifiers. Pure, deterministic, headless (no p5/DOM/React).
//
// WHY THIS IS A SEPARATE, PURE STEP (deal-FIRST):
// The terminal `sequence` Block (partitioned out by runSelectionChain, passed
// through untouched) assigns each surviving Anchor a Slot — a glyph + placement
// modifiers, or a Rest (a real gap). `dealSlots` runs BEFORE the placement loop
// in resolvePlacements so that each survivor's `sizeScale` is known when the
// engine SIZES it: `sizeScale` multiplies the target radius BEFORE the empty-
// circle acceptance test, so a bigger slot claims a bigger footprint and greedy
// packing pushes neighbors away rather than overlapping. Dealing first keeps the
// slot math testable in isolation and keeps the placement loop a thin consumer.
//
// ZONED FORM (ADR 0008, amended by #150): the block may instead carry a `zones`
// array — named partitions of the survivor set (Apex / Stem / Cell), each dealing
// its own slots. The recognised ids and the partition itself live in zones.js;
// this module walks that one list. A chain naming only some of them rests the
// rest, which is what makes the Cell partition additive for stored documents.
//
// TWO DEAL MODES with DIFFERENT determinism invariants (docs/motif-chain-plan
// D4/D6/D10; ORCHESTRATOR "Cycle vs Random are DIFFERENT invariants"):
//   • CYCLE is POSITIONAL: slot = slots[cycleIndex % len]. cycleIndex restarts
//     per `meta.pathIndex` group by default (each tendril starts at slot 0)
//     UNLESS `continuous:true` (global survivor index). A Rest still CONSUMES a
//     cycle step — the index advances through it, producing a genuine gap.
//     Editing the survivor set SHIFTS downstream slots by design (the x-o-x-o
//     rhythm re-flowing).
//   • RANDOM is PER-ANCHOR-ID-STABLE (ADR-0005 survivor-stability): slot =
//     weighted draw over `hashRng(seed, anchor.id, 'slot')`. Because `anchor.id`
//     already encodes pathIndex, this is inherently per-path-distinct, so the
//     continuous toggle is a documented NO-OP in random mode. Editing an upstream
//     filter never re-rolls a surviving anchor's slot.
//
// RNG DISCIPLINE (ADR-0005): the sequencer draws ONLY from `hashRng` (channels
// 'slot' for the weighted deal, 'rot' for rotationRandom). It NEVER touches the
// legacy jitter mulberry32 stream in resolvePlacements — that stream stays
// byte-identical (exactly 4 draws/survivor) so existing documents render
// unchanged. With no sequence, dealSlots is not called at all.
//
// See docs/motif-chain-plan.md, docs/adr/0005, docs/motif-chain-ORCHESTRATOR.md.

import { hashRng } from './hashRng.js';
import { partitionZones, applyEnds, ZONE_IDS } from './zones.js';

/**
 * @typedef {{glyphRef?:string, sizeScale?:number, rotationOffset?:number, flip?:boolean,
 *            side?:number,
 *            rotationRandom?:{range:number, spread:'flat'|'bell'}, weight?:number, rest?:boolean,
 *            hold?:number}} Slot
 *   `hold` (#186) is the per-slot "how much may packing shrink me" weight, a
 *   `0…1` float. ABSENT MEANS 0, which is the pre-#186 engine exactly. ⚠️ The
 *   polarity is `1 = NEVER SHRINK` (decision 3) — the original feature request
 *   said the opposite and was reversed mid-grill. There is no inversion layer
 *   anywhere: stored, engine and displayed polarity all agree.
 *
 *   `side` (T1) is WHICH SIDE OF THE SPINE this slot sits on — the SIGN applied
 *   to `orientation.normalOffset`, the positional displacement along
 *   `anchor.normal`. `+1` / `-1` / `0` (on the spine); anything non-finite reads
 *   as UNSPECIFIED and the engine's legacy `sideAlternate` 2-cycle runs instead,
 *   exactly as `flip` behaves.
 *
 *   ⚠️ `side` IS NOT `flip`, AND IS DELIBERATELY NOT DERIVED FROM IT (vine plan
 *   T1). `flip` mirrors the glyph TEMPLATE; `side` picks which side of the host
 *   line the glyph is DISPLACED to. Deriving one from the other makes
 *   "alternating sides, same orientation" and "same side, mirrored glyphs" both
 *   inexpressible — and because a specified slot `flip` REPLACES the legacy
 *   2-cycle, a 2-slot rinceau sequence stating `flip:false` on both slots would
 *   have silently killed the alternation it exists to produce. Two fields, two
 *   `*Specified` gates, no coupling.
 * @typedef {{zone:'apex'|'stem'|'cell', mode?:'cycle'|'random', continuous?:boolean, ends?:'both'|'up'|'down', slots:Slot[]}} Zone
 * FLAT form: `slots` at top level. ZONED form (ADR 0008): a `zones` array (its
 * presence marks the block zoned; the flat `slots`/`mode`/`continuous` fields are
 * absent). Both share the block-level `seed`.
 * @typedef {{type:'sequence', mode?:'cycle'|'random', continuous?:boolean, seed?:number, slots?:Slot[], zones?:Zone[]}} SequenceBlock
 * @typedef {{
 *   rest:boolean, glyphRef:string|undefined, slotIndex:number, seqId:number,
 *   zoneId:'apex'|'stem'|'cell'|null,
 *   sizeScale:number, rotationOffset:number, rotationRandomDelta:number,
 *   flip:boolean|undefined, flipSpecified:boolean, hold:number,
 *   side:number|undefined, sideSpecified:boolean,
 * }} Assignment
 *   `zoneId` (#186) names the Zone the slot was dealt from, `null` in the FLAT
 *   deal and for every Rest. It exists because `slotIndex` is ZONE-LOCAL in the
 *   zoned deal (`dealZone` indexes within one zone), so Apex slot 1 and Stem
 *   slot 1 are different slots sharing an index — the pair is the slot identity
 *   the footprint overlay maps a revealed slot back through.
 */

const pathKey = (a) => (a && a.meta && a.meta.pathIndex != null ? a.meta.pathIndex : 0);

/**
 * Resolve the hash-driven rotation jitter contributed by a slot's
 * `rotationRandom` spec, in degrees, using a SEPARATE hashRng generator on the
 * 'rot' channel (never the legacy jitter stream, never the 'slot' channel used
 * for the weighted deal). flat = uniform in [-range, range]; bell = sum of two
 * uniforms → triangular in [-range, range], concentrated near 0.
 * @param {Slot} slot
 * @param {number} seed
 * @param {string} anchorId
 * @returns {number} degrees (0 when the slot has no rotationRandom)
 */
function rotationRandomDelta(slot, seed, anchorId) {
  const rr = slot && slot.rotationRandom;
  if (!rr || !(rr.range > 0)) return 0;
  const range = rr.range;
  const gen = hashRng(seed, anchorId, 'rot');
  if (rr.spread === 'bell') {
    const u1 = gen();
    const u2 = gen();
    return (u1 + u2 - 1) * range; // triangular in [-range, range], mean 0
  }
  return (gen() * 2 - 1) * range; // flat: uniform in [-range, range]
}

/**
 * A slot's `side` reduced to the SIGN the engine multiplies
 * `orientation.normalOffset` by (T1).
 *
 * THREE STATES, NOT TWO. `-1` and `+1` are the two sides of the spine; `0` is a
 * third, useful one — a slot that sits ON the line while its neighbours swing off
 * it (a bud at the inflection point, RESEARCH §2 step 5). Magnitude is NOT read
 * here: how FAR off the spine a glyph sits is one layer-level distance
 * (`orientation.normalOffset`, in canvas px), not a per-slot one, so `side: 0.5`
 * means the same as `side: 1` rather than half the offset.
 *
 * ANYTHING NON-FINITE (absent, `null`, a string from a hand-edited document)
 * returns `undefined` — the UNSPECIFIED signal that makes the engine fall back to
 * its legacy `sideAlternate` 2-cycle. This is the exact `flip` rule, in the exact
 * shape, so the two controls stay symmetrical.
 *
 * EXPORTED because `modeMatch.js`'s `canonicalSlot` must canonicalize `side` by
 * the SAME rule the engine reads it by; two copies of a three-way sign reduction
 * is how a mode column starts saying "Custom" for a slot the engine treats as
 * default.
 * @param {*} v @returns {-1|0|1|undefined}
 */
export function resolveSlotSide(v) {
  if (!Number.isFinite(v)) return undefined;
  return v < 0 ? -1 : v > 0 ? 1 : 0;
}

/**
 * Turn a resolved Slot into an Assignment, folding in the per-anchor rotation
 * jitter. A Rest yields a placeholder assignment (rest:true, no glyphRef).
 *
 * THE ONE SITE WHERE "absent `hold` ⇒ 0" IS TRUE (#186). The engine's sizing
 * branch reads `assignment.hold` unconditionally; if that could be `undefined`
 * the lerp would go NaN, `NaN < min` is false so nothing would reject, and a
 * NaN radius would leak silently into every placement. Defaulting here — rather
 * than at the read site — keeps the guarantee at one site instead of two.
 *
 * A REST NEUTRALISES EVERYTHING: `hold: 0`, `zoneId: null` and `side: undefined`
 * join the existing `sizeScale: 1` / `rotationOffset: 0` / `flip: undefined`. A
 * Rest emits no placement at all, so it has no size to hold, no side of the spine
 * to sit on and no glyph for the overlay to map back to a zone.
 *
 * @param {Slot} slot
 * @param {number} slotIndex
 * @param {number} seed
 * @param {string} anchorId
 * @param {'apex'|'stem'|'cell'|null} [zoneId=null]  the Zone this slot came
 *   from; `null` for the flat deal.
 * @returns {Assignment}
 */
function makeAssignment(slot, slotIndex, seed, anchorId, zoneId = null) {
  if (slot && slot.rest === true) {
    return {
      rest: true,
      glyphRef: undefined,
      slotIndex,
      seqId: slotIndex,
      zoneId: null,
      sizeScale: 1,
      rotationOffset: 0,
      rotationRandomDelta: 0,
      flip: undefined,
      flipSpecified: false,
      side: undefined,
      sideSpecified: false,
      hold: 0,
    };
  }
  const flipSpecified = slot != null && slot.flip !== undefined;
  // `side` is resolved (not merely presence-tested) because a non-finite value is
  // UNSPECIFIED, not "side 0" — `resolveSlotSide` owns that reduction, and
  // `sideSpecified` is exactly "it survived it".
  const side = slot != null ? resolveSlotSide(slot.side) : undefined;
  return {
    rest: false,
    glyphRef: slot ? slot.glyphRef : undefined,
    slotIndex,
    seqId: slotIndex,
    zoneId,
    sizeScale: slot && slot.sizeScale != null ? slot.sizeScale : 1,
    rotationOffset: slot && slot.rotationOffset != null ? slot.rotationOffset : 0,
    rotationRandomDelta: rotationRandomDelta(slot, seed, anchorId),
    flip: flipSpecified ? !!slot.flip : undefined,
    flipSpecified,
    side,
    sideSpecified: side !== undefined,
    hold: slot && slot.hold != null ? slot.hold : 0,
  };
}

/**
 * Weighted-random slot index for one anchor: a single `hashRng(seed, id, 'slot')`
 * draw walked over the cumulative per-slot weights (`slot.weight ?? 1`). Pure
 * function of (seed, anchor.id) — order-independent, survivor-stable. A
 * non-positive total weight falls back to slot 0 (deterministic, no throw).
 * @param {Slot[]} slots
 * @param {number[]} weights  precomputed, aligned to slots
 * @param {number} totalWeight
 * @param {number} seed
 * @param {string} anchorId
 * @returns {number}
 */
function randomSlotIndex(slots, weights, totalWeight, seed, anchorId) {
  if (!(totalWeight > 0)) return 0;
  let r = hashRng(seed, anchorId, 'slot')() * totalWeight;
  for (let i = 0; i < slots.length; i++) {
    r -= weights[i];
    if (r < 0) return i;
  }
  return slots.length - 1; // float guard (r landed exactly at the top)
}

/**
 * Deal one Slot to each survivor and resolve its placement modifiers.
 *
 * @param {import('./chain.js').Anchor[]} survivors  in placement (input) order.
 * @param {SequenceBlock} sequence
 * @returns {Assignment[] | null}  one Assignment per survivor (survivor order),
 *   or `null` when the block is absent/degenerate (no valid slots) so the engine
 *   cleanly falls back to its legacy single-glyph path.
 */
export function dealSlots(survivors, sequence) {
  const list = Array.isArray(survivors) ? survivors : [];
  // ZONED form (ADR 0008): presence of a `zones` array routes to the zone-aware
  // deal. The FLAT path below is left byte-identical (this is the regression
  // guard — existing sequencer tests must pass untouched).
  if (sequence && Array.isArray(sequence.zones)) {
    return dealSlotsZoned(list, sequence);
  }
  const slots = sequence && Array.isArray(sequence.slots) ? sequence.slots : null;
  if (!slots || slots.length === 0) return null;

  const mode = sequence.mode === 'random' ? 'random' : 'cycle';
  const seed = sequence.seed != null ? sequence.seed : 1;
  const len = slots.length;

  if (mode === 'random') {
    // continuous is intentionally ignored here (no-op — anchor.id already encodes
    // pathIndex, so the hash deal is per-path-distinct without it).
    const weights = slots.map((s) => (s && s.weight != null ? s.weight : 1));
    const totalWeight = weights.reduce((sum, w) => sum + w, 0);
    return list.map((anchor) => {
      const slotIndex = randomSlotIndex(slots, weights, totalWeight, seed, anchor.id);
      return makeAssignment(slots[slotIndex], slotIndex, seed, anchor.id);
    });
  }

  // CYCLE — positional. Per-path counter unless continuous (global index).
  const continuous = !!sequence.continuous;
  const counters = new Map();
  return list.map((anchor, gi) => {
    let idx;
    if (continuous) {
      idx = gi;
    } else {
      const p = pathKey(anchor);
      idx = counters.get(p) || 0;
      counters.set(p, idx + 1);
    }
    const slotIndex = ((idx % len) + len) % len;
    return makeAssignment(slots[slotIndex], slotIndex, seed, anchor.id);
  });
}

/**
 * Deal ONE Zone's slots over its members (already restricted to the zone and in
 * survivor order). Mirrors the flat cycle/random deals, but slotIndex/seqId are
 * indices within THIS zone's slots. `continuous` resolves per zone: an explicit
 * boolean wins, else the zone-aware default (`defaultContinuous`). A zone with no
 * valid slots rests every member (stamp nothing).
 * @param {import('./chain.js').Anchor[]} members
 * @param {*} zone  the zone config block ({mode?, continuous?, slots})
 * @param {number} seed  block-level seed, shared by all zones
 * @param {boolean} defaultContinuous  the zone's default, from ZONE_CONTINUOUS_DEFAULT
 * @param {Map<string, Assignment>} out  id → assignment (mutated)
 * @param {'apex'|'stem'|'cell'} zoneId  stamped onto every assignment this zone
 *   deals, so a zone-local `slotIndex` can be resolved back to its slot (#186).
 */
function dealZone(members, zone, seed, defaultContinuous, out, zoneId) {
  const slots = zone && Array.isArray(zone.slots) ? zone.slots : null;
  if (!slots || slots.length === 0) {
    for (const a of members) out.set(a.id, makeAssignment({ rest: true }, 0, seed, a.id));
    return;
  }
  const mode = zone.mode === 'random' ? 'random' : 'cycle';
  const len = slots.length;

  if (mode === 'random') {
    const weights = slots.map((s) => (s && s.weight != null ? s.weight : 1));
    const totalWeight = weights.reduce((sum, w) => sum + w, 0);
    for (const a of members) {
      const slotIndex = randomSlotIndex(slots, weights, totalWeight, seed, a.id);
      out.set(a.id, makeAssignment(slots[slotIndex], slotIndex, seed, a.id, zoneId));
    }
    return;
  }

  // CYCLE — positional. Index is per-path within the zone unless continuous
  // (zone-global survivor index). The zone-aware default comes in from
  // ZONE_CONTINUOUS_DEFAULT; an explicit boolean on the zone always wins.
  const continuous = zone.continuous != null ? !!zone.continuous : defaultContinuous;
  const counters = new Map();
  members.forEach((a, gi) => {
    let idx;
    if (continuous) {
      idx = gi;
    } else {
      const p = pathKey(a);
      idx = counters.get(p) || 0;
      counters.set(p, idx + 1);
    }
    const slotIndex = ((idx % len) + len) % len;
    out.set(a.id, makeAssignment(slots[slotIndex], slotIndex, seed, a.id, zoneId));
  });
}

/**
 * Per-zone `continuous` default for the CYCLE deal, keyed by zone id. A boolean
 * parameter could carry two zones; a third needs a table (ADR 0008 amendment).
 *   • Apex TRUE — a per-path restart over ≤2 termini would pin every strand's end
 *     to slot 0 and "three flowers cycling" would never visibly cycle.
 *   • Stem FALSE — each strand restarts, which is the x‑o‑x‑o invariant.
 *   • Cell FALSE, matching Stem. On today's cell hosts every cell anchor shares
 *     path 0 (they carry no `meta.pathIndex`), so the two defaults are
 *     observationally identical there; false is the conservative choice for a
 *     future cell host that DOES carry one, where a per-row restart reads as a
 *     rhythm and a global index does not.
 * NOTE (#150): no Zone exposes `continuous` in the rack today — ZoneSection never
 * passes DealModeToggle a `continuousTestid` — so this is a code default for all
 * three, not a control the maker can reach.
 */
const ZONE_CONTINUOUS_DEFAULT = Object.freeze({ apex: true, stem: false, cell: false });

/**
 * Zone-aware deal (ADR 0008, amended #150): partition survivors into Apex / Stem /
 * Cell, apply the Apex end-selector, then deal EACH zone the chain names
 * independently over its own members with its own mode/continuous/slots, all
 * sharing the block-level seed. Anchors in no NAMED zone — including every anchor
 * of a partition the chain does not configure, and Apex members dropped by the
 * ends filter — rest (stamp nothing).
 *
 * THE WALK IS OVER ZONE_IDS, NOT OVER `sequence.zones`. That is deliberate on two
 * counts: the recognised zone ids stay single-sourced in zones.js beside the
 * partition that produces them (so the two cannot drift, and the reserved **Node**
 * zone is one line there rather than another pair of statements here), and a
 * chain naming an id this deal does not implement is inert rather than a throw —
 * the pre-existing, documented failure mode, unchanged.
 *
 * THE PARTITION IS NOT THE DEAL: a stored chain listing only Apex and Stem rests
 * its cells exactly as it did before the Cell partition existed. That is the whole
 * of the additive guarantee.
 *
 * Always returns one Assignment per survivor in survivor order (never null: a
 * zoned block is explicitly requested, so it must not trip the engine's legacy
 * single-glyph fallback — an empty `zones` array simply rests everyone).
 * @param {import('./chain.js').Anchor[]} list  survivors in placement (input) order
 * @param {{seed?:number, zones:Array<object>}} sequence
 * @returns {Assignment[]}
 */
function dealSlotsZoned(list, sequence) {
  const seed = sequence.seed != null ? sequence.seed : 1;
  const zones = Array.isArray(sequence.zones) ? sequence.zones : [];
  const partition = partitionZones(list);

  const byId = new Map();
  for (const zoneId of ZONE_IDS) {
    const cfg = zones.find((z) => z && z.zone === zoneId);
    if (!cfg) continue;
    // The Apex end-selector is Apex-only BY CONSTRUCTION: a region has no upper
    // or lower end, so `ends` on Stem or Cell is inert (ADR 0008).
    const members =
      zoneId === 'apex'
        ? applyEnds(partition.apex, cfg.ends != null ? cfg.ends : 'both')
        : partition[zoneId];
    dealZone(members, cfg, seed, ZONE_CONTINUOUS_DEFAULT[zoneId], byId, zoneId);
  }

  return list.map((a) =>
    byId.has(a.id) ? byId.get(a.id) : makeAssignment({ rest: true }, 0, seed, a.id),
  );
}

/**
 * Detect the new object-form sequence Block (vs the legacy `config.sequence`
 * string array which resolvePlacements keeps handling byte-identically). A valid
 * block is a non-array object with something to deal — either a non-empty FLAT
 * `slots` array, or (ADR 0008) a non-empty `zones` array (the zoned form carries
 * `zones` and no top-level `slots`). This is the gate the placement engine uses
 * to decide whether to call `dealSlots`; an empty/absent deal on both fields is
 * degenerate ⇒ the engine falls back to its legacy single-glyph path.
 * @param {*} seq
 * @returns {boolean}
 */
export function isSequenceBlock(seq) {
  if (seq == null || typeof seq !== 'object' || Array.isArray(seq)) return false;
  const hasSlots = Array.isArray(seq.slots) && seq.slots.length > 0;
  const hasZones = Array.isArray(seq.zones) && seq.zones.length > 0;
  return hasSlots || hasZones;
}

/**
 * The Slots a Block holds, FLAT or ZONED — the one place the "a zoned block's
 * slots are its zones' slots" reading rule lives, so no consumer has to know the
 * two shapes. A flat block reads as its own `slots`; a zoned block (ADR 0008)
 * reads as its zones' slots concatenated in zone order. Total and non-throwing:
 * anything without either field (a route/everyN/… block, null, an array) reads
 * as `[]`.
 *
 * FOR SET QUESTIONS ONLY — "which glyphs could this block stamp?", "is this
 * glyph referenced?". The returned array must NOT be indexed by an Assignment's
 * `slotIndex`: zoned indices are ZONE-LOCAL (dealZone indexes within one zone),
 * so they do not address this flattened list. An Assignment already carries the
 * resolved glyphRef/sizeScale/rotationOffset/flip — resolve from it, not here.
 * @param {*} seq
 * @returns {Slot[]}
 */
export function sequenceSlots(seq) {
  if (seq == null || typeof seq !== 'object' || Array.isArray(seq)) return [];
  if (Array.isArray(seq.zones)) {
    return seq.zones.flatMap((z) => (z && Array.isArray(z.slots) ? z.slots : []));
  }
  return Array.isArray(seq.slots) ? seq.slots : [];
}
