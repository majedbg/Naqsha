// LatticeDetector (S5, issue #54) — autocorrelation lattice detection.
//
// Testing decision (PRD #48): CV modules are pure functions over
// image/geometry inputs, so tests feed SYNTHETIC tilings with a known
// translation lattice and assert the recovered basis SPANS THE SAME LATTICE
// (basis equivalence, not vector equality — reduction may return any
// equivalent primitive basis), within pixel tolerance. Non-repeating inputs
// must yield null or low confidence (the single-motif floor path, locked
// decision 8).

import { describe, it, expect } from 'vitest';
import {
  detectLattice,
  classifyLatticeType,
  snapRectangular,
  validateLattice,
  cellBounds,
  pointInCell,
  MIN_LATTICE_CONFIDENCE,
} from './lattice';

// --- synthetic tiling fixtures ----------------------------------------------

/** Deterministic PRNG (mulberry32) so noise tests never flake. */
function prng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function blankImage(w, h, value = 255) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    data[i * 4] = value;
    data[i * 4 + 1] = value;
    data[i * 4 + 2] = value;
    data[i * 4 + 3] = 255;
  }
  return { data, width: w, height: h };
}

function setGray(img, x, y, v) {
  if (x < 0 || y < 0 || x >= img.width || y >= img.height) return;
  const i = (y * img.width + x) * 4;
  img.data[i] = v;
  img.data[i + 1] = v;
  img.data[i + 2] = v;
}

function drawDisc(img, cx, cy, r, v = 0) {
  for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
    for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
      if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) setGray(img, x, y, v);
    }
  }
}

/**
 * A tiling with a known translation lattice: at every lattice point i*t1+j*t2
 * draw an ASYMMETRIC motif (two discs of different sizes) so the only exact
 * self-overlaps are true lattice translations.
 */
function makeTiling(w, h, t1, t2, { noise = 0, seed = 7 } = {}) {
  const img = blankImage(w, h);
  const det = t1[0] * t2[1] - t1[1] * t2[0];
  // Cover the image: invert the basis to bound i/j ranges.
  const corners = [
    [0, 0],
    [w, 0],
    [0, h],
    [w, h],
  ];
  let iMin = Infinity;
  let iMax = -Infinity;
  let jMin = Infinity;
  let jMax = -Infinity;
  for (const [x, y] of corners) {
    const i = (x * t2[1] - y * t2[0]) / det;
    const j = (y * t1[0] - x * t1[1]) / det;
    iMin = Math.min(iMin, Math.floor(i) - 1);
    iMax = Math.max(iMax, Math.ceil(i) + 1);
    jMin = Math.min(jMin, Math.floor(j) - 1);
    jMax = Math.max(jMax, Math.ceil(j) + 1);
  }
  for (let j = jMin; j <= jMax; j++) {
    for (let i = iMin; i <= iMax; i++) {
      const x = i * t1[0] + j * t2[0];
      const y = i * t1[1] + j * t2[1];
      drawDisc(img, x + 5, y + 5, 3, 0);
      drawDisc(img, x + 12, y + 9, 1.6, 60);
    }
  }
  if (noise > 0) {
    const rnd = prng(seed);
    for (let p = 0; p < w * h; p++) {
      const dv = Math.round((rnd() - 0.5) * 2 * noise);
      const i = p * 4;
      const v = Math.max(0, Math.min(255, img.data[i] + dv));
      img.data[i] = v;
      img.data[i + 1] = v;
      img.data[i + 2] = v;
    }
  }
  return img;
}

// --- basis-equivalence assertion ---------------------------------------------

/** v expressed in basis (b1,b2). */
function inBasis(v, b1, b2) {
  const det = b1[0] * b2[1] - b1[1] * b2[0];
  return [(v[0] * b2[1] - v[1] * b2[0]) / det, (v[1] * b1[0] - v[0] * b1[1]) / det];
}

/**
 * The recovered basis spans the same lattice as the truth basis: each truth
 * vector must be a near-integer combination of the recovered pair, and the
 * cell areas must match (no sub- or super-lattice).
 */
function expectSameLattice(rec, truth, { tol = 0.15 } = {}) {
  expect(rec).not.toBeNull();
  const { t1, t2 } = rec;
  const areaRec = Math.abs(t1[0] * t2[1] - t1[1] * t2[0]);
  const areaTruth = Math.abs(
    truth.t1[0] * truth.t2[1] - truth.t1[1] * truth.t2[0]
  );
  expect(areaRec).toBeGreaterThan(areaTruth * 0.8);
  expect(areaRec).toBeLessThan(areaTruth * 1.2);
  for (const v of [truth.t1, truth.t2]) {
    const [a, b] = inBasis(v, t1, t2);
    expect(Math.abs(a - Math.round(a))).toBeLessThan(tol);
    expect(Math.abs(b - Math.round(b))).toBeLessThan(tol);
  }
}

