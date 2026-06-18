// Inspector — selection-driven parameter editor for the pro shell's right column
// (Lane B / B3, GitHub issue #6).
//
// This is the strangler slice that RELOCATES the existing parameter editor into
// the shell's Inspector region and makes it context-sensitive on the current
// single selection. It does NOT rebuild any controls: it composes the exact same
// primitives LayerCard composes for its param body —
//   • PatternTabs              → the pattern-type swap control (pinned at top)
//   • LayerParamsProvider +    → the collapsible, grouped param controls
//     PatternParams              (PARAM_GROUPS / ParamGroup / ParamRow / Slider …)
//   • usePatternCache          → the param-caching pattern-switch machine
// so sliders keep numeric entry + live canvas preview through the unchanged
// edit → onUpdateLayer → setLayers → re-render path.
//
// LayerCard itself is deliberately NOT reused: its header carries move / delete /
// duplicate / rename / seed chrome that belongs to the object-tree column (#5),
// not the inspector. We compose only the param-editing half here.
//
// Selection is driven entirely by props. `selectedLayerId` names the single
// selected layer; when it resolves to a layer we show its controls, otherwise we
// show a neutral document/empty state. Multi-select is out of scope (#6).

import PatternTabs from "../PatternTabs";
import PatternParams from "../PatternParams";
import usePatternCache from "../../lib/usePatternCache";
import {
  buildLayerParamsValue,
  LayerParamsProvider,
} from "../../lib/useLayerParams";

// The param-editing body for one selected layer. Split into its own component so
// usePatternCache (a hook) is only called when a layer is actually selected —
// hooks can't be called conditionally inside Inspector itself.
function SelectedLayerInspector({ layer, unit, onUpdateLayer, onChangeLayerPattern }) {
  // Pattern swap: route through the same cache machine LayerCard uses, applied via
  // the pair-aware onChangeLayerPattern when present (falls back to a plain param
  // update so the component works standalone / in tests without a router).
  const applyPatternPatch = onChangeLayerPattern
    ? (patch) => onChangeLayerPattern(layer.id, patch)
    : (patch) => onUpdateLayer(layer.id, patch);
  const { handlePatternChange } = usePatternCache(layer, applyPatternPatch);

  // Param context value — identical wiring to LayerCard's boundary, bound to the
  // selected layer's id so edits patch the right layer.
  const layerParamsValue = buildLayerParamsValue({
    patternType: layer.patternType,
    params: layer.params,
    // Active document unit so length-tagged params (#13) display/convert in it.
    unit,
    onChange: (params) => onUpdateLayer(layer.id, { params }),
    randomizeKeys: layer.randomizeKeys,
    onRandomizeKeysChange: (keys) =>
      onUpdateLayer(layer.id, { randomizeKeys: keys }),
  });

  return (
    <div className="flex flex-col gap-3 p-3" data-testid="inspector-params">
      {/* Pattern type + swap control, pinned at the top. */}
      <div className="space-y-1.5">
        <h3 className="text-xs font-semibold text-ink-soft uppercase tracking-wider">
          Pattern
        </h3>
        <PatternTabs active={layer.patternType} onChange={handlePatternChange} />
      </div>

      {/* Collapsible, grouped param controls (Structure / Scale / Variation /
          Stroke / Transform — the existing PARAM_GROUPS). */}
      {layerParamsValue && (
        <LayerParamsProvider value={layerParamsValue}>
          <PatternParams />
        </LayerParamsProvider>
      )}
    </div>
  );
}

export default function Inspector({
  layers = [],
  selectedLayerId,
  // Active document unit ('mm' | 'in' | 'px') from Studio. Threaded into the
  // param context so length-tagged params display/convert in it (#13). Undefined
  // = raw px display (back-compat with callers that don't pass it).
  unit,
  onUpdateLayer,
  onChangeLayerPattern,
}) {
  const layer =
    selectedLayerId != null
      ? layers.find((l) => l.id === selectedLayerId) || null
      : null;

  if (!layer) {
    // Neutral document / empty state — single-select drives the inspector, so
    // with nothing selected there is no per-object editor to show.
    return (
      <div
        data-testid="inspector-empty"
        className="flex h-full flex-col items-center justify-center gap-1 p-4 text-center"
      >
        <p className="text-xs font-medium text-ink-soft">No selection</p>
        <p className="text-[11px] text-ink-soft/70">
          Select a layer to edit its parameters.
        </p>
      </div>
    );
  }

  return (
    <SelectedLayerInspector
      // Remount on selection change so each selected layer gets a fresh editor
      // subtree (mirrors LayerCard's per-layer keying; avoids any cross-layer
      // state bleed in the param controls).
      key={layer.id}
      layer={layer}
      unit={unit}
      onUpdateLayer={onUpdateLayer}
      onChangeLayerPattern={onChangeLayerPattern}
    />
  );
}
