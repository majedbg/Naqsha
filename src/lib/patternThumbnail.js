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
  phyllotaxis: { count: 500 },
  phyllodash: { seedCount: 500 },
  topographic: { resolution: 90 },
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
    const group = inst.toSVGGroup(`thumb-${id}`, color, 100);
    if (!group || typeof group !== 'string') return null;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${THUMB_GEN} ${THUMB_GEN}" width="100%" height="100%" preserveAspectRatio="xMidYMid meet">${group}</svg>`;
  } catch {
    // A pattern that isn't fully RecordingContext-safe just falls back to the
    // family glyph in the card — never breaks the modal.
    return null;
  }
}
