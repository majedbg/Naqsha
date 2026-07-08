// fabricationPipeline — ONE canonical render→plot model.
//
// Layer→plottable-path extraction used to be reimplemented THREE times across
// the prepare UI, each in a DIFFERENT coordinate / optimization space:
//   - OptimizeSection   (usePreviewStats):  splitGroup → PRE-transform, copies colocated
//   - OverlapWarnings   (useOverlapSummary): extractRenderedPaths → POST-transform, NO opt
//   - PlotPreviewSection(buildRoute):        optimizeGroup→extract → POST-transform but
//                                            symmetry COLLAPSES whenever opts are on
//                                            (optimizeGroup drops the per-copy <g rotate>
//                                             wrappers — see fabricationDivergence.test.js).
//
// This module makes all three derive from a SINGLE extraction in ONE canonical
// space: post-transform → post-symmetry → post-optimize. Because that space is
// the same for every caller, the optimize stats, overlap counts and plot-preview
// timing AGREE BY CONSTRUCTION — the only thing a caller varies is which
// optimizations it asks for.
//
// Canonical pipeline per visible layer:
//   1. extractRenderedPaths(rawGroup)  — real transformed + symmetry-expanded
//                                         polylines (NOT the collapse-prone
//                                         optimizeGroup path).
//   2. apply simplify → merge → reorder on those point arrays, in the SAME order
//      optimizeGroup uses, reusing the coordinate-agnostic pathOps functions.
//   3. pathStats + estimateTimeSec for the per-layer stats block.

import { extractRenderedPaths } from './pipeline.js';
import {
  simplifyPaths, mergeLines, reorderPaths,
  pathStats, estimateTimeSec,
} from './pathOps.js';
import { roleColor } from '../fabrication.js';
import { clipToSheet } from './clipToSheet.js';

const EMPTY_STATS = Object.freeze({ paths: 0, points: 0, drawMm: 0, travelMm: 0, seconds: 0 });

function statsFor(paths) {
  const s = pathStats(paths);
  return { ...s, seconds: estimateTimeSec(s) };
}

// Apply the optimization stack to already-extracted polylines, in the canonical
// post-transform space. Mirrors pipeline.optimizeGroup's order and guards, but
// operates on point arrays so symmetry copies are NEVER collapsed.
export function applyOptimizationsToPaths(paths, optimizations) {
  if (!optimizations) return paths;
  let out = paths;
  if (optimizations.simplify?.enabled && optimizations.simplify.tolerance > 0) {
    out = simplifyPaths(out, optimizations.simplify.tolerance);
  }
  if (optimizations.merge?.enabled && optimizations.merge.tolerance > 0) {
    out = mergeLines(out, optimizations.merge.tolerance);
  }
  if (optimizations.reorder?.enabled) {
    out = reorderPaths(out);
  }
  return out;
}

