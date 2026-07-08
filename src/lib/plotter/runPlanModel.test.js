// @vitest-environment jsdom
//
// runPlanModel + the fabricationPipeline OPT-IN clip stage (Wave 2 keystone).
//
// These tests extend the SPIRIT of fabricationDivergence.test.js: there, three
// prepare sites disagreed because each re-extracted the design differently; here
// the Run Plan panel, the Export Receipt, and quick export must AGREE by
// construction because they all read ONE derived object — the Run Plan model.
// So the load-bearing assertions are the invariants that make disagreement
// impossible (Σ opRows.sec === estimate.totalSec when there are no Pen Swaps;
// a receipt-shaped projection and a panel-shaped projection read identical
// minutes / cropped / warning counts), plus one focused test per warning type.
//
// jsdom is REQUIRED: the extraction underneath (extractRenderedPaths) needs
// DOMParser; buildPlottableLayers throws without it.

import { describe, it, expect } from 'vitest';
import { runPlanModel } from './runPlanModel.js';
import { buildPlottableLayers } from './fabricationPipeline.js';
import { seedOperations } from '../operations.js';
import { PEN_SWAP_SEC } from './constants.js';
import { mmToPx } from './pathOps.js';

// ── fixtures ─────────────────────────────────────────────────────────────────

// Minimal fake pattern instance: returns a fixed SVG group string, mirroring the
// shape wrapSVGSymmetry emits (layer <g> → per-copy <g transform> → <path>).
function fakeInstance(group) {
  return { toSVGGroup: () => group };
}

// A single straight-ish polyline fully inside a generous Sheet.
const INSIDE_GROUP = `<g id="L"><g transform="translate(0,0)">
  <path d="M0,0 L40,0 L40,40" stroke="#000"/>
</g></g>`;

// A polyline that starts inside the Sheet and runs off the right edge — a
// "crossing" path the clip stage trims (croppedPathCount === 1).
const CROSSING_GROUP = `<g id="L"><g transform="translate(0,0)">
  <path d="M10,10 L100,10" stroke="#000"/>
</g></g>`;

// A V dipping below y=0 crossed by a horizontal baseline: the two V limbs cross
// the baseline at x=2.5 and x=7.5 → 2 self-intersections. A coarse simplify
// collapses the V's dip vertex, so POST-Optimization the crossings vanish. This
// is the "overlaps computed on post-applied geometry" case.
const OVERLAP_GROUP = `<g id="L"><g transform="translate(0,0)">
  <path d="M0,5 L5,-5 L10,5" stroke="#000"/>
  <path d="M0,0 L10,0" stroke="#000"/>
</g></g>`;

const OPS = seedOperations(); // op-cut / op-score / op-engrave, order 0/1/2
const CUT_ID = 'op-cut';

function layer(id, extra = {}) {
  return { id, visible: true, color: '#000', opacity: 100, operationId: CUT_ID, ...extra };
}

// ── the clip stage on fabricationPipeline (PART 1) ───────────────────────────

describe('buildPlottableLayers clip stage — opt-in, absent = byte-identical', () => {
  const layers = [layer('a')];
  const instances = { a: fakeInstance(CROSSING_GROUP) };

  it('ABSENT clip option: layer entry has exactly the legacy keys (no crop)', () => {
    const [entry] = buildPlottableLayers(layers, instances, {});
    expect(Object.keys(entry).sort()).toEqual(
      ['color', 'layerId', 'paths', 'role', 'roleColor', 'stats'].sort()
    );
    // The crossing path is untouched when we do not clip.
    expect(entry.paths[0].points).toEqual([[10, 10], [100, 10]]);
  });

  it('PRESENT clip option: clips BEFORE optimize and surfaces crop metadata', () => {
    const sheetRect = { x: 0, y: 0, width: 50, height: 50 };
    const [entry] = buildPlottableLayers(layers, instances, { clip: { sheetRect } });
    // The crossing segment is trimmed at x=50 (inclusive edge).
    expect(entry.paths[0].points).toEqual([[10, 10], [50, 10]]);
    // One original was trimmed at an edge.
    expect(entry.crop.croppedPathCount).toBe(1);
    // Ghost carries the ORIGINAL (pre-clip) geometry of what was trimmed away, so
    // the canvas can render it faded at the Sheet edge.
    expect(entry.crop.ghost).toHaveLength(1);
    expect(entry.crop.ghost[0].points).toEqual([[10, 10], [100, 10]]);
  });

  it('PRESENT clip option: a fully-outside path is dropped and ghosted, not cropped', () => {
    const sheetRect = { x: 0, y: 0, width: 5, height: 5 };
    const [entry] = buildPlottableLayers(layers, instances, { clip: { sheetRect } });
    expect(entry.paths).toEqual([]); // nothing fabricable survives
    expect(entry.crop.croppedPathCount).toBe(0); // fully-gone ≠ cropped
    expect(entry.crop.ghost).toHaveLength(1); // still ghosted
  });
});

