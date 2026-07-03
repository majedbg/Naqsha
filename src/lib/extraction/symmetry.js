// SymmetryClassifier — 17-wallpaper-group classification for an extracted tile
// (S7, issue #56; PRD #48 "CV/geometry core": `SymmetryClassifier.classify(
// tile, lattice) → { group, confidence }`; user story 15 + locked decision 8).
//
// Method (Liu/Collins/Tsin-style analysis-by-synthesis, PAMI 2004): a wallpaper
// group is the lattice's translations PLUS a point group of rotations,
// reflections and glide reflections that map the pattern to itself. We score
// each candidate symmetry OPERATION by the normalized pixel-correlation of the
// cell against its own transformed copy, then read the operation-presence set
// off a standard crystallographic decision tree to name one of the 17 groups.
//
// Coordinate trick (keeps it basis-agnostic + deterministic): resample the cell
// raster onto an N×N grid in FRACTIONAL lattice coordinates (u,v) ∈ [0,1)². In
// that space every point-group operation of a lattice type is an INTEGER matrix
// (det ±1 → a clean bijection of the grid mod N), so applying an operation is a
// pure index remap — no interpolation, no floating drift. The lattice TYPE
// (square/rect/hex/oblique) gates which matrices are candidates:
//   oblique → p1, p2 (rotations only, no axis is preserved by a reflection)
//   rect    → + axis mirrors/glides (pm, pg, pmm, pmg, pgg, cm, cmm)
//   square  → + 4-fold + diagonal mirrors (p4, p4m, p4g)
//   hex     → 3/6-fold + hex mirrors (p3, p3m1, p31m, p6, p6m)
//
// Offset search is CONSTRAINED to crystallographically valid centers/glides —
// rotations at the {0,½} sublattice centers, reflections scanning the mirror
// line freely (perpendicular offset) but pinning the along-axis offset to 0
// (pure mirror) or ½ (glide). This both distinguishes pm from pg and kills the
// spurious-peak false positives an unconstrained max-over-all-offsets invites
// (which would leak a chiral p4 into p4m).
//
// Pure JS + typed arrays, worker-agnostic, deterministic. No lattice detected →
// no wallpaper group exists (they are the PERIODIC groups); the stage patches
// null and the single-motif floor is untouched (locked decision 8). Point-group
// classification of a lone motif is a different problem #56 does not ask for.
//
// SEAM (S12, parameterize/EVAL): the classified group is the entry point for
// the parametric-family fit — it rides the pipeline result as `result.symmetry`
// and the entity as `entity.symmetry`.

const N = 24; // fractional grid: divisible by 2,3,4,6 → every rotation center
              // ({0,½} and hex thirds) lands on an integer index.
const HALF = N / 2;
const THIRD = N / 3;
const TWO_THIRD = (2 * N) / 3;

// A symmetry operation counts as "present" at or above this normalized
// correlation. True symmetries score ~0.95+ (only resampling noise); a
// constrained-offset near-miss on structured content sits well below.
const PRESENT = 0.7;

// ── The 17 wallpaper groups (canonical IUC short names) ──────────────────────
// This is the persistence whitelist AND the Review override dropdown vocabulary.
export const WALLPAPER_GROUPS = [
  'p1', 'p2', 'pm', 'pg', 'cm', 'pmm', 'pmg', 'pgg', 'cmm',
  'p4', 'p4m', 'p4g', 'p3', 'p3m1', 'p31m', 'p6', 'p6m',
];

const GROUP_SET = new Set(WALLPAPER_GROUPS);

// Which groups each lattice type can host — documentation + the Review dropdown
// can narrow its options to the detected type (a correction, never a lock).
export const GROUPS_BY_LATTICE = {
  oblique: ['p1', 'p2'],
  rect: ['p1', 'p2', 'pm', 'pg', 'cm', 'pmm', 'pmg', 'pgg', 'cmm'],
  square: ['p1', 'p2', 'pm', 'pg', 'cm', 'pmm', 'pmg', 'pgg', 'cmm', 'p4', 'p4m', 'p4g'],
  hex: ['p1', 'p2', 'p3', 'p3m1', 'p31m', 'p6', 'p6m'],
};

