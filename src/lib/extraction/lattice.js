// LatticeDetector — translation-lattice detection for repeating ornament
// (S5, issue #54; PRD #48 "CV/geometry core": `LatticeDetector.detect(
// rectified) → { t1, t2, cell, type, confidence }`).
//
// Algorithm (research appendix C — the FFT/autocorrelation seed):
//   1. grayscale + integer box-downsample (max dim ≤ 256) so the FFT stays
//      small and O(n log n) regardless of photo size;
//   2. UNBIASED normalized autocorrelation via zero-padded FFT: the raw
//      autocorrelation of the mean-subtracted image is divided by the
//      autocorrelation of the support mask (per-lag overlap count) times the
//      variance, so every lag reads as a true correlation coefficient in
//      [-1, 1] and border falloff never masquerades as structure;
//   3. peak-pick strict 8-neighborhood local maxima in the half-plane
//      (autocorrelation is centrosymmetric), above a correlation threshold
//      and outside a minimum-lag guard ring;
//   4. basis selection: shortest peak + shortest non-collinear peak, then
//      Lagrange–Gauss reduction to a primitive (shortest) basis;
//   5. confidence = mean correlation at the reduced basis translations
//      {t1, t2, t1+t2, t1−t2} — a verification pass, not a peak-height echo.
//
// Pure JS + typed arrays (the FFT is ~40 lines — no dependency worth pinning
// at this size). Everything is worker-agnostic: ImageData-shaped objects in,
// plain serializable objects out.
//
// SEAM (deferred, PRD appendix C): Park et al. TPAMI-2009 deformable-lattice
// refinement (mean-shift belief propagation) slots in AFTER step 5 — it takes
// this rigid seed and relaxes per-cell deformation. `detectLattice` returns
// the rigid v1 result; a future `refineLattice(image, lattice)` can wrap it
// without changing any caller.

const MAX_DIM = 256; // downsample budget for the FFT grid
const MIN_IMAGE_DIM = 16; // below this a repeat cannot be evidenced
const MIN_LAG = 4; // guard ring: lags shorter than this are self-similarity
const MIN_OVERLAP_FRAC = 0.2; // lag support: require ≥20% sample overlap
const PEAK_THRESHOLD = 0.35; // minimum correlation for a candidate peak
const MIN_SIN = 0.25; // ~14.5°: minimum angle between basis candidates

/** Stage/UI threshold: below this the single-motif floor wins (decision 8). */
export const MIN_LATTICE_CONFIDENCE = 0.4;

export const LATTICE_TYPES = ['square', 'rect', 'hex', 'oblique'];

// --- FFT --------------------------------------------------------------------

function nextPow2(n) {
  let p = 1;
  while (p < n) p <<= 1;
  return p;
}

/** In-place iterative radix-2 complex FFT. Length must be a power of two. */
function fft(re, im, invert) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = ((2 * Math.PI) / len) * (invert ? 1 : -1);
    const wRe = Math.cos(ang);
    const wIm = Math.sin(ang);
    const half = len >> 1;
    for (let i = 0; i < n; i += len) {
      let curRe = 1;
      let curIm = 0;
      for (let k = 0; k < half; k++) {
        const a = i + k;
        const b = a + half;
        const vRe = re[b] * curRe - im[b] * curIm;
        const vIm = re[b] * curIm + im[b] * curRe;
        re[b] = re[a] - vRe;
        im[b] = im[a] - vIm;
        re[a] += vRe;
        im[a] += vIm;
        const nRe = curRe * wRe - curIm * wIm;
        curIm = curRe * wIm + curIm * wRe;
        curRe = nRe;
      }
    }
  }
  if (invert) {
    for (let i = 0; i < n; i++) {
      re[i] /= n;
      im[i] /= n;
    }
  }
}

/** 2D FFT over a px×py row-major grid (rows, then columns). */
function fft2d(re, im, px, py, invert) {
  const rowRe = new Float64Array(px);
  const rowIm = new Float64Array(px);
  for (let y = 0; y < py; y++) {
    const off = y * px;
    rowRe.set(re.subarray(off, off + px));
    rowIm.set(im.subarray(off, off + px));
    fft(rowRe, rowIm, invert);
    re.set(rowRe, off);
    im.set(rowIm, off);
  }
  const colRe = new Float64Array(py);
  const colIm = new Float64Array(py);
  for (let x = 0; x < px; x++) {
    for (let y = 0; y < py; y++) {
      colRe[y] = re[y * px + x];
      colIm[y] = im[y * px + x];
    }
    fft(colRe, colIm, invert);
    for (let y = 0; y < py; y++) {
      re[y * px + x] = colRe[y];
      im[y * px + x] = colIm[y];
    }
  }
}

