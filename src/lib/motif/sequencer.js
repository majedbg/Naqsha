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

/**
 * @typedef {{glyphRef?:string, sizeScale?:number, rotationOffset?:number, flip?:boolean,
 *            rotationRandom?:{range:number, spread:'flat'|'bell'}, weight?:number, rest?:boolean}} Slot
 * @typedef {{type:'sequence', mode?:'cycle'|'random', continuous?:boolean, seed?:number, slots:Slot[]}} SequenceBlock
 * @typedef {{
 *   rest:boolean, glyphRef:string|undefined, slotIndex:number, seqId:number,
 *   sizeScale:number, rotationOffset:number, rotationRandomDelta:number,
 *   flip:boolean|undefined, flipSpecified:boolean,
 * }} Assignment
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
 * Turn a resolved Slot into an Assignment, folding in the per-anchor rotation
 * jitter. A Rest yields a placeholder assignment (rest:true, no glyphRef).
 * @param {Slot} slot
 * @param {number} slotIndex
 * @param {number} seed
 * @param {string} anchorId
 * @returns {Assignment}
 */
function makeAssignment(slot, slotIndex, seed, anchorId) {
  if (slot && slot.rest === true) {
    return {
      rest: true,
      glyphRef: undefined,
      slotIndex,
      seqId: slotIndex,
      sizeScale: 1,
      rotationOffset: 0,
      rotationRandomDelta: 0,
      flip: undefined,
      flipSpecified: false,
    };
  }
  const flipSpecified = slot != null && slot.flip !== undefined;
  return {
    rest: false,
    glyphRef: slot ? slot.glyphRef : undefined,
    slotIndex,
    seqId: slotIndex,
    sizeScale: slot && slot.sizeScale != null ? slot.sizeScale : 1,
    rotationOffset: slot && slot.rotationOffset != null ? slot.rotationOffset : 0,
    rotationRandomDelta: rotationRandomDelta(slot, seed, anchorId),
    flip: flipSpecified ? !!slot.flip : undefined,
    flipSpecified,
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
 * Detect the new object-form sequence Block (vs the legacy `config.sequence`
 * string array which resolvePlacements keeps handling byte-identically). A valid
 * block is a non-array object with a non-empty `slots` array.
 * @param {*} seq
 * @returns {boolean}
 */
export function isSequenceBlock(seq) {
  return (
    seq != null &&
    typeof seq === 'object' &&
    !Array.isArray(seq) &&
    Array.isArray(seq.slots) &&
    seq.slots.length > 0
  );
}
