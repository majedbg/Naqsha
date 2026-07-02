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

import { vectorize } from './vectorizer';
import { rectify } from './rectifier';
import {
  detectLattice,
  snapRectangular,
  classifyLatticeType,
  MIN_LATTICE_CONFIDENCE,
} from './lattice';

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

// --- lattice (S5, issue #54) -------------------------------------------------

/** Pure typed-array crop — no canvas, so it runs in the worker and node. */
function cropImage(image, { x, y, width, height }) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let row = 0; row < height; row++) {
    const src = ((y + row) * image.width + x) * 4;
    data.set(image.data.subarray(src, src + width * 4), row * width * 4);
  }
  return { data, width, height };
}

/** Clamp + round a caller cell rect into the image, or null when degenerate. */
function clampCell(cell, image) {
  const x = Math.max(0, Math.min(image.width - 4, Math.round(Number(cell?.x) || 0)));
  const y = Math.max(0, Math.min(image.height - 4, Math.round(Number(cell?.y) || 0)));
  const width = Math.round(Number(cell?.width));
  const height = Math.round(Number(cell?.height));
  if (!Number.isFinite(width) || !Number.isFinite(height)) return null;
  const w = Math.min(width, image.width - x);
  const h = Math.min(height, image.height - y);
  if (w < 4 || h < 4) return null;
  return { x, y, width: w, height: h };
}

// Stage: lattice (S5, issue #54) — detect the repeat structure and reduce the
// working image to ONE repeat cell.
//
// PLACEMENT (architectural call, documented per the S5 brief): between
// flatten and trace. It must run AFTER flatten because lattice math needs the
// fronto-parallel raster (locked decision 2), and BEFORE trace because its
// whole job is to shrink trace's input: on success it crops ctx.image to a
// single repeat cell, so the vectorized tile IS the repeat unit and the
// generator tiles it via t1/t2. On low confidence / no repeat / failure it
// patches NOTHING — trace sees the full selection and produces the
// single-motif floor, byte-identical to the pre-S5 flow (locked decision 8).
//
// Caller contract via ctx.options.lattice:
//   false             → user opt-out ("no repeat"): stage skips, floor wins.
//   { cell: {x,y,width,height} }
//                     → user-corrected repeat cell (the Review drag): no
//                       detection; the given cell (clamped into the image) is
//                       cropped with confidence 1 and axis-aligned vectors.
//   undefined         → auto-detect. Engages only when BOTH the verified
//                       confidence clears MIN_LATTICE_CONFIDENCE AND the
//                       basis snaps to an axis-aligned cell.
//
// Patches on success:
//   image       → the cell raster (trace input)
//   lattice     → { t1, t2, cell, type, confidence } (entity-bound, validated
//                 shape — rides user_patterns.lattice)
//   latticeCell → { x, y, width, height } in SELECTION pixels, for the Review
//                 overlay (UI-only; never persisted)
//
// SEAMS (deferred, documented in lattice.js): Park TPAMI-2009 deformable
// refine; oblique parallelogram cells (detected + reported by detectLattice,
// tests prove basis recovery, but the v1 crop-and-tile path is rectangular —
// oblique falls to the floor); anchor-phase optimization (v1 anchors the cell
// at the selection origin — the user can drag it).
export const latticeStage = {
  id: 'lattice',
  label: 'Detect repeat',
  optional: true,
  skip: (ctx) => ctx.options?.lattice === false,
  async run(ctx, { report, signal } = {}) {
    signal?.throwIfAborted?.();

    // User-corrected cell (Review drag): authoritative, confidence 1.
    const userCell = ctx.options?.lattice?.cell;
    if (userCell) {
      const cell = clampCell(userCell, ctx.image);
      if (!cell) throw new Error('lattice: repeat cell is outside the image');
      const t1 = [cell.width, 0];
      const t2 = [0, cell.height];
      return {
        patch: {
          image: cropImage(ctx.image, cell),
          lattice: {
            t1,
            t2,
            cell: { width: cell.width, height: cell.height },
            type: classifyLatticeType(t1, t2),
            confidence: 1,
          },
          latticeCell: cell,
        },
        confidence: 1,
      };
    }

    report?.(0.2);
    const detected = detectLattice(ctx.image);
    signal?.throwIfAborted?.();
    report?.(0.8);
    if (!detected || detected.confidence < MIN_LATTICE_CONFIDENCE) {
      // No repeat evidenced — patch nothing; the single-motif floor wins
      // silently (locked decision 8). Confidence is still recorded so the UI
      // can say "no reliable repeat found".
      return { patch: {}, confidence: detected?.confidence ?? 0 };
    }
    const snapped = snapRectangular(detected);
    if (!snapped) {
      // Genuinely oblique basis: detection worked but the v1 rectangular
      // crop-and-tile path cannot represent it — floor (documented seam).
      return { patch: {}, confidence: detected.confidence };
    }
    const cell = clampCell({ x: 0, y: 0, ...snapped }, ctx.image);
    if (!cell) return { patch: {}, confidence: detected.confidence };
    const t1 = [cell.width, 0];
    const t2 = [0, cell.height];
    return {
      patch: {
        image: cropImage(ctx.image, cell),
        lattice: {
          t1,
          t2,
          cell: { width: cell.width, height: cell.height },
          type: classifyLatticeType(t1, t2),
          confidence: detected.confidence,
        },
        latticeCell: cell,
      },
      confidence: detected.confidence,
    };
  },
};

// Stage: trace — the guaranteed single-motif floor (locked decision 8). S6
// (issue #55): the full Vectorizer pass — closed contours + skeleton
// centerlines, classified per motif (line-work → centerline-default tagged
// score; solids → contour tagged engrave; locked decision 9). The patch also
// carries `components` (both representations per motif) so the Review step
// can flip a shape's role and toggle centerline↔contour — the harness never
// inspects the payload. Runs on ctx.image, which flatten may have patched to
// the rectified raster, so centerlines are traced in flattened space.
export const traceStage = {
  id: 'trace',
  label: 'Trace',
  async run(ctx) {
    const { fills, strokes, components } = await vectorize(ctx.image, ctx.options?.trace);
    return {
      patch: {
        tile: { width: ctx.image.width, height: ctx.image.height, fills, strokes },
        components,
      },
      // Crude S0 signal: geometry found = confident enough to proceed. The
      // real per-stage confidence model lands with the detectors.
      confidence: fills.length + strokes.length > 0 ? 1 : 0,
    };
  },
};

// The v1 pipeline. Later slices insert stages here (flatten → lattice →
// symmetry → trace → palette…) without touching the harness or the callers.
// S7 note: the symmetry stage belongs between lattice and trace — it reads
// the cell raster + ctx.lattice.
export const DEFAULT_STAGES = [flattenStage, latticeStage, traceStage];
