// WorkerBridge — typed main↔worker seam for the extraction pipeline (locked
// decision 11; PRD #48 "API/contracts").
//
// createExtractionBridge() prefers a module Web Worker (Vite bundles
// extraction.worker.js) and transparently falls back to running the pipeline
// INLINE when Workers are unavailable (jsdom tests, exotic embeds) — same
// contract either way:
//
//   bridge.extract(image, options, onProgress) → Promise<result>
//   bridge.rectify(image, quad, onProgress)    → Promise<{rectified, homography}>
//     (S3, issue #52 — the Flatten step's warp, same worker/inline duality)
//   bridge.dispose()
//
// The image buffer is transferred (zero-copy) on the worker path, so callers
// must treat the passed ImageData as consumed. The bridge keeps a private
// copy so the inline FALLBACK still has pixels if the worker dies mid-flight.
//
// Failure containment (adversarial-review finding 3): a worker that fails to
// load (onerror), delivers an undecodable message (onmessageerror), or never
// answers at all (watchdog) is terminated and retired, and the extraction
// falls back inline — extract() never hangs. A protocol-level 'error' message
// is different: that's the PIPELINE failing on this input, and it stays a
// real rejection with the pipeline's message. Concurrent extract() calls on
// the worker path are rejected (one in flight at a time) so a second call can
// never clobber the first one's handlers.

let nextId = 1;

// How long the worker gets to emit its FIRST message (progress or result)
// before the bridge assumes it will never answer. Generous: worker startup
// plus the lazy tracer import, not the whole extraction.
const DEFAULT_WATCHDOG_MS = 10000;

// Marker distinguishing "the bridge's worker broke" (→ fall back inline) from
// "the pipeline rejected this input" (→ surface to the caller).
const WORKER_FAILURE = Symbol('extraction-worker-failure');

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
 * @param {{ workerFactory?: (() => Worker|null) | null, watchdogMs?: number }} [opts]
 *   `workerFactory: null` forces the inline path (tests use this; production
 *   omits it and gets the real worker when the platform provides one).
 *   `watchdogMs` overrides the first-message deadline (tests use tiny values).
 */
export function createExtractionBridge(opts = {}) {
  const factory =
    'workerFactory' in opts ? opts.workerFactory : defaultWorkerFactory;
  const watchdogMs = opts.watchdogMs ?? DEFAULT_WATCHDOG_MS;
  let worker = null;
  let workerBroken = false; // once a worker fails, all later extracts go inline
  let inFlight = false;

  async function extractInline(image, options, onProgress) {
    const { runExtraction } = await import('./pipeline');
    return runExtraction({ image, options }, onProgress);
  }

  async function rectifyInline(image, quad, onProgress) {
    const { runRectify } = await import('./pipeline');
    return runRectify({ image, quad }, onProgress);
  }

  // `type`/`extra` (S3, issue #52) let bridge.rectify() reuse the same
  // watchdog/failover machinery with a 'start-rectify' message; extract()
  // callers are untouched by the added optional parameters.
  function extractInWorker(w, image, options, onProgress, type = 'start', extra = null) {
    const id = nextId++;
    return new Promise((resolve, reject) => {
      let settled = false;
      const settle = (fn, value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        w.onmessage = null;
        w.onerror = null;
        w.onmessageerror = null;
        fn(value);
      };
      const failover = (why) => {
        const err = new Error(why);
        err[WORKER_FAILURE] = true;
        settle(reject, err);
      };

      let timer = setTimeout(
        () => failover(`extraction worker unresponsive after ${watchdogMs}ms`),
        watchdogMs
      );

      w.onmessage = (e) => {
        const msg = e.data || {};
        if (msg.id !== id) return;
        clearTimeout(timer); // first (matching) message: the worker is alive
        if (msg.type === 'progress') {
          const { type: _t, id: _i, ...p } = msg;
          onProgress?.(p);
        } else if (msg.type === 'result') {
          settle(resolve, msg.result);
        } else if (msg.type === 'error') {
          settle(reject, new Error(msg.message)); // pipeline error — no fallback
        }
      };
      w.onerror = (e) =>
        failover(`extraction worker error: ${e?.message || 'load/runtime failure'}`);
      w.onmessageerror = () => failover('extraction worker message deserialization failed');

      const transfer =
        image?.data?.buffer instanceof ArrayBuffer ? [image.data.buffer] : [];
      w.postMessage({ type, id, image, options, ...(extra || {}) }, transfer);
    });
  }

  return {
    async extract(image, options = {}, onProgress) {
      if (!workerBroken && !worker && typeof factory === 'function') worker = factory();
      if (!worker) return extractInline(image, options, onProgress);
      if (inFlight) {
        throw new Error('extraction already in progress — one extract() at a time');
      }
      inFlight = true;
      // The worker path transfers image.data zero-copy; retain a private copy
      // so the inline fallback still has pixels if the worker fails mid-flight.
      const retained = image?.data
        ? { ...image, data: new Uint8ClampedArray(image.data) }
        : image;
      try {
        return await extractInWorker(worker, image, options, onProgress);
      } catch (err) {
        if (!err?.[WORKER_FAILURE]) throw err;
        console.warn(`Extraction worker failed, falling back inline: ${err.message}`);
        worker.terminate?.();
        worker = null;
        workerBroken = true;
        return extractInline(retained, options, onProgress);
      } finally {
        inFlight = false;
      }
    },
    // Flatten-step warp (S3, issue #52): identical worker/inline duality and
    // failure containment as extract(); shares the one-in-flight guard so a
    // rectify can never clobber a running extraction (or vice versa).
    async rectify(image, quad, onProgress) {
      if (!workerBroken && !worker && typeof factory === 'function') worker = factory();
      if (!worker) return rectifyInline(image, quad, onProgress);
      if (inFlight) {
        throw new Error('extraction already in progress — one operation at a time');
      }
      inFlight = true;
      const retained = image?.data
        ? { ...image, data: new Uint8ClampedArray(image.data) }
        : image;
      try {
        return await extractInWorker(worker, image, {}, onProgress, 'start-rectify', { quad });
      } catch (err) {
        if (!err?.[WORKER_FAILURE]) throw err;
        console.warn(`Extraction worker failed, falling back inline: ${err.message}`);
        worker.terminate?.();
        worker = null;
        workerBroken = true;
        return rectifyInline(retained, quad, onProgress);
      } finally {
        inFlight = false;
      }
    },
    dispose() {
      worker?.terminate?.();
      worker = null;
    },
  };
}
