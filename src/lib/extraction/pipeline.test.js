// ExtractionPipeline + WorkerBridge (S0, issue #49).
//
// The pipeline is the staged orchestration seam every later slice deepens
// (flatten → [lattice → symmetry →] trace). S0: flatten reports 'skipped'
// (stub — the stepper stage exists, locked decision 2) and trace runs the
// contour Vectorizer. The bridge is the worker seam (locked decision 11):
// tests cover the inline fallback (jsdom/node have no module Workers) and the
// message protocol against a stub worker.

import { describe, it, expect, vi } from 'vitest';
import { runExtraction, runRectify } from './pipeline';
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
});

// S3 (issue #52): a flatten quad in options runs the rectify stage before
// trace — the rectified raster flows into the existing extraction path.
describe('runExtraction — flatten stage', () => {
  const cropQuad = [
    { x: 10, y: 10 },
    { x: 40, y: 10 },
    { x: 40, y: 40 },
    { x: 10, y: 40 },
  ];

  it('rectifies through options.flatten.quad and traces the rectified raster', async () => {
    const result = await runExtraction({
      image: squareImage(),
      options: { flatten: { quad: cropQuad } },
    });
    // Axis-aligned quad == crop: the tile is now 30×30 and the black square
    // (15..35 in source space) still traces inside it.
    expect(result.tile.width).toBe(30);
    expect(result.tile.height).toBe(30);
    expect(result.tile.fills.length).toBeGreaterThanOrEqual(1);
  });

  it('emits staged progress: flatten running → done, then trace', async () => {
    const events = [];
    await runExtraction(
      { image: squareImage(), options: { flatten: { quad: cropQuad } } },
      (p) => events.push(p)
    );
    expect(events).toEqual([
      { stage: 'flatten', status: 'running' },
      { stage: 'flatten', status: 'done' },
      { stage: 'trace', status: 'running' },
      { stage: 'trace', status: 'done' },
    ]);
  });

  it('surfaces a bad quad as a pipeline error', async () => {
    const bowtie = [
      { x: 0, y: 0 },
      { x: 49, y: 0 },
      { x: 0, y: 49 },
      { x: 49, y: 49 },
    ];
    await expect(
      runExtraction({ image: squareImage(), options: { flatten: { quad: bowtie } } })
    ).rejects.toThrow(/cannot flatten/i);
  });
});

describe('runRectify', () => {
  it('returns the rectified raster + homography with flatten progress', async () => {
    const events = [];
    const quad = [
      { x: 10, y: 10 },
      { x: 40, y: 10 },
      { x: 40, y: 40 },
      { x: 10, y: 40 },
    ];
    const { rectified, homography } = await runRectify(
      { image: squareImage(), quad },
      (p) => events.push(p)
    );
    expect(rectified.width).toBe(30);
    expect(rectified.height).toBe(30);
    expect(homography).toHaveLength(9);
    expect(events).toEqual([
      { stage: 'flatten', status: 'running' },
      { stage: 'flatten', status: 'done' },
    ]);
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

  it('runs rectify inline when no Worker is available (S3)', async () => {
    const bridge = createExtractionBridge({ workerFactory: null });
    const progress = vi.fn();
    const quad = [
      { x: 10, y: 10 },
      { x: 40, y: 10 },
      { x: 40, y: 40 },
      { x: 10, y: 40 },
    ];
    const { rectified, homography } = await bridge.rectify(squareImage(), quad, progress);
    expect(rectified.width).toBe(30);
    expect(homography).toHaveLength(9);
    expect(progress).toHaveBeenCalledWith({ stage: 'flatten', status: 'done' });
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

  // S3 (issue #52): rectify speaks 'start-rectify' over the same protocol.
  it('routes start-rectify → result through the worker, quad included', async () => {
    const posted = [];
    const worker = {
      onmessage: null,
      postMessage(msg) {
        posted.push(msg);
        const { id } = msg;
        queueMicrotask(() => {
          worker.onmessage?.({ data: { type: 'progress', id, stage: 'flatten', status: 'running' } });
          worker.onmessage?.({
            data: {
              type: 'result',
              id,
              result: {
                rectified: { data: new Uint8ClampedArray(4), width: 1, height: 1 },
                homography: [1, 0, 0, 0, 1, 0, 0, 0, 1],
              },
            },
          });
        });
      },
      terminate() {},
    };
    const bridge = createExtractionBridge({ workerFactory: () => worker });
    const quad = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ];
    const progress = vi.fn();
    const result = await bridge.rectify(squareImage(), quad, progress);
    expect(posted[0].type).toBe('start-rectify');
    expect(posted[0].quad).toEqual(quad);
    expect(result.homography).toHaveLength(9);
    expect(progress).toHaveBeenCalledWith(
      expect.objectContaining({ stage: 'flatten', status: 'running' })
    );
    bridge.dispose();
  });

  it('rectify falls back inline when the worker never responds (watchdog)', async () => {
    const dead = {
      onmessage: null, onerror: null, onmessageerror: null,
      postMessage() {}, terminate() {},
    };
    const bridge = createExtractionBridge({ workerFactory: () => dead, watchdogMs: 20 });
    const quad = [
      { x: 10, y: 10 },
      { x: 40, y: 10 },
      { x: 40, y: 40 },
      { x: 10, y: 40 },
    ];
    const { rectified } = await bridge.rectify(squareImage(), quad);
    expect(rectified.width).toBe(30);
    bridge.dispose();
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
