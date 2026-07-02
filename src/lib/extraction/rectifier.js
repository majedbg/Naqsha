// Rectifier — 4-corner perspective rectification (S3, issue #52; PRD #48
// "CV/geometry core": `Rectifier.rectify(image, quad) → { rectified,
// homography }`).
//
// Pure JS + typed arrays, no OpenCV.js: the manual warp is an exact 4-point
// DLT homography (one 8×8 linear solve) plus an inverse per-destination-pixel
// map with bilinear sampling — small enough to keep the studio bundle lean.
// The auto-detect slice (S4) may lazy-load heavier machinery for
// `detectQuad`, but it feeds the SAME quad convention into the same
// `rectify`, so this module is the shared floor.
//
// Quad convention (shared with the Flatten UI and the S4 detectQuad seam):
// [TL, TR, BR, BL] — four corners in source-image pixel coordinates.
//
// Everything here is pure (ImageData-shaped objects in and out), so it runs
// identically inline (tests, no-Worker fallback) and inside
// extraction.worker.js.

/**
 * Solve A·x = b for a small dense system via Gaussian elimination with
 * partial pivoting. Mutates A and b. Throws when the system is singular
 * (degenerate quad — collinear corners).
 */
function solveLinear(A, b) {
  const n = A.length;
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(A[r][col]) > Math.abs(A[pivot][col])) pivot = r;
    }
    if (Math.abs(A[pivot][col]) < 1e-10) {
      throw new Error('degenerate quad: homography is singular');
    }
    if (pivot !== col) {
      [A[col], A[pivot]] = [A[pivot], A[col]];
      [b[col], b[pivot]] = [b[pivot], b[col]];
    }
    for (let r = col + 1; r < n; r++) {
      const f = A[r][col] / A[col][col];
      if (f === 0) continue;
      for (let c = col; c < n; c++) A[r][c] -= f * A[col][c];
      b[r] -= f * b[col];
    }
  }
  const x = new Array(n);
  for (let r = n - 1; r >= 0; r--) {
    let s = b[r];
    for (let c = r + 1; c < n; c++) s -= A[r][c] * x[c];
    x[r] = s / A[r][r];
  }
  return x;
}

/**
 * Exact 4-point homography (DLT with h33 = 1): the 3×3 projective transform
 * mapping each src[i] onto dst[i].
 *
 * @param {{x:number,y:number}[]} src four points
 * @param {{x:number,y:number}[]} dst four points
 * @returns {number[]} row-major 3×3 matrix [h11..h33], h33 = 1
 */
export function computeHomography(src, dst) {
  const A = [];
  const b = [];
  for (let i = 0; i < 4; i++) {
    const { x, y } = src[i];
    const { x: X, y: Y } = dst[i];
    A.push([x, y, 1, 0, 0, 0, -X * x, -X * y]);
    b.push(X);
    A.push([0, 0, 0, x, y, 1, -Y * x, -Y * y]);
    b.push(Y);
  }
  const h = solveLinear(A, b);
  return [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1];
}

/** Apply a row-major 3×3 homography to a point. */
export function applyHomography(H, { x, y }) {
  const w = H[6] * x + H[7] * y + H[8];
  return {
    x: (H[0] * x + H[1] * y + H[2]) / w,
    y: (H[3] * x + H[4] * y + H[5]) / w,
  };
}

/**
 * A quad is usable when it is a simple CONVEX quadrilateral: consecutive-edge
 * cross products all share a sign (a concave "dent" or a self-intersecting
 * bowtie flips it) and none is ~zero (collinear corners degenerate the
 * homography). Works in any coordinate scale — the tolerance is relative to
 * the quad's own perimeter — so callers can validate fractional UI coords and
 * pixel coords alike.
 *
 * @param {{x:number,y:number}[]} quad [TL, TR, BR, BL]
 * @returns {{ok: true} | {ok: false, reason: string}}
 */
export function validateQuad(quad) {
  if (!Array.isArray(quad) || quad.length !== 4) {
    return { ok: false, reason: 'quad must have exactly 4 corners' };
  }
  for (const p of quad) {
    if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) {
      return { ok: false, reason: 'corner coordinates must be finite numbers' };
    }
  }
  let perimeter = 0;
  for (let i = 0; i < 4; i++) {
    const a = quad[i];
    const b = quad[(i + 1) % 4];
    perimeter += Math.hypot(b.x - a.x, b.y - a.y);
  }
  const edge = perimeter / 4;
  const tolerance = Math.max(edge * edge * 1e-6, Number.MIN_VALUE);
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const p0 = quad[i];
    const p1 = quad[(i + 1) % 4];
    const p2 = quad[(i + 2) % 4];
    const cross = (p1.x - p0.x) * (p2.y - p1.y) - (p1.y - p0.y) * (p2.x - p1.x);
    if (Math.abs(cross) <= tolerance) {
      return { ok: false, reason: 'quad is degenerate (corners in a line)' };
    }
    const s = Math.sign(cross);
    if (sign === 0) sign = s;
    else if (s !== sign) {
      return { ok: false, reason: 'quad must be convex (no crossed or folded corners)' };
    }
  }
  return { ok: true };
}

