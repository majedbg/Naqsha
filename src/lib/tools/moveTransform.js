// Pure helper for the Select/Move tool. Kept React-free so it can be unit
// tested directly (the pointer glue around it lives in RightPanel).
//
// Node hit-testing for "what did I click on" is owned by scene/selectables
// (pickTopmost), which is transform-aware; this module only carries the move
// math.

const IDENTITY = { x: 0, y: 0, rotation: 0, scale: 1 };

/**
 * Apply an absolute pointer delta (canvas space) to a starting transform,
 * preserving rotation/scale. Absolute-from-drag-start avoids frame-to-frame
 * drift: the caller passes the transform captured at pointerdown plus the total
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
