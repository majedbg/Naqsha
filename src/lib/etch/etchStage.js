// etchStage — the Stage model, ordered Stack application, and SCREENING SEMANTICS
// for the Etch Stack (Raster Etch S2/S3, issues #81/#82; vocabulary is LAW —
// CONTEXT.md → Raster Etch, ADR-0007). A **Stage** is one unit in an **Etch
// Stack**, held as document state on the Etch layer's params. This is a DISTINCT
// raster subsystem from the motif Chain/Block: it shares only the "ordered and
// reorderable" property, none of the vocabulary or code (ADR-0007).
//
// Two KINDS of Stage (S3, decision 8):
//   • FIELD Stages (Tone now; Paper later) transform the continuous luma field,
//     field→field, in stack order — via applyStage.
//   • SCREENING Stages (Dither now; Halftone in S5) convert the field → 1-bit
//     `bits`. This is the TERMINAL producer — via screenStage.
//
// THE ONE SCREENING RULE (pinned by etchStage.test + etchProcess.test):
//   Exactly one screening Stage is active at a time — the FIRST non-bypassed
//   screening Stage in Stack order (deterministic winner if a doc/UI ever carries
//   two; the rack badges the non-winning ones). With an active screen present, it
//   produces the output; with none (empty, or all bypassed) the plain
//   globalMask fallback runs — byte-identical to the S1/S2 path. Field Stages
//   ABOVE the active screen shape the field feeding it; Stages BELOW it are
//   post-screen (bits→bits) — the clean seam S6 Paper's before/after placement
//   drops into, NOT built here (they are simply not run as field ops today).
//
// A Stage is a plain, JSON-serializable object: { id, type, bypassed, params }.
// An unknown Stage type is a field no-op (forward-compat seam) so a document
// carrying a not-yet-implemented Stage never throws under an older build.
//
// PURE typed-array math, no DOM — runs on the main thread, in etch.worker, and
// under vitest identically.

import { applyToneField, NEUTRAL_LEVELS } from './etchTone.js';
import { ditherField, DEFAULT_DITHER_MODE } from './etchDither.js';

/** Stage `type` discriminator for a Tone Stage (exposure/brightness/contrast + Levels). */
export const STAGE_TONE = 'tone';

/** Stage `type` discriminator for a Dither Stage (the screening producer, S3). */
export const STAGE_DITHER = 'dither';

/**
 * The set of screening Stage types — the terminal field→bits producers. Dither
 * is the only one this slice; Halftone (S5) joins here and everything downstream
 * (the exactly-one rule, the rack badge) keeps working with no other change.
 */
export const SCREENING_STAGE_TYPES = new Set([STAGE_DITHER]);

/** True when a Stage screens the field into 1-bit bits (vs transforms the field). */
export function isScreeningStage(stage) {
  return !!stage && SCREENING_STAGE_TYPES.has(stage.type);
}

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

/**
 * Build a fresh Dither Stage — the screening producer. Defaults to
 * Floyd–Steinberg (smoothest gradient) at size 1 (full-resolution dots). Not
 * bypassed by default, so adding it immediately screens (replacing the plain cut).
 */
export function createDitherStage() {
  return {
    id: makeStageId(STAGE_DITHER),
    type: STAGE_DITHER,
    bypassed: false,
    params: { mode: DEFAULT_DITHER_MODE, size: 1 },
  };
}

/** Build a Stage of the given type (Tone or Dither this slice; S5+ add more). */
export function createStage(type = STAGE_TONE) {
  switch (type) {
    case STAGE_DITHER:
      return createDitherStage();
    case STAGE_TONE:
    default:
      return createToneStage();
  }
}

/**
 * Apply ONE FIELD Stage to a luma field (field→field). Dispatch by type; a
 * screening Stage (dither) and any unknown type return the SAME field object
 * unchanged — screening is NOT a field op (it runs at the terminal via
 * screenStage), and forward-compat keeps an unbuilt Stage from throwing.
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
 * The index of the active screening Stage — the FIRST non-bypassed screening
 * Stage in Stack order — or -1 when none screens (the globalMask fallback path).
 * This single deterministic choice IS the exactly-one-screen rule.
 */
export function activeScreeningIndex(stack) {
  if (!Array.isArray(stack)) return -1;
  for (let i = 0; i < stack.length; i++) {
    const stage = stack[i];
    if (stage && !stage.bypassed && isScreeningStage(stage)) return i;
  }
  return -1;
}

/** The active screening Stage object (or null) — see activeScreeningIndex. */
export function activeScreeningStage(stack) {
  const i = activeScreeningIndex(stack);
  return i < 0 ? null : stack[i];
}

/**
 * Screen a field to 1-bit `bits` through a screening Stage (field→bits, the
 * terminal producer). `opts` carries the Etch's threshold/invert. Only Dither
 * exists this slice; Halftone (S5) adds one case.
 *
 * @param {{gray:Float64Array, alpha, width:number, height:number}} field
 * @param {{type:string, params?:object}} stage
 * @param {{threshold?:number, invert?:boolean}} [opts]
 * @returns {Uint8Array} bits
 */
export function screenStage(field, stage, opts = {}) {
  switch (stage?.type) {
    case STAGE_DITHER:
      return ditherField(field, stage.params, opts);
    default:
      return null; // not a screening Stage — caller uses the plain fallback
  }
}

/**
 * Apply the FIELD Stages that sit ABOVE the active screen (or all of them when
 * none screens) to a luma field. Non-bypassed field Stages run in array order;
 * screening Stages and every Stage below the active screen are skipped (the
 * latter are post-screen ops — the S6 seam, not run today). An empty/missing
 * stack returns the SAME field object, keeping the no-stack path byte-identical.
 *
 * @param {{gray:Float64Array, alpha, width:number, height:number}} field
 * @param {Array<{type:string, bypassed?:boolean, params?:object}>} [stack]
 */
export function applyFieldStages(field, stack) {
  if (!Array.isArray(stack) || stack.length === 0) return field;
  const k = activeScreeningIndex(stack);
  const end = k < 0 ? stack.length : k; // Stages below the screen are post-screen
  let f = field;
  for (let i = 0; i < end; i++) {
    const stage = stack[i];
    if (!stage || stage.bypassed) continue; // bypass = identity (no op runs)
    if (isScreeningStage(stage)) continue; // a bypassed earlier screen isn't a field op
    f = applyStage(f, stage);
  }
  return f;
}