// ── Point-group operations, as integer matrices in fractional coords ─────────
// Applied to a grid index (i,j) as (a*i + b*j, c*i + d*j).
const ROT2 = [-1, 0, 0, -1];
const ROT4 = [0, -1, 1, 0]; // 90° (square lattice only)
const ROT3 = [0, -1, 1, -1]; // 120° (hex lattice)
const ROT6 = [1, -1, 1, 0]; // 60° (hex lattice)

// Reflections carry the grid directions that scan the mirror line (perp) and
// run ALONG it (par). The perpendicular offset locates the line (free scan);
// the along-line offset is pinned to {0 → mirror, ½ → glide}.
const M_H = { m: [1, 0, 0, -1], perp: [0, 1], par: [1, 0] }; // line ∥ u-axis
const M_V = { m: [-1, 0, 0, 1], perp: [1, 0], par: [0, 1] }; // line ∥ v-axis
const M_D1 = { m: [0, 1, 1, 0], perp: [1, -1], par: [1, 1] }; // main diagonal
const M_D2 = { m: [0, -1, -1, 0], perp: [1, 1], par: [1, -1] }; // anti-diagonal
// Hex reflection (one representative class — swap axes u↔v). Enough to detect a
// mirror-bearing hex group; the p3m1/p31m split is left conservative (see tree).
const M_HEX = { m: [0, 1, 1, 0], perp: [1, -1], par: [1, 1] };

const mod = (x) => ((x % N) + N) % N;

// ── Sampling: cell raster → N×N zero-mean fractional grid ────────────────────

/**
 * Periodic bilinear luma sample of the cell at fractional (fx,fy) ∈ [0,1).
 * The cell IS one lattice period, so wrap at the edges.
 */
function sampleLuma(lumaW, W, H, fx, fy) {
  const x = fx * W;
  const y = fy * H;
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const tx = x - x0;
  const ty = y - y0;
  const ix0 = ((x0 % W) + W) % W;
  const iy0 = ((y0 % H) + H) % H;
  const ix1 = (ix0 + 1) % W;
  const iy1 = (iy0 + 1) % H;
  const a = lumaW[iy0 * W + ix0];
  const b = lumaW[iy0 * W + ix1];
  const c = lumaW[iy1 * W + ix0];
  const d = lumaW[iy1 * W + ix1];
  return a * (1 - tx) * (1 - ty) + b * tx * (1 - ty) + c * (1 - tx) * ty + d * tx * ty;
}

/**
 * Build the zero-mean fractional grid Fc[N*N] and its energy S=Σ Fc² from an
 * ImageData-shaped cell. Returns null when the cell is too small or flat (no
 * structure to correlate — the classifier then yields null, floor untouched).
 */
function buildGrid(cell) {
  if (!cell || !cell.data || cell.width < 2 || cell.height < 2) return null;
  const { data, width: W, height: H } = cell;
  const luma = new Float64Array(W * H);
  for (let p = 0, q = 0; p < luma.length; p++, q += 4) {
    luma[p] = 0.299 * data[q] + 0.587 * data[q + 1] + 0.114 * data[q + 2];
  }
  // Sample at i/N (NOT the pixel-center (i+0.5)/N): the point-group operations
  // act as symmetries about grid index 0, so the continuous symmetry center must
  // sit ON a sample point (index 0), else genuine interpolation shifts the
  // reflection center by half a cell and the correlation collapses.
  const F = new Float64Array(N * N);
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      F[i * N + j] = sampleLuma(luma, W, H, i / N, j / N);
    }
  }
  let mean = 0;
  for (let k = 0; k < F.length; k++) mean += F[k];
  mean /= F.length;
  let S = 0;
  for (let k = 0; k < F.length; k++) {
    F[k] -= mean;
    S += F[k] * F[k];
  }
  if (!(S > 1e-9)) return null; // flat cell — nothing to correlate
  return { Fc: F, S };
}

// ── Correlation of the grid against an operation at a fixed offset ───────────
function corrAt(Fc, S, m, oi, oj) {
  const [a, b, c, d] = m;
  let sum = 0;
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      const ti = mod(a * i + b * j + oi);
      const tj = mod(c * i + d * j + oj);
      sum += Fc[i * N + j] * Fc[ti * N + tj];
    }
  }
  return sum / S;
}

// Rotation centers: the {0,½} sublattice (all types) + hex thirds (3/6-fold).
const BASE_CENTERS = [
  [0, 0], [HALF, 0], [0, HALF], [HALF, HALF],
];
const HEX_CENTERS = [
  ...BASE_CENTERS,
  [THIRD, TWO_THIRD], [TWO_THIRD, THIRD], [THIRD, THIRD], [TWO_THIRD, TWO_THIRD],
];

