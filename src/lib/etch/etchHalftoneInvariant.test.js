// The WYSIWYG single-source invariant WITH an ACTIVE Halftone Stage (Raster Etch
// S5, #84; grilled decision 4). S1 proved render==export for the bare cut, S2 for
// a field-shaped stack, S3 for a Dither screen; this proves it STILL holds once an
// AM Halftone Stage — not the plain threshold, not Dither — produces the bits. It
// routes a real Halftone Stage through the SAME seam production uses
// (computeEtchBitmap → etchSourceToBitmap → makeEtchInstance), so the AM dots the
// canvas paints and the dots the SVG embeds are ONE buffer, screened once. A
// halftone frame — a regular lattice of radius-modulated dots — drifts obviously if
// screening ran twice, making it a sharp test of the single-source guarantee.

import { describe, it, expect } from 'vitest';
import { computeEtchBitmap } from './etchWorkerBridge.js';
import { makeEtchInstance } from './etchInstance.js';
import { bitmapToRGBA } from './etchBitmap.js';
import { buildAllLayersSVG } from '../svgExport.js';
import { decodeEtchPNG } from './etchTestKit.js';
import { createHalftoneStage } from './etchStage.js';
import { etchSourceToBitmap } from './etchProcess.js';
import { HALFTONE_ROUND } from './etchHalftone.js';

// A tonal gradient large enough to span several halftone cells (cell = dpi/freq ≈
// 254/64 ≈ 4px, so 24px spans ~6 cells) → genuine radius-varying dots, not a block.
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

describe('Etch WYSIWYG invariant WITH an active Halftone Stage (screened AM dots)', () => {
  const W = 24;
  const H = 24;
  const source = gradientImage(W, H);
  const layer = { id: 'e1', type: 'etch', visible: true, color: '#000000' };

  const stage = createHalftoneStage();
  stage.params = { frequency: 64, angle: 45, shape: HALFTONE_ROUND };
  const stack = [stage];
  const options = { stack, dpi: 254 };

  it('the halftoned bits are a genuine AM dot field, not the plain cut', async () => {
    const halftoned = await computeEtchBitmap(source, options, { workerFactory: null });
    const bare = etchSourceToBitmap(source); // plain global cut
    expect(Array.from(halftoned.bits)).not.toEqual(Array.from(bare.bits));
    const ink = halftoned.bits.reduce((n, b) => n + b, 0);
    expect(ink).toBeGreaterThan(0);
    expect(ink).toBeLessThan(halftoned.bits.length);
  });

  it('rendered pixels == exported pixels == the halftoned canonical bits', async () => {
    const bitmap = await computeEtchBitmap(source, options, { workerFactory: null });
    const instance = makeEtchInstance(bitmap);

    const rendered = renderInkMask(instance, layer.color, W, H);
    const exported = exportInkMask(instance, layer, W, H);

    expect(Array.from(rendered)).toEqual(Array.from(bitmap.bits));
    expect(Array.from(exported)).toEqual(Array.from(bitmap.bits));
    expect(Array.from(rendered)).toEqual(Array.from(exported));
  });

  it('STRUCTURAL: mutating one halftone dot changes BOTH render and export', async () => {
    const bitmap = await computeEtchBitmap(source, options, { workerFactory: null });
    const instance = makeEtchInstance(bitmap);

    const k = 3 * W + 12; // a mid-gradient pixel likely on a dot edge
    const before = instance.etchBitmap.bits[k];
    instance.etchBitmap.bits[k] = before === 1 ? 0 : 1;

    const rendered = renderInkMask(instance, layer.color, W, H);
    const exported = exportInkMask(instance, layer, W, H);
    expect(rendered[k]).toBe(instance.etchBitmap.bits[k]);
    expect(exported[k]).toBe(instance.etchBitmap.bits[k]);
    expect(Array.from(rendered)).toEqual(Array.from(exported));
  });
});
