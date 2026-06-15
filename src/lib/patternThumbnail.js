// patternThumbnail.js — generate a static SVG preview string for a pattern,
// for the pattern-picker modal's cards.
//
// HOW: instantiate the pattern class, run generate() against a RecordingContext
// (pure JS — no p5, no DOM), then call toSVGGroup() to serialise svgElements.
// We wrap the result in an <svg viewBox> sized to the GENERATION canvas so the
// browser scales the whole pattern down to whatever the card width is.
//
// CAVEATS (intentional, see docs/pattern-taxonomy.md §7):
//   • RecordingContext's RNG is mulberry32, NOT p5's RNG — so for stochastic
//     patterns the thumbnail conveys CHARACTER, not the exact artwork the user
//     gets when they pick it. That's fine for a picker.
//   • Default params are tuned for large fabrication canvases; we generate at
//     THUMB_GEN px (not the tiny card size) so proportions read correctly, and
//     cap a few heavy patterns via THUMBNAIL_PARAM_OVERRIDES so a 5×8 grid of
//     cards doesn't emit tens of thousands of SVG nodes.

import { DEFAULT_PARAMS } from '../constants';
import { getDynamicDefaults } from './patternRegistry';
import { getPatternClass } from './patterns';
import { RecordingContext } from './patterns/drawingContext';

// Square generation canvas (px). Patterns centre themselves; the SVG viewBox
// scales the whole thing to the card. 1000 reads well for radius/spacing tunings.
const THUMB_GEN = 1000;

// Crop the viewBox inward by this fraction so the art fills the card instead of
// floating in slack margin. Patterns centre on (500,500), so a symmetric inset
// zooms in without shifting; edge-bleeding patterns just crop slightly (fine —
// that reads as a "painted cell" filled to its border).
const THUMB_INSET = 0.08;

// Fixed seed → thumbnails are stable across modal opens.
const THUMB_SEED = 1337;

// Cap the element/iteration counts of the heaviest patterns so the grid stays
// light. Merged OVER the pattern's DEFAULT_PARAMS. Keys absent here use defaults.
const THUMBNAIL_PARAM_OVERRIDES = {
  voronoi: { cellCount: 70 },
  circlepacking: { attempts: 350, minRadius: 14, maxRadius: 90 },
  flowfield: { particleCount: 140 },
  flowhatch: { particleCount: 140, stepsPerParticle: 60 },
  grainfield: { pointCount: 220 },
  turing: { targetPoints: 600, simIterations: 40, gridRes: 80 },
  diffgrowth: { maxNodes: 400 },
  dendrite: { maxNodes: 400 },
  // Show the spiral of elements as outlines, not a solid fill-mode blob.
  phyllotaxis: { count: 400, fillMode: 'outline' },
  phyllodash: { seedCount: 500 },
  // These read as solid colour at default density — open them up so the
  // structure (contour bands / wave lines) is visible at thumbnail size.
  topographic: { resolution: 90, levels: 10 },
  wave: { lineSpacing: 26, waveCount: 5 },
};

/**
 * @param {string} id        pattern id (taxonomy / PATTERN_TYPES key)
 * @param {object} [opts]
 * @param {string} [opts.color]  stroke colour (default a soft ink)
 * @returns {string|null}  an <svg>…</svg> string, or null if the pattern has no
 *                          class yet (placeholder) or generation threw.
 */
export function makePatternThumbnailSVG(id, opts = {}) {
  const color = opts.color || '#2b2b2b';
  const PatternClass = getPatternClass(id);
  if (!PatternClass) return null; // not-yet-built placeholder → caller shows "soon"

  const defaults = DEFAULT_PARAMS[id] || getDynamicDefaults(id) || {};
  const params = { ...defaults, ...(THUMBNAIL_PARAM_OVERRIDES[id] || {}) };

  try {
    const ctx = new RecordingContext({ seed: THUMB_SEED });
    const inst = new PatternClass();
    inst.generateWithContext(ctx, THUMB_SEED, params, THUMB_GEN, THUMB_GEN, color, 100);
    let group = inst.toSVGGroup(`thumb-${id}`, color, 100);
    if (!group || typeof group !== 'string') return null;

    // Drop any element with a NaN coordinate. RecordingContext's RNG is a stand-in
    // (mulberry32, not p5's Perlin), so numerically-sensitive sims (e.g. Turing
    // reaction-diffusion) can diverge to NaN here while rendering fine on the live
    // p5 canvas. Strip the bad shapes rather than inject NaN into the DOM. If
    // nothing drawable survives, fall back to the family glyph.
    if (group.includes('NaN')) group = group.replace(/<[^>]*\bNaN\b[^>]*?\/?>/g, '');
    if (!/<(path|line|polyline|polygon|circle|ellipse|rect)\b/.test(group)) return null;

    // Strokes live in the 1000px generation space but render at ~92px, so a 0.8px
    // line would scale to ~0.08px — invisible. non-scaling-stroke pins width to
    // screen pixels; clamp keeps every pattern legible while preserving relative
    // weight ordering.
    group = group.replace(/stroke-width="([\d.]+)"/g, (_m, w) => {
      const px = Math.min(1.8, Math.max(0.85, parseFloat(w) || 1));
      return `stroke-width="${px}" vector-effect="non-scaling-stroke"`;
    });

    const pad = THUMB_GEN * THUMB_INSET;
    const vb = `${pad} ${pad} ${THUMB_GEN - 2 * pad} ${THUMB_GEN - 2 * pad}`;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" width="100%" height="100%" preserveAspectRatio="xMidYMid meet">${group}</svg>`;
  } catch {
    // A pattern that isn't fully RecordingContext-safe just falls back to the
    // family glyph in the card — never breaks the modal.
    return null;
  }
}
