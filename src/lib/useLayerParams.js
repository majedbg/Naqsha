// useLayerParams.js — param context provided at the LayerCard boundary (AR-3B).
//
// Collapses the old 8-hop callback tower (Studio -> LeftPanel -> LayersSection ->
// LayerCard -> PatternParams -> ParamGroup -> ParamRow -> ParamControl). The
// per-param state + the six derived handlers (toggle/randomize/reset, single +
// group) used to be threaded as props through PatternParams -> ParamGroup ->
// ParamRow. They now live on a context provided once at LayerCard; consumers read
// them directly. Param path is now: LayerCard provides -> ParamControl consumes
// (PatternParams/ParamGroup/ParamRow read context too, but no longer relay the
// closures). `def` stays a prop (per-row identity); `key={def.key}` on ParamRow
// still prevents remounts.
//
// The handlers are recreated every render (closing over fresh
// `params`/`keys`/`defaults`) and the context value is an unmemoized object —
// matching the original inline closures' freshness. Memoizing without
// params/keys/defaults in the deps would let the leaf write stale merges.

import { createContext, createElement, useContext } from "react";
import {
  DEFAULT_PARAMS,
  PATTERN_PARAM_DEFS,
} from "../constants";
import {
  getDynamicParamDefs,
  getDynamicDefaults,
} from "./patternRegistry";
import { randomPatchForDef, defaultPatchForDef } from "./params/paramOps";

const LayerParamsContext = createContext(null);

/**
 * Build the param context value from a LayerCard's live params + the two write
 * callbacks (onChange = params patch, onRandomizeKeysChange = randomize-keys
 * patch). Returns null when the pattern type has no defs (mirrors the old
 * PatternParams early return; callers should render nothing).
 */
export function buildLayerParamsValue({
  patternType,
  params,
  onChange,
  randomizeKeys,
  onRandomizeKeysChange,
  // Active document unit ('mm' | 'in' | 'px'), provided ONLY by the shell
  // Inspector (#13). When present, length-tagged params (def.unit === 'length')
  // display/convert in this unit; values stay px in layer state. The legacy
  // LayerCard omits it (undefined) so legacy keeps showing raw px.
  unit,
}) {
  const defs =
    PATTERN_PARAM_DEFS[patternType] || getDynamicParamDefs(patternType);
  if (!defs) return null;

  const defaults =
    DEFAULT_PARAMS[patternType] || getDynamicDefaults(patternType) || {};
  const keys = randomizeKeys || [];

  const toggleKey = (key) => {
    const next = keys.includes(key)
      ? keys.filter((k) => k !== key)
      : [...keys, key];
    onRandomizeKeysChange(next);
  };

  const toggleGroupKeys = (groupKeys, allChecked) => {
    if (allChecked) {
      onRandomizeKeysChange(keys.filter((k) => !groupKeys.includes(k)));
    } else {
      const toAdd = groupKeys.filter((k) => !keys.includes(k));
      onRandomizeKeysChange([...keys, ...toAdd]);
    }
  };

  const randomizeSingle = (def) => {
    onChange({ ...params, ...randomPatchForDef(def) });
  };

  const randomizeGroup = (groupDefs) => {
    const newParams = { ...params };
    for (const def of groupDefs) {
      // The randomize checkbox is keyed on the row's (synthetic) key; a checked
      // composite row patches all of its real keys.
      if (keys.includes(def.key)) {
        Object.assign(newParams, randomPatchForDef(def));
      }
    }
    onChange(newParams);
  };

  const resetSingle = (def) => {
    onChange({ ...params, ...defaultPatchForDef(def, defaults) });
  };

  const resetGroup = (groupDefs) => {
    const newParams = { ...params };
    for (const def of groupDefs) {
      Object.assign(newParams, defaultPatchForDef(def, defaults));
    }
    onChange(newParams);
  };

  return {
    patternType,
    defs,
    params,
    defaults,
    unit,
    randomizeKeys,
    onChange,
    onRandomizeKeysChange,
    toggleKey,
    toggleGroupKeys,
    randomizeSingle,
    randomizeGroup,
    resetSingle,
    resetGroup,
  };
}

export function LayerParamsProvider({ value, children }) {
  // No JSX here so this module can stay a `.js` file (the oxc transform only
  // enables JSX for `.jsx`). createElement is equivalent to <Provider>.
  return createElement(LayerParamsContext.Provider, { value }, children);
}

/**
 * Consume the param context. Throws if used outside a provider so a missing
 * boundary surfaces loudly instead of silently no-op'ing param writes.
 */
export function useLayerParams() {
  const ctx = useContext(LayerParamsContext);
  if (!ctx) {
    throw new Error("useLayerParams must be used within a LayerParamsProvider");
  }
  return ctx;
}

export default useLayerParams;