/** Circular autocorrelation of a zero-padded real grid via |FFT|². */
function autocorrGrid(values, px, py) {
  const re = new Float64Array(values);
  const im = new Float64Array(px * py);
  fft2d(re, im, px, py, false);
  for (let i = 0; i < re.length; i++) {
    re[i] = re[i] * re[i] + im[i] * im[i];
    im[i] = 0;
  }
  fft2d(re, im, px, py, true);
  return re;
}

// --- grayscale + downsample ---------------------------------------------------

/**
 * Luma + integer box-downsample. Returns { gray: Float64Array, w, h, scale }
 * with both dims ≤ MAX_DIM and `scale` the integer factor to map detected
 * vectors back to source pixels.
 */
function toGray(image, maxDim = MAX_DIM) {
  const { data, width, height } = image;
  const scale = Math.max(1, Math.ceil(Math.max(width, height) / maxDim));
  const w = Math.floor(width / scale);
  const h = Math.floor(height / scale);
  const gray = new Float64Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sum = 0;
      for (let dy = 0; dy < scale; dy++) {
        for (let dx = 0; dx < scale; dx++) {
          const i = ((y * scale + dy) * width + (x * scale + dx)) * 4;
          sum += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
        }
      }
      gray[y * w + x] = sum / (scale * scale);
    }
  }
  return { gray, w, h, scale };
}

// --- basis geometry ------------------------------------------------------------

const cross = (a, b) => a[0] * b[1] - a[1] * b[0];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1];
const len = (a) => Math.hypot(a[0], a[1]);

/**
 * Lagrange–Gauss reduction: shortest equivalent basis for the lattice spanned
 * by (a, b). Standard 2D lattice reduction; terminates because |b| strictly
 * decreases.
 */
function reduceBasis(a, b) {
  let u = [...a];
  let v = [...b];
  if (len(v) < len(u)) [u, v] = [v, u];
  for (;;) {
    const k = Math.round(dot(u, v) / dot(u, u));
    const w = [v[0] - k * u[0], v[1] - k * u[1]];
    if (len(w) >= len(u) - 1e-9) return [u, w[0] === 0 && w[1] === 0 ? v : w];
    v = u;
    u = w;
  }
}

/** Sign-normalize so results are stable: each vector points "rightward/down". */
function normalizeSigns(v) {
  if (v[0] < 0 || (v[0] === 0 && v[1] < 0)) return [-v[0], -v[1]];
  return v;
}

/** Axis-aligned bounding box of the cell parallelogram {0, t1, t2, t1+t2}. */
function cellBBox(t1, t2) {
  const xs = [0, t1[0], t2[0], t1[0] + t2[0]];
  const ys = [0, t1[1], t2[1], t1[1] + t2[1]];
  return {
    width: Math.max(...xs) - Math.min(...xs),
    height: Math.max(...ys) - Math.min(...ys),
  };
}

/** square | rect | hex | oblique from basis lengths + angle. */
export function classifyLatticeType(t1, t2) {
  const l1 = len(t1);
  const l2 = len(t2);
  if (!l1 || !l2) return 'oblique';
  const cosA = Math.abs(dot(t1, t2) / (l1 * l2));
  const angle = (Math.acos(Math.min(1, cosA)) * 180) / Math.PI; // 0..90
  const equal = Math.abs(l1 - l2) / Math.max(l1, l2) < 0.08;
  if (angle > 82) return equal ? 'square' : 'rect';
  if (equal && Math.abs(angle - 60) < 8) return 'hex';
  return 'oblique';
}

/**
 * Near-axis-aligned basis → integer {width, height} cell, else null. The v1
 * tiling stage crops an axis-aligned repeat cell, so it only engages when the
 * detected basis genuinely IS rectangular (within tolDeg); oblique lattices
 * fall to the single-motif floor (SEAM: parallelogram cell clipping).
 */
