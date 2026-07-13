import { describe, it, expect, vi } from 'vitest';
import { computeEtchBitmap } from './etchWorkerBridge.js';
import { etchSourceToBitmap } from './etchProcess.js';
import { createToneStage, createDitherStage, createHalftoneStage } from './etchStage.js';
import { DITHER_BAYER_4 } from './etchDither.js';
import { HALFTONE_ROUND } from './etchHalftone.js';

function grayImage(rows) {
  const height = rows.length;
  const width = rows[0].length;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const v = rows[y][x];
      const i = (y * width + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = v;
      data[i + 3] = 255;
    }
  }
  return { data, width, height };
}

describe('computeEtchBitmap — worker seam with inline fallback', () => {
  it('inline path (workerFactory:null) matches the pure conversion', async () => {
    const img = grayImage([
      [0, 255],
      [130, 120],
    ]);
    const bitmap = await computeEtchBitmap(img, {}, { workerFactory: null });
    const expected = etchSourceToBitmap(grayImage([[0, 255], [130, 120]]));
    expect(bitmap.width).toBe(2);
    expect(bitmap.height).toBe(2);
    expect(Array.from(bitmap.bits)).toEqual(Array.from(expected.bits));
  });

  it('falls back inline when the factory returns no worker', async () => {
    const img = grayImage([[10, 250]]);
    const bitmap = await computeEtchBitmap(img, {}, { workerFactory: () => null });
    expect(Array.from(bitmap.bits)).toEqual([1, 0]);
  });

  it('routes a stubbed worker message and reconstructs the bitmap', async () => {
    // A fake worker that echoes back a computed result on the same id.
    class FakeWorker {
      postMessage(msg) {
        const { bits, width, height } = etchSourceToBitmap(msg.image, msg.options);
        queueMicrotask(() => this.onmessage({ data: { type: 'result', id: msg.id, bits, width, height } }));
      }
      terminate() {}
    }
    const img = grayImage([[0, 200]]);
    const bitmap = await computeEtchBitmap(img, {}, { workerFactory: () => new FakeWorker() });
    expect(Array.from(bitmap.bits)).toEqual([1, 0]);
  });

  it('worker-load failure falls back on VALID pixels, not the transfer-detached buffer (FIX 3)', async () => {
    // Emulates a worker whose construction succeeded but that fails to LOAD: it
    // consumes (neuters) the transferred pixels — here by zeroing the original —
    // then fires onerror. A correct bridge must fall back on the retained clone,
    // so the bits reflect the ORIGINAL pixels, not the corrupted ones.
    class LoadFailWorker {
      postMessage(msg) {
        // Simulate the effect of a zero-copy transfer consuming the buffer.
        msg.image.data.fill(0);
        queueMicrotask(() => this.onerror(new Error('worker failed to load')));
      }
      terminate() {}
    }
    // [0, 200] → expected bits [1, 0]. If the fallback used the zeroed original,
    // every pixel (luma 0) would threshold to ink → [1, 1] (wrong).
    const img = grayImage([[0, 200]]);
    const bitmap = await computeEtchBitmap(img, {}, { workerFactory: () => new LoadFailWorker() });
    expect(Array.from(bitmap.bits)).toEqual([1, 0]);
  });
});

// The Etch Stack config travels main→worker inside `options`. Every OTHER stack
// test forces the inline path (workerFactory:null), so a regression that dropped
// or renamed `options.stack` on the worker path would slip past the whole suite.
// These two close that gap: one drives the REAL etch.worker.js, the other proves
// the bridge forwards `options.stack` across a structured-clone boundary — both
// asserting the worker-path bits equal the inline path's for the SAME stack.
describe('worker-path Etch Stack parity (S2, #81)', () => {
  const source = grayImage([
    [0, 255, 60, 200],
    [40, 90, 160, 210],
    [130, 120, 128, 127],
    [10, 245, 133, 122],
  ]);
  // Non-neutral Tone Stage so the bits genuinely differ from the bare cut.
  const stage = createToneStage();
  stage.params = { exposure: 25, brightness: 0, contrast: 0, levels: { blackPoint: 20, whitePoint: 200, gamma: 1.5 } };
  const options = { stack: [stage] };

  it('the REAL etch.worker.js applies a populated stack identically to the inline path', async () => {
    const posted = [];
    const prevSelf = globalThis.self;
    // Stand in for the Worker global; capture what the worker posts back.
    globalThis.self = { onmessage: null, postMessage: (msg) => posted.push(msg) };
    try {
      await import('./etch.worker.js'); // registers self.onmessage
      // Round-trip the payload the way postMessage structured-clone does.
      const payload = structuredClone({ type: 'etch', id: 7, image: source, options });
      globalThis.self.onmessage({ data: payload });
    } finally {
      globalThis.self = prevSelf;
    }
    const result = posted.find((m) => m.type === 'result' && m.id === 7);
    const inline = etchSourceToBitmap(source, options);
    expect(result).toBeTruthy();
    expect(Array.from(result.bits)).toEqual(Array.from(inline.bits));
    // Guard: the stack actually transformed the bits (not a hidden identity).
    expect(Array.from(inline.bits)).not.toEqual(Array.from(etchSourceToBitmap(source).bits));
  });

  it('computeEtchBitmap forwards options.stack through a structured-clone boundary', async () => {
    // Faithful stand-in: clone the posted payload (as postMessage would), run the
    // worker contract, clone the result back.
    class CloningWorker {
      postMessage(msg) {
        const clone = structuredClone(msg);
        const { bits, width, height } = etchSourceToBitmap(clone.image, clone.options);
        const back = structuredClone({ type: 'result', id: clone.id, bits, width, height });
        queueMicrotask(() => this.onmessage({ data: back }));
      }
      terminate() {}
    }
    const viaWorker = await computeEtchBitmap(source, options, { workerFactory: () => new CloningWorker() });
    const inline = etchSourceToBitmap(source, options);
    expect(Array.from(viaWorker.bits)).toEqual(Array.from(inline.bits));
  });
});

