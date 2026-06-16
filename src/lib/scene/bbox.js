// World-space bounding boxes for scene nodes.
//
// A node's LOCAL bbox is resolved first, then the node transform is applied to
// produce the WORLD bbox (rotation/scale about the local-bbox center, then
// translation), via `transformBBox`.

import { transformBBox } from '../transform/transformOps.js';

/**
 * Resolve a node's LOCAL (untransformed) bbox.
 *
 * P1 APPROXIMATION: a PatternNode (type 'pattern') draws across the whole canvas
 * with no cheaply-known tight extent, so we approximate its local bbox as the
 * full canvas {0,0,canvasW,canvasH}. This is intentionally coarse — fine for
 * selecting / coarse culling at P1; a tight per-pattern bbox is a later refinement.
 *
 * A node that exposes its own `localBBox` (e.g. a future TextNode's text box)
 * uses that directly.
 */
function localBBox(node, canvasW, canvasH) {
  if (node && node.localBBox) return { ...node.localBBox };
  // PatternNode and anything else without a tight extent: full canvas.
  return { x: 0, y: 0, w: canvasW, h: canvasH };
}

/**
 * World-space AABB for `node` on a canvas of `canvasW` x `canvasH`.
 * Identity transform → the local bbox unchanged.
 */
export function nodeBBox(node, canvasW, canvasH) {
  const local = localBBox(node, canvasW, canvasH);
  const transform = (node && node.transform) || { x: 0, y: 0, rotation: 0, scale: 1 };
  return transformBBox(local, transform);
}
