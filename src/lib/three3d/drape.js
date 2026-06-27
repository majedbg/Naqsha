/**
 * Surface B — per-channel DRAPE of a guide's active modulation targets (S9, PRD
 * D5/§3.4). PURE, three.js-free: lives on the 2D side of the dynamic-import
 * boundary so it is the primary unit gate. The R3F layer
 * (canvas3d/DrapedMarks.jsx) marshals the Float32Array segment buffers this
 * module emits into LineSegments — no three import here.
 *
 * §3.4's honesty contract: the relief is ALWAYS the raw field (the CAUSE); the
 * drape shows the per-channel EFFECT, NOT a naïve Z-lift.
 *   - channel 'warp'    → displace marks IN-PLANE (xy) along ∇f × amount, then
 *                          SEAT them in Y on the relief (sampleSigned × exag).
 *   - channel 'density' → vary mark SPACING across the surface per the field
 *                          value (denser where density is driven up). Mark Y is
 *                          STILL the raw relief elevation — never the weight.
 *
 * The drape marks are a REPRESENTATIVE deterministic lattice / tick set, NOT the
 * target pattern's literal geometry — disclosed here and in the run log per
 * §3.4 (a disclosed approximation is allowed; a silent one is not). This keeps
 * the transform source-agnostic (it takes base points / sampling as input) and
 * cheaply unit-testable.
 */
import { buildModulationGraph } from '../fields/modulationGraph.js';
import { densityWeight } from '../fields/modulation.js';
import { uvToWorld } from './heightSurface.js';

/** Fallback drape color when a target layer has no `color`. */
export const DEFAULT_DRAPE_COLOR = '#ffffff';

/** Warp lattice resolution (nodes per axis) for the deformed grid. */
export const WARP_GRID = 24;
/**
 * In-plane displacement = ∇f · WARP_GAIN · amount, magnitude-clamped to
 * WARP_MAX_FRAC · amount (in unit-domain fraction). Mirrors the CONTRACT of
 * lib/fields/warp.js (push uphill along +∇f, clamp the magnitude so steep
 * fields like chladni saturate) but in domain-normalized units — the 3D preview
 * has no fixed-px canvas, and exact px-parity is meaningless against an already
 * exaggerated relief Z. WARP_MAX_FRAC ≈ 4% of the domain echoes WARP_MAX_PX/~600px.
 */
export const WARP_GAIN = 0.04;
export const WARP_MAX_FRAC = 0.04;

/** Density tick rows (v-lines) across the surface, and the inverse-CDF step. */
export const DENSITY_ROWS = 16;
export const DENSITY_SPACING = 0.08; // accumulated-weight per emitted tick
export const DENSITY_SAMPLES = 240; // u-walk resolution for the inverse-CDF

/**
 * Resolve the guide's ACTIVE modulation targets (§3.4). Uses the global
 * "first incoming edge wins" rule from buildModulationGraph: a target this guide
 * loses to an EARLIER guide (in layer order) is correctly dropped. Only targets
 * whose channel ∈ {warp, density} are drape-able.
 *
 * @param {object} guideLayer - the layer whose Modulation section launched B
 * @param {object[]} layers - the full layer list
 * @returns {{ targetId:string, channel:'warp'|'density', amount:number,
 *             color:string, name:string }[]} active drape descriptors (may be empty)
 */
export function resolveActiveTargets(guideLayer, layers) {
  if (!guideLayer || guideLayer.id == null || !Array.isArray(layers)) return [];
  const { byGuide } = buildModulationGraph(layers);
  const edges = byGuide.get(guideLayer.id) || [];
  const maps = guideLayer.modulator?.maps || [];
  const byId = new Map();
  for (const l of layers) if (l && l.id != null) byId.set(l.id, l);

  const out = [];
  for (const e of edges) {
    if (!e.active) continue;
    if (e.channel !== 'warp' && e.channel !== 'density') continue;
    const m = maps.find((mp) => mp && mp.targetLayerId === e.targetId);
    const target = byId.get(e.targetId);
    out.push({
      targetId: e.targetId,
      channel: e.channel,
      amount: m?.amount ?? 1,
      color: target?.color ?? DEFAULT_DRAPE_COLOR,
      name: target?.name ?? '',
    });
  }
  return out;
}

