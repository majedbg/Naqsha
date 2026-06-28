// Behind the 3D dynamic-import boundary (S1, PRD D9). This module STATICALLY
// imports three + the SVGLoader/BufferGeometryUtils addons, so it MUST be imported
// ONLY by other canvas3d/* modules (here: Marks.jsx) — never by a 2D render-path
// module, or three.js leaks into the 2D bundle. Its routing partner
// (lib/three3d/markTexture.routePanelRenderModes) is three-free and stays 2D-side.
import * as THREE from 'three';
import { SVGLoader } from 'three/examples/jsm/loaders/SVGLoader.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Surface A — RIBBON-MODE marks (S10, PRD D6/§3.2, the highest-risk slice).
 *
 * For sparse panels (route === 'ribbon', see markTexture.routePanelRenderModes) the
 * texture baseline is upgraded to TRUE vector geometry: each per-process emissive
 * mark SVG is parsed, every subpath stroked into a flat ribbon, and the ribbons
 * merged into one BufferGeometry that the scene lights emissive in front of the
 * sheet — crisp at any zoom, no raster.
 *
 * ── Pipeline reality (verified against three 0.185.0 source, NOT memory) ──
 * The PRD wording "SVGLoader.pointsToStroke -> ExtrudeGeometry -> mergeGeometries"
 * does not compose as literally written: `pointsToStroke` returns a TRIANGULATED
 * ribbon BufferGeometry, not a `THREE.Shape`, so it cannot feed `ExtrudeGeometry`
 * (which extrudes Shapes). The marks are STROKES (fills are stripped 2D-side), so
 * `shapePath.toShapes()` (filled regions) would yield nothing either. Flat stroke
 * ribbons via `pointsToStroke` are therefore the faithful tool; they are merged with
 * `mergeGeometries`. ExtrudeGeometry is intentionally NOT used and no z-depth is
 * baked — under the selective emissive bloom the glow dominates and ribbon depth is
 * imperceptible, so flat ribbons are visually equivalent while staying robust. This
 * is the documented deviation permitted by PRD §3.2.
 */

// pointsToStroke needs ≥2 points. A floor (in SVG user/viewBox units — see
// svgUserUnitSize: the mark SVGs are px-space, 96-PPI) so a hairline groove still
// strokes into a visible ribbon rather than a zero-area sliver. It is scaled to mm
// along with the rest of the geometry in buildRibbonGeometry, so a too-faint ribbon
// under bloom is tuned HERE (this is the knob), not by the world-space transform.
const MIN_STROKE_WIDTH = 0.4;

/**
 * The SVG's intrinsic user-unit extent — the coordinate space the path data (and
 * thus SVGLoader's points) live in. That is the viewBox size, NOT the width/height
 * presentation attributes: the mark SVGs (svgExport.svgOpen) declare
 * `width/height` in mm but a `viewBox="0 0 canvasW canvasH"` in 96-PPI px, and the
 * path coordinates are px. We must map THAT px space onto the mm plane frame.
 * Falls back to numeric width/height attrs, then null (caller then skips scaling).
 * @param {string} svg
 * @returns {[number, number] | null}
 */
