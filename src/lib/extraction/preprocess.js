// preprocess — the optional CV cleanup chain that runs BEFORE potrace binarizes
// the trace input (issue #70; refs #62 #48). A single GLOBAL threshold (the
// legacy `thresholdImage`) fragments a deep-carved, self-shadowed jali screen:
// rounded members + cast shadows don't separate at one luma cut, so members
// break and the engrave fills with noise-blobs. This module adds four opt-in
// stages, plus adaptive (local) thresholding, all threaded through the trace
// options exactly like #69's `invert`:
//
//   1. brightness / contrast — per-pixel linear adjust on luma
//   2. blur (separable Gaussian) — bridges shadow-broken members, smooths speckle
//   3. adaptive threshold (Sauvola, integral-image) — a LOCAL cut as an
//      alternative to the one global cut; composes with `invert`
//   4. min-region-area suppression — drops connected components below `minArea`
//      (the noise-blobs), after thresholding
//
// EVERYTHING is opt-in and the defaults COLLAPSE to the legacy binarizer:
// `binarize(image)` with no options is byte-identical to
// `thresholdImage(image, 128)` (the fast path + the field-based global path both
// match — the gray field is Float64 so the luma compare is bit-for-bit the same
// as the inline compare in vectorizer.thresholdImage; asserted in the tests).
// That is what keeps the 3234 existing tests green.
//
// The chain is exposed stage-by-stage (`preprocess` → { gray, adjusted,
// denoised, binary }, plus the individual step fns) so the #70b Refine UI (and
// these tests) can render each intermediate buffer. Buffers are ImageData-like
// RGBA (grayscale replicated to RGB, original alpha carried) so a canvas paints
// them directly.
//
// Pure JS + typed arrays — no DOM, no canvas — so it runs identically in the
// browser, a Web Worker, and headless under vitest (the codebase keeps its CV
// pure + jsdom-testable). NUMERICS: the gray field and both integral tables are
// Float64 on purpose — at 760px a sum-of-squares integral reaches ~4e10, which
// Float32 (integer-exact only to ~1.6e7) would corrupt, silently breaking the
// local variance Sauvola depends on.

// ── gray field (Float64 luma + carried alpha) ───────────────────────────────

/**
 * RGBA image → { gray: Float64Array luma 0..255, alpha: Uint8ClampedArray,
 * width, height }. Rec. 601 luma, matching vectorizer.thresholdImage exactly so
 * the default global path stays byte-identical. Alpha is carried un-touched
 * (blur never smears it) so the transparent out-of-parallelogram mask guard
 * (stages.maskParallelogram) still reads as paper under every stage.
 */
export function toGrayField(image) {
  const { data, width, height } = image;
  const n = width * height;
  const gray = new Float64Array(n);
  const alpha = new Uint8ClampedArray(n);
  for (let j = 0; j < n; j++) {
    const i = j * 4;
    gray[j] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    alpha[j] = data[i + 3];
  }
  return { gray, alpha, width, height };
}

/** Gray field → RGBA ImageData-like (gray replicated to RGB, alpha carried). */
export function grayFieldToImage({ gray, alpha, width, height }) {
  const out = new Uint8ClampedArray(width * height * 4);
  for (let j = 0; j < gray.length; j++) {
    const v = gray[j]; // Uint8ClampedArray rounds+clamps on assignment
    const i = j * 4;
    out[i] = v;
    out[i + 1] = v;
    out[i + 2] = v;
    out[i + 3] = alpha[j];
  }
  return { data: out, width, height };
}

/** Ink mask (1 = ink) → opaque black/white RGBA, exactly like thresholdImage. */
export function maskToImage(mask, width, height) {
  const out = new Uint8ClampedArray(width * height * 4);
  for (let j = 0; j < mask.length; j++) {
    const v = mask[j] === 1 ? 0 : 255;
    const i = j * 4;
    out[i] = v;
    out[i + 1] = v;
    out[i + 2] = v;
    out[i + 3] = 255;
  }
  return { data: out, width, height };
}

// ── stage 1: brightness / contrast ──────────────────────────────────────────

