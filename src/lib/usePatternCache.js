// usePatternCache.js — pattern-switch cache machine extracted from LayerCard (AR-3B).
//
// Previously inlined in LayerCard (~lines 45–93). Behavior is preserved EXACTLY:
// on a pattern switch we save the CURRENT pattern's params/randomizeKeys into the
// per-layer, per-pattern-type cache (`layer.paramsCache`), then either restore a
// previously-visited type's cached params or seed fresh defaults. The now-active
// type is removed from the cache (it lives in the live params/randomizeKeys).
//
// IMPORTANT — divergent gate loop preserved verbatim. The fresh-defaults branch
// below increments `nonUniversalIdx` only AFTER skipping RANDOMIZE_EXCLUDED_KEYS,
// so excluded keys do NOT consume a guest param index. This deliberately differs
// from PatternParams' loop (which increments for every non-universal def). AR-1A
// chose NOT to unify these; unifying would shift which params are gated for
// guests (e.g. patternScale on flowfield, dash/arcStrokeWeight on duality). Do
// not "tidy" this during any future move.
//
// The hook holds NO state of its own. The cache lives in `layer.paramsCache`,
// persisted through `onUpdate` -> useLayers and deep-cloned by `duplicateLayer`.
// Introducing local state here would desync from the persisted/duplicated cache.

import {
  DEFAULT_PARAMS,
  PATTERN_PARAM_DEFS,
  RANDOMIZE_EXCLUDED_KEYS,
} from "../constants";
import {
  getDynamicDefaults,
  getDynamicParamDefs,
} from "./patternRegistry";
import { useGate } from "./useGate";
import { UNIVERSAL_PARAM_KEYS } from "./tierLimits";

/**
 * @param {object}   layer     The layer whose pattern is switching.
 * @param {function} onUpdate  Patch applier (LayerCard's onUpdate prop).
 * @returns {{ handlePatternChange: (newPatternType: string) => void }}
 */
export default function usePatternCache(layer, onUpdate) {
  const { check } = useGate();

  // Recreated each render (closes over fresh `layer`/`check`); no memoization,
  // matching the original inline closure's freshness semantics.
  const handlePatternChange = (newPatternType) => {
    // Save current pattern state to cache
    const updatedCache = {
      ...(layer.paramsCache || {}),
      [layer.patternType]: {
        params: { ...layer.params },
        randomizeKeys: [...(layer.randomizeKeys || [])],
      },
    };

    // Restore from cache if previously visited, otherwise use defaults
    const cached = updatedCache[newPatternType];
    let newParams, newRandomizeKeys;

    if (cached) {
      newParams = { ...cached.params };
      newRandomizeKeys = [...cached.randomizeKeys];
    } else {
      const defaults =
        DEFAULT_PARAMS[newPatternType] ||
        getDynamicDefaults(newPatternType) ||
        {};
      newParams = { ...defaults };
      const defs =
        PATTERN_PARAM_DEFS[newPatternType] ||
        getDynamicParamDefs(newPatternType) ||
        [];
      let nonUniversalIdx = 0;
      newRandomizeKeys = defs
        .filter((d) => {
          if (RANDOMIZE_EXCLUDED_KEYS.includes(d.key)) return false;
          const isUniversal = UNIVERSAL_PARAM_KEYS.includes(d.key);
          const idx = isUniversal ? -1 : nonUniversalIdx++;
          return check("param", {
            paramKey: d.key,
            paramIndex: idx,
            isUniversal,
            patternType: newPatternType,
          }).allowed;
        })
        .map((d) => d.key);
    }

    // Remove the now-active pattern from cache (it lives in params/randomizeKeys)
    const { [newPatternType]: _, ...cleanedCache } = updatedCache;

    onUpdate({
      patternType: newPatternType,
      params: newParams,
      randomizeKeys: newRandomizeKeys,
      paramsCache: cleanedCache,
    });
  };

  return { handlePatternChange };
}
