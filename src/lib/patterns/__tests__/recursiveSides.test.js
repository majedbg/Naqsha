import { describe, it, expect } from 'vitest';
import { buildWarpedPolygon } from '../recursiveSides.js';
import { ScalarField } from '../../fields/ScalarField.js';
import { stackWarpDisplacement } from '../../fields/warp.js';

// The shared recursive reconstruction core — the recursive equivalent of grid's
// shared core. Given a polygon's origin-centered corners plus a warp config, it
// produces the bendable-edge geometry the renderer paints and (later) the
// extractor reconstructs from ONE source of truth. Two modes, gated ONLY on K:
//   K < 3 → vertices-only (corners warp, sides straight)
//   K ≥ 3 → subdivide each side into K nodes, warp ALL nodes, Catmull-Rom curve.

const W = 400;
const H = 400;

// Rightward-rising field: gradient points +x, so warp pushes vertices right.
const risingField = () =>
  ScalarField.fromFunction((u) => 2 * (u - 0.5), { nx: 65, ny: 65 });

// A unit square centered on the origin.
const square = () => [
  { x: -50, y: -50 },
  { x: 50, y: -50 },
  { x: 50, y: 50 },
  { x: -50, y: 50 },
];

function warpSourcesFor(field, amount = 3) {
  return [{ field, channel: 'warp', amount }];
}

describe('buildWarpedPolygon — mode gating (K < 3 is the only gate)', () => {
  it('K = 2 returns vertices mode (corners warp, sides straight)', () => {
    const built = buildWarpedPolygon(square(), {
      warpSources: warpSourcesFor(risingField()),
      canvasW: W,
      canvasH: H,
      warpNodes: 2,
    });
    expect(built.mode).toBe('vertices');
    expect(built.verts).toHaveLength(4);
    expect(built.sides).toBeUndefined();
  });

  it('K = 3 returns bendable mode with one curve per side', () => {
    const built = buildWarpedPolygon(square(), {
      warpSources: warpSourcesFor(risingField()),
      canvasW: W,
      canvasH: H,
      warpNodes: 3,
    });
    expect(built.mode).toBe('bendable');
    // A square has 4 sides → 4 Catmull-Rom curves.
    expect(built.sides).toHaveLength(4);
    for (const side of built.sides) {
      expect(side.start).toBeDefined();
      // K nodes → K-1 bezier segments.
      expect(side.segments).toHaveLength(2);
    }
  });

  it('K < 2 (bad input) still collapses to vertices mode, never throws', () => {
    const built = buildWarpedPolygon(square(), {
      warpSources: warpSourcesFor(risingField()),
      canvasW: W,
      canvasH: H,
      warpNodes: 0,
    });
    expect(built.mode).toBe('vertices');
  });
});

describe('buildWarpedPolygon — vertices mode', () => {
  it('warps each corner by exactly stackWarpDisplacement (D2 sole primitive)', () => {
    const field = risingField();
    const sources = warpSourcesFor(field);
    const verts = square();
    const built = buildWarpedPolygon(verts, {
      warpSources: sources,
      canvasW: W,
      canvasH: H,
      warpNodes: 2,
    });
    verts.forEach((p, i) => {
      const u = (p.x + W / 2) / W;
      const v = (p.y + H / 2) / H;
      const { dx, dy } = stackWarpDisplacement(sources, u, v);
      expect(built.verts[i].x).toBeCloseTo(p.x + dx, 10);
      expect(built.verts[i].y).toBeCloseTo(p.y + dy, 10);
    });
  });

  it('rightward-rising field shifts corners to the right', () => {
    const verts = square();
    const built = buildWarpedPolygon(verts, {
      warpSources: warpSourcesFor(risingField()),
      canvasW: W,
      canvasH: H,
      warpNodes: 2,
    });
    const meanX = built.verts.reduce((s, p) => s + p.x, 0) / built.verts.length;
    const meanX0 = verts.reduce((s, p) => s + p.x, 0) / verts.length;
    expect(meanX).toBeGreaterThan(meanX0 + 3);
  });
});

describe('buildWarpedPolygon — bendable mode', () => {
  it('vertices ALWAYS warp: side endpoints are displaced, never pinned mid-side', () => {
    const field = risingField();
    const sources = warpSourcesFor(field);
    const verts = square();
    const built = buildWarpedPolygon(verts, {
      warpSources: sources,
      canvasW: W,
      canvasH: H,
      warpNodes: 5,
    });
    // Each side's first anchor (its start) is the warped corner, not the raw one.
    built.sides.forEach((side, i) => {
      const corner = verts[i];
      const u = (corner.x + W / 2) / W;
      const v = (corner.y + H / 2) / H;
      const { dx, dy } = stackWarpDisplacement(sources, u, v);
      expect(side.start.x).toBeCloseTo(corner.x + dx, 8);
      expect(side.start.y).toBeCloseTo(corner.y + dy, 8);
    });
  });

  it('adjacent sides share a warped corner (continuous, no seam)', () => {
    const built = buildWarpedPolygon(square(), {
      warpSources: warpSourcesFor(risingField()),
      canvasW: W,
      canvasH: H,
      warpNodes: 4,
    });
    // The end of side i equals the start of side i+1 (the shared corner).
    for (let i = 0; i < built.sides.length; i++) {
      const next = built.sides[(i + 1) % built.sides.length];
      const lastEnd = built.sides[i].segments.at(-1).end;
      expect(lastEnd.x).toBeCloseTo(next.start.x, 6);
      expect(lastEnd.y).toBeCloseTo(next.start.y, 6);
    }
  });

  it('interior nodes are displaced (a straight side becomes bent)', () => {
    // Non-uniform field so an interior node moves off the straight chord.
    const field = ScalarField.fromFunction((u, v) => Math.sin(u * 6) + Math.cos(v * 6), {
      nx: 65,
      ny: 65,
    });
    const built = buildWarpedPolygon(square(), {
      warpSources: warpSourcesFor(field, 3),
      canvasW: W,
      canvasH: H,
      warpNodes: 6,
    });
    // At least one segment control point departs from a perfectly straight line.
    const side = built.sides[0];
    const bentAmount = side.segments.reduce(
      (m, s) => Math.max(m, Math.abs(s.c1.y - side.start.y)),
      0
    );
    expect(bentAmount).toBeGreaterThan(0);
  });
});

describe('buildWarpedPolygon — no-warp identity', () => {
  it('with empty warp sources, vertices mode returns corners unchanged', () => {
    const verts = square();
    const built = buildWarpedPolygon(verts, {
      warpSources: [],
      canvasW: W,
      canvasH: H,
      warpNodes: 2,
    });
    built.verts.forEach((p, i) => {
      expect(p.x).toBe(verts[i].x);
      expect(p.y).toBe(verts[i].y);
    });
  });
});
