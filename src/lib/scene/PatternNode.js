// Adapter node: wraps the app's existing (layer metadata + generated Pattern
// instance) pair. It delegates SVG output to the instance exactly as the export
// pipeline does today, so wrapping a layer in a PatternNode is behavior-neutral.

import { SceneNode } from './SceneNode.js';

export class PatternNode extends SceneNode {
  constructor(layer, instance) {
    super({ id: layer.id, type: 'pattern', visible: layer.visible !== false });
    this.layer = layer;
    this.instance = instance;
  }

  toSVGGroup() {
    return this.instance.toSVGGroup(this.layer.id, this.layer.color, this.layer.opacity);
  }

  serialize() {
    return { ...super.serialize(), layer: this.layer };
  }
}