function scoreRotation(Fc, S, m, centers) {
  let best = -1;
  for (const [oi, oj] of centers) {
    const c = corrAt(Fc, S, m, oi, oj);
    if (c > best) best = c;
  }
  return best;
}

/**
 * Score a reflection family. Scans the mirror line freely (perp offset) with
 * the along-line offset pinned to 0 (mirror) and ½ (glide) — the two are the
 * pm/pg distinction. Returns { mirror, glide } best correlations.
 */
function scoreReflection(Fc, S, { m, perp, par }) {
  let mirror = -1;
  let glide = -1;
  for (let a = 0; a < N; a++) {
    const pi = a * perp[0];
    const pj = a * perp[1];
    const cm = corrAt(Fc, S, m, pi, pj); // par offset 0
    if (cm > mirror) mirror = cm;
    const cg = corrAt(Fc, S, m, pi + HALF * par[0], pj + HALF * par[1]); // par offset ½
    if (cg > glide) glide = cg;
  }
  return { mirror, glide };
}

// ── Decision tree: operation-presence set → group + generator scores ─────────
//
// The classic Schattschneider flowchart: branch on the highest rotation order,
// then on reflections (true mirrors) and glides. `confidence` is the mean of
// the CHOSEN group's generator correlations (all ≥ PRESENT), so a crisp
// symmetry reads high and a marginal one reads low. p1 (no generator) reports a
// low confidence that falls as the strongest rejected operation approaches the
// threshold — "ambiguous input surfaces low confidence" (issue #56 AC).

