// ExtractionPipeline + WorkerBridge (S0, issue #49).
//
// The pipeline is the staged orchestration seam every later slice deepens
// (flatten → [lattice → symmetry →] trace). S0: flatten reports 'skipped'
// (stub — the stepper stage exists, locked decision 2) and trace runs the
// contour Vectorizer. The bridge is the worker seam (locked decision 11):
// tests cover the inline fallback (jsdom/node have no module Workers) and the
// message protocol against a stub worker.

import { describe, it, expect, vi } from 'vitest';
import { runExtraction } from './pipeline';
import { createExtractionBridge } from './workerBridge';

function squareImage() {
  const w = 50;
  const h = 50;
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v = x >= 15 && x < 35 && y >= 15 && y < 35 ? 0 : 255;
      const i = (y * w + x) * 4;
      data[i] = v; data[i + 1] = v; data[i + 2] = v; data[i + 3] = 255;
    }
  }
  return { data, width: w, height: h };
}

describe('runExtraction', () => {
  it('produces a tile with traced contours and a null lattice (single-motif floor)', async () => {
    const result = await runExtraction({ image: squareImage() });
    expect(result.tile.width).toBe(50);
    expect(result.tile.height).toBe(50);
    expect(result.tile.fills.length).toBeGreaterThanOrEqual(1);
    expect(result.tile.strokes).toEqual([]);
    expect(result.lattice).toBeNull();
  });

  it('emits staged progress: flatten skipped, then trace running → done', async () => {
    const events = [];
    await runExtraction({ image: squareImage() }, (p) => events.push(p));
    expect(events).toEqual([
      { stage: 'flatten', status: 'skipped' },
      { stage: 'trace', status: 'running' },
      { stage: 'trace', status: 'done' },
    ]);
  });

  it('reports a confidence signal for the trace stage', async () => {
    const result = await runExtraction({ image: squareImage() });
    expect(result.confidence.trace).toBeGreaterThan(0);
  });

  // S6 (issue #55): the vectorize stage payload carries per-motif components
  // (both representations) so Review can flip role / toggle centerline↔contour.
  it('carries per-motif components with both representations', async () => {
    const result = await runExtraction({ image: squareImage() });
    expect(result.components).toHaveLength(1);
    expect(result.components[0].kind).toBe('fill');
    expect(result.components[0].contour.d).toBe(result.tile.fills[0].d);
  });

  it('extracts line-work into tile.strokes (centerline-default)', async () => {
    const w = 80;
    const h = 40;
    const data = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const v = x >= 10 && x < 70 && y >= 19 && y <= 21 ? 0 : 255;
        const i = (y * w + x) * 4;
        data[i] = v; data[i + 1] = v; data[i + 2] = v; data[i + 3] = 255;
      }
    }
    const result = await runExtraction({ image: { data, width: w, height: h } });
    expect(result.tile.fills).toEqual([]);
    expect(result.tile.strokes).toHaveLength(1);
    expect(result.tile.strokes[0].role).toBe('score');
    expect(result.components[0].kind).toBe('stroke');
    expect(result.components[0].contour).toBeTruthy(); // flip target survives
    expect(result.confidence.trace).toBeGreaterThan(0);
  });
});

describe('createExtractionBridge — inline fallback', () => {
  it('runs the pipeline inline when no Worker is available', async () => {
    const bridge = createExtractionBridge({ workerFactory: null });
    const progress = vi.fn();
    const result = await bridge.extract(squareImage(), {}, progress);
    expect(result.tile.fills.length).toBeGreaterThanOrEqual(1);
    expect(progress).toHaveBeenCalledWith({ stage: 'flatten', status: 'skipped' });
    bridge.dispose();
  });
});

