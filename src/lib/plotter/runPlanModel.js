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
// Operation → overlapCheck (see basis note below) → profile-aware runEstimate →
// warning taxonomy → route + ghosted-crop geometry.
//
// THE OVERLAP-WARNING BASIS (why Reorder is excluded):
// ADR-0002 says warnings describe what the machine will actually run, retiring
// the legacy pre-optimize basis. For overlaps that means the geometry after
// simplify + merge + clip — those steps genuinely CHANGE the strokes the
// machine lays down (simplify drops vertices, merge removes duplicate passes),
// so their effect on the count is real. Reorder is deliberately EXCLUDED:
// it only permutes (and may flip) paths to cut pen-up travel; the SET of
// strokes on the sheet is identical, and self-overlap of physical geometry is
// invariant under draw-order permutation. So the pre-reorder basis still
// describes exactly what the machine runs. Excluding Reorder also means the
// warning can never appear to change just because the maker toggled Reorder —
// the shipped bug where countOverlaps' first-N segment cap sampled a different
// subset after reordering and the count collapsed (85 → 0; Revert restored 85).
// countOverlaps is now ALSO order-independent under truncation (canonical
// spatial sampling — see overlapCheck.js), so this exclusion is belt and
// braces: the basis states the physics; the sampler enforces it.
// Reorder DOES still apply to everything that is genuinely order-dependent:
// the estimate (travel), opRows, and the animated route.
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
//             samples / sheetRect). No auto-fix (v1). The 'overlaps' warning is
//             { type:'overlaps', count, truncated, samples, locate:{samples} }:
//             `truncated` is true exactly when the segment cap engaged, in
//             which case `count` is a lower bound and the UI must phrase it as
//             "at least N" (a truncated zero still emits the warning — "too
//             dense to fully check" must never read as "no overlaps").
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

