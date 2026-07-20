// MotifPattern — a Pattern subclass that stamps motif glyphs at placement
// points, DUAL-EMITTING to canvas AND SVG from a SINGLE per-instance matrix so
// the two render targets can never diverge (the "build-time-geometry-before-
// dual-emit" contract, docs/motif-adorn-arch-brief.md §1/§6).
//
// The pipeline per generate() (B1 — chain-consuming, MULTI-GLYPH):
//   anchors  = sampleEdgeAnchors(hostPaths, edgeOpts)           (anchors.js)
//   {survivors, sequence} = resolveSelection(binding, anchors)  (compileSelectionToChain.js)
//     — runs binding.chain if present, else compiles binding.selection; the
//       terminal Sequencer block rides out as `sequence` (null when unsequenced).
//   placements = resolvePlacements(survivors, {...placement, sequence?}) (placementEngine.js)
//     — a sequenced placement gains a per-slot `glyphRef` (present IFF sequenced)
//       plus folded modifiers (size/rotation/flip already baked into the placement).
//   for each placement:
//     glyph = the per-placement glyph — the injected `glyphs` MAP entry for the
//       slot's glyphRef, else the base glyph (unsequenced / back-compat).
//     m = placementMatrix(placement, glyph.viewRadius, glyph.root)  (instancing.js)
//       — the RESOLVED glyph's own viewRadius/root, so each slot scales correctly.
//     ── canvas ── pre-transform every glyph point with applyMatrix(pt, m) and
//        emit ABSOLUTE vertices (NO ctx.push/translate/rotate/scale — the whole
//        divergence trap is a second transform path; there is exactly one, `m`).
//     ── svg ──── push ONE <g transform="matrixToSVG(m)"> per instance wrapping
//        THAT glyph's VERBATIM <path d> (curves survive), using the SAME `m`.
//   The glyph varies per instance, but the single-matrix-feeds-both-emitters
//   discipline is unchanged: SVG and canvas for each slot are byte-identical.
//
// Because generate() fully resolves geometry into `this.svgElements`, export
// (svgExport.buildAllLayersSVG → toSVGGroup) NEVER re-runs placement. We
// override toSVGGroup, like ImportedPath, to bypass wrapSVGSymmetry and emit
// the stored instances verbatim.

