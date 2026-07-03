// FitEvaluator — the EVAL gate (S12, issue #61; PRD #48 decision 10 + user
// stories 51–53). A fitted parametric family is offered to the user ONLY if it
// scores an honest 1–10 ≥ 7 against the extracted motif; below 7 the flow falls
// through to the EXISTING S5 deformable/lattice tiling (never a dead end).
//
// THE #1 REQUIREMENT — CONFIDENCE HONESTY (task, read twice). Two prior CV
// slices (S4 detectQuad, S7 symmetry) were sent back because a confidence
// number FLATTERED on hard input. A poorly-fitting star offered confidently as
// "your pattern, parameterized" is the worst failure mode in the feature. So
// the rubric is built so that a star family which matches the LATTICE and
// SYMMETRY but NOT the ink can never reach 7 on those two alone:
//
//   APPROVED RUBRIC (total 0–10, offer at ≥ 7):
//     symmetry match   0–3   family's wallpaper group vs the S7-classified group
//                            (a SOFT / hiddenRotation group is capped — a phase-
//                            collapsed classification must NOT confirm a match).
//     lattice  match   0–3   family's natural repeat/type vs the S5 basis.
//     motif overlap    0–4   IoU of the best-fit star rendered at the lattice vs
//                            the extracted motif — the HONESTY ANCHOR, with a
//                            FLOOR so structural mismatch buys nothing.
//
//   sym + lattice max out at 6 < 7, so IoU is ARITHMETICALLY NECESSARY. But
//   "6 < 7" is trivial; the real requirement (advisor MAJOR) is that IoU
//   MEANINGFULLY gates. IOU_FLOOR / IOU_FULL below were set from measured raw
//   IoU on adversarial fixtures (raster.test + fitEvaluator.test honesty
//   battery): constructed stars self-fit at IoU ≈ 1.0, while floral / random /
//   calligraphic motifs top out at ≈ 0.44 no matter which star is tried. The
//   floor sits ABOVE that non-star ceiling, so a non-star earns 0 overlap
//   points and, even with a perfect (coincidental) sym+lattice = 6, lands < 7
//   and falls through. A non-star cannot reach 7 without real overlap it does
//   not have.
//
// Pure + deterministic (raster IoU is deterministic), main-thread-cheap (a ~64²
// grid over a gated handful of candidates).

import { rasterizeTile, iou } from './raster';

// IoU → overlap-points mapping. FLOOR is set ABOVE the measured non-star IoU
// ceiling (~0.44) so structural mismatch earns nothing; FULL is where a clean
// star saturates the sub-score. See file header for the empirical basis.
export const IOU_FLOOR = 0.5;
export const IOU_FULL = 0.85;

/** Offer threshold: strictly below → fall through to S5 tiling. */
export const FIT_THRESHOLD = 7;

const ROTATION_ORDER = {
  p1: 1, pm: 1, pg: 1, cm: 1,
  p2: 2, pmm: 2, pmg: 2, pgg: 2, cmm: 2,
  p3: 3, p3m1: 3, p31m: 3,
  p4: 4, p4m: 4, p4g: 4,
  p6: 6, p6m: 6,
};

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/** The star family's natural wallpaper group at fold n on a lattice type. */
export function expectedGroup(n, type) {
  if (type === 'hex') return n === 3 ? 'p3m1' : 'p6m';
  if (type === 'square') return 'p4m';
  if (type === 'rect') return 'pmm';
  return 'p2';
}

/** The star family's natural lattice type at fold n. */
function expectedLatticeType(n) {
  if (n === 3 || n === 6 || n === 12) return 'hex';
  return 'square';
}

/**
 * Symmetry sub-score 0–3. A SOFT (hiddenRotation) or absent group cannot
 * confirm a confident match — capped at 1 (task: "a phase-collapsed/soft group
 * must NOT score a confident symmetry match").
 */
