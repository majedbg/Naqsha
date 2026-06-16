// The scene graph: an ordered list of SceneNodes. Introduced as a lossless
// container over the app's existing (layers[], instances{}) representation, so
// it can be adopted incrementally without changing export behavior. Array order
// IS z-order, matching how layers[] already works.

import { PatternNode } from './PatternNode.js';

export class SceneGraph {
  constructor(nodes = []) {
    this.nodes = nodes;
  }

  get(id) {
    return this.nodes.find((n) => n.id === id) ?? null;
  }

  /** Adapter IN: build a graph from today's layers[] + instances{} (order preserved,
   *  every layer kept — even instance-less ones — so the round-trip is exact). */
  static fromLayers(layers, instances = {}) {
    return new SceneGraph(layers.map((l) => new PatternNode(l, instances[l.id])));
  }

  /** Adapter OUT: the exact inputs the existing export functions consume. */
  toExportInputs() {
    const layers = this.nodes.map((n) => n.layer);
    const instances = {};
    for (const n of this.nodes) {
      if (n.instance !== undefined) instances[n.id] = n.instance;
    }
    return { layers, instances };
  }

  /** Move a node to a new index (z-order change). Returns this for chaining. */
  reorder(fromIndex, toIndex) {
    const [node] = this.nodes.splice(fromIndex, 1);
    this.nodes.splice(toIndex, 0, node);
    return this;
  }

  serialize() {
    return { nodes: this.nodes.map((n) => n.serialize()) };
  }
}
