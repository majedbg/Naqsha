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
import { resolveHostAnchors } from './hostAnchors.js';
import { coerceRoles } from './edgeRoles.js';
import { resolveSelection } from './compileSelectionToChain.js';
import { resolvePlacements } from './placementEngine.js';
import { getGlyph } from './glyphs.js';
import { placementMatrix, applyMatrix, matrixToSVG } from './instancing.js';

// EDGE-MODE ROLE COERCION now lives in edgeRoles.js — AnchorGhostOverlay runs
// the identical coercion when it previews an edge host's placements (#141), and
// a drifting second copy would make the ghost dots disagree with the drawn
// glyphs on any binding still carrying stale semantic roles.

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
    // Ordered, POST-CAP placement positions for the Trace sweep (issue #91).
    // Reset every generate; filled from the SAME `placements` the draw loop below
    // stamps, so the overlay's marks land on exactly what's drawn. An early return
    // leaves it null → the Trace overlay simply has nothing to light for this layer.
    this.lastPlacementPositions = null;

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
      // Ask the SHARED host-anchor resolver (#149) for role-tagged anchors
      // (crossing/edge/tip/cell). null ⇒ this host has no verifiable extractor
      // (deferred/unverifiable) or has not been probed yet: degrade gracefully to
      // generic edge anchors on any provided hostPaths, else no-op.
      //
      // ONE MODULE, BOTH CALL SITES. hostAnchors.resolveHostAnchors is the same
      // function the canvas overlay calls to draw its editable per-glyph dots, so
      // the dots and the glyphs can never disagree about what a host's anchors
      // are. It forwards the stash keys generically (STASH_GEOMETRY_KEYS), which
      // is why `geometry` here is `p` itself: the render ROUTER (resolveMotifHost)
      // has already flattened those very keys onto the render params, so a new
      // stash host adds a key to that one list and needs no change here.
      //
      // `mode:'semantic'` — this branch is chosen by the ROUTER-resolved
      // `anchorMode`, which is authoritative for the render, so the resolver must
      // not re-derive it from isEdgeHost.
      anchors = resolveHostAnchors({
        patternType: p.hostPatternType,
        params: p.hostParams,
        canvasW,
        canvasH,
        geometry: p,
        // The grid host's layer seed — threads the LIVE-p5 jitter/symmetry
        // lattice into the grid extractor so motifs sit on the grid's real
        // jittered / N-fold crossings. Every other extractor ignores it.
        hostSeed: p.hostSeed,
        mode: 'semantic',
      });
      if (anchors == null) {
        anchors = hostPaths.length ? sampleEdgeAnchors(hostPaths, p.edgeOpts || {}) : [];
      }
    } else {
      anchors = sampleEdgeAnchors(hostPaths, p.edgeOpts || {});
    }

    const boundary = { type: 'rect', width: canvasW, height: canvasH };

    // Run the selection CHAIN (both binding shapes) → survivors + the terminal
    // Sequencer block. `overrides` seam — SETTLED (#136): chain-form bindings
    // store overrides TOP-LEVEL at `binding.overrides`; legacy bindings at
    // `binding.selection.overrides` (threaded by resolveSelection's compile
    // path, which overwrites the top-level pass-through for legacy anyway).
    // Overrides are never a chain Block (ADR-0004) — they ride the fixed
    // post-chain step, so we pass `binding.overrides` through if present
    // (undefined otherwise).
    // ROLE AVAILABILITY, DERIVED AT RENDER (#154). Intersect this binding's Route
    // roles with what the host actually emits: in edge mode that un-bakes a stale
    // non-edge role (a single-axis grid whose binding still says ['crossing']) as
    // it always did; on a semantic host it drops roles the host cannot serve and
    // falls back to the host's default role when nothing survives, so a Route
    // asking only for a dead role renders instead of rendering blank. Nothing is
    // written — see edgeRoles.js for why the branch ORDER is load-bearing.
    // AnchorGhostOverlay calls the identical function so the editable dots and
    // the drawn glyphs can never disagree.
    const binding = coerceRoles(p.binding || {}, {
      type: p.hostPatternType,
      params: p.hostParams,
      anchorMode,
    });
    // `overrideRecords` is the resolved ref→anchor map for the POST-PLACEMENT
    // per-glyph scale/angle step (#137). It MUST come out of resolveSelection:
    // a LEGACY binding's overrides live at `binding.selection.overrides` and only
    // the compile path knows that, so resolving here off `binding.overrides`
    // would silently miss them.
    const { survivors, sequence, overrideRecords } = resolveSelection(binding, anchors, {
      canvasW,
      canvasH,
      overrides: binding.overrides,
    });

    // Place the survivors WITH the sequence. Only SET `sequence` when the chain
    // actually produced a Sequencer block — a falsy `sequence` (every legacy
    // binding) must NOT clobber a legacy string-array `placement.sequence`
    // (that would silently rewrite seqId). resolvePlacements reads `boundary`
    // and `overrideRecords` from opts — the latter is applied AFTER packing, so
    // an overridden glyph may overlap its neighbours (settled, #134/#137), and
    // it is a no-op for documents with no per-glyph scale/angle.
    const placementConfig = { ...(binding.placement || {}) };
    if (sequence) placementConfig.sequence = sequence;
    //
    // THE GLYPHS RIDE IN TOO (#207). Under `sizing.footprint: 'tight'` the engine
    // reserves the glyph's MEASURED footprint rather than a disc of `viewRadius`
    // about its root, so it needs the same two sources the draw loop below reads
    // — the base glyph and the per-slot map — and THROWS without them (ruling
    // 7d). Deliberately NOT wrapped in a try/catch, unlike the hover overlay: a
    // layer must never be silently packed by the law the user opted out of on a
    // machine that cuts material, and a render that swallowed the throw would be
    // exactly that. `glyphMap` is null when nothing was injected, which the
    // engine reads as "no map" and falls back to the base glyph — the same rule
    // the per-placement resolution below applies.
    const { placements, placementStats } = resolvePlacements(survivors, placementConfig, {
      boundary,
      overrideRecords,
      glyph: baseGlyph,
      glyphMap,
    });
    // Surface the budget stats so useCanvas can read `instance.lastPlacementStats`
    // after generate() and mirror truncation up to the Inspector (etchBitmaps
    // seam). placementStats is always present from resolvePlacements.
    this.lastPlacementStats = placementStats || null;
    // Ordered placement positions for the Trace sweep (issue #91). `placements` is
    // already the accepted, post-cap, placement-order list, so mapping x/y/radius
    // here yields exactly what the draw loop stamps — the overlay lights a prefix
    // of it in sync with the sweep. Only x/y/radius are surfaced (a ring per
    // instance needs no rotation/glyph); memory is bounded by MAX_PLACEMENTS.
    this.lastPlacementPositions = placements.map((pl) => ({
      x: pl.x,
      y: pl.y,
      radius: pl.radius,
    }));

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
