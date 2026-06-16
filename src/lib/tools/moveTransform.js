// Pure helpers for the Select/Move tool. Kept React-free so they can be unit
// tested directly (the only real logic in the move slice — pointer glue around
// them is in RightPanel).

import { SceneGraph } from '../scene/sceneGraph.js';
import { hitTestNode } from '../scene/hitTest.js';

const IDENTITY = { x: 0, y: 0, rotation: 0, scale: 1 };

/**
 * Apply an absolute pointer delta (canvas space) to a starting transform,
 * preserving rotation/scale. Absolute from drag-start avoids frame-to-frame
 * drift: caller passes the transform captured at pointerdown plus the total
 * delta (currentPoint - startPoint).
 */
export function applyMoveDelta(startTransform, dx, dy) {
  const t = startTransform || IDENTITY;
  return {
    x: (t.x || 0) + dx,
    y: (t.y || 0) + dy,
    rotation: t.rotation ?? 0,
    scale: t.scale ?? 1,
  };
}

/**
 * Topmost layer hit by `point` (canvas space). `layers[0]` is the front-most
 * layer (z-order matches layers[] order), so we test in array order and return
 * the first hit's id, or null on a miss. `instances`/`transforms` are passed so
 * hit-testing honors each node's live transform.
 */
export function pickTopmostHit(point, layers, instances = {}, transforms = {}, canvasW, canvasH) {
  const graph = SceneGraph.fromLayers(layers, instances, transforms);
  for (const node of graph.nodes) {
    if (node.visible === false) continue;
    if (hitTestNode(point, node, canvasW, canvasH)) return node.id;
  }
  return null;
}
