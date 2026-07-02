// detectQuad — auto-propose the ornament plane's quad for the Flatten step
// (S4, issue #53; PRD #48 "Rectifier.detectQuad", locked decision 2 & 8).
//
// APPROACH — classical, pure-JS, deterministic (deviation documented below).
// #53's headline path is M-LSD (tfjs) line segments → vanishing-point
// clustering → homography quad. The S4 brief explicitly permits a lighter
// classical path "behind the same detectQuad(image) → {quad, confidence} | null
// seam" if it satisfies the acceptance criteria — and it does, more cleanly:
//
//   1. No model, no CDN, no tfjs → the studio bundle stays lean BY
//      CONSTRUCTION (the leanest possible outcome of AC "bundle stays lean"),
//      and there is no offline/CDN failure mode to fail-soft around.
//   2. Pure ImageData → fully deterministic and node-testable; runs in <10ms
//      on a downscaled upload, so it needs neither a Worker nor OffscreenCanvas
//      (see PLACEMENT below).
//   3. Fail-soft is the default, not an add-on: anything short of a confidently
//      bounded plane returns null, and the caller keeps its manual default
//      corners — indistinguishable from "no detection ran" (locked invariant).
//
// THE METHOD. Ornament sits on a plane that reads as a bounded, gradient-rich
// region against a quieter background. So:
//   · downsample → grayscale → Sobel gradient magnitude → adaptive threshold
//     gives a "content mask" of the pattern's line-work.
//   · the four EXTREME points of that mask under the rotated objectives x+y
//     (TL/BR) and x−y (TR/BL) are, for any convex region, its actual corner
//     vertices — this recovers a perspective trapezoid's corners exactly, no
//     Hough/VP machinery needed (that is the classical stand-in for the VP
//     analysis; the M-LSD LineDetector seam is left clean below).
//   · the extremes are really the convex hull of ALL content, so a stack of
//     gates asks whether that hull is ONE coherent, well-formed plane before
//     anything is proposed: bounded (quiet border ring + frame-inset corners +
//     area band), non-degenerate (min edge length + min corner angle — extreme-
//     point ties on 45° edges collapse corners into slivers), and coherent
//     (EVERY edge gradient-backed along most of its length + no empty row/
//     column band splitting the content into disjoint regions). A hull that
//     merges the plane with off-plane clutter, spans two separate regions, or
//     degenerates returns null — a wrong proposal is worse than none.
//   · confidence then scores the survivors: border emptiness + area band +
//     the WEAKEST edge's support (min, not mean — an average lets a merged
//     hull flatter itself past one unsupported bridging edge).
//
// PLACEMENT — main thread, synchronous. The detector is pure JS over a small
// (≤ maxDim) downscale of the already-decoded upload; the cost is a few ms, so
// there is nothing to offload. Running it on the main thread also keeps it OUT
// of the Worker's one-op-in-flight lane (rectify/extract), and avoids shipping
// the whole image to the Worker just to detect. The heavy M-LSD path, IF ever
// added, belongs in the Worker behind the stage loadDeps() lazy-dep contract —
// see the LineDetector seam note at the bottom.
//
// Quad convention: detectQuad returns FRACTIONAL [TL, TR, BR, BL] in 0..1 image
// coords — the FlattenStep / ExtractStepper `initialQuad` convention — so the
// proposal is resolution-independent and drops straight into the draggable
// corner UI. (rectify() itself consumes PIXEL quads; the stepper converts at
// apply time, exactly as it already does for the manual corners.)

import { validateQuad } from './rectifier';

/** Below this, a proposal is too weak to show — caller keeps its default. */
export const MIN_QUAD_CONFIDENCE = 0.4;

// A plane must leave SOME evidence but not fill the whole frame with gradient.
const MIN_COVERAGE = 0.01; // fraction of mask pixels — below → blank/sparse
const MAX_AREA_FRAC = 0.92; // quad ≥ this share of the frame → not a bounded plane
const MIN_AREA_FRAC = 0.03; // quad below this → spurious speck
// A bounded plane's corners sit inset from the frame; full-frame texture /
// random noise pushes the extreme points into the corners → they hug the
// frame. Requiring every corner this far off the frame edge is the decisive
// noise discriminator (coverage/border-emptiness alone do not catch it).
const FRAME_MARGIN = 0.04;

// --- coherence + degeneracy gates (S4 adversarial review) --------------------
// The extreme points are the convex hull of ALL content; these gates ask
// whether that hull is ONE coherent, well-formed region. Anything that fails
// is a wrong-but-plausible hull (plane merged with off-plane clutter, two
// separate regions spanned, a 45°-tie sliver) — worse than no proposal, so
// the answer is null, never a lowered-confidence guess.

