// etchDither — the PURE screening kernels behind the Dither Stage of the Etch
// Stack (Raster Etch S3, issue #82). Screening is the terminal step that turns a
// continuous luma field into the 1-bit dot field the laser etches, preserving the
// tonal gradient as DOT DENSITY. Two families live here, both net-new pure math
// (grilled decision 1 — the extraction helpers have no error-diffusion / Bayer,
// so there is nothing to reuse):
//
//   • Floyd–Steinberg — sequential error diffusion in RASTER order (left→right,
//     top→bottom; NOT serpentine — stated so a refactor can't silently change the
//     scan and the golden-image tests pin the exact bytes). Smoothest gradient,
//     but every pixel depends on the ones before it.
//   • Ordered Bayer 2×2 / 4×4 / 8×8 — a per-pixel threshold against a recursive
//     Bayer matrix. NO neighbour state: each output bit is a pure function of its
//     own luma and its (x,y) coordinate, so a Bayer screen is embarrassingly
//     parallel and a sub-tile screens identically to the whole (pixel-independence).
//
// POLARITY matches globalMask (the plain-threshold fallback): dark = ink. A pixel
// screens to ink(1) when its (error-adjusted, or matrix-compared) luma is BELOW
// the cut; `invert` pre-maps luma→255−luma so the LIGHT end etches instead (the
// light-on-dark case). Transparent pixels (alpha < 128) are ALWAYS paper — the
// same out-of-shape guard the extraction thresholders honour.
//
// JUDGMENT CALL — the global `threshold` param is honoured by Floyd–Steinberg
// (it is the 0..255 midpoint of the diffusion, default 128, matching the plain
// cut) but IGNORED by ordered Bayer: an ordered screen's thresholds ARE the
// normalized matrix cells, which is what makes it a mechanical halftone rather
// than a shifted global cut.
//
// `size` (device-pixels per dither cell, matching the reference "size" slider):
// UNIFIED across both modes as "screen at 1/size resolution, then nearest-scale
// back" — the field is block-averaged to ⌈w/size⌉×⌈h/size⌉, screened once, and
// each screened bit is stamped across its size×size device-pixel cell. size 1 is
// the full-resolution direct path (the golden tests run here); larger sizes give
// visibly coarser dots while staying deterministic.
//
// PURE typed-array math, no DOM — runs identically on the main thread, inside
// etch.worker, and headless under vitest (matching etchProcess / etchTone).

/** Dither `mode` discriminators (the rack's 4-way screen selector). */
export const DITHER_FS = 'floyd-steinberg';
export const DITHER_BAYER_2 = 'bayer-2';
export const DITHER_BAYER_4 = 'bayer-4';
export const DITHER_BAYER_8 = 'bayer-8';

/** Default screen: Floyd–Steinberg gives the smoothest gradient (the reference default). */
export const DEFAULT_DITHER_MODE = DITHER_FS;

/** Ordered list for the rack's mode control (value + human label). */
export const DITHER_MODES = [
  { value: DITHER_FS, label: 'Floyd–Steinberg' },
  { value: DITHER_BAYER_2, label: 'Bayer 2×2' },
  { value: DITHER_BAYER_4, label: 'Bayer 4×4' },
  { value: DITHER_BAYER_8, label: 'Bayer 8×8' },
];

/**
 * Recursively build the classic N×N Bayer (ordered-dither) index matrix, N a
 * power of two. Each level quadruples the previous: the recurrence
 *   [ 4·M+0  4·M+2 ]
 *   [ 4·M+3  4·M+1 ]
 * yields a matrix that is a permutation of 0..N²−1 whose values, read as
 * thresholds, spread the dots as evenly as possible.
 */
function makeBayer(n) {
  let m = [[0]];
  let size = 1;
  while (size < n) {
    const next = [];
    for (let y = 0; y < size * 2; y++) next.push(new Array(size * 2));
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const base = 4 * m[y][x];
        next[y][x] = base + 0;
        next[y][x + size] = base + 2;
        next[y + size][x] = base + 3;
        next[y + size][x + size] = base + 1;
      }
    }
    m = next;
    size *= 2;
  }
  return m;
}

