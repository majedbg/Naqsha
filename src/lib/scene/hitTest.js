// Point-in-node hit testing that is correct for ROTATED / scaled nodes.
//
// A node's geometry lives in LOCAL space; the node transform places it in the
// world (scale/rotate about the local-bbox center, then translate — the same
// convention as bbox.js / transformBBox). To hit-test, we map the world pointer
// back into local space with `inversePoint` (using the local-bbox center as the
// pivot) and test the un-rotated local bbox.

import { inversePoint } from '../transform/transformOps.js';

function localBBox(node, canvasW, canvasH) {
  if (node && node.localBBox) return { ...node.localBBox };
  return { x: 0, y: 0, w: canvasW, h: canvasH };
}

/**
 * True if world-space `point` lands inside `node` on the given canvas.
 * Rotation-aware: the pointer is inverse-transformed into the node's local
 * space before the rectangle test.
 */
export function hitTestNode(point, node, canvasW, canvasH) {
  const local = localBBox(node, canvasW, canvasH);
  const transform = (node && node.transform) || { x: 0, y: 0, rotation: 0, scale: 1 };
  const pivot = { x: local.x + local.w / 2, y: local.y + local.h / 2 };
  const lp = inversePoint(point, transform, pivot);
  return (
    lp.x >= local.x &&
    lp.x <= local.x + local.w &&
    lp.y >= local.y &&
    lp.y <= local.y + local.h
  );
}