// Shortest quad edge (fractional) / smallest interior corner angle. Extreme-
// point TIES (an axis-symmetric diamond: every pixel of a 45° edge scores the
// same x±y) collapse two corners into a sliver that rectifier.validateQuad's
// deliberately permissive relative tolerance admits — so detectQuad gates
// degeneracy itself (do NOT tighten validateQuad; other callers rely on it).
const MIN_EDGE_FRAC = 0.05;
const MIN_CORNER_ANGLE = Math.PI / 12; // 15°

// EVERY proposed edge must ride a real gradient boundary along most of its
// length — a hull edge that crosses empty background (plane→clutter bridge)
// is not the border of one plane.
const MIN_EDGE_SUPPORT = 0.55;

// An empty row/column band this wide (fraction of the quad bbox span),
// strictly inside the content extent, means the "plane" is really two or more
// disjoint regions the hull merged (probes A and C).
const MAX_INTERIOR_GAP = 0.12;

/** Longest-side working resolution: enough to localize corners, cheap to scan. */
const DEFAULT_MAX_DIM = 240;

/**
 * Nearest-neighbour downscale to a grayscale Float32 buffer. Pure (no canvas),
 * so the detector runs identically in node tests and in the browser.
 */
function toGray(image, maxDim) {
  const { data, width, height } = image;
  const scale = Math.min(1, maxDim / Math.max(width, height, 1));
  const w = Math.max(1, Math.round(width * scale));
  const h = Math.max(1, Math.round(height * scale));
  const gray = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const sy = Math.min(height - 1, Math.floor(y / scale));
    for (let x = 0; x < w; x++) {
      const sx = Math.min(width - 1, Math.floor(x / scale));
      const i = (sy * width + sx) * 4;
      gray[y * w + x] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    }
  }
  return { gray, w, h };
}

/** Sobel gradient magnitude on the grayscale buffer (border pixels stay 0). */
function sobelMagnitude(gray, w, h) {
  const mag = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const gx =
        -gray[i - w - 1] - 2 * gray[i - 1] - gray[i + w - 1] +
        gray[i - w + 1] + 2 * gray[i + 1] + gray[i + w + 1];
      const gy =
        -gray[i - w - 1] - 2 * gray[i - w] - gray[i - w + 1] +
        gray[i + w - 1] + 2 * gray[i + w] + gray[i + w + 1];
      mag[i] = Math.hypot(gx, gy);
    }
  }
  return mag;
}

/** Shoelace area of a fractional quad (0..1 coords). */
function quadArea(q) {
  let s = 0;
  for (let i = 0; i < 4; i++) {
    const a = q[i];
    const b = q[(i + 1) % 4];
    s += a.x * b.y - b.x * a.y;
  }
  return Math.abs(s) / 2;
}

/**
 * Detect the dominant bounded plane in an image and propose a rectification
 * quad for the Flatten step.
 *
 * @param {{data: Uint8ClampedArray, width: number, height: number}} image
 * @param {{ maxDim?: number }} [opts]
 * @returns {{ quad: {x:number,y:number}[], confidence: number } | null}
 *   quad = fractional [TL, TR, BR, BL] in 0..1; null = no confident plane
 *   (caller falls back to its manual default corners — fail-soft).
 */
