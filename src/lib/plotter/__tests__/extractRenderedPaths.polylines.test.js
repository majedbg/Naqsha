// @vitest-environment jsdom
//
// WI-P — extractRenderedPaths must emit geometry for <line> and <polyline>,
// not only <path>. jsdom is REQUIRED: only under a real DOMParser does
// extractRenderedPaths take its post-transform `walk` branch. In the node
// fallback (no DOMParser) it defers to splitGroup, which we do NOT touch and
// which drops non-<path> tags before and after this fix — so a node-env test
// here would never flip RED→GREEN and would prove nothing.
//
// Two pattern shapes were silently dropped by the plotter before this fix:
//   - Grid (unwarped)        emits <line x1 y1 x2 y2 .../>
//   - TopographicContours    emits <polyline points="x,y x,y ..." .../>
// A WARPED grid instead emits a <path d="M.. C..">, which was already
// plottable — the characterization below distinguishes the two so we prove the
// fix ADDS unwarped-grid geometry without disturbing the warped-grid path.

import { describe, it, expect } from 'vitest';
import { extractRenderedPaths } from '../pipeline.js';
import { buildPlottableLayers } from '../fabricationPipeline.js';

describe('extractRenderedPaths — <path> safety rail (permanent characterization)', () => {
  // This branch is untouched by the fix; it must extract byte-for-byte
  // identically before and after. It is the rail that catches accidental
  // regressions in the shared walk/transform machinery.
  it('extracts a transformed <path> exactly as before (points + closed + color)', () => {
    const group = `<g transform="translate(100,100) rotate(90)">` +
      `<path d="M50,10 L80,10 L80,40" stroke="#cc0000"/></g>`;
    const out = extractRenderedPaths(group);
    expect(out).toHaveLength(1);
    // M = translate(100,100)·rotate(90); applied right-to-left (rotate first):
    // rotate(90)[x,y] = [-y, x], then +[100,100]. So [50,10] → [90,150] and
    // [80,40] → [60,180].
    expect(out[0].points[0][0]).toBeCloseTo(90, 6);
    expect(out[0].points[0][1]).toBeCloseTo(150, 6);
    expect(out[0].points[2][0]).toBeCloseTo(60, 6);
    expect(out[0].points[2][1]).toBeCloseTo(180, 6);
    expect(out[0].closed).toBe(false);
    expect(out[0].color).toBe('#cc0000');
  });
});

describe('extractRenderedPaths — <line> (WI-P: unwarped Grid geometry)', () => {
  it('emits a 2-point polyline for a <line>, transformed into the outer viewBox', () => {
    // Mirror wrapSVGSymmetry: a per-copy <g transform> wrapping the element, so
    // the assertion exercises applyMatrix, not just the bare-emit path.
    const group = `<g transform="translate(100,100) rotate(90)">` +
      `<line x1="50" y1="10" x2="80" y2="40" stroke="#00aa00"/></g>`;
    const out = extractRenderedPaths(group);
    expect(out).toHaveLength(1);
    expect(out[0].points).toHaveLength(2);
    // M = translate(100,100)·rotate(90): rotate(90)[x,y] = [-y, x], then
    // +[100,100]. So [50,10] → [90,150] and [80,40] → [60,180].
    expect(out[0].points[0][0]).toBeCloseTo(90, 6);
    expect(out[0].points[0][1]).toBeCloseTo(150, 6);
    expect(out[0].points[1][0]).toBeCloseTo(60, 6);
    expect(out[0].points[1][1]).toBeCloseTo(180, 6);
    expect(out[0].closed).toBe(false);
    expect(out[0].color).toBe('#00aa00');
  });
});

describe('extractRenderedPaths — <polyline> (WI-P: TopographicContours geometry)', () => {
  it('emits the point list of a <polyline>, transformed into the outer viewBox', () => {
    // TopographicContours emits `points="x,y x,y ..."` (comma-in-pair,
    // space-between). Untransformed here (identity) to pin the point list.
    const group = `<g><polyline points="0,0 10,0 10,10 20,10" ` +
      `fill="none" stroke="#0000cc"/></g>`;
    const out = extractRenderedPaths(group);
    expect(out).toHaveLength(1);
    expect(out[0].points).toEqual([[0, 0], [10, 0], [10, 10], [20, 10]]);
    expect(out[0].closed).toBe(false);
    expect(out[0].color).toBe('#0000cc');
  });

  it('parses a <polyline> whose points are whitespace-separated (no commas)', () => {
    const group = `<g><polyline points="0 0 5 5 10 0" stroke="#111"/></g>`;
    const out = extractRenderedPaths(group);
    expect(out).toHaveLength(1);
    expect(out[0].points).toEqual([[0, 0], [5, 5], [10, 0]]);
  });
});

describe('extractRenderedPaths — warped vs unwarped Grid (non-regression)', () => {
  it('a WARPED grid <path d="M.. C.."> extracts unchanged alongside the <line> fix', () => {
    // A warped grid line becomes a cubic <path> — already plottable pre-fix.
    // Assert it still yields a multi-sample polyline and is NOT altered by the
    // new <line>/<polyline> handling.
    const group = `<g><path d="M0,0 C10,10 20,10 30,0" stroke="#c0c"/></g>`;
    const out = extractRenderedPaths(group);
    expect(out).toHaveLength(1);
    expect(out[0].points.length).toBeGreaterThan(2); // cubic sampled
    expect(out[0].points[0]).toEqual([0, 0]);
    expect(out[0].color).toBe('#c0c');
  });
});

describe('buildPlottableLayers — the real consumer now sees <line>/<polyline>', () => {
  // End-to-end through the canonical fabrication entry: a layer instance that
  // emits an unwarped Grid (<line>) and a TopographicContours polyline must
  // yield plottable geometry, not an empty layer. Pre-fix this returned 0 paths.
  const gridLike = `  <g id="layer-g">
    <g transform="translate(0,0)">
    <line x1="10" y1="10" x2="90" y2="10" stroke="#222"/>
    <polyline points="10,20 50,25 90,20" stroke="#222"/>
    </g>
  </g>`;
  const fakeInstance = (group) => ({ toSVGGroup: () => group });

  it('materializes both the <line> and the <polyline> as layer paths', () => {
    const layers = [{ id: 'g', visible: true, color: '#222', opacity: 100 }];
    const out = buildPlottableLayers(layers, { g: fakeInstance(gridLike) }, {});
    expect(out).toHaveLength(1);
    expect(out[0].paths).toHaveLength(2); // line + polyline (was 0 pre-fix)
    expect(out[0].paths[0].points).toEqual([[10, 10], [90, 10]]);
    expect(out[0].paths[1].points).toEqual([[10, 20], [50, 25], [90, 20]]);
    expect(out[0].stats.paths).toBe(2);
  });
});
