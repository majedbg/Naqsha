// Rectifier (S3, issue #52) — 4-point homography + perspective warp.
//
// Testing decision (PRD #48): CV modules are pure functions over
// image/geometry inputs, so tests feed SYNTHETIC inputs with known ground
// truth and assert on returned structure: known quads → known homographies
// (corner mapping, round-trips), a perspective-painted checkerboard that must
// come back straight, an axis-aligned quad that must degenerate to an exact
// crop, and degenerate/concave/bowtie quads that must be rejected gracefully.

import { describe, it, expect } from 'vitest';
import {
  computeHomography,
  applyHomography,
  validateQuad,
  rectifiedSize,
  rectify,
} from './rectifier';

const rectCorners = (w, h) => [
  { x: 0, y: 0 },
  { x: w, y: 0 },
  { x: w, y: h },
  { x: 0, y: h },
];

// A clearly convex, clearly perspective quad inside a 100×100 image.
const PERSPECTIVE_QUAD = [
  { x: 20, y: 10 },
  { x: 90, y: 25 },
  { x: 80, y: 85 },
  { x: 10, y: 75 },
];

describe('computeHomography', () => {
  it('maps the unit square onto itself with the identity', () => {
    const sq = rectCorners(1, 1);
    const H = computeHomography(sq, sq);
    expect(H[0]).toBeCloseTo(1, 9);
    expect(H[4]).toBeCloseTo(1, 9);
    expect(H[8]).toBe(1);
    [1, 2, 3, 5, 6, 7].forEach((i) => expect(H[i]).toBeCloseTo(0, 9));
  });

  it('recovers a pure translation + scale as an affine matrix', () => {
    // unit square → rect at (10, 20) sized 40×60
    const H = computeHomography(rectCorners(1, 1), [
      { x: 10, y: 20 },
      { x: 50, y: 20 },
      { x: 50, y: 80 },
      { x: 10, y: 80 },
    ]);
    expect(H[0]).toBeCloseTo(40, 6); // scale x
    expect(H[2]).toBeCloseTo(10, 6); // translate x
    expect(H[4]).toBeCloseTo(60, 6); // scale y
    expect(H[5]).toBeCloseTo(20, 6); // translate y
    expect(H[6]).toBeCloseTo(0, 9); // no perspective terms
    expect(H[7]).toBeCloseTo(0, 9);
  });

  it('maps every source corner exactly onto its destination corner', () => {
    const dst = rectCorners(64, 48);
    const H = computeHomography(PERSPECTIVE_QUAD, dst);
    PERSPECTIVE_QUAD.forEach((p, i) => {
      const m = applyHomography(H, p);
      expect(m.x).toBeCloseTo(dst[i].x, 6);
      expect(m.y).toBeCloseTo(dst[i].y, 6);
    });
  });

  it('round-trips interior points through H then H⁻¹', () => {
    const dst = rectCorners(64, 48);
    const H = computeHomography(PERSPECTIVE_QUAD, dst);
    const Hinv = computeHomography(dst, PERSPECTIVE_QUAD);
    for (const p of [{ x: 40, y: 40 }, { x: 25, y: 60 }, { x: 70, y: 30 }]) {
      const back = applyHomography(Hinv, applyHomography(H, p));
      expect(back.x).toBeCloseTo(p.x, 6);
      expect(back.y).toBeCloseTo(p.y, 6);
    }
  });

  it('throws on collinear corners instead of returning garbage', () => {
    const collinear = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 20, y: 0 },
      { x: 30, y: 0 },
    ];
    expect(() => computeHomography(collinear, rectCorners(10, 10))).toThrow(/degenerate/i);
  });
});

describe('validateQuad', () => {
  it('accepts a convex quad', () => {
    expect(validateQuad(PERSPECTIVE_QUAD).ok).toBe(true);
  });

  it('accepts a fractional-coordinate quad (UI space)', () => {
    expect(
      validateQuad([
        { x: 0.1, y: 0.1 },
        { x: 0.9, y: 0.15 },
        { x: 0.85, y: 0.9 },
        { x: 0.12, y: 0.8 },
      ]).ok
    ).toBe(true);
  });

  it('rejects a concave quad', () => {
    const res = validateQuad([
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 40, y: 40 }, // dented inward
      { x: 0, y: 100 },
    ]);
    expect(res.ok).toBe(false);
    expect(res.reason).toMatch(/convex/i);
  });

  it('rejects a self-intersecting (bowtie) quad', () => {
    const res = validateQuad([
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 0, y: 100 }, // crossed: BR and BL swapped
      { x: 100, y: 100 },
    ]);
    expect(res.ok).toBe(false);
    expect(res.reason).toMatch(/convex/i);
  });

  it('rejects collinear / zero-area quads', () => {
    const res = validateQuad([
      { x: 0, y: 0 },
      { x: 50, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 0.000001 },
    ]);
    expect(res.ok).toBe(false);
    expect(res.reason).toMatch(/degenerate/i);
  });

  it('rejects malformed input (wrong count, non-finite coords)', () => {
    expect(validateQuad([{ x: 0, y: 0 }]).ok).toBe(false);
    expect(validateQuad(null).ok).toBe(false);
    expect(
      validateQuad([{ x: 0, y: 0 }, { x: NaN, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }]).ok
    ).toBe(false);
  });
});