export function detectQuad(image, { maxDim = DEFAULT_MAX_DIM } = {}) {
  if (!image?.data || !(image.width > 2) || !(image.height > 2)) return null;
  // Malformed/placeholder buffers (fewer bytes than the declared frame) carry
  // no real pixels — nothing to detect. Fail soft.
  if (image.data.length < image.width * image.height * 4) return null;

  const { gray, w, h } = toGray(image, maxDim);
  if (w < 3 || h < 3) return null;

  const mag = sobelMagnitude(gray, w, h);

  // Adaptive threshold: mean + k·std over the interior magnitudes. Blank →
  // ~0 everywhere → empty mask; textured → a stable top-slice.
  let sum = 0;
  let sumSq = 0;
  const n = w * h;
  for (let i = 0; i < n; i++) {
    sum += mag[i];
    sumSq += mag[i] * mag[i];
  }
  const mean = sum / n;
  const std = Math.sqrt(Math.max(0, sumSq / n - mean * mean));
  const threshold = mean + std;

  // Extreme points of the mask under the rotated objectives → corner vertices.
  let count = 0;
  let borderMask = 0;
  let borderTotal = 0;
  let minSum = Infinity, maxSum = -Infinity, minDiff = Infinity, maxDiff = -Infinity;
  let tl = null, br = null, tr = null, bl = null;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const onBorder = x === 0 || y === 0 || x === w - 1 || y === h - 1;
      if (onBorder) borderTotal++;
      if (mag[y * w + x] <= threshold) continue;
      count++;
      if (onBorder) borderMask++;
      const s = x + y;
      const d = x - y;
      if (s < minSum) { minSum = s; tl = { x, y }; }
      if (s > maxSum) { maxSum = s; br = { x, y }; }
      if (d > maxDiff) { maxDiff = d; tr = { x, y }; }
      if (d < minDiff) { minDiff = d; bl = { x, y }; }
    }
  }

  // Too little evidence → blank / sparse → clean fallback (locked decision 8).
  if (count / n < MIN_COVERAGE || !tl || !tr || !br || !bl) return null;

  // Fractional [TL, TR, BR, BL] (pixel-centre fractions).
  const toFrac = (p) => ({ x: (p.x + 0.5) / w, y: (p.y + 0.5) / h });
  const quad = [toFrac(tl), toFrac(tr), toFrac(br), toFrac(bl)];

  // A malformed proposal (collinear / concave / bowtie extremes) is no
  // detection — fall back rather than surface garbage.
  if (!validateQuad(quad).ok) return null;

  const area = quadArea(quad);
  // Full-frame gradient (noise, edge-to-edge texture) is not a bounded plane;
  // a speck is spurious. Either way: nothing to propose.
  if (area > MAX_AREA_FRAC || area < MIN_AREA_FRAC) return null;

  // Any corner hugging the frame → not a bounded, inset plane (noise/full-frame
  // texture, or a line that runs off the edge) → fall back to manual corners.
  const minInset = Math.min(
    ...quad.map((c) => Math.min(c.x, c.y, 1 - c.x, 1 - c.y))
  );
  if (minInset < FRAME_MARGIN) return null;

  // Degenerate hull (extreme-point ties, e.g. an axis-aligned diamond):
  // collapsed corners / needle angles → sliver quad → no proposal.
  const { minEdge, minAngle } = quadShape(quad);
  if (minEdge < MIN_EDGE_FRAC || minAngle < MIN_CORNER_ANGLE) return null;

  // Per-edge gradient backing: a hull edge bridging empty background (the
  // plane→clutter merge) disqualifies the whole proposal.
  const edgeSupport = measureEdgeSupport(quad, mag, w, h, threshold);
  if (edgeSupport.min < MIN_EDGE_SUPPORT) return null;

  // Disjoint content (two regions, plane + separated clutter): an empty
  // row/column band inside the content extent splits the hull → no proposal.
  if (hasInteriorGap(quad, mag, w, h, threshold)) return null;

  // --- confidence: how convincingly BOUNDED is this plane? --------------------
  // 1. A quiet border ring (mask does not bleed to the frame edge).
  const borderEmptiness = borderTotal ? 1 - borderMask / borderTotal : 0;
  // 2. Area in a healthy mid-band (peak ~0.4, tapering toward the gates).
  const areaScore = Math.max(0, 1 - Math.abs(area - 0.4) / 0.5);
  // 3. The WEAKEST edge's support (min, not mean — one unsupported side is
  //    exactly how a merged hull flatters itself past an average).
  const confidence = clamp01(
    0.4 * borderEmptiness + 0.2 * areaScore + 0.4 * edgeSupport.min
  );
  if (confidence < MIN_QUAD_CONFIDENCE) return null;

  return { quad, confidence };
}

/** Shortest edge length + smallest interior angle of a fractional quad. */
function quadShape(quad) {
  let minEdge = Infinity;
  let minAngle = Infinity;
  for (let i = 0; i < 4; i++) {
    const p = quad[(i + 3) % 4];
    const q = quad[i];
    const r = quad[(i + 1) % 4];
    const v1x = p.x - q.x, v1y = p.y - q.y;
    const v2x = r.x - q.x, v2y = r.y - q.y;
    const l1 = Math.hypot(v1x, v1y);
    const l2 = Math.hypot(v2x, v2y);
    minEdge = Math.min(minEdge, l2);
    const cos = (v1x * v2x + v1y * v2y) / (l1 * l2 || 1);
    minAngle = Math.min(minAngle, Math.acos(Math.max(-1, Math.min(1, cos))));
  }
  return { minEdge, minAngle };
}

/**
 * Split-content check: project the mask inside the quad's bbox onto each axis
 * and look for an empty band strictly inside the occupied extent. One coherent
 * textured plane has none (every row/column crosses some ornament boundary);
 * a hull merging two separated regions has the separating band.
 */
