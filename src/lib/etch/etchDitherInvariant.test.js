// The WYSIWYG single-source invariant WITH an ACTIVE Dither Stage (Raster Etch
// S3, #82; grilled decision 4). S1 proved render==export for the bare cut, S2 for
// a field-shaped stack; this proves it STILL holds once a screening Stage — not
// the plain threshold — produces the bits. It routes a real Dither Stage through
// the SAME seam production uses (computeEtchBitmap → etchSourceToBitmap →
// makeEtchInstance), so the dithered dots the canvas paints and the dots the SVG
// embeds are ONE buffer, screened once. If screening ran twice (once for preview,
// once for export) the two would drift; a dithered image — thousands of isolated
// dots — is the harshest possible test of that.

import { describe, it, expect } from 'vitest';
import { computeEtchBitmap } from './etchWorkerBridge.js';
import { makeEtchInstance } from './etchInstance.js';
import { bitmapToRGBA } from './etchBitmap.js';
import { buildAllLayersSVG } from '../svgExport.js';
import { decodeEtchPNG } from './etchTestKit.js';
import { createDitherStage } from './etchStage.js';
import { etchSourceToBitmap } from './etchProcess.js';
import { DITHER_FS } from './etchDither.js';

// A tonal gradient so the screen makes genuine dot-density variation (not a flat
// all-ink / all-paper block that a plain cut would produce identically).
function gradientImage(w, h) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v = Math.round((x / (w - 1)) * 255);
      const i = (y * w + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = v;
      data[i + 3] = 255;
    }
  }
  return { data, width: w, height: h };
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

describe('Etch WYSIWYG invariant WITH an active Dither Stage (screened bits)', () => {
  const W = 8;
  const H = 8;
  const source = gradientImage(W, H);
  const layer = { id: 'e1', type: 'etch', visible: true, color: '#000000' };

  const stage = createDitherStage();
  stage.params = { mode: DITHER_FS, size: 1 };
  const stack = [stage];

  it('the dithered bits are a genuine dot field, not the plain cut', async () => {
    const dithered = await computeEtchBitmap(source, { stack }, { workerFactory: null });
    const bare = etchSourceToBitmap(source); // plain global cut
    expect(Array.from(dithered.bits)).not.toEqual(Array.from(bare.bits));
    // The gradient dithers to a mix of ink and paper (dot density), not a solid block.
    const ink = dithered.bits.reduce((n, b) => n + b, 0);
    expect(ink).toBeGreaterThan(0);
    expect(ink).toBeLessThan(dithered.bits.length);
  });

  it('rendered pixels == exported pixels == the dithered canonical bits', async () => {
    const bitmap = await computeEtchBitmap(source, { stack }, { workerFactory: null });
    const instance = makeEtchInstance(bitmap);

    const rendered = renderInkMask(instance, layer.color, W, H);
    const exported = exportInkMask(instance, layer, W, H);

    expect(Array.from(rendered)).toEqual(Array.from(bitmap.bits));
    expect(Array.from(exported)).toEqual(Array.from(bitmap.bits));
    expect(Array.from(rendered)).toEqual(Array.from(exported));
  });

  it('STRUCTURAL: mutating one dithered dot changes BOTH render and export', async () => {
    const bitmap = await computeEtchBitmap(source, { stack }, { workerFactory: null });
    const instance = makeEtchInstance(bitmap);

    const k = 20;
    const before = instance.etchBitmap.bits[k];
    instance.etchBitmap.bits[k] = before === 1 ? 0 : 1;

    const rendered = renderInkMask(instance, layer.color, W, H);
    const exported = exportInkMask(instance, layer, W, H);
    expect(rendered[k]).toBe(instance.etchBitmap.bits[k]);
    expect(exported[k]).toBe(instance.etchBitmap.bits[k]);
    expect(Array.from(rendered)).toEqual(Array.from(exported));
  });
});