export function snapRectangular({ t1, t2 }, tolDeg = 12) {
  const tol = Math.sin((tolDeg * Math.PI) / 180);
  const axisOf = (v) => {
    const l = len(v);
    if (l < 2) return null;
    if (Math.abs(v[1]) / l <= tol) return { axis: 'x', size: Math.abs(v[0]) };
    if (Math.abs(v[0]) / l <= tol) return { axis: 'y', size: Math.abs(v[1]) };
    return null;
  };
  const a = axisOf(t1);
  const b = axisOf(t2);
  if (!a || !b || a.axis === b.axis) return null;
  const width = Math.round(a.axis === 'x' ? a.size : b.size);
  const height = Math.round(a.axis === 'y' ? a.size : b.size);
  if (width < 2 || height < 2) return null;
  return { width, height };
}

// --- validation (round-trip safety) ---------------------------------------------
//
// Same discipline as extractedPattern.js: stored rows are attacker-writable in
// principle, so anything deserialized is validated against a strict shape
// before it can reach markup surfaces or drive tiling loops. Violations throw;
// loaders treat that as a corrupt row.

const MAX_COMPONENT = 1e5;
const MIN_VECTOR_LEN = 1;

function finiteNum(n) {
  return typeof n === 'number' && Number.isFinite(n);
}

/**
 * Validate + normalize a lattice payload. null/undefined → null (the
 * single-motif floor). Anything else must be a sane, finite, non-degenerate
 * lattice or this throws.
 */
export function validateLattice(lattice) {
  if (lattice == null) return null;
  const { t1, t2, cell, type, confidence } = lattice;
  const vec = (v, name) => {
    if (!Array.isArray(v) || v.length !== 2 || !finiteNum(v[0]) || !finiteNum(v[1])) {
      throw new Error(`lattice: rejected malformed ${name}`);
    }
    if (Math.abs(v[0]) > MAX_COMPONENT || Math.abs(v[1]) > MAX_COMPONENT) {
      throw new Error(`lattice: rejected out-of-range ${name}`);
    }
    if (len(v) < MIN_VECTOR_LEN) {
      throw new Error(`lattice: rejected degenerate ${name}`);
    }
    return [v[0], v[1]];
  };
  const v1 = vec(t1, 't1');
  const v2 = vec(t2, 't2');
  // Non-collinear: the unit cross (sin of the angle) must clear a floor, or
  // the tiling placement solve divides by ~0 and the "lattice" is a line.
  if (Math.abs(cross(v1, v2)) / (len(v1) * len(v2)) < 0.02) {
    throw new Error('lattice: rejected collinear basis');
  }
  if (
    !cell ||
    !finiteNum(cell.width) ||
    !finiteNum(cell.height) ||
    cell.width <= 0 ||
    cell.height <= 0 ||
    cell.width > MAX_COMPONENT ||
    cell.height > MAX_COMPONENT
  ) {
    throw new Error('lattice: rejected malformed cell');
  }
  if (!LATTICE_TYPES.includes(type)) {
    throw new Error('lattice: rejected unknown type');
  }
  if (!finiteNum(confidence) || confidence < 0 || confidence > 1) {
    throw new Error('lattice: rejected out-of-range confidence');
  }
  return {
    t1: v1,
    t2: v2,
    cell: { width: cell.width, height: cell.height },
    type,
    confidence,
  };
}

// --- detection --------------------------------------------------------------------

/**
 * Detect the translation lattice of a (flattened) image.
 *
 * @param {{data: Uint8ClampedArray, width: number, height: number}} image
 * @param {{ maxDim?: number, peakThreshold?: number }} [opts]
 * @returns {null | { t1: [number,number], t2: [number,number],
 *                    cell: {width:number,height:number},
 *                    type: 'square'|'rect'|'hex'|'oblique',
 *                    confidence: number }}
 *   null = no repeat evidenced (single-motif floor). Vectors are in SOURCE
 *   image pixels. `confidence` ∈ 0..1 is the verified mean correlation at the
 *   basis translations — callers gate on MIN_LATTICE_CONFIDENCE.
 */
