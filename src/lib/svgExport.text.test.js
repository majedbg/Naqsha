// Phase 6: SVG export emits text-layer glyph OUTLINES via TextNode.toSVGGroup,
// using a text-bbox-center pivot (NOT the canvas-center wrapLayerTransform that
// patterns use). The resolved opentype font is threaded in as opts.font; without
// it the text layer is skipped gracefully.

import { describe, it, expect, beforeAll } from 'vitest';
import { buildAllLayersSVG, buildLayerSVG } from './svgExport.js';
import { defaultTextParams } from './text/textLayer.js';
import { loadWorkSans } from '../test/loadWorkSans.js';

let font;
beforeAll(() => {
  font = loadWorkSans();
});

const W = 384, H = 384;

function textLayer(paramOverrides = {}, extra = {}) {
  return {
    id: 't1',
    name: 'T',
    type: 'text',
    patternType: 'text',
    visible: true,
    params: defaultTextParams({ text: 'Hi', x: 100, y: 100, fontSize: 64, ...paramOverrides }),
    ...extra,
  };
}

describe('buildAllLayersSVG — text layers', () => {
  it('emits a <g id> with a non-empty path; fill render mode uses engrave black, not none', () => {
    const svg = buildAllLayersSVG([textLayer()], {}, W, H, false, { font });
    expect(svg).toContain('<g id="t1"');
    expect(svg).toMatch(/<path d="[^"]+"/); // non-empty path data
    expect(svg).toContain('fill="#000000"');
    expect(svg).not.toContain('fill="none"');
  });

  it('skips the text layer gracefully when no font is supplied (still valid svg)', () => {
    const svg = buildAllLayersSVG([textLayer()], {}, W, H, false, {});
    expect(svg).not.toContain('<g id="t1"');
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg.trimEnd().endsWith('</svg>')).toBe(true);
  });

  it('emits no text group for empty text even with a font', () => {
    const svg = buildAllLayersSVG([textLayer({ text: '' })], {}, W, H, false, { font });
    expect(svg).not.toContain('<g id="t1"');
    expect(svg).not.toContain('<path d=');
  });

  it('outline render mode emits stroke and fill="none"', () => {
    const svg = buildAllLayersSVG([textLayer({ renderMode: 'outline' })], {}, W, H, false, { font });
    expect(svg).toContain('<g id="t1"');
    expect(svg).toContain('stroke=');
    expect(svg).toContain('fill="none"');
  });

  it('applies a committed transform (text-pivot form) without double-wrapping', () => {
    const layer = textLayer({}, { transform: { x: 20, y: 0, rotation: 0, scale: 1 } });
    const svg = buildAllLayersSVG([layer], {}, W, H, false, { font });
    // The transform attr lives on the SAME <g id> the text emits — not an outer
    // wrapLayerTransform <g transform> (which would have NO id).
    expect(svg).toMatch(/<g id="t1" transform="[^"]+"/);
    expect(svg).not.toContain('<g transform='); // no canvas-center wrapper
  });
});

describe('buildLayerSVG — single text layer', () => {
  it('returns a valid svg with the text path even when patternInstance is null', () => {
    const svg = buildLayerSVG(textLayer(), null, W, H, { font });
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg.trimEnd().endsWith('</svg>')).toBe(true);
    expect(svg).toContain('<g id="t1"');
    expect(svg).toMatch(/<path d="[^"]+"/);
  });
});
