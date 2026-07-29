// Versioned migration shim (issue #1, A3).
//
// Serialized documents previously carried NO schema version: layers held a raw
// `role` string and the document an `outputMode`. We now stamp a schemaVersion
// and migrate forward losslessly at EVERY load boundary (local / cloud / share
// / bundled examples):
//
//   legacy layer.role  → operationId (referencing a seeded operation)
//   legacy outputMode  → machineProfile
//   v ≤ 1 motif layer  → sizing.footprint: 'root' (PRD #197, decision 3)
//
// Policy (locked): rewrite bundled examples; migrate cloud forward losslessly;
// migrate share links at hydrate where cheap; a version-LESS document is treated
// as legacy and migrated. NEVER reset-to-default — that silently changes
// fabrication intent.

import { seedOperations, resolveOperation, operationIdForRole } from './operations.js';
import { PROFILE_IDS } from './machineProfiles.js';
import { isMotifLayer } from './motif/motifLayer.js';

//   v2  motif sizing gains `footprint` — layers arriving at v ≤ 1 are PINNED
//       to the root-centred reserve they were authored against (PRD #197,
//       decision 3). See pinFootprint below.
export const SCHEMA_VERSION = 2;

// A layer arriving BELOW this version predates the per-glyph footprint.
const FOOTPRINT_PIN_BELOW = 2;

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

// v2 (PRD #197, decision 3): pin a pre-footprint motif layer to the root-centred
// reserve. Before v2 a glyph's collision circle was ALWAYS centred on its `root`;
// v2 introduces a tighter, art-centred alternative that lives in the glyph
// library — i.e. in CODE, not in document state — so there is no absent-implies-
// unchanged fallback available. Without this pin, opening a saved design would
// silently resize every glyph in it, and `:12-14` forbids exactly that: on a
// machine that cuts material, a re-packed motif layer IS a change of fabrication
// intent.
//
// An ABSENT version counts as legacy, per `:12-13` — so the bare
// `migrateLayer(l)` call sites in useLayers.js pin too. That is the conservative
// read, the one that never resizes saved work.
//
// Three no-op guarantees, in the order they are checked:
//   • not below the pin version              → untouched (a v2 doc is not re-stamped)
//   • not a motif layer                      → untouched
//   • no EXISTING `params.binding.placement.sizing` object → untouched; the path
//     is never created where it did not exist
// Plus `??`-style preservation, the same shape migrateLayer already uses for
// nameIsCustom/locked: an existing `footprint` is never overwritten, and a
// second pass returns the input by reference.
//
// `sizing` lives at `layer.params.binding.placement.sizing` — the fixed placement
// tail (starterChips.js, and motifLayer.js's normalizeBinding for chain-form and
// legacy bindings alike) — so only that spine is rebuilt. Every sibling (`chain`,
// `overrides`, `orientation`, `flip`, `glyphRef`) keeps its reference.
function pinFootprint(layer, schemaVersion) {
  if (typeof schemaVersion === 'number' && schemaVersion >= FOOTPRINT_PIN_BELOW) return layer;
  if (!isMotifLayer(layer)) return layer;
  const placement = layer.params?.binding?.placement;
  const sizing = placement?.sizing;
  if (!sizing || typeof sizing !== 'object' || Array.isArray(sizing)) return layer;
  if (sizing.footprint != null) return layer;
  return {
    ...layer,
    params: {
      ...layer.params,
      binding: {
        ...layer.params.binding,
        placement: { ...placement, sizing: { ...sizing, footprint: 'root' } },
      },
    },
  };
}

// Migrate one layer: honor an existing operationId, otherwise derive it from the
// legacy `role` (absent role → Cut), and pin a pre-v2 motif layer's footprint.
// Pure; safe on null. Used both by migrateConfig and as the per-layer funnel
// inside loadLayerSet so EVERY load boundary (local / cloud / share / examples)
// yields a resolvable operationId. `schemaVersion` is the DOCUMENT's version;
// migrateConfig threads `cfg.schemaVersion` through, and the load boundaries that
// hold a bare layers array (no config in scope) pass nothing — absent is legacy.
export function migrateLayer(layer, operations, schemaVersion) {
  if (!layer || typeof layer !== 'object') return layer;
  // Pinned BEFORE the defaults spread and BEFORE the operationId early-return,
  // so saved work carrying a valid operationId is pinned too.
  const pinned = pinFootprint(layer, schemaVersion);
  // WI-1 migration defaults applied at EVERY load boundary, BEFORE the
  // operationId early-return (so saved work with a valid operationId still gets
  // them). `??` keeps it idempotent: a persisted nameIsCustom:false / locked:true
  // survives, and existing `name` values are never rewritten. A layer lacking
  // nameIsCustom is treated as `true` (never surprise-rename saved work).
  const withDefaults = {
    ...pinned,
    nameIsCustom: pinned.nameIsCustom ?? true,
    locked: pinned.locked ?? false,
  };
  if (withDefaults.operationId && (!operations || resolveOperation(operations, withDefaults.operationId))) {
    return withDefaults;
  }
  return { ...withDefaults, operationId: operationIdForRole(withDefaults.role) };
}

// Migrate a saved-design `config` object to the current schema. Pure and
// idempotent: a versioned config with a valid operations list keeps its
// operations and machineProfile (only filling any layer that still lacks an
// operationId), and is stamped forward to SCHEMA_VERSION.
//
// Accepts null/partial input without throwing.
export function migrateConfig(config) {
  const cfg = config && typeof config === 'object' ? config : {};
  // "Carries the new-path model", NOT "is at the current version". These are the
  // same test only while SCHEMA_VERSION is 1. `operations` and `machineProfile`
  // arrived together at v1 and have not changed shape since, so a v1 document's
  // saved values are honored across the v2 bump — otherwise raising the version
  // would re-seed its operations and recompute its profile from the legacy
  // `outputMode`, and NO legacy outputMode maps to 'dragCutter', so a drag-cutter
  // document would come back a plotter. That is the reset-to-default `:12-14`
  // forbids. A version-LESS document still fails this test and is migrated, per
  // `:12-13`. Any FUTURE version that reshapes operations/machineProfile must
  // narrow this predicate, not widen it.
  const carriesNewModel =
    typeof cfg.schemaVersion === 'number' &&
    cfg.schemaVersion >= 1 &&
    Array.isArray(cfg.operations) &&
    cfg.operations.length > 0;

  const operations = carriesNewModel ? cfg.operations : seedOperations();
  const layers = Array.isArray(cfg.layers) ? cfg.layers : [];

  const migratedLayers = layers.map((layer) => migrateLayer(layer, operations, cfg.schemaVersion));

  // `outputMode` is the legacy global toggle; the new-path model carries a
  // `machineProfile` instead, so drop the raw field from the migrated output.
  const { outputMode: _legacyOutputMode, ...rest } = cfg;

  const machineProfile =
    carriesNewModel && isValidProfile(cfg.machineProfile)
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