import {
  buildPlottableLayers, buildRouteFromLayers, applyOptimizationsToPaths,
} from './fabricationPipeline.js';
import { runEstimate, machineSpeedFor } from './runEstimate.js';
import { etchRasterEstimate } from './etchRasterEstimate.js';
import { countOverlaps } from './overlapCheck.js';
import { resolveOperation, operationIdForRole } from '../operations.js';
import { defaultBedSize } from '../machineProfiles.js';
import { isEtchLayer, DEFAULT_ETCH_DPI } from '../etch/etchLayer.js';
import { pxToMm } from './pathOps.js';
import { PEN_SWAP_SEC } from './constants.js';

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

  // Build the canonical run ONCE: extract → (clip) → applied Optimizations —
  // but with the stack SPLIT (see the overlap-basis note in the header):
  //   1. simplify + merge run inside buildPlottableLayers — they condition the
  //      strokes themselves, so they belong to the overlap-warning basis;
  //   2. reorder is applied AFTERWARD, per layer (same per-layer application
  //      applyOptimizationsToPaths would do inside the pipeline), producing the
  //      machine geometry (`machinePaths`) that the estimate, opRows and route
  //      read. Reorder only permutes/flips paths, so `paths` and `machinePaths`
  //      lay the identical strokes — they differ only in draw order.
  // Every downstream projection reads from THIS single result — the agreement
  // contract.
  const conditioningOnly = appliedOptimizations
    ? { simplify: appliedOptimizations.simplify, merge: appliedOptimizations.merge }
    : null;
  const reorderOnly = appliedOptimizations?.reorder?.enabled
    ? { reorder: appliedOptimizations.reorder }
    : null;

  const plottable = buildPlottableLayers(layers, instances, {
    optimizations: conditioningOnly,
    clip,
  });
  // NOTE: entry.stats (computed pre-reorder) are not read here — run numbers
  // come from runEstimate over machinePaths below.
  const entries = plottable.map((l) => ({
    ...l,
    machinePaths: reorderOnly ? applyOptimizationsToPaths(l.paths, reorderOnly) : l.paths,
  }));

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

  for (const entry of entries) {
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
  // the concat of its member layers' post-applied MACHINE polylines (reorder
  // included — travel time is genuinely order-dependent).
  const opGroups = orderedGroups.map((g) => ({
    opId: g.operation.id,
    operation: g.operation,
    paths: g.layers.flatMap((l) => l.machinePaths),
  }));

  // The VECTOR estimate — path-length time for the resolvable vector layers,
  // untouched by anything raster (so vector-only documents remain byte-identical).
  const vectorEstimate = runEstimate(opGroups, profileId);

  // ── raster Etch branch (S8, #87; ADR-0006) ──────────────────────────────────
  // An Etch has no vector paths — buildPlottableLayers skipped it above (no
  // toSVGGroup) — so without this branch the Run Plan would be SILENT about it.
  // An Etch's run time is a SCAN of its bounding box (area×DPI), a fundamentally
  // different physics from path length, so it gets its own estimator
  // (etchRasterEstimate) rather than being shoehorned into runEstimate. Each Etch
  // still groups under its engrave Operation (grilled decision 6 — reuse engrave,
  // no new process type); its seconds fold into that Operation's row and the
  // total, so the agreement invariant (Σ opRows.sec + swaps === totalSec) holds.
  //
  // FOOTPRINT: the S1 spine places an Etch full-canvas, so its physical size is
  // the Sheet's (sheetRect px → mm). Sub-canvas placement via a layer transform is
  // documented future work; without a Sheet the row is still emitted (never
  // silent) with a zero-area estimate.
  const etchWidthMm = sheetRect ? pxToMm(sheetRect.width) : 0;
  const etchHeightMm = sheetRect ? pxToMm(sheetRect.height) : 0;
  // opId → { operation, sec, layerCount, dpis:Set }
  const etchByOp = new Map();
  for (const layer of layers) {
    if (!isEtchLayer(layer) || !layer.visible) continue;
    let operation = resolveOperation(operations, layer.operationId);
    // An Etch defaults to the ENGRAVE Operation (its role), not the cut default.
    if (!operation) operation = resolveOperation(operations, operationIdForRole('engrave'));
    if (!operation) { unresolved.push({ layerId: layer.id }); continue; }

    const dpi = layer?.params?.dpi > 0 ? layer.params.dpi : DEFAULT_ETCH_DPI;
    const { sec } = etchRasterEstimate({
      widthMm: etchWidthMm,
      heightMm: etchHeightMm,
      dpi,
      // The SAME machine speed the vector model engraves at (machineSpeedFor) —
      // so raster and vector agree about how fast the head moves.
      speed: machineSpeedFor(operation, profileId),
    });

    let agg = etchByOp.get(operation.id);
    if (!agg) { agg = { operation, sec: 0, layerCount: 0, dpis: new Set() }; etchByOp.set(operation.id, agg); }
    agg.sec += sec;
    agg.layerCount += 1;
    agg.dpis.add(dpi);
  }

  // Merge the vector groups and the etch groups into ONE ordered set of
  // Operations (an engrave Operation may carry BOTH). Ordering stays machine
  // execution order (op.order ascending) across the union.
  const opById = new Map(); // opId → operation
  for (const g of orderedGroups) opById.set(g.operation.id, g.operation);
  for (const [opId, agg] of etchByOp) if (!opById.has(opId)) opById.set(opId, agg.operation);
  const orderedOps = [...opById.values()].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  // opRows + the merged estimate.perOp are built together and stay PARALLEL, so
  // every consumer that reads perOp[i] alongside opRows[i] still agrees. drawMm/
  // travelMm/passes come from the vector side (a scan has none); sec is the sum of
  // the vector and raster contributions for that Operation.
  const opRows = [];
  const perOp = [];
  for (const operation of orderedOps) {
    const vecIdx = orderedGroups.findIndex((g) => g.operation.id === operation.id);
    const vecGroup = vecIdx >= 0 ? orderedGroups[vecIdx] : null;
    const vecPer = vecIdx >= 0 ? (vectorEstimate.perOp[vecIdx] || {}) : {};
    const etch = etchByOp.get(operation.id);

    const drawMm = vecPer.drawMm ?? 0;
    const travelMm = vecPer.travelMm ?? 0;
    const passes = vecPer.passes ?? 1;
    const sec = (vecPer.sec ?? 0) + (etch?.sec ?? 0);

    const row = {
      opId: operation.id,
      name: operation.name,
      process: operation.process,
      color: operation.color,
      layerCount: (vecGroup?.layers.length ?? 0) + (etch?.layerCount ?? 0),
      drawMm,
      travelMm,
      passes,
      sec,
    };
    if (etch) {
      // The panel's raster annotation ("raster · N DPI"). `dpi` is the single DPI
      // when the Operation's Etches share one; null when they differ (the panel
      // then reads "mixed DPI"). `sec` is the raster share so a reader can tell
      // the scan time from the vector time in a mixed Operation.
      const dpi = etch.dpis.size === 1 ? [...etch.dpis][0] : null;
      row.raster = { dpi, layerCount: etch.layerCount, sec: etch.sec };
    }
    opRows.push(row);
    perOp.push({ opId: operation.id, drawMm, travelMm, passes, sec });
  }

  // The merged estimate: the same swap term as the vector model (an Etch is
  // engrave — same pen — and adds no swaps), plus the raster seconds now living in
  // perOp. totalSec === Σ perOp.sec + swaps keeps the invariant exact.
  const estimate = {
    totalSec: perOp.reduce((s, o) => s + o.sec, 0) + PEN_SWAP_SEC * vectorEstimate.penSwaps,
    perOp,
    penSwaps: vectorEstimate.penSwaps,
  };

  // route — the animated run-through, over the SAME execution-ordered geometry,
  // tinted by Operation color (the machine view re-tints paths by operation). One
  // synthetic entry per member layer preserves per-path order within a group.
  const routeLayers = orderedGroups.flatMap((g) =>
    g.layers.map((l) => ({ color: g.operation.color, paths: l.machinePaths }))
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

  // 'overlaps' — self-intersections on the post-simplify+merge+clip geometry of
  // the resolvable layers, EXCLUDING reorder (see the overlap-basis note in the
  // header): simplify/merge genuinely change the strokes (a merge that removes a
  // duplicate pass really lowers this count), while reorder only permutes draw
  // order and cannot change physical overlap — so toggling Reorder must never
  // move this number. `truncated` is true exactly when countOverlaps' segment
  // cap engaged; the count is then a lower bound and the UI renders "at least
  // N". A truncated zero still warns — "too dense to fully check" must never
  // silently read as "no overlaps".
  const overlapBasisPaths = orderedGroups.flatMap(
    (g) => g.layers.flatMap((l) => l.paths)
  );
  const overlaps = countOverlaps(overlapBasisPaths);
  if (overlaps.count > 0 || overlaps.truncated) {
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
