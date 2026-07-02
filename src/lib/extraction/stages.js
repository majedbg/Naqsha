// Extraction stages — the stage definitions the ExtractionPipeline harness
// runs (S2, issue #51; PRD #48 "Orchestration" + module map).
//
// THE STAGE CONTRACT every CV slice implements (S3 rectify, S5 lattice,
// S7 symmetry, S11 SAM2 region assist…):
//
//   export const myStage = {
//     id: 'lattice',            // stable id used in progress events + confidence map
//     label: 'Detect repeat',   // human label for the stepper's progress UI
//     optional: true,           // fail-soft: an error emits {status:'failed'} and
//                               // the flow continues (confidence[id] = 0).
//                               // Omit/false → an error aborts the pipeline.
//     skip(ctx) { … },          // optional; truthy → emit {status:'skipped'} and
//                               // move on (e.g. user chose "already flat").
//     async loadDeps(report) {  // optional; heavy model/wasm deps, loaded ONCE
//       report(0.4);            // per runtime on first use (cached across runs,
//       return { cv };          // re-attempted after a failed load). report(0..1)
//     },                        // emits {status:'loading', progress}.
//     async run(ctx, { deps, report, signal }) {
//       signal?.throwIfAborted?.();  // cooperative cancellation between chunks
//       report(0.5);                 // {status:'running', progress: 0.5}
//       return {
//         patch: { lattice },        // shallow-merged into ctx AND the result —
//                                    // payload shapes are the stage's business,
//                                    // the harness never inspects them
//         confidence: 0.8,           // 0..1, recorded as confidence[id]
//       };
//     },
//   };
//
// Stages read what they need from ctx (ctx.image, ctx.options, ctx.tile,
// ctx.lattice, …) and patch what they produce. A later stage sees every
// earlier patch (e.g. rectify patches ctx.image; trace reads it).

import { traceContours } from './vectorizer';

// Stage: flatten. Skip-only stub (locked decision 2) — the stage EXISTS so the
// S3 auto-rectify slice replaces `skip` + adds `run` behind the same id
// without touching the harness or callers.
export const flattenStage = {
  id: 'flatten',
  label: 'Flatten',
  optional: true,
  skip: () => true,
};

// Stage: trace — the guaranteed single-motif floor (locked decision 8). Wraps
// the contour Vectorizer; the centerline slice extends traceContours' output
// shape ({ fills, strokes }) and this patch carries it through untouched.
export const traceStage = {
  id: 'trace',
  label: 'Trace',
  async run(ctx) {
    const { fills, strokes } = await traceContours(ctx.image, ctx.options?.trace);
    return {
      patch: {
        tile: { width: ctx.image.width, height: ctx.image.height, fills, strokes },
      },
      // Crude S0 signal: geometry found = confident enough to proceed. The
      // real per-stage confidence model lands with the detectors.
      confidence: fills.length + strokes.length > 0 ? 1 : 0,
    };
  },
};

// The v1 pipeline. Later slices insert stages here (flatten → lattice →
// symmetry → trace → palette…) without touching the harness or the callers.
export const DEFAULT_STAGES = [flattenStage, traceStage];
