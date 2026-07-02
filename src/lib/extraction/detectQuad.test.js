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

  // --- adversarial composites (S4 review probes A/C/D) ------------------------
  // Root cause probed by review: extreme points return the convex hull of ALL
  // content, and the original confidence never asked whether that hull was ONE
  // coherent region. Each probe is a composed synthetic on which the detector
  // used to be confidently WRONG (0.85–0.89); the contract is null — a wrong
  // proposal is worse than no proposal (the manual default is the floor).

  // Reviewer probes ran at 240×240; build the composites at that size.
  const PW = 240;
  const PH = 240;

  // Deterministic 6px checker used for "textured" content patches.
  const checkerAt = (x, y) =>
    (((x / 6) | 0) + ((y / 6) | 0)) % 2 ? [20, 20, 20] : [238, 238, 238];

  // Probe A — a real plane on the left PLUS an off-plane clutter blob to the
  // right (the modal "ornament on a wall with decor beside it" photo). The old
  // hull merged plane+clutter at 0.89 confidence.
  function planePlusClutter() {
    const plane = [
      { x: 36, y: 36 },
      { x: 110, y: 48 },
      { x: 106, y: 192 },
      { x: 31, y: 180 },
    ];
    const Hs = computeHomography(plane, [
      { x: 0, y: 0 },
      { x: 64, y: 0 },
      { x: 64, y: 64 },
      { x: 0, y: 64 },
    ]);
    return makeImage(PW, PH, (x, y) => {
      // clutter blob: textured square, inset from the frame (not probe E)
      if (x >= 180 && x < 216 && y >= 96 && y < 144) return checkerAt(x, y);
      const g = applyHomography(Hs, { x: x + 0.5, y: y + 0.5 });
      if (g.x < 0 || g.x >= 64 || g.y < 0 || g.y >= 64) return [130, 130, 130];
      const parity = (Math.floor(g.x / 8) + Math.floor(g.y / 8)) % 2;
      const v = parity ? 20 : 235;
      return [v, v, v];
    });
  }

  // Probe C — two separated content regions; the old hull enclosed both at 0.85.
  function twoRegions() {
    return makeImage(PW, PH, (x, y) => {
      const inA = x >= 24 && x < 84 && y >= 24 && y < 84;
      const inB = x >= 144 && x < 204 && y >= 132 && y < 192;
      return inA || inB ? checkerAt(x, y) : [130, 130, 130];
    });
  }

  // Probe D — an exact axis-symmetric diamond: every pixel of each 45° edge
  // ties the x±y extreme objectives, so scan order collapses TL≈TR into a
  // sliver that validateQuad's relative tolerance admits (old: 0.85 on a
  // degenerate quad whose bottom vertex was never selected).
  function diamond() {
    const cx = PW / 2;
    const cy = PH / 2;
    const r = 72;
    return makeImage(PW, PH, (x, y) =>
      Math.abs(x - cx) + Math.abs(y - cy) <= r ? [20, 20, 20] : [230, 230, 230]
    );
  }

  it('probe A: plane + interior off-plane clutter → null (never a merged hull)', () => {
    expect(detectQuad(planePlusClutter())).toBeNull();
  });

  it('probe C: two separated content regions → null (never a spanning hull)', () => {
    expect(detectQuad(twoRegions())).toBeNull();
  });

  it('probe D: exact axis-symmetric diamond → null (never a degenerate sliver)', () => {
    expect(detectQuad(diamond())).toBeNull();
  });

  // Guard against over-gating: a hollow frame-only motif is ONE coherent
  // region (its bars keep every projection row/column occupied and all four
  // hull edges gradient-backed) — it must still propose the quad around the
  // frame, not be mistaken for split content.
  it('a hollow rectangular frame motif still proposes its bounding quad', () => {
    const frame = makeImage(PW, PH, (x, y) => {
      const inOuter = x >= 36 && x < 204 && y >= 36 && y < 204;
      const inInner = x >= 60 && x < 180 && y >= 60 && y < 180;
      return inOuter && !inInner ? checkerAt(x, y) : [130, 130, 130];
    });
    const res = detectQuad(frame);
    expect(res).not.toBeNull();
    expect(res.confidence).toBeGreaterThanOrEqual(MIN_QUAD_CONFIDENCE);
    // Corners near the OUTER frame corners.
    expect(res.quad[0].x).toBeCloseTo(36 / PW, 1);
    expect(res.quad[2].x).toBeCloseTo(204 / PW, 1);
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
