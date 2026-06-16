// Selection handles for a node's WORLD-space (axis-aligned) bbox.
//
// Layout: 8 resize handles (4 corners + 4 edge midpoints) and 1 rotate handle
// positioned above the top-edge center. Positions are returned in the same
// coordinate space as the bbox passed in (callers rotate them with the node when
// drawing, if the node is rotated).

// How far above the top edge the rotate handle floats, in bbox units (px).
export const ROTATE_OFFSET = 24;

// Default minimum node size (px) used by clampSize when no min is supplied.
export const DEFAULT_MIN_SIZE = 8;

export const HANDLE_IDS = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w', 'rotate'];

/**
 * Lay out the 8 resize handles + 1 rotate handle for `worldBBox`
 * ({x,y,w,h}). Returns an array of { id, type, x, y }.
 */
export function handlesFor(worldBBox) {
  const { x, y, w, h } = worldBBox;
  const cx = x + w / 2;
  const cy = y + h / 2;
  const right = x + w;
  const bottom = y + h;
  return [
    { id: 'nw', type: 'resize', x, y },
    { id: 'n', type: 'resize', x: cx, y },
    { id: 'ne', type: 'resize', x: right, y },
    { id: 'e', type: 'resize', x: right, y: cy },
    { id: 'se', type: 'resize', x: right, y: bottom },
    { id: 's', type: 'resize', x: cx, y: bottom },
    { id: 'sw', type: 'resize', x, y: bottom },
    { id: 'w', type: 'resize', x, y: cy },
    { id: 'rotate', type: 'rotate', x: cx, y: y - ROTATE_OFFSET },
  ];
}

/**
 * Which handle (if any) is under `point`, within `tolerance` px (Chebyshev /
 * square hot-spot). Returns the handle object or null. The rotate handle is
 * checked first so it wins where it overlaps an edge handle's tolerance.
 */
export function hitTestHandle(point, worldBBox, tolerance = 6) {
  const handles = handlesFor(worldBBox);
  // Rotate first (sits apart, but be explicit about precedence).
  const ordered = [...handles].sort((a, b) => (a.id === 'rotate' ? -1 : b.id === 'rotate' ? 1 : 0));
  for (const hnd of ordered) {
    if (Math.abs(point.x - hnd.x) <= tolerance && Math.abs(point.y - hnd.y) <= tolerance) {
      return hnd;
    }
  }
  return null;
}

/**
 * Clamp a width/height to a minimum so a resize drag can't collapse a node to
 * zero (or invert). Returns { w, h }.
 */
export function clampSize(w, h, min = DEFAULT_MIN_SIZE) {
  return { w: Math.max(w, min), h: Math.max(h, min) };
}