// A SCREENING Stage travels the same plain-data path as a field Stage, but it
// produces the bits — so the worker must screen identically to the inline path.
// If `options.stack`'s Dither params were dropped/renamed across the boundary the
// worker would fall back to the plain cut and these would diverge.
describe('worker-path Dither Stage parity (S3, #82)', () => {
  const source = grayImage([
    [0, 255, 60, 200, 32, 220, 96, 160],
    [40, 90, 160, 210, 128, 64, 192, 16],
    [130, 120, 128, 127, 200, 30, 150, 90],
    [10, 245, 133, 122, 70, 205, 118, 48],
  ]);
  const stage = createDitherStage();
  stage.params = { mode: DITHER_BAYER_4, size: 2 };
  const options = { stack: [stage] };

  it('the REAL etch.worker.js screens a Dither Stack identically to the inline path', async () => {
    const posted = [];
    const prevSelf = globalThis.self;
    globalThis.self = { onmessage: null, postMessage: (msg) => posted.push(msg) };
    try {
      vi.resetModules(); // force the worker to re-register onmessage on THIS self
      await import('./etch.worker.js');
      const payload = structuredClone({ type: 'etch', id: 11, image: source, options });
      globalThis.self.onmessage({ data: payload });
    } finally {
      globalThis.self = prevSelf;
    }
    const result = posted.find((m) => m.type === 'result' && m.id === 11);
    const inline = etchSourceToBitmap(source, options);
    expect(result).toBeTruthy();
    expect(Array.from(result.bits)).toEqual(Array.from(inline.bits));
    // Guard: the screen actually produced dithered dots (not the plain cut).
    expect(Array.from(inline.bits)).not.toEqual(Array.from(etchSourceToBitmap(source).bits));
  });

  it('computeEtchBitmap forwards a Dither Stage across a structured-clone boundary', async () => {
    class CloningWorker {
      postMessage(msg) {
        const clone = structuredClone(msg);
        const { bits, width, height } = etchSourceToBitmap(clone.image, clone.options);
        const back = structuredClone({ type: 'result', id: clone.id, bits, width, height });
        queueMicrotask(() => this.onmessage({ data: back }));
      }
      terminate() {}
    }
    const viaWorker = await computeEtchBitmap(source, options, { workerFactory: () => new CloningWorker() });
    const inline = etchSourceToBitmap(source, options);
    expect(Array.from(viaWorker.bits)).toEqual(Array.from(inline.bits));
  });
});

// A Halftone Stage AND its `dpi` travel main→worker inside `options` (S5, #84).
// The DPI is what converts the LPI frequency into the device-pixel cell, so if the
// worker path dropped `options.dpi` the halftone would screen at the wrong (or
// default) frequency and diverge from inline. These pin BOTH the stack and the dpi
// crossing the structured-clone boundary.
describe('worker-path Halftone Stage parity (S5, #84)', () => {
  const source = grayImage([
    [0, 255, 60, 200, 32, 220, 96, 160],
    [40, 90, 160, 210, 128, 64, 192, 16],
    [130, 120, 128, 127, 200, 30, 150, 90],
    [10, 245, 133, 122, 70, 205, 118, 48],
  ]);
  const stage = createHalftoneStage();
  stage.params = { frequency: 96, angle: 30, shape: HALFTONE_ROUND };
  // A NON-default dpi so a dropped-dpi regression shows: inline defaults to 254,
  // so if the worker lost dp:120 it would produce the 254 bits and mismatch.
  const options = { stack: [stage], dpi: 120 };

  it('the REAL etch.worker.js screens a Halftone Stack+dpi identically to the inline path', async () => {
    const posted = [];
    const prevSelf = globalThis.self;
    globalThis.self = { onmessage: null, postMessage: (msg) => posted.push(msg) };
    try {
      vi.resetModules();
      await import('./etch.worker.js');
      const payload = structuredClone({ type: 'etch', id: 21, image: source, options });
      globalThis.self.onmessage({ data: payload });
    } finally {
      globalThis.self = prevSelf;
    }
    const result = posted.find((m) => m.type === 'result' && m.id === 21);
    const inline = etchSourceToBitmap(source, options);
    expect(result).toBeTruthy();
    expect(Array.from(result.bits)).toEqual(Array.from(inline.bits));
    // Guard: the dpi genuinely mattered — the same stack at 254 differs from at 120.
    expect(Array.from(inline.bits)).not.toEqual(Array.from(etchSourceToBitmap(source, { stack: [stage], dpi: 254 }).bits));
  });

  it('computeEtchBitmap forwards a Halftone Stage + dpi across a structured-clone boundary', async () => {
    class CloningWorker {
      postMessage(msg) {
        const clone = structuredClone(msg);
        const { bits, width, height } = etchSourceToBitmap(clone.image, clone.options);
        const back = structuredClone({ type: 'result', id: clone.id, bits, width, height });
        queueMicrotask(() => this.onmessage({ data: back }));
      }
      terminate() {}
    }
    const viaWorker = await computeEtchBitmap(source, options, { workerFactory: () => new CloningWorker() });
    const inline = etchSourceToBitmap(source, options);
    expect(Array.from(viaWorker.bits)).toEqual(Array.from(inline.bits));
  });
});
