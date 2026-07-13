// etchRasterEstimate — the Run Plan's RASTER time model, the sibling of
// runEstimate and deliberately NOT part of it.
//
// WHY THIS IS A SEPARATE BRANCH (ADR-0006): every vector layer's run time comes
// from the LENGTH of the paths the head traces (runEstimate). An Etch has no
// paths — it is a 1-bit bitmap the laser raster-scans line by line across its
// bounding box. Its run time is therefore an AREA×DPI figure, not a path-length
// one, so it needs its own estimator. Shoehorning a raster into the path-length
// code would mean fabricating pseudo-paths for a scan that has none; keeping the
// two estimators apart lets each state its own physics plainly.
//
// THE MODEL — a bounding-box scan:
//   • the head lays down one scan LINE per dot-row, so the number of lines over a
//     physical height H(in) is H × DPI;
//   • each line traverses the full physical width W(in);
//   • total scan distance ≈ (H × DPI) lines × W = area(in²) × DPI, i.e. the head
//     travels the AREA once per inch of resolution. In mm that is
//         scanMm = areaMm2 × DPI / MM_PER_IN
//     (area(in²) × DPI is a distance in inches; × 25.4 gives mm — equivalently,
//     areaMm2 / 25.4 is area·in⁻¹, and × DPI its dot-rows). The formula reads the
//     same whichever axis is called "the scan direction", so the estimate is
//     orientation-independent — a defensible property for a machine that can scan
//     either way.
//   • time = scanMm / engrave_speed + a small fixed overhead (framing/homing).
//
// SPEED SOURCE — the engrave Operation's own speed, resolved by machineSpeedFor
// (runEstimate.js) so the raster and vector models agree about how fast the
// machine engraves: on a laser that is the Operation's machineParams.speed; on
// the pen/drag fallback it is the AxiDraw DRAW_SPEED. runPlanModel passes that
// resolved speed in — this function stays a pure area→seconds calculation with no
// profile knowledge of its own.
//
// PASSES are deliberately NOT modelled here: the task's formula is scan/speed +
// overhead, and multi-scan repetition is future work (also keeps clear of the
// motif-reserved "Pass" vocabulary — grilled decision 9).
//
// Comment style mirrors runEstimate.js / constants.js: explain the WHY.

import { MM_PER_IN } from './constants.js';
import { DEFAULT_ETCH_DPI } from '../etch/etchLayer.js';

// Fixed wall-clock overhead for one raster engrave, in seconds — framing/homing
// and settling before the scan proper. Small next to the area term (a 100mm²
// field at 254 DPI is already hundreds of seconds), so it never dominates; it
// only keeps a tiny Etch from reading as an implausible ~0s. A judgment call,
// isolated behind this constant so the pure area×DPI math stays traceable.
export const ETCH_SCAN_OVERHEAD_SEC = 2;

/**
 * Estimate a raster engrave's run time from its physical footprint and DPI.
 *
 * @param {object}  p
 * @param {number}  p.widthMm      physical width of the Etch's footprint (mm)
 * @param {number}  p.heightMm     physical height of the Etch's footprint (mm)
 * @param {number} [p.dpi]         engrave resolution in dots/inch (default 254)
 * @param {number}  p.speed        engrave speed in mm/s (from machineSpeedFor)
 * @param {number} [p.overheadSec] fixed overhead seconds (default constant)
 * @returns {{ sec:number, scanMm:number, areaMm2:number }}
 */
export function etchRasterEstimate({
  widthMm,
  heightMm,
  dpi = DEFAULT_ETCH_DPI,
  speed,
  overheadSec = ETCH_SCAN_OVERHEAD_SEC,
} = {}) {
  const areaMm2 = widthMm > 0 && heightMm > 0 ? widthMm * heightMm : 0;
  // scan distance the head travels: the area, once per inch of dot resolution.
  const scanMm = areaMm2 > 0 && dpi > 0 ? (areaMm2 * dpi) / MM_PER_IN : 0;

  // A degenerate footprint or a non-positive speed costs nothing and, crucially,
  // never yields NaN/Infinity (divide-by-zero guard) — a silent Infinity would
  // poison the summed totalSec.
  const sec = scanMm > 0 && speed > 0 ? scanMm / speed + overheadSec : 0;

  return { sec, scanMm, areaMm2 };
}
