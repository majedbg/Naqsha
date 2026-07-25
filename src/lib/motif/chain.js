// Motif SELECTION CHAIN executor — pure, deterministic, headless (no p5/DOM/React).
//
// WHY: anchor selection used to be a fixed, hard-coded stage order inside
// `selectAnchors` (roles → rate → skip → density → field → overrides). To get
// Ableton-style composability — reordering rate vs skip, stacking two rhythms,
// bypassing a stage, routing different motifs to different host paths — that
// pipeline becomes a REORDERABLE array of Block instances the engine runs in
// stored order (ADR-0004: a linear chain, deliberately NOT a node graph). The
// same Blocks in a different order are a different design, so order is document
// state and determinism is preserved without hard-coding the stage order.
//
// This module executes the SELECTION half only. It does NOT run the Sequencer
// (that is terminal — see below), the placement modifiers, or the legacy
// compile — those are A4 / A3.
//
// ── Pipeline-order contract (mirrors placementEngine.selectAnchors) ─────────
//   0. Partition the chain: pull out the single terminal `sequence` Block
//      (opaque, at-most-one, first wins) and RETURN it untouched. It is NOT a
//      filter and never affects survivors. A4 executes it in the placement
//      stage. Selection filters positioned AFTER a sequence in the array STILL
//      run here — A2 is order-lenient; the UI is what forbids post-sequence
//      filters (docs/motif-chain-ORCHESTRATOR.md "The Sequencer's place").
//   1. Run the selection filters in STORED order, skipping any `bypass:true`
//      block. Each filter maps the current stage list → a subset, preserving
//      global input order. A filter type MAY repeat (stacked polyrhythms).
//   2. Overrides (opts.overrides) — a FIXED post-chain step OUTSIDE the chain
//      (ADR-0004): include (add back) then exclude (remove); exclude wins;
//      unresolved include → orphan. Shared verbatim with selectAnchors via
//      overrides.js.
//   3. Return survivors in ORIGINAL input order + orphans + the sequence block.
//
// ── Per-path restart (D4) — the important new behavior ──────────────────────
// Cycling filters (`everyN`, `skip`) restart their positional counter at each
// host path (`meta.pathIndex`) by DEFAULT, so each tendril starts its rhythm at
// index 0. Set `continuous:true` on the block to index continuously across the
// whole stage instead (the legacy selectAnchors behavior; legacy compile sets
// continuous). Implemented INDEX-IN-PLACE: we iterate the stage once in global
// order carrying a per-path counter map, so global input order is preserved for
// free and no group-then-reassemble step is needed. `density` and `field` are
// not positional, so restart does not apply to them.
//
// ── RNG discipline ──────────────────────────────────────────────────────────
// `density` with `rngMode:'sequential'` (the DEFAULT) reproduces selectAnchors
// BYTE-FOR-BYTE: one `mulberry32(seed)` drawn once per candidate in stage order,
// keep if `rand() < density`; density>=1 draws NOTHING. This is the A3 legacy
// migration safety net (pinned by the density-parity test). `rngMode:'hash'`
// (the new-block default per ADR-0005) draws `hashRng(seed, id, 'density')()`
// per anchor — order-independent / survivor-stable.

import { mulberry32 } from '../patterns/rng.js';
import { hashRng } from './hashRng.js';
import { applyOverrides } from './overrides.js';

/**
 * @typedef {{id:string, role:string, x:number, y:number, tangent:number, normal:number, s:number, meta:object}} Anchor
 * @typedef {string | {id?:string, x?:number, y?:number, role?:string}} OverrideRef
 *
 * Selection Block shapes (each also allows `bypass?:boolean`):
 * @typedef {{type:'route', bypass?:boolean, roles?:string[]|null, pathScope?:'all'|'closed'|'open'|'picked', pickedPaths?:number[]}} RouteBlock
 * @typedef {{type:'everyN', bypass?:boolean, continuous?:boolean, n?:number, offset?:number}} EveryNBlock
 * @typedef {{type:'skip', bypass?:boolean, continuous?:boolean, mask?:boolean[]}} SkipBlock
 * @typedef {{type:'density', bypass?:boolean, density?:number, seed?:number, rngMode?:'sequential'|'hash'}} DensityBlock
 * @typedef {{type:'field', bypass?:boolean, field?:{sampleNorm:(u:number,v:number)=>number}, threshold?:number, invert?:boolean}} FieldBlock
 * @typedef {{type:'sequence', [k:string]:any}} SequenceBlock
 */

const pathKey = (a) => (a && a.meta && a.meta.pathIndex != null ? a.meta.pathIndex : 0);

