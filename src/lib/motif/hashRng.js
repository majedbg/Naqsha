// Hash-per-anchor deterministic RNG (docs/adr/0005-block-rng-hash-per-anchor.md).
//
// WHY: new motif Blocks (weighted-random slot deal, per-slot rotation spread)
// need each surviving anchor to draw a STABLE random value that depends only
// on that anchor's identity — never on stream position or which other
// anchors were drawn before/after it. A sequential PRNG stream (advancing
// mulberry32 once per anchor, in order) re-rolls every downstream anchor's
// value whenever an upstream selection block changes the survivor set (an
// insert/removal shifts everyone after it in the stream). Hash-per-anchor
// gives LOCALITY instead: an anchor's value is a pure function of
// `(seed, anchorId, channel)`, so editing an upstream filter only touches the
// anchors it actually adds or removes — anchors that survive the edit keep
// exactly the random values they had before (survivor-stability). This
// mirrors the per-path-restart principle used elsewhere in the chain engine
// (docs/adr/0004): locality over fragile stream-order bookkeeping.
//
// Do NOT use this for legacy jitter (placement stage) — that keeps its
// contractual sequential 4-draws-per-survivor mulberry32 stream so existing
// documents render byte-identical on upgrade (see rng.js header + ADR-0005).
//
// Hash choice: FNV-1a, 32-bit, folded over the string
// `${seed}:${anchorId}:${channel}`. It's a simple, well-understood
// non-cryptographic string hash with good avalanche behavior for short keys
// like these — plenty to scatter distinct (seed, anchorId, channel) triples
// to decorrelated mulberry32 seeds. The actual output-sequence quality comes
// from mulberry32 (reused verbatim from ../patterns/rng.js, not
// reimplemented) — FNV-1a's only job is turning a string key into a uint32
// seed for it.

import { mulberry32 } from '../patterns/rng.js';

const FNV_OFFSET_BASIS = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

/**
 * Fold an arbitrary string into a uint32 via FNV-1a.
 * @param {string} str
 * @returns {number} uint32 hash
 */
function fnv1a(str) {
  let hash = FNV_OFFSET_BASIS;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, FNV_PRIME);
  }
  return hash >>> 0;
}

/**
 * Build a deterministic mulberry32 generator seeded by the FNV-1a hash of
 * `${seed}:${anchorId}:${channel}`. Same triple ⇒ identical sequence, always
 * — independent of call order, which other anchors were queried, or draws
 * made from any other generator in between.
 *
 * @param {number} seed - the chain/block seed
 * @param {string} anchorId - stable anchor identity, e.g. 'edge:0:7',
 *   'crossing:1:1:0'
 * @param {string} channel - namespaces independent draws for the same
 *   anchor (e.g. 'slot' vs 'rot') so they don't correlate with each other
 * @returns {() => number} generator yielding floats in [0, 1)
 */
export function hashRng(seed, anchorId, channel) {
  const key = `${seed}:${anchorId}:${channel}`;
  const hashSeed = fnv1a(key);
  return mulberry32(hashSeed);
}

/**
 * Convenience: the first draw of `hashRng(seed, anchorId, channel)`. Use this
 * for one-shot decisions. Callers that need more than one draw per anchor
 * (e.g. drawing a slot, then a rotation spread) should call `hashRng`
 * directly and hold onto the generator instead of calling this repeatedly —
 * each call constructs a fresh generator from the same seed and would
 * otherwise just re-yield the same first value.
 *
 * @param {number} seed
 * @param {string} anchorId
 * @param {string} channel
 * @returns {number} a float in [0, 1)
 */
export function hashRand01(seed, anchorId, channel) {
  return hashRng(seed, anchorId, channel)();
}
