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

// pointsToStroke needs ≥2 points. A floor (SVG user units = mm) so a hairline groove
// still strokes into a visible ribbon rather than a zero-area sliver.
const MIN_STROKE_WIDTH = 0.4;

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
 * is y-DOWN with a top-left origin spanning [0..width]×[0..height]; the scene's mark
 * plane is a centered, y-UP `planeGeometry(width,height)`. So the merged ribbon is
 * baked from SVG space into that exact frame — `scale(1,-1,1)` flips Y, then
 * `translate(-width/2, height/2, 0)` recenters — making a ribbon panel overlay the
 * texture-mode marks (and its sheet) precisely, same center and handedness. SVG user
 * units already equal mm == world units (buildAllLayersSVG is sized to the bounds),
 * so no scale is applied. When width/height are omitted the geometry stays in raw SVG
 * space (used by unit tests asserting vertex/group counts).
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
    merged.scale(1, -1, 1);
    merged.translate(-width / 2, height / 2, 0);
  }
  merged.computeBoundingBox();
  return merged;
}