function decide(scores, type) {
  const present = (x) => x >= PRESENT;
  const gen = (...vals) => {
    const mean = vals.reduce((s, v) => s + v, 0) / vals.length;
    return Math.max(0, Math.min(1, mean));
  };

  // Highest rotation order present.
  let n = 1;
  if (type === 'hex') {
    if (present(scores.rot6)) n = 6;
    else if (present(scores.rot3)) n = 3;
    else if (present(scores.rot2)) n = 2;
  } else {
    if (type === 'square' && present(scores.rot4)) n = 4;
    else if (present(scores.rot2)) n = 2;
  }

  // Reflection signals.
  const mH = scores.mirrorH ?? -1;
  const mV = scores.mirrorV ?? -1;
  const gH = scores.glideH ?? -1;
  const gV = scores.glideV ?? -1;
  const mD = Math.max(scores.mirrorD1 ?? -1, scores.mirrorD2 ?? -1);
  const mHex = scores.mirrorHex ?? -1;
  const gHex = scores.glideHex ?? -1;

  const axisMirror = present(mH) || present(mV);
  const anyGlide = present(gH) || present(gV) || present(gHex);
  const bestMirror = Math.max(mH, mV, mD, mHex);
  const hasMirror = present(bestMirror);

  const rejected = Math.max(
    scores.rot2, scores.rot4 ?? -1, scores.rot3 ?? -1, scores.rot6 ?? -1,
    mH, mV, mD, mHex, gH, gV, gHex
  );

  // p1 confidence: low, and lower the closer the strongest rejected op sits to
  // the threshold (a genuinely asymmetric tile reads a touch higher than a
  // borderline one).
  const p1Conf = Math.max(0.12, Math.min(0.45, PRESENT - rejected + 0.15));

  switch (n) {
    case 6:
      return hasMirror
        ? { group: 'p6m', confidence: gen(scores.rot6, mHex) }
        : { group: 'p6', confidence: gen(scores.rot6) };
    case 4:
      if (!hasMirror) return { group: 'p4', confidence: gen(scores.rot4) };
      // p4m has axis mirrors; p4g's axis directions are glides, mirrors only on
      // the diagonals.
      return axisMirror
        ? { group: 'p4m', confidence: gen(scores.rot4, Math.max(mH, mV)) }
        : { group: 'p4g', confidence: gen(scores.rot4, mD) };
    case 3:
      return hasMirror
        ? { group: 'p3m1', confidence: gen(scores.rot3, mHex) }
        : { group: 'p3', confidence: gen(scores.rot3) };
    case 2:
      if (!hasMirror) {
        return anyGlide
          ? { group: 'pgg', confidence: gen(scores.rot2, Math.max(gH, gV)) }
          : { group: 'p2', confidence: gen(scores.rot2) };
      }
      if (present(mH) && present(mV)) {
        return { group: 'pmm', confidence: gen(scores.rot2, mH, mV) };
      }
      // one axis mirror + a perpendicular glide → pmg; else fall to cmm/pmm.
      return anyGlide
        ? { group: 'pmg', confidence: gen(scores.rot2, bestMirror, Math.max(gH, gV)) }
        : { group: 'cmm', confidence: gen(scores.rot2, bestMirror) };
    default: {
      // n === 1
      if (!hasMirror) {
        return anyGlide
          ? { group: 'pg', confidence: gen(Math.max(gH, gV, gHex)) }
          : { group: 'p1', confidence: p1Conf };
      }
      // mirror present, no rotation. A parallel glide alongside the mirror marks
      // the centered cell (cm); otherwise pm.
      return anyGlide
        ? { group: 'cm', confidence: gen(bestMirror, Math.max(gH, gV, gHex)) }
        : { group: 'pm', confidence: gen(bestMirror) };
    }
  }
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Classify the wallpaper group of a (rectified) cell raster given its lattice.
 *
 * @param {{data: Uint8ClampedArray, width: number, height: number}} cell one
 *   repeat cell (the lattice stage's cropped raster).
 * @param {{ type?: 'square'|'rect'|'hex'|'oblique' }} lattice detected lattice;
 *   `type` gates the candidate operations. Null/absent → null (no periodic
 *   group without a lattice; the single-motif floor stands).
 * @returns {null | { group: string, confidence: number, source: 'auto' }}
 */
export function classifySymmetry(cell, lattice) {
  if (!lattice || !lattice.type) return null;
  const grid = buildGrid(cell);
  if (!grid) return null;
  const { Fc, S } = grid;
  const type = GROUPS_BY_LATTICE[lattice.type] ? lattice.type : 'oblique';

  const scores = { rot2: scoreRotation(Fc, S, ROT2, BASE_CENTERS) };

  if (type === 'hex') {
    scores.rot3 = scoreRotation(Fc, S, ROT3, HEX_CENTERS);
    scores.rot6 = scoreRotation(Fc, S, ROT6, HEX_CENTERS);
    const hex = scoreReflection(Fc, S, M_HEX);
    scores.mirrorHex = hex.mirror;
    scores.glideHex = hex.glide;
  } else if (type !== 'oblique') {
    // rect + square host axis reflections/glides.
    const h = scoreReflection(Fc, S, M_H);
    const v = scoreReflection(Fc, S, M_V);
    scores.mirrorH = h.mirror;
    scores.glideH = h.glide;
    scores.mirrorV = v.mirror;
    scores.glideV = v.glide;
    if (type === 'square') {
      scores.rot4 = scoreRotation(Fc, S, ROT4, BASE_CENTERS);
      scores.mirrorD1 = scoreReflection(Fc, S, M_D1).mirror;
      scores.mirrorD2 = scoreReflection(Fc, S, M_D2).mirror;
    }
  }

  const { group, confidence } = decide(scores, type);
  return { group, confidence: Math.max(0, Math.min(1, confidence)), source: 'auto' };
}

// ── Validate-and-null (round-trip safety) ────────────────────────────────────
// Same discipline as provenanceMeta/palette: symmetry is an OPTIONAL auto facet
// that must NEVER block a save or destroy a good entry, so a malformed stored
// value is dropped (nulled), not thrown. The group must be one of the 17
// canonical names — a crafted string (markup, a bogus label) is rejected before
// it can reach the badge text or an S10 facet query.

/**
 * @param {*} sym candidate { group, confidence, source }.
 * @returns {null | { group: string, confidence: number, source: 'auto'|'manual' }}
 */
export function validateSymmetry(sym) {
  if (!sym || typeof sym !== 'object') return null;
  if (!GROUP_SET.has(sym.group)) return null;
  let confidence =
    typeof sym.confidence === 'number' && Number.isFinite(sym.confidence)
      ? sym.confidence
      : 0;
  if (confidence < 0) confidence = 0;
  if (confidence > 1) confidence = 1;
  const source = sym.source === 'manual' ? 'manual' : 'auto';
  return { group: sym.group, confidence, source };
}
