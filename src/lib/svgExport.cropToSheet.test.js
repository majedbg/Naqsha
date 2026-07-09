// @vitest-environment jsdom
//
// Hybrid Sheet clipping in the FILE export (#73 merge blocker).
//
// THE BUG THIS PINS: the Export Receipt and the Run Plan both derive from
// runPlanModel, whose pipeline clips extracted geometry to the Sheet
// (clipToSheet) when the cropToSheet Export preference is on. But the actual
// file export (buildAllLayersSVG) emitted each instance's native markup and
// never clipped — so the Receipt said "N paths cropped" while the exported
// file still contained them. The receipt lied.
//
// THE DECISION (product owner, binding): HYBRID clip. Only paths that cross or
// fall outside the Sheet boundary are routed through the clip pipeline and
// re-emitted as clipped polylines; every path fully inside the Sheet keeps its
// existing native markup untouched (curve/text fidelity preserved). Receipt,
// Run Plan, and file must agree on the crop count.
//
// jsdom is REQUIRED: hybrid clipping extracts final-space geometry via
// DOMParser (same requirement as buildPlottableLayers).

import { describe, it, expect } from 'vitest';
import { buildAllLayersSVG } from './svgExport.js';
import { runPlanModel } from './plotter/runPlanModel.js';
import { buildExportReceipt } from './exportReceipt.js';
import { extractRenderedPaths } from './plotter/pipeline.js';
import { seedOperations } from './operations.js';

// ── fixtures (mirroring runPlanModel.test.js idiom) ──────────────────────────

const fakeInstance = (group) => ({ toSVGGroup: () => group });

// Canvas 100×100 px; the Sheet maps to it 1:1 (same construction Studio uses).
const W = 100;
const H = 100;
const SHEET = { x: 0, y: 0, width: W, height: H };

const INSIDE_PATH = '<path d="M10,10 L50,10" stroke="#000" fill="none"/>';
const CROSSING_PATH = '<path d="M50,50 L150,50" stroke="#000" fill="none"/>';
const OUTSIDE_PATH = '<path d="M200,200 L300,200" stroke="#000" fill="none"/>';
// A degenerate no-op (<2 points): draws nothing, must stay byte-stable.
const EMPTY_PATH = '<path d="" stroke="#000" fill="none"/>';

const MIXED_GROUP = `<g id="L-mixed">
    ${INSIDE_PATH}
    ${CROSSING_PATH}
    ${OUTSIDE_PATH}
  </g>`;

const INSIDE_GROUP = `<g id="L-inside">
    ${INSIDE_PATH}
    ${EMPTY_PATH}
  </g>`;

// One crossing path in a second layer, so agreement is summed ACROSS layers.
const CROSSING_GROUP = `<g id="L-cross2">
    <path d="M20,90 L20,150" stroke="#00f" fill="none"/>
  </g>`;

// Geometry drawn inside a transform wrapper: local (0,10)→(40,10) lands at
// (80,10)→(120,10) in Sheet space, crossing the right edge at x=100. The clip
// must operate in FINAL (Sheet) space, not local space.
const SHIFTED_GROUP = `<g id="L-shift"><g transform="translate(80 0)">
    <path d="M0,10 L40,10" stroke="#000" fill="none"/>
  </g></g>`;

const OPS = seedOperations();

function layer(id, extra = {}) {
  return {
    id, name: id, visible: true, color: '#000', opacity: 100, bgOpacity: 0,
    operationId: 'op-cut', ...extra,
  };
}

// Every drawable point in the exported file must lie on the Sheet (inclusive
// edges; eps covers the 2-decimal coordinate formatting).
function assertWithinSheet(svg, eps = 0.01) {
  const paths = extractRenderedPaths(svg);
  expect(paths.length).toBeGreaterThan(0);
  for (const p of paths) {
    for (const [x, y] of p.points) {
      expect(x).toBeGreaterThanOrEqual(0 - eps);
      expect(x).toBeLessThanOrEqual(W + eps);
      expect(y).toBeGreaterThanOrEqual(0 - eps);
      expect(y).toBeLessThanOrEqual(H + eps);
    }
  }
}

// ── the preference OFF (and absent) keeps today's bytes ─────────────────────

describe('buildAllLayersSVG — cropToSheet OFF is byte-identical to today', () => {
  const layers = [layer('mixed')];
  const instances = { mixed: fakeInstance(MIXED_GROUP) };

  it('cropToSheet:false with a Sheet present emits exactly the legacy output', () => {
    const legacy = buildAllLayersSVG(layers, instances, W, H, false, {});
    const off = buildAllLayersSVG(layers, instances, W, H, false, {
      cropToSheet: false, sheetRect: SHEET,
    });
    expect(off).toBe(legacy);
    // Sanity: the fixture genuinely overflows the Sheet when unclipped —
    // otherwise the tests below would pass vacuously.
    const overflow = extractRenderedPaths(off).some((p) =>
      p.points.some(([x, y]) => x > W || y > H)
    );
    expect(overflow).toBe(true);
  });

  it('no sheetRect (existing callers) emits exactly the legacy output', () => {
    const legacy = buildAllLayersSVG(layers, instances, W, H, false, {});
    const noSheet = buildAllLayersSVG(layers, instances, W, H, false, { cropToSheet: true });
    expect(noSheet).toBe(legacy);
  });
});