/**
 * Positional index for a cycling filter: the continuous global index `gi` when
 * `continuous`, else a per-path counter (incremented for EVERY anchor in the
 * group, kept or dropped, so it is a true positional index over the path).
 * @param {boolean} continuous
 * @param {Map<*, number>} counters  per-path counter state (mutated)
 * @param {Anchor} anchor
 * @param {number} gi  global index in the current stage
 * @returns {number}
 */
function cycleIndex(continuous, counters, anchor, gi) {
  if (continuous) return gi;
  const p = pathKey(anchor);
  const idx = counters.get(p) || 0;
  counters.set(p, idx + 1);
  return idx;
}

/**
 * ROUTE: filter by anchor role AND host path scope.
 *   roles null/absent ⇒ all roles pass.
 *   pathScope 'all'    ⇒ no path filter.
 *            'closed'  ⇒ keep meta.closed === true.
 *            'open'    ⇒ keep meta.closed !== true (INCLUDES anchors that carry
 *                        no `closed` field, e.g. semantic crossing/tip/cell —
 *                        they are treated as open so route-open never silently
 *                        drops a semantic-anchor host).
 *            'picked'  ⇒ keep meta.pathIndex ∈ pickedPaths (anchors lacking a
 *                        pathIndex are never picked).
 * @param {Anchor[]} stage
 * @param {RouteBlock} block
 * @returns {Anchor[]}
 */
function applyRoute(stage, block) {
  let out = stage;
  if (block.roles != null) {
    const roleSet = new Set(block.roles);
    out = out.filter((a) => roleSet.has(a.role));
  }
  const scope = block.pathScope || 'all';
  if (scope === 'closed') {
    out = out.filter((a) => a.meta && a.meta.closed === true);
  } else if (scope === 'open') {
    out = out.filter((a) => !(a.meta && a.meta.closed === true));
  } else if (scope === 'picked') {
    const picked = new Set(Array.isArray(block.pickedPaths) ? block.pickedPaths : []);
    out = out.filter((a) => a.meta && picked.has(a.meta.pathIndex));
  }
  // 'all' (and any unknown scope) ⇒ no path filter.
  return out;
}

/**
 * EVERY-N: keep every Nth anchor over the (per-path or continuous) positional
 * index. Clamp n>=1 so a degenerate n (0/negative/NaN) means "keep all"
 * regardless of offset — byte-identical to selectAnchors' rate stage.
 * @param {Anchor[]} stage
 * @param {EveryNBlock} block
 * @returns {Anchor[]}
 */
function applyEveryN(stage, block) {
  const rawN = block.n != null ? block.n : 1;
  const n = rawN >= 1 ? Math.floor(rawN) : 1;
  const offset = block.offset != null ? block.offset : 0;
  if (n <= 1 && offset === 0) return stage; // fast default: keep all.
  const continuous = !!block.continuous;
  const counters = new Map();
  return stage.filter((a, gi) => {
    const idx = cycleIndex(continuous, counters, a, gi);
    return (((idx - offset) % n) + n) % n === 0;
  });
}

/**
 * SKIP: cycled boolean mask over the positional index; true = drop. Empty/
 * missing mask keeps all — byte-identical to selectAnchors' skip stage.
 * @param {Anchor[]} stage
 * @param {SkipBlock} block
 * @returns {Anchor[]}
 */
function applySkip(stage, block) {
  const mask = block.mask;
  if (!Array.isArray(mask) || mask.length === 0) return stage;
  const continuous = !!block.continuous;
  const counters = new Map();
  return stage.filter((a, gi) => {
    const idx = cycleIndex(continuous, counters, a, gi);
    return !mask[idx % mask.length];
  });
}

/**
 * DENSITY: seeded keep. 'sequential' (default) draws ONE mulberry32(seed) per
 * candidate in stage order — byte-identical to selectAnchors (density>=1 draws
 * NOTHING). 'hash' draws hashRng(seed, id, 'density')() per anchor
 * (order-independent, survivor-stable — ADR-0005). Not positional; per-path
 * restart does not apply.
 * @param {Anchor[]} stage
 * @param {DensityBlock} block
 * @returns {Anchor[]}
 */
function applyDensity(stage, block) {
  const density = block.density != null ? block.density : 1;
  if (density >= 1) return stage; // keep all, consume no RNG.
  const seed = block.seed != null ? block.seed : 1;
  const mode = block.rngMode || 'sequential';
  if (mode === 'hash') {
    return stage.filter((a) => hashRng(seed, a.id, 'density')() < density);
  }
  const rand = mulberry32(seed);
  return stage.filter(() => rand() < density);
}

/**
 * FIELD: keep anchors whose scalar field sample compares to `threshold`
 * (invert flips). No-op unless a field AND both canvas dims are present —
 * byte-identical to selectAnchors' field stage.
 * @param {Anchor[]} stage
 * @param {FieldBlock} block
 * @param {{canvasW?:number, canvasH?:number}} opts
 * @returns {Anchor[]}
 */
