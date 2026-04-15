// Unit conversions.
// Canvas storage stays in pixels at 96 PPI internally — this module only
// converts between pixels and the user-facing unit for display/input.

export const PPI = 96;
export const MM_PER_IN = 25.4;
export const PX_PER_MM = PPI / MM_PER_IN;

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
