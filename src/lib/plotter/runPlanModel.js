// runPlanModel — the ONE derived object every Run Plan consumer reads.
//
// WHY THIS EXISTS
// The Run Plan promises the maker a single truth: the panel's headline
// ("Estimated · N min"), the per-Operation breakdown, the on-canvas warnings and
// ghosted crops, the animated run-through, AND the Export Receipt that
// accompanies a quick export must all describe the SAME run. If each surface
// re-derived that run its own way we would reproduce exactly the three-way
// divergence fabricationPipeline was built to kill (see fabricationDivergence.
// test.js) — one panel saying 4 minutes, a receipt saying 5, warnings computed
// on pre-optimize geometry the machine will never run. So this module composes
// the whole run ONCE and every consumer projects from it. They "agree by
// construction" because there is only one object to read.
//
// THE PIPELINE (ADR-0002 order): extraction → clip-to-Sheet (honoring the
// cropToSheet Export preference) → applied Optimizations → group layers by
// Operation → overlapCheck on the POST-applied geometry (what the machine
// actually runs, retiring the legacy pre-optimize overlap basis) → profile-aware
// runEstimate → warning taxonomy → route + ghosted-crop geometry.
//
// BOUNDARY (ADR-0002): this model conditions how the machine executes; it never
// mutates the design. Clip and Optimizations are applied to EXTRACTED polylines,
// never written back to layers. No auto-fix in v1 — warnings only `locate` what
// the canvas should highlight; the maker fixes with tools they already know.
//
// INPUT — runPlanModel({ … }):
//   layers               array of layer objects { id, visible, color, opacity,
//                        operationId, role? } — same shape buildPlottableLayers
//                        consumes. Only VISIBLE layers enter the run.
//   instances            { [layerId]: patternInstance } with toSVGGroup(), as the
//                        prepare hooks already pass.
//   operations           the document's ORDERED Operation library; op.order is
//                        machine execution order. A layer references one by
//                        layer.operationId.
//   appliedOptimizations the APPLIED optimize stack ({ simplify, merge, reorder })
//                        — applied values only, never preview (ADR-0002). Null/absent
//                        = none.
//   profileId            'laser' | 'plotter' | 'dragCutter' — drives runEstimate.
//   sheetRect            { x, y, width, height } in px (same space as path points).
//                        Optional; without it there is nothing to clip against and
//                        no sheet-exceeds-bed check.
//   bedSize              { width, height, unit:'mm' } — the machine bed. Optional;
//                        falls back to defaultBedSize(profileId).
//   cropToSheet          boolean (default true) — the Export preference. Clipping
//                        runs only when cropToSheet AND a sheetRect are present.
//
// OUTPUT — { opRows, estimate, warnings, route, crops }:
//   opRows    one row PER Operation that has resolved layers, in machine execution
//             order: { opId, name, process, color, layerCount, drawMm, travelMm,
//             passes, sec }. (PRD story 21.) NOTE: opRows.sec sums to
//             estimate.totalSec MINUS the Pen-Swap allowance — swap seconds are a
//             run-level cost, not an Operation's, so they live in the estimate
//             (penSwaps/totalSec), not in any row. With no swaps (every non-plotter
//             profile) the sum is exact; Wave 3's headline-vs-breakdown must know
//             the headline uses estimate.totalSec.
//   estimate  the runEstimate result { totalSec, perOp, penSwaps } — the SINGLE
//             number the panel headline and the receipt minutes both derive from.
//   warnings  array of { type, ...payload, locate }. Taxonomy (PRD story 25):
//             'sheet-exceeds-bed', 'cropped-paths', 'overlaps', 'unresolved-layer'.
//             `locate` carries what the canvas highlights (layerIds / paths /
//             samples / sheetRect). No auto-fix (v1).
//   route     buildRouteFromLayers over the post-applied, post-clip geometry in
//             machine EXECUTION order (not stacking order) — the animated
//             run-through. Tinted by Operation color (the machine view).
//   crops     flat array of ghosted cropped-away geometry across all layers,
//             each { points, closed, color, layerId }, for the canvas to fade at
//             the Sheet edge. Empty when clipping did not run.
//
// SCOPE NOTE (deliberate v1 approximation, inherited from runEstimate/
// aggregateStats): draw/travel are measured PER Operation group, so the pen-up
// reposition BETWEEN operations is not counted. This keeps the agreement
// invariant clean (Σ opRows.sec + swaps === totalSec) and matches the shared
// stats basis; it under-counts inter-op travel. Flagged for a future cross-group
// travel term. See the Wave-2 report's human-eyes items.

import { buildPlottableLayers, buildRouteFromLayers } from './fabricationPipeline.js';
import { runEstimate } from './runEstimate.js';
import { countOverlaps } from './overlapCheck.js';
import { resolveOperation, operationIdForRole } from '../operations.js';
import { defaultBedSize } from '../machineProfiles.js';
import { pxToMm } from './pathOps.js';

// Float slack when comparing a Sheet dimension against the bed (both in mm). A
// Sheet exactly the bed size is fabricable; only a genuine excess warns.
const BED_EPS_MM = 1e-6;