export const BAYER_2 = makeBayer(2);
export const BAYER_4 = makeBayer(4);
export const BAYER_8 = makeBayer(8);

/** Map a Bayer dither mode to its matrix (null for non-Bayer modes). */
export function bayerMatrixForMode(mode) {
  switch (mode) {
    case DITHER_BAYER_2:
      return BAYER_2;
    case DITHER_BAYER_4:
      return BAYER_4;
    case DITHER_BAYER_8:
      return BAYER_8;
    default:
      return null;
  }
}

/**
 * Floyd–Steinberg error diffusion → 1-bit ink field (1 = ink/dark).
 *
 * Diffuses into a PRIVATE Float64 copy of the luma (never mutates `field.gray`).
 * Scan is RASTER order; the standard distribution pushes the quantization error
 * to four not-yet-visited neighbours:
 *        (x+1,y) 7/16   (x−1,y+1) 3/16   (x,y+1) 5/16   (x+1,y+1) 1/16.
 * Transparent pixels are paper and neither emit nor propagate error.
 *
 * @param {{gray:Float64Array, alpha, width:number, height:number}} field
 * @param {{threshold?:number, invert?:boolean}} [opts]
 * @returns {Uint8Array} bits, `bits[y*width+x]` ∈ {0,1}
 */
export function floydSteinbergBits(field, { threshold = 128, invert = false } = {}) {
  const { gray, alpha, width: w, height: h } = field;
  // Working buffer in ink-polarity: low value = ink. `invert` flips the ramp so
  // the light end etches. Copy so the field stays untouched for other consumers.
  const buf = new Float64Array(gray.length);
  for (let j = 0; j < gray.length; j++) buf[j] = invert ? 255 - gray[j] : gray[j];
  const bits = new Uint8Array(gray.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const j = y * w + x;
      if (alpha[j] < 128) {
        bits[j] = 0; // transparent → paper, no error emitted
        continue;
      }
      const old = buf[j];
      const ink = old < threshold;
      bits[j] = ink ? 1 : 0;
      const quant = ink ? 0 : 255; // ink → black, paper → white
      const err = old - quant;
      // Spread the error forward (into pixels not yet screened).
      if (x + 1 < w) buf[j + 1] += (err * 7) / 16;
      if (y + 1 < h) {
        const below = j + w;
        if (x - 1 >= 0) buf[below - 1] += (err * 3) / 16;
        buf[below] += (err * 5) / 16;
        if (x + 1 < w) buf[below + 1] += (err * 1) / 16;
      }
    }
  }
  return bits;
}

/**
 * Ordered Bayer threshold screen → 1-bit ink field (1 = ink/dark). PURE per
 * pixel: `ink = value < ((M[y%N][x%N] + 0.5) / N²)·255`, where value is the luma
 * (or 255−luma when inverted). No neighbour reads → parallel and sub-tile stable.
 * The global threshold is intentionally NOT used here (the matrix IS the screen).
 *
 * @param {{gray:Float64Array, alpha, width:number, height:number}} field
 * @param {{matrix:number[][], invert?:boolean}} opts
 * @returns {Uint8Array}
 */
export function orderedBayerBits(field, { matrix, invert = false } = {}) {
  const { gray, alpha, width: w, height: h } = field;
  const n = matrix.length;
  const n2 = n * n;
  const bits = new Uint8Array(gray.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const j = y * w + x;
      if (alpha[j] < 128) {
        bits[j] = 0;
        continue;
      }
      const v = invert ? 255 - gray[j] : gray[j];
      const t = ((matrix[y % n][x % n] + 0.5) / n2) * 255;
      bits[j] = v < t ? 1 : 0;
    }
  }
  return bits;
}

