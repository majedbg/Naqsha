// sieveCounts — per-stage anchor counts for the Motif device's per-block
// "anchor chips" (Variant D). Pure, deterministic, headless (no p5/DOM/React).
//
// The Motif rack shows, on each block, how the selection chain NARROWS the anchor
// set stage by stage (e.g. 40→35→29→24). This module produces those numbers by
// REUSING the engine's real stage semantics — it never re-implements filtering.
// The counts equal exactly what `runSelectionChain` does at each stage, obtained
// through that function's opt-in `onStage` trace hook (chain.js), so the chip
// display can never silently drift from what actually renders.
//
// SHAPE (documented — the task permits an array-with-final-entry OR a field; we
// use a field for unambiguity across the no-sequence and future override paths):
//   {
//     stages:   Array<{blockIndex, type, inCount, outCount, bypassed}>,
//     selected: number,   // final SELECTION survivor count (post-override)
//     placed:   number,   // non-rest placements after the terminal Sequencer
//   }
//   • `stages` has one entry per FILTER block (route/everyN/skip/density/field),
//     in ORIGINAL chain order, `blockIndex` being its index in the input chain
//     (stable across the partitioned-out sequence block). A bypassed block is a
//     pass-through: inCount === outCount, bypassed:true.
//   • The terminal `sequence` block, WHEN PRESENT, is appended as a trailing
//     stage `{blockIndex, type:'sequence', inCount:selected, outCount:placed}` so
//     the UI can chip every rack block uniformly. It reflects execution-LAST
//     (the Sequencer deals after all filters) even if positioned mid-chain — the
//     rack enforces it terminal anyway.
//
// SELECTION vs PLACEMENT (two different counts):
//   • `selected` — how many anchors survive the SELECTION chain (what the last
//     filter chip shows). A Sequencer does NOT narrow selection.
//   • `placed` — how many of those survivors actually receive a glyph after the
//     Sequencer deals. A Rest slot occupies a beat but places nothing, so rests
//     REDUCE `placed` below `selected`. Computed by REUSING `dealSlots` (the
//     engine's real sequencer), then counting non-rest assignments. With no
//     sequence (or a degenerate empty-slots one, where the engine falls back to
//     its single-glyph path) `placed === selected`.
//
// PRE-CAP / PRE-GEOMETRY (documented): `placed` is PURE chain+sequencer
// semantics. It does NOT bake in the MAX_PLACEMENTS truncation nor the empty-
// circle acceptance test in `resolvePlacements` — those are downstream geometry.
// On a worked example with no geometric rejections, `placed` equals
// `resolvePlacements(...).placements.length` exactly (asserted in the tests); the
// two diverge only when the host is crowded (no-fit/below-floor) or the cap fires,
// which are not chain semantics and are surfaced separately by placementStats.
//
// OVERRIDES (documented): the fixed post-chain include/exclude step (ADR-0004) is
// NOT a chain block. `stages` counts are PRE-override (per-filter); `selected`
// (and therefore `placed`) reflect the POST-override survivor set the same way
// the render seam does.

import { runSelectionChain } from './chain.js';
import { dealSlots } from './sequencer.js';

/**
 * @param {Array<object>} chain  the selection chain (may include a terminal sequence block).
 * @param {import('./chain.js').Anchor[]} anchors
 * @param {{canvasW?:number, canvasH?:number, overrides?:object}} [opts]  threaded verbatim to runSelectionChain.
 * @returns {{stages: Array<{blockIndex:number, type:string, inCount:number, outCount:number, bypassed:boolean}>, selected:number, placed:number}}
 */
export function sieveCounts(chain, anchors, opts = {}) {
  const list = Array.isArray(anchors) ? anchors : [];

  const stages = [];
  const { survivors, sequence } = runSelectionChain(list, chain, {
    ...opts,
    onStage: (e) => {
      stages.push({
        blockIndex: e.blockIndex,
        type: e.type,
        inCount: e.inCount,
        outCount: e.outCount,
        bypassed: e.bypassed,
      });
    },
  });

  const selected = survivors.length;

  // Placement (rest-accounting) via the engine's real sequencer. dealSlots
  // returns null for an absent/degenerate (empty-slots) block — the engine then
  // uses its single-glyph path, so every survivor places ⇒ placed === selected.
  let placed = selected;
  if (sequence) {
    const assignments = dealSlots(survivors, sequence);
    if (assignments) placed = assignments.filter((a) => !a.rest).length;
    stages.push({
      blockIndex: sequenceIndexIn(chain, sequence),
      type: 'sequence',
      inCount: selected,
      outCount: placed,
      bypassed: false,
    });
  }

  return { stages, selected, placed };
}

/** Original chain index of the (reference-identical) terminal sequence block. */
function sequenceIndexIn(chain, sequence) {
  return Array.isArray(chain) ? chain.indexOf(sequence) : -1;
}
