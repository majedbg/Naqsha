// Pure transform-gesture math for the Select tool's rotate/resize handles.
//
// Mirrors the conventions in transformOps.js:
//   - a `transform` is { x, y, rotation, scale }; rotation is in DEGREES.
//   - rotate/scale happen ABOUT a pivot `center` ({x,y}). For a PatternNode the
//     center is the canvas center (canvasW/2, canvasH/2).
//
// These functions are React-free so the pointer glue in RightPanel stays thin
// and the math is unit-tested directly.

import { inversePoint } from '../transform/transformOps.js';
import { hitTestHandle } from '../transform/handles.js';

const IDENTITY = { x: 0, y: 0, rotation: 0, scale: 1 };

/**
 * Classify a WORLD-space pointer against the selected node's transform handles.
 *
 * `selected` is { transform, localBBox:{x,y,w,h} }. We inverse-map `point` into
 * the node's LOCAL space (about the localBBox center) and hit-test the handles
 * laid out for the local bbox. A rotate handle → {kind:'rotate'}; a resize
 * handle → {kind:'resize', handleId}; otherwise {kind:'none'}.
 *
 * Move is NOT classified here — the caller owns node hit-testing for move via
 * pickTopmostHit. This only detects handle hits so selected-node handles win.
 */
export function classifyPointer(point, selected, w, h) {
  if (!selected || !selected.localBBox) return { kind: 'none' };
  const bbox = selected.localBBox;
  const transform = selected.transform || IDENTITY;
  const center = { x: bbox.x + bbox.w / 2, y: bbox.y + bbox.h / 2 };
  const localPoint = inversePoint(point, transform, center);
  const handle = hitTestHandle(localPoint, bbox);
  if (!handle) return { kind: 'none' };
  if (handle.type === 'rotate') return { kind: 'rotate' };
  return { kind: 'resize', handleId: handle.id };
}

// Angle (degrees) from `center` to `p`, using the same y-down screen convention
// as transform.rotation (atan2 over raw dx/dy).
function angleDeg(center, p) {
  return Math.atan2(p.y - center.y, p.x - center.x) * (180 / Math.PI);
}

function dist(a, b) {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/**
 * Rotate gesture: rotation = startTransform.rotation + (currentAngle - startAngle)
 * where angles are measured from `center` to the start/current pointer. With
 * `snap`, the ABSOLUTE resulting rotation is rounded to the nearest 15°
 * (Figma/Illustrator shift-drag behavior). x, y, scale unchanged.
 */
export function rotateTransform(startTransform, center, startPoint, currentPoint, snap = false) {
  const t = startTransform || IDENTITY;
  const delta = angleDeg(center, currentPoint) - angleDeg(center, startPoint);
  let rotation = (t.rotation ?? 0) + delta;
  if (snap) rotation = Math.round(rotation / 15) * 15;
  return {
    x: t.x ?? 0,
    y: t.y ?? 0,
    rotation,
    scale: t.scale ?? 1,
  };
}

/**
 * Uniform scale gesture: scale = startTransform.scale * (dist(center,current) /
 * dist(center,start)), clamped to >= minScale. If the start distance is 0
 * (degenerate — pointer started at the pivot), the ratio is treated as 1 so the
 * scale stays put rather than producing NaN/Infinity. x, y, rotation unchanged.
 */
export function scaleTransform(startTransform, center, startPoint, currentPoint, minScale = 0.05) {
  const t = startTransform || IDENTITY;
  const startDist = dist(center, startPoint);
  const curDist = dist(center, currentPoint);
  const ratio = startDist === 0 ? 1 : curDist / startDist;
  const scale = Math.max(minScale, (t.scale ?? 1) * ratio);
  return {
    x: t.x ?? 0,
    y: t.y ?? 0,
    rotation: t.rotation ?? 0,
    scale,
  };
}
