/**
 * Surface B — modulation HEIGHT-SURFACE relief (S8, PRD D5/D10/§3.3). PURE,
 * three.js-free: lives on the 2D side of the dynamic-import boundary so it is the
 * primary unit gate. The R3F layer (canvas3d/Relief.jsx) consumes the buffers
 * this builder emits — no three import here.
 *
 * Builds a vertex-colored relief mesh from a guide layer's ScalarField (the
 * "cause"): a grid of vertices at the field's grid resolution (segments capped at
 * 256², D9), each lifted along the UP axis by the field's SIGNED value × a
 * vertical-exaggeration factor (D10), and tinted by the project's diverging
 * colormap (attract/repel = warm/cool, matching the topographic-modulation
 * semantics — reused from lib/fields/colormap.js so the relief reads identically
 * to the 2D field heatmap + range slider).
 *
 * NOTE on "Z": PRD D10 phrases the height as "Z = sampleSigned × exaggeration",
 * meaning ELEVATION, not three.js's z-axis. We lay the relief out in WORLD coords
 * with elevation on Y (x across width, z across depth) so the shared camera
 * (3/4 view, ~35° elevation) and overhead key light frame it as terrain WITHOUT a
 * plane rotation — keeping the camera-fit box trivial.
 *
 * The relief is ALWAYS the RAW field (§3.4: "the relief itself is always the raw
 * field (the cause)") — the modulator device-range remap (used by the 2D card's
 * FieldOverlay) is deliberately NOT applied here.
 */
import { signedColor } from '../fields/colormap.js';

/** Max grid segments per axis (PRD D9 — 256² heightmap cap). */
export const SEGMENT_CAP = 256;
/** Vertical-exaggeration floor (flat relief). */
export const EXAG_MIN = 0;
/** Fallback panel size (mm) when bounds are missing — keeps exaggeration sane. */
const FALLBACK_SIZE_MM = 200;

function safeSize(sizeMm) {
  return Number.isFinite(sizeMm) && sizeMm > 0 ? sizeMm : FALLBACK_SIZE_MM;
}

/**
 * Map a unit-domain coord (u,v) ∈ [0,1]² + an elevation to a WORLD position on the
 * relief plane: x across width (centered), z across depth (centered), elevation on Y
 * (the spec's "Z"). The SINGLE source of truth for the relief's uv→world mapping so
 * the draped marks (S9, drape.js) seat on the EXACT surface buildHeightmap emits —
 * any drift here and marks float off the terrain.
 * @param {number} u
 * @param {number} v
 * @param {number} elevation
 * @param {number} [width=1]
 * @param {number} [height=1]
 * @returns {[number, number, number]}
 */
export function uvToWorld(u, v, elevation, width = 1, height = 1) {
  const w = Number.isFinite(width) && width > 0 ? width : 1;
  const h = Number.isFinite(height) && height > 0 ? height : 1;
  return [(u - 0.5) * w, Number.isFinite(elevation) ? elevation : 0, (v - 0.5) * h];
}

/**
 * Default vertical exaggeration ≈ panel-size / 4 (PRD D10). With sampleSigned in
 * [-1,1] this makes the peak relief ±(size/4) over a size-wide plane — a legible
 * terrain that isn't a spike. Non-positive / non-finite size → a sane fallback.
 * @param {number} sizeMm
 * @returns {number}
 */
export function defaultExaggeration(sizeMm) {
  return safeSize(sizeMm) / 4;
}

/**
 * Vertical-exaggeration slider max = the full panel size (so the default sits at
 * 25% of travel).
 * @param {number} sizeMm
 * @returns {number}
 */
export function exaggerationMax(sizeMm) {
  return safeSize(sizeMm);
}

/**
 * Clamp an exaggeration value into [EXAG_MIN, max]. Non-finite input (a stray
 * slider event) collapses to the flat floor rather than a NaN relief.
 * @param {number} v
 * @param {number} maxV
 * @returns {number}
 */
export function clampExaggeration(v, maxV) {
  const max = Number.isFinite(maxV) && maxV > 0 ? maxV : exaggerationMax();
  if (!Number.isFinite(v)) return EXAG_MIN;
  return Math.min(max, Math.max(EXAG_MIN, v));
}

/**
 * Diverging relief color for a SIGNED value s (~[-1,1]): warm (garnet) for
 * positive/attract, cool (sapphire) for negative/repel, neutral parchment at 0.
 * Wraps lib/fields/colormap.signedColor (0–255 + alpha) → an [r,g,b] triple in
 * 0..1 for three.js vertex colors, dropping alpha (the relief is opaque).
 * @param {number} s
 * @returns {[number, number, number]}
 */
