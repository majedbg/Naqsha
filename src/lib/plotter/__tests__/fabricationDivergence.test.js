// @vitest-environment jsdom
//
// CHARACTERIZATION TEST — pins the THREE-WAY divergence that existed before
// `fabricationPipeline` unified the render→plot extraction.
//
// The same design (one layer, radial symmetry n=2) was extracted three
// different ways by three prepare components, in three coordinate spaces /
// optimization states:
//
//   - OptimizeSection (usePreviewStats):  splitGroup        — PRE-transform,  isolated-per-control opt
//   - OverlapWarnings (useOverlapSummary): extractRenderedPaths — POST-transform, NO opt
//   - PlotPreviewSection (buildRoute):     optimizeGroup→extract — POST-transform, applied opt (BUT collapses symmetry)
//
// This file documents (does NOT fix) those disagreements with concrete numbers,
// so the divergence is on record. The unified `buildPlottableLayers` answer is
// asserted in fabricationPipeline.test.js.

import { describe, it, expect } from 'vitest';
import {
  splitGroup,
  optimizeGroup,
  extractRenderedPaths,
} from '../pipeline.js';
import { pathStats, estimateTimeSec } from '../pathOps.js';

// A single layer group with radial symmetry n=2 — the two copies are the SAME
// raw path placed at translate(100,100) then rotate(0) and rotate(90). Rotation
// is an isometry (no scale in wrapSVGSymmetry), so per-polyline draw length is
// identical pre/post-transform, but the copies' POSITIONS differ wildly.
const FIXTURE_GROUP = `  <g id="layer-a">
    <g transform="translate(100,100) rotate(0)">
    <path d="M50,10 L80,10 L80,40" stroke="#cc0000"/>
    </g>
    <g transform="translate(100,100) rotate(90)">
    <path d="M50,10 L80,10 L80,40" stroke="#cc0000"/>
    </g>
  </g>`;

function summarize(paths) {
  const s = pathStats(paths);
  return { ...s, seconds: estimateTimeSec(s) };
}

describe('three-way extraction divergence (characterization)', () => {
  // ---- Site 1: OptimizeSection style (splitGroup, pre-transform) ----
  const preTransform = splitGroup(FIXTURE_GROUP).paths;
  const preStats = summarize(preTransform);

  // ---- Site 2: OverlapWarnings style (extractRenderedPaths, post-transform, no opt) ----
  const postTransform = extractRenderedPaths(FIXTURE_GROUP);
  const postStats = summarize(postTransform);

  it('agrees on raw path count and point count (rotation preserves topology)', () => {
    expect(preTransform.length).toBe(2);
    expect(postTransform.length).toBe(2);
    expect(preStats.paths).toBe(postStats.paths);
    expect(preStats.points).toBe(postStats.points);
  });

  it('agrees on DRAW length (rotation is an isometry — per-polyline length preserved)', () => {
    expect(preStats.drawMm).toBeCloseTo(postStats.drawMm, 6);
  });

  it('DIVERGES on TRAVEL: pre-transform copies are colocated at origin; post-transform copies are spread out by symmetry', () => {
    // Pre-transform: both raw copies live at the same origin coordinates, so the
    // only inter-path travel is the (small) gap from copy#1's end back to the
    // shared raw start of copy#2.
    // Post-transform: copy #2 is rotated 90° about (100,100), so its start point
    // is FAR from copy #1's end — much larger real pen-up travel.
    expect(postStats.travelMm).toBeGreaterThan(preStats.travelMm * 2);
  });

  it('DIVERGES on plot-time seconds (travel feeds the estimate)', () => {
    expect(postStats.seconds).toBeGreaterThan(preStats.seconds);
  });

  it('records the concrete numbers for the fixture (the finding)', () => {
    // Actual values for this fixture (mm). The point is the magnitude gap in
    // travel; draw length matches by construction (rotation is isometric).
    //   PRE  splitGroup:        travel ~11.2 mm   (copies colocated at raw coords)
    //   POST extractRendered:   travel ~24.0 mm   (copies spread by 90° rotation)
    expect(preStats.travelMm).toBeCloseTo(11.225, 2);
    expect(postStats.travelMm).toBeCloseTo(23.959, 2);
    expect(postStats.travelMm).toBeGreaterThan(preStats.travelMm * 1.8);
    // Draw length agrees to 6 places (already asserted above) — only the
    // pen-up geometry (travel/seconds/merge/reorder) genuinely diverges.
    expect(preStats.drawMm).toBeCloseTo(postStats.drawMm, 6);
  });
});

describe('optimizeGroup-then-extract collapses symmetry (PlotPreview pre-unification bug)', () => {
  it('DROPS the rotate(90) wrapper when any optimization runs — copies collapse under the first transform', () => {
    const opt = optimizeGroup(FIXTURE_GROUP, { reorder: { enabled: true } });
    // splitGroup keeps only prefix(up-to-first-path) + suffix(after-last-path),
    // so the intermediate </g><g transform="rotate(90)"> wrapper is gone.
    expect(opt.svg).toContain('rotate(0)');
    expect(opt.svg).not.toContain('rotate(90)');

    // Therefore extracting the OPTIMIZED svg sees both copies under rotate(0):
    // they are now colocated, and travel collapses toward the pre-transform value.
    const collapsed = extractRenderedPaths(opt.svg);
    const collapsedStats = summarize(collapsed);
    const honestPost = summarize(extractRenderedPaths(FIXTURE_GROUP));
    // The collapsed travel is far smaller than the honest post-transform travel.
    expect(collapsedStats.travelMm).toBeLessThan(honestPost.travelMm);
  });
});