// --- detectLattice ------------------------------------------------------------

describe('detectLattice', () => {
  it('recovers a square lattice', () => {
    const truth = { t1: [24, 0], t2: [0, 24] };
    const img = makeTiling(144, 144, truth.t1, truth.t2);
    const res = detectLattice(img);
    expectSameLattice(res, truth);
    expect(res.confidence).toBeGreaterThan(0.5);
    expect(res.type).toBe('square');
  });

  it('recovers a rectangular lattice', () => {
    const truth = { t1: [20, 0], t2: [0, 32] };
    const img = makeTiling(160, 160, truth.t1, truth.t2);
    const res = detectLattice(img);
    expectSameLattice(res, truth);
    expect(res.type).toBe('rect');
  });

  it('recovers an oblique lattice', () => {
    const truth = { t1: [26, 0], t2: [9, 24] };
    const img = makeTiling(156, 144, truth.t1, truth.t2);
    const res = detectLattice(img);
    expectSameLattice(res, truth);
  });

  it('survives noise', () => {
    const truth = { t1: [24, 0], t2: [0, 24] };
    const img = makeTiling(144, 144, truth.t1, truth.t2, { noise: 24 });
    const res = detectLattice(img);
    expectSameLattice(res, truth);
    expect(res.confidence).toBeGreaterThan(MIN_LATTICE_CONFIDENCE);
  });

  it('recovers the lattice of a large image through downsampling', () => {
    const truth = { t1: [64, 0], t2: [0, 64] };
    const img = makeTiling(512, 512, truth.t1, truth.t2);
    const res = detectLattice(img);
    // Downsampling quantizes peaks — allow a looser pixel tolerance via the
    // integer-combination tolerance.
    expectSameLattice(res, truth, { tol: 0.2 });
  });

  it('returns null or low confidence for random noise (non-repeating)', () => {
    const img = blankImage(128, 128);
    const rnd = prng(99);
    for (let p = 0; p < 128 * 128; p++) {
      setGray(img, p % 128, Math.floor(p / 128), Math.floor(rnd() * 256));
    }
    const res = detectLattice(img);
    if (res) expect(res.confidence).toBeLessThan(MIN_LATTICE_CONFIDENCE);
  });

  it('returns null or low confidence for a single motif (non-repeating)', () => {
    const img = blankImage(128, 128);
    drawDisc(img, 64, 64, 20, 0);
    const res = detectLattice(img);
    if (res) expect(res.confidence).toBeLessThan(MIN_LATTICE_CONFIDENCE);
  });

  it('returns null or low confidence for a smooth gradient (non-repeating)', () => {
    const img = blankImage(128, 128);
    for (let y = 0; y < 128; y++) {
      for (let x = 0; x < 128; x++) setGray(img, x, y, Math.round(x + y));
    }
    const res = detectLattice(img);
    if (res) expect(res.confidence).toBeLessThan(MIN_LATTICE_CONFIDENCE);
  });

  it('returns null for images too small to carry a repeat', () => {
    expect(detectLattice(blankImage(12, 12))).toBeNull();
  });

  it('reports the cell as the bounding box of the basis parallelogram', () => {
    const truth = { t1: [24, 0], t2: [0, 24] };
    const img = makeTiling(144, 144, truth.t1, truth.t2);
    const res = detectLattice(img);
    expect(res.cell.width).toBeGreaterThan(20);
    expect(res.cell.width).toBeLessThan(28);
    expect(res.cell.height).toBeGreaterThan(20);
    expect(res.cell.height).toBeLessThan(28);
  });
});

// --- classifyLatticeType --------------------------------------------------------

describe('classifyLatticeType', () => {
  it('classifies square / rect / hex / oblique', () => {
    expect(classifyLatticeType([24, 0], [0, 24])).toBe('square');
    expect(classifyLatticeType([20, 0], [0, 32])).toBe('rect');
    expect(classifyLatticeType([24, 0], [12, 12 * Math.sqrt(3)])).toBe('hex');
    expect(classifyLatticeType([24, 0], [8, 16])).toBe('oblique');
  });
});

// --- snapRectangular --------------------------------------------------------------

