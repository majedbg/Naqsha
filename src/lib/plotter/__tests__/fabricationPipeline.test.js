// @vitest-environment jsdom
//
// Unit tests for the canonical fabrication pipeline. jsdom is REQUIRED because
// buildPlottableLayers throws without DOMParser (it relies on the post-transform
// extraction in extractRenderedPaths).

import { describe, it, expect } from 'vitest';
import {
  buildPlottableLayers,
  applyOptimizationsToPaths,
  aggregateStats,
  buildRouteFromLayers,
} from '../fabricationPipeline.js';
import { pathStats, estimateTimeSec } from '../pathOps.js';

// Minimal fake pattern instance: returns a fixed SVG group string. Mirrors the
// shape wrapSVGSymmetry emits (layer <g> → per-copy <g transform> → <path>).
function fakeInstance(group) {
  return { toSVGGroup: () => group };
}

const SYMMETRIC_GROUP = `  <g id="layer-a">
    <g transform="translate(100,100) rotate(0)">
    <path d="M50,10 L80,10 L80,40" stroke="#cc0000"/>
    </g>
    <g transform="translate(100,100) rotate(90)">
    <path d="M50,10 L80,10 L80,40" stroke="#cc0000"/>
    </g>
  </g>`;

const SIMPLE_GROUP = `  <g id="layer-b">
    <g transform="translate(0,0)">
    <path d="M0,0 L100,0 L100,100" stroke="#0000cc"/>
    </g>
  </g>`;

describe('buildPlottableLayers — canonical extraction', () => {
  const layers = [
    { id: 'a', visible: true, color: '#cc0000', opacity: 100, role: 'cut' },
    { id: 'b', visible: true, color: '#0000cc', opacity: 100 },
  ];
  const instances = { a: fakeInstance(SYMMETRIC_GROUP), b: fakeInstance(SIMPLE_GROUP) };

  it('returns one entry per visible layer in bottom-up (reversed) order', () => {
    const out = buildPlottableLayers(layers, instances, {});
    expect(out.map((l) => l.layerId)).toEqual(['b', 'a']); // reversed
  });

  it('materializes symmetry copies (post-transform space)', () => {
    const out = buildPlottableLayers(layers, instances, {});
    const a = out.find((l) => l.layerId === 'a');
    expect(a.paths.length).toBe(2); // both rotate copies present
    // first copy is rotate(0) about (100,100): raw [50,10] → [150,110]
    expect(a.paths[0].points[0]).toEqual([150, 110]);
  });

  it('per-layer stats match pathStats+estimateTimeSec of that layer paths', () => {
    const out = buildPlottableLayers(layers, instances, {});
    for (const l of out) {
      const s = pathStats(l.paths);
      expect(l.stats.paths).toBe(s.paths);
      expect(l.stats.points).toBe(s.points);
      expect(l.stats.drawMm).toBeCloseTo(s.drawMm, 9);
      expect(l.stats.travelMm).toBeCloseTo(s.travelMm, 9);
      expect(l.stats.seconds).toBeCloseTo(estimateTimeSec(s), 9);
    }
  });

  it('carries role + roleColor for laser mapping', () => {
    const out = buildPlottableLayers(layers, instances, {});
    const a = out.find((l) => l.layerId === 'a');
    expect(a.role).toBe('cut');
    expect(a.roleColor).toBe('#FF0000');
  });

  it('skips hidden layers unless includeHidden', () => {
    const withHidden = [...layers, { id: 'c', visible: false, color: '#0a0', opacity: 100 }];
    const inst = { ...instances, c: fakeInstance(SIMPLE_GROUP) };
    expect(buildPlottableLayers(withHidden, inst, {}).map((l) => l.layerId)).toEqual(['b', 'a']);
    expect(buildPlottableLayers(withHidden, inst, { includeHidden: true }).map((l) => l.layerId))
      .toEqual(['c', 'b', 'a']);
  });

  it('returns [] for missing layers/instances', () => {
    expect(buildPlottableLayers(null, instances, {})).toEqual([]);
    expect(buildPlottableLayers(layers, null, {})).toEqual([]);
  });
});

