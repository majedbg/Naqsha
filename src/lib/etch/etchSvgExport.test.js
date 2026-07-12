import { describe, it, expect } from 'vitest';
import { buildAllLayersSVG, buildLayerSVG } from '../svgExport.js';
import { etchSourceToBitmap } from './etchProcess.js';
import { decodeEtchPNG } from './etchTestKit.js';
import { bitmapToRGBA } from './etchBitmap.js';
import { resolveExportColor } from '../fabrication.js';

// A minimal etch canvas-instance, exactly as useCanvas registers it: the
// single-source bitmap plus the export-capability flag svgExport duck-types on.
function etchInstance(bitmap) {
  return { supportsEtchExport: true, etchBitmap: bitmap };
}

// A minimal vector pattern instance — just enough for buildAllLayersSVG to emit
// a `<path>` group (mirrors the real pattern-instance contract).
function vectorInstance() {
  return {
    toSVGGroup: (id, color) => `<g id="${id}"><path d="M0 0 L10 10" stroke="${color}"/></g>`,
  };
}

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

const bitmap = () => etchSourceToBitmap(grayImage([[0, 255], [200, 100]]));

describe('svgExport — Etch embeds a bitmap, cut/score stay vector (ADR-0001 two-path)', () => {
  it('buildAllLayersSVG emits BOTH an <image> for the etch AND a <path> for the vector layer', () => {
    const etch = { id: 'e1', type: 'etch', visible: true, color: '#000000' };
    const cut = { id: 'c1', type: 'pattern', visible: true, color: '#ff0000', opacity: 100 };
    const instances = { e1: etchInstance(bitmap()), c1: vectorInstance() };

    const svg = buildAllLayersSVG([etch, cut], instances, 200, 200, false, {});

    // Etch → embedded raster bitmap.
    expect(svg).toContain('<image');
    expect(svg).toContain('data:image/png;base64,');
    expect(svg).toContain('image-rendering: pixelated');
    // Vector layer → still a vector path (two-path export intact).
    expect(svg).toContain('<path');
    // The etch must NOT have been vectorized into dots.
    expect(svg).not.toContain('<circle');
  });

  it('the embedded <image> decodes back to the exact etch bits', () => {
    const bmp = bitmap();
    const etch = { id: 'e1', type: 'etch', visible: true, color: '#000000' };
    const svg = buildAllLayersSVG([etch], { e1: etchInstance(bmp) }, 64, 64, false, {});
    const href = svg.match(/href="(data:image\/png;base64,[^"]+)"/)[1];
    const decoded = decodeEtchPNG(href);
    expect(Array.from(decoded.bits)).toEqual(Array.from(bmp.bits));
    expect(decoded.width).toBe(bmp.width);
    expect(decoded.height).toBe(bmp.height);
  });

  it('exports at the engrave colour (from the layer color)', () => {
    const etch = { id: 'e1', type: 'etch', visible: true, color: '#112233' };
    const svg = buildAllLayersSVG([etch], { e1: etchInstance(bitmap()) }, 64, 64, false, {});
    const href = svg.match(/href="(data:image\/png;base64,[^"]+)"/)[1];
    expect(decodeEtchPNG(href).palette[1]).toEqual([0x11, 0x22, 0x33]);
  });

  it('buildLayerSVG (single-layer export) also emits the embedded <image>', () => {
    const etch = { id: 'e1', name: 'Etch 1', type: 'etch', visible: true, color: '#000000' };
    const svg = buildLayerSVG(etch, etchInstance(bitmap()), 64, 64, {});
    expect(svg).toContain('<image');
    expect(svg).toContain('data:image/png;base64,');
  });
});

describe('Etch export colour == canvas colour (WYSIWYG on the colour axis, FIX 1)', () => {
  // A recoloured Engrave Operation: the canvas paints the Etch in the OP colour
  // (resolveExportColor on laser), so the exported bitmap must too — not a stale
  // hardcoded layer.color.
  const RECOLOURED = '#3399cc';
  const operations = [
    { id: 'op-cut', name: 'Cut', color: '#ff0000', process: 'cut' },
    { id: 'op-engrave', name: 'Engrave', color: RECOLOURED, process: 'engrave' },
  ];
  // The Etch layer keeps its default black `color`; only the OPERATION is recoloured.
  const etch = { id: 'e1', type: 'etch', visible: true, color: '#000000', operationId: 'op-engrave' };

  it('buildAllLayersSVG palette matches the operation-resolved canvas colour, not layer.color', () => {
    const bmp = bitmap();
    const svg = buildAllLayersSVG([etch], { e1: etchInstance(bmp) }, 64, 64, false, {
      operations,
      profileId: 'laser',
    });
    const href = svg.match(/href="(data:image\/png;base64,[^"]+)"/)[1];
    const palette = decodeEtchPNG(href).palette[1];

    // The colour the canvas would render this Etch in (same resolver path).
    const canvasColor = resolveExportColor(etch, { operations, outputMode: 'laser' });
    expect(canvasColor).toBe(RECOLOURED);
    // Exported palette == canvas colour, and NOT the layer's own black.
    const rgba = bitmapToRGBA(bmp, canvasColor);
    // first ink pixel's RGB == palette entry
    const inkIdx = bmp.bits.indexOf(1) * 4;
    expect([rgba[inkIdx], rgba[inkIdx + 1], rgba[inkIdx + 2]]).toEqual(palette);
    expect(palette).toEqual([0x33, 0x99, 0xcc]);
    expect(palette).not.toEqual([0, 0, 0]);
  });

  it('buildLayerSVG resolves the engrave colour the same way', () => {
    const svg = buildLayerSVG(etch, etchInstance(bitmap()), 64, 64, { operations, profileId: 'laser' });
    const href = svg.match(/href="(data:image\/png;base64,[^"]+)"/)[1];
    expect(decodeEtchPNG(href).palette[1]).toEqual([0x33, 0x99, 0xcc]);
  });

  it('falls back to layer.color when no operations are threaded (byte-stable legacy path)', () => {
    const plain = { id: 'e1', type: 'etch', visible: true, color: '#654321' };
    const svg = buildAllLayersSVG([plain], { e1: etchInstance(bitmap()) }, 64, 64, false, {});
    const href = svg.match(/href="(data:image\/png;base64,[^"]+)"/)[1];
    expect(decodeEtchPNG(href).palette[1]).toEqual([0x65, 0x43, 0x21]);
  });
});