/**
 * Destination raster size for a quad: the longer of the two opposing edge
 * pairs (so nothing is undersampled), capped at maxDim on the longest side.
 */
export function rectifiedSize(quad, maxDim = 1024) {
  const [tl, tr, br, bl] = quad;
  const w = Math.max(Math.hypot(tr.x - tl.x, tr.y - tl.y), Math.hypot(br.x - bl.x, br.y - bl.y));
  const h = Math.max(Math.hypot(bl.x - tl.x, bl.y - tl.y), Math.hypot(br.x - tr.x, br.y - tr.y));
  const scale = Math.min(1, maxDim / Math.max(w, h, 1));
  return {
    width: Math.max(1, Math.round(w * scale)),
    height: Math.max(1, Math.round(h * scale)),
  };
}

/**
 * Warp the marked quad of `image` to a fronto-parallel rectangle.
 *
 * Inverse mapping: for every destination pixel center, project back through
 * the dst→src homography and bilinear-sample the source (clamped at the
 * image border). An axis-aligned quad therefore degenerates to an exact
 * crop — a property the tests lean on.
 *
 * @param {{data: Uint8ClampedArray, width: number, height: number}} image
 * @param {{x:number,y:number}[]} quad [TL, TR, BR, BL] in image pixels
 * @param {{maxDim?: number}} [opts]
 * @returns {{rectified: {data: Uint8ClampedArray, width: number, height: number},
 *            homography: number[]}} homography maps SOURCE → RECTIFIED coords
 */
export function rectify(image, quad, { maxDim = 1024 } = {}) {
  const check = validateQuad(quad);
  if (!check.ok) throw new Error(`Cannot flatten: ${check.reason}`);

  const { width: outW, height: outH } = rectifiedSize(quad, maxDim);
  const dstCorners = [
    { x: 0, y: 0 },
    { x: outW, y: 0 },
    { x: outW, y: outH },
    { x: 0, y: outH },
  ];
  const homography = computeHomography(quad, dstCorners); // src → rectified
  const inv = computeHomography(dstCorners, quad); // rectified → src (sampling)

  const { data: src, width: srcW, height: srcH } = image;
  const out = new Uint8ClampedArray(outW * outH * 4);
  const maxX = srcW - 1;
  const maxY = srcH - 1;

  let o = 0;
  for (let y = 0; y < outH; y++) {
    const cy = y + 0.5;
    for (let x = 0; x < outW; x++) {
      const cx = x + 0.5;
      const w = inv[6] * cx + inv[7] * cy + inv[8];
      const sx = (inv[0] * cx + inv[1] * cy + inv[2]) / w - 0.5;
      const sy = (inv[3] * cx + inv[4] * cy + inv[5]) / w - 0.5;

      const x0 = Math.floor(sx);
      const y0 = Math.floor(sy);
      const fx = sx - x0;
      const fy = sy - y0;
      const x0c = x0 < 0 ? 0 : x0 > maxX ? maxX : x0;
      const x1c = x0 + 1 < 0 ? 0 : x0 + 1 > maxX ? maxX : x0 + 1;
      const y0c = y0 < 0 ? 0 : y0 > maxY ? maxY : y0;
      const y1c = y0 + 1 < 0 ? 0 : y0 + 1 > maxY ? maxY : y0 + 1;

      const i00 = (y0c * srcW + x0c) * 4;
      const i10 = (y0c * srcW + x1c) * 4;
      const i01 = (y1c * srcW + x0c) * 4;
      const i11 = (y1c * srcW + x1c) * 4;
      const w00 = (1 - fx) * (1 - fy);
      const w10 = fx * (1 - fy);
      const w01 = (1 - fx) * fy;
      const w11 = fx * fy;

      out[o++] = src[i00] * w00 + src[i10] * w10 + src[i01] * w01 + src[i11] * w11;
      out[o++] = src[i00 + 1] * w00 + src[i10 + 1] * w10 + src[i01 + 1] * w01 + src[i11 + 1] * w11;
      out[o++] = src[i00 + 2] * w00 + src[i10 + 2] * w10 + src[i01 + 2] * w01 + src[i11 + 2] * w11;
      out[o++] = src[i00 + 3] * w00 + src[i10 + 3] * w10 + src[i01 + 3] * w01 + src[i11 + 3] * w11;
    }
  }

  return { rectified: { data: out, width: outW, height: outH }, homography };
}
