// Click-to-place geometry for imported / kit assets.
//
// A freshly imported SVG draws at its native path coordinates, which for the
// ITP-Camp kit assets sit at the top-left (~0,0) of the canvas — small and hard
// to grab. Placement mode lets the user drop the asset under the cursor instead:
// we measure the asset's drawn extent, then translate it so its content centre
// lands at the click point.
//
// Single source of truth: bbox is measured with the SAME `parsePathD` the canvas
// renderer (ImportedPath) uses, so the measured extent matches what is actually
// drawn AND the ghost preview (built from the same points) is pixel-consistent
// with the final placement. Curves degrade to their M/L/Z anchors identically in
// all three places.

import { parsePathD } from '../plotter/pathOps';
import { parseSVGImport } from '../svgImport';

/**
 * Union bbox of every path's drawn points, in canvas units.
 * @param {string[]} paths verbatim `d` strings
 * @returns {{ x:number, y:number, w:number, h:number } | null} null if no points
 */
export function pathsBBox(paths) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const d of paths || []) {
    const { points } = parsePathD(d);
    for (const [x, y] of points) {
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  if (!Number.isFinite(minX)) return null;
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

/**
 * The verbatim `d` strings of an import layer, pulled from `layer.params.pathData`
 * (tolerates a single string). Mirrors ImportedPath's own extractor so the
 * measured extent matches what the canvas draws and the SVG exports.
 * @param {object} layer
 * @returns {string[]}
 */
export function importLayerPaths(layer) {
  const pd = layer?.params?.pathData;
  if (Array.isArray(pd)) return pd.filter((d) => typeof d === 'string' && d.trim());
  if (typeof pd === 'string' && pd.trim()) return [pd];
  return [];
}

/**
 * Tight geometry bbox of an import layer, in canvas units, or null if it has no
 * parseable geometry. Single source of truth for the selection box, the canvas
 * render pivot, and the SVG export pivot — so chrome, hit-test, render and export
 * never drift.
 * @param {object} layer
 * @returns {{ x:number, y:number, w:number, h:number } | null}
 */
export function importLayerBBox(layer) {
  return pathsBBox(importLayerPaths(layer));
}

/**
 * Pivot (centre) an import layer's transform rotates/scales about: its geometry
 * bbox centre, so a resize/rotate grows/turns the object IN PLACE. Falls back to
 * the canvas centre when the layer has no measurable geometry (degrades to the
 * legacy whole-canvas behaviour rather than producing NaN).
 * @param {object} layer
 * @param {number} canvasW
 * @param {number} canvasH
 * @returns {{ x:number, y:number }}
 */
export function importLayerPivot(layer, canvasW, canvasH) {
  const bb = importLayerBBox(layer);
  if (!bb) return { x: canvasW / 2, y: canvasH / 2 };
  return { x: bb.x + bb.w / 2, y: bb.y + bb.h / 2 };
}

/**
 * The layer transform that places a bbox's centre at `point` (canvas units).
 * `transform.{x,y}` is an additive canvas-space translate (see svgExport), so the
 * offset is simply `target − current-centre`. Identity rotation/scale.
 * @param {{ x:number, y:number, w:number, h:number }} bbox
 * @param {{ x:number, y:number }} point
 */
export function centerTransform(bbox, point) {
  const cx = bbox.x + bbox.w / 2;
  const cy = bbox.y + bbox.h / 2;
  return { x: point.x - cx, y: point.y - cy, rotation: 0, scale: 1 };
}

/**
 * Build a to-scale ghost-preview SVG string for placement mode. Rendered from the
 * SAME `parsePathD` anchors as the canvas (curves degrade to polylines), inside a
 * `viewBox = bbox`, so the ghost is geometry-identical to where the asset will
 * actually land — one source of truth, no drift. Sized in canvas units (w×h); the
 * caller scales it with the artboard.
 * @param {string[]} paths
 * @param {{ x:number, y:number, w:number, h:number }} bbox
 * @param {string} [stroke]
 * @returns {string} an `<svg>…</svg>` markup string
 */
export function ghostSvg(paths, bbox, stroke = '#7c5cff') {
  // Stroke width in user (canvas) units, kept proportional so it reads at any
  // asset size; floored so tiny assets still show an outline.
  const sw = Math.max(bbox.w, bbox.h) / 120 || 1;
  const polylines = (paths || [])
    .map((d) => {
      const { points, closed } = parsePathD(d);
      if (points.length < 2) return '';
      const dd =
        points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x} ${y}`).join(' ') +
        (closed ? ' Z' : '');
      return `<path d="${dd}" fill="none" stroke="${stroke}" stroke-width="${sw}" stroke-linejoin="round" stroke-linecap="round"/>`;
    })
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${bbox.x} ${bbox.y} ${bbox.w} ${bbox.h}" width="${bbox.w}" height="${bbox.h}" preserveAspectRatio="none">${polylines}</svg>`;
}

/**
 * Parse an asset SVG into everything placement mode needs: the import-ready
 * paths (for the layer) and their bbox (for centring + the ghost preview).
 * @param {string} svg
 * @returns {{ ok:true, svg:string, paths:string[], bbox:object } | { ok:false, error:string }}
 */
export function parseForPlacement(svg) {
  const parsed = parseSVGImport(svg);
  if (!parsed.ok) return parsed;
  const bbox = pathsBBox(parsed.paths);
  if (!bbox) return { ok: false, error: 'No drawable geometry to place.' };
  return { ok: true, svg, paths: parsed.paths, bbox };
}
