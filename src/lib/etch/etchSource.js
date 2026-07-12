// etchSource — the DOM/canvas seam for an Etch (Raster Etch S1, issue #80). Like
// extraction/imageIO, everything that needs a real browser (HTMLImageElement,
// canvas 2D) lives here so the rest of the Etch stays pure and node-testable.
//
// It resolves a layer's stored source data-URI into the ONE working 1-bit
// bitmap: decode → resample to the export resolution (physical size × DPI) →
// threshold in the worker. Resampling ONCE here, before the worker, is what
// keeps a single buffer feeding both canvas and export (grilled decision 4) —
// there is no source-res "preview" bitmap and a separate export bitmap. The
// canvas later draws this same bitmap pixelated-scaled to its on-screen box;
// that downscale is display-only and never touches the buffer.

import { loadImage } from '../extraction/imageIO.js';
import { computeEtchBitmap } from './etchWorkerBridge.js';
import { etchPixelDims } from './etchLayer.js';
import { PPI, MM_PER_IN } from '../plotter/constants.js';

// Spine safety cap on the working bitmap's longest side. A large workpiece at
// 254 DPI can reach several thousand px; uncapped that is a memory/time hazard
// for the S1 spine (and the stored source is only ≤1024px anyway). Capping keeps
// the tracer bullet responsive; higher-fidelity sources arrive with the S7
// bucket. Aspect ratio is preserved.
const MAX_ETCH_DIM = 2048;

const pxToMm = (px) => (px / PPI) * MM_PER_IN;

/**
 * Exported/working bitmap pixel dimensions for an Etch that fills the canvas
 * box: physical size (canvas px → mm) × per-Etch DPI, capped to MAX_ETCH_DIM on
 * the longest side (aspect preserved). Pure — node-testable.
 *
 * @param {number} canvasW document width in px
 * @param {number} canvasH document height in px
 * @param {number} dpi per-Etch DPI
 * @returns {{ width: number, height: number }}
 */
export function etchExportDims(canvasW, canvasH, dpi) {
  let w = etchPixelDims(pxToMm(canvasW), dpi);
  let h = etchPixelDims(pxToMm(canvasH), dpi);
  const longest = Math.max(w, h);
  if (longest > MAX_ETCH_DIM) {
    const s = MAX_ETCH_DIM / longest;
    w = Math.max(1, Math.round(w * s));
    h = Math.max(1, Math.round(h * s));
  }
  return { width: w, height: h };
}

/**
 * Cache-liveness predicate for the useCanvas Etch effect (FIX 2). Decides
 * whether a layer's bitmap must be (re)resolved. A relaunch is needed when:
 *   • there is no cache entry, or its signature is stale (source/DPI/canvas
 *     changed), OR
 *   • the entry matches the current signature but holds NO resolved bitmap and
 *     has NO resolve in flight — i.e. a prior run was stranded at `bitmap:null`
 *     (its in-flight promise was superseded before it wrote). Without this second
 *     clause a stranded Etch renders/exports blank forever until its signature
 *     next changes.
 * Pure — node-testable, so the liveness rule is verified without a p5 canvas.
 *
 * @param {{sig:string, bitmap:object|null, resolving?:boolean}|undefined} cached
 * @param {string} sig the current signature
 * @returns {boolean}
 */
export function etchCacheNeedsResolve(cached, sig) {
  if (!cached || cached.sig !== sig) return true;
  return cached.bitmap == null && !cached.resolving;
}

// Resample a decoded image to an exact w×h RGBA ImageData (browser canvas 2D).
function resampleToImageData(img, w, h) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D is not supported');
  ctx.drawImage(img, 0, 0, img.naturalWidth, img.naturalHeight, 0, 0, w, h);
  return ctx.getImageData(0, 0, w, h);
}

/**
 * Resolve an Etch layer's stored source into its single-source 1-bit bitmap.
 * Returns null when the layer has no source (nothing to render/export yet).
 *
 * @param {object} layer the etch layer (reads params.source, params.dpi)
 * @param {number} canvasW document width in px
 * @param {number} canvasH document height in px
 * @param {{ workerFactory?: (() => Worker|null) | null }} [bridgeOpts]
 * @returns {Promise<{bits: Uint8Array, width: number, height: number}|null>}
 */
export async function resolveEtchBitmap(layer, canvasW, canvasH, bridgeOpts = {}) {
  const { source, dpi, stack } = layer?.params || {};
  if (!source) return null;
  const { width, height } = etchExportDims(canvasW, canvasH, dpi);
  const img = await loadImage(source);
  const imageData = resampleToImageData(img, width, height);
  // The Etch Stack config is plain data; it travels to the worker where the
  // heavy per-pixel Stage work runs, then globalMask cuts the shaped field. The
  // resulting `bits` stays the ONE buffer both canvas and export read.
  return computeEtchBitmap(imageData, { stack }, bridgeOpts);
}
