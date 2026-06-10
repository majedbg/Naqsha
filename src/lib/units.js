// Unit conversions.
// Canvas storage stays in pixels at 96 PPI internally — this module only
// converts between pixels and the user-facing unit for display/input.

// Import from the single-sourced constants module. The named exports below
// re-expose them so existing importers that pull PPI / MM_PER_IN / PX_PER_MM
// from units.js continue to work unchanged.
import { PPI as _PPI, MM_PER_IN as _MM_PER_IN, PX_PER_MM as _PX_PER_MM } from './plotter/constants.js';
export const PPI = _PPI;
export const MM_PER_IN = _MM_PER_IN;
export const PX_PER_MM = _PX_PER_MM;

export const UNIT_OPTIONS = [
  { value: 'mm', label: 'mm' },
  { value: 'in', label: 'in' },
  { value: 'px', label: 'px' },
];

export const DEFAULT_UNIT = 'mm';

export function pxToUnit(px, unit) {
  switch (unit) {
    case 'mm': return px / PX_PER_MM;
    case 'in': return px / PPI;
    default:   return px;
  }
}

export function unitToPx(value, unit) {
  switch (unit) {
    case 'mm': return value * PX_PER_MM;
    case 'in': return value * PPI;
    default:   return value;
  }
}

export function formatDim(px, unit, precision) {
  const v = pxToUnit(px, unit);
  const p = precision ?? (unit === 'mm' ? 0 : unit === 'in' ? 2 : 0);
  return v.toFixed(p);
}

export function unitStep(unit) {
  switch (unit) {
    case 'mm': return 1;
    case 'in': return 0.5;
    default:   return 1;
  }
}

export function unitMin(unit) {
  switch (unit) {
    case 'mm': return 25;
    case 'in': return 1;
    default:   return 96;
  }
}

export function unitMax(unit) {
  switch (unit) {
    case 'mm': return 1220;
    case 'in': return 48;
    default:   return 4608;
  }
}
