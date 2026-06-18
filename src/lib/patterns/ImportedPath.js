// ImportedPath — a synthetic "pattern" instance that places imported SVG path
// data as artwork (issue #12, C4). It is NOT a generative pattern: it wraps the
// verbatim `d` strings parsed by lib/svgImport and satisfies the SAME instance
// interface real patterns expose, so the existing export and canvas code paths
// work unchanged (option A — least invasive):
//
//   - toSVGGroup(layerId, color, opacity) → an SVG <g> with one <path d="…"> per
//     imported outline. The `d` is emitted verbatim so curves survive export.
//     Color is the per-export resolved color (the operation color for laser, the
//     layer color for plotter) — passed in by buildAllLayersSVG exactly as for
//     real layers, so the operation color flows through the existing seam.
//   - generate(ctx, …) → draws a polyline approximation on the p5 canvas. Canvas
//     fidelity is best-effort (curves degrade to line segments); export keeps the
//     original `d`. Boundary/mask clipping is deferred — this is artwork.
//
// `pathData` lives in `layer.params` so the instance is fully reconstructable
// from layer data: useCanvas rebuilds instances every render, and the path data
// round-trips through localStorage for free.

import { Pattern } from './drawingContext';
import { parsePathD } from '../plotter/pathOps';

// Pull the array of `d` strings out of params. Tolerates a single string too.
function pathsFromParams(params) {
  const pd = params?.pathData;
  if (Array.isArray(pd)) return pd.filter((d) => typeof d === 'string' && d.trim());
  if (typeof pd === 'string' && pd.trim()) return [pd];
  return [];
}

export default class ImportedPath extends Pattern {
  /**
   * Canvas render: draw each imported path as a polyline approximation. Uses the
   * shared plotter tokenizer (M/L/Z) for the point list — curves degrade to
   * straight segments on canvas only; export (toSVGGroup) keeps the original d.
   */
  generate(ctx, seed, params, canvasW, canvasH, color, opacity) {
    this._paths = pathsFromParams(params);
    const alpha = Math.round((Math.max(0, Math.min(100, opacity ?? 100)) / 100) * 255);
    const c = ctx.color(color || '#000000');
    if (c && typeof c.setAlpha === 'function') c.setAlpha(alpha);

    for (const d of this._paths) {
      const { points, closed } = parsePathD(d);
      if (points.length < 2) continue;
      ctx.noFill();
      ctx.stroke(c);
      ctx.beginShape();
      for (const [x, y] of points) ctx.vertex(x, y);
      ctx.endShape(closed ? ctx.CLOSE : undefined);
    }
  }

  /**
   * Export: one <path> per imported outline, d emitted verbatim. Bypasses the
   * base symmetry wrapping (imported artwork is placed as-is) for full control.
   */
  toSVGGroup(layerId, color, opacity) {
    const paths = this._paths ?? pathsFromParams(this._lastParams);
    const opacityFrac = Math.max(0, Math.min(100, opacity ?? 100)) / 100;
    const inner = paths
      .map((d) => `    <path d="${d}" fill="none" stroke="${color}" stroke-width="1"/>`)
      .join('\n');
    return `<g id="${layerId}" opacity="${opacityFrac}">\n${inner}\n  </g>`;
  }
}
