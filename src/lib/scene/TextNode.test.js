// TextNode: a SceneNode that lays out text and emits glyph outlines as one
// <path>. Node tests, no DOM. Uses the bundled Work Sans OFL font fixture.

import { describe, it, expect, beforeAll } from 'vitest';
import { TextNode } from './TextNode.js';
import { SceneNode } from './SceneNode.js';
import { loadWorkSans } from '../../test/loadWorkSans.js';

let font;
beforeAll(() => {
  font = loadWorkSans();
});

describe('TextNode', () => {
  it('is a SceneNode of type text', () => {
    const n = new TextNode({ id: 't1', text: 'Hi', font });
    expect(n).toBeInstanceOf(SceneNode);
    expect(n.type).toBe('text');
    expect(n.id).toBe('t1');
  });

  it('localBBox is at the origin and grows with text length', () => {
    const short = new TextNode({ id: 'a', text: 'I', font, fontSize: 48 });
    const long = new TextNode({ id: 'b', text: 'Wide text here', font, fontSize: 48 });
    const sb = short.localBBox();
    const lb = long.localBBox();
    expect(sb.x).toBe(0);
    expect(sb.y).toBe(0);
    expect(lb.w).toBeGreaterThan(sb.w);
    // Single line: height = fontSize * lineHeight.
    expect(sb.h).toBeCloseTo(48 * 1.2, 4);
  });

  it('localBBox width grows with font size', () => {
    const small = new TextNode({ id: 'a', text: 'AB', font, fontSize: 24 });
    const big = new TextNode({ id: 'b', text: 'AB', font, fontSize: 96 });
    expect(big.localBBox().w).toBeGreaterThan(small.localBBox().w);
  });

  it('a multi-line node is taller than a single-line node', () => {
    const single = new TextNode({ id: 's', text: 'one two three', font, fontSize: 48 });
    const multi = new TextNode({
      id: 'm',
      text: 'one two three',
      font,
      fontSize: 48,
      lineMode: 'multi',
      box: { w: font.getAdvanceWidth('one two', 48), h: 500 },
    });
    expect(multi.localBBox().h).toBeGreaterThan(single.localBBox().h);
  });

  it('toSVGGroup emits one <path> with glyph data, filled by default', () => {
    const n = new TextNode({ id: 't', text: 'Sara', font, fontSize: 48, color: '#112233' });
    const svg = n.toSVGGroup();
    expect(svg).toContain('<g id="t"');
    // Exactly one path element.
    expect((svg.match(/<path /g) || []).length).toBe(1);
    expect(svg).toContain('fill="#112233"');
    expect(svg).toContain('fill-rule="nonzero"');
    // Real glyph data.
    expect(/d="M[^"]+"/.test(svg)).toBe(true);
  });

  it('multi-line node concatenates lines into a single <path>', () => {
    const n = new TextNode({
      id: 'm',
      text: 'one two three four',
      font,
      fontSize: 48,
      lineMode: 'multi',
      box: { w: font.getAdvanceWidth('one two', 48), h: 500 },
    });
    const svg = n.toSVGGroup();
    expect((svg.match(/<path /g) || []).length).toBe(1);
  });

  it('outline render mode strokes with no fill (no stroke-width)', () => {
    const n = new TextNode({ id: 't', text: 'Hi', font, renderMode: 'outline', color: '#abcdef' });
    const svg = n.toSVGGroup();
    expect(svg).toContain('fill="none"');
    expect(svg).toContain('stroke="#abcdef"');
    expect(svg).not.toContain('stroke-width');
  });

  it('omits the transform attribute for an identity transform', () => {
    const n = new TextNode({ id: 't', text: 'Hi', font });
    const svg = n.toSVGGroup();
    expect(svg).not.toContain('transform=');
  });

  it('emits a transform attribute when the transform is non-identity', () => {
    const n = new TextNode({ id: 't', text: 'Hi', font, transform: { x: 10, y: 20 } });
    const svg = n.toSVGGroup();
    expect(svg).toContain('transform="translate(10 20)"');
  });

  it('serialize round-trips editable fields, fontId not the font object', () => {
    const n = new TextNode({
      id: 't',
      text: 'Hello',
      font,
      fontId: 'work-sans',
      fontSize: 36,
      align: 'center',
      lineHeight: 1.5,
      box: { w: 100, h: 200 },
      lineMode: 'multi',
      renderMode: 'outline',
      color: '#ff0000',
    });
    const s = n.serialize();
    expect(s).toMatchObject({
      id: 't',
      type: 'text',
      text: 'Hello',
      fontId: 'work-sans',
      fontSize: 36,
      align: 'center',
      lineHeight: 1.5,
      box: { w: 100, h: 200 },
      lineMode: 'multi',
      renderMode: 'outline',
      color: '#ff0000',
    });
    expect('font' in s).toBe(false);
  });
});