/**
 * In-plane WARP displacement (du,dv) of a mark at unit-domain (u,v): push uphill
 * along the field gradient, magnitude = |∇f|·gain·amount clamped to maxFrac·amount.
 * Returns the displacement in UNIT-DOMAIN units (caller adds it to (u,v) then maps
 * to world). Zero-gradient (flat field) → no displacement.
 *
 * @param {import('../fields/ScalarField.js').ScalarField} field
 * @param {number} u
 * @param {number} v
 * @param {number} [amount=1]
 * @param {{gain?:number, maxFrac?:number}} [opts]
 * @returns {{du:number, dv:number}}
 */
export function warpDisplaceUV(field, u, v, amount = 1, opts = {}) {
  if (!field || typeof field.sampleGradient !== 'function') return { du: 0, dv: 0 };
  const a = Number.isFinite(amount) ? amount : 1;
  const gain = opts.gain ?? WARP_GAIN;
  const maxFrac = opts.maxFrac ?? WARP_MAX_FRAC;
  const { dx, dy } = field.sampleGradient(u, v);
  const len = Math.hypot(dx, dy);
  if (!(len > 0)) return { du: 0, dv: 0 };
  // magnitude per unit-amount, gradient-clamped, then scaled by amount (the
  // clamp scales with amount, exactly like warp.js's maxPx·amount).
  const mag = Math.min(len * gain, maxFrac) * a;
  return { du: (dx / len) * mag, dv: (dy / len) * mag };
}

function clamp01(t) {
  return t < 0 ? 0 : t > 1 ? 1 : t;
}

function seatEpsilon(width, height) {
  const w = Number.isFinite(width) && width > 0 ? width : 1;
  const h = Number.isFinite(height) && height > 0 ? height : 1;
  return Math.max(w, h) * 0.004; // tiny +Y lift so lines don't z-fight the relief
}

/**
 * Build a WARP drape: a deformed lattice grid. Each node (u,v) is displaced
 * in-plane by warpDisplaceUV, then SEATED in Y on the relief at the DISPLACED
 * position (sampleSigned × exaggeration + epsilon). Adjacent seated nodes are
 * connected horizontally + vertically into LineSegments (endpoint pairs).
 *
 * @param {{ field:object, amount?:number, exaggeration?:number, width?:number,
 *           height?:number, grid?:number, gain?:number, maxFrac?:number }} input
 * @returns {Float32Array} flat xyz, 2 vertices (6 floats) per segment
 */
export function buildWarpDrape({
  field,
  amount = 1,
  exaggeration = 0,
  width = 1,
  height = 1,
  grid = WARP_GRID,
  gain,
  maxFrac,
} = {}) {
  if (!field || typeof field.sampleSigned !== 'function') return new Float32Array(0);
  const n = Math.max(2, Math.floor(grid));
  const exag = Number.isFinite(exaggeration) ? exaggeration : 0;
  const eps = seatEpsilon(width, height);

  // Seated world position of node (i,j).
  const seated = (i, j) => {
    const u = i / (n - 1);
    const v = j / (n - 1);
    const { du, dv } = warpDisplaceUV(field, u, v, amount, { gain, maxFrac });
    const u2 = clamp01(u + du);
    const v2 = clamp01(v + dv);
    const y = field.sampleSigned(u2, v2) * exag + eps;
    return uvToWorld(u2, v2, y, width, height);
  };

  // Precompute the grid so each interior edge is emitted once.
  const pts = new Array(n * n);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) pts[j * n + i] = seated(i, j);
  }

  // Horizontal edges: n rows × (n-1); vertical: (n-1) rows × n.
  const segCount = n * (n - 1) + (n - 1) * n;
  const out = new Float32Array(segCount * 6);
  let k = 0;
  const push = (a, b) => {
    out[k++] = a[0]; out[k++] = a[1]; out[k++] = a[2];
    out[k++] = b[0]; out[k++] = b[1]; out[k++] = b[2];
  };
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n - 1; i++) push(pts[j * n + i], pts[j * n + i + 1]);
  }
  for (let j = 0; j < n - 1; j++) {
    for (let i = 0; i < n; i++) push(pts[j * n + i], pts[(j + 1) * n + i]);
  }
  return out;
}

