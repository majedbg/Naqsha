// Versioned migration shim (issue #1, A3).
//
// Serialized documents previously carried NO schema version: layers held a raw
// `role` string and the document an `outputMode`. We now stamp a schemaVersion
// and migrate forward losslessly at EVERY load boundary (local / cloud / share
// / bundled examples):
//
//   legacy layer.role  → operationId (referencing a seeded operation)
//   legacy outputMode  → machineProfile
//
// Policy (locked): rewrite bundled examples; migrate cloud forward losslessly;
// migrate share links at hydrate where cheap; a version-LESS document is treated
// as legacy and migrated. NEVER reset-to-default — that silently changes
// fabrication intent.

import { seedOperations, resolveOperation, operationIdForRole } from './operations.js';
import { PROFILE_IDS } from './machineProfiles.js';

export const SCHEMA_VERSION = 1;

// Legacy `outputMode` values only ever covered laser/plotter; the new model
// (machineProfiles.js) backs these ids and adds 'dragCutter' (no legacy
// outputMode maps to it). Both legacy values stay valid profile ids.
const LEGACY_OUTPUT_MODE_PROFILES = ['plotter', 'laser'];

// outputMode → machine profile. Absent / unknown defaults to 'plotter' (the
// historical default in useCanvasSize). The result is a real machineProfiles id.
function profileFromOutputMode(outputMode) {
  return LEGACY_OUTPUT_MODE_PROFILES.includes(outputMode) ? outputMode : 'plotter';
}

// A machineProfile already on a current config is honored only if it names a
// real profile (so a stray value can't survive migration).
function isValidProfile(id) {
  return PROFILE_IDS.includes(id);
}

// Migrate one layer: honor an existing operationId, otherwise derive it from the
// legacy `role` (absent role → Cut). Pure; safe on null. Used both by
// migrateConfig and as the per-layer funnel inside loadLayerSet so EVERY load
// boundary (local / cloud / share / examples) yields a resolvable operationId.
export function migrateLayer(layer, operations) {
  if (!layer || typeof layer !== 'object') return layer;
  // WI-1 migration defaults applied at EVERY load boundary, BEFORE the
  // operationId early-return (so saved work with a valid operationId still gets
  // them). `??` keeps it idempotent: a persisted nameIsCustom:false / locked:true
  // survives, and existing `name` values are never rewritten. A layer lacking
  // nameIsCustom is treated as `true` (never surprise-rename saved work).
  const withDefaults = {
    ...layer,
    nameIsCustom: layer.nameIsCustom ?? true,
    locked: layer.locked ?? false,
  };
  if (withDefaults.operationId && (!operations || resolveOperation(operations, withDefaults.operationId))) {
    return withDefaults;
  }
  return { ...withDefaults, operationId: operationIdForRole(withDefaults.role) };
}

// Migrate a saved-design `config` object to the current schema. Pure and
// idempotent: a config already at SCHEMA_VERSION with a valid operations list is
// passed through (only filling any layer that still lacks an operationId).
//
// Accepts null/partial input without throwing.
export function migrateConfig(config) {
  const cfg = config && typeof config === 'object' ? config : {};
  const alreadyCurrent =
    cfg.schemaVersion === SCHEMA_VERSION && Array.isArray(cfg.operations) && cfg.operations.length > 0;

  const operations = alreadyCurrent ? cfg.operations : seedOperations();
  const layers = Array.isArray(cfg.layers) ? cfg.layers : [];

  const migratedLayers = layers.map((layer) => migrateLayer(layer, operations));

  // `outputMode` is the legacy global toggle; the new-path model carries a
  // `machineProfile` instead, so drop the raw field from the migrated output.
  const { outputMode: _legacyOutputMode, ...rest } = cfg;

  const machineProfile =
    alreadyCurrent && isValidProfile(cfg.machineProfile)
      ? cfg.machineProfile
      : profileFromOutputMode(cfg.outputMode);

  return {
    ...rest,
    schemaVersion: SCHEMA_VERSION,
    operations,
    machineProfile,
    layers: migratedLayers,
  };
}

// Convenience for the localStorage layers boundary, which historically stored a
// bare layers ARRAY (not a config object). Returns the migrated config so the
// caller can read `.layers` and `.operations`.
export function migrateLayersArray(layers, outputMode) {
  return migrateConfig({ layers, outputMode });
}