// GIMP-style contrast factor: F(0) = 1 (identity), rising sharply toward ±100.
// brightness/contrast are -100..100, scaled to a -255..255 luma domain.
function contrastFactor(contrast) {
  const c = contrast * 2.55;
  return (259 * (c + 255)) / (255 * (259 - c));
}

/**
 * Linear brightness/contrast on the gray field (pure; returns a new field).
 * `luma' = F·(luma − 128) + 128 + offset`, clamped 0..255. brightness 0 &
 * contrast 0 → identity.
 */
export function adjustField(field, brightness = 0, contrast = 0) {
  const offset = brightness * 2.55;
  const F = contrastFactor(contrast);
  const { gray, width, height, alpha } = field;
  const out = new Float64Array(gray.length);
  for (let j = 0; j < gray.length; j++) {
    let v = F * (gray[j] - 128) + 128 + offset;
    out[j] = v < 0 ? 0 : v > 255 ? 255 : v;
  }
  return { gray: out, alpha, width, height };
}

// ── stage 2: separable Gaussian blur ────────────────────────────────────────

function gaussianKernel(sigma) {
  const radius = Math.max(1, Math.ceil(sigma * 3));
  const size = radius * 2 + 1;
  const k = new Float64Array(size);
  const denom = 2 * sigma * sigma;
  let sum = 0;
  for (let i = 0; i < size; i++) {
    const x = i - radius;
    const v = Math.exp(-(x * x) / denom);
    k[i] = v;
    sum += v;
  }
  for (let i = 0; i < size; i++) k[i] /= sum; // normalized → preserves mean
  return { k, radius };
}

/**
 * Separable Gaussian blur on the gray field (pure; returns a new field). Edges
 * clamp (replicate). sigma ≤ 0 is a no-op the caller skips.
 */
export function blurField(field, sigma) {
  const { gray, width: w, height: h, alpha } = field;
  const { k, radius } = gaussianKernel(sigma);
  const tmp = new Float64Array(gray.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let acc = 0;
      for (let t = -radius; t <= radius; t++) {
        const xx = x + t < 0 ? 0 : x + t >= w ? w - 1 : x + t;
        acc += gray[y * w + xx] * k[t + radius];
      }
      tmp[y * w + x] = acc;
    }
  }
  const out = new Float64Array(gray.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let acc = 0;
      for (let t = -radius; t <= radius; t++) {
        const yy = y + t < 0 ? 0 : y + t >= h ? h - 1 : y + t;
        acc += tmp[yy * w + x] * k[t + radius];
      }
      out[y * w + x] = acc;
    }
  }
  return { gray: out, alpha, width: w, height: h };
}

// ── stage 3: thresholding (global | Sauvola-adaptive) ───────────────────────

// Both thresholders share `invert`: OFF → luma < t is ink (DARK = ink), ON →
// luma > t is ink (LIGHT = ink, the light-on-dark jali case; #69). Transparent
// pixels (alpha < 128) are always paper.

/** Global-cut ink mask — provably identical to vectorizer.thresholdImage. */
export function globalMask(field, threshold = 128, invert = false) {
  const { gray, alpha } = field;
  const mask = new Uint8Array(gray.length);
  for (let j = 0; j < gray.length; j++) {
    const g = gray[j];
    const ink = alpha[j] >= 128 && (invert ? g > threshold : g < threshold);
    mask[j] = ink ? 1 : 0;
  }
  return mask;
}

/**
 * Sauvola local-threshold ink mask. Per pixel, t = m·(1 + k·(s/R − 1)) over a
 * `window`×`window` neighborhood (m local mean, s local std, R=128 std range).
 * Integral images (Float64) make the window O(1). Composes with `invert` the
 * same way as the global cut. This is the cut that survives a brightness
 * gradient a single global cut cannot.
 */
