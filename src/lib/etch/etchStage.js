// etchStage — the Stage model and ordered Stack application for the Etch Stack
// (Raster Etch S2, issue #81; vocabulary is LAW — CONTEXT.md → Raster Etch,
// ADR-0007). A **Stage** is one unit in an **Etch Stack**: it transforms the
// continuous luma field an Etch flows through before the tail screening cut. The
// Stack is an ordered, reorderable, per-Stage-bypassable array held on the Etch
// layer's params (document state — order round-trips through save/load). This is
// a DISTINCT raster subsystem from the motif Chain/Block: it shares only the
// "ordered and reorderable" property, none of the vocabulary or code (ADR-0007).
//
// A Stage is a plain, JSON-serializable object: { id, type, bypassed, params }.
// applyStack walks it and dispatches each non-bypassed Stage through applyStage
// to a field→field function. The ONLY real Stage this slice is Tone (etchTone);
// a future screening/dither/paper Stage adds one `case` to applyStage and a
// builder to createStage — an unknown type returns the field unchanged today so
// a document carrying a not-yet-implemented Stage never throws (forward-compat seam).
//
// PURE typed-array math, no DOM — runs on the main thread, in etch.worker, and
// under vitest identically.

import { applyToneField, NEUTRAL_LEVELS } from './etchTone.js';

/** Stage `type` discriminator for a Tone Stage (exposure/brightness/contrast + Levels). */
export const STAGE_TONE = 'tone';

let stageSeq = 0;
/** Unique-within-a-document Stage id. Persisted; only needs stable uniqueness. */
function makeStageId(type) {
  stageSeq += 1;
  return `${type}-${stageSeq}-${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * Build a fresh Tone Stage with NEUTRAL (identity) params — added but untouched,
 * it changes nothing until a control moves (the default-params identity guard
 * lives in applyToneField). Not bypassed by default.
 */
export function createToneStage() {
  return {
    id: makeStageId(STAGE_TONE),
    type: STAGE_TONE,
    bypassed: false,
    params: { exposure: 0, brightness: 0, contrast: 0, levels: { ...NEUTRAL_LEVELS } },
  };
}

/** Build a Stage of the given type. Only Tone exists this slice (S3+ add more). */
export function createStage(type = STAGE_TONE) {
  switch (type) {
    case STAGE_TONE:
    default:
      return createToneStage();
  }
}

/**
 * Apply ONE Stage to a luma field (field→field). Dispatch by type; an unknown
 * type returns the same field object unchanged so a document with a future Stage
 * never throws under an older build.
 */
export function applyStage(field, stage) {
  switch (stage?.type) {
    case STAGE_TONE:
      return applyToneField(field, stage.params);
    default:
      return field;
  }
}

/**
 * Apply an ordered Etch Stack to a luma field. Non-bypassed Stages run in array
 * order; a bypassed Stage is SKIPPED entirely — which makes bypass a pixel-exact
 * no-op by construction (the field object flows past untouched, so no float math
 * runs on it at all). An empty/missing stack returns the SAME field object.
 * This is the seam etchProcess drops between toGrayField and globalMask.
 *
 * @param {{gray:Float64Array, alpha, width:number, height:number}} field
 * @param {Array<{type:string, bypassed?:boolean, params?:object}>} [stack]
 */
export function applyStack(field, stack) {
  if (!Array.isArray(stack) || stack.length === 0) return field;
  let f = field;
  for (const stage of stack) {
    if (!stage || stage.bypassed) continue; // bypass = identity (no op runs)
    f = applyStage(f, stage);
  }
  return f;
}
