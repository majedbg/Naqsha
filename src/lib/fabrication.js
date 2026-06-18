// Fabrication helpers — output modes and role→color mapping.

import { resolveLayerColor } from './operations.js';

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

// Operation-library export-color resolution (issue #1, A4) — replaces
// `applyOutputMode(layer, outputMode)` in the export path.
//
//   laser profile   → the assigned operation's color (locked convention);
//                     falls back to #000000 when the layer has no resolvable
//                     operationId (matches roleColor()'s legacy default).
//   other profiles  → the layer's own color is preserved (no override), exactly
//                     as plotter mode behaved before.
//
// `operations` is the document's operation library. Resolution goes THROUGH the
// operation rather than through layer.role, but the emitted colors are
// byte-identical to the legacy applyOutputMode for migrated identity cases.
export function resolveExportColor(layer, { operations, outputMode } = {}) {
  if (outputMode === 'laser') {
    return resolveLayerColor(layer, operations);
  }
  return layer.color;
}

export const MAX_PEN_SLOTS = 6;
