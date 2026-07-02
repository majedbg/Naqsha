// ExtractionPipeline — staged orchestration over the deep CV modules (S0
// spine, issue #49; PRD #48 "Orchestration").
//
// S0 sequence: flatten (stub — reports 'skipped'; the auto-rectify slice
// replaces the stub behind the same stage, locked decision 2) → trace
// (contour Vectorizer). Later slices insert lattice/symmetry/palette stages
// here without touching callers: the contract is the (input, onProgress) →
// result shape, not the stage list.
//
// Pure and worker-agnostic: runs identically inline (tests, no-Worker
// fallback) and inside extraction.worker.js.

import { vectorize } from './vectorizer';

/**
 * @param {{ image: {data: Uint8ClampedArray, width: number, height: number},
 *           options?: { trace?: object } }} input
 * @param {(p: {stage: string, status: string}) => void} [onProgress]
 * @returns {Promise<{ tile: {width,height,fills,strokes}, lattice: null,
 *                     components: object[], confidence: {trace: number} }>}
 *   `components` (S6, issue #55) carries BOTH representations per motif
 *   ({kind, role, contour, centerline}) so the Review step can flip a shape's
 *   role and toggle centerline↔contour; tile.fills/strokes are the
 *   centerline-default presentation derived from them (locked decision 9).
 */
export async function runExtraction({ image, options = {} }, onProgress = () => {}) {
  // Stage: flatten. S0 ships skip-only (locked decision 2 — the stepper stage
  // exists; auto plane detection + manual quad land in a later slice).
  onProgress({ stage: 'flatten', status: 'skipped' });

  // Stage: trace (guaranteed single-motif floor — locked decision 8). S6:
  // contours + skeleton centerlines, classified per motif.
  onProgress({ stage: 'trace', status: 'running' });
  const { fills, strokes, components } = await vectorize(image, options.trace);
  onProgress({ stage: 'trace', status: 'done' });

  return {
    tile: { width: image.width, height: image.height, fills, strokes },
    lattice: null, // S1 seam: lattice detection replaces this null
    components,
    confidence: {
      // Crude S0 signal: geometry found = confident enough to proceed. The
      // real per-stage confidence model lands with the detectors.
      trace: fills.length + strokes.length > 0 ? 1 : 0,
    },
  };
}
