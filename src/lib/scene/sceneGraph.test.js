// P0b core guarantee: the scene graph is a LOSSLESS container over the app's
// existing (layers[], instances{}) representation. Exporting through the graph
// must produce byte-identical SVG to exporting the layers directly — proving the
// abstraction is additive with zero behavior change.
import { describe, it, expect } from 'vitest';
import { buildAllLayersSVG } from '../svgExport.js';
import { SceneGraph } from './sceneGraph.js';
import CirclePacking from '../patterns/CirclePacking.js';
import { RecordingContext } from '../patterns/drawingContext.js';

const stub = () => ({ toSVGGroup: (id) => `<g id="${id}"><path d="M0,0 L1,1"/></g>` });
const layers = [
  { id: 'a', name: 'A', color: '#f00', opacity: 100, visible: true, bgOpacity: 0 },
  { id: 'b', name: 'B', color: '#0f0', opacity: 50, visible: false, bgOpacity: 30, bgColor: '#abc' },
  { id: 'c', name: 'C', color: '#00f', opacity: 100, visible: true, bgOpacity: 0 },
];
const instances = { a: stub(), b: stub(), c: stub() };

describe('SceneGraph export invariant', () => {
  it('export via the graph is byte-identical to buildAllLayersSVG over layers (incl. hidden + bg)', () => {
    const direct = buildAllLayersSVG(layers, instances, 384, 384, true, {});
    const { layers: gl, instances: gi } = SceneGraph.fromLayers(layers, instances).toExportInputs();
    expect(buildAllLayersSVG(gl, gi, 384, 384, true, {})).toBe(direct);
  });

  it('holds for a REAL generated pattern instance', () => {
    const inst = new CirclePacking();
    const params = { boundary: 'rectangle', render: 'outlines', minRadius: 4, maxRadius: 60, attempts: 500, linkDistance: 40, ringCount: 3, strokeWeight: 0.6, startAngle: 0, offsetX: 0, offsetY: 0 };
    inst.generateWithContext(new RecordingContext({ seed: 7 }), 7, params, 384, 384, '#224488', 80);
    const real = [{ id: 'cp', name: 'CP', color: '#224488', opacity: 80, visible: true, bgOpacity: 0 }];
    const realInst = { cp: inst };
    const direct = buildAllLayersSVG(real, realInst, 384, 384, false, { metadata: true });
    const { layers: gl, instances: gi } = SceneGraph.fromLayers(real, realInst).toExportInputs();
    expect(buildAllLayersSVG(gl, gi, 384, 384, false, { metadata: true })).toBe(direct);
  });

  it('reorder() changes z-order, reflected in export input order', () => {
    const g = SceneGraph.fromLayers(layers, instances);
    g.reorder(0, 2); // move 'a' to the end
    expect(g.toExportInputs().layers.map((l) => l.id)).toEqual(['b', 'c', 'a']);
  });

  it('serialize() captures node metadata + layer and is JSON-stable', () => {
    const s = SceneGraph.fromLayers(layers, instances).serialize();
    expect(s.nodes.map((n) => n.id)).toEqual(['a', 'b', 'c']);
    expect(s.nodes[0]).toMatchObject({
      id: 'a', type: 'pattern', transform: { x: 0, y: 0, rotation: 0, scale: 1 }, layer: layers[0],
    });
    expect(JSON.parse(JSON.stringify(s)).nodes[0].layer.id).toBe('a');
  });
});
