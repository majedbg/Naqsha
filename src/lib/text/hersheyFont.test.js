import { describe, it, expect } from 'vitest';
import { makeHersheyFont } from './hersheyFont.js';
import hersheyData from './hersheyData.json';
import { TextNode } from '../scene/TextNode.js';
import { commandsToPathData } from './textToOutline.js';

const font = makeHersheyFont(hersheyData.futural);

describe('makeHersheyFont — opentype-shaped adapter', () => {
  it('exposes the single-line flag + the metrics the pipeline reads', () => {
    expect(font.isSingleLine).toBe(true);
    expect(font.unitsPerEm).toBeGreaterThan(0);
    expect(font.tables.os2.sCapHeight).toBeGreaterThan(0);
    expect(typeof font.getPath).toBe('function');
    expect(typeof font.getAdvanceWidth).toBe('function');
  });

  it('getAdvanceWidth is positive and linear in font size', () => {
    const a = font.getAdvanceWidth('AB', 48);
    const b = font.getAdvanceWidth('AB', 96);
    expect(a).toBeGreaterThan(0);
    expect(b).toBeCloseTo(2 * a, 5);
  });

  it('getPath emits ONLY open M/L polylines with finite coords (no fill/close)', () => {
    const p = font.getPath('Ag', 0, 0, 72);
    expect(p.commands.length).toBeGreaterThan(0);
    const types = new Set(p.commands.map((c) => c.type));
    // Single-line = open polylines: no curves, no Z close commands.
    expect([...types].every((t) => t === 'M' || t === 'L')).toBe(true);
    expect(p.commands.every((c) => Number.isFinite(c.x) && Number.isFinite(c.y))).toBe(true);
  });

  it('serialized path data has NO Z (open strokes), unlike a filled outline glyph', () => {
    const d = commandsToPathData(font.getPath('Hi', 0, 0, 72).commands);
    expect(d.length).toBeGreaterThan(0);
    expect(d.includes('Z')).toBe(false);
  });

  it('places caps ABOVE the baseline y (y grows downward, like opentype getPath)', () => {
    const p = font.getPath('A', 0, 100, 72); // baseline at y=100
    const ys = p.commands.map((c) => c.y);
    // A cap glyph sits above the baseline → some points are < 100, none far below.
    expect(Math.min(...ys)).toBeLessThan(100);
    expect(Math.max(...ys)).toBeLessThanOrEqual(101);
  });

  it('getBoundingBox returns finite bounds tracking the glyph extent', () => {
    const bb = font.getPath('W', 0, 0, 72).getBoundingBox();
    expect([bb.x1, bb.y1, bb.x2, bb.y2].every(Number.isFinite)).toBe(true);
    expect(bb.x2).toBeGreaterThan(bb.x1);
  });

  it('spaces advance the pen without drawing', () => {
    const noSpace = font.getPath('AB', 0, 0, 72);
    const withSpace = font.getPath('A B', 0, 0, 72);
    // 'A B' is wider than 'AB' (the space adds advance) but adds no extra M/L
    // beyond the two glyphs' own commands.
    expect(font.getAdvanceWidth('A B', 72)).toBeGreaterThan(font.getAdvanceWidth('AB', 72));
    expect(withSpace.commands.length).toBe(noSpace.commands.length);
  });
});

describe('single-line font through TextNode (SVG export paint)', () => {
  it('exports fill="none" stroked open paths regardless of renderMode', () => {
    const node = new TextNode({
      id: 't', text: 'Hi', font, fontId: 'engrave-sans', fontSize: 48,
      renderMode: 'fill', color: '#123456', // fill mode must STILL export as stroke
    });
    const svg = node.toSVGGroup({ x: 0, y: 0 });
    expect(svg).toContain('fill="none"');
    expect(svg).toContain('stroke="#123456"');
    expect(svg).not.toContain('fill-rule');
  });

  it('measures a tight local bbox (layout works via the adapter)', () => {
    const node = new TextNode({ text: 'Hello', font, fontId: 'engrave-sans', fontSize: 64 });
    const bb = node.localBBox();
    expect(bb.w).toBeGreaterThan(0);
    expect(bb.h).toBeGreaterThan(0);
  });
});
