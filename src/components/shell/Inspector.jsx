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
import {
  DEFAULT_BAND_COUNT,
  hasVariableWeight,
  supportsVariableWeight,
} from "../../lib/variableWeight";

// Variable line-weight UI (issue #17, C8). A per-layer "advanced" toggle + bucket
// count (N) control, shown ONLY for weight-varying patterns on a profile that
// supports banding (laser/plotter — drag-cutter has no line weight, so the whole
// block is hidden). OFF by default; enabling surfaces the manual-setup warning
// and (via onVariableWeightChange) generates the N-row operation band (#10).
//
// State lives on `layer.variableWeight = { enabled, n }` (owned by Studio via
// updateLayer / the band sync), NOT in local component state — the Inspector
// remounts per selection, so deriving from props keeps it correct across layers.
function VariableWeightControls({ layer, profileId, onVariableWeightChange }) {
  // Capability gate: the PATTERN must emit weight variation AND the active
  // machine profile must support banding. Drag-cutter fails the second check.
  if (!hasVariableWeight(layer.patternType) || !supportsVariableWeight(profileId)) {
    return null;
  }
  const vw = layer.variableWeight || {};
  const enabled = vw.enabled === true;
  const n = vw.n ?? DEFAULT_BAND_COUNT;
  const emit = (next) => onVariableWeightChange?.(layer.id, next);

  return (
    <div className="space-y-1.5 border-t border-hairline pt-3">
      <h3 className="text-xs font-semibold text-ink-soft uppercase tracking-wider">
        Variable line weight
      </h3>
      <label className="flex items-center gap-2 text-xs text-ink">
        <input
          type="checkbox"
          data-testid="variable-weight-toggle"
          checked={enabled}
          onChange={(e) =>
            emit({ enabled: e.target.checked, n })
          }
        />
        <span>Vary line weight by band</span>
      </label>

      {enabled && (
        <>
          <label className="flex items-center gap-2 text-[11px] text-ink-soft">
            <span className="whitespace-nowrap">Bands (N)</span>
            <input
              type="number"
              data-testid="variable-weight-n"
              aria-label="Bands (N)"
              min={1}
              max={12}
              step={1}
              value={n}
              onChange={(e) => {
                const raw = Number(e.target.value);
                const next = Number.isFinite(raw) && raw >= 1 ? Math.round(raw) : 1;
                emit({ enabled: true, n: next });
              }}
              className="w-14 rounded-xs border border-hairline bg-paper-warm px-1 py-0.5 text-[11px] text-ink outline-none focus:border-violet num"
            />
          </label>
          <p
            data-testid="variable-weight-warning"
            className="rounded-xs border border-amber-400/50 bg-amber-50 px-2 py-1 text-[11px] text-amber-800"
          >
            Advanced — manual machine setup required. Each band is a separate
            operation; step through them by hand while cutting (laser: read
            &quot;orange = speed&quot;; plotter: swap to the band&apos;s pen slot).
          </p>
        </>
      )}
    </div>
  );
}

// The param-editing body for one selected layer. Split into its own component so
// usePatternCache (a hook) is only called when a layer is actually selected —
// hooks can't be called conditionally inside Inspector itself.
function SelectedLayerInspector({ layer, unit, profileId, onUpdateLayer, onChangeLayerPattern, onVariableWeightChange }) {
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

      {/* Variable line-weight UI (#17, C8) — capability-gated, OFF by default. */}
      <VariableWeightControls
        layer={layer}
        profileId={profileId}
        onVariableWeightChange={onVariableWeightChange}
      />
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
  // Active machine profile id (#17, C8) — capability-gates the variable-weight
  // UI (drag-cutter hides it). Optional; undefined hides the feature.
  profileId,
  onUpdateLayer,
  onChangeLayerPattern,
  // Per-layer variable-weight change handler (#17, C8). Optional no-op default so
  // the Inspector renders standalone / in tests without a Studio router.
  onVariableWeightChange,
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
      profileId={profileId}
      onUpdateLayer={onUpdateLayer}
      onChangeLayerPattern={onChangeLayerPattern}
      onVariableWeightChange={onVariableWeightChange}
    />
  );
}
