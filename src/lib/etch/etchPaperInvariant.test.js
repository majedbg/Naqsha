// The WYSIWYG single-source invariant WITH a Paper Stage active (Raster Etch S6,
// #85; grilled decision 4). The S1/S2 invariants proved render==export for the
// bare cut and for a Tone-shaped field; this proves it STILL holds once seeded
// paper grain textures the field on the way to a screen. It routes a LOUD Paper
// Stage (above a Dither) through the SAME seam production uses — computeEtchBitmap
// (etchSourceToBitmap with the stack) → makeEtchInstance — so the bits the canvas
// paints and the bits the SVG embeds are ONE buffer shaped by the grain, not two.
//
// The Paper params are deliberately loud + near-cut (grain 90 on a mid-gray source)
// so the grain genuinely moves screened bits — this exercises TEXTURED bits, not a
// stack that happens to be identity. The seed is fixed so the whole thing is
// deterministic run to run.

import { describe, it, expect } from 'vitest';
import { computeEtchBitmap } from './etchWorkerBridge.js';
import { makeEtchInstance } from './etchInstance.js';
import { bitmapToRGBA } from './etchBitmap.js';
import { buildAllLayersSVG } from '../svgExport.js';
import { decodeEtchPNG } from './etchTestKit.js';
import { createDitherStage, STAGE_PAPER } from './etchStage.js';
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

describe('Etch WYSIWYG invariant WITH a Paper Stage active', () => {
  const source = grayImage([
    [120, 132, 126, 130],
    [128, 122, 136, 116],
    [134, 118, 128, 132],
    [124, 130, 120, 126],
  ]);
  const layer = { id: 'e1', type: 'etch', visible: true, color: '#000000' };
  const W = 4;
  const H = 4;

  // A loud, fixed-seed Paper Stage above a Dither screen: the grain textures the
  // field the screen dithers, so several bits differ from the bare Dither.
  const paper = { id: 'p1', type: STAGE_PAPER, bypassed: false, params: { grain: 90, scale: 3, seed: 135790 } };
  const stack = [paper, createDitherStage()];

  it('the Paper Stage actually textures the bits (not a hidden identity)', async () => {
    const withPaper = await computeEtchBitmap(source, { stack }, { workerFactory: null });
    const bareDither = etchSourceToBitmap(source, { stack: [createDitherStage()] });
    expect(Array.from(withPaper.bits)).not.toEqual(Array.from(bareDither.bits));
  });

  it('rendered pixels equal exported pixels equal the paper-textured canonical bits', async () => {
    const bitmap = await computeEtchBitmap(source, { stack }, { workerFactory: null });
    const instance = makeEtchInstance(bitmap);

    const rendered = renderInkMask(instance, layer.color, W, H);
    const exported = exportInkMask(instance, layer, W, H);

    expect(Array.from(rendered)).toEqual(Array.from(bitmap.bits));
    expect(Array.from(exported)).toEqual(Array.from(bitmap.bits));
    expect(Array.from(rendered)).toEqual(Array.from(exported));
  });

  it('is deterministic — the same seed re-computes byte-identical bits', async () => {
    const a = await computeEtchBitmap(source, { stack }, { workerFactory: null });
    const b = await computeEtchBitmap(source, { stack }, { workerFactory: null });
    expect(Array.from(a.bits)).toEqual(Array.from(b.bits));
  });
});
