// MotifPattern — a Pattern subclass that stamps motif glyphs at placement
// points, DUAL-EMITTING to canvas AND SVG from a SINGLE per-instance matrix so
// the two render targets can never diverge (the "build-time-geometry-before-
// dual-emit" contract, docs/motif-adorn-arch-brief.md §1/§6).
//
// The pipeline per generate():
//   anchors  = sampleEdgeAnchors(hostPaths, edgeOpts)           (anchors.js)
//   placements = placeMotifs(anchors, binding, {boundary,...})  (placementEngine.js)
//   for each placement:
//     m = placementMatrix(placement, glyph.viewRadius)          (instancing.js)
//     ── canvas ── pre-transform every glyph point with applyMatrix(pt, m) and
//        emit ABSOLUTE vertices (NO ctx.push/translate/rotate/scale — the whole
//        divergence trap is a second transform path; there is exactly one, `m`).
//     ── svg ──── push ONE <g transform="matrixToSVG(m)"> per instance wrapping
//        the glyph's VERBATIM <path d> (curves survive), using the SAME `m`.
//
// Because generate() fully resolves geometry into `this.svgElements`, export
// (svgExport.buildAllLayersSVG → toSVGGroup) NEVER re-runs placement. We
// override toSVGGroup, like ImportedPath, to bypass wrapSVGSymmetry and emit
// the stored instances verbatim.

import { Pattern } from '../patterns/drawingContext';
import { parsePathD } from '../plotter/pathOps';
import { sampleEdgeAnchors } from './anchors.js';
import { getSemanticAnchors } from './semanticAnchors.js';
import { placeMotifs } from './placementEngine.js';
import { getGlyph } from './glyphs.js';
import { placementMatrix, applyMatrix, matrixToSVG } from './instancing.js';

export default class MotifPattern extends Pattern {
  /**
   * Resolve motif placements and dual-emit them to the p5 canvas (via ctx) and
   * to this.svgElements (build-time-resolved SVG), both driven by one matrix
   * per instance.
   */
  generate(ctx, seed, params, canvasW, canvasH, color, opacity) {
    this.svgElements = [];

    const p = params || {};
    const glyph = getGlyph(p.glyphRef);
    const hostPaths = Array.isArray(p.hostPaths) ? p.hostPaths : [];
    // No glyph ⇒ nothing to stamp. (hostPaths may be empty in SEMANTIC mode —
    // a Grid/Spiral host has no polyline geometry, so the guard cannot require
    // it here; the anchor step below yields [] for empty edge-mode input, which
    // no-ops naturally.)
    if (!glyph) return;

    const anchorMode = p.anchorMode ?? 'edge';
    let anchors;
    if (anchorMode === 'semantic') {
      // Ask the host's structural extractor for role-tagged anchors
      // (crossing/edge/tip/cell). null ⇒ this host has no verifiable extractor
      // (deferred/unverifiable): degrade gracefully to generic edge anchors on
      // any provided hostPaths, else no-op.
      anchors = getSemanticAnchors(p.hostPatternType, p.hostParams, canvasW, canvasH);
      if (anchors == null) {
        anchors = hostPaths.length ? sampleEdgeAnchors(hostPaths, p.edgeOpts || {}) : [];
      }
    } else {
      anchors = sampleEdgeAnchors(hostPaths, p.edgeOpts || {});
    }

    const boundary = { type: 'rect', width: canvasW, height: canvasH };
    const { placements } = placeMotifs(anchors, p.binding || {}, {
      boundary,
      canvasW,
      canvasH,
    });

    // Canvas style — mirror ImportedPath: one resolved color, alpha from opacity.
    const alpha = Math.round((Math.max(0, Math.min(100, opacity ?? 100)) / 100) * 255);
    const c = ctx.color(color || '#000000');
    if (c && typeof c.setAlpha === 'function') c.setAlpha(alpha);

    for (const placement of placements) {
      // THE single matrix. Feeds BOTH emitters below — no second transform path.
      const m = placementMatrix(placement, glyph.viewRadius);

      // ── canvas: pre-transformed absolute vertices ──────────────────────────
      for (const gp of glyph.paths) {
        const { points, closed } = parsePathD(gp.d);
        if (points.length < 2) continue;
        ctx.noFill();
        ctx.stroke(c);
        ctx.beginShape();
        for (const [px, py] of points) {
          const t = applyMatrix({ x: px, y: py }, m);
          ctx.vertex(t.x, t.y);
        }
        ctx.endShape(closed || gp.closed ? ctx.CLOSE : undefined);
      }

      // ── svg: ONE <g transform> per instance wrapping the VERBATIM glyph paths,
      //    using the SAME `m`. Fully resolved — export re-runs nothing. ────────
      const inner = glyph.paths
        .map((gp) => `<path d="${gp.d}" fill="none"/>`)
        .join('');
      this.svgElements.push(`<g transform="${matrixToSVG(m)}">${inner}</g>`);
    }
  }

  /**
   * Export: emit the build-time-resolved instances verbatim. Overrides the base
   * so we bypass wrapSVGSymmetry (motifs are already placed absolutely, like
   * ImportedPath). Color is applied as the group stroke; the inner <path>s keep
   * fill="none" and inherit the stroke.
   */
  toSVGGroup(layerId, color, opacity) {
    const els = this.svgElements ?? [];
    const opacityFrac = Math.max(0, Math.min(100, opacity ?? 100)) / 100;
    const inner = els.map((el) => `    ${el}`).join('\n');
    return `<g id="${layerId}" opacity="${opacityFrac}" fill="none" stroke="${color}" stroke-width="1">\n${inner}\n  </g>`;
  }
}
