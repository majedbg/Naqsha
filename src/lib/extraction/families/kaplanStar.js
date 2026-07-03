// Kaplan polygons-in-contact "star" family — the ONE parametric family v1 ships
// (S12, issue #61; PRD #48 decision 10 + research appendix F). Islamic
// star/rosette patterns via Kaplan's method (Kaplan 2000, "Computer Generated
// Islamic Star Patterns"): regular n-gons on the lattice, rays from edge
// midpoints meeting at a CONTACT ANGLE to form n-pointed stars.
//
// This is the FitFamily interface — kept an interface so more families are
// additive later (v1 ships one; the deferred (a) GA/DiffVG north-star and (b)
// VLM motif-fit slot in beside it):
//
//   { id, label, paramDefs,
//     generate(params, { lattice }) -> { fills, strokes, width, height },
//     fit(motif, { lattice, symmetry }) -> { score, params } }
//
// GEOMETRY (documented so generate() has a ground truth the tests pin):
// a star is 2n vertices — n outer tips at radius R in the n-gon vertex
// directions, alternating with n inner notches at radius r in the edge-midpoint
// directions. The contact angle θ sets the notch depth via the polygons-in-
// contact relation
//        r = R · cos(θ + π/n) / cos(π/n)
// (θ in radians, measured so θ→0 is the flat n-gon r=R and θ→(π/2 − π/n) is the
// fully-sharp star r=0). r decreases monotonically in θ, so a larger contact
// angle is a sharper star — the knob the paid tier exposes. The linework is ONE
// closed centerline path (role 'score', locked decision 9): outer0, inner0,
// outer1, inner1, … The exact ray-intersection derivation of the full taprats
// interlacing is the deferred (a) north-star; this faithful single-star-per-cell
// is the v1 fitted family.
//
// Pure JS, worker/node/browser identical. generate() returns tile-shaped
// geometry so it round-trips through the same tile/raster/registration surfaces
// as an extracted motif.

import { rasterizeTile, iou } from '../raster';

export const KAPLAN_STAR_ID = 'kaplan-star';

// Contact-angle bounds in DEGREES. Kept strictly inside (0, 90−180/n) so r is a
// real star (0 < r < R) for every supported fold; clamped per-n in geometry().
const MIN_CONTACT = 15;
const MAX_CONTACT = 75;
const DEFAULT_CONTACT = 45;

// Folds the family can represent, and the candidate grid fit() searches.
export const SUPPORTED_FOLDS = [3, 4, 5, 6, 8, 10, 12];

/** Live structural knobs (paid tier) — PATTERN_PARAM_DEFS/ParamControl shape. */
export const KAPLAN_STAR_PARAM_DEFS = [
  {
    key: 'n',
    label: 'Star fold',
    min: 3,
    max: 12,
    step: 1,
    tooltip: 'Number of star points (star-fold) — 8 = classic khatam',
  },
  {
    key: 'contactAngle',
    label: 'Contact angle',
    min: MIN_CONTACT,
    max: MAX_CONTACT,
    step: 1,
    unit: 'angle',
    tooltip: 'Star sharpness — higher = sharper points (Kaplan contact angle)',
  },
  {
    key: 'scale',
    label: 'Star size',
    min: 0.5,
    max: 0.98,
    step: 0.01,
    tooltip: 'Star radius as a fraction of the repeat cell',
  },
];

export const KAPLAN_STAR_DEFAULTS = { n: 8, contactAngle: DEFAULT_CONTACT, scale: 0.9 };

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/** Round to 3 decimals for compact, stable path data. */
const f = (n) => Math.round(n * 1000) / 1000;

/**
 * The 2n star vertices (outer tips + inner notches) for a star centered at
 * (cx,cy) with tip radius R and contact angle θ° at fold n. Exported so tests
 * pin the vertex structure directly (the geometric ground truth).
 *
 * @returns {{outer:[number,number][], inner:[number,number][], r:number, R:number}}
 */
export function starVertices(n, contactAngle, cx, cy, R, phase = -Math.PI / 2) {
  const nn = clamp(Math.round(n), 3, 12);
  // Clamp θ inside (0, 90−180/n) so r ∈ (0, R): a genuine star at every fold.
  const maxDeg = 90 - 180 / nn - 1;
  const θ = (clamp(contactAngle, MIN_CONTACT, Math.max(MIN_CONTACT, maxDeg)) * Math.PI) / 180;
  const r = R * (Math.cos(θ + Math.PI / nn) / Math.cos(Math.PI / nn));
  const outer = [];
  const inner = [];
  for (let k = 0; k < nn; k++) {
    const a = phase + (2 * Math.PI * k) / nn;
    outer.push([cx + R * Math.cos(a), cy + R * Math.sin(a)]);
    const b = a + Math.PI / nn;
    inner.push([cx + r * Math.cos(b), cy + r * Math.sin(b)]);
  }
  return { outer, inner, r, R };
}