export function adaptiveMask(field, { window = 31, k = 0.2, invert = false } = {}) {
  const { gray, alpha, width: w, height: h } = field;
  const half = Math.max(1, Math.floor(window / 2));
  const W1 = w + 1;
  const sat = new Float64Array(W1 * (h + 1)); // Σ luma
  const sat2 = new Float64Array(W1 * (h + 1)); // Σ luma²
  for (let y = 0; y < h; y++) {
    let rowSum = 0;
    let rowSum2 = 0;
    for (let x = 0; x < w; x++) {
      const g = gray[y * w + x];
      rowSum += g;
      rowSum2 += g * g;
      const idx = (y + 1) * W1 + (x + 1);
      sat[idx] = sat[y * W1 + (x + 1)] + rowSum;
      sat2[idx] = sat2[y * W1 + (x + 1)] + rowSum2;
    }
  }
  const R = 128;
  const mask = new Uint8Array(gray.length);
  for (let y = 0; y < h; y++) {
    const y0 = y - half < 0 ? 0 : y - half;
    const y1 = y + half >= h ? h - 1 : y + half;
    for (let x = 0; x < w; x++) {
      const x0 = x - half < 0 ? 0 : x - half;
      const x1 = x + half >= w ? w - 1 : x + half;
      const area = (x1 - x0 + 1) * (y1 - y0 + 1);
      const a = y0 * W1 + x0;
      const b = y0 * W1 + (x1 + 1);
      const c = (y1 + 1) * W1 + x0;
      const d = (y1 + 1) * W1 + (x1 + 1);
      const sum = sat[d] - sat[b] - sat[c] + sat[a];
      const sum2 = sat2[d] - sat2[b] - sat2[c] + sat2[a];
      const mean = sum / area;
      const variance = sum2 / area - mean * mean;
      const std = Math.sqrt(variance > 0 ? variance : 0);
      const t = mean * (1 + k * (std / R - 1));
      const g = gray[y * w + x];
      const ink = alpha[y * w + x] >= 128 && (invert ? g > t : g < t);
      mask[y * w + x] = ink ? 1 : 0;
    }
  }
  return mask;
}

// ── stage 4: connected components + min-area suppression ────────────────────

/**
 * Label the ink (mask === 1) into connected components (4- or 8-connectivity,
 * iterative flood fill). Returns per-pixel `labels` (0 = background), `sizes`
 * (sizes[label] = pixel area; index 0 unused), and component `count`.
 */
export function labelComponents(mask, width, height, connectivity = 8) {
  const labels = new Int32Array(mask.length);
  const sizes = [0];
  const nbrs =
    connectivity === 4
      ? [[0, -1], [-1, 0], [1, 0], [0, 1]]
      : [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];
  const stack = [];
  let cur = 0;
  for (let start = 0; start < mask.length; start++) {
    if (mask[start] !== 1 || labels[start] !== 0) continue;
    cur++;
    let size = 0;
    stack.length = 0;
    stack.push(start);
    labels[start] = cur;
    while (stack.length) {
      const p = stack.pop();
      size++;
      const px = p % width;
      const py = (p / width) | 0;
      for (let n = 0; n < nbrs.length; n++) {
        const nx = px + nbrs[n][0];
        const ny = py + nbrs[n][1];
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const np = ny * width + nx;
        if (mask[np] === 1 && labels[np] === 0) {
          labels[np] = cur;
          stack.push(np);
        }
      }
    }
    sizes.push(size);
  }
  return { labels, sizes, count: cur };
}

/** Drop ink components with area < minArea, in place. Returns the mask. */
export function suppressSmall(mask, width, height, minArea, connectivity = 8) {
  if (!(minArea > 0)) return mask;
  const { labels, sizes } = labelComponents(mask, width, height, connectivity);
  for (let j = 0; j < mask.length; j++) {
    if (mask[j] === 1 && sizes[labels[j]] < minArea) mask[j] = 0;
  }
  return mask;
}

// ── public step wrappers (RGBA in / RGBA out) — for the #70b filmstrip ──────

/** RGBA → grayscale RGBA. */
export function toGrayImage(image) {
  return grayFieldToImage(toGrayField(image));
}

/** RGBA → brightness/contrast-adjusted grayscale RGBA. */
export function adjustBrightnessContrast(image, { brightness = 0, contrast = 0 } = {}) {
  return grayFieldToImage(adjustField(toGrayField(image), brightness, contrast));
}