// Build the canonical plottable model for a design.
//
//   buildPlottableLayers(layers, instances, { optimizations, includeHidden, clip })
//     → [{ layerId, color, role, roleColor, paths, stats:{…}, crop? }]
//
// One entry per layer that has a renderable instance, in the SAME bottom-up
// order the SVG export uses ([...layers].reverse()), so a flat concat of the
// per-layer `paths` is the true plot order. `paths` are post-transform →
// post-symmetry → (post-clip) → post-optimize polylines: { points, closed, color }.
//
// THE OPT-IN CLIP STAGE (ADR-0002 boundary rule — the plan edits how the machine
// executes, never what the design is). The Run Plan clips each Operation's
// geometry to the Sheet BEFORE the Optimizations run, in the ordered pipeline
// extract → CLIP → optimize, because a stroke that spills past the physical
// material cannot be fabricated and the maker must see the trimmed result the
// machine will run. Clipping is DELIBERATELY OPT-IN and fully gated behind
// `if (clip)`: when the caller omits it, this function executes the EXACT same
// statements it always has and returns byte-identical entries (same keys, no
// `crop`). This matters because the existing callers — PlotOverlay and the
// prepare hooks — must keep seeing the canonical, un-clipped geometry (the
// fabricationDivergence suite guards that they all still agree); only the Run
// Plan asks for the Sheet-clipped view.
//
//   options.clip = { sheetRect: { x, y, width, height } }  // px, same space as points
//
// When clip is present, each entry additionally carries:
//   crop = {
//     croppedPathCount,  // originals TRIMMED at an edge (the Receipt's number)
//     dropped,           // originals culled whole (fully outside / degenerate)
//     ghost,             // ORIGINAL (pre-clip) geometry of everything not
//                        //   fabricated as-drawn (dropped + cropped originals),
//                        //   for the canvas to ghost at the Sheet edge.
//   }
// `ghost` is the whole pre-clip original of each affected path, NOT the precise
// trimmed-away sub-segment — clipToSheet returns only the surviving interior
// fragments, so the exact off-Sheet sliver is not recoverable without
// re-implementing the clip. Ghosting the full original outline is the honest,
// legible thing for the canvas and is the documented deviation from a literal
// "trimmed segments" surface.
//
// Throws if DOMParser is unavailable: extractRenderedPaths silently falls back
// to a PRE-transform extraction without it, which is exactly the divergence this
// module exists to kill. We fail loudly rather than serve the wrong coordinate
// space. (Run the callers/tests in a DOM environment — jsdom in tests.)
export function buildPlottableLayers(layers, instances, options = {}) {
  if (typeof DOMParser === 'undefined') {
    throw new Error(
      'buildPlottableLayers requires DOMParser (post-transform extraction). ' +
      'Run in a DOM environment; tests must use `// @vitest-environment jsdom`.'
    );
  }
  const { optimizations = null, includeHidden = false, clip = null } = options;
  if (!layers || !instances) return [];

  // Bottom-up, matching exportAllLayersSVG order.
  const ordered = [...layers].reverse();
  const result = [];
  for (const layer of ordered) {
    if (!includeHidden && !layer.visible) continue;
    const instance = instances[layer.id];
    if (!instance || typeof instance.toSVGGroup !== 'function') continue;
    let rawGroup;
    try {
      rawGroup = instance.toSVGGroup(layer.id, layer.color, layer.opacity);
    } catch {
      continue;
    }
    // 1: canonical extraction.
    const extracted = extractRenderedPaths(rawGroup);

    // 1b: OPT-IN clip to the Sheet, BEFORE optimize. Everything in this block is
    // gated so the un-clipped path below is statement-for-statement unchanged.
    let toOptimize = extracted;
    let crop = null;
    if (clip && clip.sheetRect) {
      const { kept, dropped, croppedPathCount } = clipToSheet(extracted, clip.sheetRect);
      // A fully-inside original passes through `kept` BY REFERENCE (clipToSheet
      // contract); a cropped original is replaced by NEW fragment objects; a
      // dropped original is absent from `kept`. So the extracted paths NOT present
      // by reference in `kept` are exactly the ones not fabricated as-drawn — the
      // dropped originals plus the cropped originals — which is the ghost set.
      const keptRefs = new Set(kept);
      const ghost = extracted.filter((p) => !keptRefs.has(p));
      toOptimize = kept;
      crop = { croppedPathCount, dropped, ghost };
    }

    // 2: optimizations on the real (clipped, if opted-in) polylines.
    const optimized = applyOptimizationsToPaths(toOptimize, optimizations);
    // 3: per-layer stats.
    const entry = {
      layerId: layer.id,
      color: layer.color,
      role: layer.role ?? null,
      roleColor: roleColor(layer.role),
      paths: optimized,
      stats: optimized.length ? statsFor(optimized) : { ...EMPTY_STATS },
    };
    if (crop) entry.crop = crop;
    result.push(entry);
  }
  return result;
}

// Sum the per-layer stats into one design-level block. NOTE: travel here is the
// sum of WITHIN-layer pen-up travel only — it does not add the inter-layer hop
// from one layer's last point to the next layer's first point. This is the
// canonical basis all three prepare sites now share (the per-layer hooks always
// reset travel per layer); the legacy PlotPreviewSection.buildRoute carried a
// cursor across layers, so its headline travel was very slightly higher. The
// difference is one pen-up per layer boundary — negligible and now consistent.
export function aggregateStats(plottableLayers) {
  return plottableLayers.reduce((acc, l) => ({
    paths:    acc.paths    + l.stats.paths,
    points:   acc.points   + l.stats.points,
    drawMm:   acc.drawMm   + l.stats.drawMm,
    travelMm: acc.travelMm + l.stats.travelMm,
    seconds:  acc.seconds  + l.stats.seconds,
  }), { ...EMPTY_STATS });
}

// Build the flat draw/travel route the plot-preview animates, from the canonical
// per-layer paths. Mirrors the old buildRoute: a pen-up "travel" to each path's
// first point, then "draw" segments. The cursor carries across layers so the
// animated route is continuous (this does NOT affect the per-layer `stats`,
// which are the consistent basis; it only feeds the scrubber geometry).
export function buildRouteFromLayers(plottableLayers) {
  const route = [];
  let cursor = [0, 0];
  for (const layer of plottableLayers) {
    for (const p of layer.paths) {
      if (!p.points || p.points.length < 2) continue;
      route.push({ type: 'travel', from: cursor, to: p.points[0], color: layer.color });
      for (let i = 1; i < p.points.length; i++) {
        route.push({ type: 'draw', from: p.points[i - 1], to: p.points[i], color: layer.color });
      }
      cursor = p.points[p.points.length - 1];
    }
  }
  return route;
}