/**
 * Inverse-CDF tick positions along u for one v-row: walk u accumulating the
 * field's densityWeight; emit a tick u each time the accumulator crosses
 * `spacing`. MORE ticks where the field drives density up — this is the honest
 * "density channel" effect (spacing, NOT Z). Deterministic; no RNG.
 *
 * @param {import('../fields/ScalarField.js').ScalarField} field
 * @param {number} v - row coordinate in [0,1]
 * @param {{ amount?:number, spacing?:number, samples?:number }} [opts]
 * @returns {number[]} tick u-positions
 */
export function densityTickUs(field, v, { amount = 1, spacing = DENSITY_SPACING, samples = DENSITY_SAMPLES } = {}) {
  if (!field || typeof field.sampleSigned !== 'function') return [];
  const step = Math.max(0, spacing) || DENSITY_SPACING;
  const m = Math.max(1, Math.floor(samples));
  const du = 1 / m;
  const us = [];
  let acc = 0;
  for (let i = 0; i <= m; i++) {
    const u = i / m;
    const w = densityWeight(field.sampleSigned(u, v), { amount });
    acc += w * du;
    while (acc >= step) {
      us.push(u);
      acc -= step;
    }
  }
  return us;
}

/**
 * Build a DENSITY drape: per v-row, inverse-CDF tick positions (denser where the
 * field weight is high), each a short vertical stud STANDING on the relief —
 * from the seated surface point up by a constant tick height. The stud HEIGHT is
 * constant (NOT weight-driven); density reads from how MANY studs / their
 * spacing. Seated Y uses the raw field (the cause), never the weight.
 *
 * @param {{ field:object, amount?:number, exaggeration?:number, width?:number,
 *           height?:number, rows?:number, spacing?:number, samples?:number }} input
 * @returns {Float32Array} flat xyz, 2 vertices (6 floats) per stud segment
 */
export function buildDensityDrape({
  field,
  amount = 1,
  exaggeration = 0,
  width = 1,
  height = 1,
  rows = DENSITY_ROWS,
  spacing = DENSITY_SPACING,
  samples = DENSITY_SAMPLES,
} = {}) {
  if (!field || typeof field.sampleSigned !== 'function') return new Float32Array(0);
  const r = Math.max(1, Math.floor(rows));
  const exag = Number.isFinite(exaggeration) ? exaggeration : 0;
  const eps = seatEpsilon(width, height);
  const studH = Math.max(width || 1, height || 1) * 0.03; // constant stud height

  const segs = [];
  for (let j = 0; j < r; j++) {
    const v = r === 1 ? 0.5 : j / (r - 1);
    const us = densityTickUs(field, v, { amount, spacing, samples });
    for (const u of us) {
      const baseY = field.sampleSigned(u, v) * exag + eps;
      const a = uvToWorld(u, v, baseY, width, height);
      const b = uvToWorld(u, v, baseY + studH, width, height);
      segs.push(a[0], a[1], a[2], b[0], b[1], b[2]);
    }
  }
  return Float32Array.from(segs);
}

/**
 * Dispatch one target descriptor to its per-channel drape buffer.
 * @param {{ channel:string }} target
 * @param {object} params - { field, exaggeration, width, height }
 * @returns {Float32Array}
 */
export function buildDrapeForTarget(target, params = {}) {
  if (!target) return new Float32Array(0);
  const opts = { ...params, amount: target.amount ?? 1 };
  if (target.channel === 'warp') return buildWarpDrape(opts);
  if (target.channel === 'density') return buildDensityDrape(opts);
  return new Float32Array(0);
}
