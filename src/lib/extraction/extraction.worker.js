// Extraction Web Worker — runs the pipeline off the main thread so the p5
// canvas never blocks (locked decision 11). Speaks the WorkerBridge protocol:
//
//   in : { type: 'start',  id, image: {data,width,height}, options }
//        { type: 'cancel', id }   — cooperative abort of a running extraction
//   out: { type: 'progress',  id, stage, status, progress?, error? }
//        { type: 'result',    id, result }
//        { type: 'error',     id, message }   — the PIPELINE failed on this input
//        { type: 'cancelled', id }            — ack: the cancel took effect
//
// The worker stays alive across extractions so lazily loaded stage deps
// (models/wasm) stay warm — cancellation aborts the run, not the worker.

import { runExtraction } from './pipeline';

const controllers = new Map(); // extraction id → AbortController

self.onmessage = async (e) => {
  const { type, id, image, options } = e.data || {};
  if (type === 'cancel') {
    controllers.get(id)?.abort();
    return;
  }
  if (type !== 'start') return;
  const controller = new AbortController();
  controllers.set(id, controller);
  try {
    const result = await runExtraction(
      { image, options },
      (p) => self.postMessage({ type: 'progress', id, ...p }),
      { signal: controller.signal }
    );
    self.postMessage({ type: 'result', id, result });
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
