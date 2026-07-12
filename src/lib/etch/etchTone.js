// etchTone — the PURE luma-field math behind the Tone Stage of the Etch Stack
// (Raster Etch S2, issue #81). A Tone Stage shapes the continuous luma field
// BETWEEN toGrayField and the tail screening cut (globalMask); it never touches
// the 1-bit buffer. Everything here is `{ gray: Float64Array, alpha, width,
// height }` → same-shape field, pure typed-array math with no DOM — so it runs
// identically on the main thread, inside etch.worker, and headless under vitest
// (matching etchProcess / the extraction suites).
//
// Grilled decision 1 — REUSE, don't reimplement: brightness/contrast go through
// preprocess.adjustField verbatim; only exposure + gamma/levels are new here
// (they are Etch-subsystem tone controls, so they live in the Etch namespace,
// not in the shared extraction module). alpha and width/height are carried
// forward untouched through every op so the tail globalMask still reads
// transparent pixels as paper.
//
// EXTENSION SEAM (curves, explicitly DEFERRED, decision from #81): a Tone Stage
// is a fixed pipeline of exposure → brightness/contrast → levels. A future
// curves control slots in as one more field→field op appended in applyToneField
// (and one more param key), behind this same signature — no caller changes.
// Do NOT build curves this slice.

import { adjustField } from '../extraction/preprocess.js';

/** Identity Levels: full range, unit gamma. Used as the default + neutral test. */
export const NEUTRAL_LEVELS = Object.freeze({ blackPoint: 0, whitePoint: 255, gamma: 1 });

/**
 * True when a Levels config is an exact identity (lets us short-circuit). Params
 * are coerced with Number() first: a persisted/hand-edited doc can carry
 * number-as-string values (`gamma:"1"`), and a logically-neutral stack must
 * still take the pixel-exact identity path, not fall through to the full remap.
 */
function isNeutralLevels({ blackPoint = 0, whitePoint = 255, gamma = 1 } = {}) {
  return Number(blackPoint) === 0 && Number(whitePoint) === 255 && Number(gamma) === 1;
}

/**
 * Multiplicative exposure gain on the luma field. `exposure` is -100..100; +50
 * doubles luma, -50 halves it (factor = 2^(exposure/50)), clamped 0..255.
 * exposure 0 is an EXACT identity — the SAME field object is returned so an
 * untouched control cannot drift a near-threshold pixel across the cut.
 *
 * @param {{gray:Float64Array, alpha, width:number, height:number}} field
 * @param {number} exposure -100..100
 */
export function applyExposure(field, exposure = 0) {
  const ev = Number(exposure); // coerce so a string "0" still short-circuits
  if (!ev) return field;
  const factor = Math.pow(2, ev / 50);
  const { gray, alpha, width, height } = field;
  const out = new Float64Array(gray.length);
  for (let j = 0; j < gray.length; j++) {
    const v = gray[j] * factor;
    out[j] = v < 0 ? 0 : v > 255 ? 255 : v;
  }
  return { gray: out, alpha, width, height };
}

/**
 * Levels remap: input black/white points stretch to 0..255 and a midtone gamma
 * bends the curve. `out = ((v - black)/(white - black))^(1/gamma) · 255`, each
 * step clamped. gamma > 1 lifts the midtones — the "linearize the exponential
 * darkness" control. Neutral levels (black 0 / white 255 / gamma 1) return the
 * SAME field object (pixel-exact identity; avoids pow round-off flipping a
 * boundary pixel). Degenerate white ≤ black is guarded (no divide-by-zero).
 *
 * @param {{gray:Float64Array, alpha, width:number, height:number}} field
 * @param {{blackPoint:number, whitePoint:number, gamma:number}} levels
 */
export function applyLevels(field, levels = NEUTRAL_LEVELS) {
  if (isNeutralLevels(levels)) return field;
  const black = Number(levels.blackPoint ?? 0);
  const white = Number(levels.whitePoint ?? 255);
  const gRaw = Number(levels.gamma);
  const gamma = gRaw > 0 ? gRaw : 1;
  const span = white - black;
  const invGamma = 1 / gamma;
  const { gray, alpha, width, height } = field;
  const out = new Float64Array(gray.length);
  for (let j = 0; j < gray.length; j++) {
    let n = span > 0 ? (gray[j] - black) / span : gray[j] >= white ? 1 : 0;
    n = n < 0 ? 0 : n > 1 ? 1 : n;
    out[j] = Math.pow(n, invGamma) * 255;
  }
  return { gray: out, alpha, width, height };
}

/**
 * Apply a Tone Stage's params to a luma field: exposure → brightness/contrast
 * (preprocess.adjustField) → levels, in that fixed order. Each sub-op returns
 * the SAME field object when its slice is neutral, so fully-neutral params are a
 * pixel-exact identity — "adding a Tone Stage changes nothing until you move a
 * control." (Bypass is handled one level up, in applyFieldStages, by skipping
 * the Stage entirely; this is the separate default-params guard.)
 *
 * @param {{gray:Float64Array, alpha, width:number, height:number}} field
 * @param {{exposure:number, brightness:number, contrast:number, levels:object}} params
 */
export function applyToneField(field, params = {}) {
  const { exposure = 0, brightness = 0, contrast = 0, levels = NEUTRAL_LEVELS } = params;
  let f = applyExposure(field, exposure);
  // adjustField is an EXACT identity at (0,0), so skipping it there also keeps
  // the same object; only pay the traversal when it actually adjusts. Coerce so
  // string "0" brightness/contrast still take the identity path.
  if (Number(brightness) || Number(contrast)) f = adjustField(f, Number(brightness), Number(contrast));
  f = applyLevels(f, levels);
  return f;
}

/**
 * 256-bin luma histogram of a field — a DISPLAY-ONLY aid for placing the Levels
 * black/white/gamma handles against the source distribution. It is NOT in the
 * bits path (the exported bits come from the full-res worker field); this runs
 * on a small main-thread thumbnail. Each pixel bins by round(luma) clamped
 * 0..255.
 *
 * @param {{gray:Float64Array}} field
 * @returns {Uint32Array} length 256
 */
export function lumaHistogram(field) {
  const { gray } = field;
  const hist = new Uint32Array(256);
  for (let j = 0; j < gray.length; j++) {
    let b = Math.round(gray[j]);
    b = b < 0 ? 0 : b > 255 ? 255 : b;
    hist[b] += 1;
  }
  return hist;
}
