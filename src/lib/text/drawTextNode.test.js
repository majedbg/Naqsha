// Node tests for the PURE parts of drawTextNode. The p5 draw glue itself is
// browser-verified; here we assert the command builder bakes x/y like the SVG
// path does and exposes a local-bbox pivot, so canvas == SVG.
import { describe, it, expect, beforeAll } from 'vitest';
import { textNodeCommands } from './drawTextNode.js';
import { TextNode } from '../scene/TextNode.js';
import { loadWorkSans } from '../../test/loadWorkSans.js';

let font;
beforeAll(() => {
  font = loadWorkSans();
});

const base = {
  text: 'Sara',
  fontSize: 48,
  align: 'left',
  lineHeight: 1.2,
  box: { w: 0, h: 0 },
  lineMode: 'single',
  renderMode: 'fill',
  color: '#000000',
  x: 0,
  y: 0,
  transform: { x: 0, y: 0, rotation: 0, scale: 1 },
};

describe('textNodeCommands', () => {
  it('returns opentype path commands beginning with an M', () => {
    const { commands } = textNodeCommands(base, font);
    expect(commands.length).toBeGreaterThan(0);
    expect(commands[0].type).toBe('M');
    // All command types are from the opentype set.
    for (const c of commands) {
      expect(['M', 'L', 'C', 'Q', 'Z']).toContain(c.type);
    }
  });

  it("pivot is the WORLD bbox center (node.x + w/2, node.y + h/2)", () => {
    const tn = new TextNode({ ...base, font });
    const local = tn.localBBox();
    // At the origin, world center == local center.
    const { pivot } = textNodeCommands(base, font);
    expect(pivot.x).toBeCloseTo(local.w / 2, 4);
    expect(pivot.y).toBeCloseTo(local.h / 2, 4);
    // Offset by (x,y): the pivot must shift with the glyphs (so rotation pivots
    // about the visible text, and canvas == SVG export). This is the load-bearing
    // fix for interactive rotate/scale of moved text.
    const shifted = textNodeCommands({ ...base, x: 100, y: 50 }, font);
    expect(shifted.pivot.x).toBeCloseTo(local.w / 2 + 100, 4);
    expect(shifted.pivot.y).toBeCloseTo(local.h / 2 + 50, 4);
  });

  it('letters with counters (o, e, a) produce more than one sub-path (holes)', () => {
    // 'o' has an outer contour + an inner counter → at least two M commands.
    const { commands } = textNodeCommands({ ...base, text: 'o' }, font);
    const moves = commands.filter((c) => c.type === 'M').length;
    expect(moves).toBeGreaterThanOrEqual(2);
  });

  it('bakes node.x/node.y into glyph coordinates (matches SVG path)', () => {
    const shifted = textNodeCommands({ ...base, x: 100, y: 50 }, font);
    const origin = textNodeCommands(base, font);
    // First move command should be shifted by exactly (100, 50).
    expect(shifted.commands[0].x).toBeCloseTo(origin.commands[0].x + 100, 3);
    expect(shifted.commands[0].y).toBeCloseTo(origin.commands[0].y + 50, 3);
  });
});
