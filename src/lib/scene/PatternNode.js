// Adapter node: wraps the app's existing (layer metadata + generated Pattern
// instance) pair. It delegates SVG output to the instance exactly as the export
// pipeline does today, so wrapping a layer in a PatternNode is behavior-neutral.

import { SceneNode } from './SceneNode.js';
import { transformToSVG } from '../transform/transformOps.js';

export class PatternNode extends SceneNode {
  constructor(layer, instance, transform) {
    super({ id: layer.id, type: 'pattern', visible: layer.visible !== false, transform });
    this.layer = layer;
    this.instance = instance;
  }

  toSVGGroup() {
    const inner = this.instance.toSVGGroup(this.layer.id, this.layer.color, this.layer.opacity);
    // Identity-safe: only wrap in a transform group when the transform is
    // non-identity. `transformToSVG` returns '' for identity, so an untouched
    // pattern emits exactly what it does today (byte-identical export).
    const svgTransform = transformToSVG(this.transform);
    return svgTransform ? `<g transform="${svgTransform}">${inner}</g>` : inner;
  }

  serialize() {
    return { ...super.serialize(), layer: this.layer };
  }
}