describe('rectifiedSize', () => {
  it('uses the longer of each opposing edge pair', () => {
    // top edge 80 long, bottom edge 60; left 50, right 70.
    const size = rectifiedSize([
      { x: 0, y: 0 },
      { x: 80, y: 0 },
      { x: 70, y: 70 },
      { x: 10, y: 50 },
    ]);
    expect(size.width).toBeGreaterThanOrEqual(80);
    expect(size.height).toBeGreaterThanOrEqual(70);
  });

  it('caps the longest side at maxDim, preserving aspect', () => {
    const size = rectifiedSize(rectCorners(4000, 2000), 1024);
    expect(size.width).toBe(1024);
    expect(size.height).toBe(512);
  });
});

// --- warp correctness on synthetic images -----------------------------------

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

const px = (img, x, y) => {
  const i = (y * img.width + x) * 4;
  return [img.data[i], img.data[i + 1], img.data[i + 2]];
};

describe('rectify', () => {
  it('degenerates to an exact crop for an axis-aligned quad', () => {
    // Deterministic per-pixel colors so any resampling shift is visible.
    const image = makeImage(60, 60, (x, y) => [x * 4, y * 4, (x + y) % 256]);
    const quad = [
      { x: 10, y: 10 },
      { x: 50, y: 10 },
      { x: 50, y: 40 },
      { x: 10, y: 40 },
    ];
    const { rectified } = rectify(image, quad);
    expect(rectified.width).toBe(40);
    expect(rectified.height).toBe(30);
    for (const [x, y] of [[0, 0], [39, 29], [20, 15], [7, 23]]) {
      expect(px(rectified, x, y)).toEqual(px(image, 10 + x, 10 + y));
    }
  });

  it('straightens a perspective-painted checkerboard (known cell parity at cell centers)', () => {
    // Paint an 8×8 checkerboard "onto the quad" by forward-projecting each
    // source pixel into checkerboard space, then ask rectify to undo it.
    const CELLS = 8;
    const GRID = 64; // checkerboard space is GRID×GRID
    const Hs = computeHomography(PERSPECTIVE_QUAD, rectCorners(GRID, GRID)); // src → grid
    const image = makeImage(100, 100, (x, y) => {
      const g = applyHomography(Hs, { x: x + 0.5, y: y + 0.5 });
      if (g.x < 0 || g.x >= GRID || g.y < 0 || g.y >= GRID) return [128, 128, 128];
      const cell = CELLS / GRID;
      const parity = (Math.floor(g.x * cell) + Math.floor(g.y * cell)) % 2;
      const v = parity ? 0 : 255;
      return [v, v, v];
    });

    const { rectified } = rectify(image, PERSPECTIVE_QUAD);
    const cellW = rectified.width / CELLS;
    const cellH = rectified.height / CELLS;
    for (let cy = 0; cy < CELLS; cy++) {
      for (let cx = 0; cx < CELLS; cx++) {
        const [r] = px(
          rectified,
          Math.round((cx + 0.5) * cellW),
          Math.round((cy + 0.5) * cellH)
        );
        const expected = (cx + cy) % 2 ? 0 : 255;
        // Bilinear softening allowed; parity must be unambiguous.
        expect(Math.abs(r - expected), `cell ${cx},${cy}`).toBeLessThan(64);
      }
    }
  });

  it('returns the src→rectified homography alongside the raster', () => {
    const image = makeImage(100, 100, () => [200, 200, 200]);
    const { rectified, homography } = rectify(image, PERSPECTIVE_QUAD);
    // The quad's TL corner must land at the rectified origin, BR at (w, h).
    const tl = applyHomography(homography, PERSPECTIVE_QUAD[0]);
    const br = applyHomography(homography, PERSPECTIVE_QUAD[2]);
    expect(tl.x).toBeCloseTo(0, 6);
    expect(tl.y).toBeCloseTo(0, 6);
    expect(br.x).toBeCloseTo(rectified.width, 6);
    expect(br.y).toBeCloseTo(rectified.height, 6);
  });

  it('respects the maxDim cap', () => {
    const image = makeImage(50, 50, () => [0, 0, 0]);
    const { rectified } = rectify(image, rectCorners(50, 50), { maxDim: 16 });
    expect(Math.max(rectified.width, rectified.height)).toBe(16);
  });

  it('rejects a concave quad gracefully', () => {
    const image = makeImage(20, 20, () => [0, 0, 0]);
    const concave = [
      { x: 0, y: 0 },
      { x: 19, y: 0 },
      { x: 5, y: 5 },
      { x: 0, y: 19 },
    ];
    expect(() => rectify(image, concave)).toThrow(/cannot flatten/i);
  });
});
