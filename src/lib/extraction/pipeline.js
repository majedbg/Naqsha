// ExtractionPipeline — staged orchestration over the deep CV modules (S0
// spine, issue #49; PRD #48 "Orchestration").
//
// Sequence: flatten (S3, issue #52 — rectifies when a quad is supplied,
// reports 'skipped' otherwise; S4 adds detectQuad in FRONT of this stage,
// locked decision 2) → trace (contour Vectorizer). Later slices insert
// lattice/symmetry/palette stages here without touching callers: the
// contract is the (input, onProgress) → result shape, not the stage list.
//
// Pure and worker-agnostic: runs identically inline (tests, no-Worker
// fallback) and inside extraction.worker.js.

import { traceContours } from './vectorizer';
import { rectify } from './rectifier';

/**
 * @param {{ image: {data: Uint8ClampedArray, width: number, height: number},
 *           options?: { trace?: object,
 *                       flatten?: { quad: {x,y}[], maxDim?: number } } }} input
 *   `options.flatten.quad` ([TL,TR,BR,BL] in image pixels) runs the flatten
 *   stage before tracing; omit it to skip (photo already flat).
 * @param {(p: {stage: string, status: string}) => void} [onProgress]
 * @returns {Promise<{ tile: {width,height,fills,strokes}, lattice: null,
 *                     confidence: {trace: number} }>}
 */
export async function runExtraction({ image, options = {} }, onProgress = () => {}) {
  // Stage: flatten (S3, issue #52). Manual quad → perspective rectify; no
  // quad → skipped (the "already flat" escape hatch, locked decision 2).
  let working = image;
  if (options.flatten?.quad) {
    onProgress({ stage: 'flatten', status: 'running' });
    const { rectified } = rectify(image, options.flatten.quad, options.flatten);
    working = rectified;
    onProgress({ stage: 'flatten', status: 'done' });
  } else {
    onProgress({ stage: 'flatten', status: 'skipped' });
  }

  // Stage: trace (guaranteed single-motif floor — locked decision 8).
  onProgress({ stage: 'trace', status: 'running' });
  const { fills, strokes } = await traceContours(working, options.trace);
  onProgress({ stage: 'trace', status: 'done' });

  return {
    tile: { width: working.width, height: working.height, fills, strokes },
    lattice: null, // S1 seam: lattice detection replaces this null
    confidence: {
      // Crude S0 signal: geometry found = confident enough to proceed. The
      // real per-stage confidence model lands with the detectors.
      trace: fills.length + strokes.length > 0 ? 1 : 0,
    },
  };
}

/**
 * Standalone flatten (S3, issue #52): the Flatten step warps at APPLY time —
 * before Select — so the user sees the before/after and crops in rectified
 * space. Same stage vocabulary as runExtraction, same worker-agnostic purity;
 * extraction.worker.js exposes it as the 'start-rectify' message.
 *
 * @param {{ image: {data: Uint8ClampedArray, width: number, height: number},
 *           quad: {x:number,y:number}[], options?: { maxDim?: number } }} input
 * @param {(p: {stage: string, status: string}) => void} [onProgress]
 * @returns {Promise<{ rectified: {data,width,height}, homography: number[] }>}
 */
export async function runRectify({ image, quad, options = {} }, onProgress = () => {}) {
  onProgress({ stage: 'flatten', status: 'running' });
  const result = rectify(image, quad, options);
  onProgress({ stage: 'flatten', status: 'done' });
  return result;
}
