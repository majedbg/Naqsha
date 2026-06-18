// Canvas-chrome math (Lane B / B4, GitHub issue #7).
//
// Pure px<->unit + ruler-tick helpers shared by the rulers (CanvasChrome) and
// the live cursor readout (StatusBar). Kept free of React/DOM so it unit-tests
// in the default node env and so the cursor and the rulers provably use ONE
// scale — that's what makes "the cursor reads correctly against the ruler" true.
//
// All px<->unit conversion routes through units.js (no hand-rolled factors).

import { pxToUnit, unitToPx } from './units.js';

// Convert a canvas-local screen offset (px from the bed origin, already on-screen
// at `scale = fitScale * zoom`) into a real-world unit value. Dividing by the
// scale first maps screen px back to canvas px, then units.js converts to the
// unit. A non-finite/zero scale falls back to 1 so the status bar never shows
// NaN/Infinity.
export function cursorToUnit(screenPx, unit, scale) {
  const s = Number.isFinite(scale) && scale !== 0 ? scale : 1;
  return pxToUnit(screenPx / s, unit);
}

// Tick intervals per unit (major + minor), chosen so ticks read at a sensible
// real-world cadence. Mirrors BedOverlay's cadence so the two chrome paths look
// consistent.
function tickIntervals(unit) {
  if (unit === 'in') return { major: 1, minor: 0.5 };
  if (unit === 'px') return { major: 100, minor: 50 };
  return { major: 10, minor: 5 }; // mm (default)
}

// Build the ruler tick list for an axis `lengthUnit` long (in `unit`), with each
// tick's on-screen position `pos = value * pxPerUnit * zoom`. Returning screen
// positions (rather than relying on a CSS scale) lets render tests assert tick
// placement for a given zoom directly, and keeps ticks aligned to the same
// scale the cursor uses.
export function rulerTicks(lengthUnit, unit, zoom) {
  const { major: majorStep, minor: minorStep } = tickIntervals(unit);
  const pxPerUnit = unitToPx(1, unit);
  const z = Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
  const EPS = 1e-6;

  const major = [];
  for (let v = 0; v <= lengthUnit + EPS; v += majorStep) {
    const value = roundUnit(v);
    major.push({ value, pos: value * pxPerUnit * z });
  }

  const minor = [];
  for (let v = 0; v <= lengthUnit + EPS; v += minorStep) {
    const value = roundUnit(v);
    // Skip values that coincide with a major tick.
    const onMajor = Math.abs(value / majorStep - Math.round(value / majorStep)) < 1e-4;
    if (onMajor) continue;
    minor.push({ value, pos: value * pxPerUnit * z });
  }

  return { major, minor };
}

// Trim floating-point drift from accumulated additions (e.g. 0.30000000004).
function roundUnit(v) {
  return Math.round(v * 1e6) / 1e6;
}
