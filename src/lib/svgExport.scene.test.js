// Node tests for the scene-graph export entry `buildSceneSVG`. It mirrors
// `buildAllLayersSVG` but sources each group from `node.toSVGGroup()`, so with
// identity transforms the output must be BYTE-IDENTICAL to `buildAllLayersSVG`.
import { describe, it, expect } from 'vitest';
import { buildSceneSVG, buildAllLayersSVG } from './svgExport.js';
import { SceneGraph } from './scene/sceneGraph.js';

const mk = () => ({
  toSVGGroup: (id) => `<g id="${id}"><path d="M0,0 L1,1"/></g>`,
});

describe('buildSceneSVG byte-identity to buildAllLayersSVG (identity transforms)', () => {
  it('matches for a simple single-layer set', () => {
    const layers = [{ id: 'a', name: 'A', color: '#f00', opacity: 100, visible: true, bgOpacity: 0 }];
    const instances = { a: mk() };
    const direct = buildAllLayersSVG(layers, instances, 384, 384, true, {});
    const viaScene = buildSceneSVG(SceneGraph.fromLayers(layers, instances), 384, 384, true, {});
    expect(viaScene).toBe(direct);
  });

  it('matches for a multi-layer set with a hidden layer and a bg-rect layer', () => {
    const layers = [
      { id: 'a', name: 'A', color: '#f00', opacity: 100, visible: true, bgOpacity: 30, bgColor: '#abc' },
      { id: 'b', name: 'B', color: '#0f0', opacity: 50, visible: false, bgOpacity: 0 },
      { id: 'c', name: 'C', color: '#00f', opacity: 80, visible: true, bgOpacity: 0 },
    ];
    const instances = { a: mk(), b: mk(), c: mk() };
    for (const inc of [false, true]) {
      const direct = buildAllLayersSVG(layers, instances, 384, 384, inc, {});
      const viaScene = buildSceneSVG(SceneGraph.fromLayers(layers, instances), 384, 384, inc, {});
      expect(viaScene).toBe(direct);
    }
  });

  it('matches with metadata + manifest opts', () => {
    const layers = [{ id: 'a', name: 'A', color: '#f00', opacity: 100, visible: true, bgOpacity: 0 }];
    const instances = { a: mk() };
    const opts = { metadata: true, manifest: 'x--y' };
    const direct = buildAllLayersSVG(layers, instances, 256, 256, true, opts);
    const viaScene = buildSceneSVG(SceneGraph.fromLayers(layers, instances), 256, 256, true, opts);
    expect(viaScene).toBe(direct);
  });
});

describe('buildSceneSVG applies node transforms', () => {
  it('a non-identity transform wraps the group in <g transform="translate(5 0)">', () => {
    const layers = [{ id: 'a', name: 'A', color: '#f00', opacity: 100, visible: true, bgOpacity: 0 }];
    const instances = { a: mk() };
    const transformsById = { a: { x: 5, y: 0, rotation: 0, scale: 1 } };
    const svg = buildSceneSVG(SceneGraph.fromLayers(layers, instances, transformsById), 384, 384, true, {});
    expect(svg).toContain('<g transform="translate(5 0)"><g id="a">');
  });

  it('a rotation wraps the group in the center-pivot transform', () => {
    const layers = [{ id: 'a', name: 'A', color: '#f00', opacity: 100, visible: true, bgOpacity: 0 }];
    const instances = { a: mk() };
    const transformsById = { a: { x: 0, y: 0, rotation: 30, scale: 1 } };
    const svg = buildSceneSVG(SceneGraph.fromLayers(layers, instances, transformsById), 384, 384, true, {});
    // pivot = center of the full-canvas bbox = (192, 192).
    expect(svg).toContain(
      '<g transform="translate(192 192) rotate(30) translate(-192 -192)"><g id="a">'
    );
  });

  it('pivots about the LOCAL center even when the node is also translated', () => {
    // Canvas-vs-SVG invariant: the rotation center must be the local bbox center
    // (192,192), NOT the world AABB center (which would include the (10,20)
    // translate and be (202,212)). The translate(10 20) leads, then the pivot.
    const layers = [{ id: 'a', name: 'A', color: '#f00', opacity: 100, visible: true, bgOpacity: 0 }];
    const instances = { a: mk() };
    const transformsById = { a: { x: 10, y: 20, rotation: 30, scale: 1 } };
    const svg = buildSceneSVG(SceneGraph.fromLayers(layers, instances, transformsById), 384, 384, true, {});
    expect(svg).toContain(
      '<g transform="translate(10 20) translate(192 192) rotate(30) translate(-192 -192)"><g id="a">'
    );
    expect(svg).not.toContain('translate(202 212)');
  });
});

describe('buildSceneSVG respects the includeHidden filter', () => {
  const layers = [
    { id: 'vis', name: 'V', color: '#f00', opacity: 100, visible: true, bgOpacity: 0 },
    { id: 'hid', name: 'H', color: '#0f0', opacity: 100, visible: false, bgOpacity: 0 },
  ];
  const instances = { vis: mk(), hid: mk() };

  it('excludes hidden nodes when includeHidden is false', () => {
    const svg = buildSceneSVG(SceneGraph.fromLayers(layers, instances), 384, 384, false, {});
    expect(svg).toContain('<g id="vis">');
    expect(svg).not.toContain('<g id="hid">');
  });

  it('includes hidden nodes when includeHidden is true', () => {
    const svg = buildSceneSVG(SceneGraph.fromLayers(layers, instances), 384, 384, true, {});
    expect(svg).toContain('<g id="vis">');
    expect(svg).toContain('<g id="hid">');
  });
});