// ── hybrid clipping ON ───────────────────────────────────────────────────────

describe('buildAllLayersSVG — hybrid Sheet clipping (cropToSheet ON)', () => {
  const layers = [layer('mixed')];
  const instances = { mixed: fakeInstance(MIXED_GROUP) };
  const opts = { cropToSheet: true, sheetRect: SHEET };

  it('exported geometry stays within the Sheet bounds', () => {
    const svg = buildAllLayersSVG(layers, instances, W, H, false, opts);
    assertWithinSheet(svg);
  });

  it('a path fully inside the Sheet keeps its native markup untouched', () => {
    const svg = buildAllLayersSVG(layers, instances, W, H, false, opts);
    expect(svg).toContain(INSIDE_PATH);
  });

  it('a crossing path is replaced by its clipped polyline fragment', () => {
    const svg = buildAllLayersSVG(layers, instances, W, H, false, opts);
    expect(svg).not.toContain('M50,50 L150,50');
    // Trimmed at the right Sheet edge (x=100), source attrs carried forward.
    expect(svg).toContain('M50.00,50.00 L100.00,50.00');
  });

  it('a fully-outside path is omitted from the file (dropped, not cropped)', () => {
    const svg = buildAllLayersSVG(layers, instances, W, H, false, opts);
    expect(svg).not.toContain('M200,200');
    expect(svg).not.toContain('200.00'); // no fragment of it either
  });

  it('a fully-inside document exports byte-identical with the preference on vs off', () => {
    const insideLayers = [layer('inside')];
    const insideInstances = { inside: fakeInstance(INSIDE_GROUP) };
    const on = buildAllLayersSVG(insideLayers, insideInstances, W, H, false, {
      cropToSheet: true, sheetRect: SHEET,
    });
    const off = buildAllLayersSVG(insideLayers, insideInstances, W, H, false, {
      cropToSheet: false, sheetRect: SHEET,
    });
    expect(on).toBe(off);
    // The degenerate no-op path survives verbatim — byte-stability includes it.
    expect(on).toContain(EMPTY_PATH);
  });

  it('geometry under an internal transform is clipped in final (Sheet) space', () => {
    const shiftLayers = [layer('shift')];
    const shiftInstances = { shift: fakeInstance(SHIFTED_GROUP) };
    const svg = buildAllLayersSVG(shiftLayers, shiftInstances, W, H, false, opts);
    // The local-space original is gone; the fragment is in Sheet space,
    // trimmed at x=100 (NOT at the local x=40).
    expect(svg).not.toContain('M0,10 L40,10');
    expect(svg).toContain('M80.00,10.00 L100.00,10.00');
    assertWithinSheet(svg);
  });
});

// ── three-way agreement: Run Plan, Export Receipt, exported file ─────────────

describe('three-way agreement — Run Plan, Export Receipt, and the file crop the same paths', () => {
  const layers = [layer('inside'), layer('mixed'), layer('cross2')];
  const instances = {
    inside: fakeInstance(INSIDE_GROUP),
    mixed: fakeInstance(MIXED_GROUP),
    cross2: fakeInstance(CROSSING_GROUP),
  };

  it('file crop stamps sum to the runPlanModel count and the Receipt croppedCount', () => {
    const plan = runPlanModel({
      layers, instances, operations: OPS, profileId: 'laser',
      sheetRect: SHEET, cropToSheet: true,
    });
    const planCount =
      plan.warnings.find((w) => w.type === 'cropped-paths')?.count ?? 0;
    const receipt = buildExportReceipt(plan);

    const svg = buildAllLayersSVG(layers, instances, W, H, false, {
      cropToSheet: true, sheetRect: SHEET, profileId: 'laser',
    });
    const fileCount = [...svg.matchAll(/data-cropped-paths="(\d+)"/g)]
      .reduce((n, m) => n + Number(m[1]), 0);

    // Ground truth: one crossing path in the mixed layer + one in cross2. The
    // fully-outside path is DROPPED, not cropped (clipToSheet contract), so it
    // must not inflate any of the three counts.
    expect(planCount).toBe(2);
    expect(fileCount).toBe(planCount);
    expect(receipt.croppedCount).toBe(planCount);

    // And the file the maker receives really is Sheet-bounded.
    assertWithinSheet(svg);
  });

  it('with the preference OFF all three agree on zero cropped', () => {
    const plan = runPlanModel({
      layers, instances, operations: OPS, profileId: 'laser',
      sheetRect: SHEET, cropToSheet: false,
    });
    expect(plan.warnings.find((w) => w.type === 'cropped-paths')).toBeUndefined();
    expect(buildExportReceipt(plan).croppedCount).toBe(0);

    const svg = buildAllLayersSVG(layers, instances, W, H, false, {
      cropToSheet: false, sheetRect: SHEET, profileId: 'laser',
    });
    expect(svg).not.toContain('data-cropped-paths');
  });
});