describe('buildPlottableLayers — optimizations applied in canonical space', () => {
  const layers = [{ id: 'a', visible: true, color: '#cc0000', opacity: 100 }];
  const instances = { a: fakeInstance(SYMMETRIC_GROUP) };

  it('reorder does NOT collapse symmetry (the legacy PlotPreview bug is fixed)', () => {
    const plain = buildPlottableLayers(layers, instances, {});
    const reordered = buildPlottableLayers(layers, instances, {
      optimizations: { reorder: { enabled: true } },
    });
    // Both keep BOTH symmetry copies — reorder only changes draw order, never
    // collapses copies under one transform (which optimizeGroup-then-extract did,
    // dropping the rotate(90) wrapper — see fabricationDivergence.test.js).
    expect(plain[0].paths.length).toBe(2);
    expect(reordered[0].paths.length).toBe(2);
    // Draw length is conserved (reorder never changes geometry, only order).
    expect(reordered[0].stats.drawMm).toBeCloseTo(plain[0].stats.drawMm, 6);
    // Point count conserved too — no copies lost.
    expect(reordered[0].stats.points).toBe(plain[0].stats.points);
  });

  it('simplify reduces point count', () => {
    const collinear = `  <g id="layer-a"><g transform="translate(0,0)">
    <path d="M0,0 L10,0 L20,0 L30,0" stroke="#000"/>
    </g></g>`;
    const out = buildPlottableLayers(
      [{ id: 'a', visible: true, color: '#000', opacity: 100 }],
      { a: fakeInstance(collinear) },
      { optimizations: { simplify: { enabled: true, tolerance: 0.5 } } }
    );
    // RDP on a straight line collapses to 2 endpoints.
    expect(out[0].paths[0].points.length).toBe(2);
  });
});

describe('applyOptimizationsToPaths', () => {
  const paths = [{ points: [[0, 0], [10, 0], [20, 0]], closed: false }];
  it('returns input unchanged with no optimizations', () => {
    expect(applyOptimizationsToPaths(paths, null)).toBe(paths);
    expect(applyOptimizationsToPaths(paths, {})).toBe(paths);
  });
  it('ignores simplify with non-positive tolerance', () => {
    expect(applyOptimizationsToPaths(paths, { simplify: { enabled: true, tolerance: 0 } })).toBe(paths);
  });
});

describe('aggregateStats', () => {
  it('sums per-layer stats', () => {
    const layers = [
      { stats: { paths: 1, points: 3, drawMm: 10, travelMm: 2, seconds: 0.1 } },
      { stats: { paths: 2, points: 5, drawMm: 20, travelMm: 4, seconds: 0.2 } },
    ];
    expect(aggregateStats(layers)).toEqual({
      paths: 3, points: 8, drawMm: 30, travelMm: 6,
      seconds: expect.closeTo(0.3, 9),
    });
  });
  it('returns empty stats for no layers', () => {
    expect(aggregateStats([])).toEqual({ paths: 0, points: 0, drawMm: 0, travelMm: 0, seconds: 0 });
  });
});

describe('buildRouteFromLayers', () => {
  it('emits travel-to-first then draw-segments, cursor carries across layers', () => {
    const plottable = [
      { color: '#a', paths: [{ points: [[0, 0], [10, 0]] }] },
      { color: '#b', paths: [{ points: [[20, 20], [30, 20]] }] },
    ];
    const route = buildRouteFromLayers(plottable);
    expect(route[0]).toEqual({ type: 'travel', from: [0, 0], to: [0, 0], color: '#a' });
    expect(route[1]).toEqual({ type: 'draw', from: [0, 0], to: [10, 0], color: '#a' });
    // travel from layer-a end [10,0] to layer-b start [20,20]
    expect(route[2]).toEqual({ type: 'travel', from: [10, 0], to: [20, 20], color: '#b' });
  });
});

describe('DOMParser guard — fail loudly, never silently use pre-transform', () => {
  it('throws when DOMParser is absent', () => {
    const saved = globalThis.DOMParser;
    delete globalThis.DOMParser;
    try {
      expect(() => buildPlottableLayers([], {}, {})).toThrow(/DOMParser/);
    } finally {
      globalThis.DOMParser = saved;
    }
  });
});

describe('three sites AGREE by construction (the acceptance)', () => {
  // Same design, same canonical extraction → Optimize "before", OverlapWarnings
  // (no-opt), and PlotPreview (no applied opts) all see identical geometry.
  const layers = [
    { id: 'a', visible: true, color: '#cc0000', opacity: 100 },
    { id: 'b', visible: true, color: '#0000cc', opacity: 100 },
  ];
  const instances = { a: fakeInstance(SYMMETRIC_GROUP), b: fakeInstance(SIMPLE_GROUP) };

  it('optimize-before stats == plot-preview aggregate (no opt) == overlap path set', () => {
    const plottable = buildPlottableLayers(layers, instances, {});
    const agg = aggregateStats(plottable);
    // Re-extract independently (as each hook does) — identical numbers.
    const again = aggregateStats(buildPlottableLayers(layers, instances, {}));
    expect(agg).toEqual(again);
    // Overlap check consumes the SAME paths arrays.
    const totalPaths = plottable.reduce((n, l) => n + l.paths.length, 0);
    expect(totalPaths).toBe(agg.paths);
  });
});
