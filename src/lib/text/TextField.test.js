// TextField is the render object: it mirrors the Pattern.toSVGGroup(id, color,
// opacity) contract so it flows through the REAL svgExport pipeline unchanged.

import { describe, it, expect, beforeAll } from 'vitest';
import { TextField } from './TextField.js';
import { buildLayerSVG } from '../svgExport.js';
import { loadWorkSans } from '../../test/loadWorkSans.js';

let font;
beforeAll(() => {
  font = loadWorkSans();
});

const make = (renderMode) =>
  new TextField({ text: 'Sara', font, fontSize: 100, x: 0, y: 100, renderMode });

describe('TextField.toSVGGroup', () => {
  it('fill-engrave emits a filled glyph path with nonzero winding and no stroke', () => {
    const g = make('fill').toSVGGroup('layer-1', '#000000', 100);
    expect(g.startsWith('<g')).toBe(true);
    expect(g).toContain('id="layer-1"');
    expect(g).toMatch(/<path d="M[^"]+"/);
    expect(g).toContain('fill="#000000"');
    expect(g).toContain('fill-rule="nonzero"');
    expect(g).not.toContain('stroke=');
    expect(g.trimEnd().endsWith('</g>')).toBe(true);
  });

  it('outline-engrave emits an unfilled stroked path (hollow letters)', () => {
    const g = make('outline').toSVGGroup('layer-1', '#000000', 100);
    expect(g).toContain('fill="none"');
    expect(g).toContain('stroke="#000000"');
    expect(g).toMatch(/<path d="M[^"]+"/);
  });
});

describe('TextField through the real export pipeline', () => {
  it('buildLayerSVG produces a valid engrave-ready SVG containing the glyph path', () => {
    const tf = make('fill');
    const layer = { id: 'layer-1', name: 'Name', visible: true, color: '#000000', opacity: 100, bgOpacity: 0 };
    const svg = buildLayerSVG(layer, tf, 384, 384, {});
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true);
    expect(svg).toContain('viewBox="0 0 384 384"');
    expect(svg).toContain('id="layer-1"');
    expect(svg).toMatch(/<path d="M[^"]+"/);
    expect(svg).toContain('fill="#000000"'); // engrave color
    expect(svg.trimEnd().endsWith('</svg>')).toBe(true);
  });
});