function applyField(stage, block, opts) {
  const field = block.field;
  const { canvasW, canvasH } = opts || {};
  if (!field || canvasW == null || canvasH == null) return stage;
  const threshold = block.threshold != null ? block.threshold : 0.5;
  const invert = !!block.invert;
  return stage.filter((a) => {
    const value = field.sampleNorm(a.x / canvasW, a.y / canvasH);
    return invert ? value < threshold : value >= threshold;
  });
}

/**
 * Execute the SELECTION chain: run the selection filters in stored order, apply
 * the fixed post-chain overrides, and pass the terminal Sequencer block through
 * untouched. See the module header for the full pipeline-order contract.
 *
 * ── Optional trace hook (`opts.onStage`) ────────────────────────────────────
 * When present, `onStage` is invoked once per FILTER block (route/everyN/skip/
 * density/field and any unknown non-sequence block) in ORIGINAL chain order —
 * INCLUDING bypassed blocks (a bypass is reported as a pass-through, inCount ===
 * outCount, `bypassed:true`) — with `{blockIndex, block, type, inCount, outCount,
 * bypassed}`. `blockIndex` is the block's index in the ORIGINAL `chain` array
 * (stable across the partitioned-out sequence block). The terminal `sequence`
 * block is NOT a filter and is never traced. The hook is a pure observer: it is
 * called synchronously between stages and MUST NOT mutate anything; a run with no
 * `onStage` is byte-identical to one with it (this is `sieveCounts.js`'s seam).
 *
 * @param {Anchor[]} anchors  input order is contractual and preserved in survivors.
 * @param {Array<RouteBlock|EveryNBlock|SkipBlock|DensityBlock|FieldBlock|SequenceBlock>} chain
 * @param {{canvasW?:number, canvasH?:number, overrides?:{include?:OverrideRef[], exclude?:OverrideRef[], tolerance?:number}, onStage?:(entry:{blockIndex:number, block:object, type:string, inCount:number, outCount:number, bypassed:boolean})=>void}} [opts]
 * @returns {{survivors: Anchor[], orphans: OverrideRef[], sequence: SequenceBlock|null}}
 */
export function runSelectionChain(anchors, chain, opts = {}) {
  const list = Array.isArray(anchors) ? anchors : [];
  const blocks = Array.isArray(chain) ? chain : [];
  const onStage = typeof opts.onStage === 'function' ? opts.onStage : null;

  // 0. Partition out the terminal sequence block (at-most-one; first wins;
  //    passed through by reference, never executed here). Filters keep their
  //    ORIGINAL chain index so the trace hook can report a stable blockIndex.
  let sequence = null;
  const filters = [];
  blocks.forEach((block, index) => {
    if (block && block.type === 'sequence') {
      if (sequence === null) sequence = block;
      return; // additional sequence blocks are ignored (UI enforces one).
    }
    filters.push({ block, index });
  });

  // 1. Run selection filters in stored order; skip bypassed blocks.
  let stage = list.slice();
  for (const { block, index } of filters) {
    const inCount = stage.length;
    if (!block || block.bypass) {
      // Bypassed / falsy blocks pass through untouched. Trace them as a
      // no-narrowing pass-through so the UI can chip every rack block.
      if (onStage) {
        onStage({
          blockIndex: index,
          block,
          type: block ? block.type : undefined,
          inCount,
          outCount: inCount,
          bypassed: true,
        });
      }
      continue;
    }
    switch (block.type) {
      case 'route':
        stage = applyRoute(stage, block);
        break;
      case 'everyN':
        stage = applyEveryN(stage, block);
        break;
      case 'skip':
        stage = applySkip(stage, block);
        break;
      case 'density':
        stage = applyDensity(stage, block);
        break;
      case 'field':
        stage = applyField(stage, block, opts);
        break;
      default:
        break; // unknown block type: no-op (lenient).
    }
    if (onStage) {
      onStage({
        blockIndex: index,
        block,
        type: block.type,
        inCount,
        outCount: stage.length,
        bypassed: false,
      });
    }
  }

  const survivorIds = new Set(stage.map((a) => a.id));

  // 2. Overrides — fixed post-chain step OUTSIDE the chain (shared with
  //    selectAnchors via overrides.js). Resolve against the FULL input list.
  const byId = new Map();
  list.forEach((a) => byId.set(a.id, a));
  const orphans = applyOverrides(survivorIds, list, byId, opts.overrides);

  // 3. Survivors in ORIGINAL input order.
  const survivors = list.filter((a) => survivorIds.has(a.id));

  return { survivors, orphans, sequence };
}
