// runEstimate — the Run Plan's profile-aware time model (ADR-0002).
//
// WHY this exists: ADR-0002 makes estimation depend on the Machine Profile.
// A laser's time comes from each Operation's OWN speed × passes (the maker
// tunes these per material), and its pen-up repositioning runs at a fixed
// machine "rapid" that is a constant, not a setting. A pen plotter has no
// per-op speed — it keeps the AxiDraw DRAW_SPEED/TRAVEL_SPEED machine constants
// and instead pays a flat wall-clock allowance every time the run pauses for a
// manual Pen Swap. A drag cutter behaves like the plotter for speed but, like
// the laser, honors a passes count. Every figure is an ESTIMATE — the Run Plan
// UI labels it "Estimated" — so we neither round nor pretend to millisecond
// accuracy here.
//
// INPUT — opGroups: an array, in machine EXECUTION order, of groups shaped
//   { opId, operation, paths }
//     opId      — stable id of the Operation this group fabricates (echoed out)
//     operation — the Operation object; we read operation.machineParams
//                 (laser: { speed, passes }; plotter: { penSlot };
//                  drag: { passes }). Absent/garbage params degrade safely.
//     paths     — the POST-Optimization polylines for this Operation, in px,
//                 shape { points:[[x,y]…], closed } — exactly what pathStats()
//                 consumes. Draw/travel mm are measured per group via pathStats.
//   Wave 2's assembler conforms to this shape.
//
// OUTPUT — { totalSec, perOp, penSwaps }
//     perOp  — [{ opId, drawMm, travelMm, passes, sec }] parallel to opGroups
//     penSwaps — count of adjacent Operation transitions whose Pen differs
//                (plotter only; 0 for every other profile)
//     totalSec — Σ perOp.sec + PEN_SWAP_SEC × penSwaps
//
// SCOPE NOTE (documented deliberate approximation): draw/travel are measured
// per group, so pathStats resets travel at each group boundary — the pen-up
// repositioning BETWEEN Operations is not counted. This keeps the
// totalSec = Σsec + swaps invariant clean and matches the task's "per group via
// pathStats" directive; it under-counts inter-op travel. See the report's
// human-eyes items.
//
// Comment style follows constants.js / pathOps.js: explain the WHY, not the how.

import { pathStats } from './pathOps.js';
import {
  DRAW_SPEED,
  TRAVEL_SPEED,
  LASER_RAPID_SPEED,
  PEN_SWAP_SEC,
} from './constants.js';

// Fallback laser cut speed (mm/s) when an Operation's machineParams.speed is
// absent or non-positive. Matches the laser process schema default (100 mm/s in
// machineProfiles.js) so a mis-wired op still yields a sane, finite estimate
// instead of NaN/Infinity.
const LASER_SPEED_FALLBACK = 100;

// Read a positive number from params[key], else fall back. Guards the time model
// against absent/zero/NaN machineParams (divide-by-zero → Infinity, or NaN).
function positiveParam(params, key, fallback) {
  const v = params?.[key];
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

/**
 * The DRAW speed (mm/s) the machine engraves/cuts an Operation at under a given
 * profile — the SINGLE speed source both this vector model and the raster Etch
 * model (etchRasterEstimate) read, so the two never disagree about how fast the
 * head moves. A laser uses the Operation's OWN tuned speed (fallback when
 * absent); the plotter/drag/unknown-profile fallback uses the AxiDraw machine
 * constant. This is exactly the value the laser branch below applies to draw
 * time, factored out so the Etch can reuse it.
 */
export function machineSpeedFor(operation, profileId) {
  if (profileId === 'laser') {
    return positiveParam(operation?.machineParams, 'speed', LASER_SPEED_FALLBACK);
  }
  return DRAW_SPEED;
}

export function runEstimate(opGroups, profileId) {
  if (!Array.isArray(opGroups) || opGroups.length === 0) {
    return { totalSec: 0, perOp: [], penSwaps: 0 };
  }

  // Branch on the RAW profileId string, never through getProfile(): getProfile
  // resolves an unknown id to the laser default, which would silently give a
  // bogus profile laser math. Here unknown/absent falls through to the AxiDraw
  // machine-constant path (passes=1, no Pen Swaps) — the documented safe default.
  const isLaser = profileId === 'laser';
  const isPlotter = profileId === 'plotter';
  const isDrag = profileId === 'dragCutter';

  const perOp = opGroups.map((g) => {
    const params = g?.operation?.machineParams ?? {};
    const { drawMm, travelMm } = pathStats(g?.paths ?? []);

    let passes;
    let sec;
    if (isLaser) {
      // Laser: cut time from the Operation's own speed × passes; travel at the
      // fixed per-profile rapid constant.
      passes = positiveParam(params, 'passes', 1);
      const speed = machineSpeedFor(g?.operation, profileId);
      sec = (drawMm * passes) / speed + travelMm / LASER_RAPID_SPEED;
    } else {
      // Plotter, drag, and the unknown-profile fallback all use the AxiDraw
      // machine constants. Drag honors its passes param (symmetric with laser);
      // plotter has none (→1); the fallback treats passes as 1.
      passes = isDrag ? positiveParam(params, 'passes', 1) : 1;
      sec = (drawMm * passes) / DRAW_SPEED + travelMm / TRAVEL_SPEED;
    }

    return { opId: g?.opId, drawMm, travelMm, passes, sec };
  });

  // Pen Swaps: plotter only. Count adjacent Operation transitions in execution
  // order whose Pen (machineParams.penSlot) differs. Two undefined slots are not
  // a swap (undefined !== undefined is false).
  let penSwaps = 0;
  if (isPlotter) {
    for (let i = 1; i < opGroups.length; i++) {
      const prev = opGroups[i - 1]?.operation?.machineParams?.penSlot;
      const cur = opGroups[i]?.operation?.machineParams?.penSlot;
      if (prev !== cur) penSwaps += 1;
    }
  }

  const totalSec =
    perOp.reduce((s, o) => s + o.sec, 0) + PEN_SWAP_SEC * penSwaps;

  return { totalSec, perOp, penSwaps };
}
