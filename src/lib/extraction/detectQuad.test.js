// detectQuad (S4, issue #53) — auto-propose the ornament plane's quad.
//
// Testing decision (PRD #48): CV modules are pure functions over image inputs,
// so tests feed SYNTHETIC images with known ground truth and assert on the
// returned structure — never on internal steps. This mirrors rectifier.test.js
// (same makeImage helper, same PERSPECTIVE_QUAD ground truth, same
// forward-projection painting trick), so the fixture is a GENUINE perspective
// warp: a checkerboard painted onto PERSPECTIVE_QUAD over a flat background,
// exactly the input the Flatten step must pre-fill from.
//
// The contract under test: detectQuad(image) → { quad, confidence } | null.
//   · a bounded pattern plane → the plane's corners within tolerance
//   · blank / sparse / full-frame-noise → null (indistinguishable from "no
//     detection ran": the stepper keeps its default corners, no badge, locked
//     fail-soft invariant).

import { describe, it, expect } from 'vitest';
import { computeHomography, applyHomography, validateQuad } from './rectifier';
import { detectQuad, MIN_QUAD_CONFIDENCE } from './detectQuad';

// A clearly convex, clearly perspective quad inside a 120×120 image (same
// shape family as rectifier.test.js's PERSPECTIVE_QUAD, scaled up so the
// downsample has room to land on the corners).
const W = 120;
const H = 120;
const PLANE = [
  { x: 24, y: 14 },
  { x: 104, y: 30 },
  { x: 92, y: 100 },
  { x: 16, y: 88 },
];

function makeImage(w, h, paint) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const [r, g, b] = paint(x, y);
      const i = (y * w + x) * 4;
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = 255;
    }
  }
  return { data, width: w, height: h };
}

// Paint an 8×8 checkerboard "onto PLANE" by forward-projecting each source
// pixel into checkerboard space; flat gray everywhere outside the plane. This
// is the same construction rectifier.test.js uses to prove the warp — here it
// is the ground-truth input detectQuad must recover the corners of.
function perspectiveGrid() {
  const CELLS = 8;
  const GRID = 64;
  const Hs = computeHomography(PLANE, [
    { x: 0, y: 0 },
    { x: GRID, y: 0 },
    { x: GRID, y: GRID },
    { x: 0, y: GRID },
  ]);
  return makeImage(W, H, (x, y) => {
    const g = applyHomography(Hs, { x: x + 0.5, y: y + 0.5 });
    if (g.x < 0 || g.x >= GRID || g.y < 0 || g.y >= GRID) return [130, 130, 130];
    const cell = CELLS / GRID;
    const parity = (Math.floor(g.x * cell) + Math.floor(g.y * cell)) % 2;
    const v = parity ? 20 : 235;
    return [v, v, v];
  });
}

// Fractional ground-truth corners for tolerance checks.
const PLANE_FRAC = PLANE.map((p) => ({ x: p.x / W, y: p.y / H }));

describe('detectQuad', () => {
  it('recovers the perspective plane corners within tolerance', () => {
    const res = detectQuad(perspectiveGrid());
    expect(res).not.toBeNull();
    expect(res.quad).toHaveLength(4);
    // Convex, well-formed proposal.
    expect(validateQuad(res.quad).ok).toBe(true);
    // Each detected corner lands near its ground-truth corner. Downsample +
    // anti-aliasing shift the extreme pixel a hair inside the true vertex, so
    // the tolerance is a few % of the image dimension.
    const TOL = 0.06;
    res.quad.forEach((c, i) => {
      expect(Math.abs(c.x - PLANE_FRAC[i].x), `corner ${i} x`).toBeLessThan(TOL);
      expect(Math.abs(c.y - PLANE_FRAC[i].y), `corner ${i} y`).toBeLessThan(TOL);
    });
  });

  it('reports a usable confidence above the floor for a clear plane', () => {
    const res = detectQuad(perspectiveGrid());
    expect(res).not.toBeNull();
    expect(res.confidence).toBeGreaterThanOrEqual(MIN_QUAD_CONFIDENCE);
    expect(res.confidence).toBeLessThanOrEqual(1);
  });

  it('returns null for a blank image (no plane, clean fallback)', () => {
    const blank = makeImage(W, H, () => [200, 200, 200]);
    expect(detectQuad(blank)).toBeNull();
  });

  it('returns null for a sparse-line image (degrades gracefully)', () => {
    // A single thin stroke — far too little evidence for a plane.
    const sparse = makeImage(W, H, (x, y) =>
      Math.abs(y - Math.round(x * 0.4) - 20) <= 1 ? [10, 10, 10] : [240, 240, 240]
    );
    expect(detectQuad(sparse)).toBeNull();
  });

  it('returns null for full-frame random noise (no bounded plane)', () => {
    // Deterministic pseudo-noise: high gradient everywhere → extreme points
    // hug the frame → a full-frame "quad" is no detection at all.
    let seed = 1234567;
    const rnd = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed % 256;
    };
    const noise = makeImage(W, H, () => {
      const v = rnd();
      return [v, v, v];
    });
    expect(detectQuad(noise)).toBeNull();
  });

  it('is pure — the same image yields the same proposal', () => {
    const a = detectQuad(perspectiveGrid());
    const b = detectQuad(perspectiveGrid());
    expect(a.quad).toEqual(b.quad);
    expect(a.confidence).toEqual(b.confidence);
  });

  it('never throws on degenerate input (empty / tiny images)', () => {
    expect(() => detectQuad(makeImage(1, 1, () => [0, 0, 0]))).not.toThrow();
    expect(detectQuad(makeImage(2, 2, () => [0, 0, 0]))).toBeNull();
  });
});
