// Item 5 (interactive-editing core): identity-safe transform application in the
// export path. A PatternNode wraps its instance output in <g transform=...> ONLY
// when its transform is non-identity, so untouched patterns export byte-identical
// to today (the invariant all existing export tests depend on).
import { describe, it, expect } from 'vitest';
import { PatternNode } from './PatternNode.js';
import { buildAllLayersSVG } from '../svgExport.js';

const layer = { id: 'layer-7', color: '#abc', opacity: 80, visible: true };
const stubInstance = {
  toSVGGroup: (id, color, opacity) => `<g id="${id}" stroke="${color}" data-op="${opacity}">x</g>`,
};

describe('PatternNode identity-safe transform application (export invariant)', () => {
  it('identity transform emits NO wrapper — byte-identical to the bare instance output', () => {
    const node = new PatternNode(layer, stubInstance);
    expect(node.toSVGGroup()).toBe(stubInstance.toSVGGroup('layer-7', '#abc', 80));
    expect(node.toSVGGroup()).not.toContain('transform=');
  });

  it('a non-identity transform wraps the output in <g transform=...>', () => {
    const node = new PatternNode(layer, stubInstance, { x: 10, y: 20, rotation: 30, scale: 2 });
    expect(node.toSVGGroup()).toBe(
      `<g transform="translate(10 20) rotate(30) scale(2)">${stubInstance.toSVGGroup('layer-7', '#abc', 80)}</g>`
    );
  });

  it('buildAllLayersSVG over identity PatternNodes is BYTE-IDENTICAL to over raw layers', () => {
    const layers = [
      { id: 'a', name: 'A', color: '#f00', opacity: 100, visible: true, bgOpacity: 0 },
      { id: 'b', name: 'B', color: '#0f0', opacity: 50, visible: true, bgOpacity: 0 },
    ];
    const mk = () => ({ toSVGGroup: (id, c, o) => `<g id="${id}" stroke="${c}" data-op="${o}"><path d="M0,0 L1,1"/></g>` });
    const instances = { a: mk(), b: mk() };

    const direct = buildAllLayersSVG(layers, instances, 384, 384, true, {});

    const nodes = layers.map((l) => new PatternNode(l, instances[l.id]));
    const wrapped = Object.fromEntries(nodes.map((n) => [n.id, { toSVGGroup: () => n.toSVGGroup() }]));
    const viaNodes = buildAllLayersSVG(layers, wrapped, 384, 384, true, {});

    expect(viaNodes).toBe(direct);
  });

  it('a non-identity PatternNode injects a transform wrapper into the export', () => {
    const layers = [{ id: 'a', name: 'A', color: '#f00', opacity: 100, visible: true, bgOpacity: 0 }];
    const inst = { toSVGGroup: (id) => `<g id="${id}"><path d="M0,0 L1,1"/></g>` };
    const node = new PatternNode(layers[0], inst, { x: 5, y: 0, rotation: 0, scale: 1 });
    const wrapped = { a: { toSVGGroup: () => node.toSVGGroup() } };
    const svg = buildAllLayersSVG(layers, wrapped, 384, 384, true, {});
    expect(svg).toContain('<g transform="translate(5 0)">');
  });
});