/** Screen a full-resolution field ONCE by mode (FS or a Bayer matrix). */
function screenOnce(field, mode, opts) {
  const matrix = bayerMatrixForMode(mode);
  if (matrix) return orderedBayerBits(field, { matrix, invert: opts.invert });
  return floydSteinbergBits(field, opts); // DITHER_FS (and any unknown → FS)
}

/**
 * Block-average a field to ⌈w/size⌉×⌈h/size⌉ (the low-res grid `size` implies).
 * The cell's luma is meaned over its OPAQUE pixels only (alpha ≥ 128) — folding
 * transparent pixels' luma (a cleared canvas is RGB≈0) into the mean would drag a
 * majority-opaque white cell toward ink and etch a dark fringe on a transparent
 * -background source. Whether the CELL is paper is a separate gate on the mean
 * alpha of ALL its pixels, so a fully-transparent cell still resolves to paper.
 */
function downsampleField(field, size) {
  const { gray, alpha, width: w, height: h } = field;
  const dw = Math.ceil(w / size);
  const dh = Math.ceil(h / size);
  const dGray = new Float64Array(dw * dh);
  const dAlpha = new Uint8ClampedArray(dw * dh);
  for (let cy = 0; cy < dh; cy++) {
    for (let cx = 0; cx < dw; cx++) {
      let sum = 0; // luma sum over OPAQUE pixels only
      let opaque = 0; // count of opaque pixels
      let asum = 0; // alpha sum over ALL pixels (the cell paper gate)
      let count = 0; // count of ALL in-bounds pixels
      for (let dy = 0; dy < size; dy++) {
        const y = cy * size + dy;
        if (y >= h) break;
        for (let dx = 0; dx < size; dx++) {
          const x = cx * size + dx;
          if (x >= w) break;
          const j = y * w + x;
          asum += alpha[j];
          count += 1;
          if (alpha[j] >= 128) {
            sum += gray[j];
            opaque += 1;
          }
        }
      }
      const k = cy * dw + cx;
      dGray[k] = opaque ? sum / opaque : 0; // mean of opaque luma (0 if none)
      dAlpha[k] = count && asum / count >= 128 ? 255 : 0;
    }
  }
  return { gray: dGray, alpha: dAlpha, width: dw, height: dh };
}

/** Nearest-neighbour stamp each low-res bit across its size×size device cell. */
function upsampleBits(smallBits, dw, fullW, fullH, size) {
  const out = new Uint8Array(fullW * fullH);
  for (let y = 0; y < fullH; y++) {
    const sy = (y / size) | 0;
    for (let x = 0; x < fullW; x++) {
      const sx = (x / size) | 0;
      out[y * fullW + x] = smallBits[sy * dw + sx];
    }
  }
  return out;
}

/**
 * Screen a luma field to 1-bit dots for a Dither Stage. Dispatches on `mode` and
 * applies `size` (device-pixels per dither cell) uniformly: size ≤ 1 screens the
 * field at full resolution; a larger size screens a block-averaged low-res field
 * once and stamps each result across its cell. Output length is always the full
 * device-pixel count. `size` is coerced and floored, guarded ≥ 1.
 *
 * @param {{gray:Float64Array, alpha, width:number, height:number}} field
 * @param {{mode?:string, size?:number}} params
 * @param {{threshold?:number, invert?:boolean}} [opts]
 * @returns {Uint8Array}
 */
export function ditherField(field, params = {}, opts = {}) {
  const { mode = DEFAULT_DITHER_MODE } = params;
  const size = Math.max(1, Math.floor(Number(params.size) || 1));
  const screenOpts = { threshold: opts.threshold ?? 128, invert: !!opts.invert };
  if (size <= 1) return screenOnce(field, mode, screenOpts);
  const small = downsampleField(field, size);
  const smallBits = screenOnce(small, mode, screenOpts);
  return upsampleBits(smallBits, small.width, field.width, field.height, size);
}
