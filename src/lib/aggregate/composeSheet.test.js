// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { composeSheet } from './composeSheet.js';

describe('composeSheet — tracer', () => {
  it('wraps one placed piece in a labeled, translated group', () => {
    const svg = composeSheet(
      [{ id: 'sub-1', xMm: 10, yMm: 20, content: '<rect width="5" height="5"/>' }],
      { widthMm: 100, heightMm: 100 },
    );
    expect(svg).toContain('<g data-submission="sub-1"');
    expect(svg).toContain('transform="translate(10,20)"');
    expect(svg).toContain('<rect width="5" height="5"/>');
  });

  it('accepts an `svg` field and unwraps its outer <svg> element', () => {
    const piece = {
      id: 'sub-2',
      xMm: 0,
      yMm: 0,
      svg: '<svg xmlns="http://www.w3.org/2000/svg" width="10mm" viewBox="0 0 10 10"><circle r="2"/></svg>',
    };
    const out = composeSheet([piece], { widthMm: 50, heightMm: 50 });
    expect(out).toContain('<g data-submission="sub-2"');
    expect(out).toContain('<circle r="2"/>');
    // the inner content is hoisted; the piece's own <svg>/viewBox wrapper is dropped
    expect(out).not.toContain('viewBox="0 0 10 10"');
  });

  // Regression guard for the R4 "all-red sheet" worry on the design path: a
  // design submission spans multiple ops (cut+score) but composeSheet only
  // stamps ops[0] on the wrapping <g>. That group stroke must NOT flatten the
  // piece's colors — each inner element carries its own stroke (the buildAll-
  // LayersSVG/buildSubmissionSvg export always emits per-element strokes), so
  // the group stroke is overridden and per-layer convention colors survive.
  it('preserves a design piece’s own per-layer strokes (group op-stroke does not paint through)', () => {
    const piece = {
      id: 'design-1',
      xMm: 0,
      yMm: 0,
      ops: [{ key: 'layer-a', op: 'cut' }, { key: 'layer-b', op: 'score' }],
      svg:
        '<svg xmlns="http://www.w3.org/2000/svg" width="100mm" viewBox="0 0 100 50">' +
        '<g id="layer-a" data-role="cut"><path d="M0 0 L1 1" stroke="#FF0000"/></g>' +
        '<g id="layer-b" data-role="score"><path d="M0 0 L2 2" stroke="#0000FF"/></g>' +
        '</svg>',
    };

    const out = composeSheet([piece], { widthMm: 600, heightMm: 400 });

    // Both the cut (red) and score (blue) inner strokes are still present — the
    // single ops[0]=cut group stroke did not collapse the score layer to red.
    expect(out).toContain('stroke="#FF0000"');
    expect(out).toContain('stroke="#0000FF"');
  });
});

describe('composeSheet — op normalization', () => {
  function parse(svgString) {
    return new DOMParser().parseFromString(svgString, 'image/svg+xml');
  }

  it.each([
    ['cut', '#FF0000'],
    ['score', '#0000FF'],
    ['engrave', '#000000'],
  ])('normalizes op %s to stroke %s on the group', (process, color) => {
    const out = composeSheet(
      [{ id: 'p', xMm: 0, yMm: 0, content: '<rect/>', ops: [{ process }] }],
      { widthMm: 10, heightMm: 10 },
    );
    const g = parse(out).querySelector('g[data-submission="p"]');
    expect(g.getAttribute('stroke')).toBe(color);
    expect(g.getAttribute('fill')).toBe('none');
    expect(g.getAttribute('data-op')).toBe(process);
  });

  it.each([
    ['score', '#0000FF'],
    ['engrave', '#000000'],
  ])(
    'reads the persisted { key, label, op } shape (op=%s)',
    (op, color) => {
      const out = composeSheet(
        [
          {
            id: 'p',
            xMm: 0,
            yMm: 0,
            content: '<rect/>',
            ops: [{ key: '#00f', label: op, op }],
          },
        ],
        { widthMm: 10, heightMm: 10 },
      );
      const g = parse(out).querySelector('g[data-submission="p"]');
      expect(g.getAttribute('data-op')).toBe(op);
      expect(g.getAttribute('stroke')).toBe(color);
    },
  );

  it('accepts a bare process string in ops', () => {
    const out = composeSheet(
      [{ id: 'p', xMm: 0, yMm: 0, content: '<rect/>', ops: ['score'] }],
      { widthMm: 10, heightMm: 10 },
    );
    expect(parse(out).querySelector('g').getAttribute('stroke')).toBe('#0000FF');
  });

  it('defaults unknown/missing ops to the cut stroke', () => {
    const out = composeSheet(
      [{ id: 'p', xMm: 0, yMm: 0, content: '<rect/>', ops: ['mystery'] }],
      { widthMm: 10, heightMm: 10 },
    );
    expect(parse(out).querySelector('g').getAttribute('stroke')).toBe('#FF0000');
  });

  it('omits stroke attrs when a piece declares no ops', () => {
    const out = composeSheet(
      [{ id: 'p', xMm: 0, yMm: 0, content: '<rect/>' }],
      { widthMm: 10, heightMm: 10 },
    );
    expect(parse(out).querySelector('g').hasAttribute('stroke')).toBe(false);
  });
});

describe('composeSheet — sheet root', () => {
  function parse(svgString) {
    return new DOMParser().parseFromString(svgString, 'image/svg+xml');
  }

  it('roots the output in an <svg> sized to the sheet in mm with a matching viewBox', () => {
    const out = composeSheet(
      [{ id: 'p', xMm: 0, yMm: 0, content: '<rect/>' }],
      { widthMm: 300, heightMm: 200 },
    );
    const root = parse(out).documentElement;
    expect(root.tagName).toBe('svg');
    expect(root.getAttribute('width')).toBe('300mm');
    expect(root.getAttribute('height')).toBe('200mm');
    expect(root.getAttribute('viewBox')).toBe('0 0 300 200');
    expect(root.getAttribute('xmlns')).toBe('http://www.w3.org/2000/svg');
    // the piece group lives inside the root
    expect(root.querySelector('g[data-submission="p"]')).not.toBeNull();
  });

  it('emits one labeled, positioned group per placed piece', () => {
    const out = composeSheet(
      [
        { id: 'a', xMm: 5, yMm: 7, content: '<rect/>', ops: ['cut'] },
        { id: 'b', xMm: 40, yMm: 12, content: '<circle/>', ops: ['engrave'] },
        { id: 'c', xMm: 90, yMm: 3, content: '<line/>' },
      ],
      { widthMm: 200, heightMm: 100 },
    );
    const root = parse(out).documentElement;
    const groups = root.querySelectorAll('g[data-submission]');
    expect(groups.length).toBe(3);
    expect(groups[0].getAttribute('data-submission')).toBe('a');
    expect(groups[0].getAttribute('transform')).toBe('translate(5,7)');
    expect(groups[0].getAttribute('stroke')).toBe('#FF0000');
    expect(groups[1].getAttribute('data-submission')).toBe('b');
    expect(groups[1].getAttribute('transform')).toBe('translate(40,12)');
    expect(groups[1].getAttribute('stroke')).toBe('#000000');
    expect(groups[2].getAttribute('transform')).toBe('translate(90,3)');
    expect(groups[2].hasAttribute('stroke')).toBe(false);
  });

  it('returns an empty sheet root when given no pieces', () => {
    const out = composeSheet([], { widthMm: 10, heightMm: 10 });
    const root = parse(out).documentElement;
    expect(root.tagName).toBe('svg');
    expect(root.querySelectorAll('g[data-submission]').length).toBe(0);
  });
});