/** Build the closed star path `d` string interleaving outer/inner vertices. */
function starPathD(n, contactAngle, cx, cy, R, phase) {
  const { outer, inner } = starVertices(n, contactAngle, cx, cy, R, phase);
  const parts = [];
  for (let k = 0; k < outer.length; k++) {
    parts.push(`${k === 0 ? 'M' : 'L'}${f(outer[k][0])} ${f(outer[k][1])}`);
    parts.push(`L${f(inner[k][0])} ${f(inner[k][1])}`);
  }
  parts.push('Z');
  return parts.join(' ');
}

/**
 * Generate the star geometry for a repeat cell. Returns tile-shaped output so
 * it flows through the same tile → raster → registration surfaces as a traced
 * motif. The star is centered in the cell's bounding box and sized to `scale`×
 * the smaller cell dimension.
 *
 * @param {{n:number, contactAngle:number, scale?:number, phase?:number}} params
 * @param {{ lattice: {cell:{width:number,height:number}} }} ctx
 * @returns {{ width:number, height:number, fills:[], strokes:[{d,role}] }}
 */
export function generate(params, { lattice } = {}) {
  const cell = lattice?.cell ?? { width: 100, height: 100 };
  const width = cell.width;
  const height = cell.height;
  const n = clamp(Math.round(params?.n ?? KAPLAN_STAR_DEFAULTS.n), 3, 12);
  const contactAngle = params?.contactAngle ?? KAPLAN_STAR_DEFAULTS.contactAngle;
  const scale = clamp(params?.scale ?? KAPLAN_STAR_DEFAULTS.scale, 0.5, 0.98);
  const phase = params?.phase ?? -Math.PI / 2;
  const R = (Math.min(width, height) / 2) * scale;
  const d = starPathD(n, contactAngle, width / 2, height / 2, R, phase);
  // Centerline linework → 'score' (locked decision 9).
  return { width, height, fills: [], strokes: [{ d, role: 'score' }] };
}

/**
 * Candidate star-folds for a detected lattice + symmetry — gated, NOT brute
 * force (task: "gate candidates by S7 group and S5 basis"). Lattice type sets
 * the geometrically admissible folds; a confident (non-soft) rotational group
 * narrows further to its rotation order and multiples. A soft/absent group does
 * not narrow — the honesty burden then falls to the evaluator's symmetry
 * sub-score, which caps low for soft groups.
 */
export function candidateFolds({ lattice, symmetry } = {}) {
  const type = lattice?.type ?? 'square';
  let base;
  if (type === 'hex') base = [3, 6, 12];
  else if (type === 'square') base = [4, 8, 12];
  else if (type === 'rect') base = [4];
  else base = [4, 6]; // oblique / unknown — a minimal spread
  // Narrow by a CONFIDENT rotational group (soft groups don't constrain — the
  // detected center may be phase-collapsed; see symmetry.js seam).
  const order = symmetry && !symmetry.hiddenRotation ? ROTATION_ORDER[symmetry.group] : null;
  if (order && order >= 3) {
    const narrowed = base.filter((k) => k % order === 0);
    if (narrowed.length) return narrowed;
  }
  return base;
}

const ROTATION_ORDER = {
  p1: 1, pm: 1, pg: 1, cm: 1,
  p2: 2, pmm: 2, pmg: 2, pgg: 2, cmm: 2,
  p3: 3, p3m1: 3, p31m: 3,
  p4: 4, p4m: 4, p4g: 4,
  p6: 6, p6m: 6,
};

/**
 * Fit the star family to an extracted motif. Searches the gated fold candidates
 * × a coarse contact-angle sweep, rendering each into the motif's raster frame
 * and scoring by IoU. Returns the family's OWN best-candidate metric (raw IoU)
 * plus the winning params — the evaluator (fitEvaluator) turns this into the
 * adjudicated 1–10 score; this `score` never reaches the UI badge.
 *
 * @param {{ width, height, fills, strokes }} motif  the extracted tile.
 * @param {{ lattice, symmetry }} ctx
 * @returns {{ score:number, params:{n,contactAngle,scale} }}
 */
export function fit(motif, { lattice, symmetry } = {}) {
  const target = rasterizeTile(motif);
  const cell = lattice?.cell ?? { width: motif?.width ?? 100, height: motif?.height ?? 100 };
  const folds = candidateFolds({ lattice, symmetry });
  const angles = [20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70];
  const scales = [0.75, 0.8, 0.85, 0.9, 0.95, 0.98];
  let best = { score: -1, params: { ...KAPLAN_STAR_DEFAULTS } };
  for (const n of folds) {
    for (const contactAngle of angles) {
      for (const scale of scales) {
        const geo = generate({ n, contactAngle, scale }, { lattice: { cell } });
        const cand = rasterizeTile(geo);
        const s = iou(target, cand);
        if (s > best.score) best = { score: s, params: { n, contactAngle, scale } };
      }
    }
  }
  return best;
}

export const kaplanStarFamily = {
  id: KAPLAN_STAR_ID,
  label: 'Islamic star',
  paramDefs: KAPLAN_STAR_PARAM_DEFS,
  defaults: KAPLAN_STAR_DEFAULTS,
  generate,
  fit,
};