export function reliefColor(s) {
  const { r, g, b } = signedColor(s);
  return [r / 255, g / 255, b / 255];
}

/**
 * Build the relief mesh buffers from a ScalarField.
 *
 * @param {{ field?: import('../fields/ScalarField.js').ScalarField,
 *           exaggeration?: number, width?: number, height?: number,
 *           segCap?: number }} [input]
 * @returns {{ cols:number, rows:number, segX:number, segY:number,
 *             positions:Float32Array, colors:Float32Array, indices:Uint32Array,
 *             box:{min:[number,number,number], max:[number,number,number]} } | null}
 */
export function buildHeightmap({ field, exaggeration = 0, width = 1, height = 1, segCap = SEGMENT_CAP } = {}) {
  if (!field || !Number.isFinite(field.nx) || !Number.isFinite(field.ny)) return null;
  if (typeof field.sampleSigned !== 'function') return null;

  const cap = Number.isFinite(segCap) && segCap >= 1 ? Math.floor(segCap) : SEGMENT_CAP;
  const segX = Math.min(Math.max(1, field.nx - 1), cap);
  const segY = Math.min(Math.max(1, field.ny - 1), cap);
  const cols = segX + 1;
  const rows = segY + 1;

  const exag = Number.isFinite(exaggeration) ? exaggeration : 0;
  const w = Number.isFinite(width) && width > 0 ? width : 1;
  const h = Number.isFinite(height) && height > 0 ? height : 1;

  const positions = new Float32Array(cols * rows * 3);
  const colors = new Float32Array(cols * rows * 3);
  let minY = Infinity;
  let maxY = -Infinity;

  for (let j = 0; j < rows; j++) {
    const v = j / segY;
    for (let i = 0; i < cols; i++) {
      const u = i / segX;
      const s = field.sampleSigned(u, v); // normalized [-1,1] by max|value|
      const elevation = s * exag;
      const idx = (j * cols + i) * 3;
      const [wx, wy, wz] = uvToWorld(u, v, elevation, w, h);
      positions[idx] = wx; // x across width, centered
      positions[idx + 1] = wy; // Y = elevation (spec "Z")
      positions[idx + 2] = wz; // z across depth, centered
      const [cr, cg, cb] = reliefColor(s);
      colors[idx] = cr;
      colors[idx + 1] = cg;
      colors[idx + 2] = cb;
      if (elevation < minY) minY = elevation;
      if (elevation > maxY) maxY = elevation;
    }
  }

  // Two triangles per grid cell. Winding is consistent; the R3F layer uses
  // DoubleSide so orbiting under the relief never reveals a black backface.
  const indices = new Uint32Array(segX * segY * 6);
  let k = 0;
  for (let j = 0; j < segY; j++) {
    for (let i = 0; i < segX; i++) {
      const a = j * cols + i;
      const b = a + 1;
      const c = a + cols;
      const d = c + 1;
      indices[k++] = a;
      indices[k++] = c;
      indices[k++] = b;
      indices[k++] = b;
      indices[k++] = c;
      indices[k++] = d;
    }
  }

  if (!Number.isFinite(minY)) {
    minY = 0;
    maxY = 0;
  }

  return {
    cols,
    rows,
    segX,
    segY,
    positions,
    colors,
    indices,
    box: { min: [-w / 2, minY, -h / 2], max: [w / 2, maxY, h / 2] },
  };
}

/**
 * Conservative camera-fit box for the relief (S2 `{min,max}` shape): the full
 * width/depth plane with y = ±exaggeration. Used by Scene3D for height-surface
 * zoom-fit WITHOUT having to build (or even have) the field — so the camera frames
 * correctly the instant B opens. Stays non-degenerate at zero exaggeration.
 *
 * @param {{ width?:number, height?:number, exaggeration?:number }} [input]
 * @returns {{ min:[number,number,number], max:[number,number,number] }}
 */
export function boundsForRelief({ width = 1, height = 1, exaggeration = 0 } = {}) {
  const w = Number.isFinite(width) && width > 0 ? width : 1;
  const h = Number.isFinite(height) && height > 0 ? height : 1;
  const e = Number.isFinite(exaggeration) && exaggeration > 0 ? exaggeration : 0;
  return { min: [-w / 2, -e, -h / 2], max: [w / 2, e, h / 2] };
}