describe('snapRectangular', () => {
  it('snaps a near-axis-aligned basis to an integer cell', () => {
    expect(snapRectangular({ t1: [24.3, 0.8], t2: [-0.6, 31.7] })).toEqual({
      width: 24,
      height: 32,
    });
  });

  it('accepts vectors in either order', () => {
    expect(snapRectangular({ t1: [0.4, 30.2], t2: [19.9, -0.7] })).toEqual({
      width: 20,
      height: 30,
    });
  });

  it('rejects an oblique basis', () => {
    expect(snapRectangular({ t1: [24, 0], t2: [10, 22] })).toBeNull();
  });

  it('rejects a degenerate basis', () => {
    expect(snapRectangular({ t1: [24, 0], t2: [24.2, 0.4] })).toBeNull();
    expect(snapRectangular({ t1: [0.4, 0.2], t2: [0.1, 0.5] })).toBeNull();
  });
});

// --- cellBounds / pointInCell (S5b, issue #66 — oblique parallelogram crop) ---

describe('cellBounds', () => {
  it('bounds an axis-aligned cell at the origin', () => {
    expect(cellBounds([20, 0], [0, 30])).toEqual({
      minX: 0, minY: 0, maxX: 20, maxY: 30, width: 20, height: 30,
    });
  });

  it('captures the negative extent of a sheared cell (t2 leans up-left)', () => {
    // t2 = [-10, 24]: the parallelogram reaches x = -10 (min corner), so a
    // bbox crop must offset by +10 to sit at a non-negative raster origin.
    const b = cellBounds([26, 0], [-10, 24]);
    expect(b.minX).toBe(-10);
    expect(b.minY).toBe(0);
    expect(b.maxX).toBe(26);
    expect(b.maxY).toBe(24);
    expect(b.width).toBe(36);
    expect(b.height).toBe(24);
  });
});

describe('pointInCell', () => {
  const t1 = [26, 0];
  const t2 = [9, 24];

  it('includes the origin corner and excludes the far corners (half-open)', () => {
    expect(pointInCell(0, 0, t1, t2)).toBe(true); // a=0,b=0
    expect(pointInCell(t1[0], t1[1], t1, t2)).toBe(false); // a=1 → neighbour
    expect(pointInCell(t2[0], t2[1], t1, t2)).toBe(false); // b=1 → neighbour
    expect(pointInCell(t1[0] + t2[0], t1[1] + t2[1], t1, t2)).toBe(false);
  });

  it('includes an interior point and excludes a bbox corner outside the shear', () => {
    // Centroid a=b=0.5 → inside.
    expect(pointInCell((t1[0] + t2[0]) / 2, (t1[1] + t2[1]) / 2, t1, t2)).toBe(true);
    // Top-right of the bbox (x=t1x+t2x, y=0) is OUTSIDE the leaning cell.
    expect(pointInCell(t1[0] + t2[0] - 1, 0.5, t1, t2)).toBe(false);
  });

  it('is false for a degenerate (collinear) basis', () => {
    expect(pointInCell(5, 0, [10, 0], [20, 0])).toBe(false);
  });
});

// --- validateLattice (round-trip safety, adversarial rows) ---------------------------

describe('validateLattice', () => {
  const good = {
    t1: [24, 0],
    t2: [0, 32],
    cell: { width: 24, height: 32 },
    type: 'rect',
    confidence: 0.8,
  };

  it('passes a well-formed lattice through normalized', () => {
    const v = validateLattice(good);
    expect(v).toEqual(good);
  });

  it('returns null for null/undefined (single-motif floor)', () => {
    expect(validateLattice(null)).toBeNull();
    expect(validateLattice(undefined)).toBeNull();
  });

  it.each([
    ['NaN component', { ...good, t1: [NaN, 0] }],
    ['Infinity component', { ...good, t2: [0, Infinity] }],
    ['string injection in vector', { ...good, t1: ['<script>', 0] }],
    ['missing t2', { ...good, t2: undefined }],
    ['collinear basis', { ...good, t2: [48, 0] }],
    ['absurdly large vector', { ...good, t1: [1e7, 0] }],
    ['tiny degenerate vector', { ...good, t1: [0.01, 0] }],
    ['bad cell width', { ...good, cell: { width: -5, height: 32 } }],
    ['NaN cell height', { ...good, cell: { width: 24, height: NaN } }],
    ['unknown type', { ...good, type: 'evil" onload="x' }],
    ['confidence out of range', { ...good, confidence: 7 }],
    ['confidence NaN', { ...good, confidence: NaN }],
  ])('throws on %s', (_label, bad) => {
    expect(() => validateLattice(bad)).toThrow();
  });
});