describe('createExtractionBridge — worker protocol', () => {
  // Stub worker that speaks the typed protocol without a real thread.
  function stubWorker({ fail = false } = {}) {
    const worker = {
      onmessage: null,
      terminated: false,
      postMessage(msg) {
        const { id } = msg;
        queueMicrotask(() => {
          worker.onmessage?.({ data: { type: 'progress', id, stage: 'trace', status: 'running' } });
          if (fail) {
            worker.onmessage?.({ data: { type: 'error', id, message: 'boom' } });
          } else {
            worker.onmessage?.({
              data: {
                type: 'result',
                id,
                result: { tile: { width: 1, height: 1, fills: [{ d: 'M0 0Z', role: 'engrave' }], strokes: [] }, lattice: null, confidence: { trace: 1 } },
              },
            });
          }
        });
      },
      terminate() { worker.terminated = true; },
    };
    return worker;
  }

  it('routes start → progress → result through the worker', async () => {
    const w = stubWorker();
    const bridge = createExtractionBridge({ workerFactory: () => w });
    const progress = vi.fn();
    const result = await bridge.extract(squareImage(), {}, progress);
    expect(result.tile.fills).toHaveLength(1);
    expect(progress).toHaveBeenCalledWith(
      expect.objectContaining({ stage: 'trace', status: 'running' })
    );
  });

  it('rejects on a worker error message', async () => {
    const bridge = createExtractionBridge({ workerFactory: () => stubWorker({ fail: true }) });
    await expect(bridge.extract(squareImage(), {})).rejects.toThrow('boom');
  });

  it('terminates the worker on dispose', async () => {
    const w = stubWorker();
    const bridge = createExtractionBridge({ workerFactory: () => w });
    await bridge.extract(squareImage(), {});
    bridge.dispose();
    expect(w.terminated).toBe(true);
  });
});

// Adversarial-review finding 3: a worker that fails to LOAD or never answers
// must not hang extract() forever — the bridge retires the worker and falls
// back to the inline pipeline (same graceful-degradation contract as the
// no-Worker path). A protocol-level 'error' message stays a real rejection
// (covered above) — that's the pipeline failing, not the bridge.
describe('createExtractionBridge — worker failure fallback', () => {
  // Worker shell that accepts messages but never answers; failure modes are
  // triggered manually via its onerror/onmessageerror handlers.
  function deadWorker() {
    const worker = {
      onmessage: null,
      onerror: null,
      onmessageerror: null,
      terminated: false,
      posted: 0,
      postMessage() { worker.posted++; },
      terminate() { worker.terminated = true; },
    };
    return worker;
  }

  it('falls back inline and resolves when the worker errors (onerror)', async () => {
    const w = deadWorker();
    const bridge = createExtractionBridge({ workerFactory: () => w });
    const p = bridge.extract(squareImage(), {});
    w.onerror({ message: 'worker script failed to load' });
    const result = await p;
    expect(result.tile.fills.length).toBeGreaterThanOrEqual(1);
    expect(w.terminated).toBe(true);
    bridge.dispose();
  });

  it('falls back inline on a message deserialization failure (onmessageerror)', async () => {
    const w = deadWorker();
    const bridge = createExtractionBridge({ workerFactory: () => w });
    const p = bridge.extract(squareImage(), {});
    w.onmessageerror({});
    const result = await p;
    expect(result.tile.fills.length).toBeGreaterThanOrEqual(1);
    bridge.dispose();
  });

  it('falls back inline when the worker never responds (watchdog)', async () => {
    const w = deadWorker();
    const bridge = createExtractionBridge({ workerFactory: () => w, watchdogMs: 20 });
    const result = await bridge.extract(squareImage(), {});
    expect(result.tile.fills.length).toBeGreaterThanOrEqual(1);
    expect(w.terminated).toBe(true);
    bridge.dispose();
  });

  it('stops using the retired worker: later extracts run inline directly', async () => {
    const w = deadWorker();
    let factoryCalls = 0;
    const bridge = createExtractionBridge({
      workerFactory: () => { factoryCalls++; return w; },
      watchdogMs: 20,
    });
    await bridge.extract(squareImage(), {});
    const again = await bridge.extract(squareImage(), {});
    expect(again.tile.fills.length).toBeGreaterThanOrEqual(1);
    expect(factoryCalls).toBe(1);
    expect(w.posted).toBe(1); // never posted to the dead worker again
    bridge.dispose();
  });

  it('rejects a second concurrent extract instead of clobbering handlers', async () => {
    const w = deadWorker();
    const bridge = createExtractionBridge({ workerFactory: () => w, watchdogMs: 50 });
    const first = bridge.extract(squareImage(), {});
    await expect(bridge.extract(squareImage(), {})).rejects.toThrow(/in progress/i);
    await first; // settles via watchdog fallback
    bridge.dispose();
  });
});
