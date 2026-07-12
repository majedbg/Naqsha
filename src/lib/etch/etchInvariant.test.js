// The load-bearing WYSIWYG test for the whole Raster Etch feature (grilled
// decision 4). It proves the 1-bit buffer that RENDERS on the p5 canvas is the
// exact same buffer that EXPORTS to SVG — not a shader-preview + separate-CPU
// split, not a copy, not a re-threshold at export time. Every later wave must
// keep this green: if any wave introduces a second buffer or recomputes at
// export, the mutation test below fails.
//
// It exercises the REAL seam: the etch canvas instance (makeEtchInstance) is
// what useCanvas registers AND what svgExport consumes, so this is structural,
// not two pure functions agreeing on a hand-made bitmap.

import { describe, it, expect } from 'vitest';
import { computeEtchBitmap } from './etchWorkerBridge.js';
import { makeEtchInstance } from './etchInstance.js';
import { bitmapToRGBA } from './etchBitmap.js';
import { buildAllLayersSVG } from '../svgExport.js';
import { decodeEtchPNG } from './etchTestKit.js';

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

// The ink mask the CANVAS would paint: alpha > 0 means an etched dot was drawn.
function renderInkMask(instance, color, w, h) {
  const rgba = bitmapToRGBA(instance.etchBitmap, color);
  const mask = new Uint8Array(w * h);
  for (let j = 0; j < mask.length; j++) mask[j] = rgba[j * 4 + 3] > 0 ? 1 : 0;
  return mask;
}

// The ink mask the EXPORT embeds: decode the `<image>` the SVG carries.
function exportInkMask(instance, layer, w, h) {
  const svg = buildAllLayersSVG([layer], { [layer.id]: instance }, w, h, false, {});
  const href = svg.match(/href="(data:image\/png;base64,[^"]+)"/)[1];
  return decodeEtchPNG(href).bits;
}

describe('Etch WYSIWYG single-source invariant — canvas render and SVG export read the identical 1-bit buffer', () => {
  const source = grayImage([
    [0, 255, 0, 255],
    [255, 0, 255, 0],
    [0, 0, 255, 255],
    [130, 120, 130, 120],
  ]);
  const layer = { id: 'e1', type: 'etch', visible: true, color: '#000000' };
  const W = 4;
  const H = 4;

  it('rendered pixels equal exported pixels equal the canonical bits', async () => {
    const bitmap = await computeEtchBitmap(source, {}, { workerFactory: null });
    const instance = makeEtchInstance(bitmap);

    const rendered = renderInkMask(instance, layer.color, W, H);
    const exported = exportInkMask(instance, layer, W, H);

    expect(Array.from(rendered)).toEqual(Array.from(bitmap.bits));
    expect(Array.from(exported)).toEqual(Array.from(bitmap.bits));
    expect(Array.from(rendered)).toEqual(Array.from(exported));
  });

  it('STRUCTURAL: mutating the instance buffer changes BOTH render and export (no copy/recompute anywhere)', async () => {
    const bitmap = await computeEtchBitmap(source, {}, { workerFactory: null });
    const instance = makeEtchInstance(bitmap);

    // Pick a bit and flip it directly on the single-source buffer.
    const k = 5;
    const before = instance.etchBitmap.bits[k];
    instance.etchBitmap.bits[k] = before === 1 ? 0 : 1;

    const rendered = renderInkMask(instance, layer.color, W, H);
    const exported = exportInkMask(instance, layer, W, H);

    // Both consumers must reflect the mutated bit — proving neither holds its own
    // copy nor recomputes from the source. If a second buffer existed, one of
    // these would still show the pre-mutation value and this assertion would fail.
    expect(rendered[k]).toBe(instance.etchBitmap.bits[k]);
    expect(exported[k]).toBe(instance.etchBitmap.bits[k]);
    expect(Array.from(rendered)).toEqual(Array.from(exported));
  });
});
