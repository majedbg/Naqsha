// WorkerBridge — typed main↔worker seam for the extraction pipeline (locked
// decision 11; PRD #48 "API/contracts").
//
// createExtractionBridge() prefers a module Web Worker (Vite bundles
// extraction.worker.js) and transparently falls back to running the pipeline
// INLINE when Workers are unavailable (jsdom tests, exotic embeds) — same
// contract either way:
//
//   bridge.extract(image, options, onProgress) → Promise<result>
//   bridge.dispose()
//
// The image buffer is transferred (zero-copy) on the worker path, so callers
// must treat the passed ImageData as consumed.

let nextId = 1;

function defaultWorkerFactory() {
  if (typeof Worker === 'undefined') return null;
  try {
    return new Worker(new URL('./extraction.worker.js', import.meta.url), {
      type: 'module',
    });
  } catch {
    return null;
  }
}

/**
 * @param {{ workerFactory?: (() => Worker|null) | null }} [opts]
 *   `workerFactory: null` forces the inline path (tests use this; production
 *   omits it and gets the real worker when the platform provides one).
 */
export function createExtractionBridge(opts = {}) {
  const factory =
    'workerFactory' in opts ? opts.workerFactory : defaultWorkerFactory;
  let worker = null;

  async function extractInline(image, options, onProgress) {
    const { runExtraction } = await import('./pipeline');
    return runExtraction({ image, options }, onProgress);
  }

  function extractInWorker(w, image, options, onProgress) {
    const id = nextId++;
    return new Promise((resolve, reject) => {
      const prevHandler = w.onmessage;
      w.onmessage = (e) => {
        const msg = e.data || {};
        if (msg.id !== id) return;
        if (msg.type === 'progress') {
          const { type: _t, id: _i, ...p } = msg;
          onProgress?.(p);
        } else if (msg.type === 'result') {
          w.onmessage = prevHandler;
          resolve(msg.result);
        } else if (msg.type === 'error') {
          w.onmessage = prevHandler;
          reject(new Error(msg.message));
        }
      };
      const transfer =
        image?.data?.buffer instanceof ArrayBuffer ? [image.data.buffer] : [];
      w.postMessage({ type: 'start', id, image, options }, transfer);
    });
  }

  return {
    async extract(image, options = {}, onProgress) {
      if (!worker && typeof factory === 'function') worker = factory();
      if (!worker) return extractInline(image, options, onProgress);
      return extractInWorker(worker, image, options, onProgress);
    },
    dispose() {
      worker?.terminate?.();
      worker = null;
    },
  };
}
