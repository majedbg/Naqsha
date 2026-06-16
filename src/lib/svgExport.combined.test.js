// Node tests for `buildCombinedSceneSVG`: pattern groups PLUS text-node glyph
// paths. The byte-identity invariant (no text → unchanged buildSceneSVG output)
// is the load-bearing assertion.
import { describe, it, expect, beforeAll } from 'vitest';
import { buildCombinedSceneSVG, buildSceneSVG } from './svgExport.js';
import { SceneGraph } from './scene/sceneGraph.js';
import { TextNode } from './scene/TextNode.js';
import { loadWorkSans } from '../test/loadWorkSans.js';

let font;
beforeAll(() => {
  font = loadWorkSans();
});

const mk = () => ({
  toSVGGroup: (id) => `<g id="${id}"><path d="M0,0 L1,1"/></g>`,
});

const layers = [{ id: 'a', name: 'A', color: '#f00', opacity: 100, visible: true, bgOpacity: 0 }];

const textNode = {
  id: 'txt1',
  type: 'text',
  text: 'Text',
  fontId: 'work-sans',
  fontSize: 120,
  align: 'left',
  lineHeight: 1.2,
  box: { w: 0, h: 0 },
  lineMode: 'single',
  renderMode: 'fill',
  color: '#000000',
  x: 100,
  y: 100,
  transform: { x: 0, y: 0, rotation: 0, scale: 1 },
};

describe('buildCombinedSceneSVG', () => {
  it('with NO text nodes, output is byte-identical to buildSceneSVG', () => {
    const instances = { a: mk() };
    const graph = () => SceneGraph.fromLayers(layers, instances);
    const direct = buildSceneSVG(graph(), 384, 384, true, {});
    for (const tn of [[], undefined]) {
      const combined = buildCombinedSceneSVG(graph(), tn, font, 384, 384, true, {});
      expect(combined).toBe(direct);
    }
  });

  it('with no font, output is byte-identical to buildSceneSVG', () => {
    const instances = { a: mk() };
    const direct = buildSceneSVG(SceneGraph.fromLayers(layers, instances), 384, 384, true, {});
    const combined = buildCombinedSceneSVG(
      SceneGraph.fromLayers(layers, instances),
      [textNode],
      null,
      384,
      384,
      true,
      {},
    );
    expect(combined).toBe(direct);
  });

  it('a scene with one text node exports an SVG containing a glyph <path>', () => {
    const instances = { a: mk() };
    const svg = buildCombinedSceneSVG(
      SceneGraph.fromLayers(layers, instances),
      [textNode],
      font,
      384,
      384,
      true,
      {},
    );
    // The text node's group, with real glyph data.
    expect(svg).toContain('<g id="txt1"');
    expect(/<path d="M[^"]+"/.test(svg)).toBe(true);
    expect(svg).toContain('fill="#000000"');
  });

  it('a ROTATED text node pivots about its WORLD bbox center (node.x/y + w/2)', () => {
    // Locks the canvas==SVG pivot invariant: the rotate is wrapped in a
    // translate(cx cy) … translate(-cx -cy) where (cx,cy) is the world bbox
    // center — node.x/y plus half the tight glyph box, NOT the canvas center
    // and NOT the origin-based (w/2,h/2).
    const tn = new TextNode({ ...textNode, font });
    const local = tn.localBBox();
    const cx = (textNode.x + local.w / 2);
    const cy = (textNode.y + local.h / 2);
    const round = (n) => Math.round(n * 1e4) / 1e4;

    const rotated = { ...textNode, transform: { x: 0, y: 0, rotation: 45, scale: 1 } };
    const instances = { a: mk() };
    const svg = buildCombinedSceneSVG(
      SceneGraph.fromLayers(layers, instances),
      [rotated],
      font,
      384,
      384,
      true,
      {},
    );
    expect(svg).toContain(`<g id="txt1" transform=`);
    expect(svg).toContain(`translate(${round(cx)} ${round(cy)}) rotate(45) translate(${round(-cx)} ${round(-cy)})`);
  });

  it('text is appended AFTER the pattern group (so text paints on top)', () => {
    const instances = { a: mk() };
    const svg = buildCombinedSceneSVG(
      SceneGraph.fromLayers(layers, instances),
      [textNode],
      font,
      384,
      384,
      true,
      {},
    );
    expect(svg.indexOf('<g id="a">')).toBeLessThan(svg.indexOf('<g id="txt1"'));
    // Still a well-formed single root document.
    expect(svg.endsWith('</svg>')).toBe(true);
  });
});
