// Extraction Web Worker — runs the pipeline off the main thread so the p5
// canvas never blocks (locked decision 11). Speaks the WorkerBridge protocol:
//
//   in : { type: 'start', id, image: {data,width,height}, options }
//   out: { type: 'progress', id, stage, status }
//        { type: 'result',   id, result }
//        { type: 'error',    id, message }

import { runExtraction } from './pipeline';

self.onmessage = async (e) => {
  const { type, id, image, options } = e.data || {};
  if (type !== 'start') return;
  try {
    const result = await runExtraction({ image, options }, (p) => {
      self.postMessage({ type: 'progress', id, ...p });
    });
    self.postMessage({ type: 'result', id, result });
  } catch (err) {
    self.postMessage({ type: 'error', id, message: err?.message || String(err) });
  }
};