function hasInteriorGap(quad, mag, w, h, threshold) {
  const x0 = Math.max(0, Math.floor(Math.min(...quad.map((c) => c.x)) * w));
  const x1 = Math.min(w - 1, Math.ceil(Math.max(...quad.map((c) => c.x)) * w));
  const y0 = Math.max(0, Math.floor(Math.min(...quad.map((c) => c.y)) * h));
  const y1 = Math.min(h - 1, Math.ceil(Math.max(...quad.map((c) => c.y)) * h));
  const cols = new Uint8Array(x1 - x0 + 1);
  const rows = new Uint8Array(y1 - y0 + 1);
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (mag[y * w + x] > threshold) {
        cols[x - x0] = 1;
        rows[y - y0] = 1;
      }
    }
  }
  const maxGapFrac = (occ) => {
    let first = -1;
    let last = -1;
    for (let i = 0; i < occ.length; i++) {
      if (occ[i]) {
        if (first < 0) first = i;
        last = i;
      }
    }
    if (first < 0 || last <= first) return 1;
    let run = 0;
    let maxRun = 0;
    for (let i = first; i <= last; i++) {
      if (occ[i]) run = 0;
      else if (++run > maxRun) maxRun = run;
    }
    return maxRun / (last - first + 1);
  };
  return maxGapFrac(cols) > MAX_INTERIOR_GAP || maxGapFrac(rows) > MAX_INTERIOR_GAP;
}

/**
 * PER-EDGE gradient backing: for each of the four proposed sides, the fraction
 * of samples along it that sit near a mask pixel. Returned per edge plus the
 * minimum — a merged hull hides its unsupported bridging edge inside a mean,
 * so both the gate and the confidence use the WEAKEST edge.
 *
 * @returns {{ perEdge: number[], min: number }}
 */
function measureEdgeSupport(quad, mag, w, h, threshold) {
  const SAMPLES = 16;
  const RADIUS = 2;
  const perEdge = [];
  for (let e = 0; e < 4; e++) {
    const a = quad[e];
    const b = quad[(e + 1) % 4];
    let supported = 0;
    for (let s = 0; s < SAMPLES; s++) {
      const t = (s + 0.5) / SAMPLES;
      const px = Math.round((a.x + (b.x - a.x) * t) * w);
      const py = Math.round((a.y + (b.y - a.y) * t) * h);
      let hit = false;
      for (let dy = -RADIUS; dy <= RADIUS && !hit; dy++) {
        for (let dx = -RADIUS; dx <= RADIUS && !hit; dx++) {
          const x = px + dx;
          const y = py + dy;
          if (x < 0 || y < 0 || x >= w || y >= h) continue;
          if (mag[y * w + x] > threshold) hit = true;
        }
      }
      if (hit) supported++;
    }
    perEdge.push(supported / SAMPLES);
  }
  return { perEdge, min: Math.min(...perEdge) };
}

const clamp01 = (v) => Math.min(1, Math.max(0, v));

// KNOWN LIMITS of the classical path — every one of these deliberately falls
// to null (manual default corners, no badge), verified by tests; none produces
// a wrong-but-confident quad:
//   · a plane rotated near 45° (axis-symmetric diamond): the x±y objectives
//     tie along its edges → collapsed corners → degeneracy gate → null.
//   · a frame-filling plane (no quiet border): FRAME_MARGIN / area gate → null.
//   · a plane WITH separated off-plane clutter, or several distinct pattern
//     regions: coherence gates (per-edge support, interior-gap) → null. When
//     the clutter sits CLOSER than the gap threshold (~12% of the extent) it
//     can still merge into the hull — irreducible for a hull-based detector;
//     the human adjusts the editable proposal (locked decision 8).
// (A hollow frame-only motif is NOT a limit: its bars keep every projection
// row/column occupied and all four hull edges gradient-backed, so it proposes
// the quad around the frame — which is the plane. Test-covered.)
//
// SEAM (deferred) — the M-LSD LineDetector path, which is what CLOSES the
// limits above (lines + vanishing points see structure, not hulls). To upgrade
// without touching callers: add a LineDetector(image) → segments[] module
// (M-LSD via tfjs, lazy-loaded through a Worker stage's loadDeps() so it never
// enters the entry bundle), cluster the segments into two vanishing points
// (Liebowitz–Zisserman), and emit the same { quad: fractionalTLTRBRBL,
// confidence } shape from here. The classical path above stays as the
// offline / no-model floor. Nothing downstream — the initialQuad seam,
// FlattenStep, rectify() — changes.
