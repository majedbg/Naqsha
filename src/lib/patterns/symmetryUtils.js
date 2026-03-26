/**
 * Apply radial symmetry transforms during p5 canvas drawing.
 * symmetry is a number 1–11:
 *   1 = no symmetry (single copy)
 *   N = N copies rotated by 360/N degrees each
 * startAngle is in radians — applied before symmetry copies.
 * offsetX/offsetY shift the pattern origin in pixels.
 * drawBase() should draw the pattern centered at (0, 0).
 */
export function applySymmetryDraw(p, symmetry, cx, cy, drawBase, startAngle = 0, offsetX = 0, offsetY = 0) {
  const n = toSymmetryCount(symmetry);

  if (n <= 1) {
    p.push();
    p.translate(cx + offsetX, cy + offsetY);
    if (startAngle) p.rotate(startAngle);
    drawBase();
    p.pop();
    return;
  }

  for (let i = 0; i < n; i++) {
    p.push();
    p.translate(cx + offsetX, cy + offsetY);
    p.rotate((p.TWO_PI / n) * i + startAngle);
    drawBase();
    p.pop();
  }
}

/**
 * Wrap SVG path content with radial symmetry transform groups.
 * startAngleDeg is in degrees. offsetX/offsetY in pixels.
 */
export function wrapSVGSymmetry(layerId, color, opacity, pathsContent, symmetry, cx, cy, startAngleDeg = 0, offsetX = 0, offsetY = 0) {
  const opacityAttr = opacity < 100 ? ` opacity="${(opacity / 100).toFixed(2)}"` : '';
  const n = toSymmetryCount(symmetry);
  const tx = cx + offsetX;
  const ty = cy + offsetY;

  if (n <= 1) {
    const rot = startAngleDeg ? ` rotate(${startAngleDeg})` : '';
    return `  <g id="layer-${layerId}"${opacityAttr}>
    <g transform="translate(${tx},${ty})${rot}">
${pathsContent}
    </g>
  </g>`;
  }

  let groups = '';
  for (let i = 0; i < n; i++) {
    const angle = (360 / n) * i + startAngleDeg;
    groups += `    <g transform="translate(${tx},${ty}) rotate(${angle})">
${pathsContent}
    </g>\n`;
  }
  return `  <g id="layer-${layerId}"${opacityAttr}>
${groups}  </g>`;
}

/**
 * Normalize symmetry value to an integer count.
 * Handles both new numeric values and legacy string values for backwards compat.
 */
function toSymmetryCount(symmetry) {
  if (typeof symmetry === 'number') return Math.max(1, Math.round(symmetry));

  // Legacy string support (in case old layer state is loaded)
  if (symmetry === 'none' || symmetry === 'single') return 1;
  if (symmetry === 'vertical' || symmetry === 'mirror' || symmetry === 'horizontal') return 2;
  if (symmetry === 'quad') return 4;
  const match = String(symmetry).match(/radial(\d+)/);
  if (match) return parseInt(match[1]);
  return 1;
}