export function detectLattice(image, opts = {}) {
  if (!image || image.width < MIN_IMAGE_DIM || image.height < MIN_IMAGE_DIM) {
    return null;
  }
  const peakThreshold = opts.peakThreshold ?? PEAK_THRESHOLD;
  const { gray, w, h, scale } = toGray(image, opts.maxDim ?? MAX_DIM);

  // Zero-pad to ≥2n per axis: linear (non-circular) autocorrelation, so a
  // period that doesn't divide the image size never wraps into a false peak.
  const px = nextPow2(2 * w);
  const py = nextPow2(2 * h);
  let mean = 0;
  for (let i = 0; i < gray.length; i++) mean += gray[i];
  mean /= gray.length;

  const f = new Float64Array(px * py);
  const mask = new Float64Array(px * py);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      f[y * px + x] = gray[y * w + x] - mean;
      mask[y * px + x] = 1;
    }
  }
  const af = autocorrGrid(f, px, py);
  const am = autocorrGrid(mask, px, py);

  const variance = af[0] / am[0];
  if (!(variance > 1e-6)) return null; // constant image — nothing to correlate
  const minOverlap = MIN_OVERLAP_FRAC * am[0];

  // corr(dx, dy) for lags in the meaningful window; -1 where unsupported.
  const idx = (dx, dy) => (((dy + py) % py) * px + ((dx + px) % px));
  const corrAt = (dx, dy) => {
    const i = idx(dx, dy);
    if (am[i] < minOverlap) return -1;
    return af[i] / (am[i] * variance);
  };

  // Peak pick: strict 8-neighborhood local maxima, half-plane (dy > 0, or
  // dy === 0 && dx > 0), outside the MIN_LAG guard ring.
  const maxDx = Math.floor(w * 0.75);
  const maxDy = Math.floor(h * 0.75);
  const peaks = [];
  for (let dy = 0; dy <= maxDy; dy++) {
    for (let dx = dy === 0 ? 1 : -maxDx; dx <= maxDx; dx++) {
      if (dx * dx + dy * dy < MIN_LAG * MIN_LAG) continue;
      const c = corrAt(dx, dy);
      if (c < peakThreshold) continue;
      let isMax = true;
      for (let ny = -1; ny <= 1 && isMax; ny++) {
        for (let nx = -1; nx <= 1; nx++) {
          if (!nx && !ny) continue;
          if (corrAt(dx + nx, dy + ny) > c) {
            isMax = false;
            break;
          }
        }
      }
      if (isMax) peaks.push({ v: [dx, dy], c, l: Math.hypot(dx, dy) });
    }
  }
  if (peaks.length < 2) return null;
  peaks.sort((a, b) => a.l - b.l);

  // Basis: shortest peak + shortest sufficiently-non-collinear peak.
  const b1 = peaks[0].v;
  let b2 = null;
  for (let i = 1; i < peaks.length; i++) {
    const cand = peaks[i].v;
    const sin = Math.abs(cross(b1, cand)) / (len(b1) * len(cand));
    if (sin >= MIN_SIN) {
      b2 = cand;
      break;
    }
  }
  if (!b2) return null;

  let [r1, r2] = reduceBasis(b1, b2);
  r1 = normalizeSigns(r1);
  r2 = normalizeSigns(r2);

  // Verification pass: the reduced basis must correlate as translations. Mean
  // correlation over the basis + diagonals IS the confidence — a lattice that
  // only explains one direction, or a peak-picking fluke, scores low here.
  const samples = [
    r1,
    r2,
    [r1[0] + r2[0], r1[1] + r2[1]],
    [r1[0] - r2[0], r1[1] - r2[1]],
  ];
  let sum = 0;
  let n = 0;
  for (const s of samples) {
    // Autocorrelation is centrosymmetric — fold into the supported window.
    const dx = Math.round(s[0]);
    const dy = Math.round(s[1]);
    if (Math.abs(dx) >= w || Math.abs(dy) >= h) continue;
    const c = corrAt(dx, dy);
    if (c >= -1) {
      sum += Math.max(0, c);
      n++;
    }
  }
  if (n < 2) return null;
  const confidence = Math.max(0, Math.min(1, sum / n));

  const t1 = [r1[0] * scale, r1[1] * scale];
  const t2 = [r2[0] * scale, r2[1] * scale];
  return {
    t1,
    t2,
    cell: cellBBox(t1, t2),
    type: classifyLatticeType(t1, t2),
    confidence,
  };
}