import { Pattern } from '../patterns/drawingContext';
import { parsePathD } from '../plotter/pathOps';
import { sampleEdgeAnchors } from './anchors.js';
import { getSemanticAnchors } from './semanticAnchors.js';
import { resolveSelection } from './compileSelectionToChain.js';
import { resolvePlacements } from './placementEngine.js';
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
    // Placement-budget stats for the render seam's "no silent cap" warning
    // (2026-07-19, docs §6). Reset to null every generate; set from
    // resolvePlacements below whenever we actually place. An early return (no
    // resolvable glyph / no anchors) leaves it null → no warning.
    this.lastPlacementStats = null;

    const p = params || {};
    // Glyph resolution (WI-3 + B1 multi-glyph). Two injected sources, both from
    // the render seam (useCanvas), keeping this class decoupled from the store:
    //   • `p.glyph` — the BASE single glyph (resolved from p.glyphRef). Used for
    //     unsequenced placements and as the back-compat fallback.
    //   • `p.glyphs` — a MAP `{ [glyphRef]: glyph }` over every glyph a slot might
    //     stamp (base + each Sequencer slot's glyphRef, resolved over built-ins +
    //     customGlyphs). A per-placement glyphRef (present IFF sequenced) is looked
    //     up here; a ref absent from the map is a stripped/unresolvable glyph and
    //     that instance is skipped (below).
    const baseGlyph = p.glyph ?? getGlyph(p.glyphRef);
    const glyphMap = p.glyphs && typeof p.glyphs === 'object' ? p.glyphs : null;
    const hostPaths = Array.isArray(p.hostPaths) ? p.hostPaths : [];
    // Nothing resolvable at all ⇒ nothing to stamp. (Collapses to the old
    // single-glyph `if (!glyph) return` whenever no map is injected — every
    // existing caller/test.) hostPaths may be empty in SEMANTIC mode — a
    // Grid/Spiral host has no polyline geometry, so the guard cannot require it
    // here; the anchor step below yields [] for empty edge-mode input.
    if (!baseGlyph && !glyphMap) return;

    const anchorMode = p.anchorMode ?? 'edge';
    let anchors;
    if (anchorMode === 'semantic') {
      // Ask the host's structural extractor for role-tagged anchors
      // (crossing/edge/tip/cell). null ⇒ this host has no verifiable extractor
      // (deferred/unverifiable): degrade gracefully to generic edge anchors on
      // any provided hostPaths, else no-op.
      // Thread per-host inputs via the 5th opts arg. hostSeed is the grid host's
      // layer seed — it threads the LIVE-p5 jitter/symmetry lattice into the
      // grid extractor (makeP5Random(hostSeed)) so motifs sit on the grid's real
      // jittered / N-fold crossings. Voronoi PREFERS drawnEdges + sites (the
      // boundary-hardened seam) and falls back to legacy drawnCells. For hosts
      // that don't use a given field it's undefined → that extractor ignores it.
      // For a voronoi host WITHOUT any captured geometry, voronoiAnchors returns
      // null and we fall through to the edge fallback / no-op below.
      anchors = getSemanticAnchors(p.hostPatternType, p.hostParams, canvasW, canvasH, {
        hostSeed: p.hostSeed,
        drawnEdges: p.drawnEdges,
        sites: p.sites,
        drawnCells: p.drawnCells,
      });
      if (anchors == null) {
        anchors = hostPaths.length ? sampleEdgeAnchors(hostPaths, p.edgeOpts || {}) : [];
      }
    } else {
      anchors = sampleEdgeAnchors(hostPaths, p.edgeOpts || {});
    }

    const boundary = { type: 'rect', width: canvasW, height: canvasH };

    // Run the selection CHAIN (both binding shapes) → survivors + the terminal
    // Sequencer block. `overrides` seam: legacy bindings store overrides in
    // `binding.selection.overrides` and resolveSelection's compile path threads
    // them for us; where CHAIN-mode overrides live on the binding is a C1
    // decision, so B1 passes a TOP-LEVEL `binding.overrides` through if present
    // (undefined otherwise) and does NOT invent a schema. For legacy bindings
    // the compile path overwrites this with the compiled overrides anyway.
    const binding = p.binding || {};
    const { survivors, sequence } = resolveSelection(binding, anchors, {
      canvasW,
      canvasH,
      overrides: binding.overrides,
    });

    // Place the survivors WITH the sequence. Only SET `sequence` when the chain
    // actually produced a Sequencer block — a falsy `sequence` (every legacy
    // binding) must NOT clobber a legacy string-array `placement.sequence`
    // (that would silently rewrite seqId). resolvePlacements reads only
    // `boundary` from opts, so passing just `{boundary}` is byte-identical.
    const placementConfig = { ...(binding.placement || {}) };
    if (sequence) placementConfig.sequence = sequence;
    const { placements, placementStats } = resolvePlacements(survivors, placementConfig, { boundary });
    // Surface the budget stats so useCanvas can read `instance.lastPlacementStats`
    // after generate() and mirror truncation up to the Inspector (etchBitmaps
    // seam). placementStats is always present from resolvePlacements.
    this.lastPlacementStats = placementStats || null;

    // Canvas style — mirror ImportedPath: one resolved color, alpha from opacity.
    const alpha = Math.round((Math.max(0, Math.min(100, opacity ?? 100)) / 100) * 255);
    const c = ctx.color(color || '#000000');
    if (c && typeof c.setAlpha === 'function') c.setAlpha(alpha);

    for (const placement of placements) {
      // ── PER-PLACEMENT glyph resolution (B1 multi-glyph) ─────────────────────
      // `glyphRef` is present IFF this placement was sequenced (key off presence,
      // not truthiness). A sequenced slot with an explicit glyphRef resolves via
      // the injected map (authoritative when present); a ref that doesn't resolve
      // (stripped custom glyph) is SKIPPED — a real gap, matching the single-glyph
      // missing-glyph guard, never silently substituted. An unsequenced placement
      // (no glyphRef) OR a modifier-only slot (glyphRef null/undefined) uses the
      // base glyph. With NO map injected (non-injecting callers) a sequenced slot
      // defensively falls back to the base / built-in lookup so it still stamps.
      let glyph;
      if ('glyphRef' in placement && placement.glyphRef != null) {
        glyph = glyphMap ? glyphMap[placement.glyphRef] : (baseGlyph ?? getGlyph(placement.glyphRef));
      } else {
        glyph = baseGlyph;
      }
      if (!glyph) continue;

      // Optional motif ROOT (glyph-local): the point that coincides with the
      // anchor + growth-direction angle. Built-in glyphs carry none ⇒ default
      // no-op ⇒ byte-identical output to the pre-root pipeline (WI-2). Read off
      // the RESOLVED glyph so each slot uses its own root/viewRadius.
      const root = glyph.root || { x: 0, y: 0, angle: 0 };

      // THE single matrix. Feeds BOTH emitters below — no second transform path.
      const m = placementMatrix(placement, glyph.viewRadius, root);

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
