// Etch Web Worker — runs the pure source→1-bit conversion off the main thread so
// the p5 canvas never blocks on pixel work (Raster Etch S1, issue #80; mirrors
// the extraction.worker pattern, grilled decision 4). Deliberately thin: it owns
// no watchdog/cancel/failover machinery (that lives in the far heavier
// extraction bridge and is not warranted for a single stateless threshold) — it
// just applies etchSourceToBitmap and transfers the resulting bits back.
//
//   in : { type: 'etch', id, image: {data,width,height}, options }
//   out: { type: 'result', id, bits: Uint8Array, held: Uint8Array, width, height }
//        { type: 'error',  id, message }

import { etchSourceToBitmap } from './etchProcess.js';

self.onmessage = (e) => {
  const { type, id, image, options } = e.data || {};
  if (type !== 'etch') return;
  try {
    const { bits, held, width, height } = etchSourceToBitmap(image, options || {});
    // Transfer bits (the single-source buffer) AND held (the preview-only shading
    // mask, S4 #83) back zero-copy. held rides alongside; export ignores it.
    self.postMessage({ type: 'result', id, bits, held, width, height }, [bits.buffer, held.buffer]);
  } catch (err) {
    self.postMessage({ type: 'error', id, message: err?.message || String(err) });
  }
};
