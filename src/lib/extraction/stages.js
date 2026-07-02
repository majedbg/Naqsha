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
import { rectify } from './rectifier';

// Stage: flatten (S3, issue #52 — manual 4-corner rectify; locked decision 2).
// Runs when the caller supplies `options.flatten.quad` ([TL,TR,BR,BL] in image
// pixels); otherwise skipped — the "already flat" escape hatch. Patches
// ctx.image so every later stage (trace, lattice…) works in flattened space.
// `optional` (fail-soft): a quad that cannot warp emits {status:'failed'} +
// confidence 0 and the flow continues on the unrectified image — never a dead
// end (locked decision 8). The manual Flatten STEP warps through runRectify
// below instead, where a bad quad rejects loudly at apply time.
export const flattenStage = {
  id: 'flatten',
  label: 'Flatten',
  optional: true,
  skip: (ctx) => !ctx.options?.flatten?.quad,
  async run(ctx, { signal } = {}) {
    signal?.throwIfAborted?.();
    const { rectified } = rectify(ctx.image, ctx.options.flatten.quad, ctx.options.flatten);
    return { patch: { image: rectified }, confidence: 1 };
  },
};

/**
 * Standalone flatten (S3, issue #52): the Flatten step warps at APPLY time —
 * before Select — so the user sees the before/after and crops in rectified
 * space. Same stage vocabulary as the pipeline, same worker-agnostic purity;
 * extraction.worker.js exposes it as the 'start-rectify' message. Unlike the
 * fail-soft pipeline stage, an invalid quad REJECTS here — the user asked for
 * this exact warp and must see why it can't happen.
 *
 * @param {{ image: {data: Uint8ClampedArray, width: number, height: number},
 *           quad: {x:number,y:number}[], options?: { maxDim?: number } }} input
 * @param {(p: {stage: string, status: string}) => void} [onProgress]
 * @param {{ signal?: AbortSignal }} [opts]
 * @returns {Promise<{ rectified: {data,width,height}, homography: number[] }>}
 */
export async function runRectify({ image, quad, options = {} }, onProgress = () => {}, { signal } = {}) {
  signal?.throwIfAborted?.();
  onProgress({ stage: 'flatten', status: 'running' });
  const result = rectify(image, quad, options);
  signal?.throwIfAborted?.();
  onProgress({ stage: 'flatten', status: 'done' });
  return result;
}

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
