/**
 * buildDesignSnapshot (S3, PRD D14) — PURE capture of the current design into a
 * frozen, detached snapshot the 3D scene reads from.
 *
 * The 3D preview is snapshot-based, NOT live-reactive (D14): entering 3D (and the
 * "↻ Rebuild" affordance) build geometry from a point-in-time copy of the design;
 * subsequent 2D edits do NOT bleed into the open scene. This module is the
 * capture step. It is WebGL-free and three-free — it must stay on the 2D side of
 * the dynamic-import boundary so it can be unit-tested and never pulls three.
 *
 * What S3 captures is exactly what Surface A needs to build sheets+marks in later
 * slices (PRD §3.1): `layers` (each carrying its `panelId`/`operationId`/`params`),
 * `panels` (substrate + order), `operations` (process library), and
 * `machineProfile` (the active profile — drives D7 substrate branching and the
 * laser gating). `patternInstances` is deferred to S5 (it lives behind a ref and
 * may hold non-cloneable values).
 *
 * The snapshot is a DEEP CLONE (mutating the live design after capture never
 * touches it) and DEEP FROZEN (the scene can't accidentally mutate it).
 *
 * @typedef {Object} DesignSnapshot
 * @property {object[]} layers
 * @property {object[]} panels
 * @property {object[]} operations
 * @property {string|null} machineProfile
 */

/** Structural deep clone of plain JSON-ish design data. */
function deepClone(value) {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

/** Recursively freeze an object graph so the scene can't mutate the snapshot. */
function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value)) deepFreeze(value[key]);
  }
  return value;
}

/**
 * @param {{ layers?: object[], panels?: object[], operations?: object[], machineProfile?: string|null }} [input]
 * @returns {DesignSnapshot}
 */
export function buildDesignSnapshot(input = {}) {
  const { layers = [], panels = [], operations = [], machineProfile = null } = input;
  const snapshot = {
    layers: deepClone(layers),
    panels: deepClone(panels),
    operations: deepClone(operations),
    machineProfile: machineProfile ?? null,
  };
  return deepFreeze(snapshot);
}
