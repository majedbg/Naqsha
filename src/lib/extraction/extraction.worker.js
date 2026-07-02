// Extraction Web Worker — runs the pipeline off the main thread so the p5
// canvas never blocks (locked decision 11). Speaks the WorkerBridge protocol:
//
//   in : { type: 'start',         id, image: {data,width,height}, options }
//        { type: 'start-rectify', id, image, quad, options }   (S3, issue #52)
//   out: { type: 'progress', id, stage, status }
//        { type: 'result',   id, result }
//        { type: 'error',    id, message }

import { runExtraction, runRectify } from './pipeline';

self.onmessage = async (e) => {
  const { type, id, image, quad, options } = e.data || {};
  if (type !== 'start' && type !== 'start-rectify') return;
  const onProgress = (p) => self.postMessage({ type: 'progress', id, ...p });
  try {
    if (type === 'start-rectify') {
      const result = await runRectify({ image, quad, options }, onProgress);
      // Transfer the rectified buffer back zero-copy — it can be megapixels.
      self.postMessage({ type: 'result', id, result }, [result.rectified.data.buffer]);
      return;
    }
    const result = await runExtraction({ image, options }, onProgress);
    self.postMessage({ type: 'result', id, result });
  } catch (err) {
    self.postMessage({ type: 'error', id, message: err?.message || String(err) });
  }
};
