// Extraction Web Worker — runs the pipeline off the main thread so the p5
// canvas never blocks (locked decision 11). Speaks the WorkerBridge protocol:
//
//   in : { type: 'start',         id, image: {data,width,height}, options }
//        { type: 'start-rectify', id, image, quad, options }  — the Flatten
//                                 step's apply-time warp (S3, issue #52)
//        { type: 'cancel', id }   — cooperative abort of a running job
//   out: { type: 'progress',  id, stage, status, progress?, error? }
//        { type: 'result',    id, result }
//        { type: 'error',     id, message }   — the PIPELINE failed on this input
//        { type: 'cancelled', id }            — ack: the cancel took effect
//
// The worker stays alive across extractions so lazily loaded stage deps
// (models/wasm) stay warm — cancellation aborts the run, not the worker.

import { runExtraction } from './pipeline';
import { runRectify } from './stages';

const controllers = new Map(); // job id → AbortController

self.onmessage = async (e) => {
  const { type, id, image, quad, options } = e.data || {};
  if (type === 'cancel') {
    controllers.get(id)?.abort();
    return;
  }
  if (type !== 'start' && type !== 'start-rectify') return;
  const controller = new AbortController();
  controllers.set(id, controller);
  const onProgress = (p) => self.postMessage({ type: 'progress', id, ...p });
  try {
    if (type === 'start-rectify') {
      const result = await runRectify({ image, quad, options }, onProgress, {
        signal: controller.signal,
      });
      // Transfer the rectified buffer back zero-copy — it can be megapixels.
      self.postMessage({ type: 'result', id, result }, [result.rectified.data.buffer]);
    } else {
      const result = await runExtraction({ image, options }, onProgress, {
        signal: controller.signal,
      });
      self.postMessage({ type: 'result', id, result });
    }
  } catch (err) {
    if (err?.name === 'AbortError') {
      self.postMessage({ type: 'cancelled', id });
    } else {
      self.postMessage({ type: 'error', id, message: err?.message || String(err) });
    }
  } finally {
    controllers.delete(id);
  }
};
