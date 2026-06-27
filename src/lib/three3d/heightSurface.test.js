import { describe, it, expect } from 'vitest';
import { ScalarField } from '../fields/ScalarField.js';
import {
  buildHeightmap,
  boundsForRelief,
  reliefColor,
  defaultExaggeration,
  exaggerationMax,
  clampExaggeration,
  SEGMENT_CAP,
  EXAG_MIN,
} from './heightSurface.js';

// A field whose value == u, so sampleSigned(u,v) == u (min 0, max 1 → maxAbs 1).
const rampU = ScalarField.fromFunction((u) => u, { nx: 9, ny: 9 });
// Same shape scaled ×3 — normalization by maxAbs must make the relief identical.
const rampU3 = ScalarField.fromFunction((u) => 3 * u, { nx: 9, ny: 9 });
// A signed field spanning [-1,1] so the diverging colors exercise both lobes.
const signedField = ScalarField.fromFunction((u) => 2 * u - 1, { nx: 5, ny: 5 });

describe('reliefColor', () => {
  it('returns an [r,g,b,a] quad normalized to 0..1', () => {
    const c = reliefColor(0.5);
    expect(c).toHaveLength(4);
    for (const ch of c) {
      expect(ch).toBeGreaterThanOrEqual(0);
      expect(ch).toBeLessThanOrEqual(1);
    }
  });

  it('keeps the colormap alpha: neutral ~0.12 (recedes), saturated → ~1 (solid)', () => {
    expect(reliefColor(0)[3]).toBeCloseTo(0.12, 2); // user ask: white/neutral ≈ 10% opaque
    expect(reliefColor(1)[3]).toBeCloseTo(1, 2);
    expect(reliefColor(-1)[3]).toBeCloseTo(1, 2);
    // monotonic: more saturation → more opaque
    expect(reliefColor(0.8)[3]).toBeGreaterThan(reliefColor(0.2)[3]);
  });

  it('maps 0 to the neutral parchment mid anchor', () => {
    const c = reliefColor(0);
    expect(c[0]).toBeCloseTo(244 / 255, 5);
    expect(c[1]).toBeCloseTo(238 / 255, 5);
    expect(c[2]).toBeCloseTo(224 / 255, 5);
  });

  it('maps positive (attract) to a WARM color — red dominates blue', () => {
    const [r, , b] = reliefColor(1);
    expect(r).toBeGreaterThan(b);
  });

  it('maps negative (repel) to a COOL color — blue dominates red', () => {
    const [r, , b] = reliefColor(-1);
    expect(b).toBeGreaterThan(r);
  });

  it('clamps inputs beyond ±1', () => {
    expect(reliefColor(5)).toEqual(reliefColor(1));
    expect(reliefColor(-5)).toEqual(reliefColor(-1));
  });
});

describe('exaggeration math', () => {
  it('defaults to ~panel-size / 4 (PRD D10)', () => {
    expect(defaultExaggeration(200)).toBeCloseTo(50, 5);
    expect(defaultExaggeration(160)).toBeCloseTo(40, 5);
  });

  it('falls back to a sane default for non-positive / non-finite size', () => {
    expect(defaultExaggeration(0)).toBeGreaterThan(0);
    expect(defaultExaggeration(NaN)).toBeGreaterThan(0);
    expect(defaultExaggeration(undefined)).toBeGreaterThan(0);
  });

  it('slider max is the full panel size (default sits at 25%)', () => {
    expect(exaggerationMax(200)).toBeCloseTo(200, 5);
    expect(defaultExaggeration(200)).toBeLessThan(exaggerationMax(200));
  });

  it('clamps a value into [0, max]', () => {
    expect(clampExaggeration(999, 200)).toBeCloseTo(200, 5);
    expect(clampExaggeration(-5, 200)).toBe(EXAG_MIN);
    expect(clampExaggeration(NaN, 200)).toBe(EXAG_MIN);
    expect(clampExaggeration(30, 200)).toBeCloseTo(30, 5);
  });
});