// ── runPlanModel: shape + the agreement guarantee ────────────────────────────

describe('runPlanModel — one model every consumer agrees with', () => {
  it('opRows are per-Operation, in machine execution order (op.order)', () => {
    // Two layers on two operations declared out of execution order.
    const layers = [
      layer('a', { operationId: 'op-score' }), // order 1
      layer('b', { operationId: 'op-cut' }),   // order 0
    ];
    const instances = { a: fakeInstance(INSIDE_GROUP), b: fakeInstance(INSIDE_GROUP) };
    const { opRows } = runPlanModel({
      layers, instances, operations: OPS, profileId: 'laser',
    });
    expect(opRows.map((r) => r.opId)).toEqual(['op-cut', 'op-score']); // by op.order
    expect(opRows[0]).toMatchObject({ name: 'Cut', process: 'cut', layerCount: 1 });
  });

  it('AGREEMENT: opRows.sec sum to estimate.totalSec (no Pen Swaps on laser)', () => {
    // Laser has no Pen Swaps, so the swap term is 0 and the sum is exact — this
    // is the invariant the panel headline and the receipt minutes both rely on.
    const layers = [layer('a'), layer('b', { operationId: 'op-score' })];
    const instances = { a: fakeInstance(INSIDE_GROUP), b: fakeInstance(CROSSING_GROUP) };
    const model = runPlanModel({
      layers, instances, operations: OPS, profileId: 'laser',
      sheetRect: { x: 0, y: 0, width: 50, height: 50 }, cropToSheet: true,
    });
    expect(model.estimate.penSwaps).toBe(0);
    const rowSum = model.opRows.reduce((s, r) => s + r.sec, 0);
    expect(rowSum).toBeCloseTo(model.estimate.totalSec, 9);

    // A receipt-shaped read and a panel-shaped read of the SAME model must agree.
    // The two derivations are DELIBERATELY DIFFERENT so this is a real cross-check,
    // not x===x: the receipt reads the estimate headline and the crops geometry;
    // the panel reads the per-Operation breakdown sum and the cropped-paths
    // warning. They land on the same numbers ONLY because both project the one
    // model — which is the whole point of "agree by construction".
    const receipt = {
      minutes: Math.round(model.estimate.totalSec / 60),
      // distinct originals that were trimmed, recovered from the ghost geometry.
      cropped: new Set(model.crops.map((c) => c.layerId)).size,
    };
    const cropWarning = model.warnings.find((w) => w.type === 'cropped-paths');
    const panel = {
      minutes: Math.round(
        (model.opRows.reduce((s, r) => s + r.sec, 0)
          + PEN_SWAP_SEC * model.estimate.penSwaps) / 60
      ),
      cropped: cropWarning ? cropWarning.count : 0,
    };
    expect(receipt).toEqual(panel);
    expect(receipt.cropped).toBe(1); // the crossing layer was trimmed once
  });
});

// ── warning taxonomy — one focused test per type (PRD story 25) ──────────────