export function symmetryMatch(expected, detected) {
  if (!detected || !detected.group) return 0;
  const eo = ROTATION_ORDER[expected] ?? 1;
  const doo = ROTATION_ORDER[detected.group] ?? 1;
  let raw;
  if (detected.group === expected) raw = 3;
  else if (eo === doo && eo > 1) raw = 2;
  else if (eo > 1 && doo > 1 && (eo % doo === 0 || doo % eo === 0)) raw = 1;
  else raw = 0;
  // Soft classification (phase-collapse caveat) may not confirm a confident
  // match — cap at 1 so a real match still needs a clean symmetry.
  if (detected.hiddenRotation) return Math.min(1, raw);
  return raw;
}

/** Lattice sub-score 0–3 — family's natural type vs the detected basis type. */
export function latticeMatch(n, lattice) {
  if (!lattice || !lattice.type) return 0;
  const exp = expectedLatticeType(n);
  const got = lattice.type;
  let typeScore;
  if (got === exp) typeScore = 3;
  else if ((exp === 'square' && got === 'rect') || (exp === 'rect' && got === 'square')) typeScore = 2;
  else if (got === 'oblique') typeScore = 1;
  else typeScore = 1; // hex↔square: a fold can appear off its natural lattice
  // The S5 confidence is already gated upstream (MIN_LATTICE_CONFIDENCE); a
  // merely-adequate basis shaves one point so a shaky lattice can't max out.
  if (typeof lattice.confidence === 'number' && lattice.confidence < 0.55) {
    typeScore = Math.max(0, typeScore - 1);
  }
  return typeScore;
}

/** IoU → overlap points 0–4, with the honesty floor (below IOU_FLOOR → 0). */
export function overlapPoints(iouValue) {
  if (iouValue <= IOU_FLOOR) return 0;
  return clamp(((iouValue - IOU_FLOOR) / (IOU_FULL - IOU_FLOOR)) * 4, 0, 4);
}

/**
 * Evaluate a family against an extracted motif and adjudicate the offer.
 *
 * @param {{width,height,fills,strokes}} motif  the extracted tile.
 * @param {{ id, generate, fit }} family        a FitFamily (v1: kaplanStar).
 * @param {{ lattice, symmetry }} ctx
 * @returns {{
 *   family: string, accepted: boolean, score: number, params: object,
 *   iou: number, breakdown: { symmetry, lattice, overlap },
 *   explanation: string
 * }}
 *   `score` is the ONLY number the UI badge may show (task: family.fit()'s
 *   internal metric must not leak to "fit N/10"). No lattice → not offered
 *   (wallpaper families are the PERIODIC ones; the single-motif floor stands).
 */
export function evaluateFit(motif, family, { lattice, symmetry } = {}) {
  if (!lattice || !motif) {
    return {
      family: family?.id ?? null,
      accepted: false,
      score: 0,
      params: null,
      iou: 0,
      breakdown: { symmetry: 0, lattice: 0, overlap: 0 },
      explanation: 'No repeating lattice detected — the single-motif trace stands.',
    };
  }

  const best = family.fit(motif, { lattice, symmetry });
  const params = best.params;
  const n = params.n;

  // Re-measure IoU of the winning params in the SAME frame the sub-score reads
  // (fit() already computed this; recompute so the breakdown is self-contained).
  const geo = family.generate(params, { lattice });
  const iouValue = iou(rasterizeTile(motif), rasterizeTile(geo));

  const expGroup = expectedGroup(n, lattice.type);
  const sym = symmetryMatch(expGroup, symmetry);
  const lat = latticeMatch(n, lattice);
  const overlap = overlapPoints(iouValue);

  const total = sym + lat + overlap;
  const score = clamp(Math.round(total), 0, 10);
  const accepted = total >= FIT_THRESHOLD;

  const pct = Math.round(iouValue * 100);
  const explanation =
    `${n}-fold ${expGroup} star — symmetry ${sym}/3` +
    `${symmetry?.hiddenRotation ? ' (soft: off-center crop)' : ''}` +
    `, lattice ${lat}/3, motif overlap ${pct}% (${overlap.toFixed(1)}/4). ` +
    (accepted
      ? `Fit ${score}/10 — offered as an editable star you can adopt.`
      : `Fit ${score}/10 — below ${FIT_THRESHOLD}; keeping the traced tile.`);

  return {
    family: family.id,
    accepted,
    score,
    params,
    iou: iouValue,
    breakdown: { symmetry: sym, lattice: lat, overlap },
    explanation,
  };
}