function svgUserUnitSize(svg) {
  if (typeof svg !== 'string') return null;
  const vb = /viewBox\s*=\s*["']\s*[\d.eE+-]+\s+[\d.eE+-]+\s+([\d.eE+-]+)\s+([\d.eE+-]+)/.exec(svg);
  if (vb) {
    const w = parseFloat(vb[1]);
    const h = parseFloat(vb[2]);
    if (Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0) return [w, h];
  }
  const wm = /\bwidth\s*=\s*["']\s*([\d.eE+-]+)/.exec(svg);
  const hm = /\bheight\s*=\s*["']\s*([\d.eE+-]+)/.exec(svg);
  if (wm && hm) {
    const w = parseFloat(wm[1]);
    const h = parseFloat(hm[1]);
    if (Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0) return [w, h];
  }
  return null;
}

/**
 * Parse one emissive mark SVG and stroke every subpath into a flat ribbon
 * BufferGeometry (SVGLoader.pointsToStroke), using each path's own SVG stroke style
 * (width/join/cap). Returns the per-subpath geometries in document order; each has
 * position/normal/uv attributes and is non-indexed (so they merge cleanly). Returns
 * `[]` for empty/invalid SVG or when no DOMParser is available (non-DOM env).
 *
 * @param {string} svg
 * @returns {THREE.BufferGeometry[]}
 */
export function strokeGeometriesForSvg(svg) {
  if (typeof svg !== 'string' || svg.trim() === '' || typeof DOMParser === 'undefined') return [];
  const { paths } = new SVGLoader().parse(svg);
  const geoms = [];
  for (const path of paths) {
    const style = path.userData?.style || {};
    // Skip non-stroked paths entirely (a fill-only path has no groove to relieve).
    if (style.stroke === undefined || style.stroke === 'none') continue;
    const width = Math.max(MIN_STROKE_WIDTH, Number(style.strokeWidth) || 0);
    const strokeStyle = { ...style, strokeWidth: width };
    for (const subPath of path.subPaths) {
      const points = subPath.getPoints();
      if (!points || points.length < 2) continue;
      const g = SVGLoader.pointsToStroke(points, strokeStyle);
      if (g) geoms.push(g);
    }
  }
  return geoms;
}

/**
 * Build ONE merged emissive ribbon geometry for a per-process mark SVG.
 *
 * COORDINATE TRANSFORM (the make-or-break correctness step, advisor A item 1): SVG
 * is y-DOWN with a top-left origin spanning the viewBox [0..vbW]×[0..vbH]; the
 * scene's mark plane is a centered, y-UP `planeGeometry(width,height)` in mm (world
 * units). The mark SVGs are NOT mm-sized: svgExport.svgOpen declares mm width/height
 * but a px (96-PPI) viewBox, and the path coordinates are px — so the ribbon must be
 * SCALED from that px viewBox onto the mm frame (`width/vbW`, `height/vbH` — uniform
 * `1/PX_PER_MM`, so non-square canvases are fine), then `scale(…,-…,1)` flips Y and
 * `translate(-width/2, height/2, 0)` recenters. Without this scale the ribbon renders
 * at px magnitude (~3.8× too big) and off-center — the bug this fixes; the texture
 * path is immune because it maps a UV-[0,1] plane. The result overlays the
 * texture-mode marks (and its sheet) precisely, same center and handedness. When
 * width/height are omitted the geometry stays in raw SVG space (used by unit tests
 * asserting vertex/group counts).
 *
 * @param {string} svg
 * @param {{ width?:number, height?:number, useGroups?:boolean }} [opts]
 * @returns {THREE.BufferGeometry|null} merged geometry, or null when nothing strokes
 *   (degenerate SVG) — the caller MUST then fall back to the texture plane so marks
 *   never silently vanish.
 */
export function buildRibbonGeometry(svg, { width, height, useGroups = false } = {}) {
  const geoms = strokeGeometriesForSvg(svg);
  if (geoms.length === 0) return null;
  const merged = mergeGeometries(geoms, useGroups);
  // Free the transient per-subpath geometries (never uploaded to the GPU).
  for (const g of geoms) g.dispose();
  if (!merged) return null;
  if (Number.isFinite(width) && Number.isFinite(height)) {
    // Map the SVG's px viewBox space onto the mm plane frame. When the viewBox
    // already equals the target (or is absent), src is [width,height]/null →
    // sx=sy=1, i.e. the prior flip+recenter behavior, so raw-space callers and
    // viewBox==target tests are unaffected.
    const src = svgUserUnitSize(svg);
    const sx = src ? width / src[0] : 1;
    const sy = src ? height / src[1] : 1;
    merged.scale(sx, -sy, 1);
    merged.translate(-width / 2, height / 2, 0);
  }
  merged.computeBoundingBox();
  return merged;
}