describe('runPlanModel — warning taxonomy', () => {
  it("'sheet-exceeds-bed': Sheet dims (mm) exceed the machine bed (mm)", () => {
    const layers = [layer('a')];
    const instances = { a: fakeInstance(INSIDE_GROUP) };
    const { warnings } = runPlanModel({
      layers, instances, operations: OPS, profileId: 'laser',
      // 100mm-wide Sheet on a 10mm bed → exceeds.
      sheetRect: { x: 0, y: 0, width: mmToPx(100), height: mmToPx(10) },
      bedSize: { width: 10, height: 10, unit: 'mm' },
    });
    const w = warnings.find((x) => x.type === 'sheet-exceeds-bed');
    expect(w).toBeTruthy();
    expect(w.sheetWidthMm).toBeCloseTo(100, 6);
    expect(w.bedWidthMm).toBe(10);
    expect(w.locate).toBeTruthy();
  });

  it("'cropped-paths': croppedPathCount > 0 carries the count", () => {
    const layers = [layer('a')];
    const instances = { a: fakeInstance(CROSSING_GROUP) };
    const { warnings } = runPlanModel({
      layers, instances, operations: OPS, profileId: 'laser',
      sheetRect: { x: 0, y: 0, width: 50, height: 50 }, cropToSheet: true,
    });
    const w = warnings.find((x) => x.type === 'cropped-paths');
    expect(w).toBeTruthy();
    expect(w.count).toBe(1);
  });

  it("'overlaps': counted on POST-applied geometry (a coarse simplify removes them)", () => {
    const layers = [layer('a')];
    const instances = { a: fakeInstance(OVERLAP_GROUP) };
    const base = { layers, instances, operations: OPS, profileId: 'laser' };

    const pre = runPlanModel({ ...base, appliedOptimizations: null });
    const preW = pre.warnings.find((x) => x.type === 'overlaps');
    expect(preW).toBeTruthy();
    expect(preW.count).toBe(2); // both V limbs cross the baseline

    const post = runPlanModel({
      ...base,
      appliedOptimizations: { simplify: { enabled: true, tolerance: 5 } },
    });
    const postW = post.warnings.find((x) => x.type === 'overlaps');
    // Simplify collapsed the V dip → the crossings are gone from the geometry the
    // machine will actually run. Overlaps are measured on THAT, so fewer (none).
    expect(postW).toBeUndefined();
  });

  it("'unresolved-layer': warns only AFTER the document-default fallback also fails", () => {
    // Empty operation library: neither the layer's op nor operationIdForRole('cut')
    // resolves, so the layer is genuinely unassignable.
    const layers = [layer('a', { operationId: undefined })];
    const instances = { a: fakeInstance(INSIDE_GROUP) };
    const { warnings, opRows } = runPlanModel({
      layers, instances, operations: [], profileId: 'laser',
    });
    const w = warnings.find((x) => x.type === 'unresolved-layer');
    expect(w).toBeTruthy();
    expect(w.locate.layerIds).toContain('a');
    expect(opRows).toEqual([]); // nothing resolvable to fabricate
  });

  it('an UNASSIGNED layer resolves through the document-default Operation and does NOT warn', () => {
    // No operationId, but the seeded library HAS the default (op-cut), so the
    // layer resolves through it — no unresolved-layer warning (PRD story 24).
    const layers = [layer('a', { operationId: undefined })];
    const instances = { a: fakeInstance(INSIDE_GROUP) };
    const { warnings, opRows } = runPlanModel({
      layers, instances, operations: OPS, profileId: 'laser',
    });
    expect(warnings.find((x) => x.type === 'unresolved-layer')).toBeUndefined();
    expect(opRows.map((r) => r.opId)).toEqual(['op-cut']);
  });
});

// ── crop honors cropToSheet (the Export preference) ──────────────────────────

describe('runPlanModel — crop honors cropToSheet', () => {
  const layers = [layer('a')];
  const instances = { a: fakeInstance(CROSSING_GROUP) };
  const sheetRect = { x: 0, y: 0, width: 50, height: 50 };

  it('cropToSheet=true clips: crops carries ghosts, cropped-paths warns', () => {
    const model = runPlanModel({
      layers, instances, operations: OPS, profileId: 'laser', sheetRect, cropToSheet: true,
    });
    expect(model.crops.length).toBeGreaterThan(0);
    expect(model.warnings.find((w) => w.type === 'cropped-paths')).toBeTruthy();
  });

  it('cropToSheet=false does NOT clip: no ghosts, no cropped-paths warning', () => {
    const model = runPlanModel({
      layers, instances, operations: OPS, profileId: 'laser', sheetRect, cropToSheet: false,
    });
    expect(model.crops).toEqual([]);
    expect(model.warnings.find((w) => w.type === 'cropped-paths')).toBeUndefined();
    // Geometry runs off the (unclipped) Sheet unchanged.
    expect(model.opRows[0].opId).toBe('op-cut');
  });
});

// ── Pen Swaps: the swap term lives in the estimate, not in opRows ─────────────

describe('runPlanModel — Pen Swaps surface in the estimate (plotter)', () => {
  it('counts a swap between operations with different pens; totalSec includes it', () => {
    // Two operations, different penSlots, on a plotter → one Pen Swap.
    const ops = [
      { id: 'op-a', name: 'Pen A', color: '#111', process: 'pen', order: 0, machineParams: { penSlot: 1 } },
      { id: 'op-b', name: 'Pen B', color: '#222', process: 'pen', order: 1, machineParams: { penSlot: 2 } },
    ];
    const layers = [layer('a', { operationId: 'op-a' }), layer('b', { operationId: 'op-b' })];
    const instances = { a: fakeInstance(INSIDE_GROUP), b: fakeInstance(INSIDE_GROUP) };
    const model = runPlanModel({ layers, instances, operations: ops, profileId: 'plotter' });
    expect(model.estimate.penSwaps).toBe(1);
    // The 30s swap allowance is in totalSec but in NO opRow (documented so Wave 3
    // knows the headline does not equal the breakdown sum when swaps exist).
    const rowSum = model.opRows.reduce((s, r) => s + r.sec, 0);
    expect(model.estimate.totalSec).toBeCloseTo(rowSum + PEN_SWAP_SEC * 1, 9);
  });
});