describe('buildHeightmap', () => {
  it('returns null for a missing/invalid field', () => {
    expect(buildHeightmap({ field: null })).toBeNull();
    expect(buildHeightmap({ field: {} })).toBeNull();
  });

  it('builds (nx)x(ny) vertices at the field grid resolution (segments = points-1)', () => {
    const m = buildHeightmap({ field: rampU, exaggeration: 10, width: 100, height: 100 });
    // 9 sample points per axis → 8 segments → 9 vertices per axis.
    expect(m.segX).toBe(8);
    expect(m.segY).toBe(8);
    expect(m.cols).toBe(9);
    expect(m.rows).toBe(9);
    expect(m.positions).toHaveLength(9 * 9 * 3);
    expect(m.colors).toHaveLength(9 * 9 * 4); // RGBA per vertex
    // Two triangles per cell, 3 indices each.
    expect(m.indices).toHaveLength(8 * 8 * 6);
  });

  it('caps segments at SEGMENT_CAP (256²) for a high-res field', () => {
    const big = ScalarField.fromFunction((u) => u, { nx: 400, ny: 400 });
    const m = buildHeightmap({ field: big, exaggeration: 1, width: 10, height: 10 });
    expect(m.segX).toBe(SEGMENT_CAP);
    expect(m.segY).toBe(SEGMENT_CAP);
    expect(m.cols).toBe(SEGMENT_CAP + 1);
  });

  it('maps elevation = field.sampleSigned(u,v) × exaggeration on the up (Y) axis', () => {
    const exag = 10;
    const m = buildHeightmap({ field: rampU, exaggeration: exag, width: 100, height: 100 });
    const at = (i, j) => {
      const idx = (j * m.cols + i) * 3;
      return { x: m.positions[idx], y: m.positions[idx + 1], z: m.positions[idx + 2] };
    };
    // i=0 → u=0 → sampleSigned 0 → flat.
    expect(at(0, 0).y).toBeCloseTo(0, 5);
    // i=last → u=1 → sampleSigned 1 → y == exaggeration.
    expect(at(m.cols - 1, 0).y).toBeCloseTo(exag, 5);
    // Plane spans width/height centered on the origin (x,z); height is on Y only.
    expect(at(0, 0).x).toBeCloseTo(-50, 5);
    expect(at(m.cols - 1, 0).x).toBeCloseTo(50, 5);
    expect(at(0, 0).z).toBeCloseTo(-50, 5);
    expect(at(0, m.rows - 1).z).toBeCloseTo(50, 5);
  });

  it('normalizes by maxAbs: two fields differing only by scale give an IDENTICAL relief', () => {
    const a = buildHeightmap({ field: rampU, exaggeration: 10, width: 100, height: 100 });
    const b = buildHeightmap({ field: rampU3, exaggeration: 10, width: 100, height: 100 });
    expect(Array.from(b.positions)).toEqual(Array.from(a.positions));
    expect(Array.from(b.colors)).toEqual(Array.from(a.colors));
  });

  it('colors each vertex by the diverging colormap of its signed value', () => {
    const m = buildHeightmap({ field: signedField, exaggeration: 5, width: 10, height: 10 });
    const col = (i, j) => {
      const idx = (j * m.cols + i) * 4;
      return [m.colors[idx], m.colors[idx + 1], m.colors[idx + 2]];
    };
    // i=0 → u=0 → signed −1 → cool (blue > red).
    expect(col(0, 0)[2]).toBeGreaterThan(col(0, 0)[0]);
    // i=last → u=1 → signed +1 → warm (red > blue).
    const last = col(m.cols - 1, 0);
    expect(last[0]).toBeGreaterThan(last[2]);
  });
});

describe('boundsForRelief', () => {
  it('returns a centered box spanning width/depth with y = ±exaggeration', () => {
    const box = boundsForRelief({ width: 100, height: 80, exaggeration: 12 });
    expect(box.min).toEqual([-50, -12, -40]);
    expect(box.max).toEqual([50, 12, 40]);
  });

  it('stays non-degenerate at zero exaggeration (flat relief still frames)', () => {
    const box = boundsForRelief({ width: 100, height: 100, exaggeration: 0 });
    expect(box.min[1]).toBeCloseTo(0, 10);
    expect(box.max[1]).toBeCloseTo(0, 10);
    expect(box.max[0]).toBeGreaterThan(box.min[0]);
  });
});
