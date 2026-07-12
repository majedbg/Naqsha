// etchWorkerBridge — main↔worker seam for the Etch conversion (Raster Etch S1,
// issue #80). Mirrors workerBridge's shape at a fraction of the size: prefer a
// module Web Worker (Vite bundles etch.worker.js), transparently fall back to
// running the PURE conversion INLINE when Workers are unavailable (jsdom tests,
// exotic embeds). Same contract either way:
//
//   computeEtchBitmap(image, options, { workerFactory }) → Promise<EtchBitmap>
//
// The Etch's threshold is stateless and fast, so — unlike the extraction bridge
// — there is no cancel/drain/watchdog/one-in-flight machinery here (grilled
// decision 4 asks us to reuse the *pattern* of a worker, not the extraction
// bridge's full failover). Whatever runs, the returned EtchBitmap's `bits` is
// the single-source buffer both canvas render and SVG export consume.

import { etchSourceToBitmap } from './etchProcess.js';

function defaultWorkerFactory() {
  if (typeof Worker === 'undefined') return null;
  try {
    return new Worker(new URL('./etch.worker.js', import.meta.url), { type: 'module' });
  } catch {
    return null;
  }
}

let nextId = 1;

/**
 * Convert a decoded RGBA image to the canonical 1-bit Etch bitmap, off the main
 * thread when a Worker is available and inline otherwise.
 *
 * @param {{data: Uint8ClampedArray, width: number, height: number}} image
 * @param {{ threshold?: number, invert?: boolean }} [options]
 * @param {{ workerFactory?: (() => Worker|null) | null }} [opts]
 *   `workerFactory: null` forces the inline path (tests); production omits it.
 * @returns {Promise<{bits: Uint8Array, width: number, height: number}>}
 */
export function computeEtchBitmap(image, options = {}, opts = {}) {
  const factory = 'workerFactory' in opts ? opts.workerFactory : defaultWorkerFactory;
  const worker = typeof factory === 'function' ? factory() : null;
  if (!worker) {
    // Inline fallback — same pure function the worker would run.
    return Promise.resolve(etchSourceToBitmap(image, options));
  }
  const id = nextId++;
  // The worker path transfers image.data zero-copy, which NEUTERS the main-thread
  // buffer. Retain a private copy FIRST so a worker that fails to load (onerror)
  // can still fall back inline on valid pixels — falling back on the detached
  // original would threshold an empty buffer into an all-paper bitmap resolved as
  // a bogus success (mirrors the extraction bridge's `retained` guard).
  const retained = image?.data ? { ...image, data: new Uint8Array(image.data) } : image;
  return new Promise((resolve, reject) => {
    worker.onmessage = (e) => {
      const msg = e.data || {};
      if (msg.id !== id) return;
      if (msg.type === 'result') {
        worker.terminate();
        resolve({
          bits: new Uint8Array(msg.bits.buffer || msg.bits),
          // held is the preview-only Highlight Hold shading mask (S4 #83); it may
          // be absent from an older worker build — null then, no overlay.
          held: msg.held ? new Uint8Array(msg.held.buffer || msg.held) : null,
          width: msg.width,
          height: msg.height,
        });
      } else if (msg.type === 'error') {
        worker.terminate();
        reject(new Error(msg.message));
      }
    };
    worker.onerror = () => {
      // A worker that fails to load/run falls back inline so compute never hangs.
      worker.terminate();
      resolve(etchSourceToBitmap(retained, options));
    };
    const transfer = image?.data?.buffer instanceof ArrayBuffer ? [image.data.buffer] : [];
    worker.postMessage({ type: 'etch', id, image, options }, transfer);
  });
}
