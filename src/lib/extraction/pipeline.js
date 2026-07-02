// ExtractionPipeline — the staged-orchestration HARNESS the deep CV modules
// plug into (S2, issue #51; PRD #48 "Orchestration"). Stage definitions live
// in stages.js; this module knows nothing about any stage's payload shape.
//
// What the harness provides (see stages.js for the stage contract):
//   · stage registration      createPipeline(stages) — ordered stage list
//   · staged progress         onProgress({ stage, status, progress?, error? })
//                             status ∈ loading | running | done | skipped | failed
//   · cancellation            opts.signal (AbortSignal) — checked between
//                             stages, passed into stages for cooperative
//                             intra-stage aborts; throws AbortError
//   · per-stage confidence    result.confidence[stageId] ∈ 0..1
//   · lazy heavy deps         stage.loadDeps() runs once per runtime (cached,
//                             re-attempted after a failed load), with
//                             {status:'loading', progress} events
//   · per-stage error surface optional stages fail soft ({status:'failed'} +
//                             confidence 0, flow continues); required stages
//                             emit 'failed' then reject the pipeline
//
// Pure and worker-agnostic: runs identically inline (tests, no-Worker
// fallback) and inside extraction.worker.js. Every progress event and the
// result are structured-clone-serializable — they cross the worker boundary.

import { DEFAULT_STAGES } from './stages';

/** Error whose name marks a user cancellation (never a failure). */
export function makeAbortError() {
  const err = new Error('extraction cancelled');
  err.name = 'AbortError';
  return err;
}

// Lazy-dep cache: stage definition → Promise<deps>. Keyed by the stage OBJECT
// so a worker keeps its loaded models warm across extractions, while tests
// with fresh stage literals never share state.
const depsCache = new WeakMap();

function loadStageDeps(stage, onProgress) {
  if (!depsCache.has(stage)) {
    onProgress({ stage: stage.id, status: 'loading' });
    const promise = Promise.resolve(
      stage.loadDeps((progress) =>
        onProgress({ stage: stage.id, status: 'loading', progress })
      )
    );
    // A failed load must not poison the cache — the next run re-attempts.
    promise.catch(() => depsCache.delete(stage));
    depsCache.set(stage, promise);
  }
  return depsCache.get(stage);
}

/**
 * Build a pipeline over an ordered stage list.
 *
 * @param {Array} stages stage definitions (see stages.js contract)
 * @returns {(input: { image: {data: Uint8ClampedArray, width: number, height: number},
 *                     options?: object },
 *            onProgress?: (p: {stage: string, status: string, progress?: number, error?: string}) => void,
 *            opts?: { signal?: AbortSignal })
 *            => Promise<{ tile, lattice, confidence: Record<string, number> }>}
 */
export function createPipeline(stages = DEFAULT_STAGES) {
  return async function run({ image, options = {} }, onProgress = () => {}, { signal } = {}) {
    const throwIfAborted = () => {
      if (signal?.aborted) throw makeAbortError();
    };
    // ctx accumulates stage patches; output is the caller-facing subset (no
    // image/options echo). tile/lattice are pre-seeded so the result shape is
    // stable even before the stages that fill them exist/succeed.
    const ctx = { image, options };
    const output = { tile: null, lattice: null };
    const confidence = {};

    for (const stage of stages) {
      throwIfAborted();
      if (stage.skip?.(ctx)) {
        onProgress({ stage: stage.id, status: 'skipped' });
        continue;
      }
      try {
        const deps = stage.loadDeps ? await loadStageDeps(stage, onProgress) : undefined;
        throwIfAborted();
        onProgress({ stage: stage.id, status: 'running' });
        const report = (progress) =>
          onProgress({ stage: stage.id, status: 'running', progress });
        const res = (await stage.run(ctx, { deps, report, signal })) || {};
        if (res.patch) {
          Object.assign(ctx, res.patch);
          Object.assign(output, res.patch);
        }
        if (typeof res.confidence === 'number') confidence[stage.id] = res.confidence;
        onProgress({ stage: stage.id, status: 'done' });
      } catch (err) {
        if (err?.name === 'AbortError') throw err; // cancellation, not failure
        onProgress({ stage: stage.id, status: 'failed', error: err?.message || String(err) });
        if (stage.optional) {
          confidence[stage.id] = 0;
          continue; // fail-soft: the flow allows skipping this stage
        }
        throw err;
      }
    }

    return { ...output, confidence };
  };
}

/** The default v1 pipeline (flatten → trace; later slices extend stages.js). */
export const runExtraction = createPipeline();

/**
 * Serializable stage descriptors for the UI (progress rails render the list
 * without importing any heavy stage internals — deps stay lazy).
 */
export function listStages(stages = DEFAULT_STAGES) {
  return stages.map(({ id, label, optional }) => ({ id, label, optional: !!optional }));
}
