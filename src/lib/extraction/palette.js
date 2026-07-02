// PaletteExtractor (S9, issue #58 / PRD #48 "auto facets: palette").
//
// Dominant colors pulled from the flattened selection crop, stored as an AUTO
// facet the user can recolor or search by later (user story 18). Pure JS and
// fully DETERMINISTIC given the same pixels:
//
//   • median-cut (NOT k-means) — no random seed, no convergence wobble;
//   • strided pixel sampling (NOT a canvas rescale) — drawImage downscaling
//     applies image smoothing that differs jsdom↔browser, which would make the
//     known-fixture-colors test environment-dependent. Striding is identical
//     everywhere.
//
// Output: [{ hex:'#rrggbb', coverage:0..1 }] sorted by coverage desc (hex tie-
// break for stable order), capped at maxColors. Coverage fractions partition
// the sampled, non-transparent pixels, so they sum to ~1 across the swatches.

const SAMPLE_MAX = 4096; // strided sample budget (keeps spatial spread)
const ALPHA_MIN = 128; // ignore near-transparent pixels (cropped corners etc.)

function toHex(n) {
  return Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
}

/** [r,g,b] (0..255) → '#rrggbb'. Clamps + rounds so output is always 6-hex. */
export function rgbToHex(r, g, b) {
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

// Collect non-transparent pixels on a spatial stride into a flat [r,g,b] list.
function sample(imageData) {
  const { data, width, height } = imageData;
  const total = width * height;
  const stride = Math.max(1, Math.floor(Math.sqrt(total / SAMPLE_MAX)));
  const px = [];
  for (let y = 0; y < height; y += stride) {
    for (let x = 0; x < width; x += stride) {
      const i = (y * width + x) * 4;
      if (data[i + 3] < ALPHA_MIN) continue;
      px.push([data[i], data[i + 1], data[i + 2]]);
    }
  }
  return px;
}

function makeBox(pixels) {
  let rlo = 255, glo = 255, blo = 255, rhi = 0, ghi = 0, bhi = 0;
  for (const p of pixels) {
    if (p[0] < rlo) rlo = p[0];
    if (p[0] > rhi) rhi = p[0];
    if (p[1] < glo) glo = p[1];
    if (p[1] > ghi) ghi = p[1];
    if (p[2] < blo) blo = p[2];
    if (p[2] > bhi) bhi = p[2];
  }
  return { pixels, ranges: [rhi - rlo, ghi - glo, bhi - blo] };
}

// Median-cut: repeatedly split the box with the widest channel range at its
// median along that channel, until maxColors boxes exist or no box has spread
// left (a uniform image stops early — a two-tone photo yields exactly two).
function medianCut(pixels, maxColors) {
  let boxes = [makeBox(pixels)];
  while (boxes.length < maxColors) {
    let bi = -1;
    let best = 0;
    boxes.forEach((b, i) => {
      const m = Math.max(b.ranges[0], b.ranges[1], b.ranges[2]);
      if (m > best) {
        best = m;
        bi = i;
      }
    });
    if (bi === -1) break; // every remaining box is uniform
    const box = boxes[bi];
    const channel = box.ranges.indexOf(best);
    // Stable sort (V8/Node) → deterministic split for equal-key pixels.
    const sorted = box.pixels.slice().sort((a, b) => a[channel] - b[channel]);
    const mid = Math.floor(sorted.length / 2);
    if (mid === 0 || mid === sorted.length) break; // cannot split further
    boxes.splice(bi, 1, makeBox(sorted.slice(0, mid)), makeBox(sorted.slice(mid)));
  }
  return boxes;
}

/**
 * Extract the dominant palette from ImageData.
 * @param {ImageData} imageData
 * @param {{ maxColors?: number }} [opts]
 * @returns {{hex:string,coverage:number}[]} empty when there is nothing to
 *   sample (no ImageData / all transparent) — a fail-soft facet, never throws.
 */
export function extractPalette(imageData, { maxColors = 6 } = {}) {
  if (!imageData || !imageData.data || !imageData.width || !imageData.height) return [];
  const pixels = sample(imageData);
  if (pixels.length === 0) return [];
  const total = pixels.length;
  const boxes = medianCut(pixels, Math.max(1, maxColors));
  // Median-cut can split one dominant cluster across two boxes (the median
  // falls mid-cluster), yielding two boxes that average to the SAME color.
  // Merge by hex so a colour never appears twice and coverage reflects its
  // true share — a 3/4-red image reads as one red swatch at 0.75, not two.
  const byHex = new Map();
  for (const b of boxes) {
    const n = b.pixels.length;
    let r = 0, g = 0, bl = 0;
    for (const p of b.pixels) {
      r += p[0];
      g += p[1];
      bl += p[2];
    }
    const hex = rgbToHex(r / n, g / n, bl / n);
    byHex.set(hex, (byHex.get(hex) || 0) + n);
  }
  return [...byHex.entries()]
    .map(([hex, n]) => ({ hex, coverage: n / total }))
    .sort(
      (a, b) =>
        b.coverage - a.coverage || (a.hex < b.hex ? -1 : a.hex > b.hex ? 1 : 0)
    );
}
