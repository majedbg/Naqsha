import { describe, it, expect } from 'vitest';
import { computeEtchBitmap } from './etchWorkerBridge.js';
import { etchSourceToBitmap } from './etchProcess.js';

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
