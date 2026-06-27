/**
 * Pure, WebGL-free zoom-to-fit camera math for the 3D preview (S2, spec D4).
 *
 * Given an axis-aligned bounding box and a perspective camera's fov + viewport
 * aspect, compute the camera POSITION and look-at TARGET that frame the box in a
 * default 3/4 view (~35° elevation). Reusable by BOTH sub-modes — only the box
 * differs. "Reset view" is just `computeZoomToFit` with the default angles.
 *
 * This module MUST stay three.js-free: it lives on the 2D side of the dynamic-
 * import boundary so it can be unit-tested in jsdom (the primary gate) without
 * dragging three across the boundary. Boxes are plain `{ min:[x,y,z],
 * max:[x,y,z] }` arrays; the R3F layer converts a THREE.Box3 to/from this shape.
 *
 * The framing uses the box's BOUNDING SPHERE (half the space diagonal) so the
 * fit is rotation- and aspect-robust: the design stays inside the frustum from
 * any orbit angle. A degenerate (zero-size) box falls back to MIN_RADIUS so the
 * camera never lands on the target and produces a black/empty view.
 */

export const DEG2RAD = Math.PI / 180;

/** Default 3/4 framing (spec D4). */
export const DEFAULT_FOV = 50;
export const DEFAULT_ELEVATION_DEG = 35; // angle above the horizontal plane
export const DEFAULT_AZIMUTH_DEG = 45; // turn around vertical for the 3/4 look
export const DEFAULT_FIT_MARGIN = 1.2; // padding so the bounds don't kiss the edges

/** Smallest framing radius — guards degenerate/empty boxes against a black view. */
export const MIN_RADIUS = 1e-3;

/** @typedef {{ min: [number, number, number], max: [number, number, number] }} Box */

/**
 * Centre of the box.
 * @param {Box} box
 * @returns {[number, number, number]}
 */
export function boxCenter(box) {
  return [
    (box.min[0] + box.max[0]) / 2,
    (box.min[1] + box.max[1]) / 2,
    (box.min[2] + box.max[2]) / 2,
  ];
}

/**
 * Per-axis size of the box.
 * @param {Box} box
 * @returns {[number, number, number]}
 */
export function boxSize(box) {
  return [box.max[0] - box.min[0], box.max[1] - box.min[1], box.max[2] - box.min[2]];
}

/**
 * Bounding-sphere radius (half the space diagonal), clamped to MIN_RADIUS and
 * guarded against non-finite input.
 * @param {Box} box
 * @returns {number}
 */
export function boundingRadius(box) {
  const [sx, sy, sz] = boxSize(box);
  const r = 0.5 * Math.hypot(sx, sy, sz);
  return Number.isFinite(r) && r > MIN_RADIUS ? r : MIN_RADIUS;
}

/**
 * Unit direction pointing FROM the target TO the camera, from spherical angles.
 * Elevation is measured above the horizontal (XZ) plane; azimuth turns around
 * the vertical (Y) axis. At elevation 0 / azimuth 0 the camera looks down −Z.
 * @param {number} elevationDeg
 * @param {number} azimuthDeg
 * @returns {[number, number, number]} unit vector
 */
export function viewDirection(elevationDeg = DEFAULT_ELEVATION_DEG, azimuthDeg = DEFAULT_AZIMUTH_DEG) {
  const el = elevationDeg * DEG2RAD;
  const az = azimuthDeg * DEG2RAD;
  const cosEl = Math.cos(el);
  return [cosEl * Math.sin(az), Math.sin(el), cosEl * Math.cos(az)];
}

/**
 * Distance at which a bounding sphere of `radius` fits inside the frustum, for
 * the limiting axis (vertical or horizontal, whichever is tighter), times a
 * padding margin. Portrait viewports (aspect < 1) are horizontally limited, so
 * both axes are evaluated and the larger distance wins.
 * @param {number} radius
 * @param {number} [fovDeg] vertical field of view
 * @param {number} [aspect] width / height
 * @param {number} [margin]
 * @returns {number}
 */
export function fitDistance(radius, fovDeg = DEFAULT_FOV, aspect = 1, margin = DEFAULT_FIT_MARGIN) {
  const safeAspect = Number.isFinite(aspect) && aspect > 0 ? aspect : 1;
  const vFov = fovDeg * DEG2RAD;
  const hFov = 2 * Math.atan(Math.tan(vFov / 2) * safeAspect);
  const distV = radius / Math.sin(vFov / 2);
  const distH = radius / Math.sin(hFov / 2);
  return Math.max(distV, distH) * margin;
}

/**
 * Compute the camera position + look-at target that frame `box` in the default
 * 3/4 view. Passing no box (or null) yields a sane default view about the
 * origin (never a degenerate/black framing).
 *
 * @param {{
 *   box?: Box | null,
 *   fov?: number,
 *   aspect?: number,
 *   elevationDeg?: number,
 *   azimuthDeg?: number,
 *   margin?: number,
 * }} [opts]
 * @returns {{ position: [number,number,number], target: [number,number,number], distance: number }}
 */
export function computeZoomToFit({
  box = null,
  fov = DEFAULT_FOV,
  aspect = 1,
  elevationDeg = DEFAULT_ELEVATION_DEG,
  azimuthDeg = DEFAULT_AZIMUTH_DEG,
  margin = DEFAULT_FIT_MARGIN,
} = {}) {
  const target = box ? boxCenter(box) : [0, 0, 0];
  const radius = box ? boundingRadius(box) : MIN_RADIUS;
  const distance = fitDistance(radius, fov, aspect, margin);
  const dir = viewDirection(elevationDeg, azimuthDeg);
  const position = [
    target[0] + dir[0] * distance,
    target[1] + dir[1] * distance,
    target[2] + dir[2] * distance,
  ];
  return { position, target, distance };
}
