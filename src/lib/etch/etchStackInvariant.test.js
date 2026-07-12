// The WYSIWYG single-source invariant WITH a populated Etch Stack (Raster Etch
// S2, #81; grilled decision 4). The S1 invariant proved render==export for the
// bare gray→cut path; this proves it still holds once real Stages transform the
// luma field on the way to the cut. It routes a NON-neutral Tone Stage through
// the SAME seam production uses — computeEtchBitmap (which runs etchSourceToBitmap
// with the stack) → makeEtchInstance — so the bits the canvas paints and the
// bits the SVG embeds are one buffer shaped by the Stack, not two.
//
// The Stage params are deliberately non-neutral (exposure + levels that move
// pixels across the cut), so this genuinely exercises transformed bits — not a
// stack that happens to be identity.

import { describe, it, expect } from 'vitest';
import { computeEtchBitmap } from './etchWorkerBridge.js';
import { makeEtchInstance } from './etchInstance.js';
import { bitmapToRGBA } from './etchBitmap.js';
import { buildAllLayersSVG } from '../svgExport.js';
import { decodeEtchPNG } from './etchTestKit.js';
import { createToneStage } from './etchStage.js';
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

function renderInkMask(instance, color, w, h) {
  const rgba = bitmapToRGBA(instance.etchBitmap, color);
  const mask = new Uint8Array(w * h);
  for (let j = 0; j < mask.length; j++) mask[j] = rgba[j * 4 + 3] > 0 ? 1 : 0;
  return mask;
}

function exportInkMask(instance, layer, w, h) {
  const svg = buildAllLayersSVG([layer], { [layer.id]: instance }, w, h, false, {});
  const href = svg.match(/href="(data:image\/png;base64,[^"]+)"/)[1];
  return decodeEtchPNG(href).bits;
}

describe('Etch WYSIWYG invariant WITH a populated Etch Stack', () => {
  const source = grayImage([
    [0, 255, 60, 200],
    [255, 0, 130, 120],
    [40, 90, 160, 210],
    [130, 120, 128, 127],
  ]);
  const layer = { id: 'e1', type: 'etch', visible: true, color: '#000000' };
  const W = 4;
  const H = 4;

  // A non-neutral Tone Stage: lift exposure and pull the black/white points so
  // several mid-gray pixels cross the 128 cut relative to the bare S1 path.
  const stage = createToneStage();
  stage.params = { exposure: 25, brightness: 0, contrast: 0, levels: { blackPoint: 20, whitePoint: 200, gamma: 1.5 } };
  const stack = [stage];

  it('the populated stack actually transforms the bits (not a hidden identity)', async () => {
    const withStack = await computeEtchBitmap(source, { stack }, { workerFactory: null });
    const bare = etchSourceToBitmap(source); // no stack = S1
    expect(Array.from(withStack.bits)).not.toEqual(Array.from(bare.bits));
  });

  it('rendered pixels equal exported pixels equal the stacked canonical bits', async () => {
    const bitmap = await computeEtchBitmap(source, { stack }, { workerFactory: null });
    const instance = makeEtchInstance(bitmap);

    const rendered = renderInkMask(instance, layer.color, W, H);
    const exported = exportInkMask(instance, layer, W, H);

    expect(Array.from(rendered)).toEqual(Array.from(bitmap.bits));
    expect(Array.from(exported)).toEqual(Array.from(bitmap.bits));
    expect(Array.from(rendered)).toEqual(Array.from(exported));
  });

  it('STRUCTURAL: mutating the stacked buffer changes BOTH render and export', async () => {
    const bitmap = await computeEtchBitmap(source, { stack }, { workerFactory: null });
    const instance = makeEtchInstance(bitmap);

    const k = 6;
    const before = instance.etchBitmap.bits[k];
    instance.etchBitmap.bits[k] = before === 1 ? 0 : 1;

    const rendered = renderInkMask(instance, layer.color, W, H);
    const exported = exportInkMask(instance, layer, W, H);
    expect(rendered[k]).toBe(instance.etchBitmap.bits[k]);
    expect(exported[k]).toBe(instance.etchBitmap.bits[k]);
    expect(Array.from(rendered)).toEqual(Array.from(exported));
  });
});
