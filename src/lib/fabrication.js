// Fabrication helpers — output modes and role→color mapping.

export const OUTPUT_MODES = [
  {
    value: 'plotter',
    label: 'Pen Plotter',
    hint: 'Each layer maps to a pen slot. Colors preserved on export.',
  },
  {
    value: 'laser',
    label: 'Laser Cutter',
    hint: 'Each layer tagged as Cut / Score / Engrave. Colors overridden to LightBurn convention on export.',
  },
];

// LightBurn / Glowforge / xTool Creative Space convention:
//   pure red  = cut, pure blue = score, pure black = engrave.
// Pure RGB is essential — some apps won't auto-detect off-palette hex values.
export const LASER_ROLES = [
  { value: 'cut',     label: 'Cut',     color: '#FF0000', icon: 'scissors' },
  { value: 'score',   label: 'Score',   color: '#0000FF', icon: 'dotted'   },
  { value: 'engrave', label: 'Engrave', color: '#000000', icon: 'shading'  },
];

export function roleColor(role) {
  return LASER_ROLES.find((r) => r.value === role)?.color ?? '#000000';
}

export function applyOutputMode(layer, outputMode) {
  if (outputMode === 'laser') {
    return { ...layer, color: roleColor(layer.role) };
  }
  return layer;
}

export const MAX_PEN_SLOTS = 6;