export function runPlanModel(input = {}) {
  const {
    layers = [],
    instances = {},
    operations = [],
    appliedOptimizations = null,
    profileId,
    sheetRect = null,
    bedSize = null,
    cropToSheet = true,
  } = input;

  const bed = bedSize || defaultBedSize(profileId);
  // Clip only when the Export preference asks for it AND we have a Sheet to clip
  // against — this is how cropToSheet=false flows straight through un-clipped.
  const doClip = !!(cropToSheet && sheetRect);
  const clip = doClip ? { sheetRect } : null;

  // Build the canonical run ONCE: extract → (clip) → applied Optimizations. Every
  // downstream projection reads from THIS single result — the agreement contract.
  const plottable = buildPlottableLayers(layers, instances, {
    optimizations: appliedOptimizations,
    clip,
  });

  // Resolve each visible layer to its Operation. An unassigned/unresolvable layer
  // FIRST falls back to the document-default Operation (operationIdForRole('cut'))
  // — an unassigned layer is not an error while a default exists (PRD story 24).
  // Only when THAT is also unresolvable (e.g. an empty library) does the layer
  // become an unresolved-layer warning.
  const layersById = new Map(layers.map((l) => [l.id, l]));
  const defaultOpId = operationIdForRole('cut');

  // Group resolved plottable layers by Operation id. `plottable` is bottom-up, so
  // members within a group keep that order; groups are re-sorted to execution
  // order below (stacking order ≠ machine order).
  const groups = new Map(); // opId → { operation, layers: [plottableEntry…] }
  const unresolved = [];    // plottable entries with no resolvable Operation

  for (const entry of plottable) {
    const layer = layersById.get(entry.layerId);
    let operation = resolveOperation(operations, layer?.operationId);
    if (!operation) operation = resolveOperation(operations, defaultOpId);
    if (!operation) { unresolved.push(entry); continue; }

    let group = groups.get(operation.id);
    if (!group) { group = { operation, layers: [] }; groups.set(operation.id, group); }
    group.layers.push(entry);
  }

  // Machine EXECUTION order = op.order ascending. This ordering feeds opRows, the
  // estimate's opGroups, and the animated route alike, so the whole model agrees
  // on run order.
  const orderedGroups = [...groups.values()].sort(
    (a, b) => (a.operation.order ?? 0) - (b.operation.order ?? 0)
  );

  // Assemble the estimate's opGroups in execution order: each group's paths are
  // the concat of its member layers' post-applied polylines.
  const opGroups = orderedGroups.map((g) => ({
    opId: g.operation.id,
    operation: g.operation,
    paths: g.layers.flatMap((l) => l.paths),
  }));

  const estimate = runEstimate(opGroups, profileId);

  // opRows — one per Operation, parallel to estimate.perOp (same order, same
  // groups). drawMm/travelMm/passes/sec come from the estimate so a row and the
  // headline can never disagree.
  const opRows = orderedGroups.map((g, i) => {
    const per = estimate.perOp[i] || {};
    return {
      opId: g.operation.id,
      name: g.operation.name,
      process: g.operation.process,
      color: g.operation.color,
      layerCount: g.layers.length,
      drawMm: per.drawMm ?? 0,
      travelMm: per.travelMm ?? 0,
      passes: per.passes ?? 1,
      sec: per.sec ?? 0,
    };
  });

  // route — the animated run-through, over the SAME execution-ordered geometry,
  // tinted by Operation color (the machine view re-tints paths by operation). One
  // synthetic entry per member layer preserves per-path order within a group.
  const routeLayers = orderedGroups.flatMap((g) =>
    g.layers.map((l) => ({ color: g.operation.color, paths: l.paths }))
  );
  const route = buildRouteFromLayers(routeLayers);

  // crops — the ghosted cropped-away geometry, flattened across layers and tagged
  // with layerId so the canvas can fade each at the Sheet edge. Empty unless the
  // clip stage ran.
  const crops = plottable.flatMap((l) =>
    (l.crop?.ghost ?? []).map((g) => ({ ...g, layerId: l.layerId }))
  );
  const croppedPathCount = plottable.reduce(
    (n, l) => n + (l.crop?.croppedPathCount ?? 0), 0
  );

  // ── warning taxonomy (PRD story 25) — locate only, no auto-fix (v1) ─────────
  const warnings = [];

  // 'sheet-exceeds-bed' — the Sheet is larger than the machine's reachable bed;
  // compared in mm (Sheet is px, bed is mm).
  if (sheetRect) {
    const sheetWidthMm = pxToMm(sheetRect.width);
    const sheetHeightMm = pxToMm(sheetRect.height);
    if (sheetWidthMm > bed.width + BED_EPS_MM || sheetHeightMm > bed.height + BED_EPS_MM) {
      warnings.push({
        type: 'sheet-exceeds-bed',
        sheetWidthMm, sheetHeightMm,
        bedWidthMm: bed.width, bedHeightMm: bed.height,
        locate: { sheetRect, bedSize: bed },
      });
    }
  }

  // 'cropped-paths' — N originals trimmed at the Sheet edge (the Receipt's number).
  if (croppedPathCount > 0) {
    warnings.push({
      type: 'cropped-paths',
      count: croppedPathCount,
      locate: { paths: crops },
    });
  }

  // 'overlaps' — self-intersections on the POST-applied, fabricated geometry only
  // (what the machine actually runs). Optimizations that remove a double-back
  // therefore genuinely lower this count.
  const fabricatedPaths = opGroups.flatMap((g) => g.paths);
  const overlaps = countOverlaps(fabricatedPaths);
  if (overlaps.count > 0) {
    warnings.push({
      type: 'overlaps',
      count: overlaps.count,
      truncated: overlaps.truncated,
      samples: overlaps.samples,
      locate: { samples: overlaps.samples },
    });
  }

  // 'unresolved-layer' — a visible layer with no resolvable Operation even after
  // the document-default fallback (e.g. an empty library). One warning per layer.
  for (const entry of unresolved) {
    warnings.push({
      type: 'unresolved-layer',
      layerId: entry.layerId,
      locate: { layerIds: [entry.layerId] },
    });
  }

  return { opRows, estimate, warnings, route, crops };
}