/** RGBA → Gaussian-blurred grayscale RGBA (sigma ≤ 0 → passthrough gray). */
export function gaussianBlur(image, { sigma = 0 } = {}) {
  const field = toGrayField(image);
  return grayFieldToImage(sigma > 0 ? blurField(field, sigma) : field);
}

/** RGBA → Sauvola-adaptive binary RGBA. */
export function adaptiveThreshold(image, { window = 31, k = 0.2, invert = false } = {}) {
  const field = toGrayField(image);
  const mask = adaptiveMask(field, { window, k, invert });
  return maskToImage(mask, field.width, field.height);
}

/**
 * Connected-component analysis of a BINARY RGBA image. By default ink = black
 * (luma < 128, alpha ≥ 128) — the polarity maskToImage/thresholdImage produce.
 * Returns { labels, sizes, count, width, height }.
 */
export function connectedComponents(image, { connectivity = 8 } = {}) {
  const { data, width, height } = image;
  const mask = new Uint8Array(width * height);
  for (let j = 0; j < mask.length; j++) {
    const i = j * 4;
    const luma = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    mask[j] = data[i + 3] >= 128 && luma < 128 ? 1 : 0;
  }
  return { ...labelComponents(mask, width, height, connectivity), width, height };
}

/** Drop small ink components of a BINARY RGBA image; returns cleaned RGBA. */
export function suppressSmallRegions(image, { minArea = 0, connectivity = 8 } = {}) {
  const { data, width, height } = image;
  const mask = new Uint8Array(width * height);
  for (let j = 0; j < mask.length; j++) {
    const i = j * 4;
    const luma = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    mask[j] = data[i + 3] >= 128 && luma < 128 ? 1 : 0;
  }
  suppressSmall(mask, width, height, minArea, connectivity);
  return maskToImage(mask, width, height);
}

// ── the chain — one entry the vectorizer calls, plus buffer exposure ────────

// Shared chain: gray → adjust → blur → threshold → suppress. Returns every
// stage's field/mask so both `binarize` (mask only) and `preprocess` (all
// buffers) reuse identical math.
function runChain(image, opts) {
  const {
    threshold = 128,
    invert = false,
    brightness = 0,
    contrast = 0,
    blur = 0,
    adaptive = false,
    window = 31,
    k = 0.2,
    minArea = 0,
    connectivity = 8,
  } = opts;

  const grayField = toGrayField(image);
  const adjustedField =
    brightness !== 0 || contrast !== 0
      ? adjustField(grayField, brightness, contrast)
      : grayField;
  const denoisedField = blur > 0 ? blurField(adjustedField, blur) : adjustedField;
  const mask = adaptive
    ? adaptiveMask(denoisedField, { window, k, invert })
    : globalMask(denoisedField, threshold, invert);
  if (minArea > 0) suppressSmall(mask, image.width, image.height, minArea, connectivity);
  return { grayField, adjustedField, denoisedField, mask };
}

/**
 * Binarize with the optional preprocessing chain. With NO options this is
 * byte-identical to vectorizer.thresholdImage(image, 128) — the vectorizer's
 * default trace path is unchanged. Recognized opts: `threshold`, `invert`,
 * `brightness`, `contrast`, `blur`, `adaptive`, `window`, `k`, `minArea`,
 * `connectivity`.
 *
 * @returns {{data: Uint8ClampedArray, width: number, height: number}}
 */
export function binarize(image, opts = {}) {
  const { mask } = runChain(image, opts);
  return maskToImage(mask, image.width, image.height);
}

/**
 * Run the chain and return EVERY intermediate as a paintable RGBA buffer — the
 * exact surface the #70b Refine filmstrip renders:
 *   { gray, adjusted, denoised, binary }
 * `gray`/`adjusted`/`denoised` are grayscale RGBA; `binary` is opaque B/W.
 */
export function preprocess(image, opts = {}) {
  const { grayField, adjustedField, denoisedField, mask } = runChain(image, opts);
  return {
    gray: grayFieldToImage(grayField),
    adjusted: grayFieldToImage(adjustedField),
    denoised: grayFieldToImage(denoisedField),
    binary: maskToImage(mask, image.width, image.height),
  };
}
