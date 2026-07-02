// WorkerBridge — typed main↔worker seam for the extraction pipeline (locked
// decision 11; PRD #48 "API/contracts"; S2 harness, issue #51).
//
// createExtractionBridge() prefers a module Web Worker (Vite bundles
// extraction.worker.js) and transparently falls back to running the pipeline
// INLINE when Workers are unavailable (jsdom tests, exotic embeds) — same
// contract either way:
//
//   bridge.extract(image, options, onProgress, { signal }) → Promise<result>
//   bridge.dispose()
//
// The image buffer is transferred (zero-copy) on the worker path, so callers
// must treat the passed ImageData as consumed. The bridge keeps a private
// copy so the inline FALLBACK still has pixels if the worker dies mid-flight.
//
// Failure containment (adversarial-review finding 3, preserved from S0): a
// worker that fails to load (onerror), delivers an undecodable message
// (onmessageerror), or never answers at all (watchdog) is terminated and
// retired, and the extraction falls back inline — extract() never hangs. A
// protocol-level 'error' message is different: that's the PIPELINE failing on
// this input, and it stays a real rejection with the pipeline's message.
// Concurrent extract() calls on the worker path are rejected (one in flight
// at a time) so a second call can never clobber the first one's handlers —
// handlers are installed ONCE per worker and route by extraction id.
//
// Cancellation (S2): abort the caller's AbortSignal → the bridge rejects with
// an AbortError immediately, sends a cooperative {type:'cancel'} to the
// worker, and DRAINS the worker until it acks (cancelled/result/error for
// that id). The worker — and its warm lazily-loaded models — survives a
// cancel; only if it ignores the cancel past the watchdog is it replaced
// (fresh worker on the next extract, NOT the broken-worker inline fallback).

import { makeAbortError } from './pipeline';

let nextId = 1;

// How long the worker gets to emit its FIRST message (progress or result)
// before the bridge assumes it will never answer — and how long a cancelled
// worker gets to ack the cancel before it is replaced. Generous: worker
// startup plus lazy stage-dep loading, not the whole extraction.
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
 *   `watchdogMs` overrides the first-message/cancel-ack deadlines (tests use
 *   tiny values).
 */
export function createExtractionBridge(opts = {}) {
  const factory =
    'workerFactory' in opts ? opts.workerFactory : defaultWorkerFactory;
  const watchdogMs = opts.watchdogMs ?? DEFAULT_WATCHDOG_MS;
  let worker = null;
  let workerBroken = false; // once a worker FAILS, all later extracts go inline
  let job = null; // the in-flight extraction: { id, onProgress, settle, sawMessage }
  let drain = null; // cancelled-but-unacked extraction: { id, timer }

  function retireWorker() {
    worker?.terminate?.();
    worker = null;
  }

  function clearDrain() {
    if (!drain) return;
    clearTimeout(drain.timer);
    drain = null;
  }

  function workerFailed(why) {
    if (job) {
      const err = new Error(why);
      err[WORKER_FAILURE] = true;
      job.settle('reject', err); // extract()'s catch retires + falls back inline
    } else {
      // Failure with nothing in flight (e.g. while draining a cancel): retire
      // the worker outright so nothing is ever posted to it again.
      clearDrain();
      retireWorker();
      workerBroken = true;
    }
  }

  // Handlers are installed ONCE per worker and route by extraction id — a
  // late message from a cancelled run can never reach a newer job.
  function attach(w) {
    w.onmessage = (e) => {
      const msg = e.data || {};
      if (drain && msg.id === drain.id) {
        // Ack for a cancelled extraction: the worker is responsive again.
        if (msg.type === 'cancelled' || msg.type === 'result' || msg.type === 'error') {
          clearDrain();
        }
        return;
      }
      if (!job || msg.id !== job.id) return;
      job.sawMessage();
      if (msg.type === 'progress') {
        const { type: _t, id: _i, ...p } = msg;
        job.onProgress?.(p);
      } else if (msg.type === 'result') {
        job.settle('resolve', msg.result);
      } else if (msg.type === 'error') {
        job.settle('reject', new Error(msg.message)); // pipeline error — no fallback
      } else if (msg.type === 'cancelled') {
        job.settle('reject', makeAbortError());
      }
    };
    w.onerror = (e) =>
      workerFailed(`extraction worker error: ${e?.message || 'load/runtime failure'}`);
    w.onmessageerror = () =>
      workerFailed('extraction worker message deserialization failed');
  }

  async function extractInline(image, options, onProgress, signal) {
    const { runExtraction } = await import('./pipeline');
    return runExtraction({ image, options }, onProgress, { signal });
  }

  function extractInWorker(w, image, options, onProgress, signal) {
    const id = nextId++;
    return new Promise((resolve, reject) => {
      let settled = false;
      const watchdog = setTimeout(() => {
        const err = new Error(`extraction worker unresponsive after ${watchdogMs}ms`);
        err[WORKER_FAILURE] = true;
        settle('reject', err);
      }, watchdogMs);

      const settle = (kind, value) => {
        if (settled) return;
        settled = true;
        clearTimeout(watchdog);
        signal?.removeEventListener('abort', onAbort);
        job = null;
        (kind === 'resolve' ? resolve : reject)(value);
      };

      const onAbort = () => {
        if (settled) return;
        // Ask the worker to stop, release the caller NOW, and drain the ack.
        try {
          w.postMessage({ type: 'cancel', id });
        } catch {
          /* posting to a dying worker is fine — the drain timer covers it */
        }
        drain = {
          id,
          timer: setTimeout(() => {
            // The worker ignored the cancel — replace it. NOT workerBroken:
            // the next extract gets a fresh worker, not the inline fallback.
            drain = null;
            if (worker === w) retireWorker();
            else w.terminate?.();
          }, watchdogMs),
        };
        settle('reject', makeAbortError());
      };

      job = { id, onProgress, settle, sawMessage: () => clearTimeout(watchdog) };
      signal?.addEventListener('abort', onAbort, { once: true });

      const transfer =
        image?.data?.buffer instanceof ArrayBuffer ? [image.data.buffer] : [];
      w.postMessage({ type: 'start', id, image, options }, transfer);
    });
  }

  return {
    /**
     * @param {{data: Uint8ClampedArray, width: number, height: number}} image
     * @param {object} [options] per-stage options, forwarded to the pipeline
     * @param {(p: {stage, status, progress?, error?}) => void} [onProgress]
     * @param {{ signal?: AbortSignal }} [extra] abort → rejects with AbortError
     */
    async extract(image, options = {}, onProgress, { signal } = {}) {
      if (signal?.aborted) throw makeAbortError();
      if (!workerBroken && !worker && typeof factory === 'function') {
        worker = factory();
        if (worker) attach(worker);
      }
      if (!worker) return extractInline(image, options, onProgress, signal);
      if (job || drain) {
        throw new Error('extraction already in progress — one extract() at a time');
      }
      // The worker path transfers image.data zero-copy; retain a private copy
      // so the inline fallback still has pixels if the worker fails mid-flight.
      const retained = image?.data
        ? { ...image, data: new Uint8ClampedArray(image.data) }
        : image;
      try {
        return await extractInWorker(worker, image, options, onProgress, signal);
      } catch (err) {
        if (!err?.[WORKER_FAILURE]) throw err;
        console.warn(`Extraction worker failed, falling back inline: ${err.message}`);
        retireWorker();
        workerBroken = true;
        return extractInline(retained, options, onProgress, signal);
      }
    },
    dispose() {
      clearDrain();
      retireWorker();
    },
  };
}
